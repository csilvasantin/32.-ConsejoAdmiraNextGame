/* Modo autónomo de las Leyendas en la home (Carlos, 24-nov-2026):
 *   https://www.admira.live/?autonomo=leyendas&tema=pan
 * Un clic desbloquea el audio (Chrome lo exige). La mesa de Leyendas muestra
 * el mapa de PortAventura en el centro y los cuatro consejeros hablan por
 * turnos, con voz (AdmiraVoces: TTS del Consejo, reserva speechSynthesis es-ES) y bocadillos, hasta el resumen.
 *
 * Audio (Carlos no oía al consejo): AdmiraVoces.speak() apunta primero a
 * /api/consejo/tts (fetch async) y solo si falla cae a speechSynthesis. Ese
 * fetch sale del gesto del clic, y Chrome bloquea tanto Audio.play() del TTS
 * como el speechSynthesis de reserva. Aquí no esperamos al TTS ni al backend
 * para la primera línea: en el clic se hace AudioContext.resume, un Audio
 * silencioso y speechSynthesis.speak() de la primera réplica del guion local.
 * El texto del bocadillo se pinta igual si la voz falla.
 * La barra va abajo: no tapa el menú superior ni el player.
 */
import { ANCLA } from '/escena0-lib.mjs?v=20261126-enrutado';
import {
  parseAutonomoUrl,
  siguienteTurno,
  resolverTurno,
  formatHoraInicio,
  etiquetaMision,
  textoTurno,
  etiquetaBarraLeyendas,
  urlPublicaBarraLeyendas,
  TIMEOUT_BACKEND_MS,
} from '/consejo-autonomo-leyendas.mjs?v=20261126-enrutado';

const modo = parseAutonomoUrl(typeof location !== 'undefined' ? new URLSearchParams(location.search) : null);

let idioma = 'es';
let silenciado = false;
let carlosEnMesa = true;
let bonomiEnMesa = false;
let ideaVisible = true;
if (typeof document === 'undefined' || !modo || !modo.soportado || !modo.guion) {
  /* no se monta: falta ?autonomo=leyendas */
} else {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();
}

function $(id) { return document.getElementById(id); }

function irALeyendas() {
  if (typeof window.setGen === 'function') window.setGen('leyendas');
  else if (typeof window.handleCliCommand === 'function') window.handleCliCommand('/leyendas');
  aplicarFotoMesa();
}

function mostrarMapa() {
  if (window.IdeaMesa && typeof window.IdeaMesa.aplicar === 'function') {
    if (modo.ideaId && typeof window.IdeaMesa.usar === 'function') window.IdeaMesa.usar(modo.ideaId);
    window.IdeaMesa.aplicar({ on: true, mesa: 'leyendas' });
  }
}

let audioCtx = null;
const SILENCIO_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';

function vozEsES() {
  try {
    const voces = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
    return voces.find((v) => /es[-_]ES/i.test(v.lang || ''))
      || voces.find((v) => /^es/i.test(v.lang || ''))
      || null;
  } catch (e) { return null; }
}

/** Se llama en el clic real, de forma síncrona, antes de cualquier await. */
function desbloquearAudioEnClic() {
  try {
    if (window.speechSynthesis) speechSynthesis.getVoices();
  } catch (e) {}
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended' && audioCtx.resume) audioCtx.resume();
      const buf = audioCtx.createBuffer(1, 1, 22050);
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(audioCtx.destination);
      src.start(0);
    }
  } catch (e) {}
  try {
    const a = new Audio(SILENCIO_WAV);
    a.volume = 0.01;
    const p = a.play();
    if (p && typeof p.catch === 'function') p.catch(function () {});
  } catch (e) {}
}

function langVoz() {
  return idioma === 'en' ? 'en-US' : 'es-ES';
}

function vozIdioma() {
  if (idioma !== 'en') return vozEsES();
  try {
    const voces = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
    return voces.find((v) => /en[-_]US/i.test(v.lang || ''))
      || voces.find((v) => /^en/i.test(v.lang || ''))
      || null;
  } catch (e) { return null; }
}

