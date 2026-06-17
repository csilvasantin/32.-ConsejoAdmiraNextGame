import { createServer, request as httpRequest } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extname, resolve, basename } from "node:path";
import { spawn } from "node:child_process";

import { createMachineEntry, readMachines, updateMachineStatus, updateMachineSync } from "./store.js";
import { sendPromptToMachine, resolveMachineName, getCapture, getImageBuffer, approveAll, approveMachine, getAllSnapshots, getReachableMachines, getWatchdogState, setWatchdogEnabled, setMachineWatchdog, sendOnboardingToAll, startWatchdog, runSkynetClaudeAudit } from "./ssh-exec.js";
import { addEntries, addEntry, getHistory } from "./teamwork-store.js";
import {
  listTasks,
  getTask,
  createTask,
  updateTaskStatus,
  recordDispatch,
  addTaskNote,
  deleteTask,
  archiveTasks,
  recoverStuckTasks,
  setTaskImage,
  TASK_STATUSES,
  TASK_PRIORITIES
} from "./tasks-store.js";

const PORT = Number(process.env.PORT || 3030);
const HOST = "0.0.0.0";
const PUBLIC_DIR = resolve(import.meta.dirname, "../public");
const PROOFS_DIR = resolve(import.meta.dirname, "../data/proofs");
const AGORA_BIN = process.env.AGORA_BIN || "agora";
const AGORA_FROM = process.env.AGORA_FROM || "Codex";
const AGORA_READ_LAST = Number(process.env.AGORA_READ_LAST || 20);
const AGORA_PANEL_KEY = process.env.AGORA_PANEL_KEY || process.env.COUNCIL_API_TOKEN || "";
const AGORA_COUNCIL_TOKEN = process.env.AGORA_COUNCIL_TOKEN || process.env.COUNCIL_API_TOKEN || "";
const AGORA_COUNCIL_WINDOW_MS = Number(process.env.AGORA_COUNCIL_WINDOW_MS || 60000);
const AGORA_COUNCIL_LIMIT = Number(process.env.AGORA_COUNCIL_LIMIT || 40);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8"
};
const VALID_STATUSES = new Set(["online", "idle", "busy", "offline", "maintenance"]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Agora-Panel-Key, X-Council-Token",
  "Access-Control-Allow-Private-Network": "true"
};
const MATRIX_COUNCIL_LINKS = new Map([
  ["Elon Musk", { alias: "Neo", role: "CEO" }],
  ["Jensen Huang", { alias: "Morfeo", role: "CTO" }],
  ["Gwynne Shotwell", { alias: "Trinity", role: "COO" }],
  ["Ruth Porat", { alias: "Oráculo", role: "CFO" }],
  ["John Lasseter", { alias: "Mouse", role: "CCO" }],
  ["Jony Ive", { alias: "Arquitecto", role: "CDO" }],
  ["Carlos Ratti", { alias: "Link", role: "CXO" }],
  ["Ryan Reynolds", { alias: "Cypher", role: "CSO" }]
]);
// Agentes extra del Consejo (fuera de las 8 leyendas Matrix). Smith = OpenCode+DeepSeek,
// soporte al resto del equipo, atendido por un demonio agora-attend en su máquina.
const EXTRA_COUNCIL_AGENTS = [
  { alias: "Smith", role: "Soporte", persona: "Agent Smith", engine: "OpenCode·DeepSeek" }
];
const AGORA_COUNCIL_ALLOWED_ORIGINS = new Set([
  "http://www.admira.live",
  "https://www.admira.live",
  "http://admira.live",
  "https://admira.live",
  "https://csilvasantin.github.io"
]);
const agoraCouncilHits = new Map();
const councilHeartbeats = new Map();  // alias -> {host, capture, login, ver, at} (salud de bots)
function cleanStr(v, fb = "") { return (typeof v === "string" && v.trim()) ? v.trim() : fb; }
const FRIENDLY_ROUTES = new Map([
  ["/control", "/teamwork.html?v=20260613-1"],
  ["/equipo", "/index.html"],
  ["/team", "/index.html"],
  ["/admin", "/consejo.html"],
  ["/consejo", "/consejo.html"],
  ["/alta", "/new-member.html?preset=ceo-macbook-air-clean"],
  ["/ceo", "/new-member.html?preset=ceo-macbook-air-clean"],
  ["/alta-ceo", "/new-member.html?preset=ceo-macbook-air-clean"],
  ["/creativa", "/new-member.html?preset=creative-macbook-air-clean"],
  ["/alta-creativa", "/new-member.html?preset=creative-macbook-air-clean"]
]);
const DEFAULT_ONBOARDING_PROMPT =
  "Haz onboarding leyendo el repositorio onboarding de Admira Next primero. Carga el contexto compartido, identifica los repositorios activos y queda listo para continuar sin pedir de nuevo el contexto base.";

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS });
  response.end(JSON.stringify(payload));
}

function isLocalRequest(request) {
  const rawHost = String(request.headers.host || "").split(":")[0].replace(/^\[|\]$/g, "");
  return rawHost === "localhost" || rawHost === "127.0.0.1" || rawHost === "::1" || rawHost === "0.0.0.0";
}

function verifyAgoraAccess(request, url) {
  if (isLocalRequest(request) && !AGORA_PANEL_KEY) {
    return null;
  }

  if (!AGORA_PANEL_KEY) {
    return "AGORA_PANEL_KEY no configurada en el backend";
  }

  const provided = request.headers["x-agora-panel-key"] || url.searchParams.get("key") || "";
  return provided === AGORA_PANEL_KEY ? null : "Clave AgoraMatrix invalida";
}

function isAllowedCouncilOrigin(request) {
  const origin = String(request.headers.origin || "");
  if (!origin) return true;
  if (AGORA_COUNCIL_ALLOWED_ORIGINS.has(origin)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin);
}

function verifyAgoraCouncilAccess(request) {
  if (!isAllowedCouncilOrigin(request)) {
    return "Origen no autorizado para el puente del Consejo";
  }

  if (!AGORA_COUNCIL_TOKEN) {
    return isLocalRequest(request) ? null : "AGORA_COUNCIL_TOKEN no configurado";
  }

  const provided = request.headers["x-council-token"] || "";
  return provided === AGORA_COUNCIL_TOKEN ? null : "Token del Consejo invalido";
}

