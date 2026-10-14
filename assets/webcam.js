/* Webcam PTZ: only the authenticated public proxy is known to this client. */
(function () {
  'use strict';
  const API = 'https://fleet.admira.live/api/webcam/';
  const presets = ['sala', 'pantallas-izquierda', 'pantallas-centro', 'pantallas-derecha'];
  const labels = ['Sala', 'Pantallas izquierda', 'Pantallas centro', 'Pantallas derecha'];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  window.AdmiraWebcam = {mount};
  function mount(root, {demo = false} = {}) {
    let alive = true, timer, objectURL, busy = false, refreshing = false, failed = false;
    let state = {pan: 0, tilt: 0, zoom: 100}, selected = 'sala', csrf = '';
    const abort = new AbortController();
    root.classList.add('webcam-panel');
    root.innerHTML = `
      <div class="webcam-heading"><h4>Webcam en vivo</h4><span class="webcam-badge">${demo ? 'DEMO · DATOS SIMULADOS' : 'Gran de Gràcia · Insta360 Link 2'}</span></div>
      <p class="webcam-note">${demo ? 'Ilustración simulada. Los controles no mueven ninguna cámara real.' : 'Fotos cada 5 s · sin audio. Usa un preset para ver las pantallas de la oficina.'}</p>
      <div class="webcam-layout">
        <figure class="webcam-view"><div class="webcam-frame"><span class="webcam-placeholder">Conectando…</span><img alt="${demo ? 'Vista simulada de las pantallas' : 'Última foto de las pantallas de la oficina'}"></div><figcaption>Última foto ${demo ? 'simulada' : 'recibida'}: <time>—</time></figcaption></figure>
        <div class="webcam-controls">
          <div class="webcam-arrows" role="group" aria-label="Orientación de la cámara">
            <button type="button" data-move="up" aria-label="Inclinar arriba">↑</button><button type="button" data-move="left" aria-label="Girar izquierda">←</button><button type="button" data-move="right" aria-label="Girar derecha">→</button><button type="button" data-move="down" aria-label="Inclinar abajo">↓</button>
          </div>
          <div><div class="webcam-zoom" role="group" aria-label="Zoom"><button type="button" data-move="in" aria-label="Aumentar zoom">Zoom +</button><button type="button" data-move="out" aria-label="Reducir zoom">Zoom −</button></div><div class="webcam-position"></div></div>
          <div class="webcam-presets" role="group" aria-label="Vistas guardadas">${presets.map((preset, i) => `<button type="button" data-preset="${preset}">${labels[i]}</button>`).join('')}</div>
        </div>
      </div>
      <p class="webcam-status" role="status" aria-live="polite">Conectando…</p>
      <div class="webcam-links"><button type="button" data-refresh>Actualizar foto</button>${demo ? '<a href="/">Volver a Admira Live</a>' : '<a href="/demo" target="_blank" rel="noopener">Probar demo sin cámara</a>'}<a class="webcam-retry" href="/" hidden>Volver a entrar con Google</a></div>`;
    const image = root.querySelector('img'), status = root.querySelector('.webcam-status');
    const controls = [...root.querySelectorAll('[data-move], [data-preset]')];
    const placeholder = root.querySelector('.webcam-placeholder');
    const moves = {up: {dtilt: 18000}, down: {dtilt: -18000}, left: {dpan: -18000}, right: {dpan: 18000}, in: {dzoom: 25}, out: {dzoom: -25}};
    const say = (message, error = false) => { if (!alive) return; status.textContent = message; status.dataset.error = String(error); };
    const position = () => { root.querySelector('.webcam-position').textContent = `Pan ${(state.pan / 3600).toFixed(1)}° · Tilt ${(state.tilt / 3600).toFixed(1)}° · Zoom ${(state.zoom / 100).toFixed(2)}×`; };
    const enabled = () => controls.forEach(button => { button.disabled = busy || failed; });

    async function api(endpoint, body) {
      const response = await fetch(API + endpoint, {method: body ? 'POST' : 'GET', credentials: 'include', cache: 'no-store', signal: abort.signal, headers: body ? {'Content-Type': 'application/json', 'X-Fleet-CSRF': csrf} : {}, body: body ? JSON.stringify(body) : undefined});
      if (response.status === 401) { failed = true; enabled(); root.querySelector('.webcam-retry').hidden = false; throw new Error('La sesión ha caducado. Vuelve a entrar con Google.'); }
      if (!response.ok) throw new Error(response.status === 503 ? 'Webcam o acceso temporalmente no disponible.' : 'No se ha podido contactar con la cámara.');
      return endpoint === 'foto.jpg' ? response.blob() : response.json();
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
    async function photo() {
      if (!alive || refreshing || document.hidden || failed) return;
      refreshing = true;
      let nextURL;
      try {
        nextURL = demo ? simulatedPhoto() : URL.createObjectURL(await api('foto.jpg'));
        if (!alive) { if (!demo) URL.revokeObjectURL(nextURL); return; }
        // Decode before claiming a successful photo; broken JPEGs keep the old
        // timestamp and show a stale/error message.
        const decoded = new Image(); decoded.src = nextURL; await decoded.decode();
        if (!alive) { if (!demo) URL.revokeObjectURL(nextURL); return; }
        image.src = nextURL; placeholder.hidden = true;
        if (objectURL) URL.revokeObjectURL(objectURL);
        objectURL = demo ? null : nextURL;
        const now = new Date(), time = root.querySelector('time'); time.dateTime = now.toISOString(); time.textContent = now.toLocaleTimeString('es-ES');
        say(demo ? 'Demo activa · controles simulados.' : 'Foto recibida · actualización cada 5 s.');
      } catch (error) {
        if (nextURL && !demo) URL.revokeObjectURL(nextURL);
        if (alive) { placeholder.textContent = 'Sin foto nueva'; say(error.message + ' La hora indica la última foto recibida.', true); }
      } finally { refreshing = false; }
    }
    async function move(command) {
      if (busy || failed || !alive) return;
      busy = true; enabled(); say('Moviendo cámara…');
      try {
        if (demo) {
          if (command.preset) { selected = command.preset; state = [{pan: 0, tilt: 0, zoom: 100}, {pan: -120000, tilt: 0, zoom: 150}, {pan: 0, tilt: 0, zoom: 175}, {pan: 120000, tilt: 0, zoom: 150}][presets.indexOf(selected)]; }
          else { state.pan = clamp(state.pan + (command.dpan || 0), -522000, 522000); state.tilt = clamp(state.tilt + (command.dtilt || 0), -324000, 360000); state.zoom = clamp(state.zoom + (command.dzoom || 0), 100, 400); }
        } else { await api('mover', command); state = await api('estado'); }
        position(); say(demo ? 'Vista simulada actualizada.' : 'Movimiento confirmado. La siguiente foto mostrará la nueva vista (hasta 5 s).');
        // The camera caches JPEGs for up to 3 s. Do not label an immediate cached
        // frame as proof of the just-completed physical movement.
        clearTimeout(timer); timer = setTimeout(tick, demo ? 20 : 3500);
      } catch (error) { say(error.message + ' Comprueba la posición antes de repetir.', true); }
      finally { busy = false; if (alive) enabled(); }
    }
    async function tick() { clearTimeout(timer); if (!alive || document.hidden || failed || refreshing) return; await photo(); clearTimeout(timer); if (alive && !failed && !document.hidden) timer = setTimeout(tick, 5000); }
    root.addEventListener('click', event => {
      const button = event.target.closest('button'); if (!button || !root.contains(button)) return;
      if (button.dataset.move) move(moves[button.dataset.move]);
      else if (button.dataset.preset) move({preset: button.dataset.preset});
      else if (button.hasAttribute('data-refresh')) photo();
    });
    const visibility = () => { clearTimeout(timer); if (!document.hidden && alive && !failed) tick(); };
    document.addEventListener('visibilitychange', visibility);
    // The existing Analizar actions remove their overlay by several paths.
    // Observing disconnection stops polling and cancels in-flight requests.
    const observer = new MutationObserver(() => { if (!root.isConnected) destroy(); });
    observer.observe(document.body, {childList: true, subtree: true});
    function destroy() { alive = false; clearTimeout(timer); abort.abort(); observer.disconnect(); document.removeEventListener('visibilitychange', visibility); if (objectURL) URL.revokeObjectURL(objectURL); }
    (async () => {
      busy = true; enabled();
      try {
        if (!demo) {
          const response = await fetch('https://fleet.admira.live/api/auth/session', {credentials: 'include', cache: 'no-store', signal: abort.signal});
          if (!response.ok) throw new Error('Inicia sesión en Admira Live con Google para usar la webcam.');
          const session = await response.json(); csrf = session.csrf;
          state = await api('estado');
        }
        if (!alive) return;
        position(); await tick();
      } catch (error) { failed = true; placeholder.textContent = 'Webcam no disponible'; say(error.message, true); root.querySelector('.webcam-retry').hidden = demo; }
      finally { busy = false; if (alive) enabled(); }
    })();
    return destroy;
  }
})();
