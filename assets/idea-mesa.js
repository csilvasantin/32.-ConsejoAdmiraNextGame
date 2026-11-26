/* idea-mesa.js — el mapa de PortAventura en el centro de la mesa del Consejo (home).
 *
 * Carlos 24-11-2026 (t402u/t403u): «show the idea» debe arrancar la idea y dejar el
 * mapa de PortAventura en el centro de la mesa, sin saltar solo a Coetáneos.
 * Opciones: Leyendas o Actuales (coetáneos). En ambos casos se queda en la mesa
 * elegida. Respeta la retícula (el mapa vive en el escenario, no tapa el menú
 * superior; las opciones van en la barra de demo de abajo o se invocan por CLI).
 */
import { comandoMostrarIdea, IDEAS_PRESET } from '/escena0-lib.mjs?v=20261126-lanzadera';

let actualIdea = IDEAS_PRESET[0] || { src: '/assets/escena0/idea-ip-portaventura.webp?v=20261119', pie: '', pieEn: '' };
function SRC() { return actualIdea.src; }
function PIE() { return actualIdea; }
function usar(idOrObj) {
  if (!idOrObj) return actualIdea;
  if (typeof idOrObj === 'string') {
    const p = IDEAS_PRESET.find((x) => x.id === idOrObj);
    if (p) actualIdea = p;
  } else if (idOrObj.src) {
    actualIdea = idOrObj;
  }
  colocar();
  return actualIdea;
}

function lang() {
  try {
    if (window.AdmiraIdioma && typeof window.AdmiraIdioma.lang === 'function') {
      return window.AdmiraIdioma.lang() === 'en' ? 'en' : 'es';
    }
  } catch (e) {}
  return document.documentElement.lang === 'en' ? 'en' : 'es';
}
function T(es, en) { return lang() === 'en' ? en : es; }
function genActual() {
  const g = document.querySelector('.council-image');
  const d = g && g.getAttribute('data-generation');
  return d === 'coetaneos' ? 'coetaneos' : 'leyendas';
}

let ideaOn = false;
let ideaGrande = false;

function irA(mesa) {
  if (!mesa || mesa === genActual()) return;
  if (typeof window.setGen === 'function') window.setGen(mesa);
  else if (typeof window.handleCliCommand === 'function') window.handleCliCommand('/' + mesa);
  else if (typeof window.handleCliCommandBase === 'function') window.handleCliCommandBase('/' + mesa);
}

function caja() {
  const root = document.querySelector('.council-image');
  const img = document.getElementById('council-img');
  if (!root || !img) return null;
  const sr = root.getBoundingClientRect();
  const ir = img.getBoundingClientRect();
  const nw = img.naturalWidth || 1280, nh = img.naturalHeight || 720;
  const s = Math.min(ir.width / nw, ir.height / nh) || 1;
  const w = nw * s, h = nh * s;
  return {
    x: ir.left - sr.left + (ir.width - w) / 2,
    y: ir.top - sr.top + (ir.height - h) / 2,
    w, h
  };
}

function asegurarDom() {
  const root = document.querySelector('.council-image');
  if (!root) return null;
  let el = document.getElementById('idea-mesa');
  if (el) return el;
  el = document.createElement('figure');
  el.id = 'idea-mesa';
  el.hidden = true;
  el.innerHTML = '<img id="idea-mesa-img" alt="La idea">'
    + '<figcaption id="idea-mesa-pie"></figcaption>'
    + '<button type="button" id="idea-mesa-cerrar" aria-label="Ocultar la idea">×</button>';
  root.appendChild(el);
  el.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'idea-mesa-cerrar') { e.stopPropagation(); aplicar({ on: false }); return; }
    ideaGrande = !ideaGrande;
    colocar();
  });
  if (!document.getElementById('idea-mesa-css')) {
    const st = document.createElement('style');
    st.id = 'idea-mesa-css';
    st.textContent = '#idea-mesa{position:absolute;z-index:12;margin:0;transform:translateX(-50%);background:#0d0a05;border:2px solid #c9a227;box-shadow:4px 4px 0 #000;cursor:zoom-in}'
      + '#idea-mesa[hidden]{display:none}'
      + '#idea-mesa img{display:block;width:100%;height:auto}'
      + '#idea-mesa figcaption{position:absolute;left:0;right:0;bottom:0;padding:3px 8px;background:rgba(10,8,4,.78);color:#ffd75e;font:600 11px/1.3 system-ui,sans-serif}'
      + '#idea-mesa figcaption:empty{display:none}'
      + '#idea-mesa.grande{cursor:zoom-out;z-index:28}'
      + '#idea-mesa-cerrar{position:absolute;top:-12px;right:-12px;width:26px;height:26px;border-radius:50%;border:1px solid #c9a227;background:#1a140a;color:#ffd75e;font:700 16px/24px system-ui,sans-serif;cursor:pointer}'
      + '#demo-consejo .idea-mesa-opts{display:inline-flex;gap:4px;align-items:center}'
      + '#demo-consejo .idea-mesa-opts button{appearance:none;background:#1a140a;color:#ffd75e;border:1px solid #c9a227;padding:8px 12px;font:700 13px/1 system-ui,sans-serif;cursor:pointer}'
      + '#demo-consejo .idea-mesa-opts button[aria-pressed="true"]{background:#c9a227;color:#1a140a}';
    document.head.appendChild(st);
  }
  return el;
}

