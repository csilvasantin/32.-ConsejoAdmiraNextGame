import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as Sala from "./sala-voz-lib.mjs";

function store() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

const dialogo = [
  { id: "a1", de: "Jobs", para: "Musk", texto: "Hola Elon, ¿arrancamos la sala?", hora: "2026-11-12T10:00:00Z" },
  { id: "a2", de: "Musk", para: "Jobs", texto: "Te oigo, Jobs. Menos ceremonia.", hora: "2026-11-12T10:00:20Z" },
  { id: "a3", de: "Disney", para: "Huang", texto: "Que se vea el carácter de cada uno.", hora: "2026-11-12T10:00:40Z" },
  { id: "a4", de: "Huang", para: "Disney", texto: "De acuerdo. Lo llevo a las dos pantallas.", hora: "2026-11-12T10:01:00Z" },
];

test("parseConsejo entiende leyendas y coetáneos (y alias)", () => {
  assert.equal(Sala.parseConsejo("leyendas"), "leyendas");
  assert.equal(Sala.parseConsejo("Legends"), "leyendas");
  assert.equal(Sala.parseConsejo("coetaneos"), "coetaneos");
  assert.equal(Sala.parseConsejo("Coetáneos"), "coetaneos");
  assert.equal(Sala.parseConsejo("peers"), "coetaneos");
  assert.equal(Sala.parseConsejo(""), null);
  assert.equal(Sala.parseConsejo("otra"), null);
});

test("pertenece: cada consejo locuta solo a los suyos (Shotwell/Murati en Coetáneos)", () => {
  assert.equal(Sala.pertenece("Jobs", "leyendas"), true);
  assert.equal(Sala.pertenece("Steve Wozniak", "leyendas"), true);
  assert.equal(Sala.pertenece("Tim Cook", "leyendas"), true);
  assert.equal(Sala.pertenece("Schultz", "leyendas"), true);
  assert.equal(Sala.pertenece("Musk", "leyendas"), false);
  assert.equal(Sala.pertenece("Elon", "coetaneos"), true);
  assert.equal(Sala.pertenece("Jensen Huang", "coetaneos"), true);
  assert.equal(Sala.pertenece("Shotwell", "coetaneos"), true);
  assert.equal(Sala.pertenece("Mira Murati", "coetaneos"), true);
  assert.equal(Sala.pertenece("Jobs", "coetaneos"), false);
});

test("vozDe: Shotwell se locuta con Mira Murati; el resto con su nombre", () => {
  assert.equal(Sala.vozDe("Jobs"), "Steve Jobs");
  assert.equal(Sala.vozDe("Musk"), "Elon Musk");
  assert.equal(Sala.vozDe("Shotwell"), "Mira Murati");
  assert.equal(Sala.vozDe("Murati"), "Mira Murati");
  assert.equal(Sala.nombreDe("Shotwell"), "Gwynne Shotwell");
});

test("ambas pantallas ven los mismos últimos mensajes (todo el texto)", () => {
  const vis = Sala.visiblesUltimos(dialogo, 6);
  assert.equal(vis.length, 4);
  assert.equal(vis[0].texto, "Hola Elon, ¿arrancamos la sala?");
  assert.equal(vis[3].de, "Huang");
  const recorte = Sala.visiblesUltimos(dialogo.concat([
    { id: "a5", de: "Lucas", para: "Reynolds", texto: "cinco" },
    { id: "a6", de: "Reynolds", para: "Lucas", texto: "seis" },
    { id: "a7", de: "Rams", para: "Ive", texto: "siete" },
  ]), 6);
  assert.equal(recorte.length, 6);
  assert.equal(recorte[0].id, "a2");
  assert.equal(recorte[5].texto, "siete");
});

test("primera carga marca el histórico y no lo devuelve para locutar", () => {
  const lsL = store(), lsC = store();
  assert.deepEqual(Sala.iniciarOidos("leyendas", dialogo, lsL), []);
  assert.deepEqual(Sala.iniciarOidos("coetaneos", dialogo, lsC), []);
  assert.deepEqual(Sala.pendientesDeLocutar("leyendas", dialogo, lsL), []);
  assert.deepEqual(Sala.pendientesDeLocutar("coetaneos", dialogo, lsC), []);
});

