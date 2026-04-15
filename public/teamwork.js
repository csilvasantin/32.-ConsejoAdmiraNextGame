const quickInput = document.querySelector("#quickInput");
const sendAllBtn = document.querySelector("#sendAllBtn");
const onboardingAllBtn = document.querySelector("#onboardingAllBtn");
const sendAllTarget = document.querySelector("#sendAllTarget");
const feedback = document.querySelector("#feedback");
const historyList = document.querySelector("#historyList");
const watchdogOverview = document.querySelector("#watchdogOverview");

let machines = [];
let isStaticMode = false;
let latestSnapshots = {};
const FUNNEL_URL = "https://macmini.tail48b61c.ts.net";
const FUNNEL_HOST = "macmini.tail48b61c.ts.net";
const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === FUNNEL_HOST;
const DEFAULT_ONBOARDING_PROMPT =
  "Haz onboarding leyendo el repositorio onboarding de Admira Next primero. Carga el contexto compartido, identifica los repositorios activos y queda listo para continuar sin pedir de nuevo el contexto base.";
const LOCAL_ONBOARDING_COMMANDS = new Set(["onboarding", "haz onboarding"]);
const GLOBAL_ONBOARDING_COMMANDS = new Set(["onboarding all", "haz onboarding all"]);
const GROUP_LABELS = {
  council: "Consejo de Administracion",
  worker: "Equipo"
};
const LIVE_PREVIEW_WINDOW_MS = 10 * 60 * 1000;
const WATCHDOG_SIGNAL_WINDOW_MS = 2 * 60 * 1000;
const SNAPSHOT_REFRESH_MS = 15_000;
const MACHINE_REFRESH_MS = 30_000;
const WATCHDOG_REFRESH_MS = 15_000;
const ACTIVE_MACHINE_STATUSES = new Set(["online", "idle", "busy"]);
const MACHINE_STATUS_META = {
  online: { label: "en linea", tone: "ok" },
  idle: { label: "disponible", tone: "idle" },
  busy: { label: "ocupado", tone: "busy" },
  offline: { label: "offline", tone: "off" },
  maintenance: { label: "mantenimiento", tone: "warn" }
};

function apiUrl(path) {
  return isLocal ? path : `${FUNNEL_URL}${path}`;
}

function normalizeCommand(text) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function showFeedback(text, ok) {
  feedback.textContent = text;
  feedback.className = "tw-feedback " + (ok ? "ok" : "err");
  setTimeout(() => { feedback.className = "tw-feedback"; }, 4000);
}

function syncTopActionVisibility() {
  const readonly = isStaticMode;
  if (sendAllTarget) sendAllTarget.hidden = readonly;
  if (sendAllBtn) sendAllBtn.hidden = readonly;
  if (onboardingAllBtn) onboardingAllBtn.hidden = readonly;
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function formatHistoryTarget(target) {
  return {
    claude: "Claude",
    codex: "Codex",
    terminal: "Terminal",
    auto: "Auto"
  }[target] || target || "Terminal";
}

function formatHistoryAction(action) {
  return {
    send: "directo",
    "send-all": "global",
    "onboarding-all": "onboarding",
    "approve-all": "aprobar todos",
    "approve-machine": "aprobar"
  }[action] || "accion";
}

function resolveName(input) {
  const q = input.toLowerCase().replace(/[\s\-_]+/g, "");
  return machines.find((m) => {
    const id = m.id.toLowerCase().replace(/[\s\-_]+/g, "");
    const name = m.name.toLowerCase().replace(/[\s\-_]+/g, "");
    return id.includes(q) || name.includes(q) || id.replace("admira", "").includes(q);
  }) || null;
}

function parseQuickInput(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  for (const m of machines) {
    const names = [
      m.id,
      m.id.replace("admira-", ""),
      m.name
    ];
    for (const alias of names) {
      if (trimmed.toLowerCase().startsWith(alias.toLowerCase())) {
        const rest = trimmed.slice(alias.length).trim();
        if (rest) return { machineId: m.id, prompt: rest };
      }
    }
  }

  const parts = trimmed.split(/\s+/);
  const first = parts[0];
  const resolved = resolveName(first);
  if (resolved && parts.length > 1) {
    return { machineId: resolved.id, prompt: parts.slice(1).join(" ") };
  }

  return null;
}

async function sendToAll(prompt) {
  if (isStaticMode) {
    showFeedback("Panel en solo lectura en esta URL publica.", false);
    return;
  }
  sendAllBtn.disabled = true;
  sendAllBtn.textContent = "Enviando...";
  const target = sendAllTarget.value;

  try {
    const res = await fetch(apiUrl("/api/teamwork/send-all"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, target })
    });
    const data = await res.json();
    const ok = data.results.filter((r) => r.ok).length;
    const label = target === "all" ? "Claude + Codex" : target.charAt(0).toUpperCase() + target.slice(1);
    showFeedback(`Enviado a ${ok} destinos (${label} en todos los equipos)`, true);
    quickInput.value = "";
  } catch (err) {
    showFeedback(`Error: ${err.message}`, false);
  }

  sendAllBtn.disabled = false;
  sendAllBtn.textContent = "Enviar a todos";
  loadHistory();
}

