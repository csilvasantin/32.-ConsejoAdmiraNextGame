'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createRemoteDesktop,validateInput}=require('./grokbot-remote');
const owner={email:'test@example.test',jti:'session-one'};
const target={persona:'Steve Jobs',pid:12,windowID:30,x:-1800,y:0,width:1200,height:900};
const frame={ok:true,target,frame:{jpeg:'/9j/'+Buffer.alloc(20).toString('base64'),width:2400,height:1800}};
test('remote session binds account, login session, target and the observed frame',async()=>{
 let calls=[];const bridge=createRemoteDesktop({runNative:async req=>{calls.push(req);return ['remote_frame','remote_open'].includes(req.action)?frame:{ok:true};}});
 const opened=await bridge.handle(owner,{action:'open',persona:'Jobs'});
 assert.equal(calls[0].action,'remote_open');
 await assert.rejects(bridge.handle({...owner,jti:'other'},{action:'frame',token:opened.token}),{code:'remote_session_expired'});
 await bridge.handle(owner,{action:'input',token:opened.token,frameId:opened.frame.id,event:{type:'click',x:.5,y:.5,button:'left',clicks:1}});
 assert.deepEqual(calls.at(-1).remoteTarget,target);assert.equal(calls.at(-1).persona,'Steve Jobs');
 await bridge.handle(owner,{action:'close',token:opened.token});
 await assert.rejects(bridge.handle(owner,{action:'frame',token:opened.token}),{code:'remote_session_expired'});
});
test('old frames and a different selected adviser never authorize input',async()=>{
 let time=0,requests=0;const bridge=createRemoteDesktop({now:()=>time,runNative:async()=>{requests++;return frame;}});
 const opened=await bridge.handle(owner,{action:'open',persona:'Jobs'});time=30001;
 await assert.rejects(bridge.handle(owner,{action:'input',token:opened.token,frameId:opened.frame.id,event:{type:'key',key:'Enter'}}),{code:'remote_frame_expired'});assert.equal(requests,1);
 const wrong=createRemoteDesktop({runNative:async()=>({...frame,target:{...target,persona:'Walt Disney'}})});
 await assert.rejects(wrong.handle(owner,{action:'open',persona:'Jobs'}),{code:'remote_invalid_frame'});
});
test('remote native refusals are surfaced with no automatic retry',async()=>{
 let n=0;const bridge=createRemoteDesktop({runNative:async req=>{n++;return ['remote_frame','remote_open'].includes(req.action)?frame:{ok:false,error:'remote_view_changed'};}});
 const opened=await bridge.handle(owner,{action:'open',persona:'Jobs'});
 await assert.rejects(bridge.handle(owner,{action:'input',token:opened.token,frameId:opened.frame.id,event:{type:'text',text:'draft'}}),{code:'remote_view_changed'});assert.equal(n,2);
});
test('normalized pointer positions, key allowlist and text bounds reject malformed input',()=>{
 for(const e of [{type:'click',x:-.1,y:.3,button:'left',clicks:1},{type:'click',x:Infinity,y:0,button:'left',clicks:1},{type:'drag',path:[{x:0,y:0},{x:2,y:1}]},{type:'key',key:'q',modifiers:['meta']},{type:'text',text:'x'.repeat(2001)},{type:'scroll',x:0,y:0,dx:0,dy:1300},{type:'text',text:'x',command:'rm'}])assert.throws(()=>validateInput(e),{code:'remote_invalid_input'});
 assert.deepEqual(validateInput({type:'text',text:'á 😊'}),{type:'text',text:'á 😊'});
 assert.equal(validateInput({type:'drag',path:[{x:0,y:0},{x:1,y:1}]}).path.length,2);
});
test('opening again invalidates the previous control session',async()=>{
 const bridge=createRemoteDesktop({runNative:async()=>frame});
 const first=await bridge.handle(owner,{action:'open',persona:'Jobs'});await bridge.handle(owner,{action:'open',persona:'Jobs'});
 await assert.rejects(bridge.handle(owner,{action:'frame',token:first.token}),{code:'remote_session_expired'});
});

test('serialized interaction tolerates capture latency without relaxing target validation',async()=>{
 let time=0,last;const bridge=createRemoteDesktop({now:()=>time,runNative:async req=>{last=req;return req.action==='remote_open'?frame:{ok:true};}});
 const opened=await bridge.handle(owner,{action:'open',persona:'Jobs'});time=15000;
 await bridge.handle(owner,{action:'input',token:opened.token,frameId:opened.frame.id,event:{type:'key',key:'Backspace'}});
 assert.deepEqual(last.remoteTarget,target);
});