function colocar() {
  const el = asegurarDom();
  if (!el) return;
  const box = caja();
  if (!ideaOn || !box) { el.hidden = true; return; }
  const img = document.getElementById('idea-mesa-img');
  if (img && img.getAttribute('src') !== SRC()) img.src = SRC();
  const pie = document.getElementById('idea-mesa-pie');
  if (pie) pie.textContent = lang() === 'en' ? (PIE().pieEn || '') : (PIE().pie || '');
  const ancho = ideaGrande ? 0.72 : 0.34;
  el.style.width = (box.w * ancho) + 'px';
  el.style.left = (box.x + box.w / 2) + 'px';
  el.style.top = (box.y + box.h * (ideaGrande ? 0.08 : 0.52)) + 'px';
  el.classList.toggle('grande', ideaGrande);
  el.hidden = false;
}

function pintarBarra() {
  const bar = document.getElementById('demo-consejo');
  if (!bar) return;
  let ops = bar.querySelector('.idea-mesa-opts');
  if (!ops) {
    ops = document.createElement('span');
    ops.className = 'idea-mesa-opts';
    ops.setAttribute('role', 'group');
    ops.setAttribute('aria-label', T('Qué consejo presenta la idea', 'Which council presents the idea'));
    ops.innerHTML = '<button type="button" data-idea-act="toggle"></button>'
      + '<button type="button" data-idea-mesa="leyendas"></button>'
      + '<button type="button" data-idea-mesa="coetaneos"></button>';
    const estado = document.getElementById('demo-consejo-estado');
    bar.insertBefore(ops, estado || null);
    ops.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      if (b.getAttribute('data-idea-act') === 'toggle') aplicar({ on: !ideaOn });
      else if (b.getAttribute('data-idea-mesa')) aplicar({ on: true, mesa: b.getAttribute('data-idea-mesa') });
    });
  }
  const toggle = ops.querySelector('[data-idea-act="toggle"]');
  const ley = ops.querySelector('[data-idea-mesa="leyendas"]');
  const act = ops.querySelector('[data-idea-mesa="coetaneos"]');
  if (toggle) {
    toggle.textContent = ideaOn ? T('💡 Ocultar la idea', '💡 Hide the idea') : T('💡 Mostrar la idea', '💡 Show the idea');
    toggle.setAttribute('aria-pressed', ideaOn ? 'true' : 'false');
  }
  if (ley) {
    ley.textContent = T('Leyendas', 'Legends');
    ley.setAttribute('aria-pressed', ideaOn && genActual() === 'leyendas' ? 'true' : 'false');
  }
  if (act) {
    act.textContent = T('Actuales', 'Contemporaries');
    act.setAttribute('aria-pressed', ideaOn && genActual() === 'coetaneos' ? 'true' : 'false');
  }
}

function aviso(msg) {
  const el = document.getElementById('demo-consejo-estado');
  if (el) el.textContent = msg;
}

function aplicar(cmd) {
  if (cmd && cmd.mesa) irA(cmd.mesa);
  if (cmd.on === false) { ideaOn = false; ideaGrande = false; }
  else if (cmd.on === true) ideaOn = true;
  else ideaOn = !ideaOn;
  if (!ideaOn) ideaGrande = false;
  colocar();
  pintarBarra();
  const mesaTxt = ideaOn ? (genActual() === 'coetaneos' ? T(' · Actuales', ' · Contemporaries') : T(' · Leyendas', ' · Legends')) : '';
  const msg = ideaOn ? T('💡 Idea encima de la mesa', '💡 Idea on the table') + mesaTxt : T('💡 Idea oculta', '💡 Idea hidden');
  aviso(msg);
  return { ok: true, texto: msg, idea: ideaOn, mesa: genActual() };
}

function manejar(text, setActionLine, addUserEntry) {
  const cmd = comandoMostrarIdea(text);
  if (!cmd) return false;
  if (cmd.error) {
    if (typeof addUserEntry === 'function') addUserEntry(text);
    if (typeof setActionLine === 'function') setActionLine(cmd.error);
    aviso(cmd.error);
    return true;
  }
  if (typeof addUserEntry === 'function') addUserEntry(text);
  const r = aplicar(cmd);
  if (typeof setActionLine === 'function') setActionLine(r.texto);
  return true;
}

function montar() {
  asegurarDom();
  pintarBarra();
  window.addEventListener('resize', colocar);
  const img = document.getElementById('council-img');
  if (img) img.addEventListener('load', colocar);
  const bar = document.getElementById('demo-consejo');
  if (!bar) {
    const mo = new MutationObserver(() => {
      if (document.getElementById('demo-consejo')) { pintarBarra(); mo.disconnect(); }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
}

window.IdeaMesa = {
  comando: comandoMostrarIdea,
  manejar, aplicar, colocar, usar,
  on: () => ideaOn,
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
else montar();
