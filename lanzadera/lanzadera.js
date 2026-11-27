import {
  parseComandoDemo,
  demoPorId,
  planDeLanzamiento,
  planDeApagado,
  apagadoPorId,
  encendidoPorId,
  etiquetaMision,
  formatHoraInicio,
  validarPlanContraInventario,
  puedeMarcarEnMarcha,
  MAQUINAS_ZONA_INTERACTIVA,
} from '/lanzadera-lib.mjs?v=20261127-zonas3';
import { inventarioPantallas, ESTADOS, ZONA_TITULO, ZONA_TITULO_EN } from '/lanzadera-ejecucion-lib.mjs?v=20261127-zonas3';

/** Botón → orden real en /api/lanzadera/ejecutar. */
export const ORDEN_DE_DEMO = Object.freeze({
  admiranext: { zona: 'reuniones', accion: 'admiranext' },
  pan: { zona: 'reuniones', accion: 'portaventura' },
  negro: { zona: 'reuniones', accion: 'negro' },
  interactivo: { zona: 'interactivos', accion: 'admiranext' },
  'pan-interactivo': { zona: 'interactivos', accion: 'portaventura' },
  mupis: { zona: 'mupis', accion: 'admiranext' },
  'pan-mupis': { zona: 'mupis', accion: 'portaventura' },
  'negro-mupis': { zona: 'mupis', accion: 'negro' },
});
const API_EJECUTAR = '/api/lanzadera/ejecutar';
const API_ESTADO = '/api/lanzadera/estado';
const REFRESCO_MS = 30000;

const $ = (id) => document.getElementById(id);

function lang() {
  try {
    if (window.AdmiraIdioma && typeof window.AdmiraIdioma.lang === 'function') {
      return window.AdmiraIdioma.lang() === 'en' ? 'en' : 'es';
    }
  } catch (e) {}
  return document.documentElement.lang === 'en' ? 'en' : 'es';
}
function T(es, en) { return lang() === 'en' ? en : es; }

