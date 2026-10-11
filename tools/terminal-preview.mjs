// Preview local aislada. El ejecutor es una simulación; no llama a tmux ni SSH.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {createTerminalControl}=require('../fleet-control/terminal-control.js');
const machines=[{id:'macbookpro16',host:'macbook-pro-16',name:'MacBook Pro 16'},{id:'macbookpronegro14',host:'macbookpronegro14',name:'MacBook Pro Negro 14'},{id:'macmini',host:'macmini',name:'Mac Mini'}];
const sample=(id,sesion,runtime,status,estado)=>({id,sesion,creada:1791700000,agente:'Agente de prueba',runtime,encargo:status==='in_progress'?'#TEST · in_progress · prueba aislada':'sin encargos',encargoId:status==='in_progress'?'TEST':'',encargoStatus:status,estado});
const inventory=()=>({ok:true,ahora:Date.now(),maquinas:machines.map((m,i)=>({maquina:m.host,nombre:m.name,disponible:i!==2,ultimoLatido:Date.now()-(i===2?180000:0),terminales:i===0?[sample('$501','test-terminal-5704','codex','in_progress','idle')]:i===1?[sample('$502','test-claude','claude','done','vivo')]:[],motivo:i===2?'sin datos':''}))});
const actor={admin:true,email:'preview-admin@example.test',jti:'local-preview',source:{kind:'browser'}};
const events=[];
const control=createTerminalControl({machines:()=>machines,inventory:async()=>inventory(),execute:async(machine,body)=>({ok:true,simulation:true,killed:body.action==='commit'?body.targets.map(t=>t.sesion):[],backup:'SIMULACION/copia-privada'}),audit:e=>events.push({...e,at:new Date().toISOString()})});
const html=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preview /terminal · #5704</title>
<style>*{box-sizing:border-box}body{margin:0;background:#03110a;color:#dbffdf;font:14px/1.55 monospace}main{max-width:1100px;margin:auto;padding:20px}h1{font-size:22px;color:#33ff99}.notice{padding:12px;background:#ffe16b;color:#182015;font-weight:bold}button,input{font:inherit;padding:10px;border:1px solid #33ff99;background:#082c16;color:white}form{display:flex;gap:8px;margin:20px 0}input{width:100%;min-width:0}pre{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #235d37;padding:12px}.actions{display:flex;gap:8px;flex-wrap:wrap}a{color:#33ff99}</style>
<main><p class="notice">SIMULACIÓN LOCAL · #5704 · administrador y equipos de prueba. No ejecuta cierres reales.</p><h1>⌘ EXPERTO · /terminal</h1><p>Prueba /terminal, /terminal kill MBP16, /terminal confirmar y /terminal cancelar. El equipo Mac Mini ilustra un latido sin datos.</p>
<div class="actions"><button data-command="/terminal">Listar</button><button data-command="/terminal kill MBP16">Previsualizar cierre</button><button data-command="/terminal confirmar">Confirmar</button><button data-command="/demo terminal">Demo</button><button id="audit">Registro</button></div>
<form><input aria-label="Comando Experto" value="/terminal" autocomplete="off"><button>Enviar</button></form><pre id="log" aria-live="polite"></pre></main>
<script src="/control/fleet-mesh.js"></script><script>const realMesh=window.AdmiraFleetMesh;window.AdmiraFleetMesh={create:opts=>realMesh.create({...opts,relays:[{id:'preview',label:'Preview local',base:location.origin+'/fleet/api',priority:1}]})};</script><script src="/assets/terminal-cli.js"></script>
<script>const log=document.querySelector('#log');function say(text){log.textContent+='\\n'+text+'\\n';log.scrollTop=log.scrollHeight}async function send(text){say('› '+text);if(/^\\/demo\\s+terminal$/i.test(text))AdmiraTerminal.demo(say);else await AdmiraTerminal.run(text,say)}document.querySelector('form').onsubmit=e=>{e.preventDefault();send(document.querySelector('input').value)};document.querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>send(b.dataset.command));document.querySelector('#audit').onclick=async()=>say(JSON.stringify(await (await fetch('/audit')).json(),null,2));send('/terminal');</script></html>`;
const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
const server=http.createServer(async(req,res)=>{
  const path=new URL(req.url,'http://127.0.0.1').pathname;
  try{
    if(req.method==='GET'&&path==='/'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});return res.end(html);}
    const files={'/assets/terminal-cli.js':'../assets/terminal-cli.js','/control/fleet-mesh.js':'../control/fleet-mesh.js'};
    if(req.method==='GET'&&files[path]){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(readFileSync(new URL(files[path],import.meta.url)));}
    if(path==='/fleet/api/auth/session')return json(res,200,{ok:true,email:actor.email,csrf:'preview-fixture-csrf'});
    if(req.method==='GET'&&path==='/audit')return json(res,200,events);
    if(req.method==='GET'&&path==='/fleet/api/terminal/inventory')return json(res,200,await control.list(actor));
    if(req.method==='POST'&&['/fleet/api/terminal/plan','/fleet/api/terminal/confirm'].includes(path)){
      let text='';for await(const chunk of req){text+=chunk;if(text.length>8192)return json(res,413,{ok:false,error:'body too large'});}
      const body=JSON.parse(text||'{}');return json(res,200,path.endsWith('/plan')?await control.plan(actor,body):await control.confirm(actor,body));
    }
    return json(res,404,{ok:false,error:'not found'});
  }catch(e){return json(res,e.status||500,{ok:false,error:e.message});}
});
const port=Number(process.env.TERMINAL_PREVIEW_PORT||9058);
server.listen(port,'127.0.0.1',()=>console.log('Preview de simulación /terminal: http://127.0.0.1:'+port));
