'use strict';
/* control-vigia.js — VIGÍA DE CONTROL (decisión yokup 0148 ★, Carlos 4-sep-2026).
 *
 * Cada 10 minutos el hub prueba DE VERDAD que puede VER y TOCAR cada equipo:
 * apretón de captura real (nonce propio en capture-queue, JPEG fresco), inyector
 * de entrada respondiendo (--displays), permiso de Accesibilidad y pantalla sin
 * bloquear. No mira si «existen ficheros»: el fallo del nonce del 3-sep llevaba
 * semanas invisible porque el semáforo sólo miraba eso.
 *
 * Además: compara la VERSIÓN del agente con la del repo. Solo reinstala si es
 * más vieja o no está. Una captura que falla con el agente al día no se
 * reinstala: eso pisaba arreglos más nuevos. Avisa en cada transición.
 *
 * Funciones puras (testables) + `crear()` que recibe las dependencias del hub.
 */
const Capture = require('./capture-client');

const INTERVALO_MS = 10 * 60 * 1000;
const REPARACION_MIN_MS = 60 * 60 * 1000;   // una reparación por máquina y hora
const FUERA_AVISO_MS = 60 * 60 * 1000;      // aviso cuando lleva más de 1 h sin SSH (mejora 2)
const LGUI = 'export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"; export DISPLAY="${DISPLAY:-:0}"; ';

/** Entero CAPTURE_VERSION del agente Python. Un script bash sin versión no es canónico:
 *  el vigía no debe reinstalar ese bash encima de un arreglo más nuevo. */
function versionAgenteCanonico(texto) {
  const m = String(texto || '').match(/^CAPTURE_VERSION\s*=\s*(\d+)\s*$/m);
  return m ? Number(m[1]) : null;
}

/** Comando de sonda por plataforma. Devuelve marcadores __V_*__ por stdout. */
function comandoSonda(plataforma) {
  if (plataforma === 'macos') return Capture.macosProbeCommand();
  if (plataforma === 'linux') {
    return LGUI + 'rm -f /tmp/fv.png; if command -v grim >/dev/null 2>&1; then grim /tmp/fv.png 2>/dev/null; elif command -v scrot >/dev/null 2>&1; then scrot -o /tmp/fv.png 2>/dev/null; elif command -v gnome-screenshot >/dev/null 2>&1; then gnome-screenshot -f /tmp/fv.png 2>/dev/null; fi; ' +
      '[ -s /tmp/fv.png ] && echo __V_CAP__=1 || echo __V_CAP__=0; echo __V_AGENT__=linux; ' +
      'echo __V_INPUT__=$(python3 "$HOME/.fleet/fleet-input-linux.py" --displays 2>/dev/null | grep -c \'"ok": true\'); echo __V_AX__=1; ' +
      'L=$(loginctl show-session $(loginctl list-sessions --no-legend 2>/dev/null | awk "NR==1{print \\$1}") -p LockedHint 2>/dev/null | cut -d= -f2); case "$L" in yes) echo __V_LOCK__=1;; no) echo __V_LOCK__=0;; *) echo __V_LOCK__=?;; esac';
  }
  if (plataforma === 'windows') {
    return '$t="$env:USERPROFILE\\.fleet\\FleetTrigger.exe"; if (Test-Path $t) { $o = & $t; if ($o.Length -gt 200) { "__V_CAP__=1" } else { "__V_CAP__=0" } } else { "__V_CAP__=0" }; "__V_AGENT__=windows"; ' +
      '$p="$env:USERPROFILE\\.fleet\\fleet-input.ps1"; if (Test-Path $p) { try { & $p -Displays | Out-Null; "__V_INPUT__=1" } catch { "__V_INPUT__=0" } } else { "__V_INPUT__=0" }; "__V_AX__=1"; "__V_LOCK__=?"';
  }
  return null;
}

function marcador(stdout, k) {
  const m = String(stdout || '').match(new RegExp('__V_' + k + '__=([^\\s]+)'));
  return m ? m[1] : null;
}

