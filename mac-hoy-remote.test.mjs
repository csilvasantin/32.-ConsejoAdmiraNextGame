import {test} from 'node:test';
import assert from 'node:assert/strict';
import {showRemote,setVisible,modoActual} from './assets/mac-hoy.js';
test('first Examinar turns on remote mode on every screen even when the table Mac starts off', () => {
  const nodes = Array.from({length:3},()=>({classes:new Set(),clientWidth:244,style:{setProperty(){}},classList:{}}));
  for(const n of nodes)n.classList.toggle=(c,on)=>on?n.classes.add(c):n.classes.delete(c);
  const root={querySelector:s=>s==='#mac-hoy-prop'?nodes[0]:null,querySelectorAll:s=>s==='#mac-hoy-prop, .mac-hoy-front-stage'?nodes:s==='.mac-hoy-front-stage'?nodes.slice(1):[]};
  setVisible(false,root);
  try {
    assert.equal(showRemote('Steve Jobs',root),true);
    assert.equal(modoActual(),'remote');
    for(const n of nodes){assert.ok(n.classes.has('modo-remote'));assert.ok(!n.classes.has('modo-logo'));}
  } finally {setVisible(false,root);}
});


test('Examinar opens the seat once before passive JPEG refreshes; late openings cannot replace another seat',async()=>{
  const nodes=Array.from({length:3},()=>({clientWidth:244,style:{setProperty(){}},classList:{toggle(){}}}));
  const imgs=Array.from({length:3},()=>({src:''}));
  const root={querySelector:s=>s==='#mac-hoy-prop'?nodes[0]:null,querySelectorAll:s=>s==='.mac-hoy-remote'?imgs:s==='#mac-hoy-prop, .mac-hoy-front-stage'?nodes:s==='.mac-hoy-front-stage'?nodes.slice(1):[]};
  let finish;const calls=[];
  const request=(url,options)=>{calls.push({url,options});return new Promise(resolve=>{finish=resolve;});};
  setVisible(false,root);
  try{
    showRemote('Steve Jobs',root,request);
    await Promise.resolve();
    assert.equal(calls.length,1);assert.match(calls[0].url,/api\/grokbot\/selection$/);assert.equal(calls[0].options.method,'POST');assert.equal(JSON.parse(calls[0].options.body).persona,'Steve Jobs');
    assert.ok(imgs.every(i=>!i.src),'must select before first capture');
    const old=finish;
    showRemote('George Lucas',root,request);await Promise.resolve();
    old({ok:true,json:async()=>({ok:true})});
    for(let i=0;i<8;i++)await Promise.resolve();
    assert.ok(imgs.every(i=>!i.src),'late Jobs handshake must not overwrite Lucas');
    finish({ok:true,json:async()=>({ok:true})});
    for(let i=0;i<8;i++)await Promise.resolve();
    assert.ok(imgs.every(i=>/screen\.jpg\?persona=Lucas&/.test(i.src)));
  }finally{setVisible(false,root);}
});
