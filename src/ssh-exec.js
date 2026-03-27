import { execFile } from "node:child_process";
import { readMachines } from "./store.js";

const TIMEOUT_MS = 15_000;
const CAPTURE_DELAY_MS = 3000;

function sanitizePrompt(text) {
  return text
    .replace(/[\r\n]+/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .slice(0, 2000);
}

function deriveLocalHostname(machine) {
  const host = machine.ssh.host || "";
  const dot = host.indexOf(".");
  if (dot > 0) {
    return host.slice(0, dot) + ".local";
  }
  return null;
}

function buildSshArgs(machine, useLocal) {
  const args = ["-o", "ConnectTimeout=5", "-o", "BatchMode=yes"];

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

function captureTerminalText(machine, useLocal) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const sshArgs = buildSshArgs(machine, useLocal);
      sshArgs.push(`osascript -e 'tell application "Terminal" to get contents of front window'`);

      execFile("ssh", sshArgs, { timeout: TIMEOUT_MS }, (error, stdout) => {
        if (error) {
          resolve(null);
        } else {
          const lines = stdout.trim().split("\n");
          const last30 = lines.slice(-30).join("\n");
          resolve(last30);
        }
      });
    }, CAPTURE_DELAY_MS);
  });
}

// In-memory store for terminal captures, keyed by entry id
const terminalCaptures = new Map();

export function getTerminalCapture(entryId) {
  return terminalCaptures.get(entryId) || null;
}

export async function sendPromptToMachine(machineId, prompt) {
  const data = await readMachines();
  const machine = data.machines.find((m) => m.id === machineId);

  if (!machine) {
    return { ok: false, error: `Máquina '${machineId}' no encontrada` };
  }

  if (!machine.ssh?.enabled) {
    return { ok: false, error: `SSH no habilitado en '${machine.name}'` };
  }

  const safe = sanitizePrompt(prompt);
  const osascript = [
    'tell application "Terminal" to activate',
    `tell application "System Events" to keystroke "${safe}"`,
    'tell application "System Events" to keystroke return'
  ];
  const remoteCmd = osascript.map((line) => `-e '${line}'`).join(" ");

  function tryExec(useLocal) {
    const sshArgs = buildSshArgs(machine, useLocal);
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

  // Try Tailscale first, fallback to .local
  let result = await tryExec(false);
  let usedLocal = false;
  if (!result.ok && deriveLocalHostname(machine)) {
    result = await tryExec(true);
    usedLocal = true;
  }

  // Capture Terminal text after delay (async, doesn't block response)
  if (result.ok) {
    result.captureStatus = "capturing";
    const captureId = `${machineId}-${Date.now()}`;
    result.captureId = captureId;

    captureTerminalText(machine, usedLocal).then((text) => {
      if (text) {
        terminalCaptures.set(captureId, text);
        // Keep max 100 captures
        if (terminalCaptures.size > 100) {
          const oldest = terminalCaptures.keys().next().value;
          terminalCaptures.delete(oldest);
        }
      }
    });
  }

  return result;
}

export function resolveMachineName(machines, input) {
  const q = input.toLowerCase().replace(/[\s-_]+/g, "");
  return machines.find((m) => {
    const id = m.id.toLowerCase().replace(/[\s-_]+/g, "");
    const name = m.name.toLowerCase().replace(/[\s-_]+/g, "");
    return id.includes(q) || name.includes(q) || id.replace("admira", "").includes(q);
  }) || null;
}
