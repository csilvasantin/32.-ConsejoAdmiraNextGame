import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  agenteDe, asMs, consejeroDe, maquinaDe, desdeEncargoDA, desdeMensajeDA, latidosDe, bolitaDe,
  lineasCli, nombreFicheroCom, textoFicheroCom, construirComunicacionesDA, contieneSecretoDA, NOTA_STREAM,
} from "./win95-deepagents-cli-lib.mjs";
import { onRequestGet, construir } from "./functions/api/win95/deepagents-comunicaciones.js";

const raiz = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(raiz, "windows95/index.html"), "utf8");
const AHORA = Date.parse("2026-11-27T10:05:00Z"); // 11:05 Madrid

const ENC_ORACULO = { id: "7749", ts: "1795773565", from_name: "status-web · JobsGrokBot", target_persona: "Oraculo", target_machine: "macmini", status: "pending", done_at: "None", ack_at: "None", project_id: "admira-live", etiqueta: "#7749.11.27", text: "Jobs (CEO): construye el poller de flota. token=abcd1234efgh y IP 192.168.1.20" };
const ENC_NEO = { id: "7621", ts: "1795505400", from_name: "status-web · JobsGrokBot", target_persona: "Neo", target_machine: "macstudio", status: "in_progress", ack_at: "1795505760", done_at: "None", project_id: "admira-live", etiqueta: "#7621.11.19", text: "Screen sync AdmiraNeXT01–05" };
const ENC_TRIN = { id: "7700", ts: "1795400000", from_name: "status-web · Jensen Huang (por orden de Carlos Silva,", target_persona: "Trinity", target_machine: "macbookairrosa", status: "done", ack_at: "1795400100", done_at: "1795409000", project_id: "admira-live", text: "Algo hecho" };

test("agenteDe, asMs, consejeroDe y maquinaDe normalizan sin inventar", () => {
  assert.equal(agenteDe("oráculo").persona, "Oraculo");
  assert.equal(agenteDe("OraculoAdmiraNeXT03").nombre, "Oráculo");
  assert.equal(agenteDe("Jobs"), null);
  assert.equal(asMs("1795773565"), 1795773565000);
  assert.equal(asMs("None"), 0);
  assert.equal(consejeroDe("status-web · JobsGrokBot"), "Jobs");
  assert.equal(consejeroDe("status-web · Jensen Huang (por orden de Carlos Silva,"), "Jensen Huang");
  assert.equal(consejeroDe(""), "Consejo de Silicio");
  assert.equal(maquinaDe("192.168.1.4"), "");
  assert.equal(maquinaDe("macmini"), "macmini");
});

test("desdeEncargoDA: todos los estados, eventos reales y texto saneado", () => {
  const c = desdeEncargoDA(ENC_ORACULO, "Oraculo");
  assert.equal(c.encargo, 7749);
  assert.equal(c.estado, "pending");
  assert.equal(c.de, "Jobs");
  assert.equal(c.para, "Oráculo");
  assert.equal(c.maquina, "macmini");
  assert.equal(c.proyecto, "admira-live");
  assert.ok(!/192\.168/.test(c.texto) && !/abcd1234efgh/.test(c.texto));
  assert.deepEqual(c.eventos.map((e) => e.tipo), ["orden"]);
  const t = desdeEncargoDA(ENC_TRIN, "Trinity");
  assert.deepEqual(t.eventos.map((e) => e.tipo), ["orden", "acuse", "cierre"]);
  assert.equal(t.estadoEs, "hecho");
});

test("desdeMensajeDA solo acepta mensajes con un DeepAgent", () => {
  assert.equal(desdeMensajeDA({ id: 1, de: "Jobs", para: "Wozniak", texto: "hola", hora: AHORA }), null);
  const m = desdeMensajeDA({ id: 2, de: "Jobs", para: "Oraculo", para_tipo: "agente", texto: "¿Vas con el poller?", hora: AHORA });
  assert.equal(m.para, "Oráculo");
  assert.equal(m.tipo, "mensaje");
});

test("latidos y bolita: rojo trabajando, verde libre, amarillo sin señal", () => {
  const lat = latidosDe([{ persona: "Neo", machine: "MacBook Pro 16", runtime: "Claude", updated: String(AHORA / 1000 - 10), task: "algo" }, { persona: "Neo", machine: "Viejo", updated: String(AHORA / 1000 - 900) }], AHORA);
  assert.equal(lat.Neo.maquina, "MacBook Pro 16");
  assert.equal(lat.Neo.vivo, true);
  assert.equal(bolitaDe(true, lat.Neo), "rojo");
  assert.equal(bolitaDe(false, lat.Neo), "verde");
  assert.equal(bolitaDe(false, null), "amarillo");
});

