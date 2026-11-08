/*
 * Macintosh 1984 en la mesa del Consejo — SmithMacMini.
 * HOY <fecha> + las 3 últimas misiones completadas (#FLT + persona).
 */
export function todayMadrid(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
}

export function isHoy(mission, day = todayMadrid()) {
  if (!mission) return false;
  const stamped = String(mission.display_day || '').slice(0, 10);
  if (stamped) return stamped === day;
  const ts = Number(mission.created_at || mission.updated_at || 0);
  if (!ts) return false;
  const ms = ts > 1e12 ? ts : ts * 1000;
  return todayMadrid(ms) === day;
}

export function seatOf(mission) {
  let persona = String(mission.persona || mission.assignee || '');
  persona = persona.replace(/GrokBot$/i, '').replace(/MacMini$/i, '').replace(/MacBook.*$/i, '').trim();
  const role = String(mission.role || '').split('·')[0].trim();
  const bits = [persona, role].filter(Boolean);
  return bits.join(' · ') || 'sin silla';
}

export const IDLE_COPY = 'HOY\n…';
export const ERROR_COPY = 'HOY\nsin cable';
export const SCREEN_JPEG = 'https://fleet.admira.live/api/grokbot/screen.jpg';
export const EVIDENCE_URL = '/api/council/evidence';
export const EVIDENCE_POLL_MS = 5000;
export const CHAIR_ALIAS = {
  'Steve Jobs': 'Jobs', Jobs: 'Jobs',
  'Steve Wozniak': 'Wozniak', Wozniak: 'Wozniak',
  'George Lucas': 'Lucas', Lucas: 'Lucas',
  'Walt Disney': 'Disney', Disney: 'Disney',
  'Elon Musk': 'Musk', Musk: 'Musk',
  'Jensen Huang': 'Huang', Huang: 'Huang',
};
export function chairAlias(persona) {
  const s = String(persona || '').trim();
  if (CHAIR_ALIAS[s]) return CHAIR_ALIAS[s];
  const last = s.split(/\s+/).pop();
  return CHAIR_ALIAS[last] || null;
}

/* La pantalla tiene tres modos, y los periféricos del dibujo son los mandos:
   el TECLADO enciende el logo de Admira y el RATÓN saca la última misión con
   detalle. Volver a pulsar devuelve a HOY. */
export const MODOS = ['hoy', 'detalle', 'logo', 'pong', 'remote'];

export function envolver(txt, ancho, maxLineas) {
  const palabras = String(txt == null ? '' : txt).trim().split(/\s+/).filter(Boolean);
  const out = [];
  let cur = '';
  for (const p of palabras) {
    const cand = cur ? cur + ' ' + p : p;
    if (cand.length <= ancho) { cur = cand; continue; }
    if (cur) out.push(cur);
    if (out.length >= maxLineas) { cur = ''; break; }
    cur = p.length > ancho ? p.slice(0, ancho - 1) + '…' : p;
  }
  if (cur && out.length < maxLineas) out.push(cur);
  return out.slice(0, maxLineas);
}

export const DETALLE_ANCHO = 20;   // caracteres por línea con la tipo pequeña

export function ultimasMisiones(missions, day = todayMadrid(), n = 3) {
  return (Array.isArray(missions) ? missions : [])
    .filter((m) => m && m.status === 'resolved' && isHoy(m, day))
    .sort((a, b) => Number(b.updated_at || b.created_at || 0) - Number(a.updated_at || a.created_at || 0))
    .slice(0, n);
}

export function ultimaMision(missions, day = todayMadrid()) {
  return ultimasMisiones(missions, day, 1)[0] || null;
}


export function tituloCorto(text, max = 8) {
  const words = String(text == null ? '' : text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'sin titulo';
  return words.slice(0, Math.max(1, Math.min(max, words.length))).join(' ');
}

/** Match counselor chair (Jobs…) against mission persona/assignee/role (…GrokBot). */
/* Agentes que se sientan en cada silla además de «<Alias>GrokBot» (consejo/estado):
   Musk → Merovingio (deepagent), Huang → Cypher. Sin esto, Musk/Huang nunca tenían
   «proyecto anterior» aunque su agente hubiera cerrado misiones. */
export const CHAIR_AGENTS = {
  Jobs: ['jobs'], Wozniak: ['wozniak'], Lucas: ['lucas'], Disney: ['disney'],
  Musk: ['musk', 'elon', 'merovingio'], Huang: ['huang', 'jensen', 'cypher'],
};
export function matchesChair(mission, alias) {
  const a = chairAlias(alias) || String(alias || '').trim();
  if (!a || !mission) return false;
  const who = [mission.persona, mission.assignee, mission.role].map((x) => String(x || '')).join(' ');
  const n = who.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const keys = CHAIR_AGENTS[a] || [a.toLowerCase()];
  return keys.some((key) => n.includes(key));
}

/** Last resolved encargo for a chair (any day). Bare id never alone: keep subject words. */
export function ultimaCerrada(missions, alias = null) {
  const rows = (Array.isArray(missions) ? missions : [])
    .filter((m) => m && m.status === 'resolved' && (!alias || matchesChair(m, alias)))
    .sort((a, b) => Number(b.updated_at || b.created_at || 0) - Number(a.updated_at || a.created_at || 0));
  return rows[0] || null;
}

export function proyectoAnteriorLineas(mission) {
  if (!mission) return ['SIN HISTORIAL', '', 'nada cerrado'];
  const id = String(mission.id || '????').replace(/^FLT-/, '');
  const frase = tituloCorto(mission.subject || mission.title || '', 8);
  const quien = seatOf(mission).split('·')[0].trim().slice(0, DETALLE_ANCHO) || '—';
  const hora = horaDe(mission);
  const day = String(mission.display_day || '').slice(0, 10);
  const fecha = day ? (day.slice(8, 10) + '-' + day.slice(5, 7)) : '';
  // doctrina «ningún número va solo»: #id + frase corta en la cabecera
  const head = ('#' + id + ' ' + frase).trim();
  return [
    'PROYECTO ANTERIOR',
    ...envolver(head, DETALLE_ANCHO, 3),
    quien + (hora ? '  ' + hora : ''),
    fecha ? ('cerrado ' + fecha) : '',
  ].filter((l, i, arr) => l || i < arr.length - 1);
}

export function missionCaptureUrl(mission) {
  if (!mission) return '';
  return String(mission.proof_image || mission.process_image || mission.live_shot || '').trim();
}

/** Pure: should mosaic avoid empty SIN SEÑAL given evidence JSON? */
export function mosaicHasWork(data) {
  if (!data || !data.ok) return false;
  if (data.image) return true;
  if (data.encargo && (data.encargo.etiqueta || data.encargo.titulo || data.encargo.numero)) return true;
  if (data.mission && (data.mission.subject || data.mission.id)) return true;
  return false;
}


function horaDe(m) {
  const ts = Number(m.updated_at || m.created_at || 0);
  if (!ts) return '';
  try {
    return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .format(new Date(ts > 1e12 ? ts : ts * 1000));
  } catch (_) { return ''; }
}

// Una misión por pantalla, con su ficha entera. El ratón pasa a la siguiente y
// el teclado a la anterior (Carlos, 2026-09-19), así que la cabecera dice
// SIEMPRE por cuál vas: sin ese 2/3 no se sabe si quedan más.
export function detalleLineas(missions, day = todayMadrid(), idx = 0) {
  const rows = ultimasMisiones(missions, day);
  if (!rows.length) return ['SIN MISIONES', '', 'cerradas hoy'];
  const n = rows.length;
  const i = ((Math.trunc(idx) % n) + n) % n;
  const m = rows[i];
  const id = String(m.id || 'FLT-????').replace(/^FLT-/, '');
  const quien = seatOf(m).split('·')[0].trim().slice(0, DETALLE_ANCHO) || '—';
  const hora = horaDe(m);
  return [
    'MISION ' + (i + 1) + '/' + n,
    '#' + id + (hora ? '  ' + hora : ''),
    quien,
    '--------------------'.slice(0, DETALLE_ANCHO),
    // El asunto ya no se recorta a lo que cabe: se escribe entero y la pantalla
    // lo pasea sola (Carlos, 2026-09-19). Antes se cortaba en la cuarta línea y
    // te quedabas sin saber de qué iba la misión.
  ].concat(envolver(m.subject || m.title || '', DETALLE_ANCHO, 12));
}

export function linesFor(missions, day = todayMadrid()) {
  const rows = (Array.isArray(missions) ? missions : [])
    .filter((m) => m && m.status === 'resolved' && isHoy(m, day))
    .sort((a, b) => Number(b.updated_at || b.created_at || 0) - Number(a.updated_at || a.created_at || 0))
    .slice(0, 3);
  const head = `HOY ${day.slice(8, 10)}-${day.slice(5, 7)}`;
  if (!rows.length) return [head, 'sin FLT done'];
  return [head].concat(rows.map((m) => {
    const id = String(m.id || 'FLT-????').replace(/^FLT-/, '');
    const nick = seatOf(m).split('·')[0].trim().slice(0, 10) || '—';
    return `#${id} ${nick}`;
  }));
}

export function paintCrt(el, text) {
  if (!el) return Promise.resolve();
  // Testigo de relevo: el tecleado va letra a letra, y al pasar de ficha rápido
  // dos escrituras se pisaban sobre el mismo elemento y salía el texto a medias.
  // La última que entra manda; la anterior se retira en su siguiente tic.
  const turno = (el.__crtTurno = (el.__crtTurno || 0) + 1);
  el.textContent = '';
  // El paso se ajusta al largo para que CUALQUIER pantalla tarde lo mismo en
  // escribirse. A dos caracteres fijos, una ficha de detalle (el triple de texto
  // que «HOY») tardaba el triple y se quedaba a medias.
  const paso = Math.max(2, Math.ceil(text.length / 60));
  const t0 = Date.now();
  let i = 0;
  return new Promise((resolve) => {
    const tick = () => {
      if (el.__crtTurno !== turno) return resolve();
      // PLAZO. En una pestaña de fondo el navegador estrangula los
      // temporizadores a ~1 tic por segundo: el tecleo no acababa nunca, el
      // latido lo encontraba a medias y lo reiniciaba, así que la pantalla se
      // quedaba clavada en cuatro letras. Pasado el plazo se renuncia al efecto
      // y se escribe entera: mejor sin animación que a medias.
      if (Date.now() - t0 > 3000) { el.textContent = text; return resolve(); }
      i += paso;
      el.textContent = text.slice(0, i);
      // Antes saltaba al final en cada tic. Con fichas que no caben, eso escribía
      // la ficha por el final; ahora se lee desde arriba y al acabar la pasea
      // paseaTexto().
      el.scrollTop = 0;
      if (i >= text.length) resolve();
      else setTimeout(tick, 12);
    };
    tick();
  });
}

export async function fetchHoy(fetchImpl = fetch) {
  const res = await fetchImpl('https://api.yokup.com/fleet/missions?limit=80', { cache: 'no-store' });
  const data = await res.json();
  return data.missions || data.items || [];
}

/* #5113b — `missions?limit=80` solo trae abiertas/en curso (0 resolved), así que
   ultimaCerrada() nunca encontraba nada: ratón «SIN HISTORIAL» y mosaico sin
   último cerrado. Las cerradas se piden aparte (públicas, sin cookies de flota). */
export const CERRADAS_URL = 'https://api.yokup.com/fleet/missions?status=resolved&limit=120';
export const CERRADAS_TTL_MS = 5 * 60 * 1000;
let cerradasCache = [];
let cerradasAt = 0;
let cerradasPending = null;
export async function fetchCerradas(fetchImpl = fetch, force = false) {
  if (!force && cerradasCache.length && Date.now() - cerradasAt < CERRADAS_TTL_MS) return cerradasCache;
  if (cerradasPending) return cerradasPending;
  cerradasPending = (async () => {
    try {
      const res = await fetchImpl(CERRADAS_URL, { cache: 'no-store' });
      if (!res || !res.ok) return cerradasCache;
      const data = await res.json();
      const rows = data.missions || data.items || [];
      if (Array.isArray(rows) && rows.length) { cerradasCache = rows; cerradasAt = Date.now(); }
      return cerradasCache;
    } catch (_) { return cerradasCache; }
    finally { cerradasPending = null; }
  })();
  return cerradasPending;
}

let visible = false;
let focused = false;
// Arranca con el LOGO (Carlos, 2026-09-19): encender el Mac enseña la marca.
// Desde ahí, el ratón avanza y el teclado retrocede por las 3 últimas misiones;
// al pasarse por cualquiera de los dos extremos se vuelve al logo, así que la
// marca siempre está a un clic y nadie se queda encerrado en las fichas.
let modo = 'logo';
let detalleIdx = 0;
let misionesCache = [];
let beatTimer = null;
let lastRoot = null;
let lastFetch = fetch;
let lastText = IDLE_COPY;

/* Ancho natural de mac-1984-mesa.png. El plano del CRT se compone en 512x342
   —los píxeles reales del Macintosh 128K— y la matriz --mac-scr lo proyecta
   sobre el tubo de ESE dibujo, a tamaño natural. --mac-k reduce el resultado al
   ancho al que la mesa esté pintando el Mac, así que la proyección sigue siendo
   exacta a cualquier resolución. La traslación de una matrix3d va en px: no hay
   forma de escribirla en % y por eso este factor se mide, no se supone. */
export const MAC_ART_W = 967;          // mac-1984-mesa.png
export const MAC_FRONT_W = 918;        // mac-1984-front.png

function fitOne(el, natural, prop) {
  if (!el) return 0;
  const w = el.clientWidth || (el.getBoundingClientRect ? el.getBoundingClientRect().width : 0) || 0;
  if (!w) return 0;                    // oculto (display:none) -> no pisamos el valor bueno
  const k = w / natural;
  el.style.setProperty(prop, String(k));
  return k;
}

export function fitScreen(root = lastRoot || (typeof document !== 'undefined' ? document : null)) {
  if (!root || !root.querySelector) return 0;
  const k = fitOne(root.querySelector('#mac-hoy-prop'), MAC_ART_W, '--mac-k');
  // TODAS las vistas frontales, no sólo la primera: cada una mide distinto (la
  // grande del centro y la pequeña de la barra SCUMM) y cada una guarda su
  // propio factor, porque la traslación de la matriz va en píxeles.
  root.querySelectorAll('.mac-hoy-front-stage').forEach((el) => fitOne(el, MAC_FRONT_W, '--mac-front-k'));
  return k;
}

function watchScreen(root) {
  const prop = root && root.querySelector ? root.querySelector('#mac-hoy-prop') : null;
  if (!prop || prop.__macFit) return;
  prop.__macFit = true;
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => fitScreen(root));
    ro.observe(prop);
    const stages = Array.from(root.querySelectorAll('.mac-hoy-front-stage'));
    stages.forEach((s) => ro.observe(s));
    [prop.querySelector('img'), ...stages.map((s) => s.querySelector('img'))].forEach((img) => {
      if (!img) return;
      ro.observe(img);
      if (!img.complete) img.addEventListener('load', () => fitScreen(root), { once: true });
    });
  } else if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => fitScreen(root));
  }
}

