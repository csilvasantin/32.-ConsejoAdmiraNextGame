import {
  parseMesa, MESAS, ROLES, IMG, IMG_SIN_CARLOS, comandoExperto, comandoSilencio, comandoAutonomo, comandoCerrar,
  ANCLA, TEMA_DEFECTO, TEMA_AUTONOMO, LS_SILENCIO, promptDe, canalVacio,
  marcarPresente, publicState, reservar, decir, siguienteSpeaker,
  quitarPresente, TEMAS_PRESET, LS_IDIOMA, LS_TEMA, parseIdioma, sufijoIdioma,
} from '/escena0-lib.mjs?v=20261119-debates';
import {
  parseGuion, parseCabecera, CABECERA_POS, textoTurno, bolsasGuion, promptGuion, mesaDeGuion, msLectura, anclaGuion,
  parseLang, lineasTurno, ROTULOS_EN, anchoGlobo, cajaGlobo, LOGO_DEMO,
} from '/escena0-guion.mjs?v=20261114-mesa4';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
// Demo del Consejo (Lucas, 14-11-2026): ?flujo=pan → Leyendas, Coetáneos y la presentación
// consejero vs consejero en una sola pantalla. ?guion=pan en las dos mesas usa el mismo relato.
// ?cabecera=bonomi sienta a Carlo Bonomi en la cabecera de los Coetáneos.
// ?flujo=pan&guion=carlos-bonomi: el flujo de una pantalla con otro guion (Carlos Silva ↔ Carlo Bonomi).
const guionQ = parseGuion(q.get('guion'));
const flujo = parseGuion(q.get('flujo')) ? (guionQ || parseGuion(q.get('flujo'))) : null;
const guion = flujo || guionQ;
const cabeceraPedida = parseCabecera(q.get('cabecera')) || (guion && guion.cabecera ? parseCabecera(guion.cabecera) : null);
let cabecera = cabeceraPedida;
// Modo experto (Carlos 15-11 19:34): Carlos Silva y Carlo Bonomi solo si se les llama o si la URL/guion los pide.
const expertos = {
  carlos: !!(guion && (guion.turnos || []).some((t) => t && t.persona === 'Carlos Silva')),
  bonomi: !!cabeceraPedida,
};
const imgDe = (m) => (m === 'leyendas' && !expertos.carlos ? IMG_SIN_CARLOS.leyendas : IMG[m]);
const conIA = q.get('ia') === '1' && !(guion && guion.soloGuion);
// ?lang=es|en|both (por defecto both) en los guiones bilingües (Carlos Silva ↔ Carlo Bonomi).
const lang = parseLang(q.get('lang'), guion);
let mesa = flujo ? 'leyendas' : parseMesa(q.get('mesa') || q.get('gen') || q.get('generation'));
let mesaVista = mesa;
function silencioInicial() {
  if (q.get('silencio') === '1' || q.get('mute') === '1') return true;
  if (q.get('silencio') === '0' || q.get('mute') === '0') return false;
  try { return localStorage.getItem(LS_SILENCIO) === '1'; } catch (e) { return false; }
}
let silencio = silencioInicial();
let autonomo = false;
let tickTimer = null;
let vozFin = null;
const demo = q.get('demo') === '1';
const temaQ = (q.get('tema') || '').trim() || (guion ? guion.tema : '');
// Carlos 19-11 (t108u/t109u): voces en inglés, saltar a Coetáneos y escoger el tema (el actual, por defecto).
let idioma = parseIdioma(q.get('idioma') || q.get('voz')) || (() => { try { return parseIdioma(localStorage.getItem(LS_IDIOMA)); } catch (e) { return null; } })() || 'es';
let temaActual = temaQ || (() => { try { return (localStorage.getItem(LS_TEMA) || '').trim(); } catch (e) { return ''; } })() || TEMA_AUTONOMO;
const API = '/api/consejo/escena0';
// Carlos 16-11 09:59: la API directa del Consejo exige token (401/403) y el navegador no lo lleva, así que cada turno
// caía al relleno «Dejadme encajar…» en bucle. Primero el proxy del Mini (/demo/consejo, pone su clave y fuerza
// grok-4.6, CORS admira.live), igual que app.js; la API directa queda de reserva. URLs completas de ask-one.
const COUNCIL_API_URLS = (location.protocol === 'https:' ? [] : ['http://localhost:8420/api/council/ask-one']).concat([
  'https://macmini.tail48b61c.ts.net/demo/consejo/ask-one',
  'https://macmini.tail48b61c.ts.net/council/api/council/ask-one',
  'https://three2-consejoadmiranextgame.onrender.com/api/council/ask-one',
]);

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
  if (globoFlujo) { pintarGloboFlujo(); return; }
  const g = $('globo'); const ancla = (ANCLA[mesaVista] || {})[persona] || anclaGuion(mesaVista, persona);
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
// Carlos 21:50: la cabecera y el neón no salen hasta que el arte de su mesa está cargado (antes Bonomi aparecía sobre la mesa anterior).
function mesaCargada() {
  const img = $('mesa-img');
  if (!img) return true;
  const want = (imgDe(mesaVista) || '').split('?')[0];
  return img.complete && img.naturalWidth > 0 && (!want || (img.currentSrc || img.src).indexOf(want) >= 0);
}

