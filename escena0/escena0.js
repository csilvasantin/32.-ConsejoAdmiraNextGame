import {
  parseMesa, MESAS, ROLES, IMG, ANCLA, TEMA_DEFECTO, promptDe, canalVacio,
  marcarPresente, publicState, reservar, decir, siguienteSpeaker,
} from '/escena0-lib.mjs';
import {
  parseGuion, parseCabecera, CABECERA_POS, textoTurno, bolsasGuion, promptGuion, mesaDeGuion, msLectura,
} from '/escena0-guion.mjs?v=20261114-cartoon';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
// Demo del Consejo (Lucas, 14-11-2026): ?flujo=pan → Leyendas, Coetáneos y la presentación
// consejero vs consejero en una sola pantalla. ?guion=pan en las dos mesas usa el mismo relato.
// ?cabecera=bonomi sienta a Carlo Bonomi en la cabecera de los Coetáneos.
const flujo = parseGuion(q.get('flujo'));
const guion = flujo || parseGuion(q.get('guion'));
const cabecera = parseCabecera(q.get('cabecera'));
const conIA = q.get('ia') === '1';
const mesa = flujo ? 'leyendas' : parseMesa(q.get('mesa') || q.get('gen') || q.get('generation'));
let mesaVista = mesa;
const silencio = q.get('silencio') === '1' || q.get('mute') === '1';
const demo = q.get('demo') === '1';
const temaQ = (q.get('tema') || '').trim() || (guion ? guion.tema : '');
const API = '/api/consejo/escena0';
const COUNCIL_API_URLS = location.protocol === 'https:'
  ? ['https://macmini.tail48b61c.ts.net/council', 'https://three2-consejoadmiranextgame.onrender.com']
  : ['http://localhost:8420', 'https://macmini.tail48b61c.ts.net/council', 'https://three2-consejoadmiranextgame.onrender.com'];

const DEMO = {
  'Steve Jobs': ['El producto se entiende en un vistazo, o no es producto.', 'Que la otra mesa nos diga qué fricción ven ellos, y lo cortamos.'],
  'Steve Wozniak': ['Si no se puede medir en el Mac, es cuento.', 'Yo dejo un latido claro: qué está vivo y qué no.'],
  'Walt Disney': ['La sala tiene que emocionar: dos mesas, una sola historia.', 'Que se vea el carácter de cada consejero, no un panel más.'],
  'George Lucas': ['El arco es simple: Leyendas y Coetáneos se contestan de verdad.', 'Si el público no sigue el hilo, el guion está mal cortado.'],
  'Elon Musk': ['Menos ceremonia, más iteración. ¿Qué desplegamos hoy?', 'Si la otra mesa propone foco, yo lo llevo a producción esta semana.'],
  'Jensen Huang': ['La inferencia tiene que ser barata y presente, no una demo.', 'Cuando Leyendas hablen de oficio, nosotros ponemos el acelerador.'],
};

if (guion) Object.assign(DEMO, bolsasGuion(guion, cabecera));

let local = demo || !!flujo; // demo=1 y el flujo de una pantalla no escriben en el canal de la sala
let docLocal = canalVacio(temaQ);
let enCurso = false;
let ocupado = false;
let activeApiUrl = null;
let demoIdx = {};
let lastSeenId = null;
let hideCursorT = 0;
let ticking = false;

function estado(t) { const el = $('estado'); if (el) el.textContent = t || ''; }
function nombreMesa(m) { return m === 'coetaneos' ? 'Coetáneos' : 'Leyendas'; }

function cajaArte() {
  const stage = $('stage'); const img = $('mesa-img');
  if (!stage || !img) return null;
  const sr = stage.getBoundingClientRect();
  const ir = img.getBoundingClientRect();
  const nw = img.naturalWidth || 1280, nh = img.naturalHeight || 720;
  const s = Math.min(ir.width / nw, ir.height / nh);
  const w = nw * s, h = nh * s;
  const x = ir.left - sr.left + (ir.width - w) / 2;
  const y = ir.top - sr.top + (ir.height - h) / 2;
  return { x, y, w, h };
}