function emitScreen(root, name, detail) {
  if(root?.dispatchEvent && typeof CustomEvent!=='undefined')root.dispatchEvent(new CustomEvent(name,{detail}));
}

function aplicarModo(root) {
  if (!root || !root.querySelectorAll) return;
  // Todas las entradas (disquetera, teclado, menú) pasan por aquí. Salir del
  // escritorio invalida también selecciones y errores de imagen en vuelo.
  if (modo !== 'remote') stopRemotePoll();
  if (modo !== 'pong') paraPong();
  root.querySelectorAll('#mac-hoy-prop, .mac-hoy-front-stage').forEach((el) => {
    MODOS.forEach((m) => el.classList.toggle('modo-' + m, m === modo));
  });
  remoteImgs(root).forEach((img) => {
    // No depender de reglas genéricas para las imágenes de la carcasa:
    // captura y Pong nunca deben quedar visibles simultáneamente.
    if (img.style) img.style.display = modo === 'remote' ? 'block' : 'none';
  });
  emitScreen(root,'mac-screen-mode',{mode:modo,persona:remotePersona});
}

export function modoActual() { return modo; }

export function setModo(nuevo, root = lastRoot || (typeof document !== 'undefined' ? document : null), fetchImpl = lastFetch) {
  if (MODOS.indexOf(nuevo) < 0) return modo;
  modo = nuevo;
  if (!root) return modo;
  lastRoot = root;
  aplicarModo(root);
  if (modo !== 'logo' && modo !== 'remote' && modo !== 'pong') draw(root, fetchImpl);
  return modo;
}

/* ── El texto largo se pasea solo ───────────────────────────────────────────
   Una ficha entera no cabe en el tubo. En vez de recortarla, la pantalla la
   recorre de arriba abajo y vuelve, con una pausa en cada extremo para poder
   leer. Si cabe entera no se mueve: nada de movimiento gratuito. */
function paseaTexto(el) {
  if (!el) return;
  if (el.__paseo) { clearInterval(el.__paseo); el.__paseo = null; }
  el.scrollTop = 0;
  const alcance = el.scrollHeight - el.clientHeight;
  if (alcance <= 2) return;
  let dir = 1, pausa = 16;
  el.__paseo = setInterval(() => {
    if (pausa > 0) { pausa--; return; }
    el.scrollTop += dir;
    if (el.scrollTop >= alcance) { dir = -1; pausa = 16; }
    else if (el.scrollTop <= 0) { dir = 1; pausa = 16; }
  }, 90);
}

/* Todos los tubos del mismo Mac —el de la mesa, el de la vista frontal y el de
   la barra SCUMM— se escriben a la vez: son dibujos distintos del mismo cacharro
   y, si sólo se pintara uno, abrir otro lo encontraba en negro. Por CLASE y no
   por id, para que añadir una vista más no obligue a volver aquí a alargar una
   lista (que es justo lo que pasó al meter el Mac en la barra). */
const TUBOS = '.mac-hoy-crt, .mac-hoy-crt-front';
function tubos(root) {
  return root && root.querySelectorAll ? Array.from(root.querySelectorAll(TUBOS)) : [];
}

function paraPaseo(root) {
  tubos(root).forEach((el) => {
    if (el && el.__paseo) { clearInterval(el.__paseo); el.__paseo = null; }
  });
}

/* ── Pong en la pantalla, al pulsar la disquetera ───────────────────────────
   Se juega solo: es un cacharro sobre una mesa, no un mando. Las palas siguen
   la bola SÓLO cuando viene hacia ellas y con velocidad tope; si siguieran
   siempre no fallarían nunca y el peloteo no acabaría jamás. */
let pongRaf = null;
let jugador = 0;          // -1 sube, +1 baja, 0 quieto — lo mueven teclado y ratón
export function paraPong() {
  if (pongRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(pongRaf);
  pongRaf = null;
  jugador = 0;
}
export function mandoPong(dir) { jugador = dir; }
export function estadoPong() { return { jugando: !!pongRaf, jugador }; }

function arrancaPong(root) {
  // El juego se pinta en TODOS los tubos a la vez —la mesa y la vista frontal—
  // porque son dos dibujos del mismo Mac: si sólo se pintara en uno, abrir el
  // frontal dejaba la pantalla en negro con la partida corriendo por detrás.
  const lienzos = root && root.querySelectorAll
    ? Array.from(root.querySelectorAll('.mac-hoy-pong')).filter((c) => c && c.getContext)
    : [];
  if (!lienzos.length) return;
  const ctxs = lienzos.map((c) => c.getContext('2d'));
  const cv = lienzos[0];
  const W = cv.width, H = cv.height;
  const PW = 12, PH = 68, BOLA = 12, TOPE = 5.4, BORDE = 26;
  let izq = (H - PH) / 2, der = (H - PH) / 2;
  let bx = W / 2, by = H / 2, vx = 5, vy = 3.2, marcaI = 0, marcaD = 0;
  const saca = (hacia) => { bx = W / 2; by = H / 2; vx = 5 * hacia; vy = (Math.random() * 4 - 2) || 2; };
  const sigue = (y, objetivo) => {
    const d = objetivo - (y + PH / 2);
    return Math.max(BORDE, Math.min(H - PH - BORDE, y + Math.max(-TOPE, Math.min(TOPE, d))));
  };
  paraPong();
  const cuadro = () => {
    bx += vx; by += vy;
    if (by <= BORDE) { by = BORDE; vy = -vy; }
    if (by + BOLA >= H - BORDE) { by = H - BORDE - BOLA; vy = -vy; }
    // La pala IZQUIERDA es tuya: la mueven el teclado (arriba) y el ratón (abajo)
    // del propio dibujo. La derecha la lleva la máquina, y sólo persigue la bola
    // cuando viene hacia ella: si la siguiera siempre no fallaría nunca.
    izq = Math.max(BORDE, Math.min(H - PH - BORDE, izq + jugador * (TOPE + 1.6)));
    der = sigue(der, vx > 0 ? by : H / 2);
    const xI = BORDE + 8, xD = W - BORDE - 8 - PW;
    if (vx < 0 && bx <= xI + PW && bx >= xI - 6 && by + BOLA >= izq && by <= izq + PH) { bx = xI + PW; vx = -vx; vy += (by - (izq + PH / 2)) * 0.05; }
    if (vx > 0 && bx + BOLA >= xD && bx + BOLA <= xD + PW + 6 && by + BOLA >= der && by <= der + PH) { bx = xD - BOLA; vx = -vx; vy += (by - (der + PH / 2)) * 0.05; }
    vy = Math.max(-6, Math.min(6, vy));
    if (bx < -30) { marcaD++; saca(1); }
    if (bx > W + 30) { marcaI++; saca(-1); }

    ctxs.forEach((ctx) => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#7fe28d';
      for (let y = BORDE; y < H - BORDE; y += 26) ctx.fillRect(W / 2 - 3, y, 6, 14);
      ctx.fillRect(xI, izq, PW, PH);
      ctx.fillRect(xD, der, PW, PH);
      ctx.fillRect(bx, by, BOLA, BOLA);
      ctx.font = '30px "Press Start 2P", monospace';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'right'; ctx.fillText(String(marcaI), W / 2 - 34, BORDE + 6);
      ctx.textAlign = 'left';  ctx.fillText(String(marcaD), W / 2 + 34, BORDE + 6);
    });
    pongRaf = requestAnimationFrame(cuadro);
  };
  cuadro();
}