function pintarPlan(plan) {
  const box = $('mision');
  const sec = $('plan');
  if (!plan) return;
  if (box) box.textContent = lang() === 'en' ? plan.etiquetaEn : plan.etiqueta;
  if (!sec) return;
  sec.hidden = false;
  if (plan.tipo === 'apagado') {
    $('plan-titulo').textContent = T(plan.apagado.titulo, plan.apagado.tituloEn) + ' · AdmiraNeXT';
    const pasos = [T('Hora: ', 'Time: ') + plan.inicio];
    if (plan.horaConfirmacion) pasos.push(T('Confirmado: ', 'Confirmed: ') + plan.horaConfirmacion);
    for (const d of plan.destinos) {
      const pend = d.pendiente ? ' — ' + d.pendiente : '';
      const off = d.siConectado ? T(' (solo si está conectado)', ' (only if connected)') : '';
      pasos.push((d.rol || d.etiqueta) + off + pend);
    }
    for (const pr of (lang() === 'en' ? plan.proteccionesEn : plan.protecciones)) pasos.push(pr);
    pasos.push(plan.cursor);
    const ol = $('plan-pasos');
    ol.innerHTML = '';
    for (const p of pasos) {
      const li = document.createElement('li');
      li.textContent = p;
      ol.appendChild(li);
    }
    const urls = $('plan-urls');
    if (urls) {
      urls.innerHTML = '';
      const a = document.createElement('a');
      a.href = plan.urlNegro;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = T('Sala en negro', 'Room in black');
      urls.appendChild(a);
    }
    for (const btn of document.querySelectorAll('.demo-card')) {
      const on = btn.getAttribute('data-apagar') === plan.apagado.id;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    try { sessionStorage.setItem('lanzadera:ultima', JSON.stringify({ tipo: 'apagado', id: plan.apagado.id, inicio: plan.inicio, confirmado: !!plan.confirmado })); } catch (e) {}
    return;
  }
  $('plan-titulo').textContent = T('Plan de esta misión', 'Plan for this mission') + ' · ' + T(plan.demo.titulo, plan.demo.tituloEn);
  const pasos = [T('Inicio: ', 'Start: ') + plan.inicio];
  if (plan.zona === 'interactiva' || plan.zona === 'mupis') {
    pasos.push(T('Control: ', 'Control: ') + plan.control.etiqueta + ' · ' + plan.control.url);
    for (const p of plan.players) {
      const pend = p.pendiente ? ' — ' + p.pendiente : '';
      pasos.push(p.etiqueta + ' (' + p.pantalla + '): ' + p.url + pend);
    }
    pasos.push(plan.noRobarFoco);
  } else {
    pasos.push(T('MacBook Air Rosa, Philips 86BDL3650Q: ', 'MacBook Air Rosa, Philips 86BDL3650Q: ') + plan.rosa.url);
    pasos.push(T('MacBook Air Crema, PC Monitor de arriba: ', 'MacBook Air Crema, upper PC Monitor: ') + plan.crema.url);
    if (plan.reset) pasos.push(T('Reset: página negra, sin apagar nada y con el cursor visible.', 'Reset: black page, nothing is turned off and the cursor stays visible.'));
  }
  pasos.push(plan.cursor);
  const ol = $('plan-pasos');
  ol.innerHTML = '';
  for (const p of pasos) {
    const li = document.createElement('li');
    li.textContent = p;
    ol.appendChild(li);
  }
  const urls = $('plan-urls');
  if (urls) {
    urls.innerHTML = '';
    const add = (href, es, en) => {
      if (urls.childNodes.length) urls.appendChild(document.createTextNode(' · '));
      const a = document.createElement('a');
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = T(es, en);
      urls.appendChild(a);
    };
    if (plan.zona === 'interactiva' || plan.zona === 'mupis') {
      add(plan.control.url, plan.control.etiqueta + ' · abrir', plan.control.etiqueta + ' · open');
      const visto = new Set();
      for (const p of plan.players) {
        if (visto.has(p.url)) continue;
        visto.add(p.url);
        add(p.url, p.etiqueta, p.etiqueta);
      }
    } else {
      add(plan.rosa.url, plan.reset ? 'Rosa · negro' : 'Leyendas · abrir', plan.reset ? 'Rosa · black' : 'Legends · open');
      add(plan.crema.url, plan.reset ? 'Crema · negro' : 'Consumos', plan.reset ? 'Crema · black' : 'Usage');
    }
  }
  for (const btn of document.querySelectorAll('.demo-card')) {
    btn.setAttribute('aria-pressed', btn.getAttribute('data-demo') === plan.demo.id ? 'true' : 'false');
  }
  try { sessionStorage.setItem('lanzadera:ultima', JSON.stringify({ id: plan.demo.id, inicio: plan.inicio })); } catch (e) {}
}

let pendienteApagado = null;

function cerrarConfirmacion() {
  const box = $('confirm-apagado');
  if (box) box.hidden = true;
  pendienteApagado = null;
}

function pedirConfirmacion(plan) {
  pendienteApagado = plan;
  const box = $('confirm-apagado');
  if (!box) return plan;
  box.hidden = false;
  $('confirm-titulo').textContent = T('Confirmar apagado · AdmiraNeXT', 'Confirm shutdown · AdmiraNeXT');
  $('confirm-hora').textContent = T('Hora: ', 'Time: ') + plan.inicio;
  $('confirm-texto').textContent = T(
    'Se pondrán en negro las pantallas de esta zona, reutilizando Sala en negro. Nada se apaga hasta que confirmes.',
    'The screens in this zone will go to Sala en negro. Nothing is turned off until you confirm.'
  );
  const ul = $('confirm-destinos');
  ul.innerHTML = '';
  for (const d of plan.destinos) {
    const li = document.createElement('li');
    li.textContent = (d.rol || d.etiqueta) + (d.siConectado ? T(' (solo si está conectado)', ' (only if connected)') : '') + (d.pendiente ? ' — ' + d.pendiente : '');
    ul.appendChild(li);
  }
  const pr = $('confirm-protecciones');
  pr.innerHTML = '';
  for (const line of (lang() === 'en' ? plan.proteccionesEn : plan.protecciones)) {
    const li = document.createElement('li');
    li.textContent = line;
    pr.appendChild(li);
  }
  const ok = $('confirm-apagado-ok');
  if (ok) ok.textContent = T('Confirmar apagado', 'Confirm shutdown');
  const no = $('confirm-apagado-no');
  if (no) no.textContent = T('Cancelar', 'Cancel');
  box.scrollIntoView({ block: 'nearest' });
  const mision = $('mision');
  if (mision) mision.textContent = plan.etiqueta + T(' · esperando confirmación', ' · waiting for confirmation');
  return plan;
}

export function prepararApagado(id, inicio) {
  const plan = planDeApagado(id, inicio || new Date());
  if (!plan) return null;
  pedirConfirmacion(plan);
  return plan;
}

export function confirmarApagado() {
  if (!pendienteApagado) return null;
  const plan = pendienteApagado;
  plan.confirmado = true;
  plan.horaConfirmacion = formatHoraInicio(new Date());
  pendienteApagado = null;
  const box = $('confirm-apagado');
  if (box) box.hidden = true;
  pintarPlan(plan);
  try {
    document.dispatchEvent(new CustomEvent('admira:lanzadera-apagar', { detail: plan }));
  } catch (e) {}
  ejecutar(plan.apagado.id, 'apagar', plan);
  return plan;
}

export function cancelarApagado() {
  const box = $('mision');
  if (box) box.textContent = T('Apagado cancelado. No se ha tocado ninguna pantalla.', 'Shutdown cancelled. No screen was changed.');
  cerrarConfirmacion();
}

export function encenderZona(id, inicio) {
  const enc = encendidoPorId(id);
  if (!enc) return null;
  if (enc.demo === 'todo') {
    // Una sola orden real para las tres zonas; el plan se pinta zona a zona.
    const sala = lanzar('admiranext', inicio, { sinEjecutar: true });
    const inter = lanzar('interactivo', inicio, { sinEjecutar: true });
    const mupis = lanzar('mupis', inicio, { sinEjecutar: true });
    ejecutar('todo', 'encender', sala);
    return { tipo: 'encender', encendido: enc, sala, inter, mupis };
  }
  return lanzar(enc.demo, inicio);
}

export function lanzar(id, inicio, opciones) {
  const demo = demoPorId(id);
  if (!demo) return null;
  const plan = planDeLanzamiento(demo, inicio || new Date());
  pintarPlan(plan);
  try {
    document.dispatchEvent(new CustomEvent('admira:lanzadera', { detail: plan }));
  } catch (e) {}
  const orden = ORDEN_DE_DEMO[demo.id];
  if (orden && !(opciones && opciones.sinEjecutar)) ejecutar(orden.zona, orden.accion, plan);
  return plan;
}

// ---------------------------------------------------------------------------------------------
// Ejecución real y estado vivo (27-nov-2026). La página nunca dice «en marcha» por su cuenta.

let ultimoPlan = null;
let ultimoEstado = null;

function chip(estado, texto) {
  const s = document.createElement('span');
  s.className = 'chip';
  s.setAttribute('data-estado', estado);
  s.textContent = texto;
  return s;
}

function etiquetaEstado(k) {
  if (k === 'sin_verificar') return T('Sin verificar', 'Not checked');
  const e = ESTADOS[k] || ESTADOS.error;
  return T(e.es, e.en);
}

function resumenTexto(resumen) {
  const r = resumen || {};
  const partes = [];
  if (r.despachado) partes.push(r.despachado + T(' despachadas, sin confirmar', ' dispatched, unconfirmed'));
  if (r.sin_conexion) partes.push(r.sin_conexion + T(' sin conexión', ' offline'));
  if (r.pendiente_id) partes.push(r.pendiente_id + T(' pendiente ID', ' pending ID'));
  return partes.join(' · ') || T('ninguna pantalla', 'no screen');
}

function pintarResultado(d, error) {
  const sec = $('resultado');
  if (!sec) return;
  sec.hidden = false;
  const ul = $('resultado-pantallas');
  ul.innerHTML = '';
  if (error) {
    $('resultado-titulo').textContent = T('La orden no se ha ejecutado', 'The order was not executed');
    const li = document.createElement('li');
    li.appendChild(chip('error', T('Error', 'Error')));
    li.appendChild(document.createTextNode(' ' + error));
    ul.appendChild(li);
    return;
  }
  const zona = d.zona === 'todo' ? T('Todas las zonas', 'All zones') : T(ZONA_TITULO[d.zona], ZONA_TITULO_EN[d.zona]);
  $('resultado-titulo').textContent = T('Resultado de la orden · ', 'Order result · ') + zona + ' · ' + d.accion + ' · ' + resumenTexto(d.resumen);
  for (const p of d.pantallas || []) {
    const li = document.createElement('li');
    li.appendChild(chip(p.resultado, etiquetaEstado(p.resultado)));
    li.appendChild(document.createTextNode(' ' + p.nombre + ' — ' + p.motivo));
    ul.appendChild(li);
  }
}

export async function ejecutar(zona, accion, plan) {
  ultimoPlan = plan || ultimoPlan;
  const mision = $('mision');
  const base = plan ? (lang() === 'en' ? plan.etiquetaEn : plan.etiqueta) : '';
  if (mision) mision.textContent = base + T(' · enviando la orden a las pantallas…', ' · sending the order to the screens…');
  let d = null;
  let error = '';
  try {
    const r = await fetch(API_EJECUTAR, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ zona, accion }),
    });
    if (r.status === 401) error = T('Sin sesión: entra en admira.live para lanzar demos.', 'No session: sign in to admira.live to launch demos.');
    else if (r.status === 403) error = T('Esta sesión no puede lanzar demos (solo lectura o kiosco).', 'This session cannot launch demos (read-only or kiosk).');
    else if (!r.ok) error = 'HTTP ' + r.status;
    else d = await r.json();
  } catch (e) {
    error = T('No hay respuesta de admira.live.', 'admira.live did not answer.');
  }
  if (!d || d.ok !== true) {
    error = error || (d && d.error) || T('respuesta no válida', 'invalid answer');
    if (mision) mision.textContent = base + T(' · NO ejecutada: ', ' · NOT executed: ') + error;
    pintarResultado(null, error);
    return { ok: false, error };
  }
  // Nunca «en marcha» aquí: despachado ≠ en marcha.
  if (mision) mision.textContent = base + ' · ' + resumenTexto(d.resumen);
  pintarResultado(d);
  cargarEstado();
  return d;
}

