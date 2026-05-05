#!/usr/bin/env node

import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { chromium } from "playwright-core";

const API_BASE_URL = process.env.COUNCIL_API_BASE_URL || "http://127.0.0.1:8420";
const API_TOKEN = process.env.COUNCIL_API_TOKEN || "admira2026";
const YARIG_URL = process.env.YARIG_URL || "https://www.yarig.ai/tasks";
const ONCE = process.argv.includes("--once");
const DUMP_JSON = process.argv.includes("--dump-json");
const PREPARE_LOGIN = process.argv.includes("--prepare-login");
const WATCH_AFTER_LOGIN = process.argv.includes("--watch-after-login");
const LIST_PROJECTS = process.argv.includes("--list-projects");
const TASK_ACTION_INDEX = process.argv.indexOf("--task-action");
const TASK_ACTION = TASK_ACTION_INDEX >= 0 ? String(process.argv[TASK_ACTION_INDEX + 1] || "").trim().toLowerCase() : "";
const TASK_HINT_INDEX = process.argv.indexOf("--task-hint");
const TASK_HINT = TASK_HINT_INDEX >= 0 ? String(process.argv[TASK_HINT_INDEX + 1] || "").trim() : "";
const CREATE_TASK = process.argv.includes("--create-task");
const TASK_DESC_INDEX = process.argv.indexOf("--task-desc");
const TASK_DESC = TASK_DESC_INDEX >= 0 ? String(process.argv[TASK_DESC_INDEX + 1] || "").trim() : "";
const TASK_PROJECT_INDEX = process.argv.indexOf("--task-project");
const TASK_PROJECT = TASK_PROJECT_INDEX >= 0 ? String(process.argv[TASK_PROJECT_INDEX + 1] || "").trim() : "";
const TASK_ESTIMATE_INDEX = process.argv.indexOf("--task-estimate");
const TASK_ESTIMATE_HOURS = TASK_ESTIMATE_INDEX >= 0 ? Number(process.argv[TASK_ESTIMATE_INDEX + 1] || 1) : 1;
const LOGOUT = process.argv.includes("--logout");
const POLL_MS = Number(process.env.YARIG_SYNC_POLL_MS || 60000);
const LOGIN_WAIT_MS = Number(process.env.YARIG_LOGIN_WAIT_MS || 300000);

const CHROME_EXECUTABLE =
  process.env.YARIG_CHROME_EXECUTABLE ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CHROME_USER_DATA_DIR =
  process.env.YARIG_CHROME_USER_DATA_DIR ||
  path.join(os.homedir(), "Library/Application Support/Google/Chrome");
const CHROME_PROFILE_DIR = process.env.YARIG_CHROME_PROFILE_DIR || "Profile 1";
const CHROME_AUTOMATION_USER_DATA_DIR =
  process.env.YARIG_AUTOMATION_USER_DATA_DIR ||
  path.join(os.homedir(), "Library/Application Support/Google/Chrome-YarigSync-Profile1");
const SNAPSHOT_PATH =
  process.env.YARIG_SNAPSHOT_PATH ||
  path.join(os.homedir(), "Library/Logs/council-api/yarig-last.json");

let context = null;
let page = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message, extra = null) {
  if (DUMP_JSON || TASK_ACTION || CREATE_TASK || LIST_PROJECTS) return;
  const stamp = new Date().toISOString();
  if (extra == null) console.log(`[${stamp}] ${message}`);
  else console.log(`[${stamp}] ${message}`, extra);
}

async function saveSnapshot(payload) {
  const snapshot = {
    savedAt: new Date().toISOString(),
    ...payload,
  };
  await fs.mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
  await fs.writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), "utf8");
}