async function sendOnboardingAll(prompt = DEFAULT_ONBOARDING_PROMPT) {
  if (isStaticMode) {
    showFeedback("Panel en solo lectura en esta URL publica.", false);
    return;
  }
  onboardingAllBtn.disabled = true;
  sendAllBtn.disabled = true;
  onboardingAllBtn.textContent = "Lanzando...";

  try {
    const res = await fetch(apiUrl("/api/teamwork/onboarding-all"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });
    const data = await res.json();
    const ok = data.results.filter((r) => r.ok).length;
    const offline = data.results.filter((r) => r.skipped).length;
    const fail = data.results.filter((r) => !r.ok && !r.skipped).length;
    const parts = [`${ok} equipos actualizados`];
    if (offline) parts.push(`${offline} offline`);
    if (fail) parts.push(`${fail} con error`);
    showFeedback(`Onboarding all lanzado: ${parts.join(" | ")}`, ok > 0);
    quickInput.value = "";
  } catch (err) {
    showFeedback(`Error: ${err.message}`, false);
  }

  onboardingAllBtn.disabled = false;
  sendAllBtn.disabled = false;
  onboardingAllBtn.textContent = "Onboarding all";
  loadHistory();
}

async function handleQuickCommand(prompt) {
  const normalized = normalizeCommand(prompt);

  if (LOCAL_ONBOARDING_COMMANDS.has(normalized)) {
    showFeedback("`onboarding` es local: hazlo en esta sesion. Usa `onboarding all` si quieres refrescar todo AdmiraNext.", false);
    return true;
  }

  if (GLOBAL_ONBOARDING_COMMANDS.has(normalized)) {
    await sendOnboardingAll();
    return true;
  }

  return false;
}

function renderHistory(entries) {
  if (!entries.length) {
    historyList.innerHTML = '<p class="tw-empty">Sin comandos enviados todavía.</p>';
    return;
  }

  historyList.innerHTML = entries.map((e) => {
    const machineName = escapeHtml(e.machineName);
    const targetLabel = escapeHtml(formatHistoryTarget(e.target));
    const actionLabel = escapeHtml(formatHistoryAction(e.action));
    const prompt = escapeHtml(e.prompt);
    const errorText = e.status === "error" && e.error
      ? ` <span style="color: var(--offline); font-weight: 600;">· ${escapeHtml(e.error)}</span>`
      : "";
    const captureHtml = e.captureId
      ? `<div class="tw-terminal" id="capture-${e.captureId}"><span class="tw-terminal-loading">Capturando terminal...</span></div>`
      : "";
    return `
      <div class="tw-entry">
        <div class="tw-entry-header">
          <span class="tw-entry-machine">${machineName} <span class="tw-entry-target">${actionLabel}</span><span class="tw-entry-target">${targetLabel}</span><span class="tw-entry-status ${e.status}"></span></span>
          <span class="tw-entry-prompt">${prompt}${errorText}</span>
          <span class="tw-entry-time">${formatTime(e.sentAt)}</span>
        </div>
        ${captureHtml}
      </div>`;
  }).join("");

  // Load terminal captures
  for (const e of entries) {
    if (e.captureId) loadCapture(e.captureId);
  }
}

async function loadCapture(captureId) {
  const el = document.querySelector(`#capture-${captureId}`);
  if (!el || el.dataset.loaded === "true") return;

  try {
    const res = await fetch(apiUrl(`/api/teamwork/capture/${captureId}`), { cache: "no-store" });
    const data = await res.json();
    if (data.ok) {
      if (data.type === "image") {
        el.className = "tw-screenshot";
        el.innerHTML = `<img src="${apiUrl(data.path)}" alt="Captura de pantalla" loading="lazy">`;
      } else if (data.type === "text") {
        el.className = "tw-terminal";
        el.innerHTML = `<pre>${data.text.replace(/</g, "&lt;")}</pre>`;
      }
      el.dataset.loaded = "true";
    }
  } catch {
    // will retry on next poll
  }
}

async function loadHistory() {
  try {
    const res = await fetch(apiUrl("/api/teamwork/history"), { cache: "no-store" });
    const data = await res.json();
    renderHistory(data.entries || []);
  } catch {
    // silently fail
  }
}

async function loadMachines() {
  try {
    const res = await fetch(apiUrl("/api/machines"), { cache: "no-store" });
    if (!res.ok) throw new Error("api unavailable");
    const data = await res.json();
    machines = data.machines;
    isStaticMode = false;
    syncTopActionVisibility();
    renderMachineApproveList(latestSnapshots);
  } catch {
    try {
      const res = await fetch("./machines.json?v=20260402-2", { cache: "no-store" });
      const data = await res.json();
      machines = data.machines;
      isStaticMode = true;
      syncTopActionVisibility();
      renderMachineApproveList(latestSnapshots);
    } catch {
      // no machines
    }
  }
}

// Per-machine approve
const machineApproveList = document.querySelector("#machineApproveList");

