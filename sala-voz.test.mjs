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
  assert.match(html, /sala-voz\.js\?v=20261112-pantalla-espera/);
  assert.match(css, /cursor:\s*none/);
  assert.doesNotMatch(js, /Activar voz/);
  assert.match(js, /Escape/);
  assert.match(js, /AdmiraVoces/);
  assert.match(js, /entre-consejeros/);
  assert.match(js, /desbloquearAudio/);
  assert.match(js, /AdmiraVozTurno/);
  assert.match(html, /voz-turno-cliente\.js\?v=20261112-voz-propia/);
  assert.match(html, /id="karaoke"/);
  assert.match(html, /sala-voz\.css\?v=20261112-pantalla-espera/);
  assert.match(html, /consejeros-voces\.js\?v=20261112-karaoke/);
  assert.match(js, /sala-voz-lib\.mjs\?v=20261112-pantalla-espera/);
  assert.match(js, /onboundary/);
  assert.match(js, /iniciarKaraokeVisual/);
  assert.match(css, /#karaoke/);
  assert.match(css, /\.palabra\.actual/);
  assert.match(js, /pagehide/);
  assert.match(js, /beforeunload/);
  assert.match(js, /visibilitychange/);
  assert.doesNotMatch(js, /u\.lang = \"es-ES\"/);
  assert.doesNotMatch(js, /soltarCola/);
  assert.equal(Sala.SONDEO_MS >= 3000 && Sala.SONDEO_MS <= 5000, true);
  assert.equal(Sala.VISIBLES, 6);
});

test("tokensKaraoke parte en palabras y conserva la puntuación", () => {
  const t = Sala.tokensKaraoke("Hola, Carlos, soy Steve Jobs.");
  assert.deepEqual(t.map((x) => x.texto), ["Hola,", "Carlos,", "soy", "Steve", "Jobs."]);
  assert.equal(t[0].inicio, 0);
  assert.equal(t[0].fin, "Hola,".length);
  assert.equal(t[1].inicio, "Hola, ".length);
  assert.deepEqual(Sala.tokensKaraoke(""), []);
  assert.deepEqual(Sala.tokensKaraoke("   "), []);
  assert.equal(Sala.tokensKaraoke("uno").length, 1);
});

test("indicePorChar y indicePorTiempo avanzan palabra a palabra", () => {
  const t = Sala.tokensKaraoke("Hola, Carlos, soy Steve Jobs.");
  assert.equal(Sala.indicePorChar(t, 0).indice, 0);
  assert.equal(Sala.indicePorChar(t, 0).hecho, false);
  assert.equal(Sala.indicePorChar(t, t[2].inicio).indice, 2);
  const last = Sala.indicePorChar(t, t[t.length - 1].fin + 10);
  assert.equal(last.indice, t.length - 1);
  assert.equal(last.hecho, true);
  assert.equal(Sala.indicePorChar([], 0).hecho, true);

  const mid = Sala.indicePorTiempo(t, 5000, 10000);
  assert.equal(mid.hecho, false);
  assert.ok(mid.indice >= 1 && mid.indice <= 3, "medio: " + mid.indice);
  assert.equal(Sala.indicePorTiempo(t, 0, 10000).indice, 0);
  assert.equal(Sala.indicePorTiempo(t, 10000, 10000).hecho, true);
  assert.equal(Sala.indicePorTiempo(t, 20000, 10000).hecho, true);
});

test("duracionKaraokeMs respeta el ritmo y se acota", () => {
  const a = Sala.duracionKaraokeMs("Hola, Carlos, soy Steve Jobs.", 1);
  const rapido = Sala.duracionKaraokeMs("Hola, Carlos, soy Steve Jobs.", 2);
  const lento = Sala.duracionKaraokeMs("Hola, Carlos, soy Steve Jobs.", 0.5);
  assert.ok(a >= Sala.KARAOKE_MIN_MS && a <= Sala.KARAOKE_MAX_MS);
  assert.ok(rapido < a);
  assert.ok(lento > a);
  assert.equal(Sala.duracionKaraokeMs("", 1), Sala.KARAOKE_MIN_MS);
  const largo = "palabra ".repeat(2000);
  assert.equal(Sala.duracionKaraokeMs(largo, 0.5), Sala.KARAOKE_MAX_MS);
});