function hablarNativo(persona, texto, opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    const fin = () => { if (fin.done) return; fin.done = true; resolve(); };
    const dicho = String(texto || '').slice(0, 600);
    if (!dicho) { fin(); return; }
    if (silenciado) { setTimeout(fin, 600); return; }
    const lang = langVoz();
    // Misma vía que el Consejo / Escena 0 / pestaña Conversación: AdmiraVoces
    // (Grok TTS en /api/consejo/tts, y si falla, speechSynthesis es-ES).
    try {
      if (window.AdmiraVoces && typeof AdmiraVoces.speak === 'function') {
        const ok = AdmiraVoces.speak(persona, dicho, { onend: fin, onerror: fin, lang: lang });
        if (ok) { setTimeout(fin, Math.max(8000, dicho.length * 90 + 2000)); return; }
      }
    } catch (e) {}
    try {
      const s = window.speechSynthesis;
      if (!s || !window.SpeechSynthesisUtterance) { fin(); return; }
      if (opts.cancelar && s.speaking) {
        try { s.cancel(); } catch (e) {}
      }
      const u = new SpeechSynthesisUtterance(dicho);
      u.lang = lang;
      const v = vozIdioma();
      if (v) u.voice = v;
      u.onend = fin;
      u.onerror = fin;
      s.speak(u);
      setTimeout(fin, Math.max(8000, dicho.length * 90 + 2000));
    } catch (e) { fin(); }
  });
}

function cajaArte() {
  const root = document.querySelector('.council-image');
  const img = document.getElementById('council-img');
  if (!root || !img) return null;
  const sr = root.getBoundingClientRect();
  const ir = img.getBoundingClientRect();
  const nw = img.naturalWidth || 1280, nh = img.naturalHeight || 720;
  const sc = Math.min(ir.width / nw, ir.height / nh) || 1;
  const w = nw * sc, h = nh * sc;
  return { x: ir.left - sr.left + (ir.width - w) / 2, y: ir.top - sr.top + (ir.height - h) / 2, w, h, root };
}

function inyectarCssSubtitulos() {
  if ($('autonomo-globo-css')) return;
  const st = document.createElement('style');
  st.id = 'autonomo-globo-css';
  // z-index 40: por encima del mapa de la idea (#idea-mesa.grande es 28).
  // El subtítulo vive en la mesa, no tapa el menú ni el player.
  st.textContent = '#autonomo-globo{position:absolute;z-index:40;max-width:min(420px,46%);padding:10px 14px;background:#fff8e8;color:#1a140a;border:2px solid #c9a227;box-shadow:4px 4px 0 #000;font:500 15px/1.35 system-ui,sans-serif;transform:translate(-50%,-110%)}'
    + '#autonomo-globo[hidden]{display:none}'
    + '#autonomo-globo b{display:block;color:#7a5a12;font:700 11px/1.2 system-ui,sans-serif;letter-spacing:.05em;text-transform:uppercase;margin-bottom:4px}'
    + '#autonomo-globo p{margin:0}'
    + '#autonomo-subtitulo{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);z-index:40;max-width:min(760px,92%);padding:8px 14px;background:rgba(20,14,6,.94);color:#f3e6c4;border:2px solid #c9a227;box-shadow:4px 4px 0 #000;font:500 15px/1.35 system-ui,sans-serif;pointer-events:none}'
    + '#autonomo-subtitulo[hidden]{display:none}'
    + '#autonomo-subtitulo b{display:inline;color:#ffd75e;margin-right:.6em;font:700 11px/1.2 system-ui,sans-serif;letter-spacing:.05em;text-transform:uppercase}'
    + '#autonomo-subtitulo span{font:500 15px/1.35 system-ui,sans-serif}';
  document.head.appendChild(st);
}

function asegurarGlobo() {
  inyectarCssSubtitulos();
  const root = document.querySelector('.council-image') || document.body;
  let el = $('autonomo-globo');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'autonomo-globo';
  el.hidden = true;
  el.innerHTML = '<b id="autonomo-globo-nombre"></b><p id="autonomo-globo-texto"></p>';
  root.appendChild(el);
  return el;
}

function asegurarSubtitulo() {
  inyectarCssSubtitulos();
  const root = document.querySelector('.council-image') || document.body;
  let el = $('autonomo-subtitulo');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'autonomo-subtitulo';
  el.hidden = true;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = '<b id="autonomo-subtitulo-nombre"></b><span id="autonomo-subtitulo-texto"></span>';
  root.appendChild(el);
  return el;
}