function colocarCabecera() {
  const el = $('cabecera');
  if (!el) return;
  const box = cajaArte();
  if (!cabecera || mesaVista !== CABECERA_POS.mesa || !box || !mesaCargada()) { el.hidden = true; return; }
  el.hidden = false;
  el.style.left = (box.x + CABECERA_POS.x / 100 * box.w) + 'px';
  el.style.top = (box.y + CABECERA_POS.y / 100 * box.h) + 'px';
  el.style.width = (CABECERA_POS.w / 100 * box.w) + 'px';
  el.style.height = (CABECERA_POS.h / 100 * box.h) + 'px';
  const corte = CABECERA_POS.corte || 0;
  const img = $('cabecera-img'); if (img) img.style.clipPath = 'inset(0 0 ' + corte + '% 0)';
  const placa = $('cabecera-placa'); if (placa) placa.style.top = (100 - corte + 0.8 / CABECERA_POS.h * 100) + '%';
  // Sin placas (como la mesa de la home por defecto): el objeto del invitado, en % de la caja de la cabecera.
  const ob = $('cabecera-objeto'), o = cabecera.objeto;
  if (ob && o) {
    ob.style.left = ((o.cx - CABECERA_POS.x) / CABECERA_POS.w * 100) + '%';
    ob.style.top = ((o.y - CABECERA_POS.y) / CABECERA_POS.h * 100) + '%';
    ob.style.height = (o.h / CABECERA_POS.h * 100) + '%';
  }
}

// Neón de la mesa de los Coetáneos con «PortAventuraNeXT» en el flujo de presentación (pan, carlos-bonomi, gartner).
function colocarLogo() {
  const el = $('logo-demo');
  if (!el) return;
  const box = cajaArte();
  if (!flujo || mesaVista !== LOGO_DEMO.mesa || !box || !mesaCargada()) { el.hidden = true; return; }
  if (!el.getAttribute('src')) el.src = LOGO_DEMO.foto;
  el.hidden = false;
  el.style.left = (box.x + LOGO_DEMO.x / 100 * box.w) + 'px';
  el.style.top = (box.y + LOGO_DEMO.y / 100 * box.h) + 'px';
  el.style.width = (LOGO_DEMO.w / 100 * box.w) + 'px';
  el.style.height = (LOGO_DEMO.h / 100 * box.h) + 'px';
}

function montarCabecera() {
  const el = $('cabecera');
  if (!el || !cabecera) return;
  $('cabecera-img').src = cabecera.foto;
  $('cabecera-img').alt = cabecera.nombre + ' en la cabecera de la mesa';
  $('cabecera-placa').textContent = cabecera.nombre;
  const ob = $('cabecera-objeto');
  if (ob && cabecera.objeto) { ob.src = cabecera.objeto.foto; ob.alt = cabecera.objeto.alt; ob.hidden = false; }
  colocarCabecera();
}

function verMesa(m) {
  mesaVista = m;
  document.body.setAttribute('data-mesa', m);
  const img = $('mesa-img');
  if (img.getAttribute('data-mesa') !== m || img.getAttribute('src') !== imgDe(m)) {
    img.setAttribute('data-mesa', m);
    img.src = imgDe(m);
    img.alt = 'Mesa de ' + nombreMesa(m) + ' del Consejo AdmiraNeXT';
  }
  colocarCabecera();
  colocarLogo();
}