test("lineasCli nunca fabrica terminal: eventos reales + nota honesta de stream", () => {
  const c = desdeEncargoDA(ENC_NEO, "Neo");
  const lines = lineasCli(c, null, AHORA);
  assert.deepEqual(lines.map((l) => l.tipo), ["orden", "acuse", "estado", "latido", "stream"]);
  assert.ok(lines.at(-1).txt.includes(NOTA_STREAM));
  assert.match(lines[0].hora, /^\d\d-11 \d\d:\d\d$/);
});

test("fichero .txt legible con cabecera, acuse honesto y sin caracteres prohibidos en el nombre", () => {
  const c = desdeEncargoDA(ENC_ORACULO, "Oraculo");
  const n = nombreFicheroCom(c);
  assert.ok(n.endsWith(".txt") && !/[\\/:*?"<>|]/.test(n));
  const t = textoFicheroCom(c);
  assert.match(t, /De:\s+Jobs/);
  assert.match(t, /sin acuse todavía \(recepción en sesión real sin verificar\)/);
});

test("construirComunicacionesDA: comunicaciones, activos, cola y carpetas de Misiones", () => {
  const d = construirComunicacionesDA({
    bandejas: { Neo: [ENC_NEO], Oraculo: [ENC_ORACULO], Trinity: [ENC_TRIN] },
    mensajes: [{ id: 9, de: "Jobs", para: "Oraculo", para_tipo: "agente", texto: "ping", hora: AHORA - 1000 }],
    presence: [{ persona: "Neo", machine: "MacBook Pro 16", runtime: "Claude", updated: String(AHORA / 1000 - 5) }],
    ahora: AHORA,
  });
  assert.equal(d.total, 4);
  assert.equal(d.comunicaciones[0].tipo, "mensaje");
  assert.equal(d.activos.length, 1);
  assert.equal(d.activos[0].persona, "Neo");
  assert.equal(d.activos[0].bolita, "rojo");
  assert.equal(d.activos[0].streamEnVivo, false);
  assert.match(d.activos[0].cabecera, /^#7621\.11\.19 · Jobs → Neo · macstudio · admira-live$/);
  assert.equal(d.enCola[0].etiqueta, "#7749.11.27");
  const fo = d.carpetas.find((c) => c.persona === "Oraculo");
  assert.equal(fo.id, "fld-deep-oraculo");
  assert.equal(fo.ficheros.length, 2);
  assert.ok(d.comunicaciones.every((c) => c.textoFichero && c.nombreFichero && c.asunto));
  assert.equal(contieneSecretoDA(JSON.stringify(d)), false);
});

test("contieneSecretoDA detecta IPs, MACs y tokens", () => {
  assert.ok(contieneSecretoDA("10.0.0.5"));
  assert.ok(contieneSecretoDA("aa:bb:cc:dd:ee:ff"));
  assert.ok(contieneSecretoDA("ghp_xxx"));
  assert.ok(!contieneSecretoDA("#7749.11.27 macmini"));
});

test("/api/win95/deepagents-comunicaciones: 401 sin sesión", async () => {
  const r = await onRequestGet({ request: new Request("https://www.admira.live/api/win95/deepagents-comunicaciones"), env: {}, fetchImpl: async () => new Response("{}") });
  assert.equal(r.status, 401);
});

test("construir lee bandejas y presencia reales vía fetch inyectado", async () => {
  const f = async (url) => {
    const u = String(url);
    if (u.includes("/api/presence")) return new Response(JSON.stringify({ presence: [] }));
    if (u.includes("persona=Oraculo")) return new Response(JSON.stringify({ items: [ENC_ORACULO] }));
    if (u.includes("persona=Neo")) return new Response(JSON.stringify({ items: [ENC_NEO] }));
    if (u.includes("/inbox")) return new Response(JSON.stringify({ items: [] }));
    return new Response("{}", { status: 404 });
  };
  const d = await construir({ env: {}, fetchImpl: f, ahora: AHORA });
  assert.equal(d.total, 2);
  assert.equal(d.activos[0].persona, "Neo");
});

test("windows95/index.html: CLI DeepAgents debajo de ICQGram, Bandeja con vista DeepAgents y acceso en Inicio", () => {
  assert.match(html, /<div id="dacli" class="win"/);
  assert.ok(html.indexOf('id="dacli"') > html.indexOf('id="icq" class="win"'));
  assert.match(html, /#dacli \.dterm\{[^}]*background:#0c0c0c/);
  assert.match(html, /DA_COM_URL='\/api\/win95\/deepagents-comunicaciones'/);
  assert.match(html, /id="mfDa"/);
  assert.match(html, /CLI DeepAgents<\/span>/);
  assert.match(html, /cli\.style\.top=\(4\+ih\+4\)\+'px'/);
  assert.match(html, /setInterval\(function\(\)\{ if\(!document\.hidden\) loadDaCom\(false\); \},15000\)/);
  assert.match(html, /wireDaCli\(\);/);
  assert.ok(!/stdout falso|líneas inventadas/.test(html));
});