export function alternaPong(root = lastRoot || (typeof document !== 'undefined' ? document : null), fetchImpl = lastFetch) {
  if (!root || !visible) return modo;
  lastRoot = root;
  if (modo === 'pong') { modo = 'logo'; detalleIdx = 0; paraPong(); aplicarModo(root); if (focused) pintarDetalle(root); return modo; }
  modo = 'pong';
  paraPaseo(root);
  aplicarModo(root);
  pararDetalle();
  arrancaPong(root);
  return modo;
}

function textoDelModo() {
  if (modo === 'hoy') return linesFor(misionesCache).join('\n');
  return detalleLineas(misionesCache, todayMadrid(), detalleIdx).join('\n');
}

// Repinta SIN volver a la red: navegar entre fichas no debe costar una petición
// por clic. La caché la refresca draw() cada 45 s o al encender el Mac.
function repinta(root) {
  const ts = tubos(root);
  if (!ts.length) return;
  paraPaseo(root);
  lastText = textoDelModo();
  ts.forEach((t) => paintCrt(t, lastText).then(() => paseaTexto(t)));
}

export function avanzaPantalla(delta, root = lastRoot || (typeof document !== 'undefined' ? document : null), fetchImpl = lastFetch) {
  if (!root || !visible) return modo;
  lastRoot = root;
  const n = misionesCache.length;
  if (modo === 'pong') paraPong();
  if (modo === 'logo' || modo === 'pong') {
    modo = 'detalle';
    detalleIdx = (n && delta < 0) ? n - 1 : 0;
  } else if (!n) {
    // Todavía se están pidiendo: navegar a ciegas con n=1 hacía que el segundo
    // clic se desbordara y volviera al logo. Mejor no moverse hasta que lleguen.
    return modo;
  } else {
    detalleIdx += (delta >= 0 ? 1 : -1);
    if (detalleIdx >= n || detalleIdx < 0) { modo = 'logo'; detalleIdx = 0; }
  }
  aplicarModo(root);
  if (modo !== 'logo') {
    if (!misionesCache.length) draw(root, fetchImpl);   // primera vez: hay que pedirlas
    else repinta(root);
  }
  return modo;
}

async function draw(root, fetchImpl) {
  const ts = tubos(root);
  const prop = root.querySelector('#mac-hoy-prop');
  if (!ts.length || !prop || !visible) return;
  aplicarModo(root);
  if (modo === 'logo' || modo === 'pong' || modo === 'remote') return;
  paraPaseo(root);
  prop.classList.add('refreshing');
  // El comodín de carga dice en qué pantalla estás: poner «HOY …» mientras se
  // pide una ficha de detalle despistaba.
  const cargando = modo === 'detalle' ? 'MISION\n…' : IDLE_COPY;
  ts.forEach((t) => { t.textContent = cargando; });
  try {
    const ms = await fetchHoy(fetchImpl);
    misionesCacheFull = Array.isArray(ms) ? ms : [];
    misionesCache = ultimasMisiones(ms);
    lastText = textoDelModo();
    // Si la pantalla ya dice exactamente eso, no se vuelve a teclear: el latido
    // de 45 s reescribía la ficha que estabas leyendo, y en una pestaña de fondo
    // —donde el navegador estrangula los temporizadores— no llegaba a acabarla
    // nunca, así que el texto se quedaba siempre a medias.
    // A la vez, no en fila: cada tubo se teclea con su propio temporizador y
    // paintCrt se rinde a los 3 s. Encadenándolos, el tercero —el de la barra—
    // empezaba con el plazo ya medio gastado y se quedaba en «HOY …».
    await Promise.all(ts.map((t) => (t.textContent !== lastText ? paintCrt(t, lastText) : null)));
    ts.forEach(paseaTexto);
  } catch (_) {
    lastText = ERROR_COPY;
    await Promise.all(ts.map((t) => paintCrt(t, ERROR_COPY)));
  }
  prop.classList.remove('refreshing');
}

/* MOSAICO DEL CONSEJO (#5109/#5113). Rejilla 3×2 en el Mac de la mesa (#mac-hoy-glass),
   modo logo. Live = SCREEN_JPEG con credentials:'include' (misma sesión que Computadora);
   si falla → evidencia (imagen aunque no live) → último cerrado yokup → placard.
   Nunca baldosa vacía «SIN SEÑAL». */
export const MOSAIC_SEATS = ['Jobs', 'Wozniak', 'Lucas', 'Disney', 'Musk', 'Huang'];
export const MOSAIC_POLL_MS = 12000;
export const MOSAIC_NO_SIGNAL = 'SIN\nSEÑAL'; // legacy; mosaico ya no pinta esto vacío
let mosaicTimer = null;
let mosaicBusy = false;
const mosaicObjectUrls = new Map(); // alias -> blob: URL
let misionesCacheFull = [];

function mosaicHost(root) {
  return root && root.querySelector ? root.querySelector('#mac-hoy-glass') : null;
}
export function buildMosaic(root = lastRoot || (typeof document !== 'undefined' ? document : null)) {
  const host = mosaicHost(root);
  if (!host) return null;
  let grid = host.querySelector('.mac-hoy-mosaic');
  if (grid) return grid;
  const doc = host.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc || !doc.createElement) return null;
  grid = doc.createElement('div');
  grid.className = 'mac-hoy-mosaic';
  grid.setAttribute('aria-hidden', 'true');
  MOSAIC_SEATS.forEach((alias) => {
    const tile = doc.createElement('div');
    tile.className = 'mac-hoy-tile';
    tile.setAttribute('data-seat', alias);
    const img = doc.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    const ns = doc.createElement('pre');
    ns.className = 'mac-hoy-tile-ns';
    ns.textContent = '';
    const name = doc.createElement('span');
    name.className = 'mac-hoy-tile-name';
    name.textContent = alias.toUpperCase();
    tile.appendChild(img); tile.appendChild(ns); tile.appendChild(name); tile.appendChild(mosaicTimeEl(doc));
    grid.appendChild(tile);
  });
  host.appendChild(grid);
  return grid;
}
function mosaicRevoke(alias) {
  const prev = mosaicObjectUrls.get(alias);
  if (prev && typeof URL !== 'undefined' && URL.revokeObjectURL) {
    try { URL.revokeObjectURL(prev); } catch (_) {}
  }
  mosaicObjectUrls.delete(alias);
}
function mosaicShow(tile, src) {
  if (!tile) return false;
  const img = tile.querySelector('img');
  if (img) img.src = src;
  tile.classList.remove('sin-senal');
  return true;
}
/** Último recurso visual: placard SVG, NUNCA el CRT vacío «SIN SEÑAL». */
function mosaicPlacard(tile, alias, title, subtitle) {
  mosaicRevoke(alias);
  mosaicSetTime(tile, null);
  return mosaicShow(tile, evidencePlacard(title || 'sin historial', subtitle || String(alias || '')));
}
/* #5114 — Imagen EN VIVO de la Computadora. Fuente real del ultradetalle/Computadora
   (assets/mac-remote.js): POST fleet.admira.live/api/grokbot/remote con
   credentials:'include' + X-Fleet-CSRF, {action:'open'|'frame'} → JSON
   {frame:{jpeg base64}}. Ese canal NO se sondea desde el mosaico: 'open' activa la
   app GrokBot en el Mac mini, borra las demás sesiones remotas del mismo usuario
   (cerraría el ultradetalle abierto) y solo sirve para la silla seleccionada en
   GrokBot (remote_selection_changed). Por eso el mosaico REUTILIZA los fotogramas
   que mac-remote.js ya recibe (evento 'mac-remote-frame') y, si no hay, pide el
   proxy pasivo GET screen.jpg (misma cookie de sesión, GET sin CSRF). */
export const LIVE_FRAME_TTL_MS = 30000;
const liveFrames = new Map(); // alias -> { src, at }
export function noteLiveFrame(persona, src, at = Date.now()) {
  const alias = chairAlias(persona) || (persona ? String(persona).trim() : '');
  if (!alias || !src) return false;
  liveFrames.set(alias, { src: String(src), at: Number(at) || Date.now() });
  return true;
}
export function liveFrameFor(alias, now = Date.now()) {
  const f = liveFrames.get(chairAlias(alias) || alias);
  return f && now - f.at <= LIVE_FRAME_TTL_MS ? f : null;
}
export function imagenRecibida(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '';
  try {
    return 'Imagen recibida ' + new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(n));
  } catch (_) { return ''; }
}
function mosaicTimeEl(doc) {
  const t = doc.createElement('span');
  t.className = 'mac-hoy-tile-time';
  t.hidden = true;
  return t;
}
function mosaicSetTime(tile, ms) {
  const el = tile && tile.querySelector ? tile.querySelector('.mac-hoy-tile-time') : null;
  const txt = imagenRecibida(ms);
  if (tile && tile.classList && typeof tile.classList.toggle === 'function') tile.classList.toggle('en-vivo', !!txt);
  if (!el) return;
  el.textContent = txt;
  el.hidden = !txt;
}
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('mac-remote-frame', (e) => {
    const d = e && e.detail;
    if (d && noteLiveFrame(d.persona, d.src, d.at)) {
      const grid = mosaicHost(lastRoot || document);
      const tile = grid && grid.querySelector ? grid.querySelector('.mac-hoy-tile[data-seat="' + (chairAlias(d.persona) || d.persona) + '"]') : null;
      if (tile) { mosaicRevoke(chairAlias(d.persona)); mosaicShow(tile, d.src); mosaicSetTime(tile, d.at); }
    }
  });
}
/* Sin cookies de flota screen.jpg da 401 (y 404 a sillas sin máquina): no
   martillear cada 12 s llenando la consola; reintentar al cabo de 5 min. */