function destinoDePantalla(id) {
  if (id === 'rosa-philips') return 'rosa';
  if (id === 'crema-arriba') return 'crema';
  return id;
}

/** Usa de verdad las validaciones de la librería sobre el último plan y el estado vivo. */
export function verificarUltimoPlan(plan, estado) {
  if (!plan || plan.tipo === 'apagado' || !estado) return null;
  const vivas = new Set((estado.pantallas || []).filter((p) => !['sin_conexion', 'pendiente_id'].includes(p.estado)).map((p) => p.id));
  const inventario = [];
  for (const m of MAQUINAS_ZONA_INTERACTIVA) {
    if (m.machineId && vivas.has('player-' + m.e) && !inventario.some((x) => x.machineId === m.machineId)) inventario.push({ machineId: m.machineId, displays: [] });
  }
  const validacion = plan.players ? validarPlanContraInventario(plan, inventario) : null;
  const enMarcha = puedeMarcarEnMarcha(plan, {
    pantallas: (estado.pantallas || []).map((p) => ({ destino: destinoDePantalla(p.id), ok: p.estado === 'en_marcha' })),
  });
  return { validacion, enMarcha };
}

function estadoInicial() {
  return {
    inicial: true,
    zonas: ['reuniones', 'interactivos', 'mupis'].map((z) => ({ zona: z, estado: 'sin_verificar' })),
    pantallas: inventarioPantallas().map((p) => ({
      id: p.id, zona: p.zona, nombre: p.nombre,
      estado: p.machineId ? 'sin_verificar' : 'pendiente_id',
      motivo: p.machineId ? T('Aún sin leer del censo de flota.', 'Not read from the fleet census yet.') : (p.pendiente || T('machineId sin confirmar.', 'machineId not confirmed.')),
    })),
  };
}