function mostrarBocadillo(persona, texto) {
  // El texto se pinta siempre, aunque el verbo Conversación esté apagado y aunque la voz falle.
  const I = window.CouncilInterface;
  if (I && typeof I.show === 'function') {
    try { I.show(persona, '', texto, { messageId: 'autonomo-' + Date.now() }); } catch (e) {}
  }
  const bubble = document.getElementById('speech-bubble') || document.querySelector('.speech-bubble');
  if (bubble) {
    bubble.style.display = 'flex';
    bubble.style.zIndex = '40';
    bubble.hidden = false;
  }
  const sub = asegurarSubtitulo();
  if (sub) {
    const nb = $('autonomo-subtitulo-nombre');
    const tb = $('autonomo-subtitulo-texto');
    if (nb) nb.textContent = persona;
    if (tb) tb.textContent = texto;
    sub.hidden = false;
  }
  const el = asegurarGlobo();
  if (!el) return;
  $('autonomo-globo-nombre').textContent = persona;
  $('autonomo-globo-texto').textContent = texto;
  el.hidden = false;
  const box = cajaArte();
  const a = ANCLA.leyendas && ANCLA.leyendas[persona];
  if (box && a) {
    el.style.left = (box.x + (a.x / 100) * box.w) + 'px';
    el.style.top = (box.y + (a.y / 100) * box.h) + 'px';
  } else if (box) {
    el.style.left = (box.x + box.w / 2) + 'px';
    el.style.top = (box.y + box.h * 0.42) + 'px';
  }
}

async function askBackend(turno) {
  const hist = (askBackend.dichos || []).map((d) => d.persona + ': ' + d.texto).join('\n');
  const tema = (modo && (modo.titulo || modo.tema)) || 'AdmiraNeXT';
  const en = idioma === 'en';
  const prompt = (en
    ? ('You are ' + turno.persona + ' at the Legends table of the AdmiraNeXT council. You are talking about ' + tema + '. 1 or 2 sentences, in your style, in English, without introducing yourself. ')
    : ('Eres ' + turno.persona + ' en la mesa de Leyendas del Consejo AdmiraNeXT. Habláis sobre ' + tema + '. 1 o 2 frases, en tu estilo, en español de España, sin presentarte. '))
    + (turno.esResumen ? (en ? 'Close with a brief summary of what was said.\n' : 'Cierra con un resumen breve de lo dicho.\n') : '')
    + (hist ? (en ? 'So far:\n' : 'Hasta ahora:\n') + hist + '\n' : '')
    + (en ? 'Script idea (you may paraphrase, do not copy it verbatim if you have something to add): ' : 'Idea del guion (puedes parafrasearla, no la copies tal cual si tienes algo que añadir): ')
    + (en && turno.textoEn ? turno.textoEn : turno.texto);
  const ctrl = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? { signal: AbortSignal.timeout(TIMEOUT_BACKEND_MS) } : {};
  const r = await fetch('/api/council/ask-one', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: prompt, agent_name: turno.persona, generation: 'leyendas', report: false }),
    ...ctrl,
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  return (d.content || d.text || '').replace(/\*\*/g, '').trim();
}


function aviso(t) {
  const el = $('autonomo-leyendas-estado');
  if (el) el.textContent = t || '';
}

const IMG_CON_CARLOS = 'assets/council-leyendas.jpg?v=20261114-mesa4';
const IMG_SIN_CARLOS = '/assets/council-leyendas-sin-carlos.jpg?v=20261115-expertos';

function aplicarFotoMesa() {
  const img = document.getElementById('council-img');
  if (!img) return;
  const gen = document.querySelector('.council-image')?.getAttribute('data-generation') || 'leyendas';
  if (gen !== 'leyendas') return;
  img.src = carlosEnMesa ? IMG_CON_CARLOS : IMG_SIN_CARLOS;
}

function detenerVoz() {
  try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
  try { if (window.AdmiraVoces && typeof AdmiraVoces.cancel === 'function') AdmiraVoces.cancel(); } catch (e) {}
}