// ---- Modo experto: «/consejero carlos silva», «/consejero carlo bonomi» (tecleado en la propia Escena 0) ----
// Se sincroniza entre las dos pantallas (BroadcastChannel): Carlos sale en las Leyendas, Bonomi en la cabecera de
// los Coetáneos, se teclee donde se teclee. Al recargar, vuelven a no estar (nunca en el set por defecto).
const canalExpertos = (() => { try { return new BroadcastChannel('admira-escena0-expertos'); } catch (e) { return null; } })();
function aplicarExpertos() {
  cabecera = expertos.bonomi ? (cabeceraPedida || parseCabecera('carlo-bonomi')) : null;
  if (cabecera) montarCabecera(); else { const c = $('cabecera'); if (c) c.hidden = true; }
  if (mesaVista) verMesa(mesaVista);
  pintarControles();
}
function avisoCmd(texto, ms) {
  const el = $('cmd-experto'); if (!el) return;
  el.textContent = texto; el.hidden = !texto;
  clearTimeout(avisoCmd.t);
  if (ms) avisoCmd.t = setTimeout(() => { el.hidden = true; }, ms);
}
function cortarVoz() {
  try { if (vozFin) vozFin(); } catch (e) {}
  try { if (window.AdmiraVoces && AdmiraVoces.stop) AdmiraVoces.stop(); } catch (e) {}
  try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
}
function persistirSilencio() {
  try { localStorage.setItem(LS_SILENCIO, silencio ? '1' : '0'); } catch (e) {}
}
function setSilencio(on, opts) {
  opts = opts || {};
  const valor = !!on;
  const cambio = valor !== silencio;
  silencio = valor;
  persistirSilencio();
  if (silencio) {
    cortarVoz();
    if (autonomo && !opts.desdeAutonomo) setAutonomo(false, { remoto: true, porSilencio: true });
  }
  pintarControles();
  if (!opts.remoto && cambio) {
    try { canalExpertos && canalExpertos.postMessage({ tipo: 'silencio', on: silencio }); } catch (e) {}
  }
  return silencio;
}
function setAutonomo(on, opts) {
  opts = opts || {};
  const valor = !!on;
  if (valor && silencio) setSilencio(false, { remoto: true, desdeAutonomo: true });
  if (valor === autonomo && (valor ? enCurso : !enCurso) && !opts.forzar) {
    pintarControles();
    return autonomo;
  }
  if (valor && document.body.classList.contains('flujo')) {
    try { pausa = true; } catch (e) {}
    autonomo = false;
    pintarControles();
    avisoCmd('Flujo en pausa. El consejo autónomo corre en las dos mesas (Leyendas / Coetáneos).', 5000);
    return false;
  }
  autonomo = valor;
  if (autonomo) arrancarConversacion();
  else pararConversacion();
  pintarControles();
  if (!opts.remoto) {
    try { canalExpertos && canalExpertos.postMessage({ tipo: 'autonomo', on: autonomo }); } catch (e) {}
  }
  return autonomo;
}
function pintarControles() {
  const s = $('btn-silencio');
  if (s) {
    s.textContent = silencio ? '🔊 Reactivar voces' : '🔇 Silenciar consejo';
    s.setAttribute('aria-pressed', silencio ? 'true' : 'false');
    s.classList.toggle('activo', silencio);
  }
  const a = $('btn-autonomo');
  if (a) {
    a.textContent = autonomo ? '⏹ Parar consejo autónomo' : '🎙 Consejo autónomo';
    a.setAttribute('aria-pressed', autonomo ? 'true' : 'false');
    a.classList.toggle('activo', autonomo);
  }
  const li = $('btn-idioma');
  if (li) {
    li.textContent = idioma === 'en' ? '🌐 Voices: English → ES' : '🌐 Voces: español → EN';
    li.setAttribute('aria-pressed', idioma === 'en' ? 'true' : 'false');
    li.classList.toggle('activo', idioma === 'en');
  }
  const bm = $('btn-mesa');
  if (bm) {
    const otra = mesa === 'coetaneos' ? 'leyendas' : 'coetaneos';
    bm.textContent = idioma === 'en'
      ? ('🔀 Go to ' + (otra === 'coetaneos' ? 'Peers (Coetáneos)' : 'Legends (Leyendas)'))
      : ('🔀 Ir a ' + nombreMesa(otra));
    bm.hidden = !mesa || document.body.classList.contains('flujo');
  }
  const st = $('sel-tema');
  if (st) {
    const preset = TEMAS_PRESET.find((t) => (t.tema || TEMA_AUTONOMO) === temaActual);
    st.value = preset ? preset.id : 'otro';
    Array.from(st.options).forEach((o) => {
      const t = TEMAS_PRESET.find((x) => x.id === o.value);
      if (t) o.textContent = (idioma === 'en' ? t.en : t.es);
      else if (o.value === 'otro') o.textContent = preset ? (idioma === 'en' ? 'Other topic…' : 'Otro tema…') : ('✎ ' + temaActual.slice(0, 60));
    });
    const lab = $('lbl-tema'); if (lab) lab.textContent = idioma === 'en' ? 'Topic' : 'Tema';
  }
  const c = $('btn-carlos');
  if (c) {
    c.textContent = expertos.carlos ? '🪑 Quitar Carlos Silva' : '🪑 Aparecer Carlos Silva';
    c.setAttribute('aria-pressed', expertos.carlos ? 'true' : 'false');
    c.classList.toggle('activo', !!expertos.carlos);
  }
  const b = $('btn-bonomi');
  if (b) {
    b.textContent = expertos.bonomi ? '🪑 Quitar Carlo Bonomi' : '🪑 Aparecer Carlo Bonomi';
    b.setAttribute('aria-pressed', expertos.bonomi ? 'true' : 'false');
    b.classList.toggle('activo', !!expertos.bonomi);
  }
}

function mostrarCerrada() {
  if (document.getElementById('escena0-cerrada')) return;
  const c = document.createElement('div');
  c.id = 'escena0-cerrada';
  c.setAttribute('role', 'status');
  c.textContent = 'Cerrada';
  c.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#000;color:#888;display:flex;align-items:center;justify-content:center;font:600 42px/1.2 Arial,sans-serif;letter-spacing:.06em';
  (document.body || document.documentElement).appendChild(c);
  try { document.documentElement.style.background = '#000'; } catch (e) {}
  try { document.body.style.background = '#000'; } catch (e) {}
}
/** El lanzador pide cerrar esta ventana (/cerrar, postMessage o mando). Si window.close no puede (no la abrió un script), sale de pantalla completa y queda en negro. */
function cerrarVentanaShow() {
  try { setAutonomo(false); } catch (e) {}
  try { setSilencio(true); } catch (e) {}
  try { window.AdmiraVoces && AdmiraVoces.stop(); } catch (e) {}
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
  let cerrada = false;
  try { window.close(); cerrada = !!window.closed; } catch (e) {}
  setTimeout(() => { if (!window.closed) mostrarCerrada(); }, 250);
  return cerrada ? 'Ventana cerrada' : 'Cerrada';
}

