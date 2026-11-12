/* Sala de voz: transcripción entre consejeros en las dos pantallas Terminator.
   12-11-2026: un solo turno de voz en toda la sala (lock en /api/chat/turno-voz).
   12-11-2026: subtítulos karaoke bajo el hablante, al ritmo de la voz (boundary o tiempo).
   12-11-2026: ?pantalla=1 — espera persistente (foto a la izquierda, karaoke a la derecha);
   voces Reed/Mónica llegan de fuera; la página no habla sola. */
import * as Sala from "/sala-voz-lib.mjs?v=20261112-hora-frase";

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const consejo = Sala.parseConsejo(q.get("consejo") || q.get("mesa") || q.get("gen"));
const pantalla = q.get("pantalla") === "1";
const C = window.ChatHiloClient;

let oidosListos = false;
let hablando = false;
let pendiente = null;
let ultimoId = "";
let avisoSesion = false;

let karaokeTimer = null;
let karaokeWatch = null;
let karaokeEspera = null;
let karaokeCtx = null;

function estado(txt) { $("estado").textContent = txt || ""; }

function credencial() {
  try { return C && C.credencial ? C.credencial() : ""; } catch (e) { return ""; }
}

function desbloquearAudio() {
  if (pantalla) return;
  // No locutar un espacio a volumen 0: en Chrome/macOS suena un clic o acople
  // aunque no se diga nada. El primer speak() real en el mismo gesto ya desbloquea.
  try {
    if (window.speechSynthesis && typeof speechSynthesis.getVoices === "function") speechSynthesis.getVoices();
  } catch (e) {}
}

function gesto() {
  desbloquearAudio();
  window.removeEventListener("pointerdown", gesto, true);
  window.removeEventListener("keydown", gesto, true);
  window.removeEventListener("touchstart", gesto, true);
}

function turnoApi() { return window.AdmiraVozTurno; }

function callar() {
  try { if (window.AdmiraVoces && typeof AdmiraVoces.stop === "function") AdmiraVoces.stop(); } catch (e) {}
  try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
}

function rateDe(persona) {
  try {
    const V = window.AdmiraVoces;
    if (V && typeof V.profile === "function") {
      const p = V.profile(persona);
      if (p && isFinite(p.rate)) return p.rate;
    }
  } catch (e) {}
  return 1;
}

function reduceMotion() {
  try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; }
}

function pararKaraokeAnim() {
  if (karaokeTimer) { clearTimeout(karaokeTimer); karaokeTimer = null; }
  if (karaokeWatch) { clearTimeout(karaokeWatch); karaokeWatch = null; }
  if (karaokeEspera) { clearTimeout(karaokeEspera); karaokeEspera = null; }
}

function pintarPalabras(indice, hecho) {
  const box = $("karaoke");
  if (!box) return;
  const spans = box.querySelectorAll(".palabra");
  spans.forEach((sp, i) => {
    sp.classList.toggle("dicha", hecho || i < indice);
    sp.classList.toggle("actual", !hecho && i === indice);
  });
}

function montarKaraoke(texto) {
  const box = $("karaoke");
  if (!box) return [];
  box.replaceChildren();
  const tokens = Sala.tokensKaraoke(texto);
  tokens.forEach((tok) => {
    const sp = document.createElement("span");
    sp.className = "palabra";
    sp.textContent = tok.texto;
    box.append(sp, document.createTextNode(tok.sep || " "));
  });
  return tokens;
}

function iniciarKaraokeVisual(x, elapsedMs, duracionMs) {
  const texto = Sala.textoFraseVisible(String((x && x.texto) || "")).slice(0, 800);
  const inicio = Date.now() - (Number(elapsedMs) || 0);
  mostrarHoraFrase(inicio);
  const tokens = montarKaraoke(texto);
  const dur = duracionMs || Sala.duracionKaraokeMs(texto, rateDe(x && x.persona));
  karaokeCtx = {
    id: x && x.id,
    tokens,
    duracionMs: dur,
    startedAt: Date.now() - (Number(elapsedMs) || 0),
    vistoBoundary: false,
    modo: "tiempo",
  };
  if (reduceMotion()) {
    pintarPalabras(tokens.length, true);
    return karaokeCtx;
  }
  const av = Sala.indicePorTiempo(tokens, Number(elapsedMs) || 0, dur);
  pintarPalabras(av.indice, av.hecho);
  return karaokeCtx;
}