export const LIVE_BACKOFF_MS = 5 * 60 * 1000;   // persona no soportada (400)
export const LIVE_RETRY_MS = 60 * 1000;         // 401/403 (sin sesión) o 404/424/503 (silla sin escritorio abierto)
const liveBackoff = new Map(); // alias|'*' -> until ms
async function mosaicFetchLiveBlob(alias, request) {
  if (!request) return null;
  const now = Date.now();
  if ((liveBackoff.get('*') || 0) > now || (liveBackoff.get(alias) || 0) > now) return null;
  // Sin sesión de la verja (admiraGateCsrf vacío) el proxy solo daría 401.
  if (typeof window !== 'undefined' && typeof window.admiraGateCsrf === 'function') {
    let csrf = '';
    try { csrf = String(window.admiraGateCsrf() || ''); } catch (_) { csrf = ''; }
    if (!csrf) return null;
  }
  const url = SCREEN_JPEG + '?persona=' + encodeURIComponent(alias) + '&t=' + now;
  try {
    const r = await request(url, { credentials: 'include', cache: 'no-store' });
    if (r && (r.status === 401 || r.status === 403)) liveBackoff.set('*', now + LIVE_RETRY_MS);
    else if (r && r.status === 400) liveBackoff.set(alias, now + LIVE_BACKOFF_MS);
    else if (r && (r.status === 404 || r.status === 424 || r.status >= 500)) liveBackoff.set(alias, now + LIVE_RETRY_MS);
    if (!r || !r.ok) return null;
    const ct = String((r.headers && r.headers.get && r.headers.get('content-type')) || '');
    if (ct && /json|text\//i.test(ct)) return null;
    if (ct && !/image\//i.test(ct) && !/octet-stream/i.test(ct)) return null;
    const blob = await r.blob();
    if (!blob || blob.size < 64) return null;
    if (blob.type && /json|text\//i.test(blob.type)) return null;
    return blob;
  } catch (_) { return null; }
}
function mosaicShowBlob(tile, alias, blob) {
  mosaicRevoke(alias);
  if (typeof URL === 'undefined' || !URL.createObjectURL) return false;
  const obj = URL.createObjectURL(blob);
  mosaicObjectUrls.set(alias, obj);
  return mosaicShow(tile, obj);
}
function mosaicEvidenceTitle(data, alias) {
  const enc = data && data.encargo;
  const mis = data && data.mission;
  const raw = (enc && (enc.etiqueta || enc.titulo)) || (mis && mis.subject) || '';
  const frase = tituloCorto(raw, 8);
  if (enc && enc.numero != null && frase && frase !== 'sin titulo') return '#' + enc.numero + ' ' + frase;
  if (mis && mis.id && frase && frase !== 'sin titulo') {
    const id = String(mis.id).replace(/^FLT-/, '');
    return '#' + id + ' ' + frase;
  }
  if (frase && frase !== 'sin titulo') return frase;
  return 'ultimo trabajo';
}
// 0º fotograma vivo del ultradetalle (evento mac-remote-frame, <30 s)
// 1º SCREEN_JPEG con credentials (misma sesión que Computadora / remote)
// 2º evidencia (imagen aunque live=false = último trabajo)
// 3º placard con metadatos / misión cerrada
// NUNCA baldosa vacía SIN SEÑAL.
async function mosaicTile(tile, alias, request) {
  // 0º fotograma vivo que el ultradetalle/Computadora (mac-remote.js) ya recibió
  const live = liveFrameFor(alias);
  if (live) {
    mosaicRevoke(alias);
    mosaicShow(tile, live.src);
    mosaicSetTime(tile, live.at);
    return true;
  }
  const blob = await mosaicFetchLiveBlob(alias, request);
  if (blob && mosaicShowBlob(tile, alias, blob)) { mosaicSetTime(tile, Date.now()); return true; }
  mosaicSetTime(tile, null);

  const url = EVIDENCE_URL + '?persona=' + encodeURIComponent(alias) + '&t=' + Date.now();
  let data = null;
  try {
    const r = await request(url, { cache: 'no-store', credentials: 'include', headers: { accept: 'application/json' } });
    data = await r.json().catch(() => null);
  } catch (_) { data = null; }

  if (data && data.ok && data.image) {
    mosaicRevoke(alias);
    const src = data.image + (String(data.image).includes('?') ? '&' : '?') + 't=' + Date.now();
    return mosaicShow(tile, src);
  }

  // Última misión cerrada de esa silla (yokup, pública): su captura gana a un
  // placard de texto; si no hay captura, el placard de la evidencia en curso.
  let closed = null;
  try { closed = ultimaCerrada(await fetchCerradas(request), alias); } catch (_) { closed = null; }
  const cap = closed ? missionCaptureUrl(closed) : '';
  if (cap) {
    mosaicRevoke(alias);
    return mosaicShow(tile, cap);
  }

  if (mosaicHasWork(data)) {
    const sub = formatCaptureAt(data.capturedAt) || (data.live ? 'en curso' : 'cerrado');
    return mosaicPlacard(tile, alias, mosaicEvidenceTitle(data, alias), sub);
  }

  if (closed) {
    const day = String(closed.display_day || '').slice(0, 10);
    const sub = day ? ('cerrado ' + day.slice(8, 10) + '-' + day.slice(5, 7)) : 'cerrado';
    const id = String(closed.id || '').replace(/^FLT-/, '');
    const title = ('#' + id + ' ' + tituloCorto(closed.subject || closed.title || '', 6)).trim();
    return mosaicPlacard(tile, alias, title, sub);
  }

  return mosaicPlacard(tile, alias, 'sin historial', alias);
}
export function refreshMosaic(root = lastRoot || (typeof document !== 'undefined' ? document : null), fetchImpl = lastFetch) {
  if (!visible || modo !== 'logo' || mosaicBusy) return Promise.resolve(false);
  if (typeof document !== 'undefined' && document.hidden) return Promise.resolve(false);
  const grid = buildMosaic(root);
  const request = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!grid || !request) return Promise.resolve(false);
  mosaicBusy = true;
  const tiles = Array.from(grid.querySelectorAll('.mac-hoy-tile'));
  return Promise.all(tiles.map((t) => mosaicTile(t, t.getAttribute('data-seat'), request)))
    .then(() => true)
    .finally(() => { mosaicBusy = false; });
}
export function startMosaic(root = lastRoot || (typeof document !== 'undefined' ? document : null), fetchImpl = lastFetch) {
  if (!buildMosaic(root)) return false;
  if (!mosaicTimer) mosaicTimer = setInterval(() => refreshMosaic(lastRoot, lastFetch), MOSAIC_POLL_MS);
  root.addEventListener && root.addEventListener('mac-screen-mode', (e) => {
    if (e.detail && e.detail.mode === 'logo') refreshMosaic(lastRoot, lastFetch);
  });
  const prop = root.querySelector('#mac-hoy-prop');
  if (prop && typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => { if (prop.classList.contains('on')) refreshMosaic(lastRoot, lastFetch); })
      .observe(prop, { attributes: true, attributeFilter: ['class'] });
  }
  return true;
}

/* Vista de cerca (#5110/#5113). El tubo frontal usa la MISMA celda que el mosaico
   (mosaicTile): live con credentials, evidencia/último cerrado, placard — nunca
   SIN SEÑAL vacío. Con consejero elegido, una sola; si no, las seis. */
let detalleTimer = null;
let detalleGen = 0;

function detalleHost(root) {
  return root && root.querySelector ? root.querySelector('#mac-hoy-pantalla') : null;
}

function pararDetalle() {
  detalleGen++;
  if (detalleTimer) { clearInterval(detalleTimer); detalleTimer = null; }
}

function celdaPantalla(doc, alias) {
  const tile = doc.createElement('div');
  tile.className = 'mac-hoy-tile';
  if (alias) tile.setAttribute('data-seat', alias);
  tile.setAttribute('role', 'button');
  tile.tabIndex = 0;
  tile.setAttribute('aria-label', alias ? ('Abrir computadora de ' + alias) : 'sin historial');
  const img = doc.createElement('img');
  img.alt = alias ? ('Pantalla de ' + alias) : '';
  img.decoding = 'async';
  const ns = doc.createElement('pre');
  ns.className = 'mac-hoy-tile-ns';
  ns.textContent = '';
  const name = doc.createElement('span');
  name.className = 'mac-hoy-tile-name';
  name.textContent = alias ? alias.toUpperCase() : '';
  tile.appendChild(img); tile.appendChild(ns); tile.appendChild(name); tile.appendChild(mosaicTimeEl(doc));
  if (alias) {
    const abrir = (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      if (typeof window !== 'undefined' && window.MacRemote && window.MacRemote.open) window.MacRemote.open(alias);
    };
    tile.addEventListener('click', abrir);
    tile.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') abrir(e); });
  }
  return tile;
}

export function pintarPantallaCrt(host, opts = {}) {
  if (!host || !host.ownerDocument || !host.ownerDocument.createElement) return false;
  const doc = host.ownerDocument;
  const raw = opts.persona == null ? '' : String(opts.persona).trim();
  const alias = raw ? chairAlias(raw) : '';
  const sillas = !raw ? MOSAIC_SEATS.slice() : (alias ? [alias] : []);
  const firma = (sillas.length === 1 ? 'una:' + sillas[0] : (sillas.length ? 'mosaico' : 'sin'));
  if (host.getAttribute('data-firma') !== firma) {
    host.textContent = '';
    host.classList.add('mac-hoy-mosaic', 'mac-hoy-mosaic-frente');
    host.setAttribute('data-tipo', sillas.length === 1 ? 'una' : 'mosaico');
    host.setAttribute('data-firma', firma);
    const celdas = sillas.length ? sillas : [null];
    celdas.forEach((s) => host.appendChild(celdaPantalla(doc, s)));
  }
  const request = opts.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const tiles = host.querySelectorAll ? Array.from(host.querySelectorAll('.mac-hoy-tile')) : (host.children || []);
  Array.from(tiles).forEach((t) => {
    const seat = t.getAttribute && t.getAttribute('data-seat');
    if (seat && request) mosaicTile(t, seat, request);
    else mosaicPlacard(t, seat || 'mesa', 'sin historial', '');
  });
  return true;
}

function pintarDetalle(root) {
  const front = root && root.querySelector ? root.querySelector('#mac-hoy-front') : null;
  const host = detalleHost(root);
  if (!front || !host || !front.classList || !front.classList.contains('on') || modo === 'pong') {
    pararDetalle();
    return;
  }
  const token = ++detalleGen;
  if (detalleTimer) { clearInterval(detalleTimer); detalleTimer = null; }
  const paso = () => {
    if (token !== detalleGen) return;
    const persona = (modo === 'remote' && remotePersona) ? remotePersona : null;
    pintarPantallaCrt(host, { persona, fetchImpl: lastFetch });
  };
  paso();
  detalleTimer = setInterval(paso, MOSAIC_POLL_MS);
}

export function isVisible() { return visible; }
export function isFocused() { return focused; }

let remoteTimer = null;
let remotePersona = null;
let remoteGeneration = 0;

function remoteImgs(root) {
  return root && root.querySelectorAll ? Array.from(root.querySelectorAll('.mac-hoy-remote')) : [];
}

function stopRemotePoll() {
  remoteGeneration++;
  if (remoteTimer) { clearInterval(remoteTimer); remoteTimer = null; }
}

const lastRemoteFrames = new Map();
export function remoteErrorMessage(code) {
  const messages={
    session_expired:'Inicia sesión para abrir el escritorio.',
    desktop_draft_present:'Hay un borrador en GrokBot. No se ha cambiado de consejero.',
    desktop_busy:'GrokBot está ocupado. Vuelve a intentarlo.',
    desktop_application_not_running:'GrokBot no está abierto en el Mac Mini.',
    desktop_accessibility_required:'Falta el permiso de Accesibilidad del puente en el Mac Mini.',
    desktop_selection_mismatch:'No se pudo confirmar el consejero en GrokBot.',
    unsupported_persona:'Este consejero aún no tiene escritorio conectado.',
    capture_unavailable:'No se ha podido cargar la captura. El chat tiene una conexión independiente.'
  };
  return messages[code]||'No se pudo abrir el escritorio. Reintenta la conexión con GrokBot.';
}
function remoteStatus(root,alias,code,message,retry=false){
  emitScreen(root,'mac-remote-status',{persona:alias,code,message,retry,lastFrameAt:lastRemoteFrames.get(alias)?.at||null});
}
function paintRemoteError(root, alias, code='capture_unavailable') {
  const frame=lastRemoteFrames.get(alias);
  if(!frame){
    // Keep the selected desktop clickable when the passive preview fails.
    // Ultradetail has its own authenticated capture and must not be closed by it.
    if(code!=='capture_unavailable'){modo='hoy';aplicarModo(root);}
    const msg='CAPTURA\nNO DISPONIBLE\n'+String(alias||'SILLA').toUpperCase().slice(0,12);
    lastText=msg;tubos(root).forEach(t=>paintCrt(t,msg));
  }
  remoteStatus(root,alias,code,(frame?'Imagen anterior · ':'')+remoteErrorMessage(code),true);
}

export function remoteSeat() { return remotePersona; }

export function evidencePlacard(title, subtitle = '') {
  const esc = (v) => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const head = esc(String(title || 'sin actividad').slice(0, 40));
  const sub = esc(String(subtitle || '').slice(0, 48));
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="342"><rect width="100%" height="100%" fill="#1a1208"/><text x="50%" y="46%" fill="#c8a060" font-family="Menlo,monospace" font-size="26" text-anchor="middle">' + head + '</text><text x="50%" y="62%" fill="#886633" font-family="Menlo,monospace" font-size="14" text-anchor="middle">' + sub + '</text></svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function formatCaptureAt(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '';
  try {
    return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(n));
  } catch (_) { return ''; }
}

export async function mostrarProyectoAnterior(root = lastRoot || (typeof document !== 'undefined' ? document : null), fetchImpl = lastFetch, persona = remotePersona) {
  if (!root || !visible) return false;
  lastRoot = root;
  lastFetch = fetchImpl;
  const request = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const alias = chairAlias(persona) || (persona ? String(persona) : null);
  paraPong();
  paraPaseo(root);
  stopRemotePoll();
  let cerradas = [];
  try { if (request) cerradas = await fetchCerradas(request); } catch (_) { cerradas = []; }
  const closed = ultimaCerrada(cerradas, alias);
  if (!closed) {
    // Sin selección: el mosaico ya lleva el último trabajo por silla
    if (!alias && modo === 'logo') {
      refreshMosaic(root, fetchImpl);
      return true;
    }
    modo = 'detalle';
    aplicarModo(root);
    lastText = ['SIN HISTORIAL', '', (alias || 'consejo').slice(0, DETALLE_ANCHO), 'nada cerrado'].join('\n');
    tubos(root).forEach((t) => paintCrt(t, lastText));
    return false;
  }
  const cap = missionCaptureUrl(closed);
  const frase = tituloCorto(closed.subject || closed.title || '', 8);
  const id = String(closed.id || '').replace(/^FLT-/, '');
  const label = ('#' + id + ' ' + frase).trim();
  if (cap) {
    if (alias) remotePersona = alias;
    else remotePersona = chairAlias(closed.persona) || chairAlias(String(closed.role || '').split('·').pop()) || remotePersona;
    modo = 'remote';
    aplicarModo(root);
    fitScreen(root);
    remoteImgs(root).forEach((img) => {
      img.crossOrigin = 'anonymous';
      img.src = cap;
      img.alt = label;
      if (img.style) img.style.display = 'block';
    });
    lastRemoteFrames.set(remotePersona || 'prev', { url: cap, at: Date.now(), label });
    remoteStatus(root, remotePersona || alias || 'prev', 'frame', label + ' · proyecto anterior');
    return true;
  }
  modo = 'detalle';
  detalleIdx = 0;
  aplicarModo(root);
  lastText = proyectoAnteriorLineas(closed).join('\n');
  tubos(root).forEach((t) => paintCrt(t, lastText).then(() => paseaTexto(t)));
  return true;
}

export function showRemote(persona, root = lastRoot || (typeof document !== 'undefined' ? document : null), fetchImpl = lastFetch) {
  if (!root) return false;
  lastRoot = root;
  lastFetch = fetchImpl;
  const alias = chairAlias(persona);
  paraPong();
  paraPaseo(root);
  stopRemotePoll();
  if (!alias) {
    if (!visible) setVisible(true, root, fetchImpl);
    paintRemoteError(root, persona, 'unsupported_persona');
    return false;
  }
  remotePersona = alias;
  modo = 'remote';
  if (!visible) setVisible(true, root, fetchImpl);
  // Encender el Mac no aplica el modo: también el PRIMER Examinar debe
  // sustituir el logo por la captura en las tres superficies.
  aplicarModo(root);
  fitScreen(root);
  const generation = remoteGeneration;
  const isCurrent = () => generation === remoteGeneration && remotePersona === alias && modo === 'remote';
  remoteStatus(root, alias, 'connecting', 'Buscando evidencia de ' + alias + '…');
  const previous = lastRemoteFrames.get(alias);
  remoteImgs(root).forEach(img => {
    img.crossOrigin = 'anonymous';
    if (previous) img.src = previous.url;
    else if (img.removeAttribute) img.removeAttribute('src');
  });
  let loading = false;
  const showUrl = (url, meta) => {
    loading = false;
    if (!isCurrent()) return;
    lastRemoteFrames.set(alias, { url, at: meta?.capturedAt || Date.now(), label: meta?.label || '' });
    remoteImgs(root).forEach(img => {
      img.src = url;
      img.alt = meta?.alt || ('Pantalla de ' + alias);
      if (img.style) img.style.display = 'block';
    });
    const hora = formatCaptureAt(meta?.capturedAt);
    remoteStatus(root, alias, meta?.code || 'frame', meta?.message || (hora ? ('Captura ' + hora + ' Madrid') : ('Evidencia de ' + alias)));
  };
  const showIdle = (label, detail) => {
    const url = evidencePlacard(label, detail || '');
    showUrl(url, { label, code: label === 'sin actividad' ? 'idle' : 'waiting', message: detail ? (label + ' · ' + detail) : label, alt: label, capturedAt: Date.now() });
  };
  const tick = () => {
    if (!isCurrent() || loading || (typeof document !== 'undefined' && document.querySelector('.mac-ultra'))) return;
    const request = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!request) { showIdle('sin actividad', 'sin red'); return; }
    loading = true;
    const url = EVIDENCE_URL + '?persona=' + encodeURIComponent(alias) + '&t=' + Date.now();
    Promise.resolve()
      .then(() => request(url, { cache: 'no-store', headers: { accept: 'application/json' } }))
      .then(async response => {
        const data = await response.json().catch(() => null);
        if (!isCurrent()) { loading = false; return; }
        if (!response.ok || !data?.ok) {
          loading = false;
          showIdle('sin actividad', data?.error || ('HTTP ' + response.status));
          return;
        }
        if (!data.live) {
          showIdle('sin actividad', data.encargo ? String(data.encargo.etiqueta || '') : '');
          return;
        }
        if (!data.image) {
          const ref = data.encargo?.etiqueta || data.mission?.id || 'encargo vivo';
          showIdle('sin captura', ref);
          return;
        }
        const imgUrl = data.image + (data.image.includes('?') ? '&' : '?') + 't=' + Date.now();
        const hora = formatCaptureAt(data.capturedAt);
        const accept = () => showUrl(imgUrl, {
          capturedAt: data.capturedAt,
          label: 'evidencia',
          code: 'frame',
          message: hora ? ('Captura ' + hora + ' Madrid') : ('Evidencia de ' + alias),
          alt: 'Evidencia de ' + alias,
        });
        const fail = () => { loading = false; if (isCurrent()) showIdle('sin captura', 'imagen rota'); };
        if (typeof Image === 'function') {
          const next = new Image();
          next.crossOrigin = 'anonymous';
          next.onload = accept;
          next.onerror = fail;
          next.src = imgUrl;
        } else accept();
      })
      .catch(() => { loading = false; if (isCurrent()) showIdle('sin actividad', 'sin cable'); });
  };
  remoteImgs(root).forEach(img => {
    img.onerror = () => { if (isCurrent() && !String(img.src || '').startsWith('data:')) showIdle('sin captura', 'imagen rota'); };
  });
  if (!remoteImgs(root).length) return true;
  tick();
  remoteTimer = setInterval(tick, EVIDENCE_POLL_MS);
  return true;
}

