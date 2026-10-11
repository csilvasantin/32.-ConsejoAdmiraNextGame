import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarTerminales, inventarioTerminales } from './terminal-lib.mjs';
import { normalizarPane, fundir } from './visor-lib.mjs';
import { onRequestGet, onRequestPost } from './functions/api/visor/pane.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createTerminalControl, selectMachine } = require('./fleet-control/terminal-control.js');
await import('./assets/terminal-cli.js');
const CLI = globalThis.AdmiraTerminal;
const ts = Date.now(), row = {id:'$12',sesion:'oraculo',creada:1791700000,agente:'Oraculo',runtime:'codex',estado:'idle',encargo:'#5704',encargoId:'5704',encargoStatus:'in_progress'};
const machines = [{id:'macbookpro16',host:'macbook-pro-16',name:'MacBook Pro 16'},{id:'macmini',host:'macmini',name:'Mac Mini'}];
const actor = {admin:true,email:'admin@example.test',jti:'session-1',source:{kind:'browser'}};
function fixture(status='in_progress') {
  let data = {ok:true,maquinas:[{maquina:'macbook-pro-16',disponible:true,ultimoLatido:ts,terminales:[{...row,encargoStatus:status}]}]};
  const calls=[],events=[];
  const control=createTerminalControl({inventory:async()=>structuredClone(data),machines:()=>machines,execute:async(machine,body)=>{calls.push({machine,...body});return {ok:true,killed:body.action==='commit'?body.targets.map(t=>t.sesion):[],backup:'private-backup'};},audit:e=>events.push(e)});
  return {control,calls,events,data,setData:d=>data=d};
}
test('inventario: sesiones reales sin conf; no cuenta nosesion de la cuadratura',()=>{
  const n=normalizarPane({maquina:'macbook-pro-16',terminales:[row],terminalesTs:ts,agentes:{fantasma:{estado:'nosesion'}}},ts);
  const d=fundir(null,n.pane),v=inventarioTerminales([d],ts,['macmini']);
  assert.equal(v.maquinas[0].terminales.length,0);
  assert.equal(v.maquinas[1].terminales[0].sesion,'oraculo');
  assert.equal(v.maquinas[0].disponible,false);
});
test('publicador viejo, inventario viejo y latido viejo nunca equivalen a parada',()=>{
  for(const d of [{maquina:'a',ts},{maquina:'a',ts,terminales:[row],terminalesTs:ts-180000},{maquina:'a',ts:ts-180000,terminales:[row],terminalesTs:ts}]){
    const v=inventarioTerminales([d],ts); assert.equal(v.maquinas[0].disponible,false);
    assert.doesNotMatch(CLI.listing(v),/parada/);assert.match(CLI.listing(v),/sin datos de a desde/);
  }
});
test('normalización: id inválido y duplicados no llegan al cierre',()=>{
  assert.equal(normalizarTerminales([{...row,id:'$(rm -rf)'},row,row]).length,1);
  assert.equal(normalizarTerminales([{...row,sesion:'Oráculo'}])[0].sesion,'Oráculo');
});
test('API real: token de publicador sólo lee metadatos; nunca lee contenido de panes',async()=>{
  const data=new Map(),env={COUNCIL_MACHINE_TOKEN:'test-machine-secret',RECORTE_KV:{get:async k=>data.get(k)||null,put:async(k,v)=>data.set(k,v)}};
  const post=new Request('https://preview.example/api/visor/pane',{method:'POST',headers:{'X-Council-Token':'test-machine-secret','Content-Type':'application/json'},body:JSON.stringify({maquina:'macbook-pro-16',terminales:[row],terminalesTs:Date.now(),agentes:{oraculo:{lineas:['private pane text']}}})});
  assert.equal((await onRequestPost({request:post,env})).status,200);
  const req=new Request('https://preview.example/api/visor/pane?inventario=1',{headers:{'X-Council-Token':'test-machine-secret'}});
  const inv=await (await onRequestGet({request:req,env})).json();
  assert.equal(inv.maquinas[0].terminales[0].sesion,'oraculo');assert.doesNotMatch(JSON.stringify(inv),/private pane text|lineas/);
  assert.equal((await onRequestGet({request:new Request('https://preview.example/api/visor/pane',{headers:{'X-Council-Token':'test-machine-secret'}}),env})).status,401);
});
test('admin obligatorio para lista, plan y confirmación',async()=>{
  const f=fixture();
  for(const method of ['list','plan','confirm'])await assert.rejects(f.control[method]({...actor,admin:false},{}),{status:403});
  assert.equal(f.calls.length,0);
});
test('kill nunca en la primera petición; in_progress parado exige segunda confirmación',async()=>{
  const f=fixture(),p=await f.control.plan(actor,{machine:'MBP16'});assert.equal(f.calls.length,0);assert.equal(p.active.length,1);
  const first=await f.control.confirm(actor,{plan:p.plan,confirm:true,confirmActive:true});assert.equal(first.stage,'active');assert.equal(f.calls.length,0);
  await assert.rejects(f.control.confirm(actor,{plan:p.plan,confirm:true}),{status:409});
  const done=await f.control.confirm(actor,{plan:p.plan,confirm:true,confirmActive:true});assert.equal(done.ok,true);
  assert.deepEqual(f.calls.map(x=>x.action),['prepare','commit']);assert.ok(f.events.some(e=>e.ev==='terminal_kill'&&e.by===actor.email));
});
test('encargo desconocido también requiere segunda confirmación',async()=>{
  const f=fixture('unknown'),p=await f.control.plan(actor,{});assert.equal(p.active.length,1);assert.equal((await f.control.confirm(actor,{plan:p.plan,confirm:true})).stage,'active');assert.equal(f.calls.length,0);
});
test('origen tmux acreditado queda fuera; origen ausente bloquea',async()=>{
  const f=fixture(),a={...actor,source:{kind:'tmux',maquina:'macbook-pro-16',sesion:'oraculo'}};
  const p=await f.control.plan(a,{});assert.equal(p.targets.length,0);assert.equal(p.protectedSessions.length,1);
  await assert.rejects(f.control.plan({...actor,source:null},{}),{status:409});
});
test('nonce ligado al administrador/sesión; no se puede reusar ni duplicar concurrentemente',async()=>{
  const f=fixture('done'),p=await f.control.plan(actor,{});
  await assert.rejects(f.control.confirm({...actor,jti:'other'},{plan:p.plan,confirm:true}),{status:409});
  const results=await Promise.allSettled([f.control.confirm(actor,{plan:p.plan,confirm:true}),f.control.confirm(actor,{plan:p.plan,confirm:true})]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.calls.filter(x=>x.action==='commit').length,1);
});
test('encargo nuevo o sesión recreada invalidan la confirmación',async()=>{
  for(const change of [{encargoId:'new'},{creada:row.creada+1},{encargoStatus:'in_progress'}]){
    const f=fixture('done'),p=await f.control.plan(actor,{});Object.assign(f.data.maquinas[0].terminales[0],change);
    await assert.rejects(f.control.confirm(actor,{plan:p.plan,confirm:true}),{status:409});assert.equal(f.calls.length,0);
  }
});
test('fallo de copia impide cualquier commit en TODOS los destinos',async()=>{
  const calls=[],control=createTerminalControl({machines:()=>machines,inventory:async()=>({maquinas:machines.map(m=>({maquina:m.host,disponible:true,terminales:[{...row,encargoStatus:'done'}]}))}),execute:async(m,b)=>{calls.push(b.action);return {ok:m!=='macmini'};},audit:()=>{}});
  const p=await control.plan(actor,{});await assert.rejects(control.confirm(actor,{plan:p.plan,confirm:true}),{status:409});assert.deepEqual(calls,['prepare','prepare']);
});
test('alias cortos; alias ambiguo nunca elige un equipo arbitrario',()=>{
  assert.equal(selectMachine('MBP16',machines)[0].id,'macbookpro16');assert.equal(selectMachine('mini',machines)[0].id,'macmini');
  assert.throws(()=>selectMachine('Air',[{id:'macbookair16'},{id:'macbookairrosa'}]),/ambiguo/);
  assert.throws(()=>selectMachine('unknown',machines),/desconocido/);
});
test('DNS del tailnet enlaza con publicador real aunque difieran id y nombre',async()=>{
  const m={id:'macbookair16',host:'macbookair16plata.tail48b61c.ts.net',name:'MacBook Air 16'};
  const c=createTerminalControl({machines:()=>[m],inventory:async()=>({maquinas:[{maquina:'macbookair16plata',disponible:true,terminales:[row]}]}),execute:async()=>({ok:true}),audit:()=>{}});
  const p=await c.plan(actor,{machine:'Air'});assert.equal(p.targets.length,1);assert.equal(p.missing.length,0);
});
test('kill global avisa equipos publicados sin ruta de control y no inventa SSH',async()=>{
  const f=fixture('done');f.data.maquinas.push({maquina:'grokbotbox',disponible:true,terminales:[row]});
  const p=await f.control.plan(actor,{});assert.equal(p.targets.length,1);assert.ok(p.missing.some(m=>m.maquina==='grokbotbox'&&m.motivo==='sin ruta de control registrada'));
});
test('CLI parser estricto y --si sólo pasa primera confirmación con relay fijado',async()=>{
  assert.equal(CLI.parse('/terminal kill MBP14 --si').yes,true);assert.equal(CLI.parse('/terminal kill MBP14 extra').ok,false);
  const calls=[],log=[];
  globalThis.AdmiraFleetMesh={create:()=>({json:async(path,opts)=>{calls.push({path,opts});return {response:{ok:true},data:{ok:true,_mesh:{relay:{id:'test-relay'}},plan:'p',stage:path.endsWith('plan')?'preview':'active',targets:[row],active:[row]}};}})};
  await CLI.run('/terminal kill MBP16 --si',t=>log.push(t));assert.equal(calls.length,2);assert.equal(JSON.parse(calls[1].opts.body).confirmActive,false);assert.equal(calls[1].opts.relayId,'test-relay');assert.equal(calls[1].opts.retry,false);assert.match(log.join('\n'),/SEGUNDA CONFIRMACIÓN/);
});
test('demo segura no hace peticiones ni finge ejecución',()=>{
  const lines=[];CLI.demo(x=>lines.push(x));assert.match(lines[0],/SIMULACIÓN/);assert.match(lines.join('\n'),/Ninguna sesión real/);
});