function arrancarKaraokeTiempo(ctx) {
  if (!ctx || reduceMotion()) return;
  if (karaokeTimer) { clearTimeout(karaokeTimer); karaokeTimer = null; }
  ctx.modo = "tiempo";
  const tick = () => {
    if (!karaokeCtx || karaokeCtx !== ctx) return;
    const elapsed = Date.now() - ctx.startedAt;
    const av = Sala.indicePorTiempo(ctx.tokens, elapsed, ctx.duracionMs);
    pintarPalabras(av.indice, av.hecho);
    if (av.hecho) { karaokeTimer = null; return; }
    karaokeTimer = setTimeout(tick, 80);
  };
  tick();
}

function terminarKaraoke() {
  if (karaokeCtx) pintarPalabras((karaokeCtx.tokens || []).length, true);
  pararKaraokeAnim();
}

function esperarFinKaraoke(ctx) {
  return new Promise((resolve) => {
    if (!ctx || reduceMotion()) { resolve(); return; }
    const left = Math.max(0, (ctx.startedAt + ctx.duracionMs) - Date.now());
    karaokeEspera = setTimeout(() => {
      karaokeEspera = null;
      terminarKaraoke();
      resolve();
    }, left);
  });
}

function onKaraokeBoundary(ev) {
  if (!karaokeCtx) return;
  karaokeCtx.vistoBoundary = true;
  karaokeCtx.modo = "boundary";
  if (karaokeWatch) { clearTimeout(karaokeWatch); karaokeWatch = null; }
  if (karaokeTimer) { clearTimeout(karaokeTimer); karaokeTimer = null; }
  const av = Sala.indicePorChar(karaokeCtx.tokens, ev && ev.charIndex);
  pintarPalabras(av.indice, av.hecho);
}

function armarWatchdogBoundary(ctx) {
  if (!ctx || reduceMotion()) return;
  if (karaokeWatch) { clearTimeout(karaokeWatch); karaokeWatch = null; }
  karaokeWatch = setTimeout(() => {
    karaokeWatch = null;
    if (karaokeCtx === ctx && !ctx.vistoBoundary) arrancarKaraokeTiempo(ctx);
  }, Sala.KARAOKE_BOUNDARY_MS);
}

function hablar(item, hooks) {
  return new Promise((resolve) => {
    if (pantalla) { resolve({ hablado: false }); return; }
    let done = false;
    const fin = (r) => { if (!done) { done = true; resolve(r); } };
    const V = window.AdmiraVoces;
    const texto = String(item.texto || "").slice(0, 800);
    if (!texto) { fin({ hablado: false }); return; }
    // Solo la voz propia del consejero: si no está, no se habla (nunca la del sistema).
    if (V && typeof V.speak === "function") {
      const ok = V.speak(item.persona, texto, {
        onend: () => fin({ hablado: true }),
        onerror: () => fin({ hablado: false }),
        onstart: hooks && hooks.onstart,
        onboundary: hooks && hooks.onboundary,
      });
      if (!ok) fin({ hablado: false });
      return;
    }
    fin({ hablado: false });
  });
}

async function observarTurno() {
  const T = turnoApi();
  if (!T || typeof T.get !== "function") return null;
  try {
    const id = typeof T.clienteId === "function" ? T.clienteId() : "";
    return await T.get(credencial(), id);
  } catch (e) { return null; }
}

