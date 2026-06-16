import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";

// Store PERSISTENTE de tareas del Consejo (reparto + seguimiento).
// Fuente de verdad: data/tasks.json. Sobrevive reinicios del server.
// Cada tarea puede asignarse a un alias de AgoraMatrix (kind:"agora") o a una
// máquina por SSH (kind:"machine"). El historial de cada tarea vive en `log`.

const DATA_PATH = resolve(import.meta.dirname, "../data/tasks.json");
const MAX_TASKS = 500;

export const TASK_STATUSES = new Set([
  "pending",      // creada, sin enviar
  "sent",         // entregada al consejero (agora/SSH)
  "in_progress",  // el consejero la está haciendo
  "blocked",      // bloqueada / necesita ayuda
  "done"          // completada
]);
export const TASK_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
export const ASSIGNEE_KINDS = new Set(["agora", "machine"]);

function cleanString(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function nowIso() {
  return new Date().toISOString();
}

async function ensureFile() {
  try {
    await readFile(DATA_PATH, "utf8");
  } catch {
    await mkdir(dirname(DATA_PATH), { recursive: true });
    await writeFile(DATA_PATH, JSON.stringify({ updatedAt: nowIso(), nextId: 1, tasks: [] }, null, 2) + "\n", "utf8");
  }
}

export async function readTasks() {
  await ensureFile();
  const raw = await readFile(DATA_PATH, "utf8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data.tasks)) data.tasks = [];
  if (typeof data.nextId !== "number") {
    const maxId = data.tasks.reduce((m, t) => Math.max(m, Number(String(t.id).replace(/\D/g, "")) || 0), 0);
    data.nextId = maxId + 1;
  }
  return data;
}

async function writeTasks(data) {
  data.updatedAt = nowIso();
  await writeFile(DATA_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function normalizeAssignee(raw) {
  const kind = ASSIGNEE_KINDS.has(raw?.kind) ? raw.kind : "agora";
  const id = cleanString(raw?.id);
  const label = cleanString(raw?.label, id);
  if (!id) return null;
  return { kind, id, label };
}

function logEntry(type, { from, status, note } = {}) {
  return {
    at: nowIso(),
    type,
    from: cleanString(from, "Consejo"),
    status: status || null,
    note: cleanString(note)
  };
}

export async function listTasks({ status, assignee } = {}) {
  const data = await readTasks();
  let tasks = data.tasks;
  if (status && TASK_STATUSES.has(status)) {
    tasks = tasks.filter((t) => t.status === status);
  }
  if (assignee) {
    tasks = tasks.filter((t) => t.assignee?.id === assignee);
  }
  return tasks;
}

export async function getTask(id) {
  const data = await readTasks();
  return data.tasks.find((t) => t.id === id) || null;
}

export async function createTask(payload) {
  const title = cleanString(payload.title);
  if (!title) throw new Error("El título de la tarea es obligatorio");

  const assignee = normalizeAssignee(payload.assignee);
  if (!assignee) throw new Error("Asignación inválida (assignee.id obligatorio)");

  const priority = TASK_PRIORITIES.has(payload.priority) ? payload.priority : "normal";
  const detail = cleanString(payload.detail);
  const createdBy = cleanString(payload.createdBy, "Consejo");

  const data = await readTasks();
  const id = `task-${String(data.nextId).padStart(3, "0")}`;
  data.nextId += 1;

  const now = nowIso();
  const task = {
    id,
    title,
    detail,
    assignee,
    priority,
    status: "pending",
    createdBy,
    createdAt: now,
    updatedAt: now,
    dispatch: null,
    result: "",
    log: [logEntry("create", { from: createdBy, status: "pending", note: title })]
  };

  data.tasks.unshift(task);
  if (data.tasks.length > MAX_TASKS) data.tasks.length = MAX_TASKS;
  await writeTasks(data);
  return task;
}

export async function updateTaskStatus(id, status, { note, from, result, host, proof } = {}) {
  if (!TASK_STATUSES.has(status)) throw new Error("Estado inválido");
  const data = await readTasks();
  const task = data.tasks.find((t) => t.id === id);
  if (!task) return null;

  task.status = status;
  task.updatedAt = nowIso();
  if (typeof result === "string" && result.trim()) {
    task.result = result.trim();
  }
  // Trazabilidad: en qué ordenador se ejecutó (host) y captura de prueba (URL servida).
  if (typeof host === "string" && host.trim()) {
    task.host = host.trim();
  }
  if (typeof proof === "string" && proof.trim()) {
    task.proof = proof.trim();
  }
  if (status === "done" && !task.completedAt) {
    task.completedAt = task.updatedAt;
  }
  task.log.push(logEntry("status", { from, status, note }));
  await writeTasks(data);
  return task;
}

export async function recordDispatch(id, { channel, ok, error, from, target } = {}) {
  const data = await readTasks();
  const task = data.tasks.find((t) => t.id === id);
  if (!task) return null;

  task.dispatch = {
    channel: cleanString(channel, "agora"),
    target: cleanString(target),
    sentAt: nowIso(),
    ok: !!ok,
    error: error ? cleanString(error) : null
  };
  if (ok && task.status === "pending") {
    task.status = "sent";
  }
  task.updatedAt = nowIso();
  task.log.push(logEntry("dispatch", {
    from,
    status: task.status,
    note: ok ? `Enviada (${channel})` : `Fallo al enviar: ${error || "desconocido"}`
  }));
  await writeTasks(data);
  return task;
}

export async function addTaskNote(id, { note, from } = {}) {
  const cleaned = cleanString(note);
  if (!cleaned) throw new Error("Nota vacía");
  const data = await readTasks();
  const task = data.tasks.find((t) => t.id === id);
  if (!task) return null;
  task.updatedAt = nowIso();
  task.log.push(logEntry("note", { from, status: task.status, note: cleaned }));
  await writeTasks(data);
  return task;
}

export async function deleteTask(id) {
  const data = await readTasks();
  const index = data.tasks.findIndex((t) => t.id === id);
  if (index === -1) return false;
  data.tasks.splice(index, 1);
  await writeTasks(data);
  return true;
}