function actualizarPausaUi() {
  const btn = $('autonomo-leyendas-pausa');
  if (!btn) return;
  btn.textContent = pausado ? '▶ Reanudar' : '⏸ Pausar';
  btn.setAttribute('aria-pressed', pausado ? 'true' : 'false');
  btn.title = pausado ? 'Reanudar a los consejeros autónomos' : 'Pausar a los consejeros autónomos';
}

function montarPausaEnMenu() {
  if (!$('autonomo-pausa-css')) {
    const st = document.createElement('style');
    st.id = 'autonomo-pausa-css';
    st.textContent = '.yk-nav button.yk-nav-pausa{appearance:none;background:transparent;border:0;padding:0;margin:0;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;min-height:32px;font:inherit;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--yk-mut,#9a8a6a);cursor:pointer;white-space:nowrap;transition:.15s}.yk-nav button.yk-nav-pausa:hover{color:var(--yk-ink,#f3e6c4)}.yk-nav button.yk-nav-pausa[aria-pressed="true"]{color:var(--yk-brand,#ffd75e);font-weight:700}';
    document.head.appendChild(st);
  }
  if ($('autonomo-leyendas-pausa')) {
    actualizarPausaUi();
    return;
  }
  const nav = document.querySelector('.yk-bar .yk-nav') || document.querySelector('.yk-nav');
  if (!nav) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'autonomo-leyendas-pausa';
  btn.className = 'yk-nav-pausa';
  btn.addEventListener('click', alternarPausa);
  nav.appendChild(btn);
  actualizarPausaUi();
}

function esperarSiPausa() {
  if (!pausado || abortado) return Promise.resolve();
  return new Promise((resolve) => {
    esperaReanudar = () => { esperaReanudar = null; resolve(); };
  });
}

function pausar() {
  if (!enCurso || pausado) return;
  pausado = true;
  detenerVoz();
  actualizarPausaUi();
  aviso('Pausa · pulsa Reanudar en el menú para seguir');
}

function reanudar() {
  if (!pausado) return;
  pausado = false;
  actualizarPausaUi();
  if (esperaReanudar) esperaReanudar();
}

function alternarPausa() {
  if (pausado) reanudar();
  else if (enCurso) pausar();
  else aviso('Pulsa «Un clic para que hablen solas» y luego Pausar.');
}

function rotularOpciones() {
  const qc = $('opt-carlos');
  if (qc) qc.textContent = carlosEnMesa ? 'Quitar a Carlos de la mesa' : 'Sentar a Carlos en la mesa';
  const qi = $('opt-idioma');
  if (qi) qi.textContent = idioma === 'en' ? 'Hablar en español' : 'Hablar en inglés';
  const qs = $('opt-silencio');
  if (qs) qs.textContent = silenciado ? 'Activar las voces' : 'Silenciar el consejo';
  const qidea = $('opt-idea');
  if (qidea) qidea.textContent = ideaVisible ? 'Ocultar la idea' : 'Mostrar la idea';
  const qb = $('opt-bonomi');
  if (qb) qb.textContent = bonomiEnMesa ? 'Quitar a Carlo Bonomi' : 'Aparecer Carlo Bonomi';
}

function aplicarIdioma(n) {
  idioma = n === 'en' ? 'en' : 'es';
  rotularOpciones();
}

function aplicarCarlos(on) {
  carlosEnMesa = !!on;
  aplicarFotoMesa();
  rotularOpciones();
}

function aplicarBonomi(on) {
  bonomiEnMesa = !!on;
  if (typeof window.handleCliCommand === 'function') {
    window.handleCliCommand(bonomiEnMesa ? '/consejero carlo bonomi aparece' : '/consejero carlo bonomi fuera');
  }
  rotularOpciones();
}

function aplicarSilencio(on) {
  silenciado = !!on;
  if (silenciado) detenerVoz();
  rotularOpciones();
}

function aplicarIdea(on) {
  ideaVisible = !!on;
  if (window.IdeaMesa && typeof window.IdeaMesa.aplicar === 'function') {
    if (ideaVisible && modo.ideaId && typeof window.IdeaMesa.usar === 'function') window.IdeaMesa.usar(modo.ideaId);
    window.IdeaMesa.aplicar({ on: ideaVisible, mesa: 'leyendas' });
  }
  rotularOpciones();
}

