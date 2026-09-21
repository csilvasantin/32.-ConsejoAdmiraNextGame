'use strict';
const crypto=require('node:crypto');
const {canonicalPersona,PERSONAS}=require('./grokbot-bridge');
class RemoteError extends Error{constructor(code,status=409){super(code);this.code=code;this.status=status;}}
const fail=(code,status)=>{throw new RemoteError(code,status);};
const fields=(value,allowed)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>allowed.includes(k));
const point=p=>fields(p,['x','y'])&&[p.x,p.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1);
const KEYS=new Set(['Enter','Tab','Escape','Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown','a','c','x','v','z','y','f']);
function validateInput(event){
 if(!fields(event,['type','x','y','button','clicks','dx','dy','path','key','text','modifiers']))fail('remote_invalid_input',400);
 const mods=event.modifiers||[];
 if(!Array.isArray(mods)||mods.length>4||mods.some(m=>!['shift','ctrl','alt','meta'].includes(m)))fail('remote_invalid_input',400);
 if(event.type==='click'&&point({x:event.x,y:event.y})&&['left','right'].includes(event.button)&&[1,2].includes(event.clicks))return {...event,modifiers:mods};
 if(event.type==='scroll'&&point({x:event.x,y:event.y})&&[event.dx,event.dy].every(v=>Number.isFinite(v)&&Math.abs(v)<=1200))return {...event,modifiers:mods};
 if(event.type==='drag'&&Array.isArray(event.path)&&event.path.length>=2&&event.path.length<=40&&event.path.every(point))return {...event,modifiers:mods};
 if(event.type==='key'&&KEYS.has(event.key))return {...event,modifiers:mods};
 if(event.type==='text'&&typeof event.text==='string'&&event.text.length>0&&event.text.length<=2000&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(event.text)&&mods.length===0)return {type:'text',text:event.text};
 fail('remote_invalid_input',400);
}
function createRemoteDesktop({runNative,now=Date.now}){
 const sessions=new Map();
 const owner=s=>s?.email&&s?.jti?String(s.email).toLowerCase()+'\0'+s.jti:fail('authenticated_session_required',401);
 async function capture(row){
  const result=await runNative({action:'remote_frame',persona:PERSONAS[row.persona]});
  if(!result?.ok)fail(/^remote_[a-z_]+$/.test(result?.error)?result.error:'remote_capture_unavailable',503);
  const t=result.target,f=result.frame;
  if(!t||t.persona!==PERSONAS[row.persona]||![t.pid,t.windowID,t.x,t.y,t.width,t.height].every(Number.isFinite)||t.pid<=0||t.windowID<=0||t.width<100||t.height<100||typeof f?.jpeg!=='string'||!f.jpeg.startsWith('/9j/')||f.jpeg.length>8*1024*1024||!Number.isFinite(f.width)||!Number.isFinite(f.height))fail('remote_invalid_frame',503);
  const id=crypto.randomBytes(12).toString('hex');
  row.frames.set(id,{target:t,at:now()});
  for(const [key,v] of row.frames)if(now()-v.at>10000||row.frames.size>8)row.frames.delete(key);
  row.expires=now()+300000;
  return {frame:{id,jpeg:f.jpeg,width:f.width,height:f.height},persona:row.persona};
 }
 async function handle(session,body){
  const who=owner(session);
  if(!fields(body,['action','persona','token','frameId','event']))fail('remote_invalid_request',400);
  for(const [key,row] of sessions)if(row.expires<now())sessions.delete(key);
  if(body.action==='open'){
   const persona=canonicalPersona(body.persona);if(!persona)fail('invalid_persona',400);
   for(const [key,row] of sessions)if(row.owner===who)sessions.delete(key);
   if(sessions.size>=8)fail('remote_busy');
   const token=crypto.randomBytes(24).toString('hex');
   const row={owner:who,persona,expires:now()+300000,frames:new Map()};
   const frame=await capture(row);sessions.set(token,row);return {token,...frame};
  }
  const row=sessions.get(body.token);
  if(!row||row.owner!==who)fail('remote_session_expired');
  if(body.action==='close'){sessions.delete(body.token);return {closed:true};}
  if(body.action==='frame')return capture(row);
  if(body.action==='input'){
   const event=validateInput(body.event),frame=row.frames.get(body.frameId);
   if(!frame||now()-frame.at>10000)fail('remote_frame_expired');
   const result=await runNative({action:'remote_input',persona:PERSONAS[row.persona],remoteTarget:frame.target,remoteEvent:event});
   if(!result?.ok)fail(/^remote_[a-z_]+$/.test(result?.error)?result.error:'remote_input_unconfirmed');
   row.expires=now()+300000;return {accepted:true};
  }
  fail('remote_invalid_request',400);
 }
 return {handle};
}
module.exports={createRemoteDesktop,validateInput,RemoteError};
