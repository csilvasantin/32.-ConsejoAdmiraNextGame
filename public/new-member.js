const STORAGE_KEY = "admira-next-new-member-draft-v1";
const MACHINES_CACHE_BUST = "20260330-2";
const DEFAULT_FOCUS = "Onboarding y puesta a punto del equipo";
const DEFAULT_LOCATION = "Madrid";
const DEFAULT_MACHINE_ROLE = "Equipo principal";

const form = document.querySelector("#intakeForm");
const feedbackNode = document.querySelector("#feedback");
const submitButton = document.querySelector("#submitButton");
const downloadButton = document.querySelector("#downloadButton");
const downloadBootstrapButton = document.querySelector("#downloadBootstrapButton");
const downloadBootstrapAsideButton = document.querySelector("#downloadBootstrapAsideButton");
const copyButton = document.querySelector("#copyButton");
const copyBootstrapButton = document.querySelector("#copyBootstrapButton");
const resetButton = document.querySelector("#resetButton");
const modeBadge = document.querySelector("#modeBadge");
const modeHint = document.querySelector("#modeHint");
const tailnetHint = document.querySelector("#tailnetHint");
const previewMode = document.querySelector("#previewMode");
const previewChecklist = document.querySelector("#previewChecklist");
const jsonPreview = document.querySelector("#jsonPreview");
const bootstrapPreview = document.querySelector("#bootstrapPreview");

const previewNodes = {
  name: document.querySelector("#previewName"),
  member: document.querySelector("#previewMember"),
  status: document.querySelector("#previewStatus"),
  id: document.querySelector("#previewId"),
  host: document.querySelector("#previewHost"),
  ssh: document.querySelector("#previewSsh"),
  location: document.querySelector("#previewLocation"),
  role: document.querySelector("#previewRole"),
  machineRole: document.querySelector("#previewMachineRole"),
  focus: document.querySelector("#previewFocus")
};

const defaultDraft = {
  member: "",
  role: "",
  teamArea: "",
  location: DEFAULT_LOCATION,
  machineName: "",
  machineRole: DEFAULT_MACHINE_ROLE,
  platform: "macOS",
  color: "plata",
  status: "maintenance",
  currentFocus: DEFAULT_FOCUS,
  hostAlias: "",
  tailscaleIp: "",
  sshUser: "csilvasantin",
  remoteReady: "no",
  tailscaleReady: false,
  sshReady: false,
  githubReady: false,
  claudeReady: false,
  codexReady: false,
  claudeBotReady: false,
  codexBotReady: false,
  needsHelp: "",
  note: ""
};

const context = {
  isStaticMode: true,
  tailnet: "",
  machines: []
};
const params = new URLSearchParams(window.location.search);
const intakePresets = {
  "creative-macbook-air-clean": {
    teamArea: "Consejo creativo",
    role: "Creatividad y experiencia",
    machineName: "MacBook Air creativo",
    machineRole: "Equipo creativo",
    platform: "macOS",
    color: "plata",
    status: "maintenance",
    currentFocus: "Primer arranque del MacBook Air creativo",
    remoteReady: "no",
    tailscaleReady: false,
    sshReady: false,
    githubReady: false,
    claudeReady: false,
    codexReady: false,
    claudeBotReady: false,
    codexBotReady: false,
    needsHelp: "Equipo nuevo sin instalar. Pendiente de Tailscale, GitHub, Claude, Codex, ClaudeBot y CodexBot."
  }
};

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanString(value, fallback = "") {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

function readDraftFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return applyPreset({ ...defaultDraft });
    }

    return applyPreset({ ...defaultDraft, ...JSON.parse(raw) });
  } catch {
    return applyPreset({ ...defaultDraft });
  }
}

function applyPreset(draft) {
  const presetName = params.get("preset");
  if (!presetName || !intakePresets[presetName]) {
    return draft;
  }

  return {
    ...draft,
    ...intakePresets[presetName],
    member: draft.member || "",
    hostAlias: draft.hostAlias || "",
    tailscaleIp: draft.tailscaleIp || "",
    note: draft.note || ""
  };
}

function writeDraftToStorage(draft) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

function fillForm(draft) {
  for (const [key, value] of Object.entries(draft)) {
    const element = form.elements.namedItem(key);
    if (!element) {
      continue;
    }

    if (element instanceof RadioNodeList) {
      continue;
    }

    if (element.type === "checkbox") {
      element.checked = Boolean(value);
    } else {
      element.value = value;
    }
  }
}

