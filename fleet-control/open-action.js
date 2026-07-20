'use strict';

// Parser y generadores de comandos para la acción «abrir app» de FleetControl.
// El operador escribe una sola línea, por ejemplo:
//   Firefox www.marca.com
//   "Google Chrome" https://www.admira.live
// Sin URL se conserva el comportamiento histórico: abrir únicamente la app.

const BROWSERS = [
  {
    id: 'firefox',
    aliases: ['firefox', 'mozilla firefox'],
    mac: 'Firefox',
    linux: ['firefox'],
    windows: 'firefox.exe',
    kiosk: ['--kiosk']
  },
  {
    id: 'chrome',
    aliases: ['chrome', 'google chrome', 'google-chrome', 'google chrome canary'],
    mac: 'Google Chrome',
    linux: ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'],
    windows: 'chrome.exe',
    kiosk: ['--kiosk', '--no-first-run']
  },
  {
    id: 'safari',
    aliases: ['safari'],
    mac: 'Safari',
    linux: ['safari'],
    windows: 'safari.exe',
    kiosk: []
  },
  {
    id: 'edge',
    aliases: ['edge', 'microsoft edge', 'microsoft-edge'],
    mac: 'Microsoft Edge',
    linux: ['microsoft-edge', 'microsoft-edge-stable'],
    windows: 'msedge.exe',
    kiosk: ['--kiosk', '--no-first-run']
  },
  {
    id: 'brave',
    aliases: ['brave', 'brave browser', 'brave-browser'],
    mac: 'Brave Browser',
    linux: ['brave-browser', 'brave'],
    windows: 'brave.exe',
    kiosk: ['--kiosk', '--no-first-run']
  },
  {
    id: 'chromium',
    aliases: ['chromium', 'chromium browser', 'chromium-browser'],
    mac: 'Chromium',
    linux: ['chromium', 'chromium-browser'],
    windows: 'chromium.exe',
    kiosk: ['--kiosk', '--no-first-run']
  },
  {
    id: 'opera',
    aliases: ['opera', 'opera browser'],
    mac: 'Opera',
    linux: ['opera'],
    windows: 'opera.exe',
    kiosk: ['--kiosk']
  }
];