// ---- Idioma, mesa y tema (Carlos 19-11, t108u/t109u) ----
function setIdioma(v) {
  const n = parseIdioma(v); if (!n) return idioma;
  idioma = n;
  try { localStorage.setItem(LS_IDIOMA, idioma); } catch (e) {}
  cortarVoz();
  pintarControles();
  return idioma;
}
async function setTema(t) {
  const tema = String(t || '').replace(/\s+/g, ' ').trim().slice(0, 240) || TEMA_AUTONOMO;
  temaActual = tema;
  try { if (tema === TEMA_AUTONOMO) localStorage.removeItem(LS_TEMA); else localStorage.setItem(LS_TEMA, tema); } catch (e) {}
  if (local) docLocal.tema = tema;
  else { try { await api('POST', { accion: 'tema', tema }); } catch (e) {} }
  if (enCurso) estado('Consejo autónomo · ' + tema);
  avisoCmd((idioma === 'en' ? '🗣 Topic: ' : '🗣 Tema: ') + tema, 4000);
  pintarControles();
  return tema;
}
async function cambiarMesa(m) {
  const nueva = parseMesa(m);
  if (!nueva || nueva === mesa || flujo) return mesa;
  const vieja = mesa;
  const seguia = enCurso;
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  enCurso = false;
  cortarVoz();
  if (local) docLocal = quitarPresente(docLocal, vieja, Date.now());
  else { try { await api('POST', { accion: 'salir', mesa: vieja }); } catch (e) {} }
  mesa = nueva;
  lastSeenId = null;
  ocupado = false;
  const g = $('globo'); if (g) g.hidden = true;
  try { const u = new URL(location.href); u.searchParams.set('mesa', mesa); history.replaceState(null, '', u.toString()); } catch (e) {}
  verMesa(mesa);
  $('gesto-mesa').textContent = 'Mesa de ' + nombreMesa(mesa);
  $('hud-mesa').textContent = 'Escena 0 · ' + nombreMesa(mesa);
  pintarControles();
  if (seguia) { autonomo = false; await arrancarConversacion(); }
  return mesa;
}
function comandoNuevo(texto) {
  const s = String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  let m = s.match(/^\/?(idioma|lang|language|voces|voices)\s+(\S+)$/i);
  if (m) {
    const n = parseIdioma(m[2]);
    if (!n) return { ok: false, texto: 'Usa /idioma en o /idioma es' };
    setIdioma(n);
    return { ok: true, texto: n === 'en' ? '🌐 Voices and debate in English' : '🌐 Voces y debate en español', idioma: n };
  }
  m = s.match(/^\/?(mesa|sala|table|room)\s+(\S+)$/i);
  if (m) {
    const n = parseMesa(m[2]);
    if (!n) return { ok: false, texto: 'Usa /mesa leyendas o /mesa coetaneos' };
    cambiarMesa(n);
    return { ok: true, texto: '🔀 Mesa de ' + nombreMesa(n), mesa: n };
  }
  m = String(texto || '').trim().match(/^\/?(tema|topic)\s+(.+)$/i);
  if (m) {
    const t = m[2].trim();
    const p = TEMAS_PRESET.find((x) => x.id === t.toLowerCase());
    const tema = /^(defecto|default|presentacion|presentación)$/i.test(t) ? TEMA_AUTONOMO : (p ? (p.tema || TEMA_AUTONOMO) : t);
    setTema(tema);
    return { ok: true, texto: '🗣 Tema: ' + tema };
  }
  return null;
}