function formatCaptureTime(iso) {
  try {
    const value = new Date(iso);
    if (!Number.isFinite(value.getTime())) return "";
    return value.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

function renderCaptureStamp(snap) {
  const time = formatCaptureTime(snap?.updatedAt);
  if (!time) return "";
  return `<span class="tw-machine-monitor-time" title="Captura tomada a las ${time}">${time}</span>`;
}

function hasPreviewPayload(snap) {
  return Boolean(
    (snap?.type === "image" && snap.image) ||
    (snap?.type === "images" && Array.isArray(snap.images) && snap.images.length > 0) ||
    snap?.text
  );
}

function hasVisualPreviewPayload(snap) {
  return Boolean(
    (snap?.type === "image" && snap.image) ||
    (snap?.type === "images" && Array.isArray(snap.images) && snap.images.length > 0)
  );
}

function getPreviewAgeMs(snap) {
  const updatedAt = new Date(snap?.updatedAt || "").getTime();
  return Number.isFinite(updatedAt) ? Date.now() - updatedAt : Number.POSITIVE_INFINITY;
}

function hasLivePreview(machine, snapshots) {
  const snap = snapshots?.[machine.id];
  return hasPreviewPayload(snap) && getPreviewAgeMs(snap) <= LIVE_PREVIEW_WINDOW_MS;
}

function hasLiveVisualPreview(machine, snapshots) {
  const snap = snapshots?.[machine.id];
  return hasVisualPreviewPayload(snap) && getPreviewAgeMs(snap) <= LIVE_PREVIEW_WINDOW_MS;
}

function getMachineStatusMeta(machine) {
  return MACHINE_STATUS_META[machine.status] || { label: machine.status || "sin estado", tone: "off" };
}

function getPreviewMeta(machine, snap) {
  if (hasLivePreview(machine, { [machine.id]: snap })) {
    return { label: "preview vivo", tone: "ok" };
  }
  if (hasPreviewPayload(snap)) {
    return { label: "preview antiguo", tone: "warn" };
  }
  if (ACTIVE_MACHINE_STATUSES.has(machine.status)) {
    return { label: "sin preview", tone: "off" };
  }
  if (machine.status === "maintenance") {
    return { label: "sin preview", tone: "warn" };
  }
  return { label: "sin preview", tone: "off" };
}

function getRouteMeta(machine) {
  const lanTarget = machine.ssh?.ip_lan || machine.ssh?.host_local || "";
  const tailscaleTarget = machine.ssh?.ip_tailscale || machine.ssh?.host || "";

  if (lanTarget && tailscaleTarget) {
    return {
      label: "LAN + Tailscale",
      tone: "hybrid",
      target: `${lanTarget} · ${tailscaleTarget}`,
      title: `Rutas disponibles: LAN ${lanTarget} | Tailscale ${tailscaleTarget}`
    };
  }

  if (lanTarget) {
    return {
      label: "LAN",
      tone: "lan",
      target: lanTarget,
      title: `Ruta LAN preferida: ${lanTarget}`
    };
  }

  if (tailscaleTarget) {
    return {
      label: "Tailscale",
      tone: "tailscale",
      target: tailscaleTarget,
      title: `Ruta Tailscale disponible: ${tailscaleTarget}`
    };
  }

  return null;
}

function getChannelMeta(machine, remoteReady) {
  if (remoteReady) {
    return { label: "🤖 0", tone: "ok", title: "Canal remoto listo. Sin auto-aprobaciones." };
  }
  if (isStaticMode) {
    return { label: "solo lectura", tone: "warn", title: "Esta URL no puede abrir canales remotos." };
  }
  if (ACTIVE_MACHINE_STATUSES.has(machine.status)) {
    return { label: "sin canal", tone: "warn", title: "Equipo activo, pero sin canal remoto configurado." };
  }
  if (machine.status === "maintenance") {
    return { label: "mantenimiento", tone: "warn", title: "Equipo reservado o en preparacion." };
  }
  return { label: "offline", tone: "off", title: "Equipo sin conexion remota disponible." };
}

function parseWatchdogTimestamp(iso) {
  const value = new Date(iso || "").getTime();
  return Number.isFinite(value) ? value : 0;
}

function isRecentWatchdogSignal(iso) {
  const value = parseWatchdogTimestamp(iso);
  return value > 0 && (Date.now() - value) <= WATCHDOG_SIGNAL_WINDOW_MS;
}

function getWatchdogSignalTone(status) {
  if (status === "pending") return "pending";
  if (status === "cooldown") return "cooldown";
  return "auto-approved";
}

function formatWatchdogSignalStatus(status) {
  if (status === "pending") return "esperando";
  if (status === "cooldown") return "reaccionando";
  return "autoaprobado";
}

function getMachineWatchdogSignals(machineId) {
  const stats = watchdogStats?.[machineId];
  if (!stats) return [];

  const signals = Array.isArray(stats.currentSignals)
    ? stats.currentSignals.filter((signal) => signal && signal.summary)
    : [];

  if (signals.length > 0) {
    return [...signals].sort((a, b) => {
      const priority = (signal) => ({
        pending: 3,
        cooldown: 2,
        "auto-approved": 1
      }[signal?.status] || 0);
      return (
        priority(b) - priority(a) ||
        parseWatchdogTimestamp(b.detectedAt || b.resolvedAt) - parseWatchdogTimestamp(a.detectedAt || a.resolvedAt)
      );
    });
  }

  if (isRecentWatchdogSignal(stats.lastDetectionAt) && stats.lastDetectionSummary) {
    return [{
      target: stats.lastDetectionTarget || "auto",
      label: stats.lastDetectionLabel || stats.lastDetectionSummary,
      source: stats.lastDetectionSource || "",
      summary: stats.lastDetectionSummary,
      status: stats.lastDetectionStatus || "pending",
      detectedAt: stats.lastDetectionAt,
      resolvedAt: stats.lastResolutionAt || stats.lastApproval || stats.lastDetectionAt
    }];
  }

  return [];
}

function getMachineWatchdogPriority(machineId) {
  const signals = getMachineWatchdogSignals(machineId);
  if (signals.some((signal) => signal.status === "pending")) return 4;
  if (signals.some((signal) => signal.status === "cooldown")) return 3;
  if (signals.some((signal) => signal.status === "auto-approved")) return 2;
  const stats = watchdogStats?.[machineId];
  const totalApprovals = (stats?.claudeCount || 0) + (stats?.codexCount || 0);
  return totalApprovals > 0 ? 1 : 0;
}

function renderMachineWatchdogSignals(machineId) {
  const signals = getMachineWatchdogSignals(machineId);
  if (!signals.length) return "";

  const chips = signals.slice(0, 2).map((signal) => {
    const status = formatWatchdogSignalStatus(signal.status);
    const tone = getWatchdogSignalTone(signal.status);
    const time = formatTime(signal.resolvedAt || signal.detectedAt);
    const title = `${signal.summary} · ${status}${time ? ` · ${time}` : ""}`;
    return `<span class="tw-watchdog-chip ${tone}" title="${escapeHtml(title)}"><span class="tw-watchdog-chip-label">${escapeHtml(status)} · ${escapeHtml(signal.summary)}</span>${time ? `<span class="tw-watchdog-chip-time">${escapeHtml(time)}</span>` : ""}</span>`;
  }).join("");

  const extra = signals.length > 2
    ? `<span class="tw-watchdog-chip" title="${signals.length - 2} detecciones adicionales">+${signals.length - 2}</span>`
    : "";

  return `<div class="tw-machine-watchdog" data-watchdog-signals="${machineId}">${chips}${extra}</div>`;
}

function renderMonitorContent(machine, snap) {
  const multiLabels = ["Claude", "Studio", "Codex"];

  if (snap && snap.type === "images") {
    const t = Date.now();
    const orients = snap.orientations || snap.images.map(() => "portrait");
    return `<div class="tw-multi-monitor">${snap.images.map((imgPath, i) => {
      const src = (imgPath.startsWith("/") ? apiUrl(imgPath) : imgPath) + `?t=${t}`;
      return `<div class="tw-multi-screen ${orients[i]}"><img src="${src}" alt="${multiLabels[i]}"><span class="tw-screen-label">${multiLabels[i]}</span></div>`;
    }).join("")}</div>${renderCaptureStamp(snap)}`;
  }

  if (snap && snap.type === "image") {
    const imgSrc = snap.image.startsWith("/") ? apiUrl(snap.image) : snap.image;
    const cacheBust = imgSrc.includes("?") ? `&t=${Date.now()}` : `?t=${Date.now()}`;
    return `<img src="${imgSrc}${cacheBust}" alt="${machine.name}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">${renderCaptureStamp(snap)}`;
  }

  if (snap && snap.text) {
    return `<pre>${snap.text.replace(/</g, "&lt;")}</pre>${renderCaptureStamp(snap)}`;
  }

  if (ACTIVE_MACHINE_STATUSES.has(machine.status)) {
    return `<div class="tw-machine-monitor-empty"><strong>Equipo activo</strong><span>Sin preview vivo</span></div>`;
  }

  if (machine.status === "maintenance") {
    return `<div class="tw-machine-monitor-empty"><strong>Mantenimiento</strong><span>Sin preview por ahora</span></div>`;
  }

  return `<div class="tw-machine-monitor-empty"><strong>Equipo offline</strong><span>Sin conexion reciente</span></div>`;
}

function getMachineSortScore(machine, snapshots) {
  const snap = snapshots?.[machine.id];
  const watchdogRank = getMachineWatchdogPriority(machine.id);
  const statusRank = {
    online: 4,
    busy: 3,
    idle: 2,
    maintenance: 1,
    offline: 0
  }[machine.status] ?? 0;
  const visualLiveRank = hasLiveVisualPreview(machine, snapshots) ? 5 : 0;
  const visualPreviewRank = hasVisualPreviewPayload(snap) ? 2 : 0;
  const livePreviewRank = hasLivePreview(machine, snapshots) ? 1 : 0;
  const hasPreviewRank = hasPreviewPayload(snap) ? 1 : 0;
  const remoteRank = machine.ssh?.enabled || machine.automation?.enabled ? 1 : 0;
  const updatedAtRank = Number.isFinite(new Date(snap?.updatedAt || "").getTime()) ? new Date(snap.updatedAt).getTime() : 0;

  return (
    (watchdogRank * 100_000_000_000_000) +
    (visualLiveRank * 1_000_000_000_000) +
    (statusRank * 10_000_000_000) +
    (remoteRank * 1_000_000_000) +
    (visualPreviewRank * 10_000_000) +
    (livePreviewRank * 1_000_000) +
    (hasPreviewRank * 100_000) +
    updatedAtRank
  );
}

function compareMachinesForDisplay(a, b, snapshots) {
  const score = getMachineSortScore(b, snapshots) - getMachineSortScore(a, snapshots);
  if (score !== 0) return score;
  return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
}

function renderMachineRow(m, snapshots) {
  const group = m.unitType || "council";
  const snap = snapshots?.[m.id];
  const remoteReady = !isStaticMode && Boolean(m.ssh?.enabled || m.automation?.enabled);
  const defaultTarget = m.platform === "Windows" ? "terminal" : "claude";
  const statusMeta = getMachineStatusMeta(m);
  const previewMeta = getPreviewMeta(m, snap);
  const channelMeta = getChannelMeta(m, remoteReady);
  const routeMeta = getRouteMeta(m);
  const monitorContent = renderMonitorContent(m, snap);

  return `
    <div class="tw-machine-row tw-machine-row-${group}" data-id="${m.id}">
      <div class="tw-machine-monitor small" data-monitor="${m.id}">${monitorContent}</div>
      <div class="tw-machine-label">
        <span class="tw-machine-name">${escapeHtml(m.name)}</span><br>
        <span class="tw-machine-member">${escapeHtml(m.member)} · ${escapeHtml(m.platform)}</span>
        ${routeMeta ? `<div class="tw-machine-route" title="${escapeHtml(routeMeta.title)}"><span class="tw-machine-route-badge ${routeMeta.tone}">${escapeHtml(routeMeta.label)}</span><span class="tw-machine-route-target">${escapeHtml(routeMeta.target)}</span></div>` : ""}
        <div class="tw-machine-statuses">
          <span class="tw-machine-status tw-machine-status-${statusMeta.tone}">${statusMeta.label}</span>
          <span class="tw-machine-status tw-machine-status-${previewMeta.tone}" data-preview-status="${m.id}">${previewMeta.label}</span>
        </div>
        ${m.unitType === "worker" ? `<div class="tw-machine-caps"><span class="tw-machine-cap tw-machine-cap-kind">PC</span>${(m.capabilities || []).map((cap) => `<span class="tw-machine-cap">${cap}</span>`).join("")}</div>` : ""}
        <span class="tw-app-status">
          ${snap?.claudeState ? `<span class="tw-app-tag claude" title="Claude: ${snap.claudeState}">C</span>` : ""}
          ${snap?.codexState ? `<span class="tw-app-tag codex" title="Codex: ${snap.codexState}">X</span>` : ""}
        </span>
        ${renderMachineWatchdogSignals(m.id)}
      </div>
      <input class="tw-machine-input" data-machine="${m.id}" type="text" placeholder="Prompt para ${m.member}..." ${remoteReady ? "" : "disabled"}>
      <select class="tw-approve-sm" data-machine-target="${m.id}" style="background:var(--panel);color:var(--ink);border:1px solid var(--line);padding:8px 6px;font-size:11px;border-radius:10px;">
        <option value="claude" ${defaultTarget === "claude" ? "selected" : ""}>Claude</option>
        <option value="codex" ${defaultTarget === "codex" ? "selected" : ""}>Codex</option>
        <option value="terminal" ${defaultTarget === "terminal" ? "selected" : ""}>Terminal</option>
      </select>
      <button class="tw-machine-send" data-machine-send="${m.id}" ${remoteReady ? "" : "disabled"}>${remoteReady ? "Enviar" : "Pendiente"}</button>
      <button class="tw-machine-approve" data-machine-approve="${m.id}" ${remoteReady ? "" : "disabled"}>${remoteReady ? "Aprobar" : "Sin canal"}</button>
      <span class="tw-auto-badge ${channelMeta.tone === "ok" ? "" : `tw-auto-badge-${channelMeta.tone}`} ${remoteReady ? "" : "tw-auto-badge-off"}" data-watchdog-machine="${m.id}" data-channel-ready="${remoteReady ? "true" : "false"}" title="${channelMeta.title}">${channelMeta.label}</span>
    </div>`;
}

function renderMachineApproveList(snapshots) {
  const filtered = machines;
  if (!filtered.length) {
    machineApproveList.innerHTML = '<p class="tw-empty">Sin equipos disponibles.</p>';
    return;
  }

  const sortWithinGroup = (items) => [...items].sort((a, b) => compareMachinesForDisplay(a, b, snapshots));

  const grouped = {
    council: sortWithinGroup(filtered.filter((m) => (m.unitType || "council") === "council")),
    worker: sortWithinGroup(filtered.filter((m) => (m.unitType || "council") === "worker"))
  };

  const sections = [];
  for (const group of ["council", "worker"]) {
    const items = grouped[group];
    if (!items.length) continue;
    const shouldExpand = items.some((m) => ACTIVE_MACHINE_STATUSES.has(m.status));
    const expanded = shouldExpand ? "true" : "false";
    const hidden = shouldExpand ? "" : "hidden";
    sections.push(`
      <section class="tw-group-block tw-group-block-${group}">
        <button class="tw-group-toggle tw-group-${group}" data-group-toggle="${group}" aria-expanded="${expanded}" type="button">
          <span>${GROUP_LABELS[group] || group}</span>
          <span class="tw-group-toggle-icon">${shouldExpand ? "−" : "+"}</span>
        </button>
        <div class="tw-group-rows" data-group-panel="${group}" ${hidden}>
          ${items.map((m) => renderMachineRow(m, snapshots)).join("")}
        </div>
      </section>
    `);
  }
  machineApproveList.innerHTML = sections.join("");

  machineApproveList.querySelectorAll("[data-group-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const group = btn.dataset.groupToggle;
      const panel = machineApproveList.querySelector(`[data-group-panel="${group}"]`);
      const expanded = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", expanded ? "false" : "true");
      const icon = btn.querySelector(".tw-group-toggle-icon");
      if (icon) icon.textContent = expanded ? "+" : "−";
      if (panel) panel.hidden = expanded;
    });
  });

  // Per-machine send prompt
  machineApproveList.querySelectorAll(".tw-machine-send").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const machineId = btn.dataset.machineSend;
      const input = machineApproveList.querySelector(`.tw-machine-input[data-machine="${machineId}"]`);
      const targetSel = machineApproveList.querySelector(`select[data-machine-target="${machineId}"]`);
      const prompt = input?.value.trim();
      if (!prompt) return;

      btn.disabled = true;
      btn.textContent = "...";

      try {
        const res = await fetch(apiUrl("/api/teamwork/send"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ machineId, prompt, target: targetSel?.value || "claude" })
        });
        const data = await res.json();
        btn.textContent = data.ok ? "OK" : "Error";
        if (data.ok) input.value = "";
        setTimeout(() => { btn.textContent = "Enviar"; btn.disabled = false; }, 2000);
        loadHistory();
      } catch {
        btn.textContent = "Error";
        setTimeout(() => { btn.textContent = "Enviar"; btn.disabled = false; }, 2000);
      }
    });
  });

  // Per-machine approve
  machineApproveList.querySelectorAll(".tw-machine-approve").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const machineId = btn.dataset.machineApprove;
      const targetSel = machineApproveList.querySelector(`select[data-machine-target="${machineId}"]`);
      const target = targetSel?.value || "claude";
      btn.disabled = true;
      btn.textContent = "⏳";

      try {
        const res = await fetch(apiUrl("/api/teamwork/approve-machine"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ machineId, target })
        });
        const data = await res.json();
        if (data.ok) {
          btn.textContent = "✅";
          btn.style.background = "#0984e3";
          // Refresh snapshot for this machine after 3s
          setTimeout(loadSnapshots, 3000);
        } else {
          btn.textContent = data.error === "offline" ? "⏭️ Offline" : "❌";
          btn.style.background = "#c1121f";
        }
        setTimeout(() => {
          btn.textContent = "Aprobar";
          btn.style.background = "";
          btn.disabled = false;
        }, 3000);
      } catch {
        btn.textContent = "❌";
        setTimeout(() => { btn.textContent = "Aprobar"; btn.style.background = ""; btn.disabled = false; }, 2000);
      }
    });
  });

  // Toggle monitor size
  machineApproveList.querySelectorAll(".tw-machine-monitor").forEach((mon) => {
    mon.addEventListener("click", () => {
      mon.classList.toggle("small");
      mon.classList.toggle("expanded");
    });
  });

  // Enter to send per-machine
  machineApproveList.querySelectorAll(".tw-machine-input").forEach((input) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const machineId = input.dataset.machine;
        machineApproveList.querySelector(`.tw-machine-send[data-machine-send="${machineId}"]`)?.click();
      }
    });
  });

  updateWatchdogRows();
  renderWatchdogOverview();
}

