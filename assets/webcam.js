/* Webcam PTZ: only the authenticated public proxy is known to this client. */
(function () {
  'use strict';
  const API = 'https://fleet.admira.live/api/webcam/';
  const presets = ['sala', 'pantallas-izquierda', 'pantallas-centro', 'pantallas-derecha', 'puerta', 'recreativa'];
  const labels = ['Sala', 'Pantalla izq.', 'Pantalla centro', 'Pantalla der.', 'Puerta', 'Recreativa'];
  const initial = [{pan:0,tilt:0,zoom:100},{pan:-120000,tilt:0,zoom:150},{pan:0,tilt:0,zoom:175},{pan:120000,tilt:0,zoom:150},{pan:-240000,tilt:0,zoom:100},{pan:240000,tilt:-36000,zoom:125}];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  let playerModule;
  // ES module imports cannot carry the cross-origin host-only Fleet cookie.
  // Fetch both authenticated modules, then resolve their relative import in memory.
  function loadPlayer() {
    if (customElements.get('video-stream')) return Promise.resolve();
    if (!playerModule) playerModule = (async () => {
      const urls = [];
      try {
        const code = await Promise.all(['video-rtc.js','video-stream.js'].map(async name => {
          const r = await fetch(API + name, {credentials:'include', cache:'no-store'});
          if (!r.ok) throw new Error('No se pudo cargar el reproductor. Reabre Analizar o vuelve a entrar con Google.');
          return r.text();
        }));
        const blob = text => { const url = URL.createObjectURL(new Blob([text],{type:'text/javascript'})); urls.push(url); return url; };
        const rtc = blob(code[0]);
        await import(blob(code[1].replace("'./video-rtc.js'", JSON.stringify(rtc))));
      } finally { urls.forEach(url => URL.revokeObjectURL(url)); }
    })().catch(error => { playerModule = null; throw error; });
    return playerModule;
  }
  window.AdmiraWebcam = {mount};
  function mount(root, {demo = false} = {}) {
    let alive = true, timer, stream, busy = false, failed = false, editMode = null, editId = null, lastTime = -1, lastAdvance = 0, connectedAt = 0;
    let state = {pan:0,tilt:0,zoom:100}, selected = 'sala', csrf = '';
    let lista = presets.map((id,i) => ({id,nombre:labels[i],...initial[i]}));
    const abort = new AbortController();
    root.classList.add('webcam-panel');
    root.innerHTML = `
      <div class="webcam-heading"><h4>Webcam en vivo</h4><span class="webcam-badge">${demo ? 'DEMO · DATOS SIMULADOS' : 'Gran de Gràcia · Insta360 Link 2'}</span></div>
      <p class="webcam-note">${demo ? 'Ilustración simulada, sin vídeo ni audio real. Los cambios sólo duran esta visita.' : 'Vídeo y audio en vivo · 720p · sonido silenciado al entrar. Requiere un navegador compatible con MSE (Safari 17+). El búfer añade retraso.'}</p>
      <div class="webcam-layout"><figure class="webcam-view"><div class="webcam-frame">
        <span class="webcam-placeholder">Conectando…</span>${demo ? '<img alt="Vista simulada de las pantallas">' : '<div class="webcam-player"></div>'}
        <button type="button" class="webcam-mute" data-mute aria-label="Activar sonido (M)" aria-pressed="true" title="Sonido (M)" disabled>🔇</button>
        <button type="button" class="webcam-toggle" data-toggle aria-label="Ocultar controles de cámara (H)" aria-expanded="true" title="Controles (H)">🎮</button>
        <div class="webcam-controls" aria-label="Controles de cámara">
          <div class="webcam-presets" role="group" aria-label="Vistas guardadas">${presets.map((preset,i) => `<button type="button" data-preset="${preset}" aria-keyshortcuts="${i+1}">${i+1} ${labels[i]}</button>`).join('')}</div>
          <div class="webcam-edit"><button type="button" data-edit="guardar" aria-pressed="false">Guardar posición aquí…</button><button type="button" data-edit="renombrar" aria-pressed="false">Renombrar…</button></div>
          <form class="webcam-editor" hidden><label>Nombre del preset<input name="nombre" maxlength="24" required autocomplete="off"></label><div><button type="submit">Confirmar</button><button type="button" data-cancel>Cancelar</button></div></form>
          <div class="webcam-motion"><div class="webcam-arrows" role="group" aria-label="Orientación de la cámara"><button type="button" data-move="up" aria-label="Inclinar arriba">↑</button><button type="button" data-move="left" aria-label="Girar izquierda">←</button><button type="button" data-move="right" aria-label="Girar derecha">→</button><button type="button" data-move="down" aria-label="Inclinar abajo">↓</button></div><div class="webcam-zoom" role="group" aria-label="Zoom"><button type="button" data-move="in" aria-label="Aumentar zoom">＋</button><button type="button" data-move="out" aria-label="Reducir zoom">−</button></div></div>
          <div class="webcam-position"></div><div class="webcam-shortcuts">H controles · M sonido · flechas mover · +/− zoom · 1–6 presets</div>
        </div></div><figcaption class="webcam-stream-status" role="status">${demo ? 'Vista simulada' : 'Conectando vídeo…'}</figcaption></figure></div>
      <p class="webcam-status" role="status" aria-live="polite">Conectando…</p>
      <div class="webcam-links">${demo ? '<a href="/">Volver a Admira Live</a>' : '<a href="/demo" target="_blank" rel="noopener">Probar demo sin cámara</a>'}<a class="webcam-retry" href="/" hidden>Volver a entrar con Google</a></div>`;
    const status = root.querySelector('.webcam-status'), placeholder = root.querySelector('.webcam-placeholder');
    const caption = root.querySelector('.webcam-stream-status'), muteButton = root.querySelector('[data-mute]');
    const form = root.querySelector('form'), input = form.elements.nombre;
    const moves = {up:{dtilt:18000},down:{dtilt:-18000},left:{dpan:-18000},right:{dpan:18000},in:{dzoom:25},out:{dzoom:-25}};
    const say = (message, error = false) => { if (!alive) return; status.textContent=message; status.dataset.error=String(error); };
    function enabled() { root.querySelectorAll('[data-move], [data-preset], [data-edit], form button, form input').forEach(button => {button.disabled=busy||failed;}); }
    function position() { root.querySelector('.webcam-position').textContent=`Pan ${(state.pan/3600).toFixed(1)}° · Tilt ${(state.tilt/3600).toFixed(1)}° · Zoom ${(state.zoom/100).toFixed(2)}×`; }
    function updateState(next) {
      state=next;
      if (next.lista) lista=next.lista;
      presets.forEach((id,i) => { const button=root.querySelector(`[data-preset="${id}"]`), name=lista.find(x=>x.id===id)?.nombre||labels[i]; button.textContent=`${i+1} ${name}`; button.title=name; button.setAttribute('aria-pressed',String(id===selected)); });
      position();
    }
    async function api(endpoint,body) {
      const response=await fetch(API+endpoint,{method:body?'POST':'GET',credentials:'include',cache:'no-store',signal:abort.signal,headers:body?{'Content-Type':'application/json','X-Fleet-CSRF':csrf}:{},body:body?JSON.stringify(body):undefined});
      if(response.status===401){failed=true;enabled();root.querySelector('.webcam-retry').hidden=false;stopStream();throw new Error('La sesión ha caducado. Vuelve a entrar con Google.');}
      if(!response.ok)throw new Error(response.status===503?'Webcam o acceso temporalmente no disponible.':'No se ha podido contactar con la cámara.');
      return response.json();
    }
    function simulatedPhoto() {
      const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
      const c = canvas.getContext('2d');
      c.fillStyle = '#132438'; c.fillRect(0, 0, 960, 540);
      c.save(); c.translate(480, 270); c.scale(state.zoom / 100, state.zoom / 100); c.translate(-480 - state.pan / 1000, -270 + state.tilt / 2000);
      c.fillStyle = '#263b50'; c.fillRect(0, 90, 960, 340); c.fillStyle = '#37475d'; c.fillRect(0, 430, 960, 110);
      ['IZQUIERDA', 'CENTRO', 'DERECHA'].forEach((label, i) => {
        const x = 80 + i * 290;
        c.fillStyle = '#060c14'; c.fillRect(x, 145, 250, 160); c.fillStyle = ['#22695f', '#294c86', '#624b7e'][i]; c.fillRect(x + 8, 153, 234, 144);
        c.fillStyle = '#fff'; c.font = 'bold 22px system-ui'; c.fillText(label, x + 20, 195); c.font = '18px system-ui'; c.fillText('Contenido simulado', x + 20, 230); c.fillText(new Date().toLocaleTimeString('es-ES'), x + 20, 267);
        c.fillStyle = '#0a1320'; c.fillRect(x + 116, 305, 18, 52);
      });
      c.restore(); c.fillStyle = '#0b1020'; c.fillRect(0, 0, 960, 58); c.fillStyle = '#ffd579'; c.font = 'bold 24px system-ui'; c.fillText('SIMULACIÓN · ' + labels[presets.indexOf(selected)], 24, 38);
      return canvas.toDataURL('image/png');
    }

    function drawDemo() { root.querySelector('img').src=simulatedPhoto();placeholder.hidden=true; }
    function arm(mode) {
      if(busy||failed)return;
      editMode=editMode===mode?null:mode;editId=null;form.hidden=true;
      root.querySelectorAll('[data-edit]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.edit===editMode)));
      say(editMode ? `Elige el preset que quieres ${editMode==='guardar'?'sobrescribir con la posición actual':'renombrar'} (botón o tecla 1–6).` : 'Edición cancelada.');
    }
    function choose(id) {
      if(busy||failed)return;
      if(!editMode)return move({preset:id});
      editId=id;input.value=lista.find(x=>x.id===id).nombre;form.hidden=false;
      form.querySelector('label').firstChild.textContent=`${editMode==='guardar'?'Guardar posición en':'Renombrar'} ${presets.indexOf(id)+1} · nombre (máx. 24)`;
      input.focus();input.select();
    }
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(busy||failed||!editId||!editMode)return;
      const nombre=input.value.trim();if(!nombre||[...nombre].length>24){say('Escribe un nombre de 1 a 24 caracteres.',true);return;}
      busy=true;enabled();const mode=editMode,id=editId;
      try {
        if(demo){lista=lista.map(row=>row.id===id?{...row,nombre,...(mode==='guardar'?state:{})}:row);updateState(state);drawDemo();}
        else {await api('presets/'+mode,{id,nombre});updateState(await api('estado'));}
        editMode=null;editId=null;form.hidden=true;root.querySelectorAll('[data-edit]').forEach(b=>b.setAttribute('aria-pressed','false'));
        say(demo?'Preset simulado actualizado sólo para esta visita.':`Preset ${mode==='guardar'?'guardado con la posición actual':'renombrado'} en el servidor.`);
      }catch(error){say(error.message+' Comprueba el estado antes de repetir.',true);}
      finally{busy=false;if(alive)enabled();}
    });
    async function move(command) {
      if(busy||failed||!alive)return;busy=true;enabled();say('Moviendo cámara…');
      try {
        if(demo){if(command.preset){selected=command.preset;const row=lista.find(x=>x.id===selected);state={pan:row.pan,tilt:row.tilt,zoom:row.zoom};}else{state.pan=clamp(state.pan+(command.dpan||0),-522000,522000);state.tilt=clamp(state.tilt+(command.dtilt||0),-324000,360000);state.zoom=clamp(state.zoom+(command.dzoom||0),100,400);}}
        else {await api('mover',command);if(command.preset)selected=command.preset;updateState(await api('estado'));}
        updateState(state);if(demo)drawDemo();say(demo?'Vista simulada actualizada.':'Movimiento confirmado. El vídeo muestra la nueva vista tras el retraso del búfer.');
      }catch(error){say(error.message+' Comprueba la posición antes de repetir.',true);}
      finally{busy=false;if(alive)enabled();}
    }
    const overlay=root.querySelector('.webcam-controls'),toggleButton=root.querySelector('[data-toggle]');
    function toggle(){overlay.hidden=!overlay.hidden;toggleButton.setAttribute('aria-expanded',String(!overlay.hidden));toggleButton.setAttribute('aria-label',`${overlay.hidden?'Mostrar':'Ocultar'} controles de cámara (H)`);}
    function syncMute(){if(!alive||!stream?.video)return;const muted=stream.video.muted;muteButton.textContent=muted?'🔇':'🔊';muteButton.setAttribute('aria-pressed',String(muted));muteButton.setAttribute('aria-label',`${muted?'Activar':'Silenciar'} sonido (M)`);}
    async function mute(){if(!stream?.video)return;const video=stream.video;video.muted=!video.muted;syncMute();if(!video.muted){try{await video.play();}catch{video.muted=true;syncMute();say('El navegador bloqueó el audio. Toca de nuevo el botón de sonido.',true);}}}
    function monitor(){
      if(!alive||!stream)return;
      const v=stream.video,now=performance.now();
      if(v.currentTime>lastTime+0.01){lastTime=v.currentTime;lastAdvance=now;}
      const receiving=v.readyState>=2&&now-lastAdvance<2500&&!v.paused&&!document.hidden;
      placeholder.hidden=receiving;
      if(receiving){const lag=v.buffered.length?Math.max(0,v.buffered.end(v.buffered.length-1)-v.currentTime):0;caption.textContent=`● EN VIVO · retraso de búfer ${lag.toFixed(2)} s`;if(lag>1.5&&v.seekable.length)v.currentTime=Math.max(v.seekable.start(0),v.buffered.end(v.buffered.length-1)-0.2);}
      else {caption.textContent=document.hidden?'Vídeo en pausa':v.paused&&v.readyState>=2?'Reproducción en pausa':'Conectando o recuperando vídeo…';placeholder.textContent=caption.textContent;}
      if(!receiving&&!document.hidden&&now-Math.max(connectedAt,lastAdvance)>20000){caption.textContent='No llega vídeo. Reabre Analizar o vuelve a entrar con Google.';placeholder.textContent=caption.textContent;root.querySelector('.webcam-retry').hidden=false;}
      syncMute();timer=setTimeout(monitor,1000);
    }
    function stopStream(){clearTimeout(timer);if(stream){stream.ondisconnect();clearTimeout(stream.reconnectTID);clearTimeout(stream.disconnectTID);stream.remove();stream=null;}}
    const keydown=event=>{
      if(!alive||!root.isConnected||event.defaultPrevented||event.ctrlKey||event.altKey||event.metaKey||event.repeat||event.target.closest('input, textarea, select, [contenteditable="true"]'))return;
      const key=event.key,direction={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right','+':'in','=':'in','-':'out','−':'out'}[key];
      if(!['h','m'].includes(key.toLowerCase())&&!direction&&!/^[1-6]$/.test(key))return;
      event.preventDefault();event.stopImmediatePropagation();
      if(key.toLowerCase()==='h')toggle();else if(key.toLowerCase()==='m')mute();else if(direction)move(moves[direction]);else choose(presets[Number(key)-1]);
    };
    document.addEventListener('keydown',keydown,true);
    const click=event=>{const b=event.target.closest('button');if(!b||!root.contains(b))return;if(b.dataset.move)move(moves[b.dataset.move]);else if(b.dataset.preset)choose(b.dataset.preset);else if(b.dataset.edit)arm(b.dataset.edit);else if(b.hasAttribute('data-cancel')){arm(null);editMode=null;editId=null;form.hidden=true;root.querySelectorAll('[data-edit]').forEach(x=>x.setAttribute('aria-pressed','false'));}else if(b.hasAttribute('data-toggle'))toggle();else if(b.hasAttribute('data-mute'))mute();};
    root.addEventListener('click',click);
    const visibility=()=>{if(!stream)return;if(document.hidden)stream.ondisconnect();else stream.onconnect();};document.addEventListener('visibilitychange',visibility);
    const observer=new MutationObserver(()=>{if(!root.isConnected)destroy();});observer.observe(document.body,{childList:true,subtree:true});
    function destroy(){if(!alive)return;alive=false;abort.abort();observer.disconnect();document.removeEventListener('keydown',keydown,true);document.removeEventListener('visibilitychange',visibility);root.removeEventListener('click',click);stopStream();}
    (async()=>{
      busy=true;enabled();
      try {
        if(demo){updateState(state);drawDemo();say('Demo activa · controles simulados.');return;}
        const response=await fetch('https://fleet.admira.live/api/auth/session',{credentials:'include',cache:'no-store',signal:abort.signal});
        if(!response.ok)throw new Error('Inicia sesión en Admira Live con Google para usar la webcam.');
        const session=await response.json();csrf=session.csrf;updateState(await api('estado'));
        const MSE=window.ManagedMediaSource||window.MediaSource;
        if(!MSE?.isTypeSupported('video/mp4; codecs="avc1.640029,mp4a.40.2"'))throw new Error('Este navegador no admite el vídeo MSE H.264/AAC. Actualiza Safari (17+) o usa Chrome.');
        await loadPlayer();if(!alive)return;
        stream=document.createElement('video-stream');stream.mode='mse';stream.media='video,audio';stream.visibilityCheck=false;
        root.querySelector('.webcam-player').append(stream);stream.video.muted=true;stream.video.defaultMuted=true;stream.video.controls=false;stream.video.addEventListener('volumechange',syncMute);muteButton.disabled=false;
        stream.src=API.replace(/^http/,'ws')+'ws';connectedAt=performance.now();monitor();say('Reproductor preparado · usa M o el botón para activar el sonido.');
      }catch(error){if(alive){failed=true;placeholder.textContent='Webcam no disponible';say(error.message,true);root.querySelector('.webcam-retry').hidden=demo;}}
      finally{busy=false;if(alive)enabled();}
    })();
    return destroy;
  }
})();
