import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('Enter submits once, Shift+Enter and IME keep editing, pending disables submission',()=>{
 const elements=[];const doc={createElement(tag){const e={tag,value:'',listeners:{},hidden:false,setAttribute(){},append(...a){this._kids=(this._kids||[]).concat(a);},replaceChildren(...a){this._kids=a;},addEventListener(k,fn){this.listeners[k]=fn;},requestSubmit(){this.listeners.submit({preventDefault(){}});},focus(){}};elements.push(e);return e;}};
 const scope=vm.createContext({});vm.runInContext(readFileSync(new URL('./council-composer.js',import.meta.url),'utf8'),scope);
 const sent=[],edited=[];const ui=scope.CouncilComposer.mount({container:{ownerDocument:doc,append(){}},onInput:t=>edited.push(t),onSend:(t,m)=>sent.push({t,m})});
 const field=elements.find(e=>e.tag==='textarea');ui.update({persona:'Steve Jobs',value:'dos líneas\nfinal'});
 let prevented=0;const key=extra=>({key:'Enter',preventDefault(){prevented++;},...extra});
 field.listeners.keydown(key({shiftKey:true}));field.listeners.keydown(key({isComposing:true}));assert.equal(sent.length,0);assert.equal(prevented,0);
 field.listeners.keydown(key({}));assert.equal(sent[0].t,'dos líneas\nfinal');assert.equal(prevented,1);
 ui.update({persona:'Steve Jobs',value:'nuevo',pending:true});field.listeners.keydown(key({}));assert.equal(sent.length,1);
 field.value='siguiente';field.listeners.input();assert.deepEqual(edited,['siguiente']);
});
test('paste image/* calls onPasteImage and keeps a preview',async()=>{
 const elements=[];const doc={createElement(tag){const e={tag,value:'',listeners:{},hidden:false,className:'',setAttribute(){},append(...a){this._kids=(this._kids||[]).concat(a);},replaceChildren(...a){this._kids=[...a];},addEventListener(k,fn){this.listeners[k]=(this.listeners[k]?[this.listeners[k],fn].flat():fn);},requestSubmit(){},focus(){},querySelector(){return null;}};elements.push(e);return e;}};
 const scope=vm.createContext({Promise});vm.runInContext(readFileSync(new URL('./council-composer.js',import.meta.url),'utf8'),scope);
 const pasted=[];
 const ui=scope.CouncilComposer.mount({
   container:{ownerDocument:doc,append(){}},
   onInput(){},
   onSend(){},
   onPasteImage(file){pasted.push(file);return Promise.resolve({url:'data:image/png;base64,aa',name:'x.png',type:'image/png'});}
 });
 const field=elements.find(e=>e.tag==='textarea');
 const file={name:'shot.png',type:'image/png'};
 let prevented=false;
 const pasteFn=[].concat(field.listeners.paste);
 await Promise.all(pasteFn.map(fn=>fn({
   clipboardData:{items:[{type:'image/png',getAsFile:()=>file}]},
   preventDefault(){prevented=true;}
 })));
 assert.equal(prevented,true);
 assert.equal(pasted[0],file);
 // allow microtask for then()
 await new Promise(r=>setTimeout(r,0));
 assert.equal(ui.getImage().name,'x.png');
});
