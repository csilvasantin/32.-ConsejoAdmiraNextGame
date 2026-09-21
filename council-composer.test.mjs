import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('Enter submits once, Shift+Enter and IME keep editing, pending disables submission',()=>{
 const elements=[];const doc={createElement(tag){const e={tag,value:'',listeners:{},setAttribute(){},append(){},addEventListener(k,fn){this.listeners[k]=fn;},requestSubmit(){this.listeners.submit({preventDefault(){}});},focus(){}};elements.push(e);return e;}};
 const scope=vm.createContext({});vm.runInContext(readFileSync(new URL('./council-composer.js',import.meta.url),'utf8'),scope);
 const sent=[],edited=[];const ui=scope.CouncilComposer.mount({container:{ownerDocument:doc,append(){}},onInput:t=>edited.push(t),onSend:t=>sent.push(t)});
 const field=elements.find(e=>e.tag==='textarea');ui.update({persona:'Steve Jobs',value:'dos líneas\nfinal'});
 let prevented=0;const key=extra=>({key:'Enter',preventDefault(){prevented++;},...extra});
 field.listeners.keydown(key({shiftKey:true}));field.listeners.keydown(key({isComposing:true}));assert.equal(sent.length,0);assert.equal(prevented,0);
 field.listeners.keydown(key({}));assert.deepEqual(sent,['dos líneas\nfinal']);assert.equal(prevented,1);
 ui.update({persona:'Steve Jobs',value:'nuevo',pending:true});field.listeners.keydown(key({}));assert.equal(sent.length,1);
 field.value='siguiente';field.listeners.input();assert.deepEqual(edited,['siguiente']);
});
