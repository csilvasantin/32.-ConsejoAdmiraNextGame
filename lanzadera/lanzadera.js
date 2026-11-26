import {
  parseComandoDemo,
  demoPorId,
  planDeLanzamiento,
  etiquetaMision,
  formatHoraInicio,
} from '/lanzadera-lib.mjs?v=20261126-enrutado';

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
  document.querySelectorAll('.demo-card').forEach((btn) => {
    btn.addEventListener('click', () => lanzar(btn.getAttribute('data-demo')));
  });
  const voz = $('btn-voz');
  if (voz) voz.addEventListener('click', escuchar);

  const q = new URLSearchParams(location.search);
  const desdeUrl = demoPorId(q.get('demo') || q.get('tema') || '');
  if (desdeUrl) lanzar(desdeUrl.id);

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

window.AdmiraLanzadera = { lanzar, parseComandoDemo, onComando, formatHoraInicio, etiquetaMision };