export function clearRemote(root = lastRoot || (typeof document !== 'undefined' ? document : null), fetchImpl = lastFetch) {
  stopRemotePoll();
  remotePersona = null;
  if (!root) return;
  lastRoot = root;
  lastFetch = fetchImpl;
  if (modo === 'remote') {
    modo = 'hoy';
    aplicarModo(root);
    if (visible) draw(root, fetchImpl);
  }
}

export function closeFront(root = lastRoot || (typeof document !== 'undefined' ? document : null)) {
  focused = false;
  pararDetalle();
  closeUltraDetalle();
  const el = root && root.querySelector('#mac-hoy-front');
  if (el) el.classList.remove('on');
}

/* ULTRADETALLE (#7460). Overlay a viewport completo (patrón .mac-ultra).
   requestFullscreen solo con el botón explícito. No abre grokbot/remote. */
export const DEEPAGENT_SEATS = ['Neo', 'Trinity', 'Oraculo', 'Morfeo', 'Smith', 'Merovingio'];
export const BOLA_TTL_MS = 10 * 60 * 1000;
export const DATO_VACIO = 'sin datos actuales';
export const SESION_SOLO_LECTURA = 'No hay fuente pública para incrustar la sesión en vivo. Representación de solo lectura.';
export const SESION_SIN_PANE = 'No hay captura de terminal para la sesión verificada. El visor no publica esa sesión.';
export const SESION_CAPTURA_TERMINAL = 'Captura de terminal · solo lectura.';
export const VISOR_PANE_URL = '/api/visor/pane?g=6';
export const VISOR_CADENCIA_S = 3;
const CONSEJERO_KEYS = new Set(['jobs', 'wozniak', 'lucas', 'disney', 'musk', 'huang', 'elon', 'jensen', 'steve', 'walt', 'george']);
const ordenesDeepAgent = new Set();
let ultraOverlay = null;
let ultraEnteredFullscreen = false;

