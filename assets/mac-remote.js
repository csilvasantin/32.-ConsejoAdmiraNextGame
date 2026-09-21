const ENDPOINT='https://fleet.admira.live/api/grokbot/remote';
export function remotePoint(clientX,clientY,rect,width,height){
  if(!rect.width||!rect.height||!width||!height)return null;
  const scale=Math.min(rect.width/width,rect.height/height),w=width*scale,h=height*scale;
  const x=(clientX-rect.left-(rect.width-w)/2)/w,y=(clientY-rect.top-(rect.height-h)/2)/h;
  return x>=0&&x<=1&&y>=0&&y<=1?{x,y}:null;
}
export function remoteKey(event){
  const modifiers=[event.metaKey&&'meta',event.ctrlKey&&'ctrl',event.altKey&&'alt',event.shiftKey&&'shift'].filter(Boolean);
  const keys=['Enter','Tab','Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'];
  if(keys.includes(event.key))return {type:'key',key:event.key,modifiers};
  if((event.metaKey||event.ctrlKey)&&['a','c','x','v','z','y','f'].includes(event.key.toLowerCase()))return {type:'key',key:event.key.toLowerCase(),modifiers};
  if(!event.metaKey&&!event.ctrlKey&&!event.altKey&&event.key.length===1)return {type:'text',text:event.key};
  return null;
}
const MESSAGES={
  remote_selection_changed:'Ha cambiado el consejero en GrokBot. Vuelve al Mac y abre su escritorio.',
  remote_view_changed:'La ventana ha cambiado. Pulsa Reconectar para actualizar la vista.',
  remote_capture_unavailable:'No se puede capturar la ventana de GrokBot. Comprueba el permiso de grabación de pantalla del puente.',
  remote_window_unavailable:'La ventana de GrokBot no está disponible.',
  remote_frame_expired:'La imagen ya no está actualizada. Pulsa Reconectar antes de continuar.',
  remote_session_expired:'La conexión ha caducado. Pulsa Reconectar.',
  remote_input_unconfirmed:'No se pudo confirmar la entrada. Comprueba la pantalla antes de repetir.',
  session_expired:'Inicia sesión en admira.live para conectar.'
};
let active=null;
export function openRemote(){
  if(typeof document==='undefined'||!window.MacHoy||window.MacHoy.modoActual()!=='remote')return;
  const persona=window.MacHoy.remoteSeat();if(!persona)return;
  if(active)return;
  const previousFocus=document.activeElement,overflow=document.body.style.overflow;
  const overlay=document.createElement('section');overlay.className='mac-ultra';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Ultradetalle · escritorio de '+persona);
  overlay.innerHTML='<header class="mac-ultra__bar"><strong></strong><span role="status">Conectando…</span><button type="button" data-reconnect>Reconectar</button><button type="button" data-text>Escribir texto</button><button type="button" data-full>Pantalla completa</button><button type="button" data-close>Volver al Mac · Esc</button></header><form class="mac-ultra__text" hidden><textarea aria-label="Texto para escribir en el escritorio remoto" placeholder="Texto para el campo seleccionado en GrokBot"></textarea><button type="submit">Escribir en remoto</button></form><div class="mac-ultra__stage" tabindex="0" role="application" aria-label="Escritorio remoto interactivo"><img draggable="false" alt="Escritorio remoto"><p class="mac-ultra__hint">Conectando con GrokBot…</p></div>';
  overlay.querySelector('strong').textContent='Ultradetalle · '+persona;
  document.body.append(overlay);document.body.style.overflow='hidden';
  const stage=overlay.querySelector('.mac-ultra__stage'),img=stage.querySelector('img'),hint=stage.querySelector('p'),status=overlay.querySelector('[role="status"]'),form=overlay.querySelector('form');
  let token=null,frame=null,closed=false,ready=false,timer=null,generation=0,queue=Promise.resolve(),queued=0,enteredFullscreen=false,drag=null,suppressClick=false,textBuffer='',textTimer=null;
  const controllers=new Set();
  const say=text=>{status.textContent=text;};
  function fail(error){ready=false;clearTimeout(timer);const message=MESSAGES[error.code]||'No se pudo conectar con el escritorio. Pulsa Reconectar.';say(message);hint.textContent=message;hint.hidden=false;}
  async function request(body){
    const ctl=new AbortController();controllers.add(ctl);const timeout=setTimeout(()=>ctl.abort(),20000);
    try{
      const res=await fetch(ENDPOINT,{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json','X-Fleet-CSRF':window.admiraGateCsrf?.()||''},body:JSON.stringify(body),signal:ctl.signal});
      const data=await res.json();if(!res.ok||!data.ok){const error=new Error('remote');error.code=res.status===401?'session_expired':data.error;throw error;}return data;
    }finally{clearTimeout(timeout);controllers.delete(ctl);}
  }
  async function paint(data,version){
    if(closed||version!==generation)return;
    const next=new Image();next.src='data:image/jpeg;base64,'+data.frame.jpeg;
    await next.decode();if(closed||version!==generation)return;
    img.src=next.src;frame=data.frame;ready=true;hint.hidden=true;say('Conectado · ratón y teclado activos');
  }
  function schedule(){clearTimeout(timer);if(!closed&&ready)timer=setTimeout(refresh,1000);}
  async function refresh(){
    if(closed||!token||!ready)return;
    if(queued){schedule();return;}
    const version=generation;
    try{await paint(await request({action:'frame',token}),version);schedule();}catch(error){if(!closed&&version===generation)fail(error);}
  }
  async function connect(){
    const version=++generation;ready=false;clearTimeout(timer);hint.hidden=false;hint.textContent='Conectando con GrokBot…';say('Conectando…');
    try{const data=await request({action:'open',persona});if(closed||version!==generation)return;token=data.token;await paint(data,version);stage.focus({preventScroll:true});schedule();}catch(error){if(!closed&&version===generation)fail(error);}
  }
  function send(event){
    if(closed||!ready||!frame)return;
    const version=generation,body={action:'input',token,frameId:frame.id,event};queued++;
    queue=queue.then(async()=>{
      if(closed||!ready||version!==generation)return;
      try{await request(body);}catch(error){if(!closed&&version===generation)fail(error);}
    }).finally(()=>{queued--;});
  }
  function flushText(){clearTimeout(textTimer);if(textBuffer){const text=textBuffer;textBuffer='';send({type:'text',text});}}
  const point=e=>frame&&remotePoint(e.clientX,e.clientY,stage.getBoundingClientRect(),frame.width,frame.height);
  const modifiers=e=>[e.metaKey&&'meta',e.ctrlKey&&'ctrl',e.altKey&&'alt',e.shiftKey&&'shift'].filter(Boolean);
  stage.addEventListener('pointerdown',e=>{if(e.button!==0||!ready)return;const p=point(e);if(!p)return;flushText();stage.focus({preventScroll:true});drag={start:p,path:[p],pixel:{x:e.clientX,y:e.clientY}};stage.setPointerCapture(e.pointerId);});
  stage.addEventListener('pointermove',e=>{if(!drag)return;const p=point(e);if(p){drag.path.push(p);if(drag.path.length>40)drag.path.splice(1,1);}});
  stage.addEventListener('pointerup',e=>{if(!drag)return;const d=drag;drag=null;const p=point(e);if(!p)return;if(Math.hypot(e.clientX-d.pixel.x,e.clientY-d.pixel.y)>4){send({type:'drag',path:[d.start,...d.path.slice(-38),p],modifiers:modifiers(e)});suppressClick=true;}});
  stage.addEventListener('pointercancel',()=>{drag=null;});
  stage.addEventListener('click',e=>{if(suppressClick){suppressClick=false;return;}const p=point(e);if(p){flushText();send({type:'click',...p,button:'left',clicks:Math.min(2,e.detail||1),modifiers:modifiers(e)});}});
  stage.addEventListener('contextmenu',e=>{e.preventDefault();const p=point(e);if(p){flushText();send({type:'click',...p,button:'right',clicks:1,modifiers:modifiers(e)});}});
  stage.addEventListener('wheel',e=>{const p=point(e);if(!p||!ready)return;e.preventDefault();flushText();const scale=e.deltaMode===1?16:e.deltaMode===2?stage.clientHeight:1;send({type:'scroll',...p,dx:Math.max(-1200,Math.min(1200,e.deltaX*scale)),dy:Math.max(-1200,Math.min(1200,e.deltaY*scale)),modifiers:modifiers(e)});},{passive:false});
  stage.addEventListener('keydown',e=>{
    if(e.isComposing||e.key==='Escape'||!ready)return;
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='v')return; // use the browser paste event, never the host clipboard
    const input=remoteKey(e);if(!input)return;e.preventDefault();e.stopPropagation();
    if(input.type==='text'){textBuffer+=input.text;clearTimeout(textTimer);textTimer=setTimeout(flushText,60);}else{flushText();send(input);}
  });
  stage.addEventListener('paste',e=>{const text=e.clipboardData?.getData('text/plain');if(!text||!ready)return;e.preventDefault();flushText();if(text.length>2000){say('Pega como máximo 2000 caracteres cada vez.');return;}send({type:'text',text});});
  form.addEventListener('submit',e=>{e.preventDefault();const field=form.querySelector('textarea'),text=field.value;if(!text||text.length>2000||!ready)return;send({type:'text',text});field.value='';form.hidden=true;stage.focus();});
  overlay.querySelector('[data-text]').onclick=()=>{form.hidden=!form.hidden;if(!form.hidden)form.querySelector('textarea').focus();};
  overlay.querySelector('[data-reconnect]').onclick=connect;
  function fullscreen(){if(overlay.requestFullscreen)overlay.requestFullscreen().catch(()=>{});}
  overlay.querySelector('[data-full]').onclick=fullscreen;
  function onFullscreen(){enteredFullscreen=document.fullscreenElement===overlay;overlay.querySelector('[data-full]').textContent=enteredFullscreen?'Pantalla completa activa':'Pantalla completa';}
  function onKey(e){if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}}
  function close(){
    if(closed)return;closed=true;generation++;ready=false;clearTimeout(timer);clearTimeout(textTimer);controllers.forEach(c=>c.abort());
    if(token)fetch(ENDPOINT,{method:'POST',credentials:'include',keepalive:true,headers:{'Content-Type':'application/json','X-Fleet-CSRF':window.admiraGateCsrf?.()||''},body:JSON.stringify({action:'close',token})}).catch(()=>{});
    document.removeEventListener('keydown',onKey,true);document.removeEventListener('fullscreenchange',onFullscreen);
    if(document.fullscreenElement===overlay)document.exitFullscreen().catch(()=>{});
    overlay.remove();document.body.style.overflow=overflow;previousFocus?.focus?.({preventScroll:true});active=null;
  }
  overlay.querySelector('[data-close]').onclick=close;
  document.addEventListener('keydown',onKey,true);document.addEventListener('fullscreenchange',onFullscreen);
  active={close};fullscreen();connect();
}
if(typeof window!=='undefined'){
  window.MacRemote={open:openRemote,close:()=>active?.close()};
  document.addEventListener('click',e=>{if(e.target.closest('.mac-hoy-ultra-trigger')){e.preventDefault();e.stopPropagation();openRemote();}});
  document.addEventListener('mac-screen-mode',e=>{if(e.detail.mode!=='remote')active?.close();});
}