// Guardia de ESCRITURA: las operaciones que mandan comandos a las máquinas (crear,
// dispatch, cambiar estado, archivar, borrar) exigen token secreto. Las LECTURAS (GET)
// siguen abiertas con origin. Si COUNCIL_WRITE_TOKEN no está configurado, no exige nada
// (compatibilidad durante el despliegue); en cuanto se define en el server, queda activo.
const COUNCIL_WRITE_TOKEN = process.env.COUNCIL_WRITE_TOKEN || "";
function requireCouncilWrite(request, response) {
  if (!isAllowedCouncilOrigin(request)) { sendJson(response, 403, { ok: false, error: "Origen no permitido" }); return false; }
  if (COUNCIL_WRITE_TOKEN) {
    const provided = request.headers["x-council-token"] || "";
    if (provided !== COUNCIL_WRITE_TOKEN) { sendJson(response, 401, { ok: false, error: "Token del Consejo requerido o inválido" }); return false; }
  }
  if (!checkAgoraCouncilRateLimit(request)) { sendJson(response, 429, { ok: false, error: "Demasiadas peticiones" }); return false; }
  return true;
}

function checkAgoraCouncilRateLimit(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const key = forwarded || request.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const recent = (agoraCouncilHits.get(key) || []).filter((ts) => now - ts < AGORA_COUNCIL_WINDOW_MS);
  if (recent.length >= AGORA_COUNCIL_LIMIT) {
    agoraCouncilHits.set(key, recent);
    return false;
  }
  recent.push(now);
  agoraCouncilHits.set(key, recent);
  return true;
}

