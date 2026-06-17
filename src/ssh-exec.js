import { execFile } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { hostname, homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { readMachines } from "./store.js";

const SSH_IDENTITY = join(homedir(), ".ssh", "admiranext_ed25519");
const WINDOWS_SCREENSHOT_PYTHON = join(homedir(), "Documents", "Codex", "ClaudeBot", ".venv", "Scripts", "python.exe");

const LOCAL_HOSTNAME = hostname().replace(/\.local$/, "").toLowerCase();
const IS_WINDOWS = process.platform === "win32";

const TIMEOUT_MS = 15_000;
const CAPTURE_DELAY_MS = 4000;
const REMOTE_GUI_AGENT_CACHE_MS = 10_000;
const LOCAL_MULTI_DISPLAY_MACHINE_IDS = new Set(["admira-macmini"]);
const APPROVAL_SOUND_PATHS = {
  claude: join(tmpdir(), "admira_next_claude_approve.wav"),
  codex: join(tmpdir(), "admira_next_codex_approve.wav")
};

// In-memory image store: machineId/captureId → Buffer
const imageBuffers = new Map();
const remoteGuiAgentAvailability = new Map();
const approvalSoundReadyPromises = new Map();

export function getImageBuffer(id) {
  return imageBuffers.get(id) || null;
}

function shouldTryRemoteGuiAgent(machineId) {
  const cached = remoteGuiAgentAvailability.get(machineId);
  if (!cached) return true;
  if (cached.available) return true;
  return (Date.now() - cached.checkedAt) > REMOTE_GUI_AGENT_CACHE_MS;
}

function noteRemoteGuiAgent(machineId, available) {
  remoteGuiAgentAvailability.set(machineId, { available, checkedAt: Date.now() });
}

function createWavBuffer(sequence, sampleRate = 22050) {
  const totalSamples = sequence.reduce((sum, part) => sum + Math.max(1, Math.floor((part.ms / 1000) * sampleRate)), 0);
  const pcm = Buffer.alloc(totalSamples * 2);
  let sampleOffset = 0;

  for (const part of sequence) {
    const samples = Math.max(1, Math.floor((part.ms / 1000) * sampleRate));
    const startFreq = part.freq ?? 0;
    const endFreq = part.endFreq ?? startFreq;
    const volume = part.volume ?? 0.4;
    const attack = Math.max(1, Math.floor(samples * 0.1));
    const release = Math.max(1, Math.floor(samples * 0.18));

    for (let i = 0; i < samples; i++) {
      const progress = samples <= 1 ? 1 : i / (samples - 1);
      const freq = startFreq + ((endFreq - startFreq) * progress);
      let amplitude = 0;

      if (freq > 0) {
        const time = i / sampleRate;
        const angle = 2 * Math.PI * freq * time;
        const square = Math.sign(Math.sin(angle));
        const sine = Math.sin(angle * 2);
        const envelopeIn = Math.min(1, i / attack);
        const envelopeOut = Math.min(1, (samples - i) / release);
        const envelope = Math.min(envelopeIn, envelopeOut);
        amplitude = (square * 0.72 + sine * 0.28) * envelope * volume;
      }

      const clamped = Math.max(-1, Math.min(1, amplitude));
      pcm.writeInt16LE(Math.round(clamped * 32767), sampleOffset * 2);
      sampleOffset++;
    }
  }

  const header = Buffer.alloc(44);
  const byteRate = sampleRate * 2;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function buildApprovalSoundBuffer(kind = "claude") {
  if (kind === "codex") {
    // Sharper, more digital triad for Codex approvals.
    return createWavBuffer([
      { freq: 987.77, endFreq: 1174.66, ms: 70, volume: 0.33 },
      { freq: 0, ms: 16, volume: 0 },
      { freq: 1479.98, endFreq: 1661.22, ms: 76, volume: 0.31 },
      { freq: 0, ms: 14, volume: 0 },
      { freq: 1975.53, endFreq: 2349.32, ms: 124, volume: 0.29 }
    ]);
  }

  // Coin-like arpeggio for Claude / Claude Code approvals.
  return createWavBuffer([
    { freq: 1318.51, endFreq: 1480.0, ms: 68, volume: 0.34 },
    { freq: 0, ms: 18, volume: 0 },
    { freq: 1661.22, endFreq: 1864.66, ms: 82, volume: 0.32 },
    { freq: 0, ms: 16, volume: 0 },
    { freq: 2093.0, endFreq: 2637.02, ms: 118, volume: 0.28 }
  ]);
}

function normalizeApprovalSoundKind(target = "") {
  return String(target || "").includes("codex") ? "codex" : "claude";
}

function ensureApprovalSoundPath(kind = "claude") {
  const normalizedKind = normalizeApprovalSoundKind(kind);
  if (!approvalSoundReadyPromises.has(normalizedKind)) {
    const soundPath = APPROVAL_SOUND_PATHS[normalizedKind] || APPROVAL_SOUND_PATHS.claude;
    const promise = writeFile(soundPath, buildApprovalSoundBuffer(normalizedKind))
      .then(() => soundPath)
      .catch(() => null);
    approvalSoundReadyPromises.set(normalizedKind, promise);
  }
  return approvalSoundReadyPromises.get(normalizedKind);
}

function isLocalMachine(machine) {
  const host = (machine.ssh?.host || "").split(".")[0].toLowerCase();
  return host === LOCAL_HOSTNAME;
}

function isWindowsMachine(machine) {
  return (machine.platform || "").toLowerCase().includes("windows");
}

function isLocalWindowsMachine(machine) {
  return IS_WINDOWS && isWindowsMachine(machine) && isLocalMachine(machine);
}

function isLocalMacMachine(machine) {
  return !IS_WINDOWS && isLocalMachine(machine);
}

function isLocalMultiDisplayMachine(machine) {
  return isLocalMacMachine(machine) && LOCAL_MULTI_DISPLAY_MACHINE_IDS.has(machine?.id);
}

function hasWindowsAutomationChannel(machine) {
  return machine.automation?.enabled && machine.automation?.channel === "windows-local" && isLocalWindowsMachine(machine);
}

function isAutomationReady(machine) {
  return Boolean(machine.ssh?.enabled || hasWindowsAutomationChannel(machine));
}

function execLocal(script, timeout = 10_000) {
  return new Promise((resolve) => {
    execFile("osascript", ["-e", script], { timeout }, (error, stdout) => {
      resolve({ error, stdout: stdout?.trim() || "" });
    });
  });
}

function execLocalMulti(args, timeout = 10_000) {
  return new Promise((resolve) => {
    execFile("osascript", args, { timeout }, (error, stdout) => {
      resolve({ error, stdout: stdout?.trim() || "" });
    });
  });
}

function execWindows(script, timeout = 10_000) {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-STA", "-Command", script],
      { timeout, windowsHide: true, maxBuffer: 20 * 1024 * 1024 },
      (error, stdout) => {
        resolve({ error, stdout: stdout?.trim() || "" });
      }
    );
  });
}

function execPython(pythonBin, script, timeout = 10_000) {
  return new Promise((resolve) => {
    execFile(
      pythonBin,
      ["-"],
      { timeout, windowsHide: true, maxBuffer: 20 * 1024 * 1024 },
      (error, stdout) => {
        resolve({ error, stdout: stdout?.trim() || "" });
      }
    ).stdin.end(script);
  });
}

function toPowerShellString(value) {
  return `'${String(value || "").replace(/'/g, "''")}'`;
}

const WINDOWS_TARGET_APPS = {
  terminal: {
    processNames: ["WindowsTerminal", "Terminal", "pwsh", "powershell", "cmd"],
    titleHints: ["Terminal", "PowerShell", "Command Prompt", "AdmiraNext Automation", "Windows PowerShell"]
  },
  claude: {
    processNames: ["Claude"],
    titleHints: ["Claude"]
  },
  codex: {
    processNames: ["Codex", "codex"],
    titleHints: ["Codex"]
  },
  opencode: {
    processNames: ["OpenCode", "opencode"],
    titleHints: ["OpenCode"]
  }
};

function getWindowsTarget(target) {
  return WINDOWS_TARGET_APPS[target] || WINDOWS_TARGET_APPS.terminal;
}

function toPowerShellArray(items) {
  return `@(${items.map((item) => toPowerShellString(item)).join(", ")})`;
}

function buildWindowsAutomationPrelude(target) {
  const config = getWindowsTarget(target);
  return `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
if (-not ([System.Management.Automation.PSTypeName]'AdmiraNext.Win32').Type) {
  Add-Type -Namespace AdmiraNext -Name Win32 -MemberDefinition @"
    using System;
    using System.Runtime.InteropServices;
    using System.Text;
    public static class Win32 {
      [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
      [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
      [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
      [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
      [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    }
"@ | Out-Null
}
function Get-AdmiraWindow {
  param([string[]]$Names, [string[]]$TitleHints)
  $visible = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -or $_.MainWindowTitle }
  $matches = foreach ($proc in $visible) {
    $name = [string]$proc.ProcessName
    $title = [string]$proc.MainWindowTitle
    $nameHit = $false
    foreach ($candidate in $Names) {
      if ($name -ieq $candidate) { $nameHit = $true; break }
    }
    $titleHit = $false
    foreach ($hint in $TitleHints) {
      if ($title -like "*$hint*" -or $name -like "*$hint*") { $titleHit = $true; break }
    }
    if ($nameHit -or $titleHit) { $proc }
  }
  $matches |
    Sort-Object @{ Expression = { if ($_.MainWindowTitle) { 0 } else { 1 } } }, @{ Expression = { $_.StartTime } } -Descending |
    Select-Object -First 1
}
function Set-AdmiraForeground {
  param([System.Diagnostics.Process]$Proc)
  if (-not $Proc) { return [IntPtr]::Zero }
  $hwnd = [IntPtr]$Proc.MainWindowHandle
  if ($hwnd -eq [IntPtr]::Zero) { return [IntPtr]::Zero }
  if ([AdmiraNext.Win32]::IsIconic($hwnd)) {
    [AdmiraNext.Win32]::ShowWindow($hwnd, 9) | Out-Null
    Start-Sleep -Milliseconds 150
  }
  [AdmiraNext.Win32]::SetForegroundWindow($hwnd) | Out-Null
  Start-Sleep -Milliseconds 250
  return $hwnd
}
$targetNames = ${toPowerShellArray(config.processNames)}
$titleHints = ${toPowerShellArray(config.titleHints)}
$proc = Get-AdmiraWindow -Names $targetNames -TitleHints $titleHints
if (-not $proc) { Write-Output "__ADMIRA_ERR__:window-not-found"; exit 2 }
$previousWindow = [AdmiraNext.Win32]::GetForegroundWindow()
$targetWindow = Set-AdmiraForeground -Proc $proc
if ($targetWindow -eq [IntPtr]::Zero) { Write-Output "__ADMIRA_ERR__:window-no-handle"; exit 3 }
`.trim();
}

