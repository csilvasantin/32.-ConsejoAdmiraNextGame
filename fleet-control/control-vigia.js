'use strict';
/* control-vigia.js — VIGÍA DE CONTROL (decisión yokup 0148 ★, Carlos 4-sep-2026).
 *
 * Cada 10 minutos el hub prueba DE VERDAD que puede VER y TOCAR cada equipo:
 * apretón de captura real (nonce del hub → capture.out con JPEG), inyector de
 * entrada respondiendo (--displays), permiso de Accesibilidad y pantalla sin
 * bloquear. No mira si «existen ficheros»: el fallo del nonce del 3-sep llevaba
 * semanas invisible porque el semáforo sólo miraba eso.
 *
 * Además: compara la versión del agente de captura con la canónica del repo y,
 * si no cuadra o la captura falla, REDESPLIEGA el agente (macOS) y vuelve a probar;
 * avisa (Telegram vía agora + audit) en cada transición controlable ↔ no controlable.
 *
 * Funciones puras (testables) + `crear()` que recibe las dependencias del hub.
 */
const crypto = require('crypto');

const INTERVALO_MS = 10 * 60 * 1000;
const REPARACION_MIN_MS = 60 * 60 * 1000;   // una reparación por máquina y hora
const FUERA_AVISO_MS = 60 * 60 * 1000;      // aviso cuando lleva más de 1 h sin SSH (mejora 2)
const LGUI = 'export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"; export DISPLAY="${DISPLAY:-:0}"; ';

/** md5 del agente canónico embebido en deploy-capture-agent.sh (entre <<'EOS' y EOS). */
function md5AgenteCanonico(textoInstalador) {
  const lineas = String(textoInstalador || '').split('\n');
  const ini = lineas.findIndex((l) => /CAPTURE_SH <<'EOS'/.test(l));
  const fin = lineas.findIndex((l, i) => i > ini && l === 'EOS');
  if (ini < 0 || fin < 0) return null;
  return crypto.createHash('md5').update(lineas.slice(ini + 1, fin).join('\n') + '\n').digest('hex');
}

/** Comando de sonda por plataforma. Devuelve marcadores __V_*__ por stdout. */
function comandoSonda(plataforma) {
  if (plataforma === 'macos') {
    return 'D="$HOME/.fleet"; N="fv-$(date +%s)-$$-$RANDOM"; printf "%s|0" "$N" > "$D/capture.req"; ' +
      'for i in $(seq 1 30); do [ "$(head -1 "$D/capture.out" 2>/dev/null)" = "$N" ] && break; sleep 0.3; done; ' +
      'if [ "$(head -1 "$D/capture.out" 2>/dev/null)" = "$N" ] && [ "$(sed -n 2p "$D/capture.out" | head -c 4)" = "/9j/" ]; then echo __V_CAP__=1; else echo __V_CAP__=0; fi; ' +
      'echo __V_AGENT__=$(md5 -q "$D/fleet-capture.sh" 2>/dev/null || echo none); ' +
      'echo __V_INPUT__=$(/usr/bin/python3 "$D/fleet-input.py" --displays 2>/dev/null | grep -c \'"ok": true\'); ' +
      'echo __V_AX__=$(/usr/bin/python3 -c \'import ctypes;print(int(bool(ctypes.cdll.LoadLibrary("/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices").AXIsProcessTrusted())))\' 2>/dev/null || echo ?); ' +
      'echo __V_LOCK__=$(/usr/bin/python3 -c \'import Quartz;d=Quartz.CGSessionCopyCurrentDictionary() or {};print(int(bool(d.get("CGSSessionScreenIsLocked",False))))\' 2>/dev/null || echo ?)';
  }
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
function evaluar({ stdout, rc, online, plataforma, md5Canonico }) {
  if (!online) return { online: false, ver: false, tocar: false, ready: false, agenteOk: null, why: 'sin ssh desde el hub' };
  const cap = marcador(stdout, 'CAP'), agent = marcador(stdout, 'AGENT'), input = marcador(stdout, 'INPUT');
  const ax = marcador(stdout, 'AX'), lock = marcador(stdout, 'LOCK');
  const ver = cap === '1';
  const inputOk = input === '1';
  const axOk = ax === '1' || ax === '?' || ax === null;   // sin binding no se afirma que falte
  const locked = lock === '1';
  const tocar = inputOk && axOk && !locked;
  const agenteOk = plataforma === 'macos' && md5Canonico ? (agent === md5Canonico) : null;
  const why = !ver ? (plataforma === 'macos' && agenteOk === false ? 'agente de captura desactualizado' : (agent === 'none' ? 'sin agente de captura' : 'la captura no responde'))
    : !inputOk ? 'sin inyector de entrada'
    : ax === '0' ? 'sin permiso de Accesibilidad'
    : locked ? 'pantalla bloqueada'
    : 'ver + tocar';
  return { online: true, ver, tocar, ready: ver && tocar, agenteOk, agente: agent, locked: lock === '?' ? null : locked, why };
}

/** ¿Merece reparación automática? Sólo macOS, sólo si la captura falla o el agente no es el canónico. */
function necesitaReparacion(ev, plataforma) {
  if (plataforma !== 'macos' || !ev.online) return null;
  if (!ev.ver || ev.agenteOk === false) return 'agente';
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

/** Comando (python3, presente en macOS y Linux) que envía el paquete mágico WoL a `mac` por broadcast y a `ip`. */
function comandoWol(mac, ip) {
  const m = String(mac || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  if (m.length !== 12) return null;
  const dest = String(ip || '').replace(/[^0-9.]/g, '');
  return "python3 -c 'import socket,binascii;p=b\"\\xff\"*6+binascii.unhexlify(\"" + m + "\")*16;s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);s.setsockopt(socket.SOL_SOCKET,socket.SO_BROADCAST,1);[s.sendto(p,(d,9)) for d in ([\"255.255.255.255\"]+([\"" + dest + "\"] if \"" + dest + "\" else []))];print(\"wol enviado a " + m + "\")'";
}

function crear(deps) {
  // deps: { maquinas(), platOf(m), run(m,cmd,ms), reparar(m,tipo)→Promise<bool>, avisar(txt), audit(ev), persistir(estado), estadoInicial, md5Canonico, ahora() }
  const estado = Object.assign({}, deps.estadoInicial || {});
  const ahora = deps.ahora || (() => Date.now());
  const ultimaReparacion = {};
  let corriendo = false;

  async function probar(m) {
    const plat = deps.platOf(m); const cmd = comandoSonda(plat);
    if (!cmd) return null;
    const r = await deps.run(m, cmd, plat === 'windows' ? 20000 : 15000);
    return evaluar({ stdout: r.stdout, rc: r.rc, online: r.rc === 0, plataforma: plat, md5Canonico: deps.md5Canonico });
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

module.exports = { INTERVALO_MS, REPARACION_MIN_MS, FUERA_AVISO_MS, md5AgenteCanonico, comandoSonda, comandoWol, marcador, evaluar, necesitaReparacion, transicion, crear };