export function pintarEstado(d) {
  const zonas = document.querySelectorAll('#ev-zonas .ev-zona');
  for (const art of zonas) {
    const z = art.getAttribute('data-zona');
    const info = (d.zonas || []).find((x) => x.zona === z) || { estado: 'sin_verificar' };
    const h3 = art.querySelector('h3');
    if (h3) h3.textContent = T(ZONA_TITULO[z], ZONA_TITULO_EN[z]);
    const cab = art.querySelector('header .chip');
    if (cab) { cab.setAttribute('data-estado', info.estado); cab.textContent = etiquetaEstado(info.estado); }
    art.setAttribute('data-estado', info.estado);
    const ul = art.querySelector('.ev-pantallas');
    ul.innerHTML = '';
    for (const p of (d.pantallas || []).filter((x) => x.zona === z)) {
      const li = document.createElement('li');
      li.title = p.motivo || '';
      const nom = document.createElement('span');
      nom.className = 'ev-nombre';
      nom.textContent = p.nombre;
      li.appendChild(nom);
      li.appendChild(chip(p.estado, etiquetaEstado(p.estado)));
      ul.appendChild(li);
    }
  }
}

export async function cargarEstado() {
  const hora = $('ev-hora');
  const aviso = $('ev-aviso');
  try {
    const r = await fetch(API_ESTADO, { credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' } });
    if (r.status === 401) {
      if (hora) hora.textContent = T('Sin sesión · estado sin verificar', 'No session · status not checked');
      return null;
    }
    const d = r.ok ? await r.json() : null;
    if (!d || d.ok !== true) throw new Error('HTTP ' + r.status);
    ultimoEstado = d;
    pintarEstado(d);
    if (hora) hora.textContent = T('Actualizado ', 'Updated ') + formatHoraInicio(new Date(d.generado || Date.now())) + (d.censo === 'ok' ? '' : T(' · censo de flota sin respuesta', ' · fleet census not answering'));
    const v = verificarUltimoPlan(ultimoPlan, d);
    if (aviso) {
      const errores = v && v.validacion && !v.validacion.ok ? v.validacion.errores : [];
      aviso.hidden = !errores.length;
      aviso.textContent = errores.join(' · ');
    }
    const mision = $('mision');
    if (v && v.enMarcha && mision && ultimoPlan) mision.textContent = (lang() === 'en' ? ultimoPlan.etiquetaEn : ultimoPlan.etiqueta) + T(' · en marcha, confirmado por cada pantalla', ' · running, confirmed by every screen');
    return d;
  } catch (e) {
    if (hora) hora.textContent = T('Sin respuesta de admira.live · estado sin verificar', 'admira.live not answering · status not checked');
    return null;
  }
}

function onComando(texto) {
  const cmd = parseComandoDemo(texto);
  if (!cmd) return false;
  if (cmd.tipo === 'demo' && cmd.demo) {
    lanzar(cmd.demo.id);
    return true;
  }
  if (cmd.tipo === 'apagar' && cmd.apagado) {
    prepararApagado(cmd.apagado.id);
    return true;
  }
  if (cmd.tipo === 'encender' && cmd.encendido) {
    encenderZona(cmd.encendido.id);
    return true;
  }
  if (cmd.tipo === 'lanzadera') {
    const box = $('mision');
    if (box && cmd.desconocido) {
      box.textContent = T('No reconozco esa demo. Elige una de las tres zonas: AdmiraNeXT.com, PortAventuraNeXT.com, player interactivo, modo demo PortAventuraNeXT o mupis.',
        'I do not recognise that demo. Choose one of the three zones: AdmiraNeXT.com, PortAventuraNeXT.com, the interactive player, PortAventuraNeXT demo mode or the mupis.');
    }
    return true;
  }
  return false;
}

function escuchar() {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = $('btn-voz');
  const estado = $('voz-estado');
  if (!Rec) {
    if (estado) estado.textContent = T('Este navegador no tiene reconocimiento de voz. Usa los botones o el Experto: /demo admiranext, /demo interactivo.',
      'This browser has no speech recognition. Use the buttons or Expert: /demo admiranext, /demo interactivo.');
    return;
  }
  if (escuchar.rec) {
    try { escuchar.rec.stop(); } catch (e) {}
    escuchar.rec = null;
    if (btn) btn.setAttribute('aria-pressed', 'false');
    if (btn) btn.textContent = T('🎙️ Escuchar', '🎙️ Listen');
    return;
  }
  const rec = new Rec();
  rec.lang = lang() === 'en' ? 'en-US' : 'es-ES';
  rec.continuous = true;
  rec.interimResults = false;
  rec.onresult = (ev) => {
    let t = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      if (ev.results[i].isFinal) t += ev.results[i][0].transcript;
    }
    t = t.trim();
    if (!t) return;
    if (estado) estado.textContent = '«' + t + '»';
    onComando(t);
  };
  rec.onerror = () => {
    if (btn) btn.setAttribute('aria-pressed', 'false');
    if (btn) btn.textContent = T('🎙️ Escuchar', '🎙️ Listen');
    escuchar.rec = null;
  };
  rec.onend = () => {
    if (escuchar.rec === rec) {
      try { rec.start(); } catch (e) { escuchar.rec = null; }
    }
  };
  rec.start();
  escuchar.rec = rec;
  if (btn) {
    btn.setAttribute('aria-pressed', 'true');
    btn.textContent = T('🎙️ Escuchando…', '🎙️ Listening…');
  }
}

function montar() {
  document.querySelectorAll('.demo-card[data-demo]').forEach((btn) => {
    btn.addEventListener('click', () => lanzar(btn.getAttribute('data-demo')));
  });
  document.querySelectorAll('.demo-card[data-apagar]').forEach((btn) => {
    btn.addEventListener('click', () => prepararApagado(btn.getAttribute('data-apagar')));
  });
  document.querySelectorAll('.demo-card[data-encender]').forEach((btn) => {
    btn.addEventListener('click', () => encenderZona(btn.getAttribute('data-encender')));
  });
  const ok = $('confirm-apagado-ok');
  if (ok) ok.addEventListener('click', confirmarApagado);
  const no = $('confirm-apagado-no');
  if (no) no.addEventListener('click', cancelarApagado);
  const voz = $('btn-voz');
  if (voz) voz.addEventListener('click', escuchar);
  const act = $('ev-actualizar');
  if (act) act.addEventListener('click', () => cargarEstado());
  pintarEstado(estadoInicial());
  cargarEstado();
  setInterval(() => { if (!document.hidden) cargarEstado(); }, REFRESCO_MS);

  const q = new URLSearchParams(location.search);
  const apagarUrl = apagadoPorId(q.get('apagar') || '');
  const encenderUrl = encendidoPorId(q.get('encender') || q.get('restaurar') || '');
  const desdeUrl = demoPorId(q.get('demo') || q.get('tema') || '');
  if (apagarUrl) prepararApagado(apagarUrl.id);
  else if (encenderUrl) encenderZona(encenderUrl.id);
  else if (desdeUrl) lanzar(desdeUrl.id);
  // La orden de la URL se ejecuta una vez: recargar la página no la vuelve a mandar.
  if ((apagarUrl || encenderUrl || desdeUrl) && history.replaceState) {
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
  }

  // El Experto de yk-frame añade "/" si falta. Enganchamos el submit.
  document.addEventListener('submit', (e) => {
    const form = e.target && e.target.closest && e.target.closest('form');
    if (!form || !form.classList.contains('yk-expert-cmd-form')) return;
    const input = form.querySelector('input, textarea');
    const text = input && input.value;
    if (onComando(text)) {
      // Dejamos que el experto también lo procese; si no lo conoce, da igual: ya lanzamos.
    }
  }, true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
else montar();

window.AdmiraLanzadera = { lanzar, prepararApagado, confirmarApagado, cancelarApagado, encenderZona, parseComandoDemo, onComando, formatHoraInicio, etiquetaMision, ejecutar, cargarEstado, pintarEstado };