function compactAgoraText(value, maxLength) {
  const text = String(value || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1))}…` : text;
}

function buildCouncilAgoraMessage(parsed) {
  const persona = compactAgoraText(parsed.persona, 80);
  const matrix = MATRIX_COUNCIL_LINKS.get(persona);
  if (!matrix) {
    return { ok: false, error: "Persona sin enlace Matrix" };
  }

  const event = String(parsed.event || "question").toLowerCase();
  const question = compactAgoraText(parsed.question, 700);
  const answer = compactAgoraText(parsed.answer, 1400);
  const url = compactAgoraText(parsed.url, 180);
  const llm = compactAgoraText(parsed.llm, 60);
  const role = compactAgoraText(parsed.role || matrix.role, 20);
  const generation = compactAgoraText(parsed.generation || "coetaneos", 24);
  const target = `${matrix.alias} (${persona}/${role})`;

  if (!question) {
    return { ok: false, error: "Pregunta obligatoria" };
  }

  if (event === "answer") {
    if (!answer) {
      return { ok: false, error: "Respuesta obligatoria" };
    }
    return {
      ok: true,
      alias: matrix.alias,
      text: [
        `AdmiraLive <- ${target}`,
        `Pregunta: ${question}`,
        `Respuesta web: ${answer}`,
        llm ? `Motor: ${llm}` : "",
        url ? `Abrir: ${url}` : ""
      ].filter(Boolean).join(" | ")
    };
  }

  if (event === "offline") {
    return {
      ok: true,
      alias: matrix.alias,
      text: [
        `AdmiraLive -> ${target}`,
        `Pregunta: ${question}`,
        "Estado: la web no obtuvo respuesta del motor LLM; queda dirigida aqui en AgoraMatrix.",
        url ? `Abrir: ${url}` : ""
      ].filter(Boolean).join(" | ")
    };
  }

  return {
    ok: true,
    alias: matrix.alias,
    text: [
      `AdmiraLive -> ${target}`,
      `Pregunta de Carlos: ${question}`,
      `Generacion: ${generation}`,
      llm ? `Motor web: ${llm}` : "",
      "Responde aqui como ese alias si estas activo; la web tambien intentara responder en pantalla.",
      url ? `Abrir: ${url}` : ""
    ].filter(Boolean).join(" | ")
  };
}

const PRIORITY_LABELS = { urgent: "🔴 urgente", high: "🟠 alta", normal: "🟡 normal", low: "⚪ baja" };
const APPROVAL_MODE_LABELS = {
  full_access: "🟢 Omitir permisos / acceso completo",
  auto_approve: "🟡 Aceptar peticiones del agente",
  ask: "🔴 Solicitar permisos al Consejo",
};
const APPROVAL_MODE_INSTRUCTIONS = {
  full_access: [
    "Modo permisos: Omitir permisos / acceso completo.",
    "Codex: usa Acceso completo.",
    "Claude Code: trabaja sin pedir confirmaciones intermedias; si existe modo skip/auto-approve, activalo.",
    "OpenCode: ejecuta con permisos completos/auto-approve.",
    "No preguntes por permisos durante la tarea salvo secretos, pagos, borrados destructivos, reescritura de historial o riesgo irreversible.",
    "Al terminar, reporta resultado, commit/URL y verificacion.",
  ],
  auto_approve: [
    "Modo permisos: Aceptar peticiones del agente.",
    "Codex: usa Aprobar por mi.",
    "Claude Code/OpenCode: pide aprobacion solo cuando tu herramienta lo exija; el Consejo puede aceptar esas peticiones.",
    "Agrupa permisos cuando sea posible y continua hasta terminar.",
  ],
  ask: [
    "Modo permisos: Solicitar permisos al Consejo.",
    "Codex: usa Solicitar aprobacion.",
    "Claude Code/OpenCode: pausa y pide permiso antes de acciones sensibles o fuera del alcance.",
    "No avances en acciones dudosas hasta recibir respuesta del Consejo.",
  ],
};
const MONITOR_MODE_LABELS = {
  silicio: "⚙️ Modo Silicio",
  carbono: "🫀 Modo Carbono",
  skynet: "🛰️ Modo Skynet",
};
const MONITOR_MODE_INSTRUCTIONS = {
  silicio: [
    "Feedback: Modo Silicio.",
    "Trabaja con ritmo tecnico: confirma inicio, reporta solo hitos compactos que cambien el estado, bloqueo y cierre.",
    "Cada cierre debe incluir que hiciste, donde, commit/URL si aplica y verificacion ejecutada.",
    "Si quedas parado, sin actividad clara o esperando mas de 15 minutos, envia pantallazo/captura al Consejo y pide siguiente paso.",
    "Evita mensajes repetidos: si ya diste un estado suficiente, envia solo el delta.",
  ],
  carbono: [
    "Feedback: Modo Carbono.",
    "Reporta con tono humano solo hitos, dudas y cierre.",
    "Si quedas parado o necesitas criterio, explica la situacion; envia pantallazo si ayuda a decidir siguiente paso.",
  ],
  skynet: [
    "Feedback: Modo Skynet.",
    "Vigilancia estricta: no permanezcas inactivo en silencio.",
    "El Consejo monitoriza todos los equipos de la red; para empezar revisa Claude Code/Claude Desktop en cada maquina.",
    "Si Claude Code no tiene actividad clara, abre Claude Code a pantalla completa cuando sea seguro y captura que esta esperando.",
    "Si no estas ejecutando una accion concreta, si una herramienta espera permisos, o si pasan 5 minutos sin progreso visible, envia pantallazo/captura al Consejo con estado y siguiente decision recomendada.",
  ],
};

function taskApprovalMode(task) {
  return APPROVAL_MODE_LABELS[task.approvalMode] ? task.approvalMode : "full_access";
}

function taskApprovalInstruction(task) {
  return APPROVAL_MODE_INSTRUCTIONS[taskApprovalMode(task)].join(" ");
}

function taskMonitorMode(task) {
  return MONITOR_MODE_LABELS[task.monitorMode] ? task.monitorMode : "silicio";
}

function taskMonitorInstruction(task) {
  return MONITOR_MODE_INSTRUCTIONS[taskMonitorMode(task)].join(" ");
}

async function buildAssigneeList() {
  const agora = [...MATRIX_COUNCIL_LINKS.entries()].map(([persona, { alias, role }]) => ({
    kind: "agora",
    id: alias,
    label: `${alias} · ${role}`,
    persona,
    role
  }));
  // Agentes extra (Smith, etc.) también dispatchables desde el Consejo.
  for (const a of EXTRA_COUNCIL_AGENTS) {
    agora.push({ kind: "agora", id: a.alias, label: `${a.alias} · ${a.role}`, persona: a.persona, role: a.role });
  }

  let machines = [];
  try {
    const data = await readMachines();
    machines = (data.machines || []).map((m) => ({
      kind: "machine",
      id: m.id,
      label: m.name || m.id,
      role: m.role || m.machineRole || "",
      status: m.status || "unknown"
    }));
  } catch {
    machines = [];
  }
  return { agora, machines };
}

function buildTaskDispatchText(task) {
  const label = compactAgoraText(task.assignee?.label || task.assignee?.id, 60);
  const title = compactAgoraText(task.title, 280);
  const detail = compactAgoraText(task.detail, 700);
  const priority = PRIORITY_LABELS[task.priority] || task.priority;
  const approvalMode = taskApprovalMode(task);
  const monitorMode = taskMonitorMode(task);
  return [
    `📋 TAREA ${task.id} → ${label}`,
    `Encargo: ${title}`,
    detail ? `Detalle: ${detail}` : "",
    `Prioridad: ${priority}`,
    `Permisos: ${APPROVAL_MODE_LABELS[approvalMode]}`,
    taskApprovalInstruction(task),
    `Feedback: ${MONITOR_MODE_LABELS[monitorMode]}`,
    taskMonitorInstruction(task),
    `Para el seguimiento responde aquí citando ${task.id} y di si está 'en curso', 'bloqueada' o 'hecha' (se actualiza solo en el tablero).`
  ].filter(Boolean).join(" | ");
}

function runAgora(args, { input = "", timeoutMs = 15000 } = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(AGORA_BIN, args, {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRun({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        ...result,
      });
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ ok: false, code: null, signal: "timeout", error: "agora timeout" });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout = (stdout + chunk.toString("utf8")).slice(-30000);
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-12000);
    });
    child.on("error", (error) => finish({ ok: false, code: null, error: error.message }));
    child.on("close", (code, signal) => finish({ ok: code === 0, code, signal }));

    child.stdin.end(input);
  });
}

async function runAgoraJson(args) {
  const result = await runAgora(args);
  if (!result.ok) {
    return { ok: false, items: [], raw: result.stdout, error: result.stderr || result.error || "agora failed" };
  }

  try {
    const parsed = JSON.parse(result.stdout || "[]");
    return { ok: true, items: Array.isArray(parsed) ? parsed : [], raw: result.stdout };
  } catch {
    const items = splitAgoraLines(result.stdout)
      .filter((line) => !/^\((sin|buz[oó]n vac[ií]o)/i.test(line))
      .map((line) => ({ text: line }));
    return { ok: true, items, raw: result.stdout };
  }
}

function splitAgoraLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function getAgoraStatus() {
  const [whoami, who, feed, tasks, inbox] = await Promise.all([
    runAgora(["whoami", "--from", AGORA_FROM], { timeoutMs: 8000 }),
    runAgora(["who"], { timeoutMs: 10000 }),
    runAgora(["read", "--last", String(AGORA_READ_LAST)], { timeoutMs: 10000 }),
    runAgoraJson(["tasks", "--from", AGORA_FROM, "--peek", "--json"]),
    runAgoraJson(["inbox", "--from", AGORA_FROM, "--peek", "--json"]),
  ]);

  const errors = [whoami, who, feed, tasks, inbox]
    .filter((item) => !item.ok)
    .map((item) => item.error || item.stderr || "agora failed");

  return {
    ok: errors.length === 0,
    service: "agora",
    from: AGORA_FROM,
    identity: whoami.stdout || "",
    who: who.stdout || "",
    feed: splitAgoraLines(feed.stdout),
    tasks: tasks.items,
    inbox: inbox.items,
    fetchedAt: new Date().toISOString(),
    errors,
  };
}

function parseAwakeAgoraAliases(whoText) {
  const known = new Set([
    ...[...MATRIX_COUNCIL_LINKS.values()].map((item) => item.alias),
    ...EXTRA_COUNCIL_AGENTS.map((item) => item.alias),
  ]);
  const aliases = [];
  for (const line of splitAgoraLines(whoText)) {
    if (!/despierto/i.test(line)) continue;
    for (const alias of known) {
      if (new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(line)) {
        aliases.push(alias);
      }
    }
  }
  return [...new Set(aliases)];
}

function parseAwakeAgoraPresence(whoText) {
  const known = new Set([
    ...[...MATRIX_COUNCIL_LINKS.values()].map((item) => item.alias),
    ...EXTRA_COUNCIL_AGENTS.map((item) => item.alias),
  ]);
  const presence = new Map();
  for (const line of splitAgoraLines(whoText)) {
    if (!/despierto/i.test(line)) continue;
    for (const alias of known) {
      if (!new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(line)) continue;
      const hostMatch = line.match(/activo hace[^·\n]*·\s*([^·\n]+)/i);
      const host = cleanStr(hostMatch?.[1] || "");
      const ageMatch = line.match(/activo hace\s+(\d+)\s*(s|seg|min|m|h|d)\b/i);
      const n = Number(ageMatch?.[1] || 0);
      const unit = String(ageMatch?.[2] || "s").toLowerCase();
      const ageMs = unit === "d" ? n * 86400000 : unit === "h" ? n * 3600000 : (unit === "min" || unit === "m") ? n * 60000 : n * 1000;
      const current = presence.get(alias);
      const session = { host, at: Date.now() - ageMs, ageMs, source: "agora-who" };
      const sessions = [...(current?.sessions || []), session].sort((a, b) => a.ageMs - b.ageMs);
      if (!current || ageMs < current.ageMs) {
        presence.set(alias, { alias, host, at: session.at, ageMs, source: "agora-who", sessions });
      } else {
        presence.set(alias, { ...current, sessions });
      }
    }
  }
  return presence;
}

async function requestAgoraAgentStatus() {
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const who = await runAgora(["who"], { timeoutMs: 10000 });
  const aliases = parseAwakeAgoraAliases(who.stdout)
    .filter((alias) => !/^consejo$/i.test(alias));
  const targets = aliases.length ? aliases : [...MATRIX_COUNCIL_LINKS.values()].map((item) => item.alias);
  const results = [];
  for (const alias of targets) {
    const text = [
      `📡 ESTADO status-${stamp}-${alias} → ${alias}`,
      `Encargo: responde con "${alias} · <maquina> · <estado/tarea actual>"`,
      "Publica la respuesta aqui; admira.live la mostrara en el panel Agentes.",
    ].join(" | ");
    const result = await runAgora(["send", "--from", "Consejo", text], { timeoutMs: 45000 });
    results.push({
      alias,
      ok: !!result.ok,
      error: result.ok ? null : (result.stderr || result.error || "No se pudo publicar"),
    });
  }
  return { targets, results };
}

function addHistoryFromResults(results, { prompt, target, action }) {
  return addEntries(
    results.map((result) => ({
      machineId: result.id || result.machine || `${action}-${target || "system"}`,
      machineName: result.machine || result.name || result.id || "Sistema",
      prompt,
      ok: result.ok,
      error: result.error,
      captureId: result.captureId,
      target: result.target || (action === "onboarding-all" ? "auto" : target || "terminal"),
      action
    }))
  );
}

async function serveStatic(pathname, response) {
  const filePath = pathname === "/" ? resolve(PUBLIC_DIR, "index.html") : resolve(PUBLIC_DIR, `.${pathname}`);
  const ext = extname(filePath);
  const contentType = MIME_TYPES[ext] || "text/plain; charset=utf-8";
  try {
    const file = await readFile(filePath);
    response.writeHead(200, { "Content-Type": contentType });
    response.end(file);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

function readRequestBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolveBody(body));
    request.on("error", rejectBody);
  });
}

async function readJsonBody(request) {
  const rawBody = await readRequestBody(request);
  return rawBody ? JSON.parse(rawBody) : {};
}

// Guarda una captura (data URL base64) como prueba de la tarea y devuelve su URL pública
// /proofs/<id>.jpg. Devuelve null si no hay imagen o falla (la tarea sigue sin prueba).
async function saveTaskProof(id, dataUrl) {
  if (typeof dataUrl !== "string" || dataUrl.length < 64) return null;
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/s);
  const b64 = m ? m[2] : dataUrl;
  const ext = m && m[1] === "png" ? "png" : "jpg";
  try {
    const buf = Buffer.from(b64, "base64");
    if (!buf.length || buf.length > 6_000_000) return null; // tope 6MB
    await mkdir(PROOFS_DIR, { recursive: true });
    const safe = basename(String(id)).replace(/[^a-zA-Z0-9_-]/g, "");
    if (!safe) return null;
    await writeFile(resolve(PROOFS_DIR, `${safe}.${ext}`), buf);
    return `/proofs/${safe}.${ext}`;
  } catch {
    return null;
  }
}

async function dispatchTaskNow(task, target) {
  if (task.assignee?.kind === "machine") {
    const selected = target || "claude";
    const approvalMode = taskApprovalMode(task);
    const monitorMode = taskMonitorMode(task);
    const prompt = [
      task.title,
      task.detail,
      `Permisos: ${APPROVAL_MODE_LABELS[approvalMode]}`,
      taskApprovalInstruction(task),
      `Feedback: ${MONITOR_MODE_LABELS[monitorMode]}`,
      taskMonitorInstruction(task),
    ].filter(Boolean).join("\n\n");
    const result = await sendPromptToMachine(task.assignee.id, prompt, selected);
    return {
      ok: !!result.ok,
      error: result.ok ? null : (result.error || "No se pudo enviar a la máquina"),
      channel: `ssh:${selected}`,
      target: selected
    };
  }

  const text = buildTaskDispatchText(task);
  const result = await runAgora(["send", "--from", "Consejo", text], { timeoutMs: 45000 });
  return {
    ok: !!result.ok,
    error: result.ok ? null : (result.stderr || result.error || "No se pudo publicar en AgoraMatrix"),
    channel: "agora",
    target: task.assignee?.id || ""
  };
}

// ───── Auto-seguimiento: el feed de AgoraMatrix actualiza el estado de las tareas ─────
// Cuando un consejero responde citando "task-NNN" + 'hecha'/'en curso'/'bloqueada',
// el estado del tablero se actualiza solo. Cierra el lazo sin tocar el panel.
const TASK_SEEN_LINES = new Set();
let taskSyncPrimed = false;

function normLine(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function detectTaskStatus(normText) {
  if (/(bloquead|blocked|atascad|stuck|⛔)/.test(normText)) return "blocked";
  if (/(hecho|hecha|done|completad|terminad|finalizad|resuelt|✅)/.test(normText)) return "done";
  if (/(en curso|empezand|working|wip|in progress|trabajand|avanzand|retomand|on it)/.test(normText)) return "in_progress";
  return null;
}

async function syncTasksFromAgora() {
  const feedRes = await runAgora(["read", "--last", "30"], { timeoutMs: 10000 });
  if (!feedRes.ok) return;
  const lines = splitAgoraLines(feedRes.stdout);

  if (!taskSyncPrimed) {
    // Primer pase: registra lo ya existente sin actuar (no reabrir la historia).
    lines.forEach((l) => TASK_SEEN_LINES.add(l));
    taskSyncPrimed = true;
    return;
  }

  const fresh = lines.filter((l) => !TASK_SEEN_LINES.has(l));
  if (!fresh.length) return;
  fresh.forEach((l) => TASK_SEEN_LINES.add(l));
  if (TASK_SEEN_LINES.size > 400) {
    const arr = [...TASK_SEEN_LINES];
    TASK_SEEN_LINES.clear();
    arr.slice(-200).forEach((l) => TASK_SEEN_LINES.add(l));
  }

  let tasks;
  try { tasks = await listTasks(); } catch { return; }
  const open = tasks.filter((t) => t.status !== "done");
  if (!open.length) return;

  for (const line of fresh) {
    const m = line.match(/\[([^\]]+)\]\s*([\s\S]*)$/);
    const who = m ? m[1].trim() : "";
    const text = m ? m[2] : line;
    if (/^consejo$/i.test(who)) continue; // no auto-procesar nuestros propios envíos
    const norm = normLine(text);
    const ids = norm.match(/task-\d+/g);
    if (!ids) continue;
    const status = detectTaskStatus(norm);
    if (!status) continue;
    for (const id of [...new Set(ids)]) {
      const task = open.find((t) => t.id.toLowerCase() === id);
      if (!task || task.status === status) continue;
      try {
        await updateTaskStatus(task.id, status, {
          from: who || "AgoraMatrix",
          note: `auto desde AgoraMatrix (${who || "?"}): "${text.slice(0, 120)}"`
        });
        task.status = status;
      } catch { /* sigue con el resto */ }
    }
  }
}

function startTaskAgoraSync() {
  syncTasksFromAgora().catch(() => {});
  setInterval(() => { syncTasksFromAgora().catch(() => {}); }, 20000);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, CORS_HEADERS);
    response.end();
    return;
  }

  if (url.pathname === "/api/agora/status") {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }

    const denied = verifyAgoraAccess(request, url);
    if (denied) {
      sendJson(response, 403, { ok: false, error: denied });
      return;
    }

    try {
      const status = await getAgoraStatus();
      sendJson(response, status.ok ? 200 : 502, status);
    } catch (error) {
      sendJson(response, 502, { ok: false, error: error instanceof Error ? error.message : "Agora no disponible" });
    }
    return;
  }

  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/api/agora/coetaneos") {
    // Lectura para el panel de COETÁNEOS de admira.live: feed en vivo + presencia.
    // Origin-gated (reusa la allowlist del Consejo) → SIN clave en el sitio público.
    if (!isAllowedCouncilOrigin(request)) {
      sendJson(response, 403, { ok: false, error: "Origen no permitido" });
      return;
    }
    try {
      const limit = Math.max(1, Math.min(60, Number(url.searchParams.get("limit")) || 24));
      const [feed, who] = await Promise.all([
        runAgora(["read", "--last", String(limit)], { timeoutMs: 12000 }),
        runAgora(["who"], { timeoutMs: 10000 }),
      ]);
      sendJson(response, 200, {
        ok: true,
        feed: splitAgoraLines(feed.stdout),
        who: who.stdout || "",
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      sendJson(response, 502, { ok: false, error: error instanceof Error ? error.message : "Agora no disponible" });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/agora/say") {
    // Chat del panel del Consejo → AgoraMatrix. Origin-gated (sin clave) + rate-limit.
    // Publica como "Consejo" (o `from`); las respuestas aparecen en el feed que ya pollea el panel.
    if (!isAllowedCouncilOrigin(request)) {
      sendJson(response, 403, { ok: false, error: "Origen no permitido" });
      return;
    }
    if (!checkAgoraCouncilRateLimit(request)) {
      sendJson(response, 429, { ok: false, error: "Demasiados mensajes en poco tiempo" });
      return;
    }
    try {
      const parsed = await readJsonBody(request);
      const text = compactAgoraText(parsed.text, 600);
      if (!text) {
        sendJson(response, 400, { ok: false, error: "Mensaje vacío" });
        return;
      }
      const from = compactAgoraText(parsed.from, 40) || "Consejo";
      const result = await runAgora(["send", "--from", from, text], { timeoutMs: 45000 });
      sendJson(response, result.ok ? 200 : 502, {
        ok: result.ok,
        from,
        error: result.ok ? null : (result.stderr || result.error || "No se pudo enviar a AgoraMatrix"),
      });
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : "Error al enviar" });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/agora/request-status") {
    // Puesto de mando admira.live → peticiones dirigidas a agentes activos.
    // Origin-gated + rate-limit, igual que /api/agora/say.
    if (!isAllowedCouncilOrigin(request)) {
      sendJson(response, 403, { ok: false, error: "Origen no permitido" });
      return;
    }
    if (!checkAgoraCouncilRateLimit(request)) {
      sendJson(response, 429, { ok: false, error: "Demasiadas peticiones en poco tiempo" });
      return;
    }
    try {
      const status = await requestAgoraAgentStatus();
      const ok = status.results.some((item) => item.ok);
      sendJson(response, ok ? 200 : 502, { ok, ...status, fetchedAt: new Date().toISOString() });
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : "Error al pedir estado" });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/agora/send") {
    const denied = verifyAgoraAccess(request, url);
    if (denied) {
      sendJson(response, 403, { ok: false, error: denied });
      return;
    }

    try {
      const parsed = await readJsonBody(request);
      const text = String(parsed.text || "").trim();
      if (!text) {
        sendJson(response, 400, { ok: false, error: "Mensaje obligatorio" });
        return;
      }
      if (text.length > 1200) {
        sendJson(response, 400, { ok: false, error: "Mensaje demasiado largo" });
        return;
      }

      const result = await runAgora(["send", "--from", AGORA_FROM, text], { timeoutMs: 20000 });
      sendJson(response, result.ok ? 200 : 502, {
        ok: result.ok,
        output: result.stdout,
        error: result.ok ? null : result.stderr || result.error || "No se pudo publicar en AgoraMatrix",
      });
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : "Error AgoraMatrix" });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/agora/council-question") {
    const denied = verifyAgoraCouncilAccess(request);
    if (denied) {
      sendJson(response, 403, { ok: false, error: denied });
      return;
    }
    if (!checkAgoraCouncilRateLimit(request)) {
      sendJson(response, 429, { ok: false, error: "Demasiadas preguntas del Consejo en poco tiempo" });
      return;
    }

    try {
      const parsed = await readJsonBody(request);
      const message = buildCouncilAgoraMessage(parsed);
      if (!message.ok) {
        sendJson(response, 400, message);
        return;
      }

      const result = await runAgora(["send", "--from", AGORA_FROM, message.text], { timeoutMs: 45000 });
      sendJson(response, result.ok ? 200 : 502, {
        ok: result.ok,
        alias: message.alias,
        output: result.stdout,
        error: result.ok ? null : result.stderr || result.error || "No se pudo publicar la pregunta en AgoraMatrix",
      });
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : "Error puente Consejo/Agora" });
    }
    return;
  }

  // ───────── Tareas del Consejo (reparto + seguimiento) ─────────
  // Origin-gated (admira.live en la allowlist) → SIN clave en el sitio público.
  // Mutaciones también pasan por rate-limit.
  if (url.pathname === "/api/council/assignees") {
    if (request.method !== "GET") { sendJson(response, 405, { error: "Method not allowed" }); return; }
    if (!isAllowedCouncilOrigin(request)) { sendJson(response, 403, { ok: false, error: "Origen no permitido" }); return; }
    try {
      sendJson(response, 200, { ok: true, ...(await buildAssigneeList()) });
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : "Error" });
    }
    return;
  }

  // Salud de los bots: los demonios mandan latido; el panel lo lee. Fin del "acto de fe".
  if (url.pathname === "/api/council/heartbeat" && request.method === "POST") {
    if (!requireCouncilWrite(request, response)) return;
    try {
      const p = await readJsonBody(request);
      const alias = cleanStr(p.alias);
      if (alias) {
        councilHeartbeats.set(alias, {
          alias, host: cleanStr(p.host), capture: !!p.capture, login: p.login !== false,
          ver: cleanStr(p.ver), at: Date.now()
        });
      }
      sendJson(response, 200, { ok: true });
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error instanceof Error ? error.message : "Error" });
    }
    return;
  }
  if (url.pathname === "/api/council/health" && request.method === "GET") {
    if (!isAllowedCouncilOrigin(request)) { sendJson(response, 403, { ok: false, error: "Origen no permitido" }); return; }
    try {
      const { agora } = await buildAssigneeList();
      const all = await listTasks({});
      const now = Date.now();
      const who = await runAgora(["who"], { timeoutMs: 10000 });
      const agoraPresence = who.ok ? parseAwakeAgoraPresence(who.stdout) : new Map();
      const bots = (agora || []).map((a) => {
        const hb = councilHeartbeats.get(a.id);
        const ag = agoraPresence.get(a.id);
        const online = (!!hb && (now - hb.at) < 90000) || !!ag;
        const mine = all.filter((t) => t.assignee?.id === a.id);
        const last = mine.sort((x, y) => new Date(y.updatedAt) - new Date(x.updatedAt))[0];
        return {
          id: a.id, label: a.label, persona: a.persona, role: a.role,
          online,
          host: hb?.host || (ag?.sessions?.map((s) => s.host).filter(Boolean).join(" + ") || ag?.host) || null,
          sessions: ag?.sessions || [],
          capture: hb?.capture ?? null, login: hb?.login ?? null,
          lastSeen: hb?.at || ag?.at || null,
          presenceSource: hb ? "heartbeat" : (ag ? "agora-who" : null),
          lastTask: last ? { id: last.id, title: last.title, status: last.status, at: last.updatedAt } : null
        };
      });
      sendJson(response, 200, { ok: true, bots, fetchedAt: new Date().toISOString() });
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : "Error" });
    }
    return;
  }

  if (url.pathname === "/api/council/tasks") {
    if (request.method === "GET") {
      if (!isAllowedCouncilOrigin(request)) { sendJson(response, 403, { ok: false, error: "Origen no permitido" }); return; }
      try {
        const tasks = await listTasks({
          status: url.searchParams.get("status") || undefined,
          assignee: url.searchParams.get("assignee") || undefined
        });
        sendJson(response, 200, { ok: true, tasks, fetchedAt: new Date().toISOString() });
      } catch (error) {
        sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : "Error" });
      }
      return;
    }

    if (request.method === "POST") {
      if (!requireCouncilWrite(request, response)) return;   // crear tarea = escritura → token
      try {
        const parsed = await readJsonBody(request);
        const task = await createTask(parsed);
        // Adjunto de imagen del usuario (pegada/subida): se guarda y se enlaza a la tarea.
        if (parsed.imageData) {
          const imgUrl = await saveTaskProof(`${task.id}-img`, parsed.imageData);
          if (imgUrl) { await setTaskImage(task.id, imgUrl); task.image = imgUrl; }
        }
        let dispatch = null;
        const dueNow = !task.scheduledAt || new Date(task.scheduledAt).getTime() <= Date.now();
        if (parsed.dispatch && dueNow) {
          const res = await dispatchTaskNow(task, parsed.target);
          await recordDispatch(task.id, { ...res, from: parsed.createdBy || "Consejo" });
          dispatch = res;
        }
        const fresh = await getTask(task.id);
        sendJson(response, 201, { ok: true, task: fresh, dispatch });
      } catch (error) {
        sendJson(response, 400, { ok: false, error: error instanceof Error ? error.message : "No se pudo crear la tarea" });
      }
      return;
    }

    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  // Bulk: archivar (finalizar guardando) todas las tareas hechas — "Limpiar hechas".
  if (request.method === "POST" && url.pathname === "/api/council/tasks/_archive-done") {
    if (!requireCouncilWrite(request, response)) return;
    try {
      const archived = await archiveTasks({ onlyStatus: "done" });
      sendJson(response, 200, { ok: true, archived });
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : "Error" });
    }
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/council/tasks/")) {
    if (!requireCouncilWrite(request, response)) return;

    const parts = url.pathname.split("/"); // ["", "api","council","tasks", id, action]
    const id = parts[4];
    const action = parts[5] || "";
    try {
      const parsed = await readJsonBody(request);

      if (action === "status") {
        if (!TASK_STATUSES.has(parsed.status)) { sendJson(response, 400, { ok: false, error: "Estado inválido" }); return; }
        const proof = parsed.proofImage ? await saveTaskProof(id, parsed.proofImage) : undefined;
        const task = await updateTaskStatus(id, parsed.status, { note: parsed.note, from: parsed.from, result: parsed.result, host: parsed.host, proof });
        if (!task) { sendJson(response, 404, { ok: false, error: "Tarea no encontrada" }); return; }
        sendJson(response, 200, { ok: true, task });
        return;
      }

      if (action === "dispatch") {
        const task = await getTask(id);
        if (!task) { sendJson(response, 404, { ok: false, error: "Tarea no encontrada" }); return; }
        const res = await dispatchTaskNow(task, parsed.target);
        const updated = await recordDispatch(id, { ...res, from: parsed.from || "Consejo" });
        sendJson(response, res.ok ? 200 : 502, { ok: res.ok, task: updated, dispatch: res, error: res.error });
        return;
      }

      if (action === "note") {
        const task = await addTaskNote(id, { note: parsed.note, from: parsed.from });
        if (!task) { sendJson(response, 404, { ok: false, error: "Tarea no encontrada" }); return; }
        sendJson(response, 200, { ok: true, task });
        return;
      }

      if (action === "archive") {
        const task = await updateTaskStatus(id, "archived", { from: parsed.from || "Consejo", note: "finalizada (archivada)" });
        if (!task) { sendJson(response, 404, { ok: false, error: "Tarea no encontrada" }); return; }
        sendJson(response, 200, { ok: true, task });
        return;
      }

      if (action === "delete") {
        const ok = await deleteTask(id);
        sendJson(response, ok ? 200 : 404, { ok, error: ok ? null : "Tarea no encontrada" });
        return;
      }

      sendJson(response, 404, { ok: false, error: "Acción desconocida" });
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error instanceof Error ? error.message : "Error" });
    }
    return;
  }

  if ((request.method === "GET" || request.method === "HEAD") && FRIENDLY_ROUTES.has(url.pathname)) {
    response.writeHead(302, { Location: FRIENDLY_ROUTES.get(url.pathname) });
    response.end();
    return;
  }

  if (url.pathname === "/api/machines") {
    if (request.method !== "GET" && request.method !== "POST") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }

    if (request.method === "GET") {
      const data = await readMachines();
      sendJson(response, 200, data);
      return;
    }

    if (request.method === "POST") {
      try {
        const rawBody = await readRequestBody(request);
        const parsed = rawBody ? JSON.parse(rawBody) : {};
        if (!VALID_STATUSES.has(parsed.status || "maintenance")) {
          sendJson(response, 400, { error: "Invalid status" });
          return;
        }

        const machine = await createMachineEntry(parsed);
        sendJson(response, 201, { ok: true, machine });
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : "No se pudo crear la maquina" });
      }
      return;
    }
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/machines/") && url.pathname.endsWith("/status")) {
    const parts = url.pathname.split("/");
    const id = parts[3];
    const rawBody = await readRequestBody(request);
    const parsed = rawBody ? JSON.parse(rawBody) : {};
    const status = parsed.status;
    const note = parsed.note ?? "";

    if (!VALID_STATUSES.has(status)) {
      sendJson(response, 400, { error: "Invalid status" });
      return;
    }

    const updated = await updateMachineStatus(id, status, note);
    if (!updated) {
      sendJson(response, 404, { error: "Machine not found" });
      return;
    }

    sendJson(response, 200, { ok: true, machine: updated });
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/machines/") && url.pathname.endsWith("/sync")) {
    const parts = url.pathname.split("/");
    const id = parts[3];
    const rawBody = await readRequestBody(request);
    const parsed = rawBody ? JSON.parse(rawBody) : {};
    const status = parsed.status;

    if (!VALID_STATUSES.has(status)) {
      sendJson(response, 400, { error: "Invalid status" });
      return;
    }

    const updated = await updateMachineSync(id, {
      status,
      note: parsed.note ?? "",
      currentFocus: parsed.currentFocus ?? ""
    });

    if (!updated) {
      sendJson(response, 404, { error: "Machine not found" });
      return;
    }

    sendJson(response, 200, { ok: true, machine: updated });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/teamwork/send") {
    const rawBody = await readRequestBody(request);
    const parsed = rawBody ? JSON.parse(rawBody) : {};
    let { machineId, prompt, target } = parsed;
    target = target || "terminal";

    if (!machineId || !prompt) {
      sendJson(response, 400, { error: "machineId y prompt son obligatorios" });
      return;
    }

    prompt = prompt.trim();
    if (!prompt) {
      sendJson(response, 400, { error: "El prompt no puede estar vacío" });
      return;
    }

    const data = await readMachines();
    const machine = data.machines.find((m) => m.id === machineId);
    if (!machine) {
      const resolved = resolveMachineName(data.machines, machineId);
      if (resolved) {
        machineId = resolved.id;
      }
    }

    const result = await sendPromptToMachine(machineId, prompt, target);
    const entry = addEntry(machineId, result.name || machineId, prompt, result.ok, result.error, result.captureId, target);
    sendJson(response, result.ok ? 200 : 502, { ...result, entry });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/teamwork/send-all") {
    const rawBody = await readRequestBody(request);
    const parsed = rawBody ? JSON.parse(rawBody) : {};
    const prompt = parsed.prompt?.trim();
    const target = parsed.target || "all";
    if (!prompt) {
      sendJson(response, 400, { error: "prompt obligatorio" });
      return;
    }

    const reachable = await getReachableMachines();
    const targets = target === "all" ? ["claude", "codex"] : [target];
    const tasks = reachable.flatMap((machine) =>
      targets.map((selectedTarget) => ({
        machine,
        target: selectedTarget
      }))
    );
    const results = await Promise.allSettled(
      tasks.map(({ machine, target: selectedTarget }) => sendPromptToMachine(machine.id, prompt, selectedTarget))
    );

    const output = results.map((entry, index) => {
      const task = tasks[index];
      if (entry.status === "fulfilled") {
        const value = entry.value;
        return {
          ...value,
          id: task.machine.id,
          machine: value.name || value.machine || task.machine.name,
          target: task.target
        };
      }

      return {
        id: task.machine.id,
        machine: task.machine.name,
        ok: false,
        error: entry.reason instanceof Error ? entry.reason.message : "rejected",
        target: task.target
      };
    });
    const entries = addHistoryFromResults(output, { prompt, target, action: "send-all" });
    sendJson(response, 200, { ok: true, results: output, entries });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/teamwork/onboarding-all") {
    const rawBody = await readRequestBody(request);
    const parsed = rawBody ? JSON.parse(rawBody) : {};
    const prompt = parsed.prompt?.trim() || DEFAULT_ONBOARDING_PROMPT;
    const results = await sendOnboardingToAll(prompt);
    const entries = addHistoryFromResults(results, { prompt, action: "onboarding-all" });
    sendJson(response, 200, { ok: true, prompt, results, entries });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/teamwork/approve") {
    const rawBody = await readRequestBody(request);
    const parsed = rawBody ? JSON.parse(rawBody) : {};
    const target = parsed.target || "claude";
    const results = await approveAll(target);
    const entries = addHistoryFromResults(results, {
      prompt: `Aprobar ${target === "codex" ? "Codex" : "Claude"}`,
      target,
      action: "approve-all"
    });
    sendJson(response, 200, { ok: true, results, entries });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/teamwork/approve-machine") {
    const rawBody = await readRequestBody(request);
    const parsed = rawBody ? JSON.parse(rawBody) : {};
    const { machineId, target } = parsed;
    if (!machineId) {
      sendJson(response, 400, { error: "machineId obligatorio" });
      return;
    }
    const result = await approveMachine(machineId, target || "claude");
    const entry = addEntries([
      {
        machineId: result.id || machineId,
        machineName: result.machine || machineId,
        prompt: `Aprobar ${(target || "claude") === "codex" ? "Codex" : "Claude"}`,
        ok: result.ok,
        error: result.error,
        target: target || "claude",
        action: "approve-machine"
      }
    ])[0];
    sendJson(response, 200, { ...result, entry });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/teamwork/snapshots") {
    sendJson(response, 200, { ok: true, snapshots: getAllSnapshots() });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/teamwork/skynet/claude-audit") {
    if (!requireCouncilWrite(request, response)) return;
    const result = await runSkynetClaudeAudit();
    sendJson(response, 200, { ok: true, ...result });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/teamwork/history") {
    sendJson(response, 200, { entries: getHistory() });
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/teamwork/capture/")) {
    const captureId = url.pathname.split("/").pop();
    const capture = getCapture(captureId);
    if (capture) {
      sendJson(response, 200, { ok: true, ...capture });
    } else {
      sendJson(response, 202, { ok: false, pending: true });
    }
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/screenshots/")) {
    const id = url.pathname.split("/").pop();
    const buf = getImageBuffer(id);
    if (buf) {
      response.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "no-cache, no-store, must-revalidate", ...CORS_HEADERS });
      response.end(buf);
    } else {
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end("Not found");
    }
    return;
  }

  // Watchdog endpoints
  if (request.method === "GET" && url.pathname === "/api/teamwork/watchdog") {
    sendJson(response, 200, { ok: true, ...getWatchdogState() });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/teamwork/watchdog") {
    const rawBody = await readRequestBody(request);
    const parsed = rawBody ? JSON.parse(rawBody) : {};
    setWatchdogEnabled(!!parsed.enabled);
    sendJson(response, 200, { ok: true, enabled: !!parsed.enabled });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/teamwork/watchdog/machine") {
    const rawBody = await readRequestBody(request);
    const parsed = rawBody ? JSON.parse(rawBody) : {};
    if (!parsed.machineId) {
      sendJson(response, 400, { error: "machineId obligatorio" });
      return;
    }
    setMachineWatchdog(parsed.machineId, !!parsed.enabled);
    sendJson(response, 200, { ok: true, machineId: parsed.machineId, enabled: !!parsed.enabled });
    return;
  }

  if (url.pathname.startsWith("/yarig")) {
    const rawBody = (request.method !== "GET" && request.method !== "HEAD")
      ? await readRequestBody(request)
      : null;
    const proxyReq = httpRequest(
      { hostname: "localhost", port: 9124, path: url.pathname + url.search, method: request.method,
        headers: { "content-type": request.headers["content-type"] || "application/json" } },
      (proxyRes) => {
        response.writeHead(proxyRes.statusCode, { "content-type": proxyRes.headers["content-type"] || "application/json", ...CORS_HEADERS });
        proxyRes.pipe(response);
      }
    );
    proxyReq.on("error", () => sendJson(response, 502, { error: "Yarig no disponible" }));
    if (rawBody) proxyReq.write(rawBody);
    proxyReq.end();
    return;
  }

  // Capturas de prueba de las tareas (servidas desde data/proofs, fuera de PUBLIC_DIR).
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/proofs/")) {
    const safe = basename(url.pathname).replace(/[^a-zA-Z0-9_.-]/g, "");
    const ext = extname(safe).toLowerCase();
    if (!safe || (ext !== ".jpg" && ext !== ".jpeg" && ext !== ".png")) { response.writeHead(404, { "Content-Type": "text/plain" }); response.end("not found"); return; }
    try {
      const buf = await readFile(resolve(PROOFS_DIR, safe));
      response.writeHead(200, { "Content-Type": ext === ".png" ? "image/png" : "image/jpeg", "Cache-Control": "public, max-age=86400", ...CORS_HEADERS });
      response.end(buf);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain" }); response.end("not found");
    }
    return;
  }

  await serveStatic(url.pathname, response);
});

server.listen(PORT, HOST, () => {
  console.log(`AdmiraNext Team escuchando en http://${HOST}:${PORT}`);
  if (process.env.WATCHDOG_ON_START !== "0") {
    startWatchdog(); // Auto-Approve ON por defecto al arrancar
  }
  if (process.env.TASK_SYNC_ON_START !== "0") {
    startTaskAgoraSync(); // El feed de AgoraMatrix actualiza el estado de las tareas
  }
  // Programador: entrega las tareas programadas cuando llega su hora. Cada 30s.
  if (process.env.TASK_SCHEDULER_ON_START !== "0") {
    const dispatchDue = async () => {
      try {
        const tasks = await listTasks({});
        const now = Date.now();
        for (const t of tasks) {
          if (t.status !== "pending" || !t.scheduledAt || t.dispatch) continue;
          if (new Date(t.scheduledAt).getTime() > now) continue;
          const res = await dispatchTaskNow(t, undefined);
          await recordDispatch(t.id, { ...res, from: "Programador" });
          console.log(`programador: entregada ${t.id} (${t.scheduledAt})`);
        }
      } catch {}
    };
    dispatchDue();
    setInterval(dispatchDue, 30000);
  }
  // Watchdog de tareas atascadas en "in_progress" (bot muerto/reiniciado a media):
  // las reencola (→sent) o, si reinciden, las marca "blocked". Cada 2 min.
  if (process.env.TASK_WATCHDOG_ON_START !== "0") {
    const stuckMs = Number(process.env.TASK_STUCK_MS || 12 * 60 * 1000);
    const run = () => recoverStuckTasks(stuckMs).then((n) => { if (n) console.log(`watchdog: ${n} tarea(s) atascada(s) recuperada(s)`); }).catch(() => {});
    run();
    setInterval(run, 120000);
  }
});
