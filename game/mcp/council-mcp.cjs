#!/usr/bin/env node
/**
 * council-mcp — Servidor MCP (stdio, sin dependencias) para AdmiraNext Council.
 *
 * Expone el contrato del juego (game/manifest.json) y un registro de "reservas"
 * para que varios agentes (p. ej. Oráculo en Codex) extiendan el juego sin pisarse.
 *
 * Protocolo: JSON-RPC 2.0 sobre stdio, mensajes delimitados por saltos de línea
 * (transporte stdio de MCP). Los logs van a stderr; stdout es solo protocolo.
 *
 * Uso (Codex / cualquier cliente MCP):
 *   command = "node", args = ["<ruta>/game/mcp/council-mcp.js"]
 *
 * Variable de entorno opcional:
 *   COUNCIL_MANIFEST=/ruta/al/manifest.json   (por defecto ../manifest.json)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const SERVER = { name: "council-mcp", version: "1.0.0" };
const PROTOCOL = "2024-11-05";

const MANIFEST_PATH = process.env.COUNCIL_MANIFEST || path.join(__dirname, "..", "manifest.json");
const CHECK_SCRIPT = path.join(__dirname, "..", "check-manifest.cjs");

function log(...a) { process.stderr.write("[council-mcp] " + a.join(" ") + "\n"); }
function readManifest() { return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")); }
function writeManifest(m) { fs.writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2) + "\n"); }
function today() { return new Date().toISOString().slice(0, 10); }
function extensionIds(m) { return (m.extension_points || []).map(e => e.id); }

// ─────────────────────────────── Tools ───────────────────────────────
const TOOLS = [
  {
    name: "get_overview",
    description: "Resumen del juego AdmiraNext Council: qué es, URLs, estilo y conteos (verbos, consejeros, puntos de extensión, versión del contrato).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run() {
      const m = readManifest();
      return {
        name: m.game.name, version: m.version, updated: m.updated,
        play_url: m.game.play_url, help_url: m.game.help_url, source_file: m.game.source_file,
        style: m.game.style, tagline: m.game.tagline, description: m.game.description,
        counts: {
          verbs: (m.verbs || []).length,
          council_leyendas: (m.council && m.council.leyendas || []).length,
          council_coetaneos: (m.council && m.council.coetaneos || []).length,
          extension_points: (m.extension_points || []).length,
          active_reservations: (m.collaboration && m.collaboration.reservations || []).filter(r => r.active !== false).length,
        },
      };
    },
  },
  {
    name: "list_verbs",
    description: "Lista los verbos del juego con su estado (stable/partial), si son clave y su descripción.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run() { return readManifest().verbs || []; },
  },
  {
    name: "list_council",
    description: "Lista los consejeros. Filtra por generación 'leyendas' o 'coetaneos' (sin filtro: ambas).",
    inputSchema: { type: "object", properties: { generation: { type: "string", enum: ["leyendas", "coetaneos"] } }, additionalProperties: false },
    run(args) {
      const c = readManifest().council || {};
      if (args && args.generation) return c[args.generation] || [];
      return { leyendas: c.leyendas || [], coetaneos: c.coetaneos || [] };
    },
  },
  {
    name: "list_extension_points",
    description: "Puntos de extensión del juego: dónde y cómo añadir funcionalidad (archivos, anclas, receta). Usa el 'id' al reservar un área.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run() { return readManifest().extension_points || []; },
  },
  {
    name: "get_manifest",
    description: "Devuelve el manifest completo (game/manifest.json), la fuente única de verdad del juego.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run() { return readManifest(); },
  },
  {
    name: "list_reservations",
    description: "Lista las reservas de áreas (registro 'no pisarnos'). Por defecto solo activas.",
    inputSchema: { type: "object", properties: { all: { type: "boolean", description: "true para incluir inactivas" } }, additionalProperties: false },
    run(args) {
      const all = (readManifest().collaboration && readManifest().collaboration.reservations) || [];
      return (args && args.all) ? all : all.filter(r => r.active !== false);
    },
  },
  {
    name: "claim_area",
    description: "Reserva un área de extensión para trabajar sin que otro la toque a la vez. 'area' debe ser un id de extension_points (verbs, council, llm-engines, backend, manifest-help). Falla si ya está reservada activa por otra persona.",
    inputSchema: {
      type: "object",
      properties: {
        area: { type: "string", description: "id del punto de extensión (p. ej. 'verbs')" },
        owner: { type: "string", description: "quién reserva (nombre o agente, p. ej. 'Oráculo')" },
        branch: { type: "string", description: "rama git donde se trabaja" },
        note: { type: "string", description: "qué vas a hacer" },
      },
      required: ["area", "owner"],
      additionalProperties: false,
    },
    run(args) {
      const m = readManifest();
      const ids = extensionIds(m);
      if (!ids.includes(args.area)) throw new Error(`Área desconocida '${args.area}'. Válidas: ${ids.join(", ")}`);
      if (!m.collaboration) m.collaboration = {};
      if (!Array.isArray(m.collaboration.reservations)) m.collaboration.reservations = [];
      const res = m.collaboration.reservations;
      const conflict = res.find(r => r.area === args.area && r.active !== false && r.owner !== args.owner);
      if (conflict) throw new Error(`'${args.area}' ya está reservada por ${conflict.owner} (rama ${conflict.branch || "?"}, desde ${conflict.since || "?"}). Coordínate o elige otra área.`);
      // Si el mismo owner ya la tiene, actualiza; si no, crea
      let entry = res.find(r => r.area === args.area && r.owner === args.owner && r.active !== false);
      if (entry) {
        if (args.branch) entry.branch = args.branch;
        if (args.note) entry.note = args.note;
      } else {
        entry = { area: args.area, owner: args.owner, branch: args.branch || "", since: today(), note: args.note || "", active: true };
        res.push(entry);
      }
      writeManifest(m);
      return { claimed: entry, message: `Área '${args.area}' reservada para ${args.owner}. Recuerda liberar con release_area al terminar.` };
    },
  },
  {
    name: "release_area",
    description: "Libera una reserva previa (la marca inactiva). Indica el área y el owner que la tenía.",
    inputSchema: {
      type: "object",
      properties: { area: { type: "string" }, owner: { type: "string" } },
      required: ["area", "owner"],
      additionalProperties: false,
    },
    run(args) {
      const m = readManifest();
      const res = (m.collaboration && m.collaboration.reservations) || [];
      const matches = res.filter(r => r.area === args.area && r.owner === args.owner && r.active !== false);
      if (!matches.length) throw new Error(`No hay reserva activa de '${args.area}' a nombre de ${args.owner}.`);
      matches.forEach(r => { r.active = false; r.released = today(); });
      writeManifest(m);
      return { released: matches.length, area: args.area, owner: args.owner };
    },
  },
  {
    name: "check_sync",
    description: "Comprueba que el manifest sigue sincronizado con el juego real (council-scumm.html): verbos y personas. Devuelve la salida del verificador.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run() {
      try {
        const out = execFileSync(process.execPath, [CHECK_SCRIPT], { encoding: "utf8" });
        return { ok: true, output: out.trim() };
      } catch (e) {
        return { ok: false, output: ((e.stdout || "") + (e.stderr || "")).trim() || String(e.message) };
      }
    },
  },
];
const TOOL_MAP = Object.fromEntries(TOOLS.map(t => [t.name, t]));

// ─────────────────────────── JSON-RPC plumbing ───────────────────────────
function send(msg) { process.stdout.write(JSON.stringify(msg) + "\n"); }
function reply(id, result) { send({ jsonrpc: "2.0", id, result }); }
function replyError(id, code, message) { send({ jsonrpc: "2.0", id, error: { code, message } }); }

function handle(req) {
  const { id, method, params } = req;
  const isNotification = id === undefined || id === null;
  try {
    switch (method) {
      case "initialize":
        return reply(id, {
          protocolVersion: (params && params.protocolVersion) || PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER,
        });
      case "notifications/initialized":
      case "notifications/cancelled":
        return; // notificaciones: sin respuesta
      case "ping":
        return reply(id, {});
      case "tools/list":
        return reply(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
      case "tools/call": {
        const name = params && params.name;
        const tool = TOOL_MAP[name];
        if (!tool) return replyError(id, -32602, `Tool desconocida: ${name}`);
        let data;
        try {
          data = tool.run(params.arguments || {});
        } catch (e) {
          // Error "de negocio": se devuelve como resultado isError para que el modelo lo vea
          return reply(id, { content: [{ type: "text", text: "ERROR: " + e.message }], isError: true });
        }
        const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
        return reply(id, { content: [{ type: "text", text }] });
      }
      case "prompts/list":
        return reply(id, { prompts: [] });
      case "resources/list":
        return reply(id, { resources: [] });
      default:
        if (isNotification) return;
        return replyError(id, -32601, `Método no soportado: ${method}`);
    }
  } catch (e) {
    log("handler error:", e.message);
    if (!isNotification) replyError(id, -32603, "Error interno: " + e.message);
  }
}

// ─────────────────────────── stdin loop (NDJSON) ───────────────────────────
let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let req;
    try { req = JSON.parse(line); } catch (e) { log("JSON inválido:", line.slice(0, 120)); continue; }
    if (Array.isArray(req)) req.forEach(handle); else handle(req);
  }
});
process.stdin.on("end", () => process.exit(0));
log("listo. manifest:", MANIFEST_PATH);
