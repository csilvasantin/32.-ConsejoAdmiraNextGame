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
  assert.match(h, /class="mando none/);   // plegable como los demás (FLT-1827)
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

// 13-oct-2026: el relé manda `host`, no `fqdn`. El Mac Studio estaba de alta como
// «Mac Studio» (id macstudio) y su watcher publicaba «Mac Studio de Carlos»: la tarjeta
// decía «falta el watcher» con el watcher publicando.
const fichaStudio = { id: "macstudio", name: "Mac Studio", host: "macstudio-de-carlos.tail48b61c.ts.net" };
const mandoStudio = { macstudiodecarlos: { slots: [{ persona: "Neo", runtime: "Claude", host: "app", session_id: "desktop:claude" }], updated: 1, age: 5 } };

test("la ficha del relé casa con su watcher por la primera etiqueta del host", () => {
  const h = fabrica(mandoStudio)(fichaStudio);
  assert.match(h, /mando <b>1<\/b>/);
  assert.match(h, /watcher hace 5s/);
  // en modo degradado el mismo dato llega como `fqdn`, y tiene que seguir valiendo
  assert.match(fabrica(mandoStudio)({ id: "macstudio", name: "Mac Studio", fqdn: fichaStudio.host }), /mando <b>1<\/b>/);
});

test("la orden viaja a nombre del WATCHER, no de la ficha: el worker casa por el nombre del watcher", () => {
  const h = fabrica(mandoStudio)(fichaStudio);
  assert.equal((h.match(/data-wk="macstudiodecarlos"/g) || []).length, 2, "▶ y ⏹ llevan la clave del watcher");
  assert.match(h, /data-maq="Mac Studio"/, "el nombre de la ficha se queda para leerlo en el aviso");
  assert.match(h, /data-mk="macstudio"/, "el pliegue se sigue recordando por la ficha");
  assert.match(html, /mandoAgente\(b\.dataset\.maq, JSON\.parse\(b\.dataset\.slot\), b\.dataset\.mando, b\.dataset\.wk\)/);
  assert.match(html, /machine:wk\|\|_norm\(machine\)/);
});

test("el mando NO casa por prefijo: una orden va al equipo exacto o no va", () => {
  // sin host, «macstudio» es prefijo de «macstudiodecarlos» y aun así no vale
  assert.match(fabrica(mandoStudio)({ id: "macstudio", name: "Mac Studio" }), /sin mando remoto/);
  // ni al revés: el watcher del segundo Luna no es el del primero
  const luna = { macbookairluna1: { slots: [{ persona: "Neo", runtime: "Claude", host: "app" }], updated: 1, age: 5 } };
  assert.match(fabrica(luna)({ id: "macbookairluna", name: "MacBook Air Luna", host: "macbookairluna.tail48b61c.ts.net" }), /sin mando remoto/);
  assert.match(fabrica(luna)({ id: "macbookairluna1", name: "MacBook Air Luna (2)", host: "macbookairluna-1.tail48b61c.ts.net" }), /mando <b>1<\/b>/);
});

test("el nombre y el id de la ficha mandan sobre el host, y `localhost` no es el nombre de nadie", () => {
  const dos = { macmini: { slots: [{ persona: "Morfeo", runtime: "Claude", host: "app" }], updated: 1, age: 3 },
                otro:    { slots: [{ persona: "Smith", runtime: "Grok", host: "cli" }, { persona: "Neo", runtime: "Claude", host: "cli" }], updated: 1, age: 3 } };
  assert.match(fabrica(dos)({ id: "macmini", name: "Mac Mini", host: "otro.tail48b61c.ts.net" }), /mando <b>1<\/b>/);
  const local = { localhost: { slots: [{ persona: "Smith", runtime: "Grok", host: "cli" }], updated: 1, age: 3 } };
  assert.match(fabrica(local)({ id: "macmini", name: "Mac Mini", host: "localhost" }), /sin mando remoto/);
});

test("la captura por el watcher resuelve el equipo igual que la tarjeta", () => {
  assert.match(html, /function ranuraCaptura\(machine\)\{\s*const g=MANDO_BY_MACHINE\[mandoKeyDeId\(machine\)\]/);
  assert.match(html, /const cuerpo=\{ machine:mandoKeyDeId\(machine\)\|\|_norm\(machine\),/);
  assert.doesNotMatch(html, /MANDO_BY_MACHINE\[_norm\(machine\)\]/);
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

test("el botón 🎛 de emisión y los ▶/⏹ de agente no comparten atributo (un clic, una acción)", () => {
  // Con los dos en `data-mando`, pulsar ▶ abría además /control/remote/?machine=start.
  assert.match(html, /<button data-mando-emision="\$\{m\.id\}"/);
  assert.doesNotMatch(html, /<button data-mando="\$\{m\.id\}"/);
  assert.match(html, /closest\('\[data-mando-emision\]'\)[\s\S]{0,200}\/control\/remote\/\?machine=/);
  assert.doesNotMatch(html, /closest\('\[data-mando\]'\); if\(!b\)return; e\.preventDefault\(\);\s*window\.open/);
});

test("mando, captura, mensajes y canal DS van por el puente del relay, no con un Bearer del navegador", () => {
  // Desde el login por redirect el navegador no tiene id_token: la sesión es la cookie del relay.
  for (const ruta of ["agent/control", "desktop/capture", "desktop/capture/consume", "send", "nav/cmd"])
    assert.match(html, new RegExp("bridgePost\\('" + ruta.replace(/\//g, "\\/") + "'"), ruta);
  assert.doesNotMatch(html, /'Authorization':'Bearer '\+cred/);
  assert.doesNotMatch(html, /fetch\((DIARY_API|MSG_API)\+'\/api\/(send|fleet\/agent\/control|fleet\/desktop\/capture)/);
});
