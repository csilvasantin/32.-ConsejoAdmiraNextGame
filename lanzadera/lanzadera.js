import {
  parseComandoDemo,
  demoPorId,
  planDeLanzamiento,
  planDeApagado,
  apagadoPorId,
  encendidoPorId,
  etiquetaMision,
  formatHoraInicio,
} from '/lanzadera-lib.mjs?v=20261126-apagado';

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
  if (plan.zona === 'interactiva') {
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
    if (plan.zona === 'interactiva') {
      add(plan.control.url, plan.control.etiqueta + ' · abrir', plan.control.etiqueta + ' · open');
      const visto = new Set();
      for (const p of plan.players) {
        if (visto.has(p.url)) continue;
        visto.add(p.url);
        add(p.url, p.etiqueta, p.etiqueta);
        if (visto.size >= 3) break;
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
    const sala = lanzar('admiranext', inicio);
    const inter = lanzar('interactivo', inicio);
    return { tipo: 'encender', encendido: enc, sala, inter };
  }
  return lanzar(enc.demo, inicio);
}

export function lanzar(id, inicio) {
  const demo = demoPorId(id);
  if (!demo) return null;
  const plan = planDeLanzamiento(demo, inicio || new Date());
  pintarPlan(plan);
  try {
    document.dispatchEvent(new CustomEvent('admira:lanzadera', { detail: plan }));
  } catch (e) {}
  return plan;
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
      box.textContent = T('No reconozco esa demo. Elige una de las dos zonas: AdmiraNeXT.com, PortAventuraNeXT.com, player interactivo o modo demo PortAventuraNeXT.',
        'I do not recognise that demo. Choose one of the two zones: AdmiraNeXT.com, PortAventuraNeXT.com, the interactive player or PortAventuraNeXT demo mode.');
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

  const q = new URLSearchParams(location.search);
  const apagarUrl = apagadoPorId(q.get('apagar') || '');
  const encenderUrl = encendidoPorId(q.get('encender') || q.get('restaurar') || '');
  const desdeUrl = demoPorId(q.get('demo') || q.get('tema') || '');
  if (apagarUrl) prepararApagado(apagarUrl.id);
  else if (encenderUrl) encenderZona(encenderUrl.id);
  else if (desdeUrl) lanzar(desdeUrl.id);

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

window.AdmiraLanzadera = { lanzar, prepararApagado, confirmarApagado, cancelarApagado, encenderZona, parseComandoDemo, onComando, formatHoraInicio, etiquetaMision };