// Approve buttons
const approveClaudeBtn = document.querySelector("#approveClaudeBtn");
const approveCodexBtn = document.querySelector("#approveCodexBtn");
const approveClaudeResult = document.querySelector("#approveClaudeResult");
const approveCodexResult = document.querySelector("#approveCodexResult");

async function approveAll(target, btn, resultEl) {
  btn.disabled = true;
  btn.textContent = "Aprobando...";
  resultEl.textContent = "";
  resultEl.className = "tw-approve-result";

  try {
    const res = await fetch(apiUrl("/api/teamwork/approve"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target })
    });
    const data = await res.json();
    const okList = data.results.filter((r) => r.ok);
    const failList = data.results.filter((r) => !r.ok && !r.skipped);
    const skipped = data.results.filter((r) => r.skipped);

    // Visual feedback with icons
    const parts = [];
    for (const r of okList) parts.push(`✅ ${r.machine}`);
    for (const r of failList) parts.push(`❌ ${r.machine}`);
    if (skipped.length) parts.push(`⏭️ ${skipped.length} offline`);

    resultEl.innerHTML = `<strong>${okList.length} aprobados</strong> — ${parts.join(" | ")}`;
    resultEl.classList.add(okList.length > 0 ? "tw-approve-success" : "tw-approve-error");

    // Refresh snapshots after 4s to show updated screens (save result first)
    const savedResult = resultEl.innerHTML;
    const savedClass = resultEl.className;
    setTimeout(() => {
      loadSnapshots();
      // Restore result after snapshot refresh
      setTimeout(() => {
        resultEl.innerHTML = savedResult;
        resultEl.className = savedClass;
      }, 500);
    }, 4000);
  } catch (err) {
    resultEl.textContent = `Error: ${err.message}`;
    resultEl.classList.add("tw-approve-error");
  }

  btn.disabled = false;
  btn.textContent = target === "claude" ? "Aprobar Claude" : "Aprobar Codex";
}

quickInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    const prompt = quickInput.value.trim();
    if (prompt) {
      handleQuickCommand(prompt).then((handled) => {
        if (!handled) sendToAll(prompt);
      });
    }
    else showFeedback("Escribe un prompt", false);
  }
});

sendAllBtn.addEventListener("click", () => {
  const prompt = quickInput.value.trim();
  if (prompt) {
    handleQuickCommand(prompt).then((handled) => {
      if (!handled) sendToAll(prompt);
    });
  }
  else showFeedback("Escribe un prompt", false);
});

onboardingAllBtn.addEventListener("click", () => sendOnboardingAll());

approveClaudeBtn.addEventListener("click", () => approveAll("claude", approveClaudeBtn, approveClaudeResult));
approveCodexBtn.addEventListener("click", () => approveAll("codex", approveCodexBtn, approveCodexResult));

function updateSnapshotsInPlace(snapshots) {
  for (const m of machines) {
    const row = machineApproveList.querySelector(`.tw-machine-row[data-id="${m.id}"]`);
    if (!row) return renderMachineApproveList(snapshots); // first render
    const mon = row.querySelector(".tw-machine-monitor");
    const snap = snapshots?.[m.id];
    if (mon) mon.innerHTML = renderMonitorContent(m, snap);
    // Update app badges
    const statusEl = row.querySelector(".tw-app-status");
    if (statusEl) {
      statusEl.innerHTML =
        (snap?.claudeState ? `<span class="tw-app-tag claude" title="Claude: ${snap.claudeState}">C</span>` : "") +
        (snap?.codexState ? `<span class="tw-app-tag codex" title="Codex: ${snap.codexState}">X</span>` : "");
    }
    const previewEl = row.querySelector(`[data-preview-status="${m.id}"]`);
    if (previewEl) {
      const previewMeta = getPreviewMeta(m, snap);
      previewEl.textContent = previewMeta.label;
      previewEl.className = `tw-machine-status tw-machine-status-${previewMeta.tone}`;
      previewEl.dataset.previewStatus = m.id;
    }
  }

  // Re-sort rows dentro de su grupo para no romper el acordeon
  for (const group of ["council", "worker"]) {
    const panel = machineApproveList.querySelector(`[data-group-panel="${group}"]`);
    if (!panel) continue;
    const rows = [...panel.querySelectorAll(".tw-machine-row")];
    const sorted = [...rows].sort((a, b) => {
      const aMachine = machines.find((m) => m.id === a.dataset.id);
      const bMachine = machines.find((m) => m.id === b.dataset.id);
      return compareMachinesForDisplay(aMachine, bMachine, snapshots);
    });
    const orderChanged = rows.some((r, i) => r !== sorted[i]);
    if (orderChanged) sorted.forEach((row) => panel.appendChild(row));
  }

  updateWatchdogRows();
}