function colocarGlobo(persona) {
  const g = $('globo'); const ancla = (ANCLA[mesaVista] || {})[persona];
  const box = cajaArte();
  if (!g || !ancla || !box) return;
  g.style.left = (box.x + (ancla.x / 100) * box.w) + 'px';
  g.style.top = (box.y + (ancla.y / 100) * box.h) + 'px';
  // Que el globo no se salga por los lados (Elon y Lucas están en los bordes del arte).
  const r = g.getBoundingClientRect();
  const vw = window.innerWidth || document.documentElement.clientWidth;
  if (r.left < 8) g.style.left = (parseFloat(g.style.left) + 8 - r.left) + 'px';
  else if (r.right > vw - 8) g.style.left = (parseFloat(g.style.left) - (r.right - vw + 8)) + 'px';
}

// Cabecera de los Coetáneos: retrato en la silla del fondo + placa dorada (sin cargo).
function colocarCabecera() {
  const el = $('cabecera');
  if (!el) return;
  const box = cajaArte();
  if (!cabecera || mesaVista !== CABECERA_POS.mesa || !box) { el.hidden = true; return; }
  el.hidden = false;
  el.style.left = (box.x + CABECERA_POS.x / 100 * box.w) + 'px';
  el.style.top = (box.y + CABECERA_POS.y / 100 * box.h) + 'px';
  el.style.width = (CABECERA_POS.w / 100 * box.w) + 'px';
  el.style.height = (CABECERA_POS.h / 100 * box.h) + 'px';
}

function montarCabecera() {
  const el = $('cabecera');
  if (!el || !cabecera) return;
  $('cabecera-img').src = cabecera.foto;
  $('cabecera-img').alt = cabecera.nombre + ' en la cabecera de la mesa';
  $('cabecera-placa').textContent = cabecera.nombre;
  colocarCabecera();
}

function verMesa(m) {
  mesaVista = m;
  document.body.setAttribute('data-mesa', m);
  const img = $('mesa-img');
  if (img.getAttribute('data-mesa') !== m) {
    img.setAttribute('data-mesa', m);
    img.src = IMG[m];
    img.alt = 'Mesa de ' + nombreMesa(m) + ' del Consejo AdmiraNeXT';
  }
  colocarCabecera();
}

function mostrarGlobo(persona, texto, pensando) {
  const g = $('globo');
  $('globo-nombre').textContent = persona + (ROLES[persona] ? ' · ' + ROLES[persona] : '');
  $('globo-texto').textContent = texto || (pensando ? 'pensando…' : '');
  g.classList.toggle('pensando', !!pensando);
  g.hidden = false;
  colocarGlobo(persona);
}

