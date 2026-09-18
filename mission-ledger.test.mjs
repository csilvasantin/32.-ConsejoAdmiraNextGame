import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
await import('./mission-ledger.js');
const {fetchAll,dayKey,validDay,shiftDay}=globalThis.MissionLedger;
const reply=(rows,universe)=>({ok:true,json:async()=>({tickets:rows,universe})});

test('carga más de mil misiones, todos los estados y la última FLT, sin filtro de proyecto',async()=>{
 const all=Array.from({length:2037},(_,i)=>({id:'FLT-'+(i+1),status:['open','in_progress','resolved','cancelled'][i%4]}));
 const paths=[];
 const result=await fetchAll(async path=>{
   paths.push(path);const q=new URL('https://test'+path).searchParams;const offset=+q.get('offset');
   assert.equal(q.get('state'),null);assert.equal(q.get('project_id'),null);assert.equal(q.get('day'),'2026-09-18');
   return reply(all.slice(offset,offset+1000),{total:all.length,has_more:offset+1000<all.length,day:'2026-09-18'});
 },{day:'2026-09-18'});
 assert.equal(paths.length,3);assert.deepEqual(result.rows,all);assert.equal(result.universe.has_more,false);
});
test('respeta el tamaño real si el servidor devuelve páginas menores',async()=>{
 const rows=Array.from({length:7},(_,i)=>({id:String(i)}));const offsets=[];
 const result=await fetchAll(async path=>{const offset=+new URL('https://t'+path).searchParams.get('offset');offsets.push(offset);return reply(rows.slice(offset,offset+3),{total:7,has_more:offset+3<7});});
 assert.deepEqual(offsets,[0,3,6]);assert.equal(result.rows.length,7);
});
test('no publica un resultado parcial si se repiten filas o el servidor interrumpe páginas',async()=>{
 await assert.rejects(fetchAll(async()=>reply([{id:'FLT-1'}],{total:3,has_more:true})),/incompleto/);
 await assert.rejects(fetchAll(async()=>reply([],{total:3,has_more:false})),/incompleto/);
});
test('recupera un cambio durante la paginación repitiendo el universo completo',async()=>{
 let calls=0;const result=await fetchAll(async()=>{
 calls++;if(calls===1)return reply([{id:'A'}],{total:2,has_more:true});
 if(calls===2)return reply([{id:'A'}],{total:2,has_more:false});
 return reply([{id:'A'},{id:'B'}],{total:2,has_more:false});});
 assert.equal(calls,3);assert.equal(result.rows.length,2);
});
test('errores de red y respuestas inválidas no se presentan como cero misiones',async()=>{
 await assert.rejects(fetchAll(async()=>({ok:false,status:401})),/401/);
 await assert.rejects(fetchAll(async()=>({ok:true,json:async()=>({error:'failure'})})),/no válida/);
 await assert.rejects(fetchAll(()=>{throw Error('no debería pedir datos');},{isCurrent:()=>false}),/sustituida/);
 const result=await fetchAll(async()=>reply([],{total:0,has_more:false}));assert.equal(result.rows.length,0);
});
test('día de Madrid, segundos/milisegundos, cambio de año, bisiestos y horario de verano',()=>{
 assert.equal(dayKey(Date.parse('2026-09-17T22:00:00Z')),'2026-09-18');
 assert.equal(dayKey(Date.parse('2026-09-17T21:59:59Z')/1000),'2026-09-17');
 assert.equal(shiftDay('2026-03-29',-1),'2026-03-28');assert.equal(shiftDay('2026-10-25',1),'2026-10-26');
 assert.equal(shiftDay('2026-01-01',-1),'2025-12-31');assert.equal(validDay('2024-02-29'),true);
 assert.equal(validDay('2026-02-29'),false);assert.equal(validDay('invalid'),false);
});
test('la página global conserva una fila por misión y accesos coherentes',()=>{
 const html=readFileSync(new URL('./misiones.html',import.meta.url),'utf8');
 for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1].trim())new vm.Script(m[1]);
 assert.match(html,/let FILTER="todas"/);assert.match(html,/let SORT=\{k:"fecha",dir:"asc"\}/);
 assert.match(html,/data-yk-global-projects/);assert.doesNotMatch(html,/agrupaFlota\(|groupedHtml\(|userPicked|didCascade/);
 for(const file of ['admira-bar.js','index.html'])assert.doesNotMatch(readFileSync(new URL('./'+file,import.meta.url),'utf8'),/www\.admira\.live\/vista-previa/);
 assert.match(readFileSync(new URL('./tools/migracion-yokup.txt',import.meta.url),'utf8'),/misiones con puerta \(propia\)/);
});