function readDraftFromForm() {
  const formData = new FormData(form);
  return {
    member: cleanString(formData.get("member")),
    role: cleanString(formData.get("role")),
    teamArea: cleanString(formData.get("teamArea")),
    location: cleanString(formData.get("location"), DEFAULT_LOCATION),
    machineName: cleanString(formData.get("machineName")),
    machineRole: cleanString(formData.get("machineRole"), DEFAULT_MACHINE_ROLE),
    platform: cleanString(formData.get("platform"), "macOS"),
    color: cleanString(formData.get("color"), "plata"),
    status: cleanString(formData.get("status"), "maintenance"),
    currentFocus: cleanString(formData.get("currentFocus"), DEFAULT_FOCUS),
    hostAlias: cleanString(formData.get("hostAlias")),
    tailscaleIp: cleanString(formData.get("tailscaleIp")),
    sshUser: cleanString(formData.get("sshUser"), "csilvasantin"),
    remoteReady: cleanString(formData.get("remoteReady"), "no"),
    tailscaleReady: formData.get("tailscaleReady") === "on",
    sshReady: formData.get("sshReady") === "on",
    githubReady: formData.get("githubReady") === "on",
    claudeReady: formData.get("claudeReady") === "on",
    codexReady: formData.get("codexReady") === "on",
    claudeBotReady: formData.get("claudeBotReady") === "on",
    codexBotReady: formData.get("codexBotReady") === "on",
    needsHelp: cleanString(formData.get("needsHelp")),
    note: cleanString(formData.get("note"))
  };
}

function buildChecklist(draft) {
  return {
    tailscaleReady: draft.tailscaleReady,
    sshReady: draft.sshReady,
    githubReady: draft.githubReady,
    claudeReady: draft.claudeReady,
    codexReady: draft.codexReady,
    claudeBotReady: draft.claudeBotReady,
    codexBotReady: draft.codexBotReady,
    needsHelp: draft.needsHelp
  };
}

function buildChecklistSummary(checklist) {
  return [
    checklist.tailscaleReady ? "Tailscale listo" : "Tailscale pendiente",
    checklist.sshReady ? "SSH listo" : "SSH pendiente",
    checklist.githubReady ? "GitHub listo" : "GitHub pendiente",
    checklist.claudeReady ? "Claude listo" : "Claude pendiente",
    checklist.codexReady ? "Codex listo" : "Codex pendiente",
    checklist.claudeBotReady ? "ClaudeBot listo" : "ClaudeBot pendiente",
    checklist.codexBotReady ? "CodexBot listo" : "CodexBot pendiente"
  ].join(" | ");
}