async function locutarUno(x) {
  if (hablando || !x) return;
  hablando = true;
  pendiente = null;
  const T = turnoApi();
  let ticket = null;
  if (T && typeof T.aguardarTurno === "function") {
    ticket = await T.aguardarTurno({
      mensajeId: x.id,
      texto: x.texto,
      fuente: "sala-voz-" + consejo,
      prioridad: "consejero",
      consejo,
      credencial: credencial(),
      onPerdido: callar,
    });
    // Si no se concede el turno, esta pantalla NO habla. Sí pinta karaoke.
    if (!ticket) {
      hablando = false;
      return;
    }
  }
  mostrarHablante(x.de || x.nombre, true);
  const texto = String(x.texto || "").slice(0, 800);
  const duracion = Sala.duracionKaraokeMs(texto, rateDe(x.persona));

  const puedeHablar = (ticket && ticket.concedido) || !T || typeof T.aguardarTurno !== "function";
  if (puedeHablar) {
    iniciarKaraokeVisual(x, 0, duracion);
    const r = await hablar(x, {
      onstart: () => {
        if (!karaokeCtx) return;
        karaokeCtx.startedAt = Date.now();
        armarWatchdogBoundary(karaokeCtx);
      },
      onboundary: onKaraokeBoundary,
    });
    if (!r || !r.hablado) {
      // sin-voces u otro fallo: ritmo por tiempo, nunca una voz genérica.
      if (karaokeCtx) arrancarKaraokeTiempo(karaokeCtx);
      await esperarFinKaraoke(karaokeCtx);
    } else {
      terminarKaraoke();
    }
    if (ticket && typeof ticket.liberar === "function") {
      try { await ticket.liberar(); } catch (e) {}
    }
  } else {
    // Pantalla que solo muestra: el turno lo tiene otro cliente (o yaDicho).
    let elapsed = 0, dur = duracion;
    const st = await observarTurno();
    const turno = st && st.turno && String(st.turno.mensajeId) === String(x.id) ? st.turno : null;
    if (turno) {
      const sync = Sala.elapsedDesdeTurno(turno, Date.now(), duracion);
      elapsed = sync.elapsedMs;
      dur = sync.duracionMs || duracion;
    }
    const ctx = iniciarKaraokeVisual(x, elapsed, dur);
    if (ctx && !reduceMotion()) arrancarKaraokeTiempo(ctx);
    await esperarFinKaraoke(ctx);
  }
  hablando = false;
  // No encadenar la siguiente lectura: el próximo mensaje espera a un sondeo nuevo.
}

function pararSala() {
  pendiente = null;
  hablando = false;
  pararKaraokeAnim();
  karaokeCtx = null;
  callar();
  if (pantalla) kdiceParar();
  ocultarHoraFrase();
}

function mostrarHablante(de, forzar) {
  const nombre = Sala.nombreDe(de);
  const retrato = Sala.retratoDe(de);
  if (!nombre && !forzar) return;
  $("nombre").textContent = nombre || "Consejo AdmiraNeXT";
  const img = $("retrato");
  const fb = $("retrato-fallback");
  if (retrato) {
    img.src = retrato;
    img.alt = nombre;
    img.hidden = false;
    fb.hidden = true;
  } else {
    img.hidden = true;
    img.removeAttribute("src");
    fb.hidden = false;
    fb.textContent = (nombre || "?").split(" ").map((w) => w[0]).join("").slice(0, 2);
  }
}

function pintar(msgs) {
  const vis = Sala.visiblesUltimos(msgs, Sala.VISIBLES);
  const box = $("transcripcion");
  box.replaceChildren();
  vis.forEach((m, i) => {
    const linea = document.createElement("p");
    linea.className = "linea" + (i === vis.length - 1 ? " actual" : "");
    const raw = Sala.textoDe(m);
    const hora = Sala.horaMadrid(Sala.tsDe(m));
    if (hora) {
      const h = document.createElement("span");
      h.className = "hora-frase";
      h.textContent = hora;
      linea.append(h);
    }
    if (Sala.esFraseDirecto(raw, m)) {
      const d = document.createElement("span");
      d.className = "directo-frase";
      d.textContent = "EN DIRECTO";
      linea.append(d);
    }
    const de = document.createElement("span");
    de.className = "de";
    de.textContent = Sala.etiqueta(m);
    linea.append(de, document.createTextNode(Sala.textoFraseVisible(raw)));
    box.appendChild(linea);
  });
  const ultimo = vis[vis.length - 1];
  if (ultimo && idDeSafe(ultimo) !== ultimoId && !hablando) {
    const propio = vis.slice().reverse().find((m) => Sala.pertenece(m.de, consejo));
    if (propio) mostrarHablante(propio.de);
  }
  if (ultimo) ultimoId = idDeSafe(ultimo) || ultimoId;
  if (!vis.length) {
    $("nombre").textContent = consejo === "coetaneos" ? "Coetáneos" : "Leyendas";
    $("retrato").hidden = true;
    $("retrato-fallback").hidden = true;
  }
}

