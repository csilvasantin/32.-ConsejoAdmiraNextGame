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