function normClave(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}
function esClaveConsejero(n) {
  if (!n) return false;
  if (CONSEJERO_KEYS.has(n)) return true;
  const last = n.split(/[^a-z0-9]+/).filter(Boolean).pop();
  if (CONSEJERO_KEYS.has(last)) return true;
  return MOSAIC_SEATS.some((s) => {
    const k = normClave(s);
    return n === k || n.startsWith(k);
  });
}
export function deepAgentId(nombre) {
  const n = normClave(String(nombre || '').split(/\s*[·|]\s*/)[0]);
  if (!n || esClaveConsejero(n)) return null;
  return DEEPAGENT_SEATS.find((a) => {
    const k = normClave(a);
    return n === k || n.startsWith(k + '-');
  }) || null;
}
export function maqClave(m) {
  return String(m || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\.local$/, '').replace(/[^a-z0-9]/g, '');
}
export function etiquetaDeepAgent(id) {
  return id === 'Oraculo' ? 'Oráculo' : (id || '');
}
export function capturaRealSrc(src) {
  const s = String(src || '').trim();
  if (!s || /^data:image\/svg/i.test(s)) return '';
  if (/^https?:\/\//i.test(s) || /^blob:/i.test(s) || /^data:image\/(jpeg|jpg|png|webp|gif)/i.test(s)) return s;
  return '';
}
export function datoActual(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s || s === '—' || s === 'sin datos' || s === 'sin misión') return DATO_VACIO;
  return s;
}
export function superficiesVerificadas(tarjeta = {}) {
  const out = [];
  const host = String(tarjeta.host || tarjeta.agent_host || '').trim().toLowerCase();
  if (host === 'cli' || host === 'app') {
    out.push({
      tipo: host,
      maquina: tarjeta.maquina || '',
      sesion: tarjeta.session_id || '',
      fuente: tarjeta.fuente || '',
    });
  }
  for (const s of (Array.isArray(tarjeta.superficies) ? tarjeta.superficies : [])) {
    if (!s) continue;
    const t = String(s.tipo || '').toLowerCase();
    if (t !== 'cli' && t !== 'app') continue;
    out.push({
      tipo: t,
      maquina: s.maquina || '',
      sesion: s.sesion || '',
      fuente: s.fuente || tarjeta.fuente || '',
    });
  }
  return out;
}
export function tipoSesionVerificado(tarjeta = {}) {
  const list = Array.isArray(tarjeta) ? tarjeta : [tarjeta];
  const tipos = new Set(list.flatMap(superficiesVerificadas).map((s) => s.tipo));
  if (tipos.has('cli')) return 'CLI';
  if (tipos.has('app')) return 'Desktop app';
  return 'desconocido';
}
export function sesionVerificada(tarjetas) {
  const list = Array.isArray(tarjetas) ? tarjetas : (tarjetas ? [tarjetas] : []);
  const clis = list.flatMap(superficiesVerificadas).filter((s) => s.tipo === 'cli');
  const latidoMaqs = new Set(clis
    .filter((s) => /^(latido|heartbeat|process_snapshot)$/i.test(String(s.fuente || '')) && s.maquina)
    .map((s) => maqClave(s.maquina)));
  const named = clis.filter((s) => String(s.sesion || '').trim());
  const onLatido = latidoMaqs.size ? named.filter((s) => latidoMaqs.has(maqClave(s.maquina))) : named;
  const pool = onLatido.length ? onLatido : named;
  const uniq = [...new Set(pool.map((s) => String(s.sesion).trim()))];
  if (uniq.length !== 1) return { sesion: '', maquina: '', fuente: '' };
  const hit = pool.find((s) => String(s.sesion).trim() === uniq[0]);
  return { sesion: uniq[0], maquina: (hit && hit.maquina) || '', fuente: (hit && hit.fuente) || '' };
}
export function llaveVisor(storage) {
  try {
    const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const v = s && s.getItem && s.getItem('visorLlave');
    return (v && String(v).trim().length >= 20) ? String(v).trim() : '';
  } catch (_) { return ''; }
}
export function paneDeAgente(fichas, agenteId, sesion) {
  const want = String(sesion || '').trim();
  if (!agenteId || !want) return null;
  const rows = Array.isArray(fichas) ? fichas : [];
  const hit = rows.find((f) => {
    if (!f) return false;
    const id = deepAgentId(f.titulo || f.sesion || f.nombre);
    return id === agenteId && String(f.sesion || '').trim() === want;
  });
  if (!hit || !Array.isArray(hit.lineas) || !hit.lineas.length) return null;
  return {
    lineas: hit.lineas.slice(-80).map((l) => String(l == null ? '' : l)),
    sesion: String(hit.sesion),
    host: hit.host || '',
    ts: hit.cambio || hit.ts || null,
    cadenciaS: VISOR_CADENCIA_S,
    fuente: 'visor/pane',
  };
}
export function estaTrabajandoDeepAgent(tarjeta = {}) {
  const e = String(tarjeta.estado || '').toLowerCase();
  if (e === 'verde' || e === 'amarillo') return true;
  if (Number(tarjeta.enCurso) > 0) return true;
  const modo = String(tarjeta.mode || tarjeta.modo || '').toLowerCase();
  return modo === 'trabajando' || modo === 'working';
}
export function evidenciaSesionMs(tarjeta = {}, extra = {}, now = Date.now()) {
  const vals = [extra.capturaAt, extra.latidoAt, extra.evidenciaAt, tarjeta.latidoAt, tarjeta.capturaAt, tarjeta.ultimaActividad];
  if (tarjeta.actividad && tarjeta.actividad.ts) vals.push(tarjeta.actividad.ts);
  let best = 0;
  for (const v of vals) {
    if (v == null || v === '') continue;
    let n = typeof v === 'number' ? v : (/^\d+$/.test(String(v)) ? Number(v) : Date.parse(v));
    if (!Number.isFinite(n) || n <= 0) continue;
    if (n < 1e12) n *= 1000;
    if (n > best) best = n;
  }
  if (!best && tarjeta.haceS != null && Number.isFinite(Number(tarjeta.haceS))) best = now - Number(tarjeta.haceS) * 1000;
  return best;
}
export function bolaEstado(tarjeta = {}, extra = {}, now = Date.now()) {
  const at = evidenciaSesionMs(tarjeta, extra, now);
  if (!at || now - at > BOLA_TTL_MS) return 'amarillo';
  return estaTrabajandoDeepAgent(tarjeta) ? 'rojo' : 'verde';
}
export function etiquetaBola(bola) {
  return bola === 'rojo' ? 'trabajando' : bola === 'verde' ? 'libre' : 'no lo sabemos';
}
export function agenteDeMision(mission) {
  if (!mission) return null;
  const raws = [mission.persona, mission.assignee].filter(Boolean);
  if (!raws.length) return null;
  const ids = raws.map((x) => deepAgentId(x));
  if (ids.some((id) => !id)) return null;
  if (ids.some((id) => id !== ids[0])) return null;
  return ids[0];
}
function tarjetasDe(tarjeta) {
  return Array.isArray(tarjeta) ? tarjeta.filter(Boolean) : (tarjeta ? [tarjeta] : []);
}
function textoMision(t) {
  if (!t) return '';
  if (t.encargo) return t.encargo;
  if (t.tarea) return t.tarea;
  if (t.foco && typeof t.foco === 'object') return t.foco.proyecto || '';
  return t.foco || '';
}
export function fichaDeepAgent(tarjeta, extra = {}, now = Date.now()) {
  const tarjetas = tarjetasDe(tarjeta);
  const id = tarjetas.map((t) => deepAgentId(t && t.agente)).find(Boolean);
  if (!id) return null;
  const elig = sesionVerificada(tarjetas);
  const base = tarjetas.find((t) => superficiesVerificadas(t).some((s) => s.sesion && s.sesion === elig.sesion)) || tarjetas[0];
  const src = capturaRealSrc(extra.src || extra.image || '');
  const bola = bolaEstado(base, extra, now);
  const tipo = tipoSesionVerificado(tarjetas);
  const ultima = tarjetas.map((t) => t.actividad && t.actividad.fuente).find(Boolean) || extra.ultimaAccion || '';
  let evidenciaAt = 0;
  for (const t of tarjetas) evidenciaAt = Math.max(evidenciaAt, evidenciaSesionMs(t, extra, now) || 0);
  const lineas = Array.isArray(extra.lineas) ? extra.lineas : [];
  const hayPane = lineas.length > 0;
  return {
    id,
    nombre: etiquetaDeepAgent(id),
    estado: etiquetaBola(bola),
    bola,
    tipo,
    mision: datoActual(tarjetas.map(textoMision).find(Boolean)),
    ultimaAccion: datoActual(ultima),
    equipo: datoActual(elig.maquina || extra.equipo || base.maquina),
    sesion: datoActual(elig.sesion),
    capturaAt: extra.capturaAt || null,
    evidenciaAt: evidenciaAt || null,
    fuente: datoActual(hayPane ? (extra.fuentePane || extra.fuente) : (src ? (extra.fuente || base.fuente) : (base.fuente || extra.fuente || elig.fuente))),
    src: hayPane ? '' : src,
    lineas,
    cadenciaS: hayPane ? (extra.cadenciaS || VISOR_CADENCIA_S) : null,
    trabajando: tarjetas.some(estaTrabajandoDeepAgent),
    lectura: hayPane ? SESION_CAPTURA_TERMINAL : (elig.sesion ? SESION_SIN_PANE : SESION_SOLO_LECTURA),
  };
}
export function _resetOrdenesDeepAgent() { ordenesDeepAgent.clear(); }
export async function enviarOrdenDeepAgent({ agente, texto, msg_id } = {}, fetchImpl) {
  const dest = deepAgentId(agente);
  if (!dest) return { ok: false, error: 'indisponible' };
  const id = String(msg_id || '').trim();
  if (id && ordenesDeepAgent.has(id)) return { ok: true, duplicado: true };
  if (id) ordenesDeepAgent.add(id);
  // Canal oficial: MCP consejero_mensaje / consejero_bandeja / consejero_responder.
  // En el navegador no hay POST web verificado hacia un DeepAgent
  // (la bandeja entre consejeros es solo lectura; el chat de silla es de consejeros).
  // Un envío: no se mapea a un consejero falso ni se llama al remoto.
  void fetchImpl; void texto;
  return { ok: false, error: 'indisponible' };
}
export function isUltraOpen() { return !!ultraOverlay; }

function horaCapturaUltra(ms) {
  if (ms == null || ms === '') return '—';
  let n = typeof ms === 'number' ? ms : (/^\d+$/.test(String(ms)) ? Number(ms) : Date.parse(ms));
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1e12) n *= 1000;
  try {
    return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(n));
  } catch (_) { return '—'; }
}

function bolasEstadoNode(doc, bola) {
  const wrap = doc.createElement('span');
  wrap.className = 'mac-ultra__bolas';
  wrap.setAttribute('title', 'Metáfora de estado · rojo trabajando · verde libre · amarillo no lo sabemos');
  wrap.setAttribute('aria-label', 'Estado: ' + etiquetaBola(bola));
  ;['rojo', 'amarillo', 'verde'].forEach((c) => {
    const b = doc.createElement('i');
    b.className = 'mac-ultra__bola mac-ultra__bola--' + c + (c === bola ? ' is-on' : '');
    wrap.append(b);
  });
  return wrap;
}

function metaSesion(ficha) {
  const rows = [
    ['Tipo', ficha.tipo || 'desconocido'],
    ['Misión', datoActual(ficha.mision)],
    ['Última acción', datoActual(ficha.ultimaAccion)],
    ['Máquina', datoActual(ficha.equipo)],
    ['Sesión', datoActual(ficha.sesion)],
    ['Hora', ficha.evidenciaAt ? horaCapturaUltra(ficha.evidenciaAt) : DATO_VACIO],
    ['Fuente', datoActual(ficha.fuente)],
  ];
  if (ficha.cadenciaS) rows.push(['Cadencia', ficha.cadenciaS + ' s']);
  return rows;
}

