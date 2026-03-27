const quickInput = document.querySelector("#quickInput");
const sendAllBtn = document.querySelector("#sendAllBtn");
const feedback = document.querySelector("#feedback");
const historyList = document.querySelector("#historyList");

let machines = [];
let isStaticMode = false;
const FUNNEL_URL = "https://macmini.tail48b61c.ts.net";
const FUNNEL_HOST = "macmini.tail48b61c.ts.net";
const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === FUNNEL_HOST;

// Redirect GitHub Pages to Funnel
if (location.hostname === "csilvasantin.github.io") {
  location.href = FUNNEL_URL + "/teamwork.html";
}

function apiUrl(path) {
  return isLocal ? path : `${FUNNEL_URL}${path}`;
}

function showFeedback(text, ok) {
  feedback.textContent = text;
  feedback.className = "tw-feedback " + (ok ? "ok" : "err");
  setTimeout(() => { feedback.className = "tw-feedback"; }, 4000);
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
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

const sendAllTarget = document.querySelector("#sendAllTarget");

async function sendToAll(prompt) {
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

function renderHistory(entries) {
  if (!entries.length) {
    historyList.innerHTML = '<p class="tw-empty">Sin comandos enviados todavía.</p>';
    return;
  }

  historyList.innerHTML = entries.map((e) => {
    const captureHtml = e.captureId
      ? `<div class="tw-terminal" id="capture-${e.captureId}"><span class="tw-terminal-loading">Capturando terminal...</span></div>`
      : "";
    return `
      <div class="tw-entry">
        <div class="tw-entry-header">
          <span class="tw-entry-machine">${e.machineName} <span class="tw-entry-target">${e.target || "terminal"}</span><span class="tw-entry-status ${e.status}"></span></span>
          <span class="tw-entry-prompt">${e.prompt}</span>
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
    machines = data.machines.filter((m) => m.ssh?.enabled);
    isStaticMode = false;
    renderMachineApproveList(null);
  } catch {
    try {
      const res = await fetch("./machines.json?v=20260327-1", { cache: "no-store" });
      const data = await res.json();
      machines = data.machines.filter((m) => m.ssh?.enabled);
      isStaticMode = true;
      renderMachineApproveList(null);
      sendAllBtn.textContent = "Solo lectura";
      sendAllBtn.disabled = true;
    } catch {
      // no machines
    }
  }
}

// Per-machine approve
const machineApproveList = document.querySelector("#machineApproveList");

function formatTimeShort(iso) {
  try { return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

function renderMachineApproveList(snapshots) {
  const filtered = machines;
  if (!filtered.length) {
    machineApproveList.innerHTML = '<p class="tw-empty">Sin equipos disponibles.</p>';
    return;
  }

  const sorted = [...filtered].sort((a, b) => {
    const aOnline = snapshots?.[a.id] ? 1 : 0;
    const bOnline = snapshots?.[b.id] ? 1 : 0;
    return bOnline - aOnline;
  });

  machineApproveList.innerHTML = sorted.map((m) => {
    const snap = snapshots?.[m.id];
    const monitorContent = snap
      ? `<pre>${snap.text.replace(/</g, "&lt;")}</pre><span class="tw-machine-monitor-time">${formatTimeShort(snap.updatedAt)}</span>`
      : `<div class="tw-machine-monitor-empty">Sin señal</div>`;
    return `
    <div class="tw-machine-row" data-id="${m.id}">
      <div class="tw-machine-monitor small" data-monitor="${m.id}">${monitorContent}</div>
      <div class="tw-machine-label">
        <span class="tw-machine-name">${m.name}</span><br>
        <span class="tw-machine-member">${m.member}</span>
      </div>
      <input class="tw-machine-input" data-machine="${m.id}" type="text" placeholder="Prompt para ${m.member}...">
      <select class="tw-approve-sm" data-machine-target="${m.id}" style="background:var(--panel);color:var(--ink);border:1px solid var(--line);padding:8px 6px;font-size:11px;border-radius:10px;">
        <option value="claude">Claude</option>
        <option value="codex">Codex</option>
        <option value="terminal">Terminal</option>
      </select>
      <button class="tw-machine-send" data-machine-send="${m.id}">Enviar</button>
      <button class="tw-machine-approve" data-machine-approve="${m.id}">Aprobar</button>
    </div>`;
  }).join("");

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
      btn.textContent = "...";

      try {
        const res = await fetch(apiUrl("/api/teamwork/approve-machine"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ machineId, target })
        });
        const data = await res.json();
        btn.textContent = data.ok ? "OK" : "Error";
        setTimeout(() => { btn.textContent = "Aprobar"; btn.disabled = false; }, 2000);
      } catch {
        btn.textContent = "Error";
        setTimeout(() => { btn.textContent = "Aprobar"; btn.disabled = false; }, 2000);
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

  try {
    const res = await fetch(apiUrl("/api/teamwork/approve"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target })
    });
    const data = await res.json();
    const ok = data.results.filter((r) => r.ok).length;
    const fail = data.results.filter((r) => !r.ok).length;
    const names = data.results.map((r) => `${r.machine}: ${r.ok ? "OK" : "error"}`).join(" | ");
    resultEl.textContent = `${ok} aprobados, ${fail} errores — ${names}`;
  } catch (err) {
    resultEl.textContent = `Error: ${err.message}`;
  }

  btn.disabled = false;
  btn.textContent = target === "claude" ? "Aprobar Claude" : "Aprobar Codex";
}

quickInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    const prompt = quickInput.value.trim();
    if (prompt) sendToAll(prompt);
    else showFeedback("Escribe un prompt", false);
  }
});

sendAllBtn.addEventListener("click", () => {
  const prompt = quickInput.value.trim();
  if (prompt) sendToAll(prompt);
  else showFeedback("Escribe un prompt", false);
});

approveClaudeBtn.addEventListener("click", () => approveAll("claude", approveClaudeBtn, approveClaudeResult));
approveCodexBtn.addEventListener("click", () => approveAll("codex", approveCodexBtn, approveCodexResult));

async function loadSnapshots() {
  try {
    const res = await fetch(apiUrl("/api/teamwork/snapshots"), { cache: "no-store" });
    const data = await res.json();
    if (data.ok) {
      renderMachineApproveList(data.snapshots);
    }
  } catch {
    // silently fail
  }
}

loadMachines();
loadHistory();
setTimeout(loadSnapshots, 2000);
setInterval(loadHistory, 10_000);
setInterval(loadSnapshots, 60_000);
