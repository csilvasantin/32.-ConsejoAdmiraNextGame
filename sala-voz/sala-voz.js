/* Sala de voz: transcripción entre consejeros en las dos pantallas Terminator.
   12-11-2026: un solo turno de voz en toda la sala (lock en /api/chat/turno-voz). */
import * as Sala from "/sala-voz-lib.mjs";

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const consejo = Sala.parseConsejo(q.get("consejo") || q.get("mesa") || q.get("gen"));
const C = window.ChatHiloClient;

let oidosListos = false;
let hablando = false;
let cola = [];
let ultimoId = "";
let avisoSesion = false;

function estado(txt) { $("estado").textContent = txt || ""; }

function credencial() {
  try { return C && C.credencial ? C.credencial() : ""; } catch (e) { return ""; }
}

function desbloquearAudio() {
  try {
    if (window.speechSynthesis && window.SpeechSynthesisUtterance) {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      speechSynthesis.speak(u);
    }
  } catch (e) {}
  soltarCola();
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

function hablar(item) {
  return new Promise((resolve) => {
    const V = window.AdmiraVoces;
    const texto = String(item.texto || "").slice(0, 800);
    if (!texto) { resolve(); return; }
    if (V && typeof V.speak === "function" && V.supported && V.supported()) {
      const ok = V.speak(item.persona, texto, { onend: resolve, onerror: resolve });
      if (!ok) resolve();
      return;
    }
    try {
      const u = new SpeechSynthesisUtterance(texto);
      u.lang = "es-ES";
      u.onend = resolve; u.onerror = resolve;
      speechSynthesis.speak(u);
    } catch (e) { resolve(); }
  });
}

async function soltarCola() {
  if (hablando || !cola.length) return;
  const x = cola[0];
  hablando = true;
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
    if (!ticket || !ticket.concedido) {
      cola.shift();
      hablando = false;
      soltarCola();
      return;
    }
  }
  cola.shift();
  mostrarHablante(x.de || x.nombre, true);
  await hablar(x);
  if (ticket && typeof ticket.liberar === "function") {
    try { await ticket.liberar(); } catch (e) {}
  }
  hablando = false;
  soltarCola();
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
    const de = document.createElement("span");
    de.className = "de";
    de.textContent = Sala.etiqueta(m);
    linea.append(de, document.createTextNode(Sala.textoDe(m)));
    box.appendChild(linea);
  });
  const ultimo = vis[vis.length - 1];
  if (ultimo && idDeSafe(ultimo) !== ultimoId && !hablando) {
    mostrarHablante(ultimo.de);
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
  nuevos.forEach((n) => cola.push(n));
  soltarCola();
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

if (!consejo) {
  $("elige").hidden = false;
  $("sala").hidden = true;
} else {
  arrancar();
}

window.AdmiraSalaVoz = { consejo, cargar };
