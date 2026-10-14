import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
// #5862 (Jensen por orden de Carlos, 14-10-2026): ⏻ apps y ⏻ CLIs en cada tarjeta de Mac de /control.
const src = readFileSync(new URL("./assets/interruptores.js", import.meta.url), "utf8");
const ctx = { TextEncoder, btoa, window: {} };
vm.runInNewContext(src, ctx);
const I = ctx.window.AdmiraInterruptores;
const html = readFileSync(new URL("./control/index.html", import.meta.url), "utf8");
const sh = readFileSync(new URL("./fleet/interruptor-agentes.sh", import.meta.url), "utf8");

const ON = { apps: { Claude: true, ChatGPT: false }, apps_on: true, clis: ["niobe", "smith"], clis_on: true };
const OFF = { apps: { Claude: false, ChatGPT: false }, apps_on: false, clis: [], clis_on: false };

test("los dos botones van en .acts justo después de «terminal», solo en Macs online", () => {
  const ini = html.indexOf('<div class="acts"');
  const term = html.indexOf("data-term=", ini);
  const fin = html.indexOf("</div>", term);
  const bloque = html.slice(term, fin);
  assert.match(bloque, /\$\{m\.online&&interruptorAplica\(m\)\?AdmiraInterruptores\.html\(m\.id/);
  assert.match(html, /<script src="\/assets\/interruptores\.js\?v=/);
});

test("estado real: verde encendido, rojo apagado, gris desconocido; aria-pressed", () => {
  const on = I.html("macmini", ON);
  assert.match(on, /data-int="apps"[^>]*aria-pressed="true"/);
  assert.match(on, /int-on" data-int="apps"/);
  assert.match(on, /int-on" data-int="clis"[\s\S]*encendido/);
  const off = I.html("macmini", OFF);
  assert.match(off, /int-off" data-int="apps"[\s\S]*apagado/);
  assert.match(off, /int-off" data-int="clis"[\s\S]*apagado/);
  assert.match(I.html("macmini", null), /int-nd" data-int="apps"[\s\S]*estado…/);
  assert.match(I.html("macmini", ON, { clis: "apagando…" }), /int-ocupado" data-int="clis" data-m="macmini" disabled/);
});

test("al pulsar: encendido → apagar, apagado → encender, desconocido → solo consultar", () => {
  assert.equal(I.siguiente(ON, "apps"), "apps-off");
  assert.equal(I.siguiente(OFF, "apps"), "apps-on");
  assert.equal(I.siguiente(ON, "clis"), "clis-off");
  assert.equal(I.siguiente(OFF, "clis"), "clis-on");
  assert.equal(I.siguiente(null, "clis"), "estado");
});

test("apagar pide confirmación nombrando el Mac y lo que se cierra", () => {
  assert.match(html, /if\(\/-off\$\/\.test\(orden\) && !confirm\(AdmiraInterruptores\.confirmacion\(/);
  assert.match(I.confirmacion("Mac Mini", "apps", ON), /Mac Mini[\s\S]*Claude ●/);
  assert.match(I.confirmacion("Mac Mini", "clis", ON), /niobe · smith/);
});

test("la orden viaja como el script en base64 y solo admite las cinco órdenes", () => {
  const c = I.comando(sh, "apps-off");
  assert.match(c, /^echo [A-Za-z0-9+/=]+ \| base64 -D \| bash -s apps-off$/);
  const b = c.split(" ")[1];
  assert.equal(Buffer.from(b, "base64").toString("utf8"), sh);
  assert.throws(() => I.comando(sh, "rm -rf ~"), /orden no válida/);
});

test("parse lee la última línea __INTERRUPTOR__ del Mac", () => {
  const out = "Claude: cerrando\n__INTERRUPTOR__ " + JSON.stringify(OFF) + "\n";
  assert.deepEqual(JSON.parse(JSON.stringify(I.parse(out))), OFF);
  assert.equal(I.parse("sin estado"), null);
});

test("el script del Mac: abre sin robar el foco, cierra con quit, CLIs con apagar/arrancar-agentes y no mueve ventanas en la cuadratura", () => {
  assert.match(sh, /open -g -a "\$a"/);
  assert.match(sh, /quit app/);
  assert.match(sh, /apagar-agentes\.sh" todos/);
  assert.match(sh, /arrancar-agentes\.sh" todos --sin-layout/);
  assert.match(sh, /es_cuadratura; then echo "colocación: Mac de la cuadratura → no se mueve ninguna ventana"/);
  assert.match(sh, /apps-ventanas\.json/);
});

test("/demo interruptores está en el catálogo y la demo pública monta dos Macs", () => {
  const cat = readFileSync(new URL("./assets/cli-ayuda.js", import.meta.url), "utf8");
  assert.match(cat, /\['\/demo interruptores', '2026-10-14'/);
  const demo = readFileSync(new URL("./demo/interruptores/index.html", import.meta.url), "utf8");
  assert.match(demo, /mountDemo/);
});

// #5867: dos modos por equipo, rotulados, con quién está en cada uno.
test("#5867: cada botón se rotula con su modo (Desktop app / CLI) y explica para quién es", () => {
  const h = I.html("macmini", ON, null, { maquina: "Mac Mini", presencia: [] });
  assert.match(h, /data-int="apps"[\s\S]*?<span class="int-nm">Desktop app<\/span>/);
  assert.match(h, /data-int="clis"[\s\S]*?<span class="int-nm">CLI<\/span>/);
  assert.match(h, /title="Modo Desktop app: uso interactivo de Carlos/);
  assert.match(h, /title="Modo CLI: uso remoto, solo consejeros y agentes/);
});

test("#5867: muestra qué agente está en cada modo, p. ej. «Morfeo · CLI · MBP16»", () => {
  const st = { apps: { Claude: true, ChatGPT: false }, apps_on: true, clis: ["morfeo", "smith"], clis_on: true };
  const pres = [{ persona: "Neo", host: "app" }, { persona: "Morfeo", host: "cli" }, { persona: "Oraculo", host: "app" }];
  const h = I.html("macbookpro16", st, null, { maquina: "MacBook Pro 16", presencia: pres });
  assert.match(h, /<span class="int-ag">Morfeo · CLI · MBP16<\/span>/);
  assert.match(h, /<span class="int-ag">Smith · CLI · MBP16<\/span>/);
  assert.match(h, /<span class="int-ag">Neo · Desktop app · MBP16<\/span>/);
  assert.match(h, /<span class="int-ag">Oraculo · Desktop app · MBP16<\/span>/);
  // sin duplicar: Morfeo sale por presencia Y por tmux, una sola vez
  const general = h.slice(h.indexOf('data-int="clis"'), h.indexOf('</button>', h.indexOf('data-int="clis"')));
  assert.equal((general.match(/Morfeo · CLI/g) || []).length, 2); // rótulo + title del botón general
});

test("#5867: el estado del Mac manda sobre la presencia; modo apagado → «nadie»", () => {
  const q = I.quien([{ persona: "Neo", host: "app" }, { persona: "Morfeo", host: "cli" }], OFF);
  assert.deepEqual(JSON.parse(JSON.stringify(q)), { apps: [], clis: [] });
  assert.match(I.html("m", OFF, null, { maquina: "Mac Mini", presencia: [{ persona: "Neo", host: "app" }] }), /int-nadie">nadie</);
});

test("#5867: nombres cortos de equipo", () => {
  assert.equal(I.corto("MacBook Pro 16"), "MBP16");
  assert.equal(I.corto("MacBook Pro Negro 14"), "MBP14");
  assert.equal(I.corto("MacBookProNegro14"), "MBP14");
  assert.equal(I.corto("MacBook Air Plata"), "MBA Plata");
  assert.equal(I.corto("Mac Mini"), "Mac Mini");
  assert.equal(I.corto("Mac Studio de Carlos"), "Mac Studio");
});

test("#5867: /control pasa a los botones la presencia fresca del equipo", () => {
  assert.match(html, /AdmiraInterruptores\.html\(m\.id, [^)]*interruptorCtx\(m\)\)/);
  assert.match(html, /function interruptorCtx\(m\)/);
  assert.match(html, /PRESENCE_ROWS=rows/);
});

// #5870 (Elon por orden de Carlos, 14-10-2026): cada unidad es su propio botón; los generales siguen.
const MBP = { apps: { Claude: true, ChatGPT: false }, apps_on: true, clis: ["morfeo", "smith"], clis_on: true,
  agentes_cli: [{ persona: "Morfeo", on: true, sesiones: ["morfeo"] }, { persona: "Smith", on: true, sesiones: ["smith"] }, { persona: "Neo", on: false, sesiones: [] }] };
const PRES = [{ persona: "Morfeo", host: "app", runtime: "Claude" }, { persona: "Oraculo", host: "app", runtime: "Codex" }];

test("#5870: una fila por unidad (agente · modo · máquina) con su estado, y los dos generales siguen", () => {
  const h = I.html("macbookpro16", MBP, null, { maquina: "MacBook Pro 16", presencia: PRES });
  assert.match(h, /data-int="apps"/); assert.match(h, /data-int="clis"/);
  assert.match(h, /int-on" data-int="unidad" data-m="macbookpro16" data-u-tipo="cli" data-u="Morfeo"[\s\S]*?Morfeo · CLI · MBP16<\/span><span class="int-st">encendido/);
  assert.match(h, /int-on" data-int="unidad"[^>]*data-u-tipo="cli" data-u="Smith"/);
  assert.match(h, /int-off" data-int="unidad"[^>]*data-u-tipo="cli" data-u="Neo"[\s\S]*?Neo · CLI · MBP16<\/span><span class="int-st">apagado/);
  assert.match(h, /data-u-tipo="app" data-u="Claude"[\s\S]*?Morfeo · Desktop app · MBP16/);
  assert.match(h, /int-off" data-int="unidad"[^>]*data-u-tipo="app" data-u="ChatGPT"[\s\S]*?ChatGPT · Desktop app · MBP16/);
  assert.match(h, /^<div class="int-bloque" data-int-bloque="macbookpro16">/);
});

test("#5870: pulsar una unidad pide la orden SOLO de esa unidad", () => {
  const us = I.unidades(MBP, { maquina: "MacBook Pro 16", presencia: PRES });
  const morfeo = us.find((u) => u.tipo === "cli" && u.clave === "Morfeo");
  const neo = us.find((u) => u.tipo === "cli" && u.clave === "Neo");
  const claude = us.find((u) => u.tipo === "app" && u.clave === "Claude");
  assert.equal(I.siguienteUnidad(morfeo), "cli-off");
  assert.equal(I.siguienteUnidad(neo), "cli-on");
  assert.equal(I.siguienteUnidad(claude), "app-off");
  assert.match(I.comando(sh, "cli-off", "Morfeo"), /\| bash -s cli-off Morfeo$/);
  assert.match(I.comando(sh, "app-on", "ChatGPT"), /\| bash -s app-on ChatGPT$/);
  assert.throws(() => I.comando(sh, "cli-off", "Morfeo; rm -rf ~"), /orden no válida/);
  assert.throws(() => I.comando(sh, "app-off", "Finder"), /orden no válida/);
  assert.throws(() => I.comando(sh, "cli-off"), /orden no válida/);
  assert.match(I.confirmacionUnidad(morfeo), /solo «Morfeo · CLI · MBP16»[\s\S]*apagar-agentes\.sh Morfeo[\s\S]*siguen igual/);
});

test("#5870: el Mac apaga/arranca solo ese agente en ESTE Mac y da el estado por agente", () => {
  assert.match(sh, /"\$FLEET\/apagar-agentes\.sh" "\$UNIDAD" --_remoto/);
  assert.match(sh, /"\$FLEET\/arrancar-agentes\.sh" "\$UNIDAD" --_remoto --sin-layout/);
  assert.match(sh, /\^\[A-Za-z\]\[A-Za-z0-9_-\]\{0,31\}\$/);
  assert.match(sh, /case "\$UNIDAD" in Claude\|ChatGPT\|Codex\)/);
  assert.match(sh, /"agentes_cli": agentes/);
});

test("#5870: /control repinta el bloque y manda la unidad; sin agentes_cli se usan las sesiones tmux", () => {
  assert.match(html, /querySelectorAll\('\.acts \[data-int-bloque="'\+id\+'"\]'\)/);
  assert.match(html, /if\(tipo==='unidad'\)\{ interruptorUnidad\(/);
  assert.match(html, /interruptorOrden\(id, orden, null, u\.clave\)/);
  const us = I.unidades({ apps: {}, clis: ["smith"], clis_on: true }, { maquina: "Mac Mini" });
  assert.deepEqual(JSON.parse(JSON.stringify(us.map((u) => u.rotulo))), ["Smith · CLI · Mac Mini"]);
  assert.deepEqual(JSON.parse(JSON.stringify(I.unidades(null, {}))), []);
});

// #5872 (Elon por orden de Carlos, 14-10-2026): GrokBot por cuenta dentro de Desktop app.
const GROKMAC = { ...MBP, grokbot: { abierta: true, activa: "coetaneos", cuentas: [
  { grupo: "coetaneos", cuenta: "csilvasantin@gmail.com", on: true }, { grupo: "leyendas", cuenta: "csilva@admira.com", on: false }] } };

test("#5872: una fila de GrokBot por cuenta en Desktop app, con su cuenta y su estado", () => {
  const h = I.html("macmini", GROKMAC, null, { maquina: "Mac Mini", presencia: PRES });
  assert.match(h, /int-on" data-int="unidad" data-m="macmini" data-u-tipo="grok" data-u="coetaneos"[\s\S]*?GrokBot · Coetáneos · Desktop app · Mac Mini<\/span><span class="int-st">encendido<\/span><\/span><span class="int-sub">csilvasantin@gmail\.com/);
  assert.match(h, /int-off" data-int="unidad"[^>]*data-u-tipo="grok" data-u="leyendas"[\s\S]*?GrokBot · Leyendas · Desktop app · Mac Mini<\/span><span class="int-st">apagado<\/span><\/span><span class="int-sub">csilva@admira\.com/);
  const tipos = I.unidades(GROKMAC, { maquina: "Mac Mini", presencia: PRES }).map((u) => u.tipo).join(",");
  assert.equal(tipos, "app,app,grok,grok,cli,cli,cli");
  const sinCuenta = I.unidades({ apps: {}, grokbot: { abierta: true, cuentas: [{ grupo: "desconocida", cuenta: null, on: true }] } }, { maquina: "MacBook Pro 16" });
  assert.equal(sinCuenta[0].rotulo, "GrokBot · Desktop app · MBP16");
  assert.equal(sinCuenta[0].sub, "cuenta sin identificar");
  assert.equal(I.unidades(MBP, { maquina: "Mac Mini" }).filter((u) => u.tipo === "grok").length, 0);
});

test("#5872: pulsar una cuenta de GrokBot pide solo grok-on/off de esa cuenta", () => {
  const us = I.unidades(GROKMAC, { maquina: "Mac Mini" });
  const coe = us.find((u) => u.tipo === "grok" && u.clave === "coetaneos");
  const ley = us.find((u) => u.tipo === "grok" && u.clave === "leyendas");
  assert.equal(I.siguienteUnidad(coe), "grok-off");
  assert.equal(I.siguienteUnidad(ley), "grok-on");
  assert.match(I.comando(sh, "grok-off", "coetaneos"), /\| bash -s grok-off coetaneos$/);
  assert.match(I.comando(sh, "grok-on", "leyendas"), /\| bash -s grok-on leyendas$/);
  assert.throws(() => I.comando(sh, "grok-off", "Grok Bot"), /orden no válida/);
  assert.throws(() => I.comando(sh, "grok-on", "leyendas; rm -rf ~"), /orden no válida/);
  assert.match(I.confirmacionUnidad(coe), /solo «GrokBot · Coetáneos · Desktop app · Mac Mini»[\s\S]*Grok Bot \(csilvasantin@gmail\.com\)[\s\S]*siguen igual/);
});

test("#5872: el Mac da la cuenta sin leer secretos y solo cierra Grok Bot si está abierta con esa cuenta", () => {
  assert.match(sh, /case "\$UNIDAD" in coetaneos\|leyendas\|desconocida\)/);
  assert.match(sh, /sand-client-persistence/);
  assert.doesNotMatch(sh, /open\(os\.path\.join\(D, f\)\)/);
  assert.match(sh, /"grokbot": json\.loads\(os\.environ\.get\("GROK"\)/);
  assert.match(sh, /abierta con la cuenta \$act, no con \$UNIDAD: no se cierra/);
  assert.match(sh, /open -g -a "Grok Bot"/);
  assert.match(html, /interruptores\.js\?v=20261014-5872/);
});

test("#5872: la demo cierra y abre solo GrokBot Coetáneos; encender la otra cuenta con la app abierta no cambia nada", async () => {
  const listeners = [];
  const el = { innerHTML: "", addEventListener: (_, f) => listeners.push(f) };
  ctx.setTimeout = setTimeout;
  const demo = I.mountDemo(el, { ms: 1 });
  const mini = demo.macs[0];
  assert.match(el.innerHTML, /GrokBot · Coetáneos · Desktop app · Mac Mini/);
  const pulsar = (tipo, u) => listeners[0]({ target: { closest: () => ({ disabled: false, getAttribute: (a) => ({ "data-m": "macmini", "data-int": "unidad", "data-u-tipo": tipo, "data-u": u })[a] }) } });
  ctx.window.confirm = () => true;
  pulsar("grok", "leyendas"); await new Promise((r) => setTimeout(r, 20));
  assert.equal(mini.st.grokbot.cuentas.map((c) => c.on).join(), "true,false");
  pulsar("grok", "coetaneos"); await new Promise((r) => setTimeout(r, 20));
  assert.equal(mini.st.grokbot.cuentas.map((c) => c.on).join(), "false,false");
  assert.equal(mini.st.apps.Claude && mini.st.apps.ChatGPT, true);
  pulsar("grok", "leyendas"); await new Promise((r) => setTimeout(r, 20));
  assert.equal(mini.st.grokbot.cuentas.map((c) => c.on).join(), "false,true");
});