function idDeSafe(m) { try { return Sala.idDe(m); } catch (e) { return ""; } }

function locutar(msgs) {
  if (!oidosListos) {
    Sala.iniciarOidos(consejo, msgs);
    oidosListos = true;
    return;
  }
  const nuevos = Sala.pendientesDeLocutar(consejo, msgs);
  if (!nuevos.length) return;
  // Un solo mensaje (el más reciente): no se encadena una cola de lecturas.
  pendiente = nuevos[nuevos.length - 1];
  if (!hablando && pendiente) {
    const x = pendiente;
    pendiente = null;
    locutarUno(x);
  }
}

async function leerBandeja() {
  const t = credencial();
  if (!t) return { ok: false, status: 401, mensajes: [] };
  const lecturas = await Promise.all(Sala.CON_API.map((con) =>
    fetch("/api/chat/entre-consejeros?con=" + encodeURIComponent(con) + "&limite=50", {
      cache: "no-store",
      headers: { Authorization: "Bearer " + t },
    }).then((r) => r.ok ? r.json() : { ok: false, status: r.status, mensajes: [] })
      .catch(() => ({ ok: false, mensajes: [] }))
  ));
  const status = lecturas.some((d) => d && d.status === 401) && lecturas.every((d) => !d || !d.ok) ? 401 : 200;
  return { ok: status === 200, status, mensajes: Sala.mergeMensajes(lecturas.map((d) => (d && d.mensajes) || [])) };
}

async function cargar() {
  const d = await leerBandeja();
  if (d.status === 401) {
    estado("Entra con tu cuenta de Google de admira.live para oír la sala.");
    avisoSesion = true;
    return;
  }
  avisoSesion = false;
  const T = turnoApi();
  if (T && typeof T.presencia === "function") {
    try { await T.presencia(consejo, credencial(), "sala-voz-" + consejo); } catch (e) {}
  }
  pintar(d.mensajes || []);
  locutar(d.mensajes || []);
  estado(d.mensajes && d.mensajes.length ? "" : "Aún no hay mensajes entre consejeros.");
}


function protagonistaPantalla() {
  if (consejo === "coetaneos") {
    return {
      foto: "/assets/consejo-vacio/coetaneos-elon-musk.webp",
      nombre: "Elon Musk",
      subtitulo: "Coetáneos",
      color: "#39f",
      claro: "#6cf",
    };
  }
  return {
    foto: "/assets/consejo-vacio/leyendas-steve-jobs.webp",
    nombre: "Steve Jobs",
    subtitulo: "Leyendas",
    color: "#f93",
    claro: "#fc6",
  };
}

function montarEspera() {
  const p = protagonistaPantalla();
  document.documentElement.classList.add("pantalla", consejo);
  document.body.classList.add("pantalla", consejo);
  const img = $("espera-foto");
  if (img) { img.src = p.foto; img.alt = p.nombre; }
  if ($("espera-nombre")) $("espera-nombre").textContent = p.nombre;
  if ($("espera-subtitulo")) $("espera-subtitulo").textContent = p.subtitulo;
  if ($("espera")) $("espera").hidden = false;
  ["karaoke", "elonKar", "transcripcion", "mensajes", "sala", "elige", "estado", "hora-frase"].forEach((id) => {
    const el = $(id);
    if (el) el.hidden = true;
  });
  document.title = "Sala de voz · " + p.nombre;
}

let kDiceTimer = null;
let kDiceHide = null;


function ocultarHoraFrase() {
  const hf = $("hora-frase");
  if (hf) { hf.textContent = ""; hf.hidden = true; }
}

function mostrarHoraFrase(ts) {
  const hf = $("hora-frase");
  if (!hf) return;
  const hora = Sala.horaMadrid(ts == null ? Date.now() : ts);
  hf.textContent = hora ? ("🔴 " + hora) : "";
  hf.hidden = !hora;
}

