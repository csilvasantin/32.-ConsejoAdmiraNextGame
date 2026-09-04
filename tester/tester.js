import { region, pixels, createMonitor, controlURL } from './analysis.js';
const $ = id => document.getElementById(id);
const video = $('camera'), canvas = $('crop'), ctx = canvas.getContext('2d', { willReadFrequently: true });
const monitor = createMonitor();
let stream = null, generation = 0, roi = region({x:10,y:10,w:80,h:80}), reference = null;
let observing = false, frameAt = 0, frameHandle = null, lastMediaTime = -1, activeAlarms = new Set();
let events = [], clearedAt = 0, closed = false, roiDirty = false;
const labels = { dark: 'Posible pantalla oscura: comprueba contenido, exposición y alimentación.', frozen: 'Posible imagen congelada: no se aprecia movimiento; comprueba si la pieza es estática.', reference: 'La imagen difiere de la referencia: comprueba contenido, encuadre e iluminación.' };
function note(message) { $('notice').textContent = message; }
function log(kind, message) {
  events.unshift({ at:new Date().toISOString(), kind, message, player:$('machine').value.trim() });
  events = events.slice(0,200);
  $('events').replaceChildren(...events.map(e => { const li=document.createElement('li'); li.textContent=`${new Date(e.at).toLocaleTimeString()} · ${e.player} · ${e.message}`; return li; }));
}
function pause(message) {
  const wasObserving = observing;
  observing = false; monitor.reset(); activeAlarms.clear();
  $('pause').disabled=true; $('monitor').disabled=!stream;
  $('state').textContent=stream?'Vigilancia pausada':'Cámara apagada';
  if (message) { note(message); if(wasObserving) log('pause',message); }
}
function invalidate(message) {
  pause(message); reference=null; $('ready').checked=false;
  $('clearReference').disabled=true;
}
function stop(message='Cámara apagada. No quedan pistas de vídeo abiertas.') {
  generation++; pause();
  if(frameHandle!==null && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(frameHandle);
  frameHandle=null;
  stream?.getTracks().forEach(track=>track.stop()); stream=null;
  video.srcObject=null; reference=null; frameAt=0; lastMediaTime=-1;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  $('start').disabled=false; $('stop').disabled=true; $('reference').disabled=true; $('clearReference').disabled=true;
  $('monitor').disabled=true; $('ready').checked=false; $('device').disabled=false; $('empty').hidden=false;
  $('state').textContent='Cámara apagada';
  for(const id of ['brightness','change','deviation']) $(id).textContent='—';
  note(message);
}
function frameCallback() {
  frameAt=performance.now();
  if(stream && !closed) frameHandle=video.requestVideoFrameCallback(frameCallback);
}
function freshFrame() {
  if(!video.requestVideoFrameCallback && video.currentTime !== lastMediaTime) {
    lastMediaTime=video.currentTime; frameAt=performance.now();
  }
  return stream && video.readyState>=2 && video.videoWidth>0 && frameAt>0 && performance.now()-frameAt<3000 && !video.paused;
}
function sample() {
  if(!freshFrame()) return null;
  ctx.drawImage(video, video.videoWidth*roi.x/100, video.videoHeight*roi.y/100,
    video.videoWidth*roi.w/100,video.videoHeight*roi.h/100,0,0,canvas.width,canvas.height);
  return pixels(ctx.getImageData(0,0,canvas.width,canvas.height).data);
}
$('start').onclick=async()=>{
  if(!isSecureContext || !navigator.mediaDevices?.getUserMedia) { note('La cámara necesita HTTPS y un navegador compatible.'); return; }
  stop(); const attempt=++generation;
  $('start').disabled=true; $('stop').disabled=false; note('Esperando tu permiso de cámara…');
  try {
    const device=$('device').value;
    const media=await navigator.mediaDevices.getUserMedia({audio:false,video:device?{deviceId:{exact:device}}:{facingMode:'environment'}});
    if(attempt!==generation || closed) { media.getTracks().forEach(t=>t.stop()); return; }
    stream=media; video.srcObject=media;
    media.getVideoTracks().forEach(t=>t.addEventListener('ended',()=>stop('La cámara se ha desconectado. Actívala de nuevo cuando esté disponible.'),{once:true}));
    await video.play();
    if(attempt!==generation || !stream) return;
    $('empty').hidden=true; $('reference').disabled=false; $('monitor').disabled=false; $('device').disabled=true;
    $('state').textContent='Cámara activa · sin vigilancia'; note('Comprueba el recorte y confirma qué contenido debe verse antes de vigilar.');
    if(video.requestVideoFrameCallback) frameHandle=video.requestVideoFrameCallback(frameCallback);
    const devices=await navigator.mediaDevices.enumerateDevices();
    if(attempt!==generation) return;
    const selected=media.getVideoTracks()[0].getSettings().deviceId;
    $('device').replaceChildren(...devices.filter(d=>d.kind==='videoinput').map((d,i)=>new Option(d.label||`Cámara ${i+1}`,d.deviceId,false,d.deviceId===selected)));
    log('camera','Cámara activada por el operador. Sin audio, grabación ni envío de imágenes.');
  } catch(error) {
    if(attempt!==generation) return;
    stop(error.name==='NotAllowedError'?'Permiso de cámara denegado. Puedes autorizarlo desde los ajustes del navegador.':`No se pudo abrir la cámara (${error.name}). Comprueba que no esté ocupada.`);
  }
};
$('stop').onclick=()=>{stop();log('camera','Cámara apagada por el operador.');};
$('apply').onclick=()=>{
  try { roi=region(Object.fromEntries(['x','y','w','h'].map(k=>[k,$(k).value]))); roiDirty=false; invalidate('Encuadre aplicado. Valida el recorte y reinicia la vigilancia.'); }
  catch(error) { invalidate(error.message); }
};
for(const k of ['x','y','w','h']) $(k).oninput=()=>{roiDirty=true;invalidate('Encuadre editado. Pulsa Aplicar encuadre antes de confirmar.');};
function updatePlayer() {
  try { $('remote').href=controlURL($('machine').value); $('remote').removeAttribute('aria-disabled'); }
  catch(error) { $('remote').removeAttribute('href'); $('remote').setAttribute('aria-disabled','true'); note(error.message); }
}
$('machine').oninput=()=>{invalidate('Player cambiado. Confirma la pantalla y el contenido esperado.');updatePlayer();};
const requested=new URLSearchParams(location.search).get('machine');
if(requested) $('machine').value=requested.slice(0,80);
updatePlayer();
for(const id of ['motion','duration']) $(id).onchange=()=>invalidate('Reglas cambiadas. Confirma las condiciones y vuelve a iniciar.');
$('ready').onchange=()=>{if(!$('ready').checked) pause('Confirma el encuadre antes de vigilar.');};
$('reference').onclick=()=>{
  if(roiDirty){note('Aplica el encuadre antes de fijar una referencia.');return;}
  const frame=sample(); if(!frame) {note('No hay un fotograma reciente para fijar una referencia.');return;}
  pause();reference=frame.gray.slice();$('motion').checked=false;$('clearReference').disabled=false;$('ready').checked=false;
  note('Referencia fijada en memoria. Confirma que esta imagen debe permanecer igual; el movimiento esperado se ha desactivado.');log('reference','Referencia visual fijada por el operador; no se guarda en el informe.');
};
$('clearReference').onclick=()=>invalidate('Referencia eliminada. Confirma de nuevo las condiciones.');
$('monitor').onclick=()=>{
  if(roiDirty){note('Aplica el encuadre antes de iniciar la vigilancia.');return;}
  try { controlURL($('machine').value); region(Object.fromEntries(['x','y','w','h'].map(k=>[k,$(k).value]))); }
  catch(error){note(error.message);return;}
  if(!$('ready').checked || !freshFrame() || document.hidden) {note('Necesitas una cámara reciente, esta pestaña visible y confirmar las condiciones.');return;}
  observing=true;monitor.reset();activeAlarms.clear();$('monitor').disabled=true;$('pause').disabled=false;
  $('state').textContent='Observando · sin conclusiones aún';log('start','Vigilancia iniciada. Las alertas serán sospechas que requieren revisión.');
  note('Análisis local cada segundo. Mantén la pestaña visible y la webcam fija.');
};
$('pause').onclick=()=>pause('Vigilancia pausada por el operador; cámara en vista previa.');
$('notifications').onclick=async()=>{
  if(!('Notification' in window)){note('Este navegador no admite avisos. Las alarmas siguen disponibles en esta página.');return;}
  try { const permission=await Notification.requestPermission();note(permission==='granted'?'Avisos del navegador permitidos. La vigilancia sigue necesitando esta pestaña visible.':'Sin permiso de avisos; las alarmas se mostrarán en esta página.'); }
  catch {note('No se pudieron habilitar los avisos. Las alarmas permanecen en esta página.');}
};
const timer=setInterval(()=>{
  if(!stream || document.hidden) return;
  const frame=sample();
  if(!frame) { if(observing){pause('Sin imagen reciente: observación interrumpida. No se evalúa una imagen antigua.');log('camera-lost','Cámara sin fotogramas recientes. Revisa la conexión.');} return; }
  $('brightness').textContent=`${(frame.brightness*100).toFixed(1)}%`;
  if(!observing) return;
  const result=monitor.sample({...frame,at:performance.now()/1000,expectMotion:$('motion').checked,reference,duration:Number($('duration').value)});
  $('change').textContent=result.change===null?'—':`${(result.change*100).toFixed(1)}%`;
  $('deviation').textContent=result.deviation===null?'Sin referencia':`${(result.deviation*100).toFixed(1)}%`;
  for(const alarm of result.alarms) if(!activeAlarms.has(alarm)) {
    activeAlarms.add(alarm);clearedAt=0;log('alarm',labels[alarm]);
    if('Notification' in window && Notification.permission==='granted') {
      try {new Notification('Admira · revisar pantalla',{body:labels[alarm],tag:`admira-tester-${alarm}`});} catch {/* Page alarm is authoritative. */}
    }
  }
  if(!result.alarms.length && activeAlarms.size) {
    if(!clearedAt) clearedAt=performance.now();
    if(performance.now()-clearedAt>10000){activeAlarms.clear();log('recovery','El indicio ha desaparecido durante 10 segundos; esto no certifica la reproducción.');}
  } else if(result.alarms.length) clearedAt=0;
  $('state').textContent=activeAlarms.size?'Revisar pantalla · posible incidencia':'Observando · sin indicios actuales';
},1000);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause('Pestaña oculta: vigilancia pausada para evitar conclusiones con muestras incompletas.');});
window.addEventListener('pagehide',()=>{closed=true;clearInterval(timer);stop();});
window.addEventListener('pageshow',event=>{if(event.persisted) location.reload();});
$('export').onclick=()=>{
  const report={version:1,exportedAt:new Date().toISOString(),player:$('machine').value.trim(),roi,scope:'Heurísticas locales; sin prueba semántica ni imágenes; requiere revisión humana.',events};
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='admira-tester-informe.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