function sh(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

function ps(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function cleanAppName(value) {
  let app = String(value || '').trim();
  if ((app.startsWith('"') && app.endsWith('"')) || (app.startsWith("'") && app.endsWith("'"))) {
    app = app.slice(1, -1).trim();
  }
  if (!app) return '';
  if (app.length > 160 || /[\0\r\n]/.test(app)) throw new Error('nombre de aplicación no válido');
  return app;
}

function browserFor(app) {
  const key = String(app || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return BROWSERS.find(browser => browser.aliases.includes(key)) || null;
}

function normalizeWebUrl(value) {
  let raw = String(value || '').trim();
  if (!raw || /\s/.test(raw)) throw new Error('la URL no puede contener espacios');
  if (/^www\./i.test(raw) || /^[a-z0-9](?:[a-z0-9-]*\.)+[a-z]{2,}(?=[:/?#]|$)/i.test(raw)) raw = 'https://' + raw;
  else if (/^localhost(?=[:/?#]|$)/i.test(raw)) raw = 'http://' + raw;

  let parsed;
  try { parsed = new URL(raw); } catch (e) { throw new Error('URL no válida'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('solo se admiten URLs http o https');
  return parsed.href;
}

function parseOpenRequest(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('indica una aplicación');
  if (raw.length > 2200 || /[\0\r\n]/.test(raw)) throw new Error('solicitud demasiado larga');

  // La URL comienza tras un espacio o al principio. El dominio sin protocolo
  // también es válido: marca.com y www.marca.com se normalizan a https://.
  const urlStart = /(^|\s)(https?:\/\/|www\.|localhost(?=[:/?#]|$)|[a-z0-9](?:[a-z0-9-]*\.)+[a-z]{2,}(?=[:/?#\s]|$))/i.exec(raw);
  let appPart = raw;
  let url = '';
  if (urlStart) {
    const start = urlStart.index + urlStart[1].length;
    appPart = raw.slice(0, start).trim();
    url = normalizeWebUrl(raw.slice(start).trim());
  }

  const enteredApp = cleanAppName(appPart);
  const browser = browserFor(enteredApp);
  return {
    app: enteredApp,
    url,
    browser,
    fullscreen: !!url
  };
}

function macOpenCommand(input) {
  const request = parseOpenRequest(input);
  const app = request.browser ? request.browser.mac : request.app;
  const label = app || 'navegador predeterminado';
  const launch = app
    ? 'open -a ' + sh(app) + (request.url ? ' ' + sh(request.url) : '')
    : 'open ' + sh(request.url);

  if (!request.fullscreen) return launch + ' && echo ' + sh('abierto: ' + label);

  // Firefox acepta a veces `AXFullScreen=true` sin aplicarlo. La ruta fiable es
  // leer el estado y usar Ctrl+Cmd+F únicamente cuando vale false. Si la ventana
  // desaparece de AX durante el cambio de Space, se considera una transición
  // fullscreen y nunca se envía un segundo toggle.
  const osa = [
    'tell application "System Events"',
    'set frontProcess to first application process whose frontmost is true',
    'set frontmost of frontProcess to true',
    'try',
    'set isFull to value of attribute "AXFullScreen" of front window of frontProcess',
    'on error',
    'return "fullscreen-transition"',
    'end try',
    'if isFull is false then',
    'keystroke "f" using {control down, command down}',
    'return "fullscreen-requested"',
    'end if',
    'return "fullscreen"',
    'end tell'
  ].map(line => '-e ' + sh(line)).join(' ');
  const ok = 'abierto: ' + label + ' → ' + request.url + ' · pantalla completa';
  const warn = 'abierto: ' + label + ' → ' + request.url + ' · ⚠️ no se pudo confirmar pantalla completa';
  // El AX de Firefox puede bloquearse mientras macOS mueve la ventana a otro
  // Space. El sondeo corre en background con techo de 10 s para no consumir el
  // timeout completo de /api/action ni dejar una llamada colgada.
  return launch + ' || exit $?; sleep 2; ' +
    'OPEN_OSA_RC=124; osascript ' + osa + ' >/dev/null 2>&1 & OPEN_OSA_PID=$!; OPEN_OSA_I=0; ' +
    'while kill -0 "$OPEN_OSA_PID" >/dev/null 2>&1 && [ "$OPEN_OSA_I" -lt 20 ]; do sleep 0.5; OPEN_OSA_I=$((OPEN_OSA_I+1)); done; ' +
    'if kill -0 "$OPEN_OSA_PID" >/dev/null 2>&1; then kill "$OPEN_OSA_PID" >/dev/null 2>&1 || true; wait "$OPEN_OSA_PID" 2>/dev/null || true; ' +
    'else wait "$OPEN_OSA_PID"; OPEN_OSA_RC=$?; fi; ' +
    'if [ "$OPEN_OSA_RC" -eq 0 ]; then echo ' + sh(ok) + '; else echo ' + sh(warn) + '; fi';
}

function linuxOpenCommand(input, guiPrefix) {
  const request = parseOpenRequest(input);
  const prefix = guiPrefix || '';

  if (!request.app && request.url) {
    return prefix + 'xdg-open ' + sh(request.url) + ' >/dev/null 2>&1 & sleep 2; ' +
      'wmctrl -r :ACTIVE: -b add,fullscreen >/dev/null 2>&1 || true; echo ' +
      sh('abierto: navegador predeterminado → ' + request.url + ' · pantalla completa solicitada');
  }

  const candidates = request.browser ? request.browser.linux : [request.app];
  const candidateList = candidates.map(sh).join(' ');
  const choose = 'APP=""; for C in ' + candidateList + '; do command -v "$C" >/dev/null 2>&1 && { APP="$C"; break; }; done; ' +
    '[ -n "$APP" ] || { echo ' + sh('aplicación no instalada: ' + request.app) + '; exit 127; }; ';
  const args = request.url
    ? (request.browser ? request.browser.kiosk.map(sh).join(' ') + (request.browser.kiosk.length ? ' ' : '') : '') + sh(request.url)
    : '';
  const label = (request.browser ? request.browser.id : request.app) + (request.url ? ' → ' + request.url : '');
  const fullscreenFallback = request.fullscreen && (!request.browser || request.browser.kiosk.length === 0)
    ? 'sleep 2; wmctrl -r :ACTIVE: -b add,fullscreen >/dev/null 2>&1 || true; '
    : '';
  return prefix + choose + 'setsid "$APP" ' + args + ' >/dev/null 2>&1 < /dev/null & ' + fullscreenFallback +
    'echo ' + sh('abierto: ' + label + (request.fullscreen ? ' · pantalla completa' : ''));
}

function windowsOpenCommand(input) {
  const request = parseOpenRequest(input);
  const app = request.browser ? request.browser.windows : request.app;
  const label = app || 'navegador predeterminado';
  let script;
  if (!app && request.url) {
    script = 'Start-Process ' + ps(request.url) + '; Start-Sleep -Seconds 2; ' +
      'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'{F11}\'); ' +
      'Write-Output ' + ps('abierto: ' + label + ' → ' + request.url + ' · pantalla completa solicitada');
  } else {
    const args = [];
    if (request.url && request.browser) args.push(...request.browser.kiosk);
    if (request.url) args.push(request.url);
    const argList = args.length ? ' -ArgumentList @(' + args.map(ps).join(',') + ')' : '';
    script = 'Start-Process -FilePath ' + ps(app) + argList + '; Write-Output ' +
      ps('abierto: ' + label + (request.url ? ' → ' + request.url + ' · pantalla completa' : ''));
  }
  // OpenSSH en Windows suele entrar por cmd.exe, donde las comillas simples no
  // protegen argumentos como en POSIX. -EncodedCommand evita depender del shell
  // remoto y conserva URLs con &, ; o espacios de forma literal.
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return 'powershell.exe -NoProfile -NonInteractive -EncodedCommand ' + encoded;
}

module.exports = {
  normalizeWebUrl,
  parseOpenRequest,
  macOpenCommand,
  linuxOpenCommand,
  windowsOpenCommand
};