function ejecutarExperto(texto) {
  // Devuelve {ok, texto}: lo mismo que se enseña en pantalla, para el acuse del mando remoto.
  if (/^\/?(help|ayuda|\?)$/i.test(String(texto || '').trim())) { avisoCmd(AYUDA_EXPERTO, 9000); return { ok: true, texto: 'ayuda mostrada' }; }
  const sil = comandoSilencio(texto);
  if (sil) {
    if (sil.error) { avisoCmd(sil.error, 4500); return { ok: false, texto: sil.error }; }
    const on = sil.on === null ? !silencio : sil.on;
    setSilencio(on);
    const msg = silencio ? '🔇 Consejo silenciado — el texto sigue, sin voz' : '🔊 Voces del consejo reactivadas';
    avisoCmd(msg, 3500);
    return { ok: true, texto: msg, silencio };
  }
  const aut = comandoAutonomo(texto);
  if (aut) {
    if (aut.error) { avisoCmd(aut.error, 4500); return { ok: false, texto: aut.error }; }
    const on = aut.on === null ? !autonomo : aut.on;
    setAutonomo(on);
    const msg = autonomo ? '🎙 Consejo autónomo: conversan sobre ' + temaActual : '⏹ Consejo autónomo en pausa';
    avisoCmd(msg, 3500);
    return { ok: true, texto: msg, autonomo };
  }
  const nuevo = comandoNuevo(texto);
  if (nuevo) { avisoCmd(nuevo.texto, nuevo.ok ? 3500 : 4500); return nuevo; }
  const cer = comandoCerrar(texto);
  if (cer) {
    const msg = cerrarVentanaShow();
    return { ok: true, texto: msg };
  }
  const r = comandoExperto(texto);
  if (!r) { avisoCmd('Comando no reconocido: ' + texto, 3500); return { ok: false, texto: 'Comando no reconocido: ' + texto }; }
  if (r.error) { avisoCmd(r.error, 4500); return { ok: false, texto: r.error }; }
  const on = r.on === null ? !expertos[r.quien] : r.on;
  expertos[r.quien] = on;
  aplicarExpertos();
  try { canalExpertos && canalExpertos.postMessage({ quien: r.quien, on }); } catch (e) {}
  const msg = r.quien === 'carlos' ? (on ? '🪑 Carlos Silva aparece en las Leyendas' : '🪑 Carlos Silva desaparece de las Leyendas — queda su silla')
    : (on ? '🪑 Carlo Bonomi aparece en la cabecera de los Coetáneos' : '🪑 Carlo Bonomi desaparece de la cabecera de los Coetáneos');
  avisoCmd(msg, 3500);
  pintarControles();
  return { ok: true, texto: msg, quien: r.quien, on };
}
if (canalExpertos) canalExpertos.onmessage = (e) => {
  const d = e.data || {};
  if ((d.quien === 'carlos' || d.quien === 'bonomi') && typeof d.on === 'boolean') { expertos[d.quien] = d.on; aplicarExpertos(); pintarControles(); }
  if (d.tipo === 'silencio' && typeof d.on === 'boolean') setSilencio(d.on, { remoto: true });
  if (d.tipo === 'autonomo' && typeof d.on === 'boolean') setAutonomo(d.on, { remoto: true });
};
// ---- Mando remoto (Carlos 15-11 21:47): «hacer aparecer a Carlos Silva o Carlo Bononi desde otro ordenador» ----
// Solo si la URL trae la sala firmada que pone el receptor del lanzador (&mando=<máquina>.<firma>): esta Escena 0
// recoge sus órdenes del relé de portaventuranext.com (lanzador → «Mando remoto»), las ejecuta exactamente como si se
// tecleasen aquí en modo experto y devuelve el acuse (aplicada / error con el texto que sale en pantalla). La otra mesa
// la sigue por el BroadcastChannel de expertos. Sin &mando= no hace ninguna petición: nada cambia sin mando.
const MANDO_API = 'https://www.portaventuranext.com/api/mando/escena0';
const salaMando = /^[a-z0-9]{2,16}\.[0-9a-f]{32}$/.test(q.get('mando') || '') ? q.get('mando') : '';
function mandoAcuse(id, r) {
  const body = JSON.stringify({ sala: salaMando, id, ok: !!(r && r.ok), detalle: String((r && r.texto) || '').slice(0, 280) + ' · escena0 ' + mesa });
  return fetch(MANDO_API, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'text/plain' }, body }).catch(() => {});
}
if (salaMando && (mesa === 'leyendas' || mesa === 'coetaneos')) {
  let esperaMando = 1200;
  const sondearMando = async () => {
    try {
      const r = await fetch(MANDO_API + '?sala=' + encodeURIComponent(salaMando) + '&mesa=' + mesa + '&v=20261115-mando',
        { credentials: 'omit', cache: 'no-store' });
      if (r.status === 401) { esperaMando = 60000; throw new Error('sala'); }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      for (const o of d.ordenes || []) {
        let res;
        try { res = ejecutarExperto(String(o.comando || '')); } catch (e) { res = { ok: false, texto: 'excepción: ' + ((e && e.message) || e) }; }
        await mandoAcuse(o.id, res || { ok: false, texto: 'sin resultado' });
      }
      esperaMando = document.visibilityState === 'hidden' ? 3000 : 1200;
    } catch (e) { if (esperaMando < 60000) esperaMando = 8000; }
    setTimeout(sondearMando, esperaMando);
  };
  sondearMando();
  document.documentElement.dataset.mando = salaMando.split('.')[0];
}
// Mando directo en el MISMO ordenador (Carlos 16-11 09:30): si esta Escena 0 la abrió el lanzador de
// portaventuranext.com con «Este ordenador» (window.open, sin &mando=), el lanzador le habla por postMessage y no
// hace falta el relé de 30 s. Solo se acepta del origen del lanzador y solo de la ventana que la abrió (opener).
const ORIGENES_LANZADOR = ['https://www.portaventuranext.com', 'https://portaventuranext.com'];
window.addEventListener('message', (e) => {
  if (!ORIGENES_LANZADOR.includes(e.origin) || !e.source || e.source !== window.opener) return;
  const d = e.data || {};
  if (d.tipo !== 'escena0-mando' || typeof d.comando !== 'string' || !/^\/[\p{L}\p{N} ,.\-]{1,118}$/u.test(d.comando)) return;
  let res;
  try { res = ejecutarExperto(d.comando); } catch (err) { res = { ok: false, texto: 'excepción: ' + ((err && err.message) || err) }; }
  try { e.source.postMessage({ tipo: 'escena0-acuse', id: String(d.id || '').slice(0, 40), ok: !!(res && res.ok), texto: String((res && res.texto) || '').slice(0, 280), mesa }, e.origin); } catch (err) {}
});
if (window.opener) { try { window.opener.postMessage({ tipo: 'escena0-lista', mesa }, 'https://www.portaventuranext.com'); } catch (e) {} }
// Modo experto mínimo (Carlos 15-11 19:42): la tecla «\» abre una línea de comandos abajo, DENTRO de la pantalla
// completa (el fullscreen es documentElement, así que un fijo en body se ve). Esc la cierra, Enter ejecuta.
// Mientras está abierta, las teclas de la escena (F, espacio, flechas, P) no llegan: el input para la propagación.
const AYUDA_EXPERTO = 'Comandos: /consejero carlos silva · /consejero carlo bonomi (o bononi) · /silencio · /autonomo · /idioma en|es · /mesa leyendas|coetaneos · /tema <texto>|defecto · /cerrar · añade «desaparece» o «fuera» / «on» o «off» · sin verbo, alterna · /help';
function abrirLinea() {
  let box = $('experto-linea');
  if (!box) {
    box = document.createElement('div'); box.id = 'experto-linea';
    const inp = document.createElement('input'); inp.type = 'text'; inp.id = 'experto-input';
    inp.setAttribute('aria-label', 'Modo experto de Escena 0'); inp.autocomplete = 'off'; inp.spellcheck = false;
    inp.placeholder = '/consejero carlos silva · /silencio · /autonomo · /cerrar · /help';
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); cerrarLinea(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const c = inp.value.trim(); inp.value = '';
        if (!c) return;
        ejecutarExperto(c.startsWith('/') ? c : '/' + c);
      }
    });
    ['keyup', 'keypress'].forEach((ev) => inp.addEventListener(ev, (e) => e.stopPropagation()));
    box.appendChild(inp);
  }
  // Siempre dentro del elemento a pantalla completa (si lo hay), para que se vea.
  const fs = document.fullscreenElement || document.webkitFullscreenElement;
  const destino = fs && fs !== document.documentElement ? fs : document.body;
  if (box.parentNode !== destino) destino.appendChild(box);
  box.hidden = false;
  const inp = $('experto-input'); inp.focus(); inp.select();
}
function cerrarLinea() { const b = $('experto-linea'); if (b) b.hidden = true; try { document.activeElement && document.activeElement.blur(); } catch (e) {} }
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (e.key === '\\' || e.code === 'Backslash' || e.code === 'IntlBackslash') {
    e.preventDefault(); e.stopImmediatePropagation(); abrirLinea();
  }
}, true);

