import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// mandoHtml vive dentro del <script> de control/index.html, así que se extrae y se
// evalúa con sus dos dependencias (_norm y el mapa). Es la misma técnica que usan las
// pruebas de contrato del worker: el fichero se mantiene a mano y no exporta nada.
const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const trozo = (a, b) => html.slice(html.indexOf(a), html.indexOf(b));
const fabrica = (mando) => new Function(
  "MANDO_BY_MACHINE", "MANDO_FRESH",
  "const _norm=s=>(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');\n"
  + trozo("function mandoHtml(m){", "// ARRANCAR Y PARAR UN AGENTE")
  + "\nreturn mandoHtml;")(mando, 60);

test("un equipo con watcher fresco dice cuántas ranuras gobierna", () => {
  const h = fabrica({ macmini: { slots: [{ persona: "Morfeo", runtime: "Claude", host: "app" },
                                          { persona: "Oraculo", runtime: "Codex", host: "cli" }],
                                 updated: 1, age: 3 } })({ name: "MacMini" });
  assert.match(h, /mando <b>2<\/b>/);   // FLT-1827: cabecera compacta
  assert.match(h, /watcher hace 3s/);
  assert.doesNotMatch(h, /class="mando stale"/);
  // las ranuras concretas viajan en el title, para no descuadrar la parrilla
  assert.match(h, /Morfeo\/Claude\/app · Oraculo\/Codex\/cli/);
});

test("un equipo SIN watcher lo dice, y dice qué le falta", () => {
  const h = fabrica({})({ name: "MacBook Pro 16" });
  assert.match(h, /class="mando none"/);
  assert.match(h, /sin mando remoto/);
  assert.match(h, /falta el watcher/);
  assert.match(h, /install-presence-watch\.sh/, "hay que decir CÓMO se arregla, no sólo que falta");
});

test("un watcher que ya no responde se marca: sus ranuras están escritas, pero no las recoge nadie", () => {
  const h = fabrica({ dgxspark: { slots: [{ persona: "Smith", runtime: "Grok", host: "cli" }],
                                  updated: 1, age: 40320 } })({ name: "DGX Spark" });
  assert.match(h, /class="mando stale"/);
  assert.match(h, /watcher hace 11\.2h/);
});

test("el nombre del equipo se normaliza: «MacBook Pro 16» casa con macbookpro16", () => {
  const mando = { macbookpro16: { slots: [{ persona: "Neo", runtime: "Claude", host: "app" }], updated: 1, age: 5 } };
  assert.match(fabrica(mando)({ name: "MacBook Pro 16" }), /mando <b>1<\/b>/);
  assert.match(fabrica(mando)({ name: "macbook-pro-16" }), /mando <b>1<\/b>/);
});

test("sin equipo no se inventa nada", () => {
  assert.equal(fabrica({})({}), "");
});

test("con watcher fresco salen los botones de cada ranura", () => {
  const h = fabrica({ macmini: { slots: [{ persona: "Morfeo", runtime: "Claude", host: "app", session_id: "desktop:claude" },
                                         { persona: "Oraculo", runtime: "Codex", host: "cli", session_id: "tmux:ora" }],
                                 updated: 1, age: 4 } })({ name: "MacMini" });
  assert.match(h, /data-mando="start"/);
  assert.match(h, /data-mando="stop"/);
  assert.equal((h.match(/data-mando="start"/g) || []).length, 2, "un par de botones por ranura");
  // la ranura entera viaja en data-slot: sin session_id el worker no casa la orden
  assert.match(h, /desktop:claude/);
});

test("con el watcher rancio NO hay botones: la orden no la recogeria nadie", () => {
  const h = fabrica({ dgxspark: { slots: [{ persona: "Smith", runtime: "Grok", host: "cli", session_id: "t" }],
                                  updated: 1, age: 40320 } })({ name: "DGX Spark" });
  assert.match(h, /class="mando stale"/);
  assert.doesNotMatch(h, /data-mando/, "un boton que nadie atiende es peor que no tenerlo");
});

test("sin watcher tampoco hay botones", () => {
  assert.doesNotMatch(fabrica({})({ name: "MacBookAirRosa" }), /data-mando/);
});

test("FLT-1827: las ranuras van agrupadas en dos filas, APP y CLI, con ficha Persona·Runtime y botones", () => {
  const h = fabrica({ macmini: { slots: [
    { persona: "Morfeo", runtime: "Claude", host: "cli" }, { persona: "Trinity", runtime: "Codex", host: "cli" },
    { persona: "Neo", runtime: "Claude", host: "app" }, { persona: "Morfeo", runtime: "Claude", host: "app" },
  ], updated: 1, age: 3 } })({ name: "MacMini" });
  const filas = [...h.matchAll(/<div class="mando-fila"><span class="mando-etq"[^>]*>(APP|CLI)<\/span>(.*?)<\/div>/g)];
  assert.deepEqual(filas.map((f) => f[1]), ["APP", "CLI"], "primero APP, luego CLI");
  // dentro de la fila, por persona; la superficie no se repite en cada ficha
  assert.match(filas[0][2], /Morfeo<i>·Claude<\/i>.*Neo<i>·Claude<\/i>/);
  assert.doesNotMatch(filas[0][2].replace(/<[^>]+>/g, ""), /\/app/, "la superficie no se repite en el texto visible de cada ficha");
  assert.equal((filas[1][2].match(/data-mando="start"/g) || []).length, 2, "un ▶ por ranura CLI");
});

test("FLT-1827: con el watcher rancio las fichas salen mudas, sin botones", () => {
  const h = fabrica({ macmini: { slots: [{ persona: "Smith", runtime: "Grok", host: "cli" }], updated: 1, age: 900 } })({ name: "MacMini" });
  assert.match(h, /class="mando stale"/);
  assert.match(h, /mando-slot mudo/);
  assert.doesNotMatch(h, /data-mando=/);
});
