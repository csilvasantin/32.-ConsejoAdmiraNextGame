import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {region,pixels,createMonitor,controlURL} from './analysis.js';
const code=readFileSync(new URL('./tester.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'');
function harness(getUserMedia) {
 const els=new Map(), docEvents={}, winEvents={};let tick, now=1000;
 const el=id=>{if(!els.has(id))els.set(id,{value:({x:10,y:10,w:80,h:80,duration:30,machine:'macbookairrosa'})[id]??'',checked:false,disabled:false,
   textContent:'',href:'',setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];},replaceChildren(){},addEventListener(){},click(){}});return els.get(id);};
 const video=el('camera');Object.assign(video,{readyState:4,videoWidth:640,videoHeight:480,currentTime:1,paused:false,play:async()=>{},requestVideoFrameCallback(fn){video.frame=fn;return 1;},cancelVideoFrameCallback(){video.frame=null;}});
 el('crop').getContext=()=>({drawImage(){},getImageData:()=>({data:new Uint8Array([128,128,128,255])}),clearRect(){}});
 const document={hidden:false,getElementById:el,createElement:()=>({click(){}}),addEventListener:(k,fn)=>docEvents[k]=fn};
 const window={addEventListener:(k,fn)=>winEvents[k]=fn};
 vm.runInNewContext(code,{region,pixels,createMonitor,controlURL,document,window,location:{search:'',reload(){}},isSecureContext:true,
   navigator:{mediaDevices:{getUserMedia,enumerateDevices:async()=>[]}},URL,URLSearchParams,Blob,Option:class{},performance:{now:()=>now},
   setInterval:fn=>{tick=fn;return 1;},clearInterval(){},setTimeout,console});
 return {el,video,document,docEvents,winEvents,tick:()=>{now+=1000;tick();}};
}
function media(){const track={stopped:false,stop(){this.stopped=true;},getSettings:()=>({deviceId:'one'}),addEventListener(){}};return {track,getTracks:()=>[track],getVideoTracks:()=>[track]};}
test('opening the page never opens a camera',()=>{let calls=0;harness(()=>{calls++;});assert.equal(calls,0);});
test('permission denied returns to camera-off state',async()=>{
 const h=harness(async()=>{throw Object.assign(new Error(),{name:'NotAllowedError'});});await h.el('start').onclick();
 assert.equal(h.el('state').textContent,'Cámara apagada');assert.match(h.el('notice').textContent,/denegado/);assert.equal(h.el('monitor').disabled,true);
});
test('stop cancels a permission request and releases a late stream',async()=>{
 let resolve;const m=media(),h=harness(()=>new Promise(r=>resolve=r));const pending=h.el('start').onclick();
 h.el('stop').onclick();resolve(m);await pending;assert.equal(m.track.stopped,true);assert.equal(h.video.srcObject,null);
});
test('explicit confirmation, ROI apply and visibility gates',async()=>{
 const h=harness(async()=>media());await h.el('start').onclick();h.video.frame();
 h.el('monitor').onclick();assert.match(h.el('notice').textContent,/confirmar/);
 h.el('x').value='20';h.el('x').oninput();h.el('ready').checked=true;h.el('monitor').onclick();assert.match(h.el('notice').textContent,/Aplica/);
 h.el('w').value='70';h.el('apply').onclick();h.el('ready').checked=true;h.el('monitor').onclick();assert.equal(h.el('pause').disabled,false);
 h.document.hidden=true;h.docEvents.visibilitychange();assert.equal(h.el('pause').disabled,true);assert.match(h.el('notice').textContent,/Pestaña oculta/);
});
test('page exit stops the stream; changing player clears confirmation',async()=>{
 const m=media(),h=harness(async()=>m);await h.el('start').onclick();h.el('ready').checked=true;
 h.el('machine').value='macbookairazul';h.el('machine').oninput();assert.equal(h.el('ready').checked,false);
 h.winEvents.pagehide();assert.equal(m.track.stopped,true);assert.equal(h.video.srcObject,null);
});