function irACoetaneos() {
  if (typeof window.setGen === 'function') window.setGen('coetaneos');
}

function cerrarMenuOpciones() {
  const m = $('autonomo-leyendas-menu');
  if (m) m.hidden = true;
  const b = $('autonomo-leyendas-opciones');
  if (b) b.setAttribute('aria-expanded', 'false');
}

function alternarMenuOpciones() {
  const m = $('autonomo-leyendas-menu');
  const b = $('autonomo-leyendas-opciones');
  if (!m || !b) return;
  const abre = m.hidden;
  m.hidden = !abre;
  b.setAttribute('aria-expanded', abre ? 'true' : 'false');
}

function montar() {
  if ($('autonomo-leyendas')) return;
  document.documentElement.setAttribute('data-autonomo-leyendas', '');
  irALeyendas();
  try { if (window.speechSynthesis) speechSynthesis.getVoices(); } catch (e) {}
  const bar = document.createElement('div');
  bar.id = 'autonomo-leyendas';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Consejo autónomo de Leyendas');
  bar.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:9000;display:flex;flex-wrap:wrap;align-items:center;gap:8px;max-width:96vw;padding:8px 12px;background:rgba(20,14,6,.94);border:2px solid #c9a227;box-shadow:4px 4px 0 #000;font:600 13px/1.2 system-ui,sans-serif;color:#f3e6c4';
  const btn = 'appearance:none;background:#1a140a;color:#ffd75e;border:1px solid #c9a227;padding:10px 16px;font:700 14px/1 system-ui,sans-serif;cursor:pointer';
  const opt = 'appearance:none;display:block;width:100%;text-align:left;background:transparent;color:#f3e6c4;border:0;border-bottom:1px solid #3a2c12;padding:10px 12px;font:600 13px/1.3 system-ui,sans-serif;cursor:pointer';
  const marca = etiquetaBarraLeyendas(modo);
  const url = urlPublicaBarraLeyendas(modo);
  bar.innerHTML =
    '<b id="autonomo-leyendas-marca" style="color:#ffd75e;letter-spacing:.06em;text-transform:uppercase;font-size:11px">' + marca + '</b>'
    + '<button type="button" id="autonomo-leyendas-start" style="' + btn + '">▶ Un clic para que hablen solas</button>'
    + '<span id="autonomo-leyendas-hora" style="color:#ffd75e;font-weight:600"></span>'
    + '<span id="autonomo-leyendas-estado" aria-live="polite" style="color:#cbb98a;font-weight:500;max-width:420px">Pulsa el botón para desbloquear el audio y arrancar. El mapa se pone en el centro de la mesa.</span>'
    + '<div style="position:relative">'
    + '<button type="button" id="autonomo-leyendas-opciones" aria-expanded="false" aria-haspopup="true" aria-controls="autonomo-leyendas-menu" style="' + btn + '">⚙ Opciones</button>'
    + '<div id="autonomo-leyendas-menu" hidden role="menu" style="position:absolute;right:0;bottom:100%;margin-bottom:6px;min-width:260px;background:#1a140a;border:2px solid #c9a227;box-shadow:4px 4px 0 #000;z-index:9001">'
    + '<button type="button" role="menuitem" id="opt-carlos" style="' + opt + '"></button>'
    + '<button type="button" role="menuitem" id="opt-idioma" style="' + opt + '"></button>'
    + '<button type="button" role="menuitem" id="opt-silencio" style="' + opt + '"></button>'
    + '<button type="button" role="menuitem" id="opt-idea" style="' + opt + '"></button>'
    + '<button type="button" role="menuitem" id="opt-bonomi" style="' + opt + '"></button>'
    + '<button type="button" role="menuitem" id="opt-coetaneos" style="' + opt + '">Ir a Coetáneos</button>'
    + '</div></div>'
    + '<a href="' + url + '" style="color:#cbb98a;font-size:12px" id="autonomo-leyendas-url">' + url + '</a>';
  document.body.appendChild(bar);
  $('autonomo-leyendas-start').addEventListener('click', arrancar);
  $('autonomo-leyendas-opciones').addEventListener('click', (e) => { e.stopPropagation(); alternarMenuOpciones(); });
  $('opt-carlos').addEventListener('click', () => aplicarCarlos(!carlosEnMesa));
  $('opt-idioma').addEventListener('click', () => aplicarIdioma(idioma === 'en' ? 'es' : 'en'));
  $('opt-silencio').addEventListener('click', () => aplicarSilencio(!silenciado));
  $('opt-idea').addEventListener('click', () => aplicarIdea(!ideaVisible));
  $('opt-bonomi').addEventListener('click', () => aplicarBonomi(!bonomiEnMesa));
  $('opt-coetaneos').addEventListener('click', irACoetaneos);
  document.addEventListener('click', (e) => {
    const menu = $('autonomo-leyendas-menu');
    if (!menu || menu.hidden) return;
    if (bar.contains(e.target)) return;
    cerrarMenuOpciones();
  });
  rotularOpciones();
  montarPausaEnMenu();
  if (!document.querySelector('.yk-nav')) {
    const mo = new MutationObserver(() => {
      if (document.querySelector('.yk-nav')) { montarPausaEnMenu(); mo.disconnect(); }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
  window.addEventListener('resize', () => {
    const n = $('autonomo-globo-nombre');
    if (n && n.textContent && $('autonomo-globo') && !$('autonomo-globo').hidden) {
      mostrarBocadillo(n.textContent, $('autonomo-globo-texto').textContent);
    }
  });
}

let enCurso = false;
let abortado = false;
let pausado = false;
let esperaReanudar = null;

function arrancar() {
  if (enCurso) return;
  enCurso = true;
  abortado = false;
  pausado = false;
  actualizarPausaUi();
  const guion = modo.guion;
  const primero = siguienteTurno(guion, 0);
  const texto0 = textoTurno(primero, idioma);

  // Síncrono, dentro del clic: desbloqueo + primera línea del guion. Sin await.
  desbloquearAudioEnClic();
  irALeyendas();
  mostrarMapa();
  ideaVisible = true;
  rotularOpciones();
  mostrarBocadillo(primero.persona, texto0);
  const hablaPrimero = hablarNativo(primero.persona, texto0, { cancelar: false });

  const inicio = new Date();
  const hora = formatHoraInicio(inicio);
  const h = $('autonomo-leyendas-hora');
  if (h) h.textContent = etiquetaMision(hora, idioma);
  const start = $('autonomo-leyendas-start');
  if (start) { start.textContent = '⏹ En curso'; start.disabled = true; }
  aviso(etiquetaMision(hora, idioma) + ' · ' + primero.persona + ' habla · 1/' + primero.total);
  askBackend.dichos = [{ persona: primero.persona, texto: texto0 }];

  seguirResto(guion, hablaPrimero, hora, start);
}

async function seguirResto(guion, hablaPrimero, hora, start) {
  try { await hablaPrimero; } catch (e) {}
  await new Promise((res) => setTimeout(res, 600));
  for (let i = 1; ; i++) {
    if (abortado) return;
    await esperarSiPausa();
    if (abortado) return;
    const t = siguienteTurno(guion, i);
    if (t.fin) break;
    aviso((t.esResumen ? 'Resumen · ' : '') + t.persona + ' · ' + (t.i + 1) + '/' + t.total);
    const r = await resolverTurno(t, { ask: askBackend, timeoutMs: TIMEOUT_BACKEND_MS, idioma: idioma });
    if (abortado) return;
    await esperarSiPausa();
    if (abortado) return;
    mostrarBocadillo(r.persona, r.texto);
    askBackend.dichos.push({ persona: r.persona, texto: r.texto });
    aviso((r.esResumen ? 'Resumen · ' : '') + r.persona + ' habla · ' + (t.i + 1) + '/' + t.total + (r.fuente === 'guion' ? ' · guion local' : ''));
    await hablarNativo(r.persona, r.texto, { cancelar: true });
    await new Promise((res) => setTimeout(res, 600));
  }
  aviso('Fin · ' + etiquetaMision(hora, idioma) + ' · una sala, una sola historia, un solo reloj.');
  if (start) { start.textContent = '↻ Volver a oír'; start.disabled = false; start.onclick = () => { enCurso = false; arrancar(); }; }
}

window.ConsejoAutonomoLeyendas = { modo, arrancar, desbloquearAudioEnClic, hablarNativo, pausar, reanudar, alternarPausa };