test("un mensaje nuevo solo lo locuta el consejo del remitente", () => {
  const lsL = store(), lsC = store();
  Sala.iniciarOidos("leyendas", dialogo, lsL);
  Sala.iniciarOidos("coetaneos", dialogo, lsC);
  const nuevoJobs = { id: "n1", de: "Jobs", para: "Musk", texto: "Las dos TVs ya están vivas.", hora: "2026-11-12T10:02:00Z" };
  const ley = Sala.pendientesDeLocutar("leyendas", dialogo.concat(nuevoJobs), lsL);
  const coe = Sala.pendientesDeLocutar("coetaneos", dialogo.concat(nuevoJobs), lsC);
  assert.equal(ley.length, 1);
  assert.equal(ley[0].persona, "Steve Jobs");
  assert.equal(ley[0].texto, "Las dos TVs ya están vivas.");
  assert.deepEqual(coe, []);
  const nuevoElon = { id: "n2", de: "Musk", para: "Jobs", texto: "Perfecto, se oye aquí.", hora: "2026-11-12T10:02:10Z" };
  const todos = dialogo.concat(nuevoJobs, nuevoElon);
  assert.deepEqual(Sala.pendientesDeLocutar("leyendas", todos, lsL), []);
  const coe2 = Sala.pendientesDeLocutar("coetaneos", todos, lsC);
  assert.equal(coe2.length, 1);
  assert.equal(coe2[0].persona, "Elon Musk");
});

test("no locuta agentes ni relee lo ya oído; los oídos de cada pantalla no se pisan", () => {
  const ls = store();
  Sala.iniciarOidos("leyendas", [], ls);
  const agente = { id: "ag1", de: "Neo", para: "Jobs", de_tipo: "agente", texto: "aviso" };
  assert.deepEqual(Sala.pendientesDeLocutar("leyendas", [agente], ls), []);
  const deElon = { id: "e1", de: "Musk", para: "Jobs", texto: "desde Elon" };
  assert.deepEqual(Sala.pendientesDeLocutar("leyendas", [deElon], ls), []);
  // en la misma store, coetáneos sí lo oiría si no estuviera ya marcado… usamos otra clave de consejo
  const ls2 = store();
  Sala.iniciarOidos("coetaneos", [], ls2);
  assert.equal(Sala.pendientesDeLocutar("coetaneos", [deElon], ls2).length, 1);
});

test("mergeMensajes deduplica por id y ordena por hora", () => {
  const a = [dialogo[1], dialogo[0]];
  const b = [dialogo[0], dialogo[2]];
  const mix = Sala.mergeMensajes([a, b]);
  assert.deepEqual(mix.map((m) => m.id), ["a1", "a2", "a3"]);
});

test("la página es privada, a pantalla limpia, sin botón de voz y con cursor oculto", () => {
  const html = readFileSync(new URL("./sala-voz/index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("./sala-voz/sala-voz.css", import.meta.url), "utf8");
  const js = readFileSync(new URL("./sala-voz/sala-voz.js", import.meta.url), "utf8");
  assert.match(html, /auth-gate\.js/);
  assert.match(html, /consejeros-voces\.js/);
  assert.match(html, /chat-hilo-client\.js/);
  assert.match(html, /sala-voz.js\?v=20261112-sin-voz-sistema/);
  assert.match(css, /cursor:\s*none/);
  assert.doesNotMatch(js, /Activar voz/);
  assert.match(js, /Escape/);
  assert.match(js, /AdmiraVoces/);
  assert.match(js, /entre-consejeros/);
  assert.match(js, /desbloquearAudio/);
  assert.match(js, /AdmiraVozTurno/);
  assert.match(html, /voz-turno-cliente\.js\?v=20261112-turno-voz/);
  assert.equal(Sala.SONDEO_MS >= 3000 && Sala.SONDEO_MS <= 5000, true);
  assert.equal(Sala.VISIBLES, 6);
});