function buildUniqueId(baseId) {
  const takenIds = new Set(context.machines.map((machine) => machine.id));
  let candidate = baseId;
  let suffix = 2;

  while (takenIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function buildDerivedRecord(draft) {
  const checklist = buildChecklist(draft);
  const checklistSummary = buildChecklistSummary(checklist);
  const hostAlias = normalizeToken(draft.hostAlias);
  const fullHost = hostAlias ? (context.tailnet ? `${hostAlias}.${context.tailnet}` : hostAlias) : "";
  const sshEnabled = draft.remoteReady === "yes";
  const sshUser = cleanString(draft.sshUser, "csilvasantin");
  const connectTailscale = sshEnabled
    ? (draft.tailscaleIp
        ? `ssh ${sshUser}@${draft.tailscaleIp}`
        : hostAlias
          ? `ssh -o ProxyCommand='tailscale nc %h %p' ${sshUser}@${hostAlias}`
          : "")
    : "";
  const rawBaseId = normalizeToken(hostAlias || draft.machineName || draft.member || "equipo");
  const baseId = rawBaseId.startsWith("admira-") ? rawBaseId : `admira-${rawBaseId}`;
  const id = buildUniqueId(baseId);
  const note = draft.note || (draft.needsHelp
    ? `Alta autoservicio. ${checklistSummary}. Ayuda solicitada: ${draft.needsHelp}`
    : `Alta autoservicio. ${checklistSummary}.`);
  const now = new Date().toISOString();
  const payload = {
    member: draft.member,
    role: draft.role,
    teamArea: draft.teamArea,
    location: draft.location || DEFAULT_LOCATION,
    machineName: draft.machineName,
    machineRole: draft.machineRole || DEFAULT_MACHINE_ROLE,
    platform: draft.platform,
    color: draft.color,
    status: draft.status,
    currentFocus: draft.currentFocus || DEFAULT_FOCUS,
    note,
    hostAlias,
    tailscaleIp: draft.tailscaleIp,
    sshUser,
    remoteReady: sshEnabled,
    onboarding: checklist
  };
  const machineRecord = {
    id,
    color: payload.color,
    member: payload.member,
    role: payload.role,
    name: payload.machineName,
    machineRole: payload.machineRole,
    location: payload.location,
    platform: payload.platform,
    status: payload.status,
    lastSeen: now,
    currentFocus: payload.currentFocus,
    note: payload.note,
    ssh: {
      enabled: payload.remoteReady,
      user: payload.sshUser,
      host: fullHost,
      ip_tailscale: payload.tailscaleIp,
      connect_tailscale: connectTailscale,
      hostAlias
    },
    intake: {
      source: "new-member-form",
      submittedAt: now,
      teamArea: payload.teamArea,
      checklist
    }
  };

  return {
    payload,
    machineRecord,
    checklistSummary,
    fullHost,
    connectTailscale
  };
}

function renderMode() {
  const apiMode = !context.isStaticMode;
  modeBadge.textContent = apiMode ? "Modo panel editable" : "Modo Pages / exportacion";
  modeBadge.className = `mode-pill ${apiMode ? "api" : "static"}`;
  modeHint.textContent = apiMode
    ? "Al enviar, la ficha se registrara directamente en AdmiraNext Team."
    : "La version publica no puede escribir en el panel. Puedes descargar el JSON y compartirlo con el equipo.";
  submitButton.textContent = apiMode ? "Registrar alta" : "Preparar y descargar ficha";
  previewMode.textContent = apiMode ? "guardado directo disponible" : "exportacion manual";
  previewMode.className = `mini-pill ${apiMode ? "ok" : "warn"}`;
}

function renderPreview() {
  const draft = readDraftFromForm();
  writeDraftToStorage(draft);
  const derived = buildDerivedRecord(draft);

  previewNodes.name.textContent = draft.machineName || "Equipo pendiente";
  previewNodes.member.textContent = draft.member ? `${draft.member}${draft.teamArea ? ` · ${draft.teamArea}` : ""}` : "Sin miembro definido";
  previewNodes.status.textContent = draft.status || "maintenance";
  previewNodes.status.className = `preview-status ${draft.status || "maintenance"}`;
  previewNodes.id.textContent = derived.machineRecord.id;
  previewNodes.host.textContent = derived.fullHost || "Pendiente";
  previewNodes.ssh.textContent = derived.connectTailscale || "Pendiente";
  previewNodes.location.textContent = draft.location || DEFAULT_LOCATION;
  previewNodes.role.textContent = draft.role || "Sin rol definido";
  previewNodes.machineRole.textContent = draft.machineRole || DEFAULT_MACHINE_ROLE;
  previewNodes.focus.textContent = draft.currentFocus || DEFAULT_FOCUS;
  previewChecklist.textContent = derived.checklistSummary;
  jsonPreview.textContent = JSON.stringify(derived.machineRecord, null, 2);
  bootstrapPreview.textContent = buildBootstrapScript(draft, derived);
  tailnetHint.textContent = context.tailnet
    ? `Si lo indicas, se convertira en ${cleanString(draft.hostAlias) ? `${normalizeToken(draft.hostAlias)}.${context.tailnet}` : `<alias>.${context.tailnet}`}.`
    : "Si lo indicas, se convertira en tu host completo.";
}

function showFeedback(message, kind) {
  feedbackNode.textContent = message;
  feedbackNode.className = `intake-feedback ${kind}`;
}

function clearFeedback() {
  feedbackNode.textContent = "";
  feedbackNode.className = "intake-feedback";
}

function validateDraft(draft) {
  const missing = [];

  if (!draft.member) {
    missing.push("nombre visible");
  }

  if (!draft.role) {
    missing.push("rol");
  }

  if (!draft.machineName) {
    missing.push("nombre visible de la maquina");
  }

  return missing;
}

function downloadJson(filename, content) {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadTextFile(filename, content, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function shellEscape(value) {
  return String(value || "").replace(/'/g, `'\\''`);
}

function buildBootstrapScript(draft, derived) {
  const promptText = "Haz onboarding leyendo este repositorio primero. Despues instala y valida Claude y Codex, y finalmente activa los bots de Admira Next ejecutando setup_admira_next_bots_mac.sh.";
  const member = draft.member || "Nuevo miembro";
  const role = draft.role || "Sin rol";
  const teamArea = draft.teamArea || "Admira Next";
  const machineName = draft.machineName || "Mac creativo";
  const hostAlias = normalizeToken(draft.hostAlias) || "pendiente-host";
  const focus = draft.currentFocus || DEFAULT_FOCUS;
  const note = draft.note || derived.machineRecord.note;

  return `#!/bin/zsh
set -euo pipefail

MEMBER_NAME='${shellEscape(member)}'
ROLE_NAME='${shellEscape(role)}'
TEAM_AREA='${shellEscape(teamArea)}'
MACHINE_NAME='${shellEscape(machineName)}'
HOST_ALIAS='${shellEscape(hostAlias)}'
CURRENT_FOCUS='${shellEscape(focus)}'
INTAKE_NOTE='${shellEscape(note)}'
BASE_DIR="\${HOME}/Documents/Codex"
ONBOARDING_DIR="\${BASE_DIR}/onboarding"
CLAUDE_DOWNLOAD_URL="https://claude.com/download"
CODEX_DOWNLOAD_URL="https://openai.com/codex/"

step() {
  printf "\\n==> %s\\n" "$1"
}

pause_for_user() {
  printf "\\nPulsa Enter cuando este paso este completo..."
  read -r _
}

ensure_xcode_tools() {
  if xcode-select -p >/dev/null 2>&1; then
    return
  fi

  step "Instalando Command Line Tools de Apple"
  xcode-select --install || true
  echo "macOS abrira el instalador. Cuando termine, vuelve a ejecutar este script."
  exit 1
}

ensure_homebrew() {
  if command -v brew >/dev/null 2>&1; then
    return
  fi

  step "Instalando Homebrew"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
}

ensure_brew_shellenv() {
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
}

ensure_formula() {
  local formula="$1"
  if brew list "$formula" >/dev/null 2>&1; then
    return
  fi

  step "Instalando $formula"
  brew install "$formula"
}

ensure_cask() {
  local cask="$1"
  if brew list --cask "$cask" >/dev/null 2>&1; then
    return
  fi

  step "Instalando $cask"
  brew install --cask "$cask"
}

ensure_app_or_prompt_install() {
  local app_name="$1"
  local download_url="$2"

  if open -Ra "$app_name" >/dev/null 2>&1; then
    step "$app_name ya esta instalado"
    open -a "$app_name" || true
    return
  fi

  step "Instalando $app_name"
  open "$download_url" || true
  echo "Descarga e instala $app_name desde la pagina oficial que se ha abierto."
  echo "Abre la app al menos una vez antes de continuar."
  pause_for_user

  if ! open -Ra "$app_name" >/dev/null 2>&1; then
    echo "No detecto la app $app_name instalada todavia."
    echo "Completa la instalacion y vuelve a lanzar este script."
    exit 1
  fi

  open -a "$app_name" || true
}

ensure_repo() {
  local repo_name="$1"
  local repo_path="\${BASE_DIR}/\${repo_name}"
  local repo_url="https://github.com/csilvasantin/\${repo_name}.git"

  if [ -d "\${repo_path}/.git" ]; then
    git -C "\${repo_path}" pull --ff-only || true
  else
    git clone "\${repo_url}" "\${repo_path}"
  fi
}

step "Preparando el alta de \${MEMBER_NAME}"
echo "Rol: \${ROLE_NAME}"
echo "Equipo: \${TEAM_AREA}"
echo "Mac: \${MACHINE_NAME}"
echo "Host sugerido: \${HOST_ALIAS}"
echo "Foco inicial: \${CURRENT_FOCUS}"
echo "Nota: \${INTAKE_NOTE}"

ensure_xcode_tools
ensure_homebrew
ensure_brew_shellenv
ensure_formula defaultbrowser
ensure_formula gh
ensure_formula python
ensure_cask google-chrome
ensure_cask tailscale

step "Configurando politica de actualizaciones del sistema"
echo "Activando comprobacion automatica y parches menores de macOS."
echo "Los upgrades grandes de macOS siguen siendo una decision manual validada por el equipo."
sudo softwareupdate --schedule on || true
sudo defaults write /Library/Preferences/com.apple.SoftwareUpdate AutomaticDownload -bool true || true
sudo defaults write /Library/Preferences/com.apple.SoftwareUpdate AutomaticallyInstallMacOSUpdates -bool true || true
sudo defaults write /Library/Preferences/com.apple.SoftwareUpdate ConfigDataInstall -bool true || true
sudo defaults write /Library/Preferences/com.apple.SoftwareUpdate CriticalUpdateInstall -bool true || true
sudo defaults write /Library/Preferences/com.apple.commerce AutoUpdate -bool true || true
sudo softwareupdate --background --force || true

step "Configurando politica de energia"
echo "Aplicando: hasta 4 horas enchufado y 1 hora en bateria."
sudo pmset -c sleep 240 || true
sudo pmset -b sleep 60 || true

step "Configurando Google Chrome"
defaultbrowser chrome || true
open -a "Google Chrome" || true

step "Instalando y validando Claude"
ensure_app_or_prompt_install "Claude" "$CLAUDE_DOWNLOAD_URL"

step "Instalando y validando Codex"
ensure_app_or_prompt_install "Codex" "$CODEX_DOWNLOAD_URL"

step "Abriendo Tailscale"
open -a Tailscale || true
echo "Entra en Tailscale y conecta este Mac a la tailnet de Admira Next."
pause_for_user

step "Activando acceso remoto"
echo "Ve a Ajustes del Sistema > General > Compartir > Inicio de sesion remoto."
echo "Activa SSH antes de continuar."
pause_for_user

step "Autenticando GitHub CLI"
if ! gh auth status >/dev/null 2>&1; then
  gh auth login --hostname github.com --git-protocol https --web
fi

step "Clonando onboarding"
mkdir -p "\${BASE_DIR}"
ensure_repo onboarding

step "Contexto para la IA"
echo "Abre onboarding y pega este prompt:"
echo
printf '%s\\n' '${shellEscape(promptText)}'
echo
echo "Ruta local: \${ONBOARDING_DIR}"

step "Instalando ClaudeBot y CodexBot"
chmod +x "\${ONBOARDING_DIR}/setup_admira_next_bots_mac.sh"
(cd "\${ONBOARDING_DIR}" && ./setup_admira_next_bots_mac.sh)

step "Permisos de macOS"
echo "1. Ajustes del Sistema > Privacidad y seguridad > Accesibilidad"
echo "   Añade Terminal o iTerm y actívalo."
echo "2. Ajustes del Sistema > Privacidad y seguridad > Grabacion de pantalla"
echo "   Añade Terminal o iTerm y actívalo."
echo "3. Si macOS pide permisos extra de automatizacion al primer uso, aceptalos."
pause_for_user

step "Checklist final"
echo "- Google Chrome instalado y por defecto"
echo "- actualizaciones automaticas de parches menores y seguridad activadas"
echo "- energia: sleep 240 en corriente y sleep 60 en bateria"
echo "- Tailscale conectado"
echo "- SSH habilitado"
echo "- gh auth status correcto"
echo "- onboarding clonado"
echo "- Claude instalado y abierto"
echo "- Codex instalado y abierto"
echo "- ClaudeBot activo"
echo "- CodexBot activo"
echo
echo "Alta express completada. Si falta algo, vuelve a la ficha web y actualiza el checklist."
`;
}

async function copySummaryToClipboard() {
  const draft = readDraftFromForm();
  const derived = buildDerivedRecord(draft);
  const summary = [
    "Alta nueva AdmiraNext",
    `Miembro: ${derived.machineRecord.member || "-"}`,
    `Rol: ${derived.machineRecord.role || "-"}`,
    `Area: ${derived.machineRecord.intake.teamArea || "-"}`,
    `Maquina: ${derived.machineRecord.name || "-"}`,
    `ID sugerido: ${derived.machineRecord.id}`,
    `Estado inicial: ${derived.machineRecord.status}`,
    `Host Tailscale: ${derived.fullHost || "-"}`,
    `SSH: ${derived.connectTailscale || "pendiente"}`,
    `Foco actual: ${derived.machineRecord.currentFocus}`,
    `Checklist: ${derived.checklistSummary}`,
    `Nota: ${derived.machineRecord.note}`
  ].join("\n");

  await navigator.clipboard.writeText(summary);
  showFeedback("Resumen copiado. Ya puedes pegarlo en chat o compartirlo con el equipo.", "ok");
}

function downloadBootstrapScript() {
  const draft = readDraftFromForm();
  const missing = validateDraft(draft);
  if (missing.length) {
    showFeedback(`Antes de generar el script, completa: ${missing.join(", ")}.`, "err");
    return;
  }

  const derived = buildDerivedRecord(draft);
  downloadTextFile(`alta-${derived.machineRecord.id}.command`, buildBootstrapScript(draft, derived), "text/x-shellscript;charset=utf-8");
  showFeedback("Script de arranque descargado. El nuevo miembro ya puede ejecutarlo para automatizar el setup inicial.", "ok");
}

async function copyBootstrapToClipboard() {
  const draft = readDraftFromForm();
  const missing = validateDraft(draft);
  if (missing.length) {
    showFeedback(`Antes de copiar el script, completa: ${missing.join(", ")}.`, "err");
    return;
  }

  const derived = buildDerivedRecord(draft);
  await navigator.clipboard.writeText(buildBootstrapScript(draft, derived));
  showFeedback("Script de arranque copiado al portapapeles.", "ok");
}

async function loadContext() {
  try {
    const response = await fetch("/api/machines", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("api unavailable");
    }

    const data = await response.json();
    context.isStaticMode = false;
    context.tailnet = data.tailnet || "";
    context.machines = data.machines || [];
  } catch {
    const response = await fetch(`./machines.json?v=${MACHINES_CACHE_BUST}`, { cache: "no-store" });
    const data = await response.json();
    context.isStaticMode = true;
    context.tailnet = data.tailnet || "";
    context.machines = data.machines || [];
  }
}

async function submitDraft(event) {
  event.preventDefault();
  clearFeedback();

  const draft = readDraftFromForm();
  const missing = validateDraft(draft);
  if (missing.length) {
    showFeedback(`Faltan campos obligatorios: ${missing.join(", ")}.`, "err");
    return;
  }

  const derived = buildDerivedRecord(draft);

  if (context.isStaticMode) {
    downloadJson(`alta-${derived.machineRecord.id}.json`, `${JSON.stringify(derived.machineRecord, null, 2)}\n`);
    showFeedback("La ficha se ha descargado en JSON. Compartela con el equipo para importarla en el panel editable.", "ok");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Registrando...";

  try {
    const response = await fetch("/api/machines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(derived.payload)
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || "No se pudo registrar la ficha");
    }

    context.machines.push(result.machine);
    localStorage.removeItem(STORAGE_KEY);
    fillForm({ ...defaultDraft });
    renderPreview();
    showFeedback(`Alta completada. La nueva ficha ya existe en el panel con el ID ${result.machine.id}.`, "ok");
  } catch (error) {
    showFeedback(error instanceof Error ? error.message : "No se pudo registrar la ficha", "err");
  } finally {
    submitButton.disabled = false;
    renderMode();
  }
}

function resetDraft() {
  const confirmed = window.confirm("Esto borrara el borrador actual del formulario. ¿Seguimos?");
  if (!confirmed) {
    return;
  }

  localStorage.removeItem(STORAGE_KEY);
  fillForm({ ...defaultDraft });
  clearFeedback();
  renderPreview();
}

form.addEventListener("input", () => {
  clearFeedback();
  renderPreview();
});

form.addEventListener("change", () => {
  clearFeedback();
  renderPreview();
});

form.addEventListener("submit", submitDraft);

downloadButton.addEventListener("click", () => {
  const draft = readDraftFromForm();
  const missing = validateDraft(draft);
  if (missing.length) {
    showFeedback(`Antes de descargar, completa: ${missing.join(", ")}.`, "err");
    return;
  }

  const derived = buildDerivedRecord(draft);
  downloadJson(`alta-${derived.machineRecord.id}.json`, `${JSON.stringify(derived.machineRecord, null, 2)}\n`);
  showFeedback("Ficha descargada en JSON.", "ok");
});

downloadBootstrapButton.addEventListener("click", downloadBootstrapScript);
downloadBootstrapAsideButton.addEventListener("click", downloadBootstrapScript);

copyButton.addEventListener("click", async () => {
  try {
    await copySummaryToClipboard();
  } catch {
    showFeedback("No pude copiar el resumen al portapapeles.", "err");
  }
});

copyBootstrapButton.addEventListener("click", async () => {
  try {
    await copyBootstrapToClipboard();
  } catch {
    showFeedback("No pude copiar el script de arranque.", "err");
  }
});

resetButton.addEventListener("click", resetDraft);

async function init() {
  fillForm(readDraftFromStorage());
  await loadContext();
  renderMode();
  renderPreview();
}

init();