async function panesVisor(fetchImpl, storage) {
  const request = fetchImpl || lastFetch || (typeof fetch === 'function' ? fetch : null);
  const llave = llaveVisor(storage);
  if (!request || !llave) return [];
  try {
    const r = await request(VISOR_PANE_URL, {
      cache: 'no-store',
      credentials: 'include',
      headers: { accept: 'application/json', 'X-Visor-Key': llave },
    });
    if (!r || !r.ok) return [];
    const data = await r.json().catch(() => null);
    return (data && Array.isArray(data.fichas)) ? data.fichas : [];
  } catch (_) { return []; }
}
async function fichasDeepAgents(fetchImpl, storage) {
  const request = fetchImpl || lastFetch || (typeof fetch === 'function' ? fetch : null);
  const grupos = new Map(DEEPAGENT_SEATS.map((id) => [id, []]));
  if (request) {
    try {
      const r = await request('/api/flota/trabajando', { cache: 'no-store', credentials: 'include', headers: { accept: 'application/json' } });
      const data = await r.json().catch(() => null);
      const tarjetas = (data && Array.isArray(data.tarjetas)) ? data.tarjetas : [];
      tarjetas.forEach((t) => {
        const id = deepAgentId(t && t.agente);
        if (id && grupos.has(id)) grupos.get(id).push(t);
      });
    } catch (_) {}
  }
  const panes = await panesVisor(request, storage);
  const extras = new Map();
  // Captura yokup solo si la misión es de ESTE agente. La evidencia de silla
  // (consejero) no se consulta: mezclaría Wozniak u otros (#7421).
  if (request) {
    try {
      const r = await request('https://api.yokup.com/fleet/missions?status=in_progress&limit=80', { cache: 'no-store', headers: { accept: 'application/json' } });
      const data = await r.json().catch(() => null);
      const missions = (data && (data.missions || data.items)) || [];
      missions.forEach((m) => {
        const id = agenteDeMision(m);
        if (!id || !grupos.has(id)) return;
        const src = capturaRealSrc(missionCaptureUrl(m));
        if (!src) return;
        let at = Number(m.process_captured_at || m.live_at || m.updated_at || 0);
        if (at && at < 1e12) at *= 1000;
        extras.set(id, { src, capturaAt: at || null, fuente: 'yokup' });
      });
    } catch (_) {}
  }
  return DEEPAGENT_SEATS.map((id) => {
    const ts = grupos.get(id);
    const seed = ts && ts.length ? ts : [{ agente: id }];
    const elig = sesionVerificada(seed);
    const pane = paneDeAgente(panes, id, elig.sesion);
    const extra = Object.assign({}, extras.get(id) || {});
    if (pane) {
      extra.lineas = pane.lineas;
      extra.fuentePane = pane.fuente;
      extra.cadenciaS = pane.cadenciaS;
      extra.paneAt = pane.ts;
      extra.src = '';
    }
    return fichaDeepAgent(seed, extra);
  });
}

function pintarFichaUltra(doc, ficha, onAmpliar, onOrden) {
  const tile = doc.createElement('article');
  tile.className = 'mac-ultra__agent' + (ficha.src ? ' has-capture' : '');
  tile.setAttribute('data-agent', ficha.id);
  tile.setAttribute('role', 'button');
  tile.tabIndex = 0;
  const head = doc.createElement('header');
  const name = doc.createElement('strong');
  name.textContent = ficha.nombre;
  head.append(bolasEstadoNode(doc, ficha.bola), name);
  const tipo = doc.createElement('p');
  tipo.className = 'mac-ultra__tipo';
  tipo.textContent = ficha.tipo || 'desconocido';
  const meta = doc.createElement('dl');
  metaSesion(ficha).forEach(([dt, dd]) => {
    const t = doc.createElement('dt'); t.textContent = dt;
    const d = doc.createElement('dd'); d.textContent = dd;
    meta.append(t, d);
  });
  const abrir = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    onAmpliar(ficha);
  };
  tile.addEventListener('click', abrir);
  tile.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') abrir(e); });
  const orden = doc.createElement('button');
  orden.type = 'button';
  orden.textContent = 'Orden';
  orden.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onOrden(ficha); });
  tile.append(head, tipo, meta, orden);
  return tile;
}

export function openUltraDetalle(root = lastRoot || (typeof document !== 'undefined' ? document : null), fetchImpl = lastFetch) {
  const doc = (root && root.ownerDocument) || (typeof document !== 'undefined' ? document : null);
  if (!doc || !doc.createElement || !doc.body) return false;
  if (ultraOverlay) return true;
  lastRoot = root || lastRoot;
  lastFetch = fetchImpl || lastFetch;
  const previousFocus = doc.activeElement;
  const overflow = doc.body.style.overflow;
  const rootOverflow = doc.documentElement ? doc.documentElement.style.overflow : '';
  const overlay = doc.createElement('section');
  overlay.className = 'mac-ultra';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Ultradetalle · DeepAgents');
  overlay.innerHTML = '<header class="mac-ultra__bar"><strong>Ultradetalle · DeepAgents</strong><span role="status">Cargando agentes…</span><button type="button" data-full>Pantalla completa</button><button type="button" data-close>Volver al Mac · Esc</button></header><div class="mac-ultra__stage mac-ultra__agents" tabindex="0" role="grid" aria-label="DeepAgents"></div><div class="mac-ultra__session" hidden><p class="mac-ultra__tipo" data-session-tipo></p><pre class="mac-ultra__pane" hidden aria-readonly="true"></pre><img alt="" hidden><p class="mac-ultra__hint" data-session-hint></p><dl data-session-meta></dl><button type="button" data-unzoom>Volver a la rejilla</button></div><form class="mac-ultra__order" hidden><p data-order-agent></p><textarea aria-label="Texto de la orden" maxlength="2000"></textarea><button type="submit">Enviar</button><p data-order-status></p></form>';
  doc.body.append(overlay);
  doc.body.style.overflow = 'hidden';
  if (doc.documentElement) doc.documentElement.style.overflow = 'hidden';
  ultraOverlay = overlay;
  const status = overlay.querySelector('[role="status"]');
  const grid = overlay.querySelector('.mac-ultra__agents');
  const zoom = overlay.querySelector('.mac-ultra__session');
  const zoomImg = zoom.querySelector('img');
  const zoomPane = zoom.querySelector('.mac-ultra__pane');
  const zoomHint = zoom.querySelector('[data-session-hint]');
  const zoomTipo = zoom.querySelector('[data-session-tipo]');
  const zoomMeta = zoom.querySelector('[data-session-meta]');
  const form = overlay.querySelector('.mac-ultra__order');
  const say = (t) => { status.textContent = t; };
  let seleccionado = null;
  let paneTimer = null;
  function pararPane() { if (paneTimer) { clearInterval(paneTimer); paneTimer = null; } }
  function arrancarPane() {
    pararPane();
    if (!seleccionado || !llaveVisor()) return;
    paneTimer = setInterval(() => {
      if (ultraOverlay !== overlay || !seleccionado) return;
      fichasDeepAgents(fetchImpl).then((rows) => {
        const f = (rows || []).find((x) => x && x.id === seleccionado);
        if (f && ultraOverlay === overlay && !zoom.hidden) ampliar(f, true);
      }).catch(() => {});
    }, VISOR_CADENCIA_S * 1000);
  }

  function ampliar(ficha, desdePoll) {
    zoom.hidden = false;
    grid.hidden = true;
    form.hidden = true;
    seleccionado = ficha && ficha.id;
    zoomTipo.textContent = (ficha.nombre || '') + ' · ' + (ficha.tipo || 'desconocido');
    const lineas = Array.isArray(ficha.lineas) ? ficha.lineas : [];
    const src = lineas.length ? '' : capturaRealSrc(ficha && ficha.src);
    zoomHint.hidden = false;
    if (lineas.length) {
      zoomPane.hidden = false;
      zoomPane.textContent = lineas.join('\n');
      zoomHint.textContent = SESION_CAPTURA_TERMINAL + ' · cadencia ' + (ficha.cadenciaS || VISOR_CADENCIA_S) + ' s · fuente visor/pane';
    } else {
      zoomPane.hidden = true;
      zoomPane.textContent = '';
      zoomHint.textContent = ficha.lectura || (ficha.sesion && ficha.sesion !== DATO_VACIO ? SESION_SIN_PANE : SESION_SOLO_LECTURA);
    }
    if (src) {
      zoomImg.hidden = false;
      zoomImg.src = src;
      zoomImg.alt = 'Captura de ' + ficha.nombre + ' · solo lectura';
    } else {
      zoomImg.hidden = true;
      zoomImg.removeAttribute('src');
      zoomImg.alt = '';
    }
    zoomMeta.textContent = '';
    metaSesion(ficha).forEach(([dt, dd]) => {
      const t = doc.createElement('dt'); t.textContent = dt;
      const d = doc.createElement('dd'); d.textContent = dd;
      zoomMeta.append(t, d);
    });
    say(ficha.nombre + ' · ' + etiquetaBola(ficha.bola) + ' · ' + (ficha.tipo || 'desconocido'));
    if (!desdePoll) arrancarPane();
  }
  function ordenA(ficha) {
    form.hidden = false;
    form.querySelector('[data-order-agent]').textContent = 'Orden a ' + ficha.nombre;
    form.dataset.agent = ficha.id;
    form.querySelector('[data-order-status]').textContent = '';
    form.querySelector('textarea').value = '';
    form.querySelector('textarea').focus();
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const agente = form.dataset.agent;
    const texto = form.querySelector('textarea').value;
    const msg_id = 'ultra-' + agente + '-' + Date.now();
    const r = await enviarOrdenDeepAgent({ agente, texto, msg_id }, fetchImpl);
    form.querySelector('[data-order-status]').textContent = r.ok ? (r.duplicado ? 'duplicado' : 'enviado') : (r.error || 'indisponible');
  });
  zoom.querySelector('[data-unzoom]').onclick = () => { pararPane(); seleccionado = null; zoom.hidden = true; grid.hidden = false; say('DeepAgents'); };

  function fullscreen() {
    if (overlay.requestFullscreen) overlay.requestFullscreen().catch(() => {});
  }
  overlay.querySelector('[data-full]').onclick = fullscreen;
  function onFullscreen() {
    ultraEnteredFullscreen = doc.fullscreenElement === overlay;
    overlay.querySelector('[data-full]').textContent = ultraEnteredFullscreen ? 'Pantalla completa activa' : 'Pantalla completa';
  }
  function onKey(e) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    closeUltraDetalle();
  }
  overlay.querySelector('[data-close]').onclick = () => closeUltraDetalle();
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('fullscreenchange', onFullscreen);
  overlay.__ultra = { onKey, onFullscreen, previousFocus, overflow, rootOverflow, doc, pararPane };

  fichasDeepAgents(fetchImpl).then((fichas) => {
    if (ultraOverlay !== overlay) return;
    grid.textContent = '';
    fichas.forEach((f) => grid.appendChild(pintarFichaUltra(doc, f, ampliar, ordenA)));
    say('DeepAgents · ' + fichas.length);
    grid.focus({ preventScroll: true });
  }).catch(() => { if (ultraOverlay === overlay) say('DeepAgents indisponible'); });
  return true;
}