async function api(pathname, init = {}) {
  const res = await fetch(`${API_BASE_URL}${pathname}`, {
    ...init,
    headers: {
      "X-Council-Token": API_TOKEN,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`API ${pathname} -> HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

async function launchChromeContext(userDataDir) {
  return chromium.launchPersistentContext(userDataDir, {
    executablePath: CHROME_EXECUTABLE,
    headless: false,
    viewport: null,
    args: [
      `--profile-directory=${CHROME_PROFILE_DIR}`,
      "--disable-blink-features=AutomationControlled",
    ],
  });
}

async function cloneChromeProfile(targetRoot) {
  const sourceProfileDir = path.join(CHROME_USER_DATA_DIR, CHROME_PROFILE_DIR);
  const targetProfileDir = path.join(targetRoot, CHROME_PROFILE_DIR);
  const localStatePath = path.join(CHROME_USER_DATA_DIR, "Local State");
  await fs.mkdir(targetRoot, { recursive: true });
  try {
    await fs.copyFile(localStatePath, path.join(targetRoot, "Local State"));
  } catch {}
  await fs.cp(sourceProfileDir, targetProfileDir, { recursive: true, force: true });
  return targetRoot;
}

async function ensureAutomationProfileSeeded() {
  try {
    await fs.access(path.join(CHROME_AUTOMATION_USER_DATA_DIR, CHROME_PROFILE_DIR));
  } catch {
    log("Creando perfil persistente de automatización para Yarig");
    await cloneChromeProfile(CHROME_AUTOMATION_USER_DATA_DIR);
  }
}

async function ensureBrowser() {
  if (page && !page.isClosed()) return page;
  if (page?.isClosed()) page = null;
  if (context) {
    try { await context.close(); } catch {}
    context = null;
  }
  await ensureAutomationProfileSeeded();
  try {
    context = await launchChromeContext(CHROME_AUTOMATION_USER_DATA_DIR);
  } catch (error) {
    throw error;
  }
  page = context.pages()[0] || await context.newPage();
  page.setDefaultTimeout(15000);
  return page;
}

async function closeBrowser() {
  if (page) {
    try { await page.close(); } catch {}
    page = null;
  }
  if (context) {
    try { await context.close(); } catch {}
    context = null;
  }
}

async function clearBrowserState(activePage) {
  try {
    await context?.clearCookies();
  } catch {}
  try {
    await activePage.evaluate(async () => {
      try { localStorage.clear(); } catch {}
      try { sessionStorage.clear(); } catch {}
      try {
        const dbs = await indexedDB.databases();
        await Promise.all((dbs || []).map((db) => db?.name ? new Promise((resolve) => {
          const req = indexedDB.deleteDatabase(db.name);
          req.onsuccess = req.onerror = req.onblocked = () => resolve();
        }) : Promise.resolve()));
      } catch {}
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch {}
    });
  } catch {}
}

function normalizeTaskStatus(status) {
  const clean = String(status || "").trim().toLowerCase();
  if (/en\s+proceso/.test(clean)) return "En proceso";
  if (/finalizad[ao]/.test(clean)) return "Finalizada";
  return "Pendiente";
}

function taskBucketKey(status) {
  const normalized = normalizeTaskStatus(status);
  if (normalized === "En proceso") return "inProgress";
  if (normalized === "Finalizada") return "done";
  return "pending";
}

function taskLine(status, desc) {
  return `${normalizeTaskStatus(status)} - ${String(desc || "").replace(/\s+/g, " ").trim()}`.slice(0, 240);
}

function payloadFromTaskRecords(records, extra = {}) {
  const taskBuckets = { inProgress: [], pending: [], done: [] };
  const seen = new Set();
  for (const record of records) {
    const desc = String(record?.desc || "").replace(/\s+/g, " ").trim();
    if (!desc) continue;
    const line = taskLine(record.status, desc);
    if (seen.has(line)) continue;
    seen.add(line);
    taskBuckets[taskBucketKey(record.status)].push(line);
  }
  taskBuckets.inProgress = taskBuckets.inProgress.slice(0, 12);
  taskBuckets.pending = taskBuckets.pending.slice(0, 12);
  taskBuckets.done = taskBuckets.done.slice(0, 12);
  return {
    tasks: taskBuckets.inProgress.concat(taskBuckets.pending).slice(0, 12),
    done: taskBuckets.done,
    taskBuckets,
    activeTask: taskBuckets.inProgress[0] || "",
    ...extra,
  };
}

function extractTaskBucketsFromText(text) {
  const clean = String(text || "").replace(/\r/g, "").trim();
  const chunks = clean.split(/Tarea añadida el \d{2}\/\d{2}\/\d{4}:/).slice(1);
  const records = [];
  for (const chunk of chunks) {
    const desc = chunk.match(/Descripción:\s*([^\n]+)/)?.[1]?.trim();
    const status = chunk.match(/\b(En proceso|Pendiente|Finalizada|Finalizado)\b/)?.[1]?.trim() || "Pendiente";
    if (!desc) continue;
    records.push({ status, desc });
  }
  return payloadFromTaskRecords(records);
}

async function extractTaskBucketsFromDom(activePage) {
  const dom = await activePage.evaluate(() => {
    const rootText = document.body?.innerText || "";
    const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig;
    const dateRe = /Tarea añadida el \d{2}\/\d{2}\/\d{4}/;
    const descRe = /Descripción:\s*([^\n]+)/i;
    const statusPatterns = [
      { label: "En proceso", re: /\bEn proceso\b/i },
      { label: "Pendiente", re: /\bPendiente\b/i },
      { label: "Finalizada", re: /\bFinalizada\b/i },
      { label: "Finalizado", re: /\bFinalizado\b/i },
    ];
    const attrTexts = [];
    document.querySelectorAll("[title],[aria-label],[alt]").forEach((el) => {
      ["title", "aria-label", "alt"].forEach((attr) => {
        const value = el.getAttribute(attr);
        if (value) attrTexts.push(value);
      });
    });
    const loginUser = ((rootText + "\n" + attrTexts.join("\n")).match(emailRe) || [])[0] || "";
    const candidates = Array.from(document.querySelectorAll("div, article, section, li"))
      .filter((el) => {
        const text = el.innerText || "";
        return dateRe.test(text) && descRe.test(text);
      })
      .filter((el) => {
        return !Array.from(el.children || []).some((child) => {
          const text = child.innerText || "";
          return dateRe.test(text) && descRe.test(text);
        });
      });
    const seen = new Set();
    const records = [];
    for (const el of candidates) {
      const text = (el.innerText || "").replace(/\r/g, "").trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      const desc = text.match(descRe)?.[1]?.trim();
      if (!desc) continue;
      const status = (statusPatterns.find(({ re }) => re.test(text))?.label) || "Pendiente";
      records.push({ status, desc });
    }
    return {
      records,
      loginUser,
    };
  });
  return payloadFromTaskRecords(dom.records || [], { loginUser: dom.loginUser || "" });
}

async function inspectCurrentPage(activePage) {
  const title = await activePage.title();
  const url = activePage.url();
  if (/login|auth/i.test(url) || !/(^|\.)yarig\.ai/i.test(new URL(url).hostname)) {
    throw new Error(`Yarig.ai no está accesible en sesión reutilizable: ${url}`);
  }
  const bodyText = await activePage.locator("body").innerText();
  if (!bodyText.includes("Mis tareas")) {
    throw new Error(`La página abierta no parece la lista de tareas de Yarig.ai (${title})`);
  }
  const domPayload = await extractTaskBucketsFromDom(activePage);
  return {
    ...((domPayload.tasks.length || domPayload.done.length) ? domPayload : extractTaskBucketsFromText(bodyText)),
    currentUrl: url,
    title,
    loginUser: domPayload.loginUser || "",
  };
}

async function fetchVisibleTasks(activePage, opts = {}) {
  if (opts.preferCurrent) {
    try {
      return await inspectCurrentPage(activePage);
    } catch {}
  }
  await activePage.goto(YARIG_URL, { waitUntil: "domcontentloaded" });
  await activePage.waitForLoadState("domcontentloaded");
  return inspectCurrentPage(activePage);
}

function normalizeTaskLine(line) {
  return String(line || "").replace(/\s+/g, " ").trim();
}

function taskDescriptionFromLine(line) {
  const cleaned = normalizeTaskLine(line);
  const idx = cleaned.indexOf(" - ");
  return idx >= 0 ? cleaned.slice(idx + 3).trim() : cleaned;
}

async function findCurrentTaskCard(activePage, taskHint = "") {
  const controlButton = activePage.getByRole("button", { name: /control tarea/i });
  let card = activePage.locator("div,article,section").filter({
    hasText: /En proceso/i,
    has: controlButton,
  }).first();
  if (taskHint) {
    const hinted = activePage.locator("div,article,section").filter({
      hasText: taskHint,
      has: controlButton,
    }).first();
    if (await hinted.count()) card = hinted;
  }
  await card.waitFor({ state: "visible", timeout: 15000 });
  return card;
}

async function openTaskControlModal(activePage, taskHint = "") {
  const card = await findCurrentTaskCard(activePage, taskHint);
  await card.getByRole("button", { name: /control tarea/i }).click();
  await activePage.waitForTimeout(1200);
  return card;
}

async function pickModalControlButtons(activePage) {
  const buttons = await activePage.evaluate(() => {
    const viewportWidth = window.innerWidth || 0;
    const viewportHeight = window.innerHeight || 0;
    return Array.from(document.querySelectorAll("button"))
      .map((button) => {
        const rect = button.getBoundingClientRect();
        const label = [button.innerText || "", button.getAttribute("title") || "", button.getAttribute("aria-label") || ""].join(" ").trim();
        return {
          label,
          rect: {
            x: rect.x,
            y: rect.y,
            w: rect.width,
            h: rect.height,
          },
          area: rect.width * rect.height,
          centerX: rect.x + (rect.width / 2),
          centerY: rect.y + (rect.height / 2),
          visible: rect.width > 30 && rect.height > 30,
          viewportWidth,
          viewportHeight,
        };
      })
      .filter((item) => item.visible)
      .filter((item) => !/control tarea/i.test(item.label))
      .filter((item) => !/minimizar/i.test(item.label))
      .filter((item) => item.centerY < item.viewportHeight * 0.7)
      .filter((item) => item.area > 2000)
      .sort((a, b) => a.centerX - b.centerX);
  });
  if (!buttons.length) {
    throw new Error("No pude localizar los controles visuales de la tarea en Yarig.ai");
  }
  return buttons;
}

async function performTaskAction(activePage, action, taskHint = "") {
  if (!["pause", "cancel", "finalize"].includes(action)) {
    throw new Error(`Acción de Yarig no soportada: ${action}`);
  }
  await openTaskControlModal(activePage, taskHint);
  const controls = await pickModalControlButtons(activePage);
  const left = controls[0];
  const right = controls[controls.length - 1];
  const center = controls.reduce((best, item) => (item.area > best.area ? item : best), controls[0]);
  let x = center.centerX;
  let y = center.centerY;
  if (action === "cancel") {
    x = left.centerX;
    y = left.centerY;
  } else if (action === "finalize") {
    x = right.centerX;
    y = right.centerY;
  } else {
    x = center.rect.x + (center.rect.w * 0.30);
    y = center.centerY;
  }
  await activePage.mouse.click(x, y);
  await activePage.waitForTimeout(2200);
}

async function syncOnce() {
  const activePage = await ensureBrowser();
  const livePayload = await fetchVisibleTasks(activePage, { preferCurrent: true });
  return syncPayloadToApi(livePayload, activePage);
}

async function syncPayloadToApi(livePayload, activePage = null) {
  const { tasks, done, taskBuckets, activeTask, loginUser } = livePayload;
  const current = await api("/api/council/yar-context");
  const payload = {
    focus: current.focus || "",
    doing: current.doing || "",
    done,
    tasks,
    pending: tasks,
    taskBuckets: taskBuckets || { inProgress: [], pending: tasks || [], done: done || [] },
    activeTask: activeTask || "",
    ask: current.ask || "",
    syncUser: loginUser || current.syncUser || "",
    syncSource: "worker-sync",
  };
  const saved = await api("/api/council/yar-context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await saveSnapshot({
    tasks,
    done,
    taskBuckets: taskBuckets || { inProgress: [], pending: tasks || [], done: done || [] },
    activeTask: activeTask || "",
    currentUrl: livePayload.currentUrl || activePage?.url?.() || "",
    title: livePayload.title || (activePage ? await activePage.title() : ""),
    source: "worker-sync",
    loginUser: loginUser || "",
  });
  log(`Sincronizadas ${tasks.length} tareas activas y ${done.length} finalizadas desde Yarig.ai`);
  return saved;
}

async function runTaskAction(action, taskHint = "") {
  const activePage = await ensureBrowser();
  const currentPayload = await fetchVisibleTasks(activePage, { preferCurrent: true });
  const inProgress = currentPayload.taskBuckets?.inProgress || [];
  const normalizedHint = normalizeTaskLine(taskHint);
  const currentTask = (normalizedHint
    ? inProgress.find((item) => {
        const itemLine = normalizeTaskLine(item);
        const itemDesc = normalizeTaskLine(taskDescriptionFromLine(item));
        return itemLine.includes(normalizedHint) || itemDesc.includes(normalizedHint) || normalizedHint.includes(itemDesc);
      })
    : "") || currentPayload.activeTask || inProgress[0] || (currentPayload.tasks || []).find((item) => /^En proceso\b/i.test(normalizeTaskLine(item)));
  if (!currentTask) {
    throw new Error("No hay ninguna tarea en proceso en Yarig.ai para controlar");
  }
  await performTaskAction(activePage, action, taskDescriptionFromLine(currentTask));
  const refreshedPayload = await fetchVisibleTasks(activePage, { preferCurrent: true });
  const saved = await syncPayloadToApi(refreshedPayload, activePage);
  return {
    ok: true,
    action,
    currentTask,
    currentUrl: refreshedPayload.currentUrl,
    title: refreshedPayload.title,
    tasks: refreshedPayload.tasks,
    done: refreshedPayload.done,
    taskBuckets: refreshedPayload.taskBuckets,
    activeTask: refreshedPayload.activeTask,
    context: saved,
  };
}

function escapeRegExp(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function clickVisibleLocator(locator) {
  try {
    const count = await locator.count();
    for (let i = 0; i < count; i += 1) {
      const item = locator.nth(i);
      if (await item.isVisible()) {
        await item.click();
        return true;
      }
    }
  } catch {}
  return false;
}

async function ensureTasksPage(activePage) {
  await activePage.goto(YARIG_URL, { waitUntil: "domcontentloaded" });
  await activePage.waitForLoadState("domcontentloaded");
  const url = activePage.url();
  if (/login|auth/i.test(url)) {
    throw new Error("login required for Yarig task creation");
  }
  const bodyText = await activePage.locator("body").innerText();
  if (!bodyText.includes("Mis tareas")) {
    throw new Error("Yarig.ai no está mostrando la lista de tareas");
  }
}

async function openTaskCreationDialog(activePage) {
  await ensureTasksPage(activePage);

  const triggerCandidates = [
    activePage.getByRole("button", { name: /añadir tareas|adición de tareas|nueva tarea|agregar tarea|add task/i }),
    activePage.locator('button[title*="Añadir" i], button[aria-label*="Añadir" i], button[title*="Nueva" i], button[aria-label*="Nueva" i]'),
    activePage.locator("button").filter({ hasText: /añadir|nueva tarea|agregar/i }),
  ];

  let opened = false;
  for (const locator of triggerCandidates) {
    if (await clickVisibleLocator(locator)) {
      opened = true;
      break;
    }
  }

  if (!opened) {
    throw new Error("No pude abrir el diálogo de alta de tareas en Yarig.ai");
  }

  const title = activePage.getByText(/Adición de tareas|Añadir tareas|Nueva tarea/i).first();
  await title.waitFor({ state: "visible", timeout: 15000 });
  return title;
}

async function selectEstimateHours(activePage, estimateHours) {
  const hours = Math.max(1, Math.min(8, Number(estimateHours) || 1));
  const rx = new RegExp(`^\\s*${hours}h\\s*$`, "i");
  const candidates = [
    activePage.getByText(rx),
    activePage.locator("label, button, span, div").filter({ hasText: rx }),
  ];
  for (const locator of candidates) {
    if (await clickVisibleLocator(locator)) return hours;
  }
  throw new Error(`No pude seleccionar la estimación ${hours}h en Yarig.ai`);
}

async function fillProjectField(activePage, projectName) {
  const project = String(projectName || "").trim();
  if (!project) return "";

  const bodyText = await activePage.locator("body").innerText();
  if (bodyText.includes(project)) return project;

  const inputCandidates = [
    activePage.locator('input[role="combobox"]'),
    activePage.locator('input[type="search"]'),
    activePage.locator('input[type="text"]'),
    activePage.locator('input:not([type])'),
  ];

  for (const locator of inputCandidates) {
    try {
      const count = await locator.count();
      for (let i = 0; i < count; i += 1) {
        const input = locator.nth(i);
        if (!(await input.isVisible())) continue;
        await input.click({ clickCount: 3 });
        await input.fill(project);
        await activePage.waitForTimeout(700);
        const option = activePage.getByText(new RegExp(escapeRegExp(project), "i")).last();
        if (await option.count()) {
          try {
            if (await option.isVisible()) {
              await option.click();
              return project;
            }
          } catch {}
        }
        await input.press("ArrowDown").catch(() => {});
        await input.press("Enter").catch(() => {});
        await activePage.waitForTimeout(400);
        return project;
      }
    } catch {}
  }

  return project;
}

async function getVisibleProjectInput(activePage) {
  const inputCandidates = [
    activePage.locator('input[role="combobox"]'),
    activePage.locator('input[type="search"]'),
    activePage.locator('input[type="text"]'),
    activePage.locator('input:not([type])'),
  ];

  for (const locator of inputCandidates) {
    try {
      const count = await locator.count();
      for (let i = 0; i < count; i += 1) {
        const input = locator.nth(i);
        if (await input.isVisible()) return input;
      }
    } catch {}
  }
  return null;
}

function normalizeProjectText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/^[•·\-–—\s]+/, "")
    .trim();
}

function isLikelyProjectName(text) {
  if (!text) return false;
  if (text.length < 2 || text.length > 120) return false;
  const blacklist = new Set([
    "guardar",
    "cancelar",
    "añadir",
    "adición de tareas",
    "nueva tarea",
    "proyecto al que pertenece la tarea:",
    "proyecto",
    "descripción de la tarea:",
    "máx 255 caracteres",
    "estimación de tiempo para la tarea:",
  ]);
  return !blacklist.has(text.toLowerCase());
}

async function collectProjectOptions(activePage) {
  const selectors = [
    '[role="option"]',
    '[role="listbox"] [role="option"]',
    '[role="listbox"] li',
    'ul[role="listbox"] li',
    '.mat-mdc-option',
    '.mat-option',
    '.ng-option',
    '.p-dropdown-item',
    '.vs__dropdown-option',
    '.select__option',
    '.autocomplete-item',
    '.autocomplete-items > *',
  ];

  const found = new Set();
  for (const selector of selectors) {
    const locator = activePage.locator(selector);
    let count = 0;
    try {
      count = Math.min(await locator.count(), 200);
    } catch {
      count = 0;
    }
    for (let i = 0; i < count; i += 1) {
      try {
        const item = locator.nth(i);
        if (!(await item.isVisible())) continue;
        const text = normalizeProjectText(await item.innerText());
        if (isLikelyProjectName(text)) found.add(text);
      } catch {}
    }
    if (found.size >= 4) break;
  }

  return Array.from(found).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

async function listProjects(activePage) {
  await openTaskCreationDialog(activePage);
  const input = await getVisibleProjectInput(activePage);
  if (!input) {
    throw new Error("No pude localizar el selector de proyecto en Yarig.ai");
  }

  const queries = ["", "a", "e", "i", "o"];
  const found = new Set();
  for (const query of queries) {
    try {
      await input.click({ clickCount: 3 });
      await input.press("Backspace").catch(() => {});
      if (query) await input.fill(query);
      await activePage.waitForTimeout(500);
      await input.press("ArrowDown").catch(() => {});
      await activePage.waitForTimeout(500);
      for (const project of await collectProjectOptions(activePage)) found.add(project);
    } catch {}
  }

  const projects = Array.from(found).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  const title = await activePage.title().catch(() => "");
  return {
    ok: true,
    projects,
    currentUrl: activePage.url(),
    title,
  };
}

async function fillTaskDescription(activePage, description) {
  const text = String(description || "").trim().slice(0, 255);
  if (!text) throw new Error("La descripción de la tarea está vacía");
  const textareas = activePage.locator("textarea");
  const count = await textareas.count();
  for (let i = count - 1; i >= 0; i -= 1) {
    const textarea = textareas.nth(i);
    if (!(await textarea.isVisible())) continue;
    await textarea.click();
    await textarea.fill(text);
    return text;
  }
  throw new Error("No pude rellenar la descripción de la tarea en Yarig.ai");
}

async function saveCreatedTask(activePage) {
  const addClicked = await clickVisibleLocator(activePage.getByRole("button", { name: /^Añadir$/i }));
  if (!addClicked) {
    throw new Error("No pude pulsar el botón Añadir en Yarig.ai");
  }
  await activePage.waitForTimeout(800);
  const saveCandidates = [
    activePage.getByRole("button", { name: /^Guardar$/i }),
    activePage.locator("button").filter({ hasText: /^Guardar$/i }),
  ];
  for (const locator of saveCandidates) {
    if (await clickVisibleLocator(locator)) {
      await activePage.waitForTimeout(1800);
      return;
    }
  }
  throw new Error("No pude pulsar el botón Guardar en Yarig.ai");
}

async function runCreateTask(description, projectName, estimateHours) {
  const activePage = await ensureBrowser();
  await openTaskCreationDialog(activePage);
  const selectedHours = await selectEstimateHours(activePage, estimateHours);
  const selectedProject = await fillProjectField(activePage, projectName);
  const taskDescription = await fillTaskDescription(activePage, description);
  await saveCreatedTask(activePage);
  const refreshedPayload = await fetchVisibleTasks(activePage, { preferCurrent: true });
  const saved = await syncPayloadToApi(refreshedPayload, activePage);
  return {
    ok: true,
    createdTask: taskDescription,
    estimateHours: selectedHours,
    project: selectedProject || projectName || "",
    currentUrl: refreshedPayload.currentUrl,
    title: refreshedPayload.title,
    tasks: refreshedPayload.tasks,
    done: refreshedPayload.done,
    taskBuckets: refreshedPayload.taskBuckets,
    activeTask: refreshedPayload.activeTask,
    context: saved,
  };
}

async function logoutSession() {
  const activePage = await ensureBrowser();
  const logoutUrls = [
    "https://www.yarig.ai/registration/logout",
    "https://yarig.ai/registration/logout",
    "https://www.yarig.ai/logout",
    "https://yarig.ai/logout",
    "https://www.yarig.ai/registration/login",
  ];
  for (const url of logoutUrls) {
    try {
      await activePage.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      await activePage.waitForTimeout(1200);
      break;
    } catch {}
  }
  await clearBrowserState(activePage);
  try {
    await activePage.goto("https://www.yarig.ai/registration/login", { waitUntil: "domcontentloaded", timeout: 15000 });
    await activePage.waitForTimeout(1200);
  } catch {}
  const payload = {
    ok: true,
    logout: true,
    currentUrl: activePage.url(),
    title: await activePage.title(),
    tasks: [],
    done: [],
    taskBuckets: { inProgress: [], pending: [], done: [] },
    activeTask: "",
    loginUser: "",
  };
  await saveSnapshot({
    tasks: [],
    done: [],
    taskBuckets: { inProgress: [], pending: [], done: [] },
    activeTask: "",
    currentUrl: payload.currentUrl,
    title: payload.title,
    source: "logout",
    loginUser: "",
  });
  return payload;
}

async function prepareLoginWindow() {
  const activePage = await ensureBrowser();
  await activePage.goto(YARIG_URL, { waitUntil: "domcontentloaded" });
  await activePage.waitForLoadState("domcontentloaded");
  log("Ventana de Yarig.ai abierta para autenticacion");
  const startedAt = Date.now();
  let lastError = null;
  while ((Date.now() - startedAt) < LOGIN_WAIT_MS) {
    try {
      const payload = await inspectCurrentPage(activePage);
      await saveSnapshot({
        tasks: payload.tasks,
        done: payload.done,
        taskBuckets: payload.taskBuckets,
        activeTask: payload.activeTask,
        currentUrl: payload.currentUrl,
        title: payload.title,
        source: "prepare-login",
        loginUser: payload.loginUser || "",
      });
      log(`Sesion de Yarig.ai lista con ${payload.tasks.length} tareas activas y ${payload.done.length} finalizadas`);
      return payload;
    } catch (error) {
      lastError = error;
      await sleep(1000);
    }
  }
  throw lastError || new Error("Yarig login no se completo a tiempo");
}

async function watchLoop(activePage) {
  log(`Watcher de Yarig.ai activo cada ${Math.round(POLL_MS / 1000)}s`);
  do {
    try {
      if (!activePage || activePage.isClosed()) {
        page = null;
        activePage = await ensureBrowser();
      }
      const livePayload = await fetchVisibleTasks(activePage, { preferCurrent: true });
      await syncPayloadToApi(livePayload, activePage);
    } catch (error) {
      log("Fallo del watcher Yarig.ai", error.message);
      if (/Target page|context or browser has been closed|Protocol error|Session closed/i.test(String(error.message || ""))) {
        page = null;
        try { await context?.close(); } catch {}
        context = null;
      }
    }
    await sleep(POLL_MS);
  } while (true);
}

async function main() {
  if (LOGOUT) {
    const payload = await logoutSession();
    process.stdout.write(JSON.stringify(payload));
    await closeBrowser();
    return;
  }
  if (CREATE_TASK) {
    const payload = await runCreateTask(TASK_DESC, TASK_PROJECT, TASK_ESTIMATE_HOURS);
    process.stdout.write(JSON.stringify(payload));
    await closeBrowser();
    return;
  }
  if (LIST_PROJECTS) {
    const activePage = await ensureBrowser();
    const payload = await listProjects(activePage);
    process.stdout.write(JSON.stringify(payload));
    await closeBrowser();
    return;
  }
  if (TASK_ACTION) {
    const payload = await runTaskAction(TASK_ACTION, TASK_HINT);
    process.stdout.write(JSON.stringify(payload));
    await closeBrowser();
    return;
  }
  if (WATCH_AFTER_LOGIN) {
    const payload = await prepareLoginWindow();
    process.stdout.write(JSON.stringify({
      ok: true,
      prepared: true,
      watching: true,
      currentUrl: payload.currentUrl,
      title: payload.title,
      tasks: payload.tasks,
      done: payload.done,
      taskBuckets: payload.taskBuckets,
      activeTask: payload.activeTask,
    }));
    await syncPayloadToApi(payload, page);
    await watchLoop(page);
    return;
  }
  if (PREPARE_LOGIN) {
    const payload = await prepareLoginWindow();
    process.stdout.write(JSON.stringify({
      ok: true,
      prepared: true,
      currentUrl: payload.currentUrl,
      title: payload.title,
      tasks: payload.tasks,
      done: payload.done,
      taskBuckets: payload.taskBuckets,
      activeTask: payload.activeTask,
    }));
    await closeBrowser();
    return;
  }
  if (DUMP_JSON) {
    const activePage = await ensureBrowser();
    const payload = await fetchVisibleTasks(activePage, { preferCurrent: true });
    await saveSnapshot({
      tasks: payload.tasks,
      done: payload.done,
      taskBuckets: payload.taskBuckets,
      activeTask: payload.activeTask,
      currentUrl: payload.currentUrl,
      title: payload.title,
      source: "dump-json",
      loginUser: payload.loginUser || "",
    });
    process.stdout.write(JSON.stringify(payload));
    await closeBrowser();
    return;
  }
  log(`Yarig sync listo. API: ${API_BASE_URL}`);
  do {
    try {
      await syncOnce();
    } catch (error) {
      log("Fallo de sync Yarig.ai", error.message);
    }
    if (ONCE) break;
    await sleep(POLL_MS);
  } while (true);
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
  await closeBrowser();
});