// Teclas: «/» abre el comando; mientras se escribe, ni la F ni el espacio llegan a la escena.
let bufCmd = null, tCmd = 0;
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (bufCmd === null) {
    if (e.key !== '/') return;
    bufCmd = '/';
  } else if (e.key === 'Escape') { bufCmd = null; avisoCmd('', 0); e.preventDefault(); e.stopImmediatePropagation(); return; }
  else if (e.key === 'Enter') { const c = bufCmd; bufCmd = null; avisoCmd('', 0); e.preventDefault(); e.stopImmediatePropagation(); ejecutarExperto(c); return; }
  else if (e.key === 'Backspace') { bufCmd = bufCmd.slice(0, -1); if (!bufCmd) { bufCmd = null; avisoCmd('', 0); e.preventDefault(); e.stopImmediatePropagation(); return; } }
  else if (e.key.length === 1) bufCmd += e.key;
  else return;
  e.preventDefault(); e.stopImmediatePropagation();
  avisoCmd('› ' + bufCmd, 0);
  clearTimeout(tCmd); tCmd = setTimeout(() => { bufCmd = null; avisoCmd('', 0); }, 10000);
}, true);

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
        const r = await fetch(base, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
    const fin = () => { if (fin.done) return; fin.done = true; if (vozFin === fin) vozFin = null; resolve(); };
    if (silencio || !texto) { fin(); return; }
    vozFin = fin;
    if (window.AdmiraVoces && typeof AdmiraVoces.speak === 'function') {
      const ok = AdmiraVoces.speak(persona, String(texto).slice(0, 600), { onend: fin, onerror: fin, lang: idioma === 'en' ? 'en-US' : 'es-ES' });
      if (!ok) fin();
      return;
    }
    fin();
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
    const hist = { tema: (snap && snap.tema) || temaActual || TEMA_DEFECTO, turnos: (snap && snap.turnos) || [] };
    let texto;
    try {
      texto = await askConsejero(sig.persona, promptDe(sig.persona, hist) + sufijoIdioma(idioma));
    } catch (e) {
      estado('Sin respuesta de ' + sig.persona + ' (' + (e.message || e) + '). Paso.');
      // Sin backend: una línea propia del consejero (rota), nunca la misma frase en bucle para todos.
      const bag = DEMO[sig.persona] || ['Seguimos.'];
      const i = demoIdx[sig.persona] || 0; demoIdx[sig.persona] = i + 1;
      texto = bag[i % bag.length];
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

async function arrancarConversacion() {
  if (enCurso) { pintarControles(); return; }
  enCurso = true;
  autonomo = true;
  document.body.classList.add('en-curso');
  if ($('gesto')) $('gesto').hidden = true;
  $('hud').hidden = false;
  desbloquearVoz();
  const tema = temaActual || TEMA_AUTONOMO;
  if (!local) {
    try { await api('POST', { accion: 'tema', tema }); } catch (e) {}
  } else {
    docLocal.tema = tema;
  }
  estado('Consejo autónomo · ' + tema);
  pintarControles();
  await tick();
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(() => { if (enCurso && autonomo) tick(); }, 2000);
}
function pararConversacion() {
  autonomo = false;
  enCurso = false;
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  ocupado = false;
  document.body.classList.remove('en-curso');
  estado('Consejo autónomo en pausa');
}
async function empezar() {
  if (enCurso) { entrarFullscreen(); return; }
  entrarFullscreen();
  await arrancarConversacion();
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

function instalarControles() {
  if (instalarControles.ok) return;
  instalarControles.ok = true;
  const bind = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
  bind('btn-silencio', () => ejecutarExperto(silencio ? '/silencio off' : '/silencio on'));
  bind('btn-autonomo', () => ejecutarExperto(autonomo ? '/autonomo off' : '/autonomo on'));
  bind('btn-idioma', () => ejecutarExperto(idioma === 'en' ? '/idioma es' : '/idioma en'));
  bind('btn-mesa', () => ejecutarExperto('/mesa ' + (mesa === 'coetaneos' ? 'leyendas' : 'coetaneos')));
  const st = $('sel-tema');
  if (st && !st.options.length) {
    TEMAS_PRESET.forEach((t) => { const o = document.createElement('option'); o.value = t.id; o.textContent = t.es; st.appendChild(o); });
    const o = document.createElement('option'); o.value = 'otro'; o.textContent = 'Otro tema…'; st.appendChild(o);
    st.addEventListener('change', () => {
      if (st.value === 'otro') {
        // Sin window.prompt: un diálogo nativo sacaría de la pantalla completa.
        const inp = $('tema-otro');
        if (inp) { inp.hidden = false; inp.value = temaActual; inp.placeholder = idioma === 'en' ? 'Type a topic and press Enter' : 'Escribe el tema y pulsa Enter'; inp.focus(); inp.select(); }
        return;
      } else {
        const p = TEMAS_PRESET.find((x) => x.id === st.value);
        setTema((p && p.tema) || TEMA_AUTONOMO);
      }
      try { st.blur(); } catch (e) {}
    });
    ['keydown', 'keyup', 'keypress'].forEach((ev) => st.addEventListener(ev, (e) => e.stopPropagation()));
    const inp = $('tema-otro');
    if (inp) {
      inp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); const t = inp.value.trim(); inp.hidden = true; if (t) setTema(t); else pintarControles(); }
        else if (e.key === 'Escape') { e.preventDefault(); inp.hidden = true; pintarControles(); }
      });
      ['keyup', 'keypress'].forEach((ev) => inp.addEventListener(ev, (e) => e.stopPropagation()));
    }
  }
  bind('btn-carlos', () => ejecutarExperto(expertos.carlos ? '/consejero carlos silva fuera' : '/consejero carlos silva aparece'));
  bind('btn-bonomi', () => ejecutarExperto(expertos.bonomi ? '/consejero carlo bonomi fuera' : '/consejero carlo bonomi aparece'));
  pintarControles();
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
  instalarControles();
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
  const bi = !!guion.bilingue && lang !== 'es';
  const p = [
    { tipo: 'mesa', mesa: 'leyendas', titulo: '1 · Consejo de Leyendas', en: bi && ROTULOS_EN.leyendas, sub: LEYENDAS_TXT, ms: 8000 },
    { tipo: 'mesa', mesa: 'coetaneos', titulo: '2 · Consejo de Coetáneos', en: bi && ROTULOS_EN.coetaneos, sub: COETANEOS_TXT + (cabecera ? ' — ' + (lang === 'en' ? ROTULOS_EN.cabecera : 'en la cabecera') + ', ' + cabecera.nombre : ''), ms: 9000 },
    { tipo: 'rotulo', mesa: 'coetaneos', titulo: '3 · Conversación · consejero vs consejero', en: bi && ROTULOS_EN.conversacion, sub: lang === 'en' && guion.tituloEn ? guion.tituloEn : guion.titulo, ms: 5000 },
  ];
  guion.turnos.forEach((t, i) => p.push({ tipo: 'turno', i, persona: t.persona, mesa: mesaDeGuion(t.persona) }));
  p.push({ tipo: 'rotulo', mesa: 'coetaneos', titulo: guion.cierreTitulo || 'PortAventuraNeXT', sub: guion.cierre, ms: 0 });
  return p;
}

