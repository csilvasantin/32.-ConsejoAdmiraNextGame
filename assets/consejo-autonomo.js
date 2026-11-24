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
import { ANCLA } from '/escena0-lib.mjs?v=20261124-autonomo';
import {
  parseAutonomoUrl,
  siguienteTurno,
  resolverTurno,
  formatHoraInicio,
  etiquetaMision,
  textoTurno,
  URL_PUBLICA_HOME,
  TIMEOUT_BACKEND_MS,
} from '/consejo-autonomo-leyendas.mjs?v=20261124-autonomo';

const modo = parseAutonomoUrl(typeof location !== 'undefined' ? new URLSearchParams(location.search) : null);
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
}

function mostrarMapa() {
  if (window.IdeaMesa && typeof window.IdeaMesa.aplicar === 'function') {
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

function hablarNativo(persona, texto, opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    const fin = () => { if (fin.done) return; fin.done = true; resolve(); };
    const dicho = String(texto || '').slice(0, 600);
    if (!dicho) { fin(); return; }
    // Misma vía que el Consejo / Escena 0 / pestaña Conversación: AdmiraVoces
    // (Grok TTS en /api/consejo/tts, y si falla, speechSynthesis es-ES).
    try {
      if (window.AdmiraVoces && typeof AdmiraVoces.speak === 'function') {
        const ok = AdmiraVoces.speak(persona, dicho, { onend: fin, onerror: fin, lang: 'es-ES' });
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
      u.lang = 'es-ES';
      const v = vozEsES();
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

function asegurarGlobo() {
  const root = document.querySelector('.council-image');
  if (!root) return null;
  let el = $('autonomo-globo');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'autonomo-globo';
  el.hidden = true;
  el.innerHTML = '<b id="autonomo-globo-nombre"></b><p id="autonomo-globo-texto"></p>';
  root.appendChild(el);
  if (!$('autonomo-globo-css')) {
    const st = document.createElement('style');
    st.id = 'autonomo-globo-css';
    st.textContent = '#autonomo-globo{position:absolute;z-index:20;max-width:min(420px,46%);padding:10px 14px;background:#fff8e8;color:#1a140a;border:2px solid #c9a227;box-shadow:4px 4px 0 #000;font:500 15px/1.35 system-ui,sans-serif;transform:translate(-50%,-110%)}'
      + '#autonomo-globo[hidden]{display:none}'
      + '#autonomo-globo b{display:block;color:#7a5a12;font:700 11px/1.2 system-ui,sans-serif;letter-spacing:.05em;text-transform:uppercase;margin-bottom:4px}'
      + '#autonomo-globo p{margin:0}';
    document.head.appendChild(st);
  }
  return el;
}

function mostrarBocadillo(persona, texto) {
  const I = window.CouncilInterface;
  if (I && typeof I.show === 'function') {
    try { I.show(persona, '', texto, { messageId: 'autonomo-' + Date.now() }); } catch (e) {}
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
  const prompt = 'Eres ' + turno.persona + ' en la mesa de Leyendas del Consejo AdmiraNeXT. '
    + 'Habláis sobre PortAventuraNeXT, «El parque que se cuenta solo». '
    + '1 o 2 frases, en tu estilo, en español de España, sin presentarte. '
    + (turno.esResumen ? 'Cierra con un resumen breve de lo dicho.\n' : '')
    + (hist ? 'Hasta ahora:\n' + hist + '\n' : '')
    + 'Idea del guion (puedes parafrasearla, no la copies tal cual si tienes algo que añadir): ' + turno.texto;
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
  bar.innerHTML =
    '<b style="color:#ffd75e;letter-spacing:.06em;text-transform:uppercase;font-size:11px">Leyendas autónomas · PortAventuraNeXT</b>'
    + '<button type="button" id="autonomo-leyendas-start" style="' + btn + '">▶ Un clic para que hablen solas</button>'
    + '<span id="autonomo-leyendas-hora" style="color:#ffd75e;font-weight:600"></span>'
    + '<span id="autonomo-leyendas-estado" aria-live="polite" style="color:#cbb98a;font-weight:500;max-width:420px">Pulsa el botón para desbloquear el audio y arrancar. El mapa se pone en el centro de la mesa.</span>'
    + '<a href="' + URL_PUBLICA_HOME + '" style="color:#cbb98a;font-size:12px" id="autonomo-leyendas-url">' + URL_PUBLICA_HOME + '</a>';
  document.body.appendChild(bar);
  $('autonomo-leyendas-start').addEventListener('click', arrancar);
  window.addEventListener('resize', () => {
    const n = $('autonomo-globo-nombre');
    if (n && n.textContent && $('autonomo-globo') && !$('autonomo-globo').hidden) {
      mostrarBocadillo(n.textContent, $('autonomo-globo-texto').textContent);
    }
  });
}

let enCurso = false;
let abortado = false;

function arrancar() {
  if (enCurso) return;
  enCurso = true;
  abortado = false;
  const guion = modo.guion;
  const primero = siguienteTurno(guion, 0);
  const texto0 = textoTurno(primero, 'es');

  // Síncrono, dentro del clic: desbloqueo + primera línea del guion. Sin await.
  desbloquearAudioEnClic();
  irALeyendas();
  mostrarMapa();
  mostrarBocadillo(primero.persona, texto0);
  const hablaPrimero = hablarNativo(primero.persona, texto0, { cancelar: false });

  const inicio = new Date();
  const hora = formatHoraInicio(inicio);
  const h = $('autonomo-leyendas-hora');
  if (h) h.textContent = etiquetaMision(hora, 'es');
  const start = $('autonomo-leyendas-start');
  if (start) { start.textContent = '⏹ En curso'; start.disabled = true; }
  aviso(etiquetaMision(hora, 'es') + ' · ' + primero.persona + ' habla · 1/' + primero.total);
  askBackend.dichos = [{ persona: primero.persona, texto: texto0 }];

  seguirResto(guion, hablaPrimero, hora, start);
}

async function seguirResto(guion, hablaPrimero, hora, start) {
  try { await hablaPrimero; } catch (e) {}
  await new Promise((res) => setTimeout(res, 600));
  for (let i = 1; ; i++) {
    if (abortado) return;
    const t = siguienteTurno(guion, i);
    if (t.fin) break;
    aviso((t.esResumen ? 'Resumen · ' : '') + t.persona + ' · ' + (t.i + 1) + '/' + t.total);
    const r = await resolverTurno(t, { ask: askBackend, timeoutMs: TIMEOUT_BACKEND_MS });
    if (abortado) return;
    mostrarBocadillo(r.persona, r.texto);
    askBackend.dichos.push({ persona: r.persona, texto: r.texto });
    aviso((r.esResumen ? 'Resumen · ' : '') + r.persona + ' habla · ' + (t.i + 1) + '/' + t.total + (r.fuente === 'guion' ? ' · guion local' : ''));
    await hablarNativo(r.persona, r.texto, { cancelar: true });
    await new Promise((res) => setTimeout(res, 600));
  }
  aviso('Fin · ' + etiquetaMision(hora, 'es') + ' · una sala, una sola historia, un solo reloj.');
  if (start) { start.textContent = '↻ Volver a oír'; start.disabled = false; start.onclick = () => { enCurso = false; arrancar(); }; }
}

window.ConsejoAutonomoLeyendas = { modo, arrancar, desbloquearAudioEnClic, hablarNativo };