async function loadSnapshots() {
  try {
    const res = await fetch(apiUrl("/api/teamwork/snapshots"), { cache: "no-store" });
    const data = await res.json();
    if (data.ok) {
      latestSnapshots = data.snapshots || {};
      const hasRows = machineApproveList.querySelector(".tw-machine-row");
      if (hasRows) {
        updateSnapshotsInPlace(latestSnapshots);
      } else {
        renderMachineApproveList(latestSnapshots);
      }
    }
  } catch {
    if (!isStaticMode) return;
    try {
      const res = await fetch("./snapshots.json?v=20260402-2", { cache: "no-store" });
      latestSnapshots = await res.json();
      const hasRows = machineApproveList.querySelector(".tw-machine-row");
      if (hasRows) {
        updateSnapshotsInPlace(latestSnapshots);
      } else {
        renderMachineApproveList(latestSnapshots);
      }
    } catch {
      // silently fail
    }
  }
}

// ─── Watchdog toggle & stats ───────────────────────────────────────

const watchdogToggle = document.querySelector("#watchdogToggle");
const watchdogPulse = document.querySelector("#watchdogPulse");
let watchdogStats = {};
let watchdogLog = [];

watchdogToggle.addEventListener("change", async () => {
  const enabled = watchdogToggle.checked;
  watchdogPulse.classList.toggle("off", !enabled);
  try {
    await fetch(apiUrl("/api/teamwork/watchdog"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled })
    });
  } catch { /* ignore */ }
});