function rotulo(titulo, sub, en) {
  const r = $('rotulo');
  if (!titulo) { r.hidden = true; return; }
  const soloEn = lang === 'en' && en;
  $('rotulo-titulo').textContent = soloEn ? en : titulo;
  $('rotulo-sub').textContent = sub || '';
  const e = $('rotulo-en');
  e.textContent = lang === 'both' && en ? en : '';
  e.hidden = !(lang === 'both' && en);
  r.hidden = false;
}

// Cajas del flujo (Carlos, 14-11 17:11: «las cajas se pisan»): una sola caja a la vez, en la zona libre
// de la mesa (nunca encima de caras, placas ni del HUD), con funde de salida antes de la siguiente.
const FUNDE_MS = 260;
let globoFlujo = null;

function ocultarGloboFlujo() {
  const g = $('globo');
  if (g.hidden) return Promise.resolve();
  g.classList.add('fuera');
  return new Promise((res) => setTimeout(() => { g.hidden = true; res(); }, FUNDE_MS));
}

function pintarGloboFlujo() {
  const g = $('globo'); const box = cajaArte();
  if (!globoFlujo || !box || g.hidden) return;
  const { persona, mesa: m } = globoFlujo;
  const w = anchoGlobo(m, box);
  g.style.width = w + 'px';
  let fs = Math.max(12, Math.min(19, Math.round(box.h / 52)));
  let c = null;
  for (; fs >= 10; fs--) {
    g.style.fontSize = fs + 'px';
    const a = (ANCLA[m] || {})[persona] || anclaGuion(m, persona);
    c = cajaGlobo(m, a ? a.x : null, box, w, g.offsetHeight);
    if (c.cabe) break;
  }
  g.style.left = c.left + 'px';
  g.style.top = c.top + 'px';
  g.dataset.cola = c.cola;
  g.style.setProperty('--cola-x', c.colaX + 'px');
}