async function sendPromptToLocalWindows(target, prompt) {
  const safePrompt = toPowerShellString(prompt);
  const script = `
${buildWindowsAutomationPrelude(target)}
[System.Windows.Forms.Clipboard]::SetText(${safePrompt})
Start-Sleep -Milliseconds 80
[System.Windows.Forms.SendKeys]::SendWait("^v")
Start-Sleep -Milliseconds 140
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
Start-Sleep -Milliseconds 120
if ($previousWindow -ne [IntPtr]::Zero) {
  [AdmiraNext.Win32]::SetForegroundWindow($previousWindow) | Out-Null
}
Write-Output "OK"
`.trim();
  const { error, stdout } = await execWindows(script, TIMEOUT_MS);
  if (error || stdout.includes("__ADMIRA_ERR__")) {
    return { ok: false, error: error?.message || stdout.replace("__ADMIRA_ERR__:", "") || "Automatizacion Windows no disponible" };
  }
  return { ok: true };
}

async function sendApproveToLocalWindows(target) {
  const sendKeys =
    target === "codex"
      ? ['"2"', '"{ENTER}"']
      : ['"^{ENTER}"'];
  const body = sendKeys.map((keys) => `[System.Windows.Forms.SendKeys]::SendWait(${keys})\nStart-Sleep -Milliseconds 140`).join("\n");
  const script = `
${buildWindowsAutomationPrelude(target)}
${body}
if ($previousWindow -ne [IntPtr]::Zero) {
  [AdmiraNext.Win32]::SetForegroundWindow($previousWindow) | Out-Null
}
Write-Output "OK"
`.trim();
  const { error, stdout } = await execWindows(script, 8_000);
  if (error || stdout.includes("__ADMIRA_ERR__")) {
    return { ok: false, error: error?.message || stdout.replace("__ADMIRA_ERR__:", "") || "No se pudo aprobar en Windows" };
  }
  return { ok: true };
}