async function loadWatchdogStats() {
  try {
    const res = await fetch(apiUrl("/api/teamwork/watchdog"), { cache: "no-store" });
    const data = await res.json();
    if (data.ok) {
      watchdogToggle.checked = data.enabled;
      watchdogPulse.classList.toggle("off", !data.enabled);
      watchdogStats = data.perMachine || {};
      watchdogLog = Array.isArray(data.log) ? data.log : [];
      updateWatchdogUI();
    }
  } catch { /* ignore */ }
}

function renderWatchdogOverview() {
  if (!watchdogOverview) return;

  const councilMachines = machines.filter((machine) => (machine.unitType || "council") === "council");
  const waiting = [];
  const recent = [];

  for (const machine of councilMachines) {
    for (const signal of getMachineWatchdogSignals(machine.id)) {
      const entry = { machine, signal };
      if (signal.status === "pending" || signal.status === "cooldown") waiting.push(entry);
      else recent.push(entry);
    }
  }

  waiting.sort((a, b) => parseWatchdogTimestamp(b.signal.detectedAt) - parseWatchdogTimestamp(a.signal.detectedAt));
  recent.sort((a, b) => parseWatchdogTimestamp(b.signal.resolvedAt || b.signal.detectedAt) - parseWatchdogTimestamp(a.signal.resolvedAt || a.signal.detectedAt));

  if (waiting.length > 0) {
    watchdogOverview.className = "tw-watchdog-overview hot";
    watchdogOverview.innerHTML = `
      <div class="tw-watchdog-overview-title">
        <span>Consejo atento</span>
        <span class="tw-watchdog-overview-meta">${waiting.length} esperando reaccion</span>
      </div>
      <div class="tw-watchdog-overview-body">
        ${waiting.slice(0, 4).map(({ machine, signal }) => `<span class="tw-watchdog-chip pending" title="${escapeHtml(`${machine.name} · ${signal.summary}`)}"><span class="tw-watchdog-chip-label">${escapeHtml(machine.member || machine.name)} · ${escapeHtml(signal.summary)}</span><span class="tw-watchdog-chip-time">${escapeHtml(formatTime(signal.detectedAt))}</span></span>`).join("")}
      </div>
    `;
    return;
  }

  if (recent.length > 0) {
    watchdogOverview.className = "tw-watchdog-overview recent";
    watchdogOverview.innerHTML = `
      <div class="tw-watchdog-overview-title">
        <span>Ultima reaccion del Consejo</span>
        <span class="tw-watchdog-overview-meta">${recent.length} recientes</span>
      </div>
      <div class="tw-watchdog-overview-body">
        ${recent.slice(0, 4).map(({ machine, signal }) => `<span class="tw-watchdog-chip auto-approved" title="${escapeHtml(`${machine.name} · ${signal.summary}`)}"><span class="tw-watchdog-chip-label">${escapeHtml(machine.member || machine.name)} · ${escapeHtml(signal.summary)}</span><span class="tw-watchdog-chip-time">${escapeHtml(formatTime(signal.resolvedAt || signal.detectedAt))}</span></span>`).join("")}
      </div>
    `;
    return;
  }

  const latestLog = watchdogLog.length ? watchdogLog[watchdogLog.length - 1] : null;
  watchdogOverview.className = "tw-watchdog-overview";
  watchdogOverview.innerHTML = `
    <div class="tw-watchdog-overview-title">
      <span>Consejo atento</span>
      <span class="tw-watchdog-overview-meta">${watchdogToggle.checked ? "watchdog activo" : "watchdog pausado"}</span>
    </div>
    <div class="tw-watchdog-overview-empty">${latestLog ? `Sin esperas ahora. Ultima autoaprobacion: ${escapeHtml(latestLog.machine)} · ${escapeHtml(latestLog.summary || latestLog.target || "Aprobacion")} · ${escapeHtml(formatTime(latestLog.at))}` : "Sin señales recientes de aprobacion en el Consejo."}</div>
  `;
}