export function closeUltraDetalle() {
  if (!ultraOverlay) return false;
  const overlay = ultraOverlay;
  const meta = overlay.__ultra || {};
  const doc = meta.doc || overlay.ownerDocument;
  if (meta.pararPane) meta.pararPane();
  if (meta.onKey && doc) doc.removeEventListener('keydown', meta.onKey, true);
  if (meta.onFullscreen && doc) doc.removeEventListener('fullscreenchange', meta.onFullscreen);
  if (doc && doc.fullscreenElement === overlay && doc.exitFullscreen) doc.exitFullscreen().catch(() => {});
  overlay.remove();
  if (doc && doc.body) doc.body.style.overflow = meta.overflow || '';
  if (doc && doc.documentElement) doc.documentElement.style.overflow = meta.rootOverflow || '';
  try { meta.previousFocus && meta.previousFocus.focus && meta.previousFocus.focus({ preventScroll: true }); } catch (_) {}
  ultraOverlay = null;
  ultraEnteredFullscreen = false;
  return true;
}

export function openFront(root = lastRoot || (typeof document !== 'undefined' ? document : null), fetchImpl = lastFetch) {
  if (!root || !visible) return false;
  lastRoot = root;
  lastFetch = fetchImpl;
  focused = true;
  const el = root.querySelector('#mac-hoy-front');
  if (el) el.classList.add('on');
  fitScreen(root);                // el escenario frontal medía 0 mientras estaba oculto
  if (modo === 'pong') pararDetalle();
  if (modo === 'pong') { arrancaPong(root); return true; }   // el lienzo frontal acaba de aparecer
  const front = root.querySelector('#mac-hoy-crt-front');
  if (front) paintCrt(front, lastText).then(() => paseaTexto(front));
  draw(root, fetchImpl);
  pintarDetalle(root);
  return true;
}

export function setVisible(on, root = lastRoot || (typeof document !== 'undefined' ? document : null), fetchImpl = lastFetch) {
  if (!root) return false;
  lastRoot = root;
  lastFetch = fetchImpl;
  const prop = root.querySelector('#mac-hoy-prop');
  const btn = root.querySelector('#btn-mostrar');
  visible = !!on;
  if (prop) prop.classList.toggle('on', visible);
  if (btn) btn.classList.toggle('active', visible);
  if (!visible) { stopRemotePoll(); remotePersona = null; modo = 'logo'; detalleIdx = 0; paraPong(); paraPaseo(root); aplicarModo(root); closeFront(root); }
  if (visible) {
    fitScreen(root);              // oculto medía 0: el encaje se rehace al mostrarlo
    if (modo !== 'remote') draw(root, fetchImpl);
    if (!beatTimer) beatTimer = setInterval(() => { if (modo !== 'remote') draw(lastRoot, lastFetch); }, 45000);
  } else if (beatTimer) {
    clearInterval(beatTimer);
    beatTimer = null;
  }
  return visible;
}

export function toggle(root, fetchImpl) {
  return setVisible(!visible, root, fetchImpl);
}

export function boot(root = document, fetchImpl = fetch) {
  const prop = root.querySelector('#mac-hoy-prop');
  if (!prop) return;
  lastRoot = root;
  lastFetch = fetchImpl;
  setVisible(false, root, fetchImpl);
  fitScreen(root);
  watchScreen(root);
  startMosaic(root, fetchImpl);   // #5109 mosaico del Consejo en la mesa
  root.addEventListener && root.addEventListener('mac-screen-mode', () => { if (focused) pintarDetalle(root); });
  // El Mac de la barra SCUMM está SIEMPRE a la vista, así que sus mandos tienen
  // que valer también con el Mac de la mesa apagado: lo encienden y siguen. Los
  // de la mesa y los de la vista grande no lo necesitan —si está apagado, no se
  // ven—, y por eso se distingue por dónde se ha pulsado.
  const enLaBarra = (el) => !!(el && el.closest && el.closest('.mac-scumm'));
  const enciende = (el) => {
    if (visible) return true;
    if (!enLaBarra(el)) return false;
    setVisible(true, root, fetchImpl);
    return true;
  };
  root.querySelectorAll('#mac-hoy-glass, .mac-scumm-glass').forEach((glass) => {
    glass.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!enciende(glass)) return;
      if (modo === 'remote' && typeof window !== 'undefined' && window.MacRemote) { window.MacRemote.open(); return; }
      openFront(root, fetchImpl);
    });
  });
  // Los periféricos del dibujo son los mandos de la pantalla. Pulsar de nuevo
  // el mismo devuelve a HOY, así que nunca se queda uno atrapado en un modo.
  // Los dos periféricos cambian de oficio según lo que haya en pantalla: con el
  // Pong puesto JUEGAN (mantener pulsado mueve la pala) y fuera de él pasan de
  // misión. Avanzar y retroceder es cosa del detalle, no del juego
  // (Carlos, 2026-09-19).
  const mando = (sel, pala, nav) => {
    const navega = nav == null ? pala : nav;
    root.querySelectorAll(sel).forEach((el) => {
      const empuja = (e) => {
        if (!visible || modo !== 'pong') return;
        e.preventDefault();
        jugador = pala;                       // ratón (+1) baja, teclado (-1) sube
      };
      const suelta = () => { if (jugador === pala) jugador = 0; };
      // Un clic de ratón no debe dejar el botón con el foco: si luego se pulsa
      // una tecla, el navegador lo pintaría con su marco encima del dibujo.
      el.addEventListener('mouseup', () => { try { el.blur(); } catch (e) {} });
      el.addEventListener('pointerdown', empuja);
      el.addEventListener('pointerup', suelta);
      el.addEventListener('pointerleave', suelta);
      el.addEventListener('pointercancel', suelta);
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!enciende(el)) return;
        if (modo === 'pong') return;           // jugando no se navega
        avanzaPantalla(navega, root, fetchImpl);
      });
    });
  };
  // Por CLASE: la mesa, la vista grande y el de la barra llevan las mismas y se
  // enganchan los tres de una vez.
  // #7460: en Detalle el RATÓN abre ULTRADETALLE (overlay). La misión siguiente
  // pasa al teclado/flechas. En Pong el ratón sigue bajando la pala.
  root.querySelectorAll('.mac-hoy-mouse, .mac-hoy-front-mouse').forEach((el) => {
    const empuja = (e) => {
      if (!visible || modo !== 'pong') return;
      e.preventDefault();
      jugador = +1;
    };
    const suelta = () => { if (jugador === +1) jugador = 0; };
    el.addEventListener('mouseup', () => { try { el.blur(); } catch (e) {} });
    el.addEventListener('pointerdown', empuja);
    el.addEventListener('pointerup', suelta);
    el.addEventListener('pointerleave', suelta);
    el.addEventListener('pointercancel', suelta);
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!enciende(el)) return;
      if (modo === 'pong') return;
      if (!focused) openFront(root, fetchImpl);
      openUltraDetalle(root, fetchImpl);
    });
  });
  mando('.mac-hoy-keys, .mac-hoy-front-keys', -1, 1);     // pala arriba · clic = misión siguiente
  // Y con el teclado de verdad, que para eso es un Pong. Nunca mientras se
  // escribe en un campo: ahí las flechas son del texto. Fuera del Pong, las
  // flechas pasan de misión (Detalle). El overlay ULTRADETALLE captura Esc.
  if (typeof document !== 'undefined' && !document.__macTeclas) {
    document.__macTeclas = true;
    const esCampo = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    document.addEventListener('keydown', (e) => {
      if (esCampo(e.target) || isUltraOpen()) return;
      if (modo === 'pong' && visible) {
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { jugador = -1; e.preventDefault(); }
        else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { jugador = 1; e.preventDefault(); }
        return;
      }
      if (!visible) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { avanzaPantalla(1, lastRoot, lastFetch); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { avanzaPantalla(-1, lastRoot, lastFetch); e.preventDefault(); }
    });
    document.addEventListener('keyup', (e) => {
      if (['ArrowUp', 'ArrowDown', 'w', 'W', 's', 'S'].includes(e.key)) jugador = 0;
    });
  }
  // Las disqueteras —la de la mesa, la del frontal y la de la barra— meten y
  // sacan el disco.
  root.querySelectorAll('.mac-hoy-floppy, .mac-hoy-front-floppy').forEach((disq) => {
    disq.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!enciende(disq)) return;
      alternaPong(root, fetchImpl);
    });
  });
  const front = root.querySelector('#mac-hoy-front');
  const close = root.querySelector('#mac-hoy-front-close');
  if (close) close.addEventListener('click', (e) => { e.stopPropagation(); closeFront(root); });
  if (front) front.addEventListener('click', (e) => { if (e.target === front) closeFront(root); });
  const video = root.getElementById && root.getElementById('presentation-video');
  if (video) {
    video.addEventListener('play', () => { if (prop) prop.style.visibility = 'hidden'; closeFront(root); });
    video.addEventListener('pause', () => { if (prop) prop.style.visibility = ''; });
    video.addEventListener('ended', () => { if (prop) prop.style.visibility = ''; });
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.MacHoy = { todayMadrid, isHoy, seatOf, linesFor, IDLE_COPY, ERROR_COPY, paintCrt, fetchHoy, boot, setVisible, toggle, isVisible, isFocused, openFront, closeFront, fitScreen, MAC_ART_W, MODOS, setModo, modoActual, detalleLineas, ultimaMision, ultimasMisiones, envolver, avanzaPantalla, alternaPong, paraPong, mandoPong, estadoPong, DETALLE_ANCHO, chairAlias, CHAIR_ALIAS, SCREEN_JPEG, EVIDENCE_URL, EVIDENCE_POLL_MS, evidencePlacard, showRemote, clearRemote, remoteSeat, MOSAIC_SEATS, buildMosaic, refreshMosaic, pintarPantallaCrt, tituloCorto, matchesChair, ultimaCerrada, proyectoAnteriorLineas, missionCaptureUrl, mosaicHasWork, mostrarProyectoAnterior, fetchCerradas, CERRADAS_URL, CHAIR_AGENTS, DEEPAGENT_SEATS, BOLA_TTL_MS, DATO_VACIO, SESION_SOLO_LECTURA, SESION_SIN_PANE, SESION_CAPTURA_TERMINAL, VISOR_PANE_URL, VISOR_CADENCIA_S, deepAgentId, etiquetaDeepAgent, capturaRealSrc, datoActual, tipoSesionVerificado, superficiesVerificadas, sesionVerificada, paneDeAgente, llaveVisor, estaTrabajandoDeepAgent, evidenciaSesionMs, bolaEstado, etiquetaBola, agenteDeMision, fichaDeepAgent, enviarOrdenDeepAgent, openUltraDetalle, closeUltraDetalle, isUltraOpen };
  const bootAndMaybeRemote = () => {
    boot();
    try {
      const q = new URLSearchParams(location.search);
      const who = q.get('examinar') || (location.hash.match(/^#examinar=(.+)$/i) || [])[1];
      if (who) showRemote(decodeURIComponent(who));
    } catch (_) {}
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootAndMaybeRemote);
  else bootAndMaybeRemote();
}