/** Interpreta la sonda. `online` = el SSH respondió (rc 0). */
function evaluar({ stdout, rc, online, plataforma, versionCanonico }) {
  if (!online) return { online: false, ver: false, tocar: false, ready: false, agenteOk: null, why: 'sin ssh desde el hub' };
  const cap = marcador(stdout, 'CAP'), agent = marcador(stdout, 'AGENT'), input = marcador(stdout, 'INPUT');
  const ax = marcador(stdout, 'AX'), lock = marcador(stdout, 'LOCK');
  const ver = cap === '1';
  const inputOk = input === '1';
  const axOk = ax === '1' || ax === '?' || ax === null;   // sin binding no se afirma que falte
  const locked = lock === '1';
  const tocar = inputOk && axOk && !locked;
  const agenteNum = agent != null && /^\d+$/.test(agent) ? Number(agent) : null;
  const agenteOk = plataforma === 'macos' && versionCanonico != null
    ? (agenteNum != null && agenteNum >= Number(versionCanonico))
    : null;
  const why = !ver
    ? (plataforma === 'macos' && agenteOk === false
        ? (agent === 'none' || agent == null ? 'sin agente de captura' : 'agente de captura desactualizado')
        : 'la captura no responde')
    : !inputOk ? 'sin inyector de entrada'
    : ax === '0' ? 'sin permiso de Accesibilidad'
    : locked ? 'pantalla bloqueada'
    : 'ver + tocar';
  return { online: true, ver, tocar, ready: ver && tocar, agenteOk, agente: agent, locked: lock === '?' ? null : locked, why };
}

/** ¿Merece reparación automática? Sólo macOS, y sólo si el agente es más viejo o no está.
 *  Una captura que falla con el agente ya al día NO reinstala: eso es lo que pisó
 *  el arreglo de las tres pantallas (17:09 Madrid, 7-nov-2026). */
function necesitaReparacion(ev, plataforma) {
  if (plataforma !== 'macos' || !ev.online) return null;
  if (ev.agenteOk === false) return 'agente';
  if (ev.why === 'sin inyector de entrada') return 'inyector';
  return null;
}

/** Transición entre dos lecturas → mensaje de aviso o null. */
function transicion(anterior, actual, nombre) {
  const a = anterior ? !!anterior.ready : null, b = !!actual.ready;
  if (a === null) return null;                     // primera lectura: sin aviso
  if (a === b) return null;
  return b ? ('🟢 ' + nombre + ' vuelve a ser controlable (ver + tocar)')
           : ('🔴 ' + nombre + ' ha dejado de ser controlable: ' + actual.why);
}

/** Comando (python3, presente en macOS y Linux) que envía el paquete mágico WoL a `mac`
 *  por broadcast y, si se conoce, a `ip`. Cada destino por separado: el unicast a una IP
 *  que no está en la red levanta «Host is down / No route to host» en macOS y no debe
 *  tapar que el broadcast sí salió. */