function sanitizePrompt(text) {
  return text
    .replace(/[\r\n]+/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .slice(0, 2000);
}

function shellQuote(value) {
  return `'${String(value || "").replace(/'/g, `'\\''`)}'`;
}

function isIpv4Address(value) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(value || "").trim());
}

function normalizeLanTarget(value) {
  const trimmed = String(value || "").trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  if (isIpv4Address(trimmed) || trimmed.includes(".")) {
    return trimmed;
  }

  return `${trimmed}.local`;
}

function getShortHost(machine) {
  const host = String(machine.ssh?.host || "").trim().toLowerCase();
  if (!host) {
    return "";
  }

  return host.split(".")[0];
}

function getLanTargets(machine) {
  const targets = [
    machine.ssh?.ip_lan,
    machine.ssh?.host_local,
    machine.ssh?.hostAlias,
    getShortHost(machine)
  ]
    .map(normalizeLanTarget)
    .filter(Boolean);

  return [...new Set(targets)];
}

function deriveLocalHostname(machine) {
  return getLanTargets(machine)[0] || null;
}

function buildSshArgs(machine, useLocal) {
  const args = ["-i", SSH_IDENTITY, "-o", "ConnectTimeout=5", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new"];

  if (!useLocal) {
    const conn = machine.ssh.connect_tailscale || "";
    if (conn.includes("ProxyCommand")) {
      const proxy = conn.match(/-o\s+'([^']+)'/)?.[1] || conn.match(/-o\s+"([^"]+)"/)?.[1];
      if (proxy) {
        args.push("-o", proxy);
      }
    }
  }

  const user = machine.ssh.user || "csilvasantin";
  const host = useLocal ? deriveLocalHostname(machine) : (machine.ssh.ip_tailscale || machine.ssh.host);
  args.push(`${user}@${host}`);

  return args;
}

function buildScpArgs(machine, useLocal) {
  const args = ["-i", SSH_IDENTITY, "-o", "ConnectTimeout=5", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new"];

  if (!useLocal) {
    const conn = machine.ssh.connect_tailscale || "";
    if (conn.includes("ProxyCommand")) {
      const proxy = conn.match(/-o\s+'([^']+)'/)?.[1] || conn.match(/-o\s+"([^"]+)"/)?.[1];
      if (proxy) args.push("-o", proxy);
    }
  }

  return args;
}

function execRemote(machine, useLocal, command, timeout = TIMEOUT_MS, maxBuffer = 20 * 1024 * 1024) {
  return new Promise((resolve) => {
    const sshArgs = buildSshArgs(machine, useLocal);
    sshArgs.push(command);
    execFile("ssh", sshArgs, { timeout, maxBuffer }, (error, stdout) => {
      resolve({ error, stdout: stdout?.trim() || "" });
    });
  });
}

async function captureFromRemoteGuiAgent(machine, useLocal) {
  if (!shouldTryRemoteGuiAgent(machine.id)) {
    return null;
  }

  const snapshotsResult = await execRemote(
    machine,
    useLocal,
    "curl -fsS --max-time 8 http://127.0.0.1:3030/api/teamwork/snapshots",
    12_000
  );

  if (snapshotsResult.error || !snapshotsResult.stdout) {
    noteRemoteGuiAgent(machine.id, false);
    return null;
  }

  let snapshotsData;
  try {
    snapshotsData = JSON.parse(snapshotsResult.stdout);
  } catch {
    noteRemoteGuiAgent(machine.id, false);
    return null;
  }

  const snap = snapshotsData?.snapshots?.[machine.id];
  const imagePath =
    snap?.image ||
    (Array.isArray(snap?.images) && snap.images.length > 0 ? snap.images[0] : null);

  if (!imagePath) {
    noteRemoteGuiAgent(machine.id, true);
    return null;
  }

  const remoteTmp = `/tmp/admira_gui_${machine.id}_${Date.now()}.jpg`;
  const fetchResult = await execRemote(
    machine,
    useLocal,
    `curl -fsS --max-time 8 http://127.0.0.1:3030${imagePath} -o ${remoteTmp} && test -s ${remoteTmp} && printf OK`,
    15_000,
    30 * 1024 * 1024
  );

  if (fetchResult.error || !fetchResult.stdout.includes("OK")) {
    noteRemoteGuiAgent(machine.id, false);
    return null;
  }

  const localTmp = join(tmpdir(), `tw_remote_gui_${machine.id}_${Date.now()}.jpg`);
  try {
    const scpArgs = buildScpArgs(machine, useLocal);
    const user = machine.ssh?.user || "csilvasantin";
    const host = useLocal ? deriveLocalHostname(machine) : (machine.ssh?.ip_tailscale || machine.ssh?.host);
    try {
      await new Promise((resolve, reject) => {
        execFile("scp", [...scpArgs, `${user}@${host}:${remoteTmp}`, localTmp], { timeout: 30_000 }, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    } catch {
      // Some Macs finish copying the file but keep the SSH transport open too long.
      // If the temp file is already readable, we still accept it below.
    }

    const buffer = await readFile(localTmp);
    if (!buffer.length) {
      noteRemoteGuiAgent(machine.id, false);
      return null;
    }
    noteRemoteGuiAgent(machine.id, true);
    return buffer;
  } catch {
    noteRemoteGuiAgent(machine.id, false);
    return null;
  } finally {
    unlink(localTmp).catch(() => {});
    execRemote(machine, useLocal, `rm -f ${remoteTmp}`, 5_000).catch(() => {});
  }
}

// Try ScreenCaptureKit screenshot via Swift on remote machine
// Returns a Buffer with the screenshot, or rejects — no disk writes
function captureScreenshot(machine, useLocal) {
  return new Promise((resolve, reject) => {
    const sshArgs = buildSshArgs(machine, useLocal);
    const swiftScript = `
import Foundation
import ScreenCaptureKit
import AppKit

let sem = DispatchSemaphore(value: 0)
Task {
    do {
        let content = try await SCShareableContent.current
        guard let display = content.displays.first else { exit(1) }
        let filter = SCContentFilter(display: display, excludingWindows: [])
        let config = SCStreamConfiguration()
        config.width = Int(display.width)
        config.height = Int(display.height)
        let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
        let rep = NSBitmapImageRep(cgImage: image)
        let data = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.6])!
        print(data.base64EncodedString())
    } catch { print("FAIL") }
    sem.signal()
}
sem.wait()
`.trim();

    sshArgs.push(`cat > /tmp/tw_capture.swift << 'SWIFTEOF'
${swiftScript}
SWIFTEOF
swift /tmp/tw_capture.swift && rm -f /tmp/tw_capture.swift`);

    execFile("ssh", sshArgs, { timeout: 30_000 }, (err, stdout) => {
      const b64 = stdout?.trim();
      if (err || !b64 || b64 === "FAIL") return reject(err || new Error("capture failed"));
      try { resolve(Buffer.from(b64, "base64")); } catch (e) { reject(e); }
    });
  });
}

// Fallback: capture terminal text
function captureTerminalText(machine, useLocal, appName) {
  return new Promise((resolve) => {
    const sshArgs = buildSshArgs(machine, useLocal);

    if (appName === "Terminal") {
      sshArgs.push(`osascript -e 'tell application "Terminal" to get contents of front window'`);
    } else {
      sshArgs.push(`osascript -e 'tell application "${appName}" to activate' -e 'delay 0.3' -e 'tell application "System Events" to keystroke "a" using command down' -e 'tell application "System Events" to keystroke "c" using command down' -e 'delay 0.3' -e 'return (the clipboard)'`);
    }

    execFile("ssh", sshArgs, { timeout: TIMEOUT_MS }, (error, stdout) => {
      if (error) {
        resolve(null);
      } else {
        const lines = stdout.trim().split("\n");
        const last30 = lines.slice(-30).join("\n");
        resolve(last30);
      }
    });
  });
}

// In-memory store for captures
const captures = new Map();

export function getCapture(captureId) {
  return captures.get(captureId) || null;
}

const TARGET_APPS = {
  terminal: "Terminal",
  claude: "Claude",
  codex: "Codex",
  terminal_claude: "Terminal",
  terminal_codex: "Terminal"
};

const TERMINAL_APP_CANDIDATES = ["Terminal", "iTerm2", "Warp", "Ghostty"];

export async function sendPromptToMachine(machineId, prompt, target = "terminal") {
  const data = await readMachines();
  const machine = data.machines.find((m) => m.id === machineId);

  if (!machine) {
    return { ok: false, error: `Máquina '${machineId}' no encontrada` };
  }

  const targetKey = TARGET_APPS[target] ? target : "terminal";
  if (!isAutomationReady(machine)) {
    return { ok: false, error: `Canal de automatizacion no habilitado en '${machine.name}'` };
  }

  const safe = sanitizePrompt(prompt);
  const appName = TARGET_APPS[targetKey] || TARGET_APPS.terminal;
  const osascriptLines = [
    `tell application "${appName}" to activate`,
    `tell application "System Events" to keystroke "${safe}"`,
    'tell application "System Events" to keystroke return'
  ];

  let result;
  let usedLocal = false;

  // If this is the local machine, run osascript directly
  if (hasWindowsAutomationChannel(machine)) {
    result = await sendPromptToLocalWindows(targetKey, prompt);
    if (result.ok) {
      result = { ok: true, machine: machineId, name: machine.name };
    }
    usedLocal = true;
  } else if (isLocalMachine(machine)) {
    const args = osascriptLines.flatMap((line) => ["-e", line]);
    const { error } = await execLocalMulti(args);
    result = error
      ? { ok: false, error: error.message }
      : { ok: true, machine: machineId, name: machine.name };
    usedLocal = true;
  } else {
    const remoteCmd = osascriptLines.map((line) => `-e '${line}'`).join(" ");

    function tryExec(useLocalNet) {
      const sshArgs = buildSshArgs(machine, useLocalNet);
      sshArgs.push(`osascript ${remoteCmd}`);
      return new Promise((resolve) => {
        execFile("ssh", sshArgs, { timeout: TIMEOUT_MS }, (error) => {
          if (error) {
            resolve({ ok: false, error: error.message });
          } else {
            resolve({ ok: true, machine: machineId, name: machine.name });
          }
        });
      });
    }

    result = await tryExec(false);
    if (!result.ok && deriveLocalHostname(machine)) {
      result = await tryExec(true);
      usedLocal = true;
    }
  }

  if (result.ok) {
    const captureId = `${machineId}-${Date.now()}`;
    result.captureId = captureId;

    // Start capture after delay (async) — stored in memory, no disk writes
    setTimeout(async () => {
      if (hasWindowsAutomationChannel(machine)) {
        const buf = await captureDesktopScreenshot(machine);
        if (buf) {
          imageBuffers.set(captureId, buf);
          captures.set(captureId, { type: "image", path: `/api/screenshots/${captureId}` });
        } else {
          const text = await captureTextFallback(machine);
          if (text) {
            captures.set(captureId, { type: "text", text });
          }
        }
      } else {
        const buf = await captureDesktopScreenshot(machine);
        if (buf) {
          imageBuffers.set(captureId, buf);
          captures.set(captureId, { type: "image", path: `/api/screenshots/${captureId}` });
        } else {
          const text = await captureTextFallback(machine) || await captureTerminalText(machine, usedLocal, appName);
          if (text) {
            captures.set(captureId, { type: "text", text });
          }
        }
      }

      // Prune old captures
      if (captures.size > 100) {
        const oldest = captures.keys().next().value;
        captures.delete(oldest);
      }
    }, CAPTURE_DELAY_MS);
  }

  return result;
}

function isReachable(machine) {
  return machineSnapshots.has(machine.id);
}

function listTerminalAppCandidates(preferredApp = "") {
  const trimmed = String(preferredApp || "").trim();
  const candidates = trimmed
    ? [trimmed, ...TERMINAL_APP_CANDIDATES.filter((app) => app !== trimmed)]
    : [...TERMINAL_APP_CANDIDATES];
  return [...new Set(candidates)];
}

function buildTerminalActivateScript(preferredApp = "") {
  const candidates = listTerminalAppCandidates(preferredApp);
  const checks = candidates
    .map((app) => `  if terminalApp is "" and exists process "${app}" then set terminalApp to "${app}"`)
    .join("\n");
  const activations = candidates
    .map((app, index) => `${index === 0 ? "if" : "else if"} terminalApp is "${app}" then
  tell application "${app}" to activate`)
    .join("\n");

  return `set terminalApp to ""
tell application "System Events"
${checks}
end tell
${activations}
else
  tell application "Terminal" to activate
end if`;
}

// Build the osascript command for approval based on target app
function buildApproveScript(targetKey, preferredTerminalApp = "") {
  if (targetKey === "claude") {
    // Claude: activa la app y envía Ctrl+Enter — macOS da foco al diálogo modal automáticamente
    return `tell application "Claude" to activate
delay 0.4
tell application "System Events" to key code 36 using control down`;
  }
  if (targetKey === "codex") {
    // Codex: send "2" + Enter to approve
    return `tell application "Codex" to activate
delay 0.3
tell application "System Events"
  keystroke "2"
  delay 0.2
  key code 36
end tell`;
  }
  if (targetKey === "terminal_codex") {
    return `${buildTerminalActivateScript(preferredTerminalApp)}
delay 0.3
tell application "System Events"
  keystroke "2"
  delay 0.2
  key code 36
end tell`;
  }
  // Terminal / Claude Code fallback
  return `${buildTerminalActivateScript(preferredTerminalApp)}
delay 0.3
tell application "System Events" to key code 36 using control down`;
}

function sendKeystroke(machine, useLocal, targetKey, preferredTerminalApp = "") {
  const normalizedTarget = TARGET_APPS[targetKey] ? targetKey : "terminal";
  const script = buildApproveScript(normalizedTarget, preferredTerminalApp);
  const windowsTarget =
    normalizedTarget === "terminal_codex" ? "codex" :
    normalizedTarget === "terminal_claude" ? "terminal" :
    normalizedTarget;

  // Local machine: run directly
  if (hasWindowsAutomationChannel(machine)) {
    return sendApproveToLocalWindows(windowsTarget).then((result) => ({
      machine: machine.name, id: machine.id, ok: result.ok, error: result.error
    }));
  }
  if (isLocalMachine(machine)) {
    return execLocal(script).then(({ error }) => ({
      machine: machine.name, id: machine.id, ok: !error, error: error?.message
    }));
  }

  return new Promise((resolve) => {
    const sshArgs = buildSshArgs(machine, useLocal);

    // Build remote osascript command from script lines
    const remoteCmd = script.split("\n").map((l) => `-e '${l.trim()}'`).join(" ");
    sshArgs.push(`osascript ${remoteCmd}`);

    execFile("ssh", sshArgs, { timeout: 8_000 }, (error) => {
      resolve({ machine: machine.name, id: machine.id, ok: !error, error: error?.message });
    });
  });
}

export async function approveAll(target) {
  const data = await readMachines();
  const targetKey = TARGET_APPS[target] ? target : "claude";

  // ONLY send to reachable (online) machines — skip offline immediately
  const automationEnabled = data.machines.filter((m) => isAutomationReady(m));
  const reachable = automationEnabled.filter((m) => hasWindowsAutomationChannel(m) || isReachable(m) || isLocalMachine(m));
  const unreachable = automationEnabled.filter((m) => !hasWindowsAutomationChannel(m) && !isReachable(m) && !isLocalMachine(m));

  const results = await Promise.allSettled(
    reachable.map(async (machine) => {
      // Try .local first (faster on LAN), then Tailscale
      if (deriveLocalHostname(machine) && !isLocalMachine(machine)) {
        const r = await sendKeystroke(machine, true, targetKey);
        if (r.ok) return r;
      }
      return sendKeystroke(machine, false, targetKey);
    })
  );

  const output = results.map((r) => r.value || { ok: false, error: "rejected" });

  // Add skipped offline machines (instant, no waiting)
  for (const m of unreachable) {
    output.push({ machine: m.name, id: m.id, ok: false, error: "offline", skipped: true });
  }

  // Trigger screenshot refresh for reachable machines (async, don't block)
  setTimeout(() => {
    Promise.allSettled(
      reachable.map((m) => captureOneSnapshot(m).then((snap) => {
        if (snap) {
          const existing = machineSnapshots.get(m.id) || {};
          machineSnapshots.set(m.id, mergeMachineSnapshot(existing, snap));
        }
      }))
    );
  }, 2000);

  return output;
}

export async function approveMachine(machineId, target) {
  const data = await readMachines();
  const machine = data.machines.find((m) => m.id === machineId);
  if (!machine || !isAutomationReady(machine)) {
    return { machine: machineId, ok: false, error: "No encontrada o automatizacion deshabilitada" };
  }

  // Check if machine is reachable before trying
  if (!hasWindowsAutomationChannel(machine) && !isReachable(machine) && !isLocalMachine(machine)) {
    return { machine: machine.name, id: machine.id, ok: false, error: "offline" };
  }

  const targetKey = TARGET_APPS[target] ? target : "claude";

  let result;
  // Try .local first (faster)
  if (deriveLocalHostname(machine) && !isLocalMachine(machine)) {
    result = await sendKeystroke(machine, true, targetKey);
    if (result.ok) {
      triggerPostApproveSnapshot(machine);
      return result;
    }
  }
  result = await sendKeystroke(machine, false, targetKey);

  if (result.ok) {
    triggerPostApproveSnapshot(machine);
  }

  return result;
}

// Capture a fresh snapshot 2s after approval for visual feedback
function triggerPostApproveSnapshot(machine) {
  setTimeout(async () => {
    const snap = await captureOneSnapshot(machine);
    if (snap) {
      const existing = machineSnapshots.get(machine.id) || {};
      machineSnapshots.set(machine.id, mergeMachineSnapshot(existing, snap));
    }
  }, 2000);
}

// Periodic snapshots of each machine's screen
const machineSnapshots = new Map();

export function getMachineSnapshot(machineId) {
  return machineSnapshots.get(machineId) || null;
}

export async function getReachableMachines() {
  const data = await readMachines();
  return data.machines.filter((m) => isAutomationReady(m) && (hasWindowsAutomationChannel(m) || isReachable(m) || isLocalMachine(m)));
}

export function getAllSnapshots() {
  const result = {};
  for (const [id, snap] of machineSnapshots) {
    result[id] = snap;
  }
  return result;
}

function hasVisualSnapshot(snap) {
  return Boolean(
    (snap?.type === "image" && snap.image) ||
    (snap?.type === "images" && Array.isArray(snap.images) && snap.images.length > 0)
  );
}

function hasSnapshotPayload(snap) {
  return hasVisualSnapshot(snap) || Boolean(snap?.text);
}

function mergeMachineSnapshot(existing, incoming, extra = {}) {
  const current = existing || {};
  const merged = { ...current, ...extra };

  if (!incoming) {
    return hasSnapshotPayload(current) ? merged : { ...merged };
  }

  if (hasVisualSnapshot(incoming)) {
    delete merged.text;
    if (incoming.type === "image") {
      delete merged.images;
      delete merged.orientations;
    }
    if (incoming.type === "images") {
      delete merged.image;
    }
    return { ...merged, ...incoming, updatedAt: new Date().toISOString() };
  }

  if (incoming.type === "text") {
    if (hasVisualSnapshot(current)) {
      return merged;
    }
    delete merged.image;
    delete merged.images;
    delete merged.orientations;
    return { ...merged, ...incoming, updatedAt: new Date().toISOString() };
  }

  return merged;
}

function isActiveDesktopApp(state) {
  return Boolean(state && state !== "no-window" && state !== "OFF");
}

function pickOnboardingTarget(machine) {
  const snapshot = machineSnapshots.get(machine.id);

  if (isActiveDesktopApp(snapshot?.codexState)) {
    return "codex";
  }

  if (isActiveDesktopApp(snapshot?.claudeState)) {
    return "claude";
  }

  return "terminal";
}

export async function sendOnboardingToAll(prompt) {
  const data = await readMachines();
  const automationEnabled = data.machines.filter((m) => isAutomationReady(m));
  const reachable = automationEnabled.filter((m) => hasWindowsAutomationChannel(m) || isReachable(m) || isLocalMachine(m));
  const unreachable = automationEnabled.filter((m) => !hasWindowsAutomationChannel(m) && !isReachable(m) && !isLocalMachine(m));

  const results = await Promise.allSettled(
    reachable.map(async (machine) => {
      const target = pickOnboardingTarget(machine);
      const result = await sendPromptToMachine(machine.id, prompt, target);
      return {
        ...result,
        id: machine.id,
        machine: machine.name,
        target
      };
    })
  );

  const output = results.map((entry, index) => {
    if (entry.status === "fulfilled") {
      return entry.value;
    }

    const machine = reachable[index];
    return {
      ok: false,
      id: machine?.id,
      machine: machine?.name || "unknown",
      target: machine ? pickOnboardingTarget(machine) : "terminal",
      error: entry.reason instanceof Error ? entry.reason.message : "rejected"
    };
  });

  for (const machine of unreachable) {
    output.push({
      ok: false,
      id: machine.id,
      machine: machine.name,
      target: null,
      error: "offline",
      skipped: true
    });
  }

  return output;
}

// Python/Quartz remote screenshot + sips resize to 960px
const PYTHON_CAPTURE_REMOTE = `cat > /tmp/tw_snap.py << 'PYEOF'
import Quartz.CoreGraphics as CG
from AppKit import NSBitmapImageRep, NSJPEGFileType
import sys
i = CG.CGWindowListCreateImage(CG.CGRectInfinite, CG.kCGWindowListOptionOnScreenOnly, CG.kCGNullWindowID, CG.kCGWindowImageDefault)
if i:
    r = NSBitmapImageRep.alloc().initWithCGImage_(i)
    d = r.representationUsingType_properties_(NSJPEGFileType, {})
    d.writeToFile_atomically_("/tmp/tw_screen.jpg", True)
else:
    sys.exit(1)
PYEOF
PYTHON_BIN=""
for candidate in python3 /opt/homebrew/bin/python3 /usr/local/bin/python3 /Library/Developer/CommandLineTools/usr/bin/python3; do
  if [ -x "$candidate" ]; then
    bin="$candidate"
  elif command -v "$candidate" >/dev/null 2>&1; then
    bin="$(command -v "$candidate")"
  else
    continue
  fi

  if "$bin" - <<'PYCHK' >/dev/null 2>&1
import Quartz.CoreGraphics as CG
from AppKit import NSBitmapImageRep, NSJPEGFileType
PYCHK
  then
    PYTHON_BIN="$bin"
    break
  fi
done

if [ -z "$PYTHON_BIN" ]; then
  rm -f /tmp/tw_snap.py
  exit 1
fi

"$PYTHON_BIN" /tmp/tw_snap.py 2>/dev/null && sips -Z 960 /tmp/tw_screen.jpg --out /tmp/tw_screen.jpg >/dev/null 2>&1`;

// Capture desktop screenshot for a machine, save locally
// Returns a Buffer with the screenshot, or null — no disk writes ever
async function captureDesktopScreenshot(machine) {
  if (isLocalMacMachine(machine)) {
    const preferredDisplay = isLocalMultiDisplayMachine(machine) ? 1 : null;
    return captureLocalMacScreenshot(preferredDisplay, machine.id);
  }
  if (isLocalWindowsMachine(machine)) {
    const tmpPath = join(tmpdir(), `tw_snap_${machine.id}_${Date.now()}.jpg`);
    const script = `
from PIL import ImageGrab
img = ImageGrab.grab(all_screens=True)
img = img.convert("RGB")
img.save(r"""${tmpPath}""", quality=72)
print("OK")
`.trim();
    const { error, stdout } = await execPython(WINDOWS_SCREENSHOT_PYTHON, script, 12_000);
    if (error || !stdout.includes("OK")) return null;
    try {
      return await readFile(tmpPath);
    } catch {
      return null;
    } finally {
      unlink(tmpPath).catch(() => {});
    }
  }

  // Remote: captura con Python/Quartz + base64 en el equipo remoto, decode aquí — sin SCP, sin disco local
  function attempt(useLocal) {
    return new Promise((resolve_) => {
      const sshArgs = buildSshArgs(machine, useLocal);
      sshArgs.push(
        PYTHON_CAPTURE_REMOTE +
        ` && base64 -i /tmp/tw_screen.jpg && rm -f /tmp/tw_screen.jpg`
      );
      execFile("ssh", sshArgs, { timeout: 20_000 }, (err, stdout) => {
        const b64 = stdout?.trim();
        if (err || !b64) return resolve_(null);
        try { resolve_(Buffer.from(b64, "base64")); } catch { resolve_(null); }
      });
    });
  }

  if (deriveLocalHostname(machine)) {
    const guiAgent = await captureFromRemoteGuiAgent(machine, true);
    if (guiAgent) return guiAgent;
    const r = await attempt(true);
    if (r) return r;
  }

  const guiAgent = await captureFromRemoteGuiAgent(machine, false);
  if (guiAgent) return guiAgent;
  return attempt(false);
}

// Fallback: get text description of frontmost app
async function captureTextFallback(machine) {
  const script = 'tell application "System Events"\nset frontApp to name of first process whose frontmost is true\ntry\nset winName to name of front window of first process whose frontmost is true\non error\nset winName to "sin ventana"\nend try\nreturn frontApp & " — " & winName\nend tell';

  if (isLocalWindowsMachine(machine)) {
    const winScript = `
Add-Type -AssemblyName System.Windows.Forms
if (-not ([System.Management.Automation.PSTypeName]'AdmiraNext.Win32').Type) {
  Add-Type -Namespace AdmiraNext -Name Win32 -MemberDefinition @"
    using System;
    using System.Runtime.InteropServices;
    using System.Text;
    public static class Win32 {
      [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
      [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    }
"@ | Out-Null
}
$hwnd = [AdmiraNext.Win32]::GetForegroundWindow()
$title = New-Object System.Text.StringBuilder 1024
[AdmiraNext.Win32]::GetWindowText($hwnd, $title, $title.Capacity) | Out-Null
[string]$title
`.trim();
    const { error, stdout } = await execWindows(winScript, 6_000);
    return error ? null : stdout?.trim() || null;
  }
  if (isLocalMachine(machine)) {
    const { error, stdout } = await execLocal(script);
    if (!error && stdout?.trim()) {
      return stdout.trim();
    }
    return "Local activo — sin sesion grafica";
  }

  const remoteCmd = `osascript -e 'tell application "System Events"' -e 'set frontApp to name of first process whose frontmost is true' -e 'try' -e 'set winName to name of front window of first process whose frontmost is true' -e 'on error' -e 'set winName to "sin ventana"' -e 'end try' -e 'return frontApp & " — " & winName' -e 'end tell'`;

  function attempt(useLocal) {
    return new Promise((resolve_) => {
      const sshArgs = buildSshArgs(machine, useLocal);
      sshArgs.push(remoteCmd);
      execFile("ssh", sshArgs, { timeout: 10_000 }, (error, stdout) => {
        resolve_(error ? null : stdout?.trim() || null);
      });
    });
  }

  function attemptReachableFallback(useLocal) {
    return new Promise((resolve_) => {
      const sshArgs = buildSshArgs(machine, useLocal);
      sshArgs.push("printf 'SSH activo — sin sesion grafica'");
      execFile("ssh", sshArgs, { timeout: 8_000 }, (error, stdout) => {
        resolve_(error ? null : stdout?.trim() || null);
      });
    });
  }

  if (deriveLocalHostname(machine)) {
    const r = await attempt(true);
    if (r) return r;
  }
  const remote = await attempt(false);
  if (remote) return remote;

  if (deriveLocalHostname(machine)) {
    const localReachable = await attemptReachableFallback(true);
    if (localReachable) return localReachable;
  }

  return attemptReachableFallback(false);
}

// Capture all 3 displays of local Mac Mini in visual order: left→center→right
// Displays: 2=Claude (portrait left), 1=Studio (landscape center), 3=Codex (portrait right)
const LOCAL_DISPLAYS = [
  { d: 2, key: "left",   orient: "portrait"  },  // Claude — ASUS izquierda
  { d: 1, key: "center", orient: "landscape" },  // Studio Display — centro
  { d: 3, key: "right",  orient: "portrait"  },  // Codex — ASUS derecha
];

function captureLocalMacScreenshot(displayId = null, imageKey = `local-${Date.now()}`) {
  const tmpPath = join(tmpdir(), `tw_snap_${imageKey}_${Date.now()}.jpg`);
  const args = ["asuser", String(process.getuid()), "screencapture"];
  if (displayId !== null && displayId !== undefined) {
    args.push("-D", String(displayId));
  }
  args.push("-x", "-t", "jpg", tmpPath);

  return new Promise((resolve_) => {
    execFile("launchctl", args, { timeout: 10_000 }, (err) => {
      if (err) return resolve_(null);
      execFile("sips", ["-Z", "960", tmpPath, "--out", tmpPath], { timeout: 5_000 }, async () => {
        try {
          resolve_(await readFile(tmpPath));
        } catch {
          resolve_(null);
        } finally {
          unlink(tmpPath).catch(() => {});
        }
      });
    });
  });
}

async function captureLocalAllDisplays(machine) {
  return Promise.all(LOCAL_DISPLAYS.map(({ d }) => new Promise((resolve_) => {
    captureLocalMacScreenshot(d, `${machine.id}_d${d}`).then(resolve_);
  })));
}

async function captureOneSnapshot(machine) {
  if (isLocalMacMachine(machine)) {
    if (isLocalMultiDisplayMachine(machine)) {
      const bufs = await captureLocalAllDisplays(machine);
      const images = [];
      const orientations = [];
      for (let i = 0; i < LOCAL_DISPLAYS.length; i++) {
        const { key, orient } = LOCAL_DISPLAYS[i];
        const imgKey = `${machine.id}-${key}`;
        if (bufs[i]) {
          imageBuffers.set(imgKey, bufs[i]);
          images.push(`/api/screenshots/${imgKey}`);
          orientations.push(orient);
        }
      }
      if (images.length > 0) return { type: "images", images, orientations };
    }

    const buf = await captureLocalMacScreenshot(null, machine.id);
    if (buf) {
      imageBuffers.set(machine.id, buf);
      return { type: "image", image: `/api/screenshots/${machine.id}` };
    }
    const text = await captureTextFallback(machine);
    return text ? { type: "text", text } : null;
  }
  if (isLocalWindowsMachine(machine)) {
    const buf = await captureDesktopScreenshot(machine);
    if (buf) {
      imageBuffers.set(machine.id, buf);
      return { type: "image", image: `/api/screenshots/${machine.id}` };
    }
    const text = await captureTextFallback(machine);
    return text ? { type: "text", text } : null;
  }

  // Remote: single display
  const buf = await captureDesktopScreenshot(machine);
  if (buf) {
    imageBuffers.set(machine.id, buf);
    return { type: "image", image: `/api/screenshots/${machine.id}` };
  }
  const text = await captureTextFallback(machine);
  return text ? { type: "text", text } : null;
}

export async function refreshAllSnapshots() {
  const data = await readMachines();
  // Try ALL SSH-enabled machines, not just cached-reachable
  const sshEnabled = data.machines.filter((m) => isAutomationReady(m));
  await Promise.allSettled(
    sshEnabled.map(async (machine) => {
      // Skip recently-failed machines (retry every 2 min)
      if (shouldSkipOffline(machine)) return;

      // Capture screenshot + app states in parallel
      const [snap, appsRaw] = await Promise.all([
        captureOneSnapshot(machine),
        captureAllAppsState(machine)
      ]);

      if (!snap && !appsRaw && !isLocalMachine(machine)) {
        markMachineFailed(machine.id);
        return; // offline
      }
      markMachineOnline(machine.id);

      const apps = parseAppsState(appsRaw);
      const existing = machineSnapshots.get(machine.id) || {};
      machineSnapshots.set(machine.id, mergeMachineSnapshot(existing, snap, {
        claudeState: apps.claude,
        codexState: apps.codex
      }));
    })
  );
}

// Start periodic refresh
refreshAllSnapshots();
setInterval(refreshAllSnapshots, 30_000);

export function resolveMachineName(machines, input) {
  const q = input.toLowerCase().replace(/[\s-_]+/g, "");
  return machines.find((m) => {
    const id = m.id.toLowerCase().replace(/[\s-_]+/g, "");
    const name = m.name.toLowerCase().replace(/[\s-_]+/g, "");
    return id.includes(q) || name.includes(q) || id.replace("admira", "").includes(q);
  }) || null;
}

// ─── WATCHDOG: Auto-approval system ───────────────────────────────────

const WATCHDOG_INTERVAL_MS = 15_000;

// Exact button names that mean "approve this tool use" in Claude Desktop
const CLAUDE_APPROVAL_EXACT = [
  "Allow", "Yes", "OK", "Run", "Execute", "Confirm", "Accept",
  "Permitir", "Aceptar", "Sí", "Continue", "Proceed"
];
// Claude Desktop tool-use buttons that start with action verbs
const CLAUDE_TOOL_BUTTON_VERBS = [
  "Ejecutó", "ejecutó", "Run", "Check", "Install", "Clone", "List", "Show",
  "Read", "Leyó", "leyó", "Write", "Create", "Delete", "Search", "Find",
  "archivo creado", "archivos", "comandos", "herramienta", "usó"
];
// UI-only buttons to IGNORE (not tool approvals)
const CLAUDE_IGNORE_BUTTONS = [
  "Aceptar ediciones", "Opus", "Claude", "Vista previa", "~/",
  "Sonnet", "Haiku", "contexto", "Close", "Minimize", "Zoom",
  "Cancel", "Cancelar", "Done", "Listo", "Cerrar"
];
// Codex CLI approval patterns (numbered options in terminal)
const CODEX_APPROVAL_PATTERNS = [
  /approve/i, /allow/i, /permitir/i, /deny/i, /negar/i, /y\/n/i, /\[y\]/i,
  /proceed/i, /continuar/i, /always/i, /once/i, /skip/i
];

const watchdogState = {
  enabled: false,
  perMachine: {},    // { [machineId]: { enabled, claudeCount, codexCount, currentSignals, lastDetection* } }
  intervalId: null,
  log: []            // last 50 auto-approvals for debugging
};

// Track last-fail times so we don't hammer offline machines continuously
const machineFailTimes = new Map(); // machineId → timestamp of last fail
const OFFLINE_RETRY_MS = 30_000;    // retry offline machines every 30s

function shouldSkipOffline(machine) {
  if (isLocalMachine(machine)) return false;
  const lastFail = machineFailTimes.get(machine.id);
  if (!lastFail) return false;
  return (Date.now() - lastFail) < OFFLINE_RETRY_MS;
}

function markMachineFailed(machineId) {
  machineFailTimes.set(machineId, Date.now());
}

function markMachineOnline(machineId) {
  machineFailTimes.delete(machineId);
}

function initMachineWatchdog(machineId) {
  if (!watchdogState.perMachine[machineId]) {
    watchdogState.perMachine[machineId] = {
      enabled: true,
      claudeCount: 0,
      codexCount: 0,
      lastApproval: null,
      lastTarget: null,
      lastSeenAt: null,
      currentSignals: [],
      lastDetectionAt: null,
      lastDetectionTarget: null,
      lastDetectionLabel: null,
      lastDetectionSource: null,
      lastDetectionSummary: null,
      lastDetectionStatus: null,
      lastResolutionAt: null
    };
  }
}

function buildWatchdogSignal(target, preferredTerminalApp = "") {
  switch (target) {
    case "claude":
      return {
        target,
        family: "claude",
        label: "Claude Desktop",
        source: "Claude",
        summary: "Claude Desktop"
      };
    case "codex":
      return {
        target,
        family: "codex",
        label: "Codex app",
        source: "Codex",
        summary: "Codex app"
      };
    case "terminal_claude":
      return {
        target,
        family: "claude",
        label: "Claude Code",
        source: preferredTerminalApp || "Terminal",
        summary: `Claude Code · ${preferredTerminalApp || "Terminal"}`
      };
    case "terminal_codex":
      return {
        target,
        family: "codex",
        label: "Codex CLI",
        source: preferredTerminalApp || "Terminal",
        summary: `Codex CLI · ${preferredTerminalApp || "Terminal"}`
      };
    default:
      return {
        target,
        family: "auto",
        label: target || "Aprobacion",
        source: preferredTerminalApp || "",
        summary: target || "Aprobacion"
      };
  }
}

function registerMachineSignal(mState, target, preferredTerminalApp = "") {
  const detectedAt = new Date().toISOString();
  const meta = buildWatchdogSignal(target, preferredTerminalApp);
  const signal = {
    ...meta,
    detectedAt,
    status: "pending",
    resolvedAt: null
  };

  mState.currentSignals.push(signal);
  mState.lastDetectionAt = detectedAt;
  mState.lastDetectionTarget = meta.target;
  mState.lastDetectionLabel = meta.label;
  mState.lastDetectionSource = meta.source;
  mState.lastDetectionSummary = meta.summary;
  mState.lastDetectionStatus = "pending";

  return signal;
}

function finalizeMachineSignal(mState, signal, status) {
  const resolvedAt = new Date().toISOString();
  if (signal) {
    signal.status = status;
    signal.resolvedAt = resolvedAt;
  }
  mState.lastDetectionStatus = status;
  mState.lastResolutionAt = resolvedAt;
}

const SKYNET_TARGETS = {
  claude: { appName: "Claude", stateKey: "claude", label: "Claude Code" },
  codex: { appName: "Codex", stateKey: "codex", label: "Codex" },
  opencode: { appName: "OpenCode", stateKey: "opencode", label: "OpenCode" }
};

function normalizeSkynetTarget(target = "claude") {
  const key = String(target || "claude").toLowerCase();
  return SKYNET_TARGETS[key] ? key : "claude";
}

// Check Claude, Codex and OpenCode status on a machine (not just frontmost app)
async function captureAllAppsState(machine) {
  const script = `set r to ""
tell application "System Events"
  if exists process "Claude" then
    set claudeTitle to "no-window"
    try
      set claudeTitle to name of front window of process "Claude"
    end try
    if claudeTitle is missing value or claudeTitle is "" then set claudeTitle to "no-window"
    set r to r & "CLAUDE:" & claudeTitle
  else
    set r to r & "CLAUDE:OFF"
  end if
  set r to r & "|||"
  if exists process "Codex" then
    set codexTitle to "no-window"
    try
      set codexTitle to name of front window of process "Codex"
    end try
    if codexTitle is missing value or codexTitle is "" then set codexTitle to "no-window"
    set r to r & "CODEX:" & codexTitle
  else
    set r to r & "CODEX:OFF"
  end if
  set r to r & "|||"
  if exists process "OpenCode" then
    set openCodeTitle to "no-window"
    try
      set openCodeTitle to name of front window of process "OpenCode"
    end try
    if openCodeTitle is missing value or openCodeTitle is "" then set openCodeTitle to "no-window"
    set r to r & "OPENCODE:" & openCodeTitle
  else
    set r to r & "OPENCODE:OFF"
  end if
end tell
return r`;

  if (isLocalWindowsMachine(machine)) {
    const script = `
$claude = Get-Process -Name "Claude" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -or $_.MainWindowTitle } | Select-Object -First 1
$codex = Get-Process -Name "Codex" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -or $_.MainWindowTitle } | Select-Object -First 1
$opencode = Get-Process -Name "OpenCode" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -or $_.MainWindowTitle } | Select-Object -First 1
$claudeTitle = if ($claude) { if ($claude.MainWindowTitle) { $claude.MainWindowTitle } else { "no-window" } } else { "OFF" }
$codexTitle = if ($codex) { if ($codex.MainWindowTitle) { $codex.MainWindowTitle } else { "no-window" } } else { "OFF" }
$opencodeTitle = if ($opencode) { if ($opencode.MainWindowTitle) { $opencode.MainWindowTitle } else { "no-window" } } else { "OFF" }
Write-Output ("CLAUDE:{0}|||CODEX:{1}|||OPENCODE:{2}" -f $claudeTitle, $codexTitle, $opencodeTitle)
`.trim();
    const { error, stdout } = await execWindows(script, 8_000);
    return error ? null : stdout?.trim() || null;
  }
  if (isLocalMachine(machine)) {
    const { error, stdout } = await execLocal(script, 8000);
    return error ? null : stdout?.trim() || null;
  }

  const lines = script.split("\n").map((l) => `-e '${l.trim()}'`).join(" ");
  const remoteCmd = `osascript ${lines}`;

  function attempt(useLocal) {
    return new Promise((resolve_) => {
      const sshArgs = buildSshArgs(machine, useLocal);
      sshArgs.push(remoteCmd);
      execFile("ssh", sshArgs, { timeout: 10_000 }, (error, stdout) => {
        resolve_(error ? null : stdout?.trim() || null);
      });
    });
  }

  if (deriveLocalHostname(machine) && !isLocalMachine(machine)) {
    const r = await attempt(true);
    if (r) return r;
  }
  return attempt(false);
}

// Parse "CLAUDE:windowTitle|||CODEX:windowTitle|||OPENCODE:windowTitle" into app states
function parseAppsState(raw) {
  if (!raw) return { claude: null, codex: null, opencode: null };
  const parts = raw.split("|||");
  const result = { claude: null, codex: null, opencode: null };
  for (const part of parts) {
    if (part.startsWith("CLAUDE:")) {
      const val = part.slice(7).trim();
      result.claude = val === "OFF" ? null : val;
    }
    if (part.startsWith("CODEX:")) {
      const val = part.slice(6).trim();
      result.codex = val === "OFF" ? null : val;
    }
    if (part.startsWith("OPENCODE:")) {
      const val = part.slice(9).trim();
      result.opencode = val === "OFF" ? null : val;
    }
  }
  return result;
}

function hasUsefulAppActivity(state) {
  const title = String(state || "").trim().toLowerCase();
  if (!title) return false;
  return !["off", "no-window", "sin ventana"].includes(title);
}

function buildOsaCommand(script) {
  return `osascript ${script
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `-e ${shellQuote(line)}`)
    .join(" ")}`;
}

async function runMacAutomationScript(machine, script, timeout = 12_000) {
  if (isLocalMachine(machine)) {
    const args = script
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => ["-e", line]);
    return execLocalMulti(args, timeout);
  }

  async function attempt(useLocal) {
    return execRemote(machine, useLocal, buildOsaCommand(script), timeout);
  }

  if (deriveLocalHostname(machine)) {
    const local = await attempt(true);
    if (!local.error) return local;
  }
  return attempt(false);
}

async function focusAppForSkynet(machine, rawTarget = "claude") {
  const target = normalizeSkynetTarget(rawTarget);
  const config = SKYNET_TARGETS[target];
  if (isLocalWindowsMachine(machine)) {
    const { error, stdout } = await execWindows(`
${buildWindowsAutomationPrelude(target)}
Write-Output "${target}-windows"
`.trim(), 10_000);
    return { ok: !error, action: "focused", target, detail: stdout || `${config.label} Windows`, error: error?.message || null };
  }

  if (isWindowsMachine(machine)) {
    return { ok: false, action: "unsupported", target, error: "Skynet remoto Windows aun no implementado" };
  }

  const allowFullscreen = !isLocalMultiDisplayMachine(machine);
  const script = `set skynetResult to "none"
tell application "System Events"
  if exists process "${config.appName}" then
    tell application "${config.appName}" to activate
    delay 0.6
    set skynetResult to "${target}-focused"
    try
      tell process "${config.appName}"
        if (count of windows) > 0 then
          ${allowFullscreen ? "try\n            set value of attribute \"AXFullScreen\" of front window to true\n          end try" : `set skynetResult to "${target}-focused-layout-preserved"`}
        end if
      end tell
    end try
    return skynetResult
  end if
end tell
try
  tell application "${config.appName}" to activate
  delay 1.0
  set skynetResult to "${target}-opened"
on error
  ${buildTerminalActivateScript("")}
  delay 0.6
  set skynetResult to "terminal-focused"
end try
return skynetResult`;

  const { error, stdout } = await runMacAutomationScript(machine, script, 16_000);
  return {
    ok: !error,
    action: stdout?.trim() || (error ? "focus-failed" : "focused"),
    target,
    error: error?.message || null
  };
}

async function captureSkynetEvidence(machine) {
  const captureId = `skynet-${machine.id}-${Date.now()}`;
  const snap = await captureOneSnapshot(machine);
  if (!snap) {
    const text = await captureTextFallback(machine);
    if (text) {
      captures.set(captureId, { type: "text", text });
      return { captureId, capture: { type: "text", text } };
    }
    return { captureId: null, capture: null };
  }

  if (snap.type === "image" && snap.image) {
    const imageKey = snap.image.split("/").pop();
    return { captureId: imageKey || captureId, capture: snap };
  }

  if (snap.type === "images" && Array.isArray(snap.images)) {
    return { captureId, capture: snap };
  }

  captures.set(captureId, snap);
  return { captureId, capture: snap };
}

export async function runSkynetAudit(rawTarget = "claude") {
  const target = normalizeSkynetTarget(rawTarget);
  const config = SKYNET_TARGETS[target];
  const data = await readMachines();
  const machines = (data.machines || []).filter((machine) => isAutomationReady(machine));
  const checkedAt = new Date().toISOString();

  const settled = await Promise.allSettled(
    machines.map(async (machine) => {
      const beforeRaw = await captureAllAppsState(machine);
      if (!beforeRaw && !isLocalMachine(machine)) {
        markMachineFailed(machine.id);
        return {
          id: machine.id,
          machine: machine.name || machine.id,
          ok: false,
          status: "offline",
          action: "unreachable",
          error: "No responde por automatizacion"
        };
      }

      markMachineOnline(machine.id);
      const before = parseAppsState(beforeRaw);
      const active = hasUsefulAppActivity(before[config.stateKey]);
      let focus = null;

      if (!active) {
        focus = await focusAppForSkynet(machine, target);
        await new Promise((resolve_) => setTimeout(resolve_, 1200));
      }

      const [afterRaw, evidence] = await Promise.all([
        captureAllAppsState(machine),
        captureSkynetEvidence(machine)
      ]);
      const after = parseAppsState(afterRaw);
      const mState = watchdogState.perMachine[machine.id] || {};
      watchdogState.perMachine[machine.id] = {
        ...mState,
        enabled: mState.enabled !== false,
        lastSeenAt: checkedAt,
        claudeState: after.claude,
        codexState: after.codex,
        opencodeState: after.opencode,
        lastSkynetAuditAt: checkedAt,
        lastSkynetAuditStatus: active ? "active" : (focus?.ok ? "captured-waiting" : "capture-attempted")
      };

      return {
        id: machine.id,
        machine: machine.name || machine.id,
        ok: true,
        status: active ? "active" : "waiting-captured",
        action: active ? "observed" : (focus?.action || "capture-attempted"),
        claudeBefore: before.claude,
        claudeAfter: after.claude,
        codexBefore: before.codex,
        codexAfter: after.codex,
        opencodeBefore: before.opencode,
        opencodeAfter: after.opencode,
        auditedTarget: target,
        auditedStateBefore: before[config.stateKey],
        auditedStateAfter: after[config.stateKey],
        captureId: evidence.captureId,
        capture: evidence.capture,
        error: focus?.error || null
      };
    })
  );

  const results = settled.map((entry, index) => {
    if (entry.status === "fulfilled") return entry.value;
    const machine = machines[index];
    return {
      id: machine?.id || "unknown",
      machine: machine?.name || machine?.id || "unknown",
      ok: false,
      status: "error",
      action: "failed",
      error: entry.reason instanceof Error ? entry.reason.message : "skynet rejected"
    };
  });

  watchdogState.log.push({
    machine: "Skynet",
    machineId: "all",
    target,
    summary: `Auditoria ${config.label}: ${results.filter((r) => r.ok).length}/${results.length} equipos`,
    status: "audited",
    at: checkedAt
  });
  if (watchdogState.log.length > 50) watchdogState.log.shift();

  return { checkedAt, results };
}

export function runSkynetClaudeAudit() {
  return runSkynetAudit("claude");
}

// Play a notification sound locally (always on Mac Mini, regardless of which machine triggered)
function playApprovalSound(target = "claude") {
  const soundKind = normalizeApprovalSoundKind(target);
  if (IS_WINDOWS) {
    const command = soundKind === "codex"
      ? "[console]::beep(988,70); Start-Sleep -Milliseconds 16; [console]::beep(1480,76); Start-Sleep -Milliseconds 14; [console]::beep(1976,124)"
      : "[console]::beep(1319,70); Start-Sleep -Milliseconds 18; [console]::beep(1661,82); Start-Sleep -Milliseconds 16; [console]::beep(2093,118)";
    execWindows(command, 2500).catch?.(() => {});
    return;
  }
  ensureApprovalSoundPath(soundKind)
    .then((soundPath) => {
      if (!soundPath) {
        execFile("afplay", ["/System/Library/Sounds/Glass.aiff"], { timeout: 5000 }, () => {});
        return;
      }
      execFile("afplay", [soundPath], { timeout: 5000 }, () => {});
    })
    .catch(() => {
      execFile("afplay", ["/System/Library/Sounds/Glass.aiff"], { timeout: 5000 }, () => {});
    });
}

// Scan Claude Desktop for tool-approval buttons.
// Phase 1: fast direct scan (window/group/sheet) — covers native dialogs.
// Phase 2: WebArea scan — covers Electron webview buttons (where Claude Code approvals live).
async function detectClaudeApprovalButtons(machine) {
  if (isLocalWindowsMachine(machine)) {
    return "";
  }
  const script = `tell application "System Events"
  if not (exists process "Claude") then return ""
  tell process "Claude"
    set r to ""
    set foundApproval to false
    try
      repeat with w in every window
        try
          -- Phase 1: direct window/group/sheet buttons (fast, <500ms)
          repeat with b in (every button of w)
            try
              set n to name of b
              if n is not missing value and n is not "" then
                set r to r & n & "|"
                if n is in {"Allow", "Yes", "OK", "Run", "Confirm", "Permitir", "Aceptar"} then set foundApproval to true
              end if
            end try
          end repeat
          repeat with g in (every group of w)
            repeat with b in (every button of g)
              try
                set n to name of b
                if n is not missing value and n is not "" then
                  set r to r & n & "|"
                  if n is in {"Allow", "Yes", "OK", "Run", "Confirm", "Permitir", "Aceptar"} then set foundApproval to true
                end if
              end try
            end repeat
          end repeat
          repeat with s in (every sheet of w)
            repeat with b in (every button of s)
              try
                set n to name of b
                if n is not missing value and n is not "" then
                  set r to r & n & "|"
                  if n is in {"Allow", "Yes", "OK", "Run", "Confirm", "Permitir", "Aceptar"} then set foundApproval to true
                end if
              end try
            end repeat
            repeat with g in (every group of s)
              repeat with b in (every button of g)
                try
                  set n to name of b
                  if n is not missing value and n is not "" then set r to r & n & "|"
                end try
              end repeat
            end repeat
          end repeat
          -- Phase 2: WebArea scan (Electron webview) — only if Phase 1 found nothing
          if not foundApproval then
            repeat with wa in (every UI element of w whose role is "AXWebArea")
              try
                set waElems to entire contents of wa
                repeat with e in waElems
                  try
                    if role of e is "AXButton" then
                      set n to name of e
                      if n is not missing value and n is not "" then set r to r & n & "|"
                    end if
                  end try
                end repeat
              end try
            end repeat
          end if
        end try
      end repeat
    end try
    return r
  end tell
end tell`;

  if (isLocalMachine(machine)) {
    // Phase 1 fast scan: 5s. Phase 2 WebArea scan: up to 25s total.
    const { error, stdout } = await execLocal(script, 25000);
    return error ? "" : stdout?.trim() || "";
  }

  // Remote machines: send the script over SSH (WebArea scan included)
  const lines = script.split("\n").map((l) => `-e '${l.trim()}'`).join(" ");
  function attempt(useLocal) {
    return new Promise((resolve_) => {
      const sshArgs = buildSshArgs(machine, useLocal);
      sshArgs.push(`osascript ${lines}`);
      execFile("ssh", sshArgs, { timeout: 28_000 }, (error, stdout) => {
        resolve_(error ? "" : stdout?.trim() || "");
      });
    });
  }

  if (deriveLocalHostname(machine) && !isLocalMachine(machine)) {
    const r = await attempt(true);
    if (r) return r;
  }
  return attempt(false);
}

// Check if any button text indicates a pending tool approval
function hasClaudeToolApproval(buttonsStr) {
  if (!buttonsStr) return false;
  const buttons = buttonsStr.split("|").map((b) => b.trim()).filter(Boolean);
  for (const btn of buttons) {
    if (CLAUDE_IGNORE_BUTTONS.some((ign) => btn.toLowerCase().includes(ign.toLowerCase()))) continue;
    // Exact match for known approval buttons (e.g. "Allow", "Yes")
    if (CLAUDE_APPROVAL_EXACT.some((a) => btn.toLowerCase() === a.toLowerCase())) return true;
    // Verb match for tool-description buttons
    if (CLAUDE_TOOL_BUTTON_VERBS.some((verb) => btn.includes(verb))) return true;
  }
  return false;
}

// Read text content of the Codex app to detect numbered approval prompts
async function detectCodexApproval(machine) {
  if (isLocalWindowsMachine(machine)) {
    return "";
  }
  const script = `tell application "System Events"
  if not (exists process "Codex") then return ""
  tell process "Codex"
    set r to ""
    try
      set fw to front window
      repeat with ta in (every text area of fw)
        try
          set v to value of ta
          if v is not missing value then set r to r & v & "\n"
        end try
      end repeat
      repeat with sa in (every scroll area of fw)
        try
          repeat with ta in (every text area of sa)
            try
              set v to value of ta
              if v is not missing value then set r to r & v & "\n"
            end try
          end repeat
        end try
      end repeat
    end try
    return r
  end tell
end tell`;

  if (isLocalMachine(machine)) {
    const { error, stdout } = await execLocal(script, 8000);
    return error ? "" : stdout?.trim() || "";
  }

  const lines = script.split("\n").map((l) => `-e '${l.trim()}'`).join(" ");
  function attempt(useLocal) {
    return new Promise((resolve_) => {
      const sshArgs = buildSshArgs(machine, useLocal);
      sshArgs.push(`osascript ${lines}`);
      execFile("ssh", sshArgs, { timeout: 10_000 }, (error, stdout) => {
        resolve_(error ? "" : stdout?.trim() || "");
      });
    });
  }

  if (deriveLocalHostname(machine) && !isLocalMachine(machine)) {
    const r = await attempt(true);
    if (r) return r;
  }
  return attempt(false);
}

function hasCodexApproval(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  // Codex CLI shows numbered options: "1)" + approval keywords
  const hasNumbers = /\b[123][).]\s/m.test(text);
  const hasApproval = CODEX_APPROVAL_PATTERNS.some((re) => re.test(lower));
  return hasNumbers && hasApproval;
}

function extractPendingTerminalApp(termResult, prefix) {
  if (!termResult) return "";
  const tokens = termResult.split("|").map((token) => token.trim()).filter(Boolean);
  const hit = tokens.find((token) => token.startsWith(`${prefix}:`));
  return hit ? hit.slice(prefix.length + 1).trim() : "";
}

// Detect approval prompts by reading terminal content on a remote/local machine
async function detectTerminalApproval(machine) {
  if (isLocalWindowsMachine(machine)) {
    return "";
  }
  // Read recent content from Terminal/iTerm2 tabs to find approval prompts
  const script = `
set result to ""
if application "Terminal" is running then
  tell application "Terminal"
    repeat with w in every window
      repeat with t in every tab of w
        try
          set c to contents of t
          set cLen to length of c
          if cLen > 1200 then
            set c to text (cLen - 1199) thru cLen of c
          end if
          if c contains "Do you want to proceed?" or c contains "Allow" or c contains "allow this" or c contains "Tool Use" or c contains "wants to" or c contains "Approve" or c contains "approve" or c contains "Y/n" or c contains "y/N" or c contains "Accept" or c contains "permit" or c contains "Always allow" or c contains "Allow once" or c contains "Run command" then
            set result to result & "CLAUDE_TERM:Terminal|"
          end if
          if (c contains "1)" or c contains "1.") and (c contains "2)" or c contains "2.") and (c contains "approve" or c contains "Allow" or c contains "always" or c contains "deny" or c contains "Deny" or c contains "Skip" or c contains "skip" or c contains "Proceed") then
            set result to result & "CODEX_TERM:Terminal|"
          end if
        end try
      end repeat
    end repeat
  end tell
end if
if application "iTerm2" is running then
  tell application "iTerm2"
    repeat with w in every window
      repeat with t in every tab of w
        repeat with s in every session of t
          try
            set c to contents of s
            set cLen to length of c
            if cLen > 1200 then
              set c to text (cLen - 1199) thru cLen of c
            end if
            if c contains "Do you want to proceed?" or c contains "Allow" or c contains "allow this" or c contains "Tool Use" or c contains "wants to" or c contains "Approve" or c contains "approve" or c contains "Y/n" or c contains "y/N" or c contains "Accept" or c contains "permit" or c contains "Always allow" or c contains "Allow once" or c contains "Run command" then
              set result to result & "CLAUDE_TERM:iTerm2|"
            end if
            if (c contains "1)" or c contains "1.") and (c contains "2)" or c contains "2.") and (c contains "approve" or c contains "Allow" or c contains "always" or c contains "deny" or c contains "Deny" or c contains "Skip" or c contains "skip" or c contains "Proceed") then
              set result to result & "CODEX_TERM:iTerm2|"
            end if
          end try
        end repeat
      end repeat
    end repeat
  end tell
end if
return result`;

  if (isLocalMachine(machine)) {
    const { error, stdout } = await execLocal(script, 10000);
    return error ? "" : stdout?.trim() || "";
  }

  const lines = script.split("\n").map((l) => `-e '${l.trim()}'`).filter(l => l !== "-e ''").join(" ");
  function attempt(useLocal) {
    return new Promise((resolve_) => {
      const sshArgs = buildSshArgs(machine, useLocal);
      sshArgs.push(`osascript ${lines}`);
      execFile("ssh", sshArgs, { timeout: 12_000 }, (error, stdout) => {
        resolve_(error ? "" : stdout?.trim() || "");
      });
    });
  }

  if (deriveLocalHostname(machine) && !isLocalMachine(machine)) {
    const r = await attempt(true);
    if (r) return r;
  }
  return attempt(false);
}

async function watchdogCheck() {
  if (!watchdogState.enabled) return;

  const data = await readMachines();
  // Try ALL SSH-enabled machines — not just cached-reachable ones.
  // When an offline machine comes back, we'll detect it and start monitoring.
  const machines = data.machines.filter((m) => isAutomationReady(m));

  await Promise.allSettled(
    machines.map(async (machine) => {
      initMachineWatchdog(machine.id);
      const mState = watchdogState.perMachine[machine.id];
      if (!mState.enabled) return;

      // Skip recently-failed (offline) machines to avoid blocking the cycle
      if (shouldSkipOffline(machine)) return;

      // Check GUI app states (window titles)
      const raw = await captureAllAppsState(machine);
      if (!raw && !isLocalMachine(machine)) {
        mState.currentSignals = [];
        markMachineFailed(machine.id);
        return; // machine unreachable, skip rest
      }
      markMachineOnline(machine.id); // machine responded!
      mState.lastSeenAt = new Date().toISOString();
      mState.currentSignals = [];
      const apps = parseAppsState(raw);
      mState.claudeState = apps.claude;
      mState.codexState = apps.codex;

      let claudeApproved = false;
      let codexApproved = false;

      // --- CLAUDE DESKTOP DETECTION ---
      if (apps.claude !== null) {
        const buttonsStr = await detectClaudeApprovalButtons(machine);
        mState.claudeButtons = buttonsStr;
        if (hasClaudeToolApproval(buttonsStr)) {
          const signal = registerMachineSignal(mState, "claude");
          playApprovalSound("claude");
          const approval = await autoApprove(machine, "claude", mState);
          finalizeMachineSignal(mState, signal, approval.ok ? "auto-approved" : approval.skipped ? "cooldown" : "pending");
          claudeApproved = true;
        }
      }

      // --- CODEX DETECTION ---
      if (apps.codex !== null) {
        // 1. Check window title (fast, catches obvious cases)
        const codexTitle = (apps.codex || "").toLowerCase();
        const titleHasApproval = ["approve", "aprobar", "confirm", "confirmar",
          "accept", "aceptar", "permission", "permiso", "waiting", "esperando",
          "y/n", "allow", "permitir"].some((kw) => codexTitle.includes(kw));
        if (titleHasApproval) {
          const signal = registerMachineSignal(mState, "codex");
          playApprovalSound("codex");
          const approval = await autoApprove(machine, "codex", mState);
          finalizeMachineSignal(mState, signal, approval.ok ? "auto-approved" : approval.skipped ? "cooldown" : "pending");
          codexApproved = true;
        } else {
          // 2. Read Codex app text content for numbered approval options
          const codexText = await detectCodexApproval(machine);
          if (hasCodexApproval(codexText)) {
            const signal = registerMachineSignal(mState, "codex");
            playApprovalSound("codex");
            const approval = await autoApprove(machine, "codex", mState);
            finalizeMachineSignal(mState, signal, approval.ok ? "auto-approved" : approval.skipped ? "cooldown" : "pending");
            codexApproved = true;
          }
        }
      }

      // --- TERMINAL DETECTION (Claude Code CLI / Codex CLI) ---
      // Only check Terminal if we haven't already approved via Desktop apps
      if (!claudeApproved || !codexApproved) {
        const termResult = await detectTerminalApproval(machine);
        mState.terminalState = termResult; // debug
        const claudeTerminalApp = !claudeApproved ? extractPendingTerminalApp(termResult, "CLAUDE_TERM") : "";
        const codexTerminalApp = !codexApproved ? extractPendingTerminalApp(termResult, "CODEX_TERM") : "";
        if (!claudeApproved && claudeTerminalApp) {
          const signal = registerMachineSignal(mState, "terminal_claude", claudeTerminalApp);
          playApprovalSound("terminal_claude");
          const approval = await autoApprove(machine, "terminal_claude", mState, claudeTerminalApp);
          finalizeMachineSignal(mState, signal, approval.ok ? "auto-approved" : approval.skipped ? "cooldown" : "pending");
        }
        if (!codexApproved && codexTerminalApp) {
          const signal = registerMachineSignal(mState, "terminal_codex", codexTerminalApp);
          playApprovalSound("terminal_codex");
          const approval = await autoApprove(machine, "terminal_codex", mState, codexTerminalApp);
          finalizeMachineSignal(mState, signal, approval.ok ? "auto-approved" : approval.skipped ? "cooldown" : "pending");
        }
      }
    })
  );
}

const lastApprovalTimes = new Map(); // `${machineId}:${target}` → timestamp
const APPROVAL_COOLDOWN_MS = 12_000; // don't re-approve same target within 12s

async function autoApprove(machine, target, mState, preferredTerminalApp = "") {
  // Cooldown: avoid double-approving while dialog is still clearing
  const cooldownKey = `${machine.id}:${target}`;
  const lastTime = lastApprovalTimes.get(cooldownKey) || 0;
  if (Date.now() - lastTime < APPROVAL_COOLDOWN_MS) {
    return { ok: false, skipped: true, reason: "cooldown" };
  }
  lastApprovalTimes.set(cooldownKey, Date.now());

  const effectiveTarget = TARGET_APPS[target] ? target : (target === "terminal_claude" ? "terminal" : target);
  let result;
  if (deriveLocalHostname(machine) && !isLocalMachine(machine)) {
    result = await sendKeystroke(machine, true, effectiveTarget, preferredTerminalApp);
    if (!result.ok) result = await sendKeystroke(machine, false, effectiveTarget, preferredTerminalApp);
  } else {
    result = await sendKeystroke(machine, false, effectiveTarget, preferredTerminalApp);
  }

  const signalMeta = buildWatchdogSignal(target, preferredTerminalApp);
  const logAt = new Date().toISOString();

  if (result.ok) {
    if (target === "claude" || target === "terminal_claude") mState.claudeCount++;
    else if (target === "codex" || target === "terminal_codex") mState.codexCount++;
    mState.lastApproval = logAt;
    mState.lastTarget = target;

    watchdogState.log.push({
      machine: machine.name,
      machineId: machine.id,
      target,
      summary: signalMeta.summary,
      status: "auto-approved",
      at: mState.lastApproval
    });
    if (watchdogState.log.length > 50) watchdogState.log.shift();

    triggerPostApproveSnapshot(machine);
    return { ok: true, skipped: false };
  }

  watchdogState.log.push({
    machine: machine.name,
    machineId: machine.id,
    target,
    summary: signalMeta.summary,
    status: "pending",
    at: logAt,
    error: result.error || null
  });
  if (watchdogState.log.length > 50) watchdogState.log.shift();

  return { ok: false, skipped: false, error: result.error || null };
}

export function startWatchdog() {
  if (watchdogState.intervalId) return;
  watchdogState.enabled = true;
  watchdogState.intervalId = setInterval(watchdogCheck, WATCHDOG_INTERVAL_MS);
  // Run immediately
  watchdogCheck();
}

export function stopWatchdog() {
  watchdogState.enabled = false;
  if (watchdogState.intervalId) {
    clearInterval(watchdogState.intervalId);
    watchdogState.intervalId = null;
  }
}

export function setWatchdogEnabled(enabled) {
  if (enabled) startWatchdog();
  else stopWatchdog();
}

export function setMachineWatchdog(machineId, enabled) {
  initMachineWatchdog(machineId);
  watchdogState.perMachine[machineId].enabled = enabled;
}

export function getWatchdogState() {
  return {
    enabled: watchdogState.enabled,
    perMachine: watchdogState.perMachine,
    log: watchdogState.log.slice(-20)
  };
}