test("elapsedDesdeTurno se sincroniza con el turno público o arranca al llegar", () => {
  const t0 = 1_000_000;
  const alLlegar = Sala.elapsedDesdeTurno(null, t0, 8000);
  assert.equal(alLlegar.elapsedMs, 0);
  assert.equal(alLlegar.sincronizado, false);
  assert.equal(alLlegar.duracionMs, 8000);

  const sync = Sala.elapsedDesdeTurno({ mensajeId: "m", desde: t0, hasta: t0 + 8000, duracionMs: 8000 }, t0 + 2000, 8000);
  assert.equal(sync.elapsedMs, 2000);
  assert.equal(sync.sincronizado, true);
  assert.equal(sync.duracionMs, 8000);

  const inferido = Sala.elapsedDesdeTurno({ hasta: t0 + 5000 }, t0 + 2000, 5000);
  assert.equal(inferido.elapsedMs, 2000);
  assert.equal(inferido.sincronizado, true);
});


test("modo pantalla=1: espera a la izquierda, karaoke a la derecha, sin voz propia", () => {
  const html = readFileSync(new URL("./sala-voz/index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("./sala-voz/sala-voz.css", import.meta.url), "utf8");
  const js = readFileSync(new URL("./sala-voz/sala-voz.js", import.meta.url), "utf8");
  assert.match(html, /id="espera"/);
  assert.match(html, /id="espera-foto"/);
  assert.match(html, /id="kOv"/);
  assert.match(html, /coetaneos-elon-musk\.webp/);
  assert.match(html, /leyendas-steve-jobs\.webp/);
  assert.match(html, /Elon Musk/);
  assert.match(html, /Steve Jobs/);
  assert.match(html, /q\.get\("pantalla"\) !== "1"/);
  assert.match(js, /q\.get\("pantalla"\) === "1"/);
  assert.match(js, /function kdice\(/);
  assert.match(js, /window\.__kdice = kdice/);
  assert.match(js, /window\.__elonDice = \(t\) => kdice\(t, 2\.7, 1000\)/);
  assert.match(js, /arrancarPantalla/);
  assert.match(js, /if \(pantalla\) return;/);
  assert.match(js, /elonKar/);
  assert.match(css, /html\.pantalla #espera/);
  assert.match(css, /width:\s*38vw/);
  assert.match(css, /height:\s*62vh/);
  assert.match(css, /left:\s*44vw/);
  assert.match(css, /right:\s*5vw/);
  assert.match(css, /font:\s*600 3vw\/1\.45/);
  assert.match(css, /text-align:\s*left/);
  assert.match(css, /#39f/);
  assert.match(css, /#f93/);
  assert.match(css, /#6cf/);
  assert.match(css, /#fc6/);
  assert.match(css, /html\.pantalla #karaoke/);
  assert.match(css, /html\.pantalla #elonKar/);
  assert.match(css, /html\.pantalla #transcripcion/);
  assert.match(css, /html\.pantalla #mensajes/);
  assert.match(css, /radial-gradient\(circle at 50% 35%, #0b2a3d, #02080d 70%\)/);
  assert.match(css, /radial-gradient\(circle at 50% 35%, #3a2a12, #0d0904 70%\)/);
  // Sin marco grueso en la foto de espera.
  const foto = css.slice(css.indexOf("html.pantalla #espera-foto"), css.indexOf("html.pantalla #espera-nombre"));
  assert.match(foto, /border:\s*none/);
  assert.match(foto, /box-shadow:\s*none/);
  // El modo pantalla no sustituye el arranque normal (sin ?pantalla=1 se sigue locutando).
  assert.match(js, /} else {\s*arrancar\(\);\s*}/);
});
