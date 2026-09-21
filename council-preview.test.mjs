import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('choosing a conversation cannot restore the old desktop persona through a logo event',()=>{
 const events={},elements=[];
 const button=view=>({dataset:{view},setAttribute(){}});
 const buttons=['conversation','desktop','pong'].map(button);
 const doc={addEventListener(k,fn){events[k]=fn;},createElement(tag){
  const e={tag,hidden:false,textContent:'',listeners:{},dataset:{},classList:{add(){},toggle(){}},setAttribute(){},append(){},prepend(){},addEventListener(k,fn){this.listeners[k]=fn;},querySelectorAll(){return buttons;},querySelector(){return {focus(){},setAttribute(){}};}};
  elements.push(e);return e;
 }};
 const opened=[];
 const context=vm.createContext({MacHoy:{closeFront(){},setModo(mode){events['mac-screen-mode']({detail:{mode,persona:'Jobs'}});},showRemote(name){opened.push(name);}}});
 vm.runInContext(readFileSync(new URL('./council-preview.js',import.meta.url),'utf8'),context);
 const art={};const element={ownerDocument:doc,dataset:{},classList:{add(){},toggle(){}},querySelector(){return art;},prepend(){},append(){}};
 const ui=context.CouncilPreview.mount(element);
 events['mac-screen-mode']({detail:{mode:'remote',persona:'Jobs'}});
 ui.select('Walt Disney');
 const controls=elements.find(e=>e.className==='council-preview__controls');
 controls.listeners.click({target:{closest(){return buttons[1];}}});
 assert.deepEqual(opened,['Walt Disney']);
 assert.equal(ui.view,'desktop');
});
