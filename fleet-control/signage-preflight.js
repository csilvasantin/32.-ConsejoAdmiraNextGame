'use strict';

// Contrato único máquina ↔ screen para Digital Signage. La UI, el launcher y
// api.admira.store deben usar exactamente este id; nunca el nombre visible ni
// una preferencia de localStorage.
function canonicalScreenId(machine) {
  const configured = machine && (machine.screen || (machine.signage && machine.signage.screen));
  return String(configured || (machine && machine.id) || '')
    .trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function psEncoded(script) {
  return 'powershell.exe -NoProfile -NonInteractive -EncodedCommand ' +
    Buffer.from(script, 'utf16le').toString('base64');
}

function preflightCommand(machine) {
  const platform = String((machine && machine.platform) || 'macos').toLowerCase();
  if (platform.startsWith('win')) {
    return psEncoded([
      "$ErrorActionPreference='SilentlyContinue'",
      "$cfg=Join-Path $env:USERPROFILE '.admira-signage.json'",
      "$screen='' ; $circuit=''",
      "if(Test-Path $cfg){try{$j=Get-Content $cfg -Raw|ConvertFrom-Json;$screen=[string]$j.screen;$circuit=[string]$j.circuit}catch{}}",
      "$candidates=@((Get-Command msedge.exe).Source,(Get-Command chrome.exe).Source,\"$env:ProgramFiles\\Google\\Chrome\\Application\\chrome.exe\",\"${env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe\")",
      "$browser=$candidates|Where-Object{$_ -and (Test-Path $_)}|Select-Object -First 1",
      "$version=if($browser){(Get-Item $browser).VersionInfo.ProductVersion}else{''}",
      "$capture=Test-Path (Join-Path $env:USERPROFILE '.fleet\\FleetTrigger.exe')",
      "Write-Output 'PF_READY=1'",
      "Write-Output ('PF_OS='+[System.Environment]::OSVersion.VersionString)",
      "Write-Output ('PF_PLAYER='+$(if($browser){'web-browser'}else{'none'}))",
      "Write-Output ('PF_VERSION='+$version)",
      "Write-Output ('PF_EXECUTOR='+$(if($capture){'fleet-trigger'}else{'none'}))",
      "Write-Output ('PF_SCREEN='+$screen)",
      "Write-Output ('PF_CIRCUIT='+$circuit)"
    ].join('; '));
  }

  if (platform.startsWith('lin')) {
    const configured = machine && machine.signage && machine.signage.start ? 'configured-launcher' : 'none';
    return [
      'F="$HOME/.config/admira-signage.env"',
      'val(){ sed -n "s/^$1=//p" "$F" 2>/dev/null | tail -1; }',
      'CH=""; for c in chromium chromium-browser google-chrome google-chrome-stable; do command -v "$c" >/dev/null 2>&1 && { CH="$(command -v "$c")"; break; }; done',
      'VER=""; [ -n "$CH" ] && VER="$($CH --version 2>/dev/null | head -1)"',
      'PLAYER=none; [ -n "$CH" ] && PLAYER=web-browser',
      'EXEC=' + configured,
      '[ "$EXEC" = none ] && systemctl --user cat admira-signage.service >/dev/null 2>&1 && EXEC=systemd-user',
      'printf "PF_READY=1\\nPF_OS=%s\\nPF_PLAYER=%s\\nPF_VERSION=%s\\nPF_EXECUTOR=%s\\nPF_SCREEN=%s\\nPF_CIRCUIT=%s\\n" "$(uname -sr 2>/dev/null)" "$PLAYER" "$VER" "$EXEC" "$(val ADMIRA_SCREEN)" "$(val ADMIRA_CIRCUIT)"'
    ].join('; ');
  }

  return [
    'APP="/Applications/AdmiraSignageMac.app"',
    'CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"',
    'PLAYER=none; VER=""',
      'if [ -d "$APP" ]; then PLAYER=native; VER="$(defaults read "$APP/Contents/Info" CFBundleShortVersionString 2>/dev/null || true)"; elif [ -x "$CH" ]; then PLAYER=web-browser; VER="$("$CH" --version 2>/dev/null | head -1)"; fi',
    'EXEC=none; { launchctl print "gui/$(id -u)/navegadores.executor" >/dev/null 2>&1 || [ -f "$HOME/Library/LaunchAgents/navegadores.executor.plist" ]; } && EXEC=navegadores',
    'printf "PF_READY=1\\nPF_OS=%s\\nPF_PLAYER=%s\\nPF_VERSION=%s\\nPF_EXECUTOR=%s\\nPF_SCREEN=%s\\nPF_CIRCUIT=%s\\n" "$(sw_vers -productVersion 2>/dev/null)" "$PLAYER" "$VER" "$EXEC" "$(defaults read tv.admira.signage.mac screen 2>/dev/null || true)" "$(defaults read tv.admira.signage.mac circuit 2>/dev/null || true)"'
  ].join('; ');
}

function parseProbe(stdout) {
  const out = {};
  String(stdout || '').split(/\r?\n/).forEach(line => {
    const i = line.indexOf('=');
    if (i > 0 && /^PF_[A-Z_]+$/.test(line.slice(0, i))) out[line.slice(0, i).slice(3).toLowerCase()] = line.slice(i + 1).trim();
  });
  return out;
}

function assessPreflight(machine, runResult, captureResult, live) {
  const probe = parseProbe(runResult && runResult.stdout);
  const reachable = !!(runResult && runResult.rc === 0 && probe.ready === '1');
  const captureReady = !!(captureResult && captureResult.rc === 0 &&
    String(captureResult.stdout || '').length > 200 && !/ERR_NO_CAPTURE/.test(String(captureResult.stdout || '')));
  const screen = canonicalScreenId(machine);
  const configuredScreen = String(probe.screen || '').trim().toLowerCase();
  const playerInstalled = !!(probe.player && probe.player !== 'none');
  const executorInstalled = !!(probe.executor && probe.executor !== 'none');
  const blockers = [];
  const warnings = [];

  if (!reachable) blockers.push('Sin acceso remoto real: revisa Tailscale, SSH y la clave del hub.');
  if (reachable && !playerInstalled && !executorInstalled) blockers.push('Sin player ni executor: instala AdmiraSignage o un navegador kiosk/executor compatible.');
  if (reachable && !captureReady) blockers.push('Sin captura real: instala el agente y concede permiso de grabación de pantalla/sesión gráfica.');
  if (configuredScreen && configuredScreen !== screen) blockers.push('Screen configurado como «' + configuredScreen + '»; unifícalo con «' + screen + '».');
  if (!probe.circuit && !(live && live.loc)) warnings.push('Sin circuito asignado; emitirá por screen/tag hasta definirlo.');
  if (live && live.online === false) warnings.push('Sin heartbeat fresco antes del arranque.');

  return {
    id: machine.id,
    name: machine.name,
    platform: String(machine.platform || 'macos').toLowerCase(),
    reachable,
    player: { installed: playerInstalled, type: probe.player || 'none', version: probe.version || '' },
    executor: { installed: executorInstalled, type: probe.executor || 'none' },
    permissions: { capture: captureReady },
    screen: { id: screen, configured: configuredScreen || screen, matches: !configuredScreen || configuredScreen === screen },
    circuit: probe.circuit || (live && live.loc) || '',
    live: live || { online: false, age_seconds: null },
    eligible: blockers.length === 0,
    blockers,
    warnings,
    checkedAt: Date.now()
  };
}

module.exports = { canonicalScreenId, preflightCommand, parseProbe, assessPreflight };