function pintarEscucha(st) {
  const bar = $('barra-escucha');
  const turnos = (st && st.turnos) || [];
  const last = turnos[turnos.length - 1];
  if (last && last.mesa && last.mesa !== mesa) {
    bar.hidden = false;
    bar.innerHTML = '<b>' + last.persona + ' · ' + nombreMesa(last.mesa) + '</b> — ' + escapeHtml(last.texto);
  } else if (st && st.cruce) {
    bar.hidden = false;
    bar.innerHTML = 'Cruce activo: esta mesa responde a la otra pantalla.';
  } else {
    bar.hidden = true;
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function api(method, body) {
  const opt = { method, headers: { accept: 'application/json' }, cache: 'no-store' };
  if (body) { opt.headers['content-type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch(API, opt);
  let d = null;
  try { d = await r.json(); } catch (e) { d = null; }
  if (r.status === 503 && d && d.local) throw Object.assign(new Error('local'), { local: true, data: d });
  if (!d || !d.ok) {
    const err = new Error((d && d.error) || ('HTTP ' + r.status));
    err.status = r.status; err.data = d; throw err;
  }
  return d;
}

async function latido() {
  if (local) {
    docLocal = marcarPresente(docLocal, mesa, Date.now());
    return publicState(docLocal, Date.now());
  }
  try {
    return await api('POST', { accion: 'latido', mesa });
  } catch (e) {
    if (e.local || e.status === 503) {
      local = true;
      docLocal = marcarPresente(docLocal, mesa, Date.now());
      estado('Sin canal compartido: esta mesa habla entre ella.');
      return publicState(docLocal, Date.now());
    }
    throw e;
  }
}

async function pedirReservar(persona) {
  if (local) {
    const r = reservar(docLocal, mesa, persona, Date.now());
    if (!r.ok) { const err = new Error(r.error); err.status = 409; err.data = publicState(r.doc, Date.now()); throw err; }
    docLocal = r.doc;
    return publicState(docLocal, Date.now());
  }
  return api('POST', { accion: 'reservar', mesa, persona });
}

async function publicar(persona, texto) {
  if (local) {
    const r = decir(docLocal, { mesa, persona, texto }, Date.now());
    if (!r.ok) throw new Error(r.error);
    docLocal = r.doc;
    return { ...publicState(docLocal, Date.now()), turno: r.turno };
  }
  return api('POST', { accion: 'decir', mesa, persona, texto });
}

async function leer() {
  if (local) return publicState(docLocal, Date.now());
  try { return await api('GET'); } catch (e) {
    if (e.local || e.status === 503) {
      local = true;
      return publicState(marcarPresente(docLocal, mesa, Date.now()), Date.now());
    }
    throw e;
  }
}

async function askConsejero(persona, message) {
  if (demo) {
    const bag = DEMO[persona] || ['Seguimos.'];
    const i = demoIdx[persona] || 0;
    demoIdx[persona] = i + 1;
    await new Promise((r) => setTimeout(r, 400));
    return bag[i % bag.length];
  }
  const urls = activeApiUrl ? [activeApiUrl].concat(COUNCIL_API_URLS.filter((u) => u !== activeApiUrl)) : COUNCIL_API_URLS.slice();
  let lastErr = null;
  for (const base of urls) {
    for (let i = 0; i < 2; i++) {
      try {
        const r = await fetch(base + '/api/council/ask-one', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Council-Token': '' },
          body: JSON.stringify({
            message,
            agent_name: ROLES[persona] || persona,
            generation: mesaDeSafe(persona),
            llm: 'grok-4.6',
            report: false,
          }),
          signal: (window.AbortSignal && AbortSignal.timeout) ? AbortSignal.timeout(55000) : undefined,
        });
        if (r.status === 429) { await new Promise((res) => setTimeout(res, 4000)); continue; }
        if (!r.ok) { lastErr = new Error('HTTP ' + r.status); break; }
        const d = await r.json();
        activeApiUrl = base;
        const text = (d.content || d.text || '').replace(/\*\*/g, '').replace(/^#+\s*/gm, '').replace(/\n{2,}/g, '\n').trim();
        if (text) return text;
        lastErr = new Error('vacío');
      } catch (e) { lastErr = e; break; }
    }
  }
  throw lastErr || new Error('sin backend');
}

function mesaDeSafe(persona) {
  return (MESAS.leyendas.includes(persona) ? 'leyendas' : 'coetaneos');
}

function hablar(persona, texto) {
  return new Promise((resolve) => {
    if (silencio || !texto) { resolve(); return; }
    if (window.AdmiraVoces && typeof AdmiraVoces.speak === 'function') {
      const ok = AdmiraVoces.speak(persona, String(texto).slice(0, 600), { onend: resolve, onerror: resolve });
      if (!ok) resolve();
      return;
    }
    resolve();
  });
}

async function unTurno(st) {
  const sig = st && st.siguiente;
  if (!sig || sig.mesa !== mesa || ocupado) return;
  ocupado = true;
  try {
    await pedirReservar(sig.persona);
    mostrarGlobo(sig.persona, '', true);
    estado(sig.persona + ' pensando…');
    const snap = local ? publicState(docLocal, Date.now()) : st;
    const hist = { tema: (snap && snap.tema) || temaQ || TEMA_DEFECTO, turnos: (snap && snap.turnos) || [] };
    let texto;
    try {
      texto = await askConsejero(sig.persona, promptDe(sig.persona, hist));
    } catch (e) {
      estado('Sin respuesta de ' + sig.persona + ' (' + (e.message || e) + '). Paso.');
      texto = 'Dejadme encajar lo que acabáis de decir; sigo con vosotros.';
    }
    const pub = await publicar(sig.persona, texto);
    const dicho = (pub && pub.turno && pub.turno.texto) || texto;
    mostrarGlobo(sig.persona, dicho, false);
    lastSeenId = pub && pub.turno && pub.turno.id;
    pintarEscucha(pub);
    estado(sig.persona + ' habla');
    await hablar(sig.persona, dicho);
    await new Promise((r) => setTimeout(r, 800));
  } catch (e) {
    if (e.status !== 409) estado(e.message || String(e));
  } finally {
    ocupado = false;
  }
}

async function tick() {
  if (!enCurso || ticking) return;
  ticking = true;
  try {
    let st;
    try { st = await latido(); } catch (e) { estado(e.message || String(e)); return; }
    pintarEscucha(st);
    const last = (st.turnos || []).slice(-1)[0];
    if (last && last.id !== lastSeenId) {
      lastSeenId = last.id;
      if (last.mesa === mesa) mostrarGlobo(last.persona, last.texto, false);
    }
    const cruce = st.cruce ? ' · cruce con la otra mesa' : ' · solo esta mesa';
    if (!ocupado) estado((st.siguiente ? ('Siguiente: ' + st.siguiente.persona) : 'Esperando turno') + cruce);
    if (st.siguiente && st.siguiente.mesa === mesa) await unTurno(st);
  } finally {
    ticking = false;
  }
}

function entrarFullscreen() {
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  if (fn) fn.call(el).catch(() => {});
}

function toggleFullscreen() {
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else entrarFullscreen();
}

function desbloquearVoz() {
  try {
    if (window.speechSynthesis) speechSynthesis.getVoices();
  } catch (e) {}
}

async function empezar() {
  if (enCurso) { entrarFullscreen(); return; }
  enCurso = true;
  document.body.classList.add('en-curso');
  $('gesto').hidden = true;
  $('hud').hidden = false;
  desbloquearVoz();
  entrarFullscreen();
  if (!local && temaQ) {
    try { await api('POST', { accion: 'tema', tema: temaQ }); } catch (e) {}
  } else if (temaQ) {
    docLocal.tema = temaQ;
  }
  estado('Arrancando…');
  await tick();
  setInterval(() => { if (enCurso) tick(); }, 2000);
}

function activarMesa() {
  verMesa(mesa);
  montarCabecera();
  const img = $('mesa-img');
  $('gesto-mesa').textContent = 'Mesa de ' + nombreMesa(mesa);
  $('hud-mesa').textContent = 'Escena 0 · ' + nombreMesa(mesa);
  $('gesto').hidden = false;
  $('elige').hidden = true;
  $('hud').hidden = false;
  img.addEventListener('load', () => {
    colocarCabecera();
    const g = $('globo');
    if (g && !g.hidden) {
      const n = $('globo-nombre').textContent.split(' · ')[0];
      if (n) colocarGlobo(n);
    }
  });
}

function idleCursor() {
  const wake = () => {
    document.body.classList.remove('kiosk-idle');
    clearTimeout(hideCursorT);
    hideCursorT = setTimeout(() => document.body.classList.add('kiosk-idle'), 4000);
  };
  ['mousemove', 'keydown', 'pointerdown'].forEach((ev) => document.addEventListener(ev, wake));
  wake();
}

function arrancar() {
  fetch('/version.json', { cache: 'no-store' }).then((r) => r.json()).then((v) => {
    if (v && v.version) $('sello').textContent = v.version + (v.signature ? ' · ' + v.signature : '');
  }).catch(() => {});
  if (!mesa) { $('elige').hidden = false; return; }
  activarMesa();
  if (flujo) { montarFlujo(); return; }
  idleCursor();
  $('btn-gesto').addEventListener('click', empezar);
  $('btn-start').addEventListener('click', empezar);
  $('btn-fs').addEventListener('click', toggleFullscreen);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') { e.preventDefault(); if (!enCurso) empezar(); else toggleFullscreen(); }
    if (e.key === ' ' && !enCurso) { e.preventDefault(); empezar(); }
  });
  document.addEventListener('fullscreenchange', () => {
    document.body.classList.toggle('fs', !!(document.fullscreenElement || document.webkitFullscreenElement));
  });
  window.addEventListener('resize', () => {
    colocarCabecera();
    const n = $('globo-nombre').textContent.split(' · ')[0];
    if (n && !$('globo').hidden) colocarGlobo(n);
  });
}

// ── Flujo de demo en una pantalla (?flujo=pan) ──────────────────────────────
// Paso 1: Consejo de Leyendas · Paso 2: Coetáneos (con la cabecera) · Paso 3: la presentación
// consejero vs consejero, mesa contra mesa: la imagen cambia a la mesa de quien habla.
// → / espacio: siguiente · ←: anterior · P: pausa. ?silencio=1 sin voz · ?ia=1 cada consejero
// dice la idea del guion con sus palabras (ask-one); si no responde, dice la línea del guion.
const LEYENDAS_TXT = 'Steve Jobs · Steve Wozniak · Warren Buffett · Walt Disney · Dieter Rams · George Lucas';
const COETANEOS_TXT = 'Elon Musk · Jensen Huang · Mira Murati · Jony Ive · John Lasseter · Ryan Reynolds';
let pasos = [];
let paso = -1;
let pausa = false;
let token = 0;
let dichos = [];

function construirPasos() {
  const p = [
    { tipo: 'mesa', mesa: 'leyendas', titulo: '1 · Consejo de Leyendas', sub: LEYENDAS_TXT, ms: 8000 },
    { tipo: 'mesa', mesa: 'coetaneos', titulo: '2 · Consejo de Coetáneos', sub: COETANEOS_TXT + (cabecera ? ' — en la cabecera, ' + cabecera.nombre : ''), ms: 9000 },
    { tipo: 'rotulo', mesa: 'coetaneos', titulo: '3 · Conversación · consejero vs consejero', sub: guion.titulo, ms: 5000 },
  ];
  guion.turnos.forEach((t, i) => p.push({ tipo: 'turno', i, persona: t.persona, mesa: mesaDeGuion(t.persona) }));
  p.push({ tipo: 'rotulo', mesa: 'coetaneos', titulo: 'PortAventuraNeXT', sub: guion.cierre, ms: 0 });
  return p;
}

function rotulo(titulo, sub) {
  const r = $('rotulo');
  if (!titulo) { r.hidden = true; return; }
  $('rotulo-titulo').textContent = titulo;
  $('rotulo-sub').textContent = sub || '';
  r.hidden = false;
}

function esperar(ms, t) {
  return new Promise((res) => setTimeout(() => res(t === token), ms));
}

function hablarFlujo(persona, texto) {
  return new Promise((resolve) => {
    if (silencio || !texto || !(window.AdmiraVoces && typeof AdmiraVoces.speak === 'function')) {
      setTimeout(resolve, msLectura(texto)); return;
    }
    let hecho = false;
    const fin = () => { if (!hecho) { hecho = true; resolve(); } };
    const ok = AdmiraVoces.speak(persona, String(texto).slice(0, 600), { onend: fin, onerror: fin });
    if (!ok) { setTimeout(fin, msLectura(texto)); return; }
    setTimeout(fin, msLectura(texto) + 20000); // red de seguridad si la voz no avisa
  });
}

async function textoDe(st) {
  const linea = textoTurno(guion.turnos[st.i], cabecera);
  if (!conIA) return linea;
  try {
    const t = await askConsejero(st.persona, promptGuion(guion, st.i, cabecera, dichos));
    return t || linea;
  } catch (e) {
    return linea;
  }
}

async function ejecutarPaso(n) {
  const t = ++token;
  try { if (window.AdmiraVoces && AdmiraVoces.stop) AdmiraVoces.stop(); } catch (e) {}
  paso = Math.max(0, Math.min(n, pasos.length - 1));
  const st = pasos[paso];
  $('globo').hidden = true;
  verMesa(st.mesa);
  $('hud-mesa').textContent = 'Demo del Consejo · ' + (paso + 1) + '/' + pasos.length;
  if (st.tipo === 'mesa' || st.tipo === 'rotulo') {
    rotulo(st.titulo, st.sub);
    estado(st.tipo === 'mesa' ? 'Mesa de ' + nombreMesa(st.mesa) : '');
    if (!st.ms) { estado('Fin · ← para volver'); return; }
    if (!(await esperar(st.ms, t))) return;
  } else {
    rotulo('', '');
    if (conIA) mostrarGlobo(st.persona, '', true);
    estado(st.persona + (conIA ? ' pensando…' : ' habla'));
    const texto = await textoDe(st);
    if (t !== token) return;
    dichos = dichos.filter((d) => d.paso !== paso).concat([{ paso, persona: st.persona, texto }]);
    mostrarGlobo(st.persona, texto, false);
    pintarBarraFlujo(st);
    estado(st.persona + ' habla · ' + (st.i + 1) + '/' + guion.turnos.length);
    await hablarFlujo(st.persona, texto);
    if (t !== token) return;
    if (!(await esperar(900, t))) return;
  }
  while (pausa && t === token) await esperar(300, t);
  if (t === token && paso < pasos.length - 1) ejecutarPaso(paso + 1);
}

function pintarBarraFlujo(st) {
  const bar = $('barra-escucha');
  const otra = st.mesa === 'leyendas' ? 'coetaneos' : 'leyendas';
  const prev = [...dichos].reverse().find((d) => d.paso < paso && mesaDeGuion(d.persona) === otra);
  if (!prev) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = '<b>' + escapeHtml(prev.persona) + ' · ' + nombreMesa(otra) + '</b> — ' + escapeHtml(prev.texto);
}

function montarFlujo() {
  pasos = construirPasos();
  document.body.classList.add('flujo');
  document.title = 'Demo del Consejo · ' + guion.titulo;
  $('gesto').querySelector('h1').textContent = 'Demo del Consejo';
  $('gesto-mesa').textContent = 'Leyendas → Coetáneos' + (cabecera ? ' (' + cabecera.nombre + ' en la cabecera)' : '') + ' → ' + guion.titulo;
  $('btn-gesto').textContent = 'Pantalla completa y empezar';
  $('btn-start').textContent = 'Empezar demo';
  $('hud-mesa').textContent = 'Demo del Consejo';
  const go = () => {
    if (enCurso) { entrarFullscreen(); return; }
    enCurso = true;
    document.body.classList.add('en-curso');
    $('gesto').hidden = true;
    desbloquearVoz();
    entrarFullscreen();
    // ?desde=N: empieza en el paso N tras el gesto (1 Leyendas · 2 Coetáneos · 3 conversación).
    const dq = parseInt(q.get('desde') || '', 10);
    ejecutarPaso(dq > 0 ? dq - 1 : 0);
  };
  $('btn-gesto').addEventListener('click', go);
  $('btn-start').addEventListener('click', go);
  $('btn-fs').addEventListener('click', toggleFullscreen);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') { e.preventDefault(); if (!enCurso) go(); else toggleFullscreen(); return; }
    if (!enCurso) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); go(); } return; }
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); pausa = false; ejecutarPaso(paso + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); pausa = false; ejecutarPaso(paso - 1); }
    if (e.key === 'p' || e.key === 'P') { pausa = !pausa; estado(pausa ? 'En pausa (P para seguir)' : 'Seguimos'); }
  });
  document.addEventListener('fullscreenchange', () => {
    document.body.classList.toggle('fs', !!(document.fullscreenElement || document.webkitFullscreenElement));
  });
  window.addEventListener('resize', () => {
    colocarCabecera();
    const n = $('globo-nombre').textContent.split(' · ')[0];
    if (n && !$('globo').hidden) colocarGlobo(n);
  });
  idleCursor();
  // Arranque directo para capturas y kioscos ya desbloqueados: ?paso=N (1 = Leyendas).
  const pq = parseInt(q.get('paso') || '', 10);
  if (pq > 0) {
    enCurso = true;
    document.body.classList.add('en-curso');
    $('gesto').hidden = true;
    ejecutarPaso(pq - 1);
  }
}

arrancar();