function comandoWol(mac, ip) {
  const m = String(mac || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  if (m.length !== 12) return null;
  const dest = String(ip || '').replace(/[^0-9.]/g, '');
  const py = [
    'import socket,binascii',
    'p=b"\\xff"*6+binascii.unhexlify("' + m + '")*16',
    's=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)',
    's.setsockopt(socket.SOL_SOCKET,socket.SO_BROADCAST,1)',
    'ok=[]',
    'for d in ["255.255.255.255"' + (dest ? ',"' + dest + '"' : '') + ']:',
    '  try:',
    '    s.sendto(p,(d,9)); ok.append(d)',
    '  except Exception as e:',
    '    pass',
    'print("wol enviado a ' + m + ' via "+",".join(ok) if ok else "wol NO enviado")'
  ].join('\n');
  // En base64: ni comillas ni saltos de línea que pelear con ssh + shell.
  return 'echo ' + Buffer.from(py, 'utf8').toString('base64') + ' | base64 -d | python3 -';
}

function crear(deps) {
  // deps: { maquinas(), platOf(m), run(m,cmd,ms), reparar(m,tipo)→Promise<bool>, avisar(txt), audit(ev), persistir(estado), estadoInicial, versionCanonico, ahora() }
  const estado = Object.assign({}, deps.estadoInicial || {});
  const ahora = deps.ahora || (() => Date.now());
  const ultimaReparacion = {};
  let corriendo = false;

  async function probar(m) {
    const plat = deps.platOf(m); const cmd = comandoSonda(plat);
    if (!cmd) return null;
    const r = await deps.run(m, cmd, plat === 'windows' ? 20000 : 15000);
    return evaluar({ stdout: r.stdout, rc: r.rc, online: r.rc === 0, plataforma: plat, versionCanonico: deps.versionCanonico });
  }

  async function vigilar(m, { forzar } = {}) {
    const plat = deps.platOf(m);
    const anterior = estado[m.id] || null;
    let ev = await probar(m);
    if (!ev) return null;
    let reparado = null;
    const tipo = necesitaReparacion(ev, plat);
    if (tipo && (forzar || !ultimaReparacion[m.id] || ahora() - ultimaReparacion[m.id] > REPARACION_MIN_MS)) {
      ultimaReparacion[m.id] = ahora();
      let ok = false;
      try { ok = await deps.reparar(m, tipo); } catch (e) { ok = false; }
      reparado = { tipo, ok, at: ahora() };
      deps.audit({ ev: 'vigia_reparacion', machine: m.id, tipo, ok });
      if (ok) ev = (await probar(m)) || ev;
    }
    const actual = Object.assign({}, ev, { at: ahora(), plataforma: plat, reparado });
    // FUERA DE LA RED (mejora 2, decisión 0148): se recuerda desde cuándo no hay SSH y se avisa
    // UNA vez al superar la hora; al volver, se limpia.
    if (!actual.online) {
      actual.fueraDesde = (anterior && anterior.fueraDesde != null) ? anterior.fueraDesde : ahora();
      actual.fueraAvisado = !!(anterior && anterior.fueraAvisado);
      if (!actual.fueraAvisado && ahora() - actual.fueraDesde > FUERA_AVISO_MS) {
        actual.fueraAvisado = true;
        deps.audit({ ev: 'vigia_fuera', machine: m.id, desde: actual.fueraDesde });
        try { await deps.avisar('⏰ ' + (m.name || m.id) + ' lleva más de 1 h sin SSH desde el hub (fuera de Tailscale o apagado): despertar desde /control'); } catch (e) {}
      }
    }
    estado[m.id] = actual;
    const aviso = transicion(anterior, actual, m.name || m.id);
    if (aviso) { deps.audit({ ev: 'vigia_transicion', machine: m.id, ready: actual.ready, why: actual.why }); try { await deps.avisar(aviso); } catch (e) {} }
    if (reparado) { try { await deps.avisar((reparado.ok ? '🛡️ ' : '⚠️ ') + (m.name || m.id) + ': reparación automática de ' + tipo + (reparado.ok ? ' aplicada → ' + actual.why : ' FALLÓ')); } catch (e) {} }
    return actual;
  }

  async function ronda(opts) {
    if (corriendo) return estado;
    corriendo = true;
    try {
      const ms = deps.maquinas();
      await Promise.all(ms.map((m) => vigilar(m, opts).catch((e) => { deps.audit({ ev: 'vigia_error', machine: m.id, error: String(e && e.message || e).slice(0, 120) }); })));
      try { deps.persistir(estado); } catch (e) {}
    } finally { corriendo = false; }
    return estado;
  }

  return { estado, probar, vigilar, ronda, INTERVALO_MS };
}

module.exports = { INTERVALO_MS, REPARACION_MIN_MS, FUERA_AVISO_MS, versionAgenteCanonico, comandoSonda, comandoWol, marcador, evaluar, necesitaReparacion, transicion, crear };
