import {test} from 'node:test';
import assert from 'node:assert/strict';
import {showRemote,setVisible,modoActual,alternaPong,evidencePlacard,EVIDENCE_URL,EVIDENCE_POLL_MS} from './assets/mac-hoy.js';

test('evidence placard encodes idle copy', () => {
  const url = evidencePlacard('sin actividad', 'Jobs');
  assert.match(url, /^data:image\/svg\+xml/);
  assert.match(decodeURIComponent(url), /sin actividad/);
  assert.match(decodeURIComponent(url), /Jobs/);
});

test('first Examinar turns on remote mode on every screen even when the table Mac starts off', () => {
  const nodes = Array.from({length:3},()=>({classes:new Set(),clientWidth:244,style:{setProperty(){}},classList:{}}));
  for(const n of nodes)n.classList.toggle=(c,on)=>on?n.classes.add(c):n.classes.delete(c);
  const root={querySelector:s=>s==='#mac-hoy-prop'?nodes[0]:null,querySelectorAll:s=>s==='#mac-hoy-prop, .mac-hoy-front-stage'?nodes:s==='.mac-hoy-front-stage'?nodes.slice(1):[]};
  setVisible(false,root);
  try {
    assert.equal(showRemote('Steve Jobs',root,async()=>({ok:true,json:async()=>({ok:true,live:false})})),true);
    assert.equal(modoActual(),'remote');
    for(const n of nodes){assert.ok(n.classes.has('modo-remote'));assert.ok(!n.classes.has('modo-logo'));}
  } finally {setVisible(false,root);}
});

test('Examinar polls evidence every seat and shows sin actividad without a live encargo', async () => {
  const nodes=Array.from({length:3},()=>({clientWidth:244,style:{setProperty(){}},classList:{toggle(){}}}));
  const imgs=Array.from({length:3},()=>({src:'',style:{}}));
  const root={querySelector:s=>s==='#mac-hoy-prop'?nodes[0]:null,querySelectorAll:s=>s==='.mac-hoy-remote'?imgs:s==='#mac-hoy-prop, .mac-hoy-front-stage'?nodes:s==='.mac-hoy-front-stage'?nodes.slice(1):[]};
  const calls=[];
  const request=(url)=>{calls.push(url);return Promise.resolve({ok:true,json:async()=>({ok:true,live:false,persona:'Jobs',label:'sin actividad'})});};
  setVisible(false,root);
  try{
    showRemote('Steve Jobs',root,request);
    for(let i=0;i<12;i++)await Promise.resolve();
    assert.equal(calls.length,1);
    assert.match(calls[0], new RegExp(EVIDENCE_URL.replace('/','\\/') + '\\?persona=Jobs'));
    assert.ok(imgs.every(i=>String(i.src).startsWith('data:image/svg+xml')));
    assert.ok(imgs.every(i=>decodeURIComponent(i.src).includes('sin actividad')));
    assert.equal(EVIDENCE_POLL_MS, 5000);
  }finally{setVisible(false,root);}
});

test('live encargo with evidence image paints every remote surface', async () => {
  const nodes=Array.from({length:3},()=>({clientWidth:244,style:{setProperty(){}},classList:{toggle(){}}}));
  const imgs=Array.from({length:3},()=>({src:'',style:{}}));
  const root={querySelector:s=>s==='#mac-hoy-prop'?nodes[0]:null,querySelectorAll:s=>s==='.mac-hoy-remote'?imgs:s==='#mac-hoy-prop, .mac-hoy-front-stage'?nodes:s==='.mac-hoy-front-stage'?nodes.slice(1):[]};
  const shot='https://api.yokup.com/media/fleet/demo.png';
  setVisible(false,root);
  try{
    showRemote('Steve Jobs',root,async()=>({ok:true,json:async()=>({ok:true,live:true,persona:'Jobs',image:shot,capturedAt:Date.parse('2026-10-04T17:30:00Z'),label:'evidencia'})}));
    for(let i=0;i<12;i++)await Promise.resolve();
    assert.ok(imgs.every(i=>i.src.startsWith(shot)));
    assert.ok(imgs.every(i=>i.style.display==='block'));
  }finally{setVisible(false,root);}
});

test('Pong ignores a late evidence refresh and image errors',async()=>{
  const nodes=Array.from({length:3},()=>({clientWidth:244,style:{setProperty(){}},classList:{toggle(){}}}));
  const imgs=Array.from({length:3},()=>({src:'',style:{}}));
  const root={querySelector:s=>s==='#mac-hoy-prop'?nodes[0]:null,querySelectorAll:s=>s==='.mac-hoy-remote'?imgs:s==='#mac-hoy-prop, .mac-hoy-front-stage'?nodes:s==='.mac-hoy-front-stage'?nodes.slice(1):[]};
  let finish;
  const request=()=>new Promise(resolve=>{finish=resolve;});
  setVisible(false,root);
  try {
    showRemote('Steve Jobs',root,request);
    await Promise.resolve();
    const staleError=imgs[0].onerror;
    alternaPong(root);
    assert.equal(modoActual(),'pong');
    finish({ok:true,json:async()=>({ok:true,live:true,image:'https://api.yokup.com/media/fleet/x.png',capturedAt:Date.now()})});
    for(let i=0;i<8;i++)await Promise.resolve();
    if (typeof staleError === 'function') staleError();
    assert.equal(modoActual(),'pong','a late evidence response must not replace Pong');
  } finally {setVisible(false,root);}
});