function updateWatchdogRows() {
  document.querySelectorAll(".tw-machine-row").forEach((row) => {
    const machineId = row.dataset.id;
    const signalMarkup = renderMachineWatchdogSignals(machineId);
    const signalEl = row.querySelector(`[data-watchdog-signals="${machineId}"]`);
    if (signalMarkup) {
      if (signalEl) signalEl.outerHTML = signalMarkup;
      else row.querySelector(".tw-machine-label")?.insertAdjacentHTML("beforeend", signalMarkup);
    } else if (signalEl) {
      signalEl.remove();
    }

    const signals = getMachineWatchdogSignals(machineId);
    const hasWaiting = signals.some((signal) => signal.status === "pending" || signal.status === "cooldown");
    const hasRecent = !hasWaiting && signals.length > 0;
    row.classList.toggle("tw-machine-row-alert", hasWaiting);
    row.classList.toggle("tw-machine-row-recent", hasRecent);
  });
}

function resortMachineRows() {
  for (const group of ["council", "worker"]) {
    const panel = machineApproveList.querySelector(`[data-group-panel="${group}"]`);
    if (!panel) continue;
    const rows = [...panel.querySelectorAll(".tw-machine-row")];
    const sorted = [...rows].sort((a, b) => {
      const aMachine = machines.find((machine) => machine.id === a.dataset.id);
      const bMachine = machines.find((machine) => machine.id === b.dataset.id);
      return compareMachinesForDisplay(aMachine, bMachine, latestSnapshots);
    });
    const orderChanged = rows.some((row, index) => row !== sorted[index]);
    if (orderChanged) sorted.forEach((row) => panel.appendChild(row));
  }
}

function updateWatchdogBadges() {
  document.querySelectorAll(".tw-auto-badge").forEach((badge) => {
    if (badge.dataset.channelReady !== "true") return;
    const machineId = badge.dataset.watchdogMachine;
    const stats = watchdogStats[machineId];
    if (stats) {
      const total = (stats.claudeCount || 0) + (stats.codexCount || 0);
      const signals = getMachineWatchdogSignals(machineId);
      const waiting = signals.filter((signal) => signal.status === "pending" || signal.status === "cooldown");
      badge.classList.toggle("tw-auto-badge-live", waiting.length > 0);
      if (waiting.length > 0) {
        badge.textContent = `⚠ ${waiting.length}`;
        badge.title = waiting.map((signal) => `${signal.summary} · ${formatWatchdogSignalStatus(signal.status)}`).join(" | ");
        badge.classList.add("has-approvals");
      } else if (total > 0) {
        badge.textContent = `🤖 ${total}`;
        badge.title = `Claude: ${stats.claudeCount || 0} | Codex: ${stats.codexCount || 0}${stats.lastDetectionSummary ? ` | Ultima: ${stats.lastDetectionSummary}` : ""}`;
        badge.classList.add("has-approvals");
      } else {
        badge.textContent = "🤖 0";
        badge.title = "Sin auto-aprobaciones";
        badge.classList.remove("has-approvals");
      }
    }
  });
}

function updateWatchdogUI() {
  updateWatchdogBadges();
  updateWatchdogRows();
  renderWatchdogOverview();
  resortMachineRows();
}

// ─── Init ──────────────────────────────────────────────────────────

loadMachines();
loadHistory();
setTimeout(loadSnapshots, 2000);
setTimeout(loadWatchdogStats, 3000);
setInterval(loadMachines, MACHINE_REFRESH_MS);
setInterval(loadHistory, 10_000);
setInterval(loadSnapshots, SNAPSHOT_REFRESH_MS);
setInterval(loadWatchdogStats, WATCHDOG_REFRESH_MS);