function mostrarGloboFlujo(persona, m, lineas, pensando) {
  const g = $('globo');
  globoFlujo = { persona, mesa: m };
  g.classList.add('flujo-caja', 'fuera');
  $('globo-nombre').textContent = persona + (ROLES[persona] ? ' · ' + ROLES[persona] : '');
  const es = lineas.find((l) => l.lang === 'es'); const en = lineas.find((l) => l.lang === 'en');
  $('globo-texto').textContent = es ? es.texto : (pensando ? 'pensando…' : '');
  $('globo-texto').hidden = !es && !pensando;
  $('globo-en').textContent = en ? en.texto : '';
  $('globo-en').hidden = !en;
  g.classList.toggle('pensando', !!pensando);
  g.hidden = false;
  pintarGloboFlujo();
  requestAnimationFrame(() => requestAnimationFrame(() => g.classList.remove('fuera')));
}

function esperar(ms, t) {
  return new Promise((res) => setTimeout(() => res(t === token), ms));
}

function hablarFlujo(persona, texto, idioma) {
  return new Promise((resolve) => {
    let hecho = false;
    const fin = () => { if (!hecho) { hecho = true; if (vozFin === fin) vozFin = null; resolve(); } };
    if (idioma === 'en' && !guion.sinVoz) { setTimeout(fin, msLectura(texto)); return; }
    if (silencio || !texto || guion.sinVoz || !(window.AdmiraVoces && typeof AdmiraVoces.speak === 'function')) {
      setTimeout(fin, msLectura(texto)); return;
    }
    vozFin = fin;
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
  await ocultarGloboFlujo();
  if (t !== token) return;
  verMesa(st.mesa);
  $('hud-mesa').textContent = 'Demo del Consejo · ' + (paso + 1) + '/' + pasos.length;
  if (st.tipo === 'mesa' || st.tipo === 'rotulo') {
    rotulo(st.titulo, st.sub, st.en);
    estado(st.tipo === 'mesa' ? 'Mesa de ' + nombreMesa(st.mesa) : '');
    if (!st.ms) { estado('Fin · ← para volver'); return; }
    if (!(await esperar(st.ms, t))) return;
  } else {
    rotulo('', '');
    if (conIA) mostrarGloboFlujo(st.persona, st.mesa, [], true);
    estado(st.persona + (conIA ? ' pensando…' : ' habla'));
    const texto = await textoDe(st);
    if (t !== token) return;
    dichos = dichos.filter((d) => d.paso !== paso).concat([{ paso, persona: st.persona, texto }]);
    if (conIA) await ocultarGloboFlujo();
    if (t !== token) return;
    const lineas = conIA ? [{ lang: 'es', texto }] : lineasTurno(guion.turnos[st.i], cabecera, lang);
    mostrarGloboFlujo(st.persona, st.mesa, lineas, false);
    pintarBarraFlujo(st);
    estado(st.persona + ' habla · ' + (st.i + 1) + '/' + guion.turnos.length);
    await hablarFlujo(st.persona, lineas.map((l) => l.texto).join(' '), lineas[0].lang);
    if (t !== token) return;
    if (!(await esperar(900, t))) return;
  }
  while (pausa && t === token) await esperar(300, t);
  if (t === token && paso < pasos.length - 1) ejecutarPaso(paso + 1);
}

function pintarBarraFlujo(st) {
  const bar = $('barra-escucha');
  // Una sola caja por turno: en el flujo de una pantalla no se pinta la barra de «lo último de la otra mesa».
  if (flujo) { bar.hidden = true; return; }
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
  instalarControles();
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
  window.addEventListener('resize', () => { colocarCabecera(); colocarLogo(); pintarGloboFlujo(); });
  $('mesa-img').addEventListener('load', () => { colocarCabecera(); colocarLogo(); pintarGloboFlujo(); });
  // Precarga de las dos mesas y del retrato: el cambio Leyendas ↔ Coetáneos no espera a la red.
  Object.values(IMG).forEach((u) => { const i = new Image(); i.src = u; });
  if (cabecera && cabecera.foto) { const i = new Image(); i.src = cabecera.foto; if (cabecera.objeto) { const j = new Image(); j.src = cabecera.objeto.foto; } }
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