function kdiceParar() {
  if (kDiceTimer) { clearInterval(kDiceTimer); kDiceTimer = null; }
  if (kDiceHide) { clearTimeout(kDiceHide); kDiceHide = null; }
}

function kdice(texto, palabrasPorSegundo, retardoMs) {
  kdiceParar();
  const ov = $("kOv");
  if (!ov) return;
  const limpio = Sala.textoFraseVisible(String(texto || ""));
  const words = limpio.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  ov.replaceChildren();
  ocultarHoraFrase();
  words.forEach((w, i) => {
    const sp = document.createElement("span");
    sp.textContent = w;
    ov.appendChild(sp);
    if (i < words.length - 1) ov.appendChild(document.createTextNode(" "));
  });
  if (!words.length) { ov.hidden = true; return; }
  ov.hidden = false;
  const wps = Number(palabrasPorSegundo) > 0 ? Number(palabrasPorSegundo) : 2.7;
  const delay = Math.max(0, Number(retardoMs) || 0);
  const step = 1000 / wps;
  let i = 0;
  const spans = ov.querySelectorAll("span");
  const arrancarIntervalo = () => {
    mostrarHoraFrase(Date.now());
    kDiceTimer = setInterval(() => {
      if (i < spans.length) {
        spans[i].classList.add("d");
        i++;
      }
      if (i >= spans.length) {
        clearInterval(kDiceTimer);
        kDiceTimer = null;
        kDiceHide = setTimeout(() => {
          ov.replaceChildren();
          ov.hidden = true;
          ocultarHoraFrase();
          kDiceHide = null;
        }, 700);
      }
    }, step);
  };
  if (delay) kDiceHide = setTimeout(() => { kDiceHide = null; arrancarIntervalo(); }, delay);
  else arrancarIntervalo();
}

function arrancarPantalla() {
  montarEspera();
  window.__kdice = kdice;
  window.__elonDice = (t) => kdice(t, 2.7, 1000);
  window.AdmiraSalaVoz = { consejo, pantalla: true, cargar() {}, __kdice: kdice, __elonDice: window.__elonDice };
}

function pedirFullscreen() {
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  if (fn) try { fn.call(el); } catch (e) {}
}

function salirFullscreen() {
  const fn = document.exitFullscreen || document.webkitExitFullscreen;
  if (fn && (document.fullscreenElement || document.webkitFullscreenElement)) {
    try { fn.call(document); } catch (e) {}
  }
}

async function arrancar() {
  document.body.classList.add(consejo);
  $("elige").hidden = true;
  $("sala").hidden = false;
  $("consejo-kicker").textContent = consejo === "coetaneos" ? "Coetáneos" : "Leyendas";
  $("nombre").textContent = consejo === "coetaneos" ? "Coetáneos" : "Leyendas";
  document.title = "Sala de voz · " + (consejo === "coetaneos" ? "Coetáneos" : "Leyendas");
  desbloquearAudio();
  if (C && typeof C.restaurarSesion === "function") {
    try { await C.restaurarSesion(); } catch (e) {}
  }
  await cargar();
  setInterval(cargar, Sala.SONDEO_MS);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    salirFullscreen();
    e.preventDefault();
  }
  if (e.key === "f" || e.key === "F") pedirFullscreen();
});
window.addEventListener("pointerdown", gesto, true);
window.addEventListener("keydown", gesto, true);
window.addEventListener("touchstart", gesto, true);
// Un clic o tecla también pide pantalla completa (sin botón a la vista).
window.addEventListener("pointerdown", pedirFullscreen, { once: true, capture: true });
window.addEventListener("pagehide", pararSala, true);
window.addEventListener("beforeunload", pararSala, true);
document.addEventListener("visibilitychange", () => {
  if (document.hidden || document.visibilityState === "hidden") pararSala();
}, true);

if (pantalla && consejo) {
  arrancarPantalla();
} else if (!consejo) {
  $("elige").hidden = false;
  $("sala").hidden = true;
} else {
  arrancar();
}

if (!(pantalla && consejo)) window.AdmiraSalaVoz = { consejo, cargar };
