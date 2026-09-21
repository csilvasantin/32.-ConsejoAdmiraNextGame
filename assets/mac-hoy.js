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
export const CHAIR_ALIAS = {
  'Steve Jobs': 'Jobs', Jobs: 'Jobs',
  'Steve Wozniak': 'Wozniak', Wozniak: 'Wozniak',
  'George Lucas': 'Lucas', Lucas: 'Lucas',
  'Walt Disney': 'Disney', Disney: 'Disney',
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
  if (modo === 'pong') { modo = 'logo'; detalleIdx = 0; paraPong(); aplicarModo(root); return modo; }
  modo = 'pong';
  paraPaseo(root);
  aplicarModo(root);
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
    modo='hoy';aplicarModo(root);
    const msg='CAPTURA\nNO DISPONIBLE\n'+String(alias||'SILLA').toUpperCase().slice(0,12);
    lastText=msg;tubos(root).forEach(t=>paintCrt(t,msg));
  }
  remoteStatus(root,alias,code,(frame?'Imagen anterior · ':'')+remoteErrorMessage(code),true);
}

export function remoteSeat() { return remotePersona; }

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
  remoteStatus(root,alias,'connecting','Conectando escritorio de '+alias+'…');
  const previous=lastRemoteFrames.get(alias);
  remoteImgs(root).forEach(img=>{img.crossOrigin='use-credentials';if(previous)img.src=previous.url;else if(img.removeAttribute)img.removeAttribute('src');});
  let loading=false;
  const tick = () => {
    if (!isCurrent()||loading||(typeof document!=='undefined'&&document.querySelector('.mac-ultra'))) return;
    const url = SCREEN_JPEG + '?persona=' + encodeURIComponent(alias) + '&t=' + Date.now();
    const accept=()=>{
      loading=false;if(!isCurrent())return;
      lastRemoteFrames.set(alias,{url,at:Date.now()});
      remoteImgs(root).forEach(img=>{img.src=url;img.alt='Pantalla de '+alias;});
      remoteStatus(root,alias,'frame','Captura de '+alias);
    };
    const fail=()=>{loading=false;if(isCurrent())paintRemoteError(root,alias);};
    // Preload before replacing the frame: a failed refresh must not destroy
    // the last readable image. No extra native selection on any refresh.
    if(typeof Image==='function'){
      loading=true;const next=new Image();next.crossOrigin='use-credentials';next.onload=accept;next.onerror=fail;next.src=url;
    }else accept();
  };
  remoteImgs(root).forEach(img=>{img.onerror=()=>{if(isCurrent())paintRemoteError(root,alias);};});
  // Opening a seat may select it once. JPEG refreshes must stay passive so a
  // background preview cannot steal the native chat from a web conversation.
  if (!remoteImgs(root).length) return true;
  const request = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!request) { paintRemoteError(root, alias); return false; }
  const nativePersona = {Jobs:'Steve Jobs', Wozniak:'Steve Wozniak', Disney:'Walt Disney', Lucas:'George Lucas'}[alias];
  Promise.resolve().then(() => request('https://fleet.admira.live/api/grokbot/selection', {
    method:'POST', credentials:'include', cache:'no-store',
    headers:{'Content-Type':'application/json','X-Fleet-CSRF':typeof window!=='undefined' ? window.admiraGateCsrf?.() || '' : ''},
    body:JSON.stringify({persona:nativePersona})
  }))
    .then(async response => {
      const data = await response.json();
      if (!isCurrent()) return;
      if (!response.ok || !data?.ok) {const e=new Error('screen_unavailable');e.code=response.status===401?'session_expired':data?.code||data?.error;throw e;}
      tick(); remoteTimer = setInterval(tick, 2500);
    }).catch(error => { if (isCurrent()) paintRemoteError(root, alias,error.code||'selection_failed'); });
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
  const el = root && root.querySelector('#mac-hoy-front');
  if (el) el.classList.remove('on');
}

export function openFront(root = lastRoot || (typeof document !== 'undefined' ? document : null), fetchImpl = lastFetch) {
  if (!root || !visible) return false;
  lastRoot = root;
  lastFetch = fetchImpl;
  focused = true;
  const el = root.querySelector('#mac-hoy-front');
  if (el) el.classList.add('on');
  fitScreen(root);                // el escenario frontal medía 0 mientras estaba oculto
  if (modo === 'pong') { arrancaPong(root); return true; }   // el lienzo frontal acaba de aparecer
  const front = root.querySelector('#mac-hoy-crt-front');
  if (front) paintCrt(front, lastText).then(() => paseaTexto(front));
  draw(root, fetchImpl);
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
  const mando = (sel, delta) => {
    root.querySelectorAll(sel).forEach((el) => {
      const empuja = (e) => {
        if (!visible || modo !== 'pong') return;
        e.preventDefault();
        jugador = delta;                       // ratón (+1) baja, teclado (-1) sube
      };
      const suelta = () => { if (jugador === delta) jugador = 0; };
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
        avanzaPantalla(delta, root, fetchImpl);
      });
    });
  };
  // Por CLASE: la mesa, la vista grande y el de la barra llevan las mismas y se
  // enganchan los tres de una vez.
  mando('.mac-hoy-mouse, .mac-hoy-front-mouse', +1);   // ratón   -> siguiente · pala abajo
  mando('.mac-hoy-keys, .mac-hoy-front-keys', -1);     // teclado -> anterior  · pala arriba
  // Y con el teclado de verdad, que para eso es un Pong. Nunca mientras se
  // escribe en un campo: ahí las flechas son del texto.
  if (typeof document !== 'undefined' && !document.__macTeclas) {
    document.__macTeclas = true;
    const esCampo = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    document.addEventListener('keydown', (e) => {
      if (modo !== 'pong' || !visible || esCampo(e.target)) return;
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { jugador = -1; e.preventDefault(); }
      else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { jugador = 1; e.preventDefault(); }
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
  window.MacHoy = { todayMadrid, isHoy, seatOf, linesFor, IDLE_COPY, ERROR_COPY, paintCrt, fetchHoy, boot, setVisible, toggle, isVisible, isFocused, openFront, closeFront, fitScreen, MAC_ART_W, MODOS, setModo, modoActual, detalleLineas, ultimaMision, ultimasMisiones, envolver, avanzaPantalla, alternaPong, paraPong, mandoPong, estadoPong, DETALLE_ANCHO, chairAlias, CHAIR_ALIAS, SCREEN_JPEG, showRemote, clearRemote, remoteSeat };
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
