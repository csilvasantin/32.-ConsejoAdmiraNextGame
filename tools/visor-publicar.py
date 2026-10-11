#!/usr/bin/env python3
"""visor-publicar.py — publica la pantalla de los deepagents de pago para admira.live/visor (r27 · Carlos 11-10-2026).

Lee la MISMA lista que la cuadratura del Mac: ~/.config/admiranext/cuadratura.conf (Título|host|sesión-tmux|skin).
Cada 3 s, para las líneas cuyo host es ESTE Mac, hace `tmux capture-pane -p -e` (últimas ~60 líneas, con colores),
tapa secretos (tokens, claves, Bearer, sk-/ghp_/xai-…, password=…) y, solo si algo cambió, hace POST a
https://www.admira.live/api/visor/pane con el token de máquina (~/.config/admira/consumos-lecturas.token o
COUNCIL_MACHINE_TOKEN). Latido cada 60 s aunque no cambie nada. Solo stdlib; el token nunca se imprime.
Lo lanza el LaunchAgent com.admiranext.visor-publicar (KeepAlive). Uso: visor-publicar.py [--una] [--dry-run]

r31 (Carlos 11-10-2026 13:13 «¿por qué no coinciden?»): el ESTADO (vivo / idle / login / nosesion) y la última misión
salen de ~/Claude/vista/estado-agente.py, la MISMA pieza que usa panel-agente.sh en la cuadrícula del Mac (estado
compartido en ~/.cache/admiranext/estado-agentes/, misma histéresis de 80 s). Solo se manda la terminal cuando el agente
está en vivo; en Idle / Login pendiente / Sin sesión va la ficha (nombre, línea de info, palabra y última misión), nunca el
enlace OAuth del login. Para actualizar: sustituir ESTE fichero y `launchctl kickstart -k gui/$UID/com.admiranext.visor-publicar`
(no reescribir el plist: cada reescritura saca el aviso de actividad en segundo plano de macOS).
"""
import hashlib, importlib.util, json, os, re, subprocess, sys, time, urllib.request, urllib.error

HOME = os.path.expanduser("~")
CONF = os.path.join(HOME, ".config", "admiranext", "cuadratura.conf")
# r33 (/interface 6): los 2 de Grok (Smith en el MBP16, Merovingio en la caja de GrokBot) — misma forma, aparte para no
# tocar la cuadrícula 2x2 del Mac (cuadratura.sh lee solo las 4 primeras líneas de cuadratura.conf)
CONF_GROK = os.environ.get("VISOR_CONF_GROK", os.path.join(HOME, ".config", "admiranext", "visor-grok.conf"))
DEFECTO_GROK = ["Smith · Grok|macbook-pro-16|smith|Smith", "Merovingio · Grok|grokbotbox|merovingio|Merovingio"]
URL = os.environ.get("VISOR_URL", "https://www.admira.live/api/visor/pane")
CADA = float(os.environ.get("VISOR_CADA", "3"))
LATIDO = 60
LINEAS = 60
EST = None
TMUX = next((p for p in ("/opt/homebrew/bin/tmux", "/usr/local/bin/tmux", "/usr/bin/tmux") if os.path.exists(p)), "tmux")
DEFECTO = ["Neo · Claude|macbook-pro-16|neo|Homebrew", "Morfeo · Claude|macbook-pro-16|morfeo|Red Sands",
           "Trinity · Codex|macbook-pro-16|trinity|Ocean", "Oráculo · Codex|macmini|oraculo|Grass"]

PATRONES = [
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)"),
    re.compile(r"\b(sk-(?:ant-|proj-)?[A-Za-z0-9_\-]{16,})"),
    re.compile(r"\b(xai-[A-Za-z0-9]{20,})"),
    re.compile(r"\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})"),
    re.compile(r"\b(glpat-[A-Za-z0-9_\-]{16,})"),
    re.compile(r"\b(xox[abprs]-[A-Za-z0-9-]{10,})"),
    re.compile(r"\b(AKIA[0-9A-Z]{16})\b"),
    re.compile(r"\b(AIza[0-9A-Za-z_\-]{30,})"),
    re.compile(r"\b(\d{8,10}:AA[A-Za-z0-9_\-]{30,})"),
    re.compile(r"\b(eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{5,})"),
]
# enlaces de login (OAuth): nunca al visor. La URL de Claude se parte en varias líneas, así que se tapa la línea entera.
RX_OAUTH_URL = re.compile(r"https?://\S*(?:oauth|authorize|/login|signin|sign-in|device)\S*", re.I)
RX_OAUTH_TROZO = re.compile(r"code_challenge|redirect_uri=|client_id=|response_type=|[?&]state=|%3A%2F|%3A[a-z_]+\+|scope=[a-z%]", re.I)
RX_TROZO_LARGO = re.compile(r"^\s*[A-Za-z0-9_\-=%&.+]{40,}\s*$")  # trozo suelto de una URL partida
RX_PORTADOR = re.compile(r"\b(Bearer|Basic|token)\s+[A-Za-z0-9._~+/=\-]{12,}", re.I)
RX_ASIG = re.compile(r"((?:pass(?:word|wd)?|pwd|contrase(?:ñ|n)a|clave|secret|api[_-]?key|access[_-]?key|token)[A-Za-z_\-]*[\"']?\s*[:=]\s*[\"']?)([^\s\"'\x1b]{4,})", re.I)


def tapar(s):
    if RX_OAUTH_TROZO.search(s) or RX_TROZO_LARGO.match(re.sub(r"\x1b\[[0-9;]*m", "", s)):
        return "[enlace de login oculto]"
    s = RX_OAUTH_URL.sub("[enlace de login oculto]", s)
    for rx in PATRONES:
        s = rx.sub("[oculto]", s)
    s = RX_PORTADOR.sub(lambda m: m.group(1) + " [oculto]", s)
    return RX_ASIG.sub(lambda m: m.group(1) + "[oculto]", s)


def cargar_estado():
    """estado-agente.py: la misma pieza que usa panel-agente.sh. Sin ella no hay forma honesta de decidir → None."""
    for p in (os.environ.get("ESTADO_AGENTE", ""), os.path.join(HOME, "Claude", "vista", "estado-agente.py"),
              os.path.join(os.path.dirname(os.path.abspath(__file__)), "estado-agente.py")):
        if p and os.path.exists(p):
            spec = importlib.util.spec_from_file_location("estado_agente", p)
            m = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(m)
            m._ruta = p
            return m
    return None


def token():
    t = os.environ.get("COUNCIL_MACHINE_TOKEN", "").strip()
    if t:
        return t
    for p in (os.path.join(HOME, ".config", "admira", "consumos-lecturas.token"), os.path.join(HOME, ".fleet", "council-machine.token")):
        try:
            t = open(p).read().strip()
            if t:
                return t
        except OSError:
            pass
    return ""


def yo():
    if os.environ.get("VISOR_MAQUINA"):  # la caja de GrokBot (Linux, sin scutil) se presenta como «grokbotbox»
        return os.environ["VISOR_MAQUINA"].strip().lower()
    try:
        return subprocess.run(["scutil", "--get", "LocalHostName"], capture_output=True, text=True, timeout=5).stdout.strip().lower()
    except Exception:
        return os.uname().nodename.split(".")[0].lower()


def leer_conf(ruta=CONF, defecto=DEFECTO, n=4):
    try:
        lineas = [l.strip() for l in open(ruta, encoding="utf-8") if l.strip() and not l.lstrip().startswith("#") and "|" in l]
    except OSError:
        lineas = defecto
    out = []
    for l in lineas[:n]:
        p = (l.split("|") + ["", "", "", ""])[:4]
        out.append({"titulo": p[0].strip(), "host": p[1].strip().lower(), "sesion": p[2].strip(), "skin": p[3].strip() or "Pro"})
    return out


def tmux(*args):
    r = subprocess.run([TMUX, *args], capture_output=True, text=True, timeout=8)
    return r.returncode, r.stdout


RX_ESTILO = re.compile(r"#\[[^\]]*\]")


def rotulo(ses):
    lineas, sub = [], ""
    for i in range(6):
        rc, v = tmux("show-options", "-v", "-t", "=%s" % ses, "status-format[%d]" % i)
        if rc != 0:
            continue
        v = RX_ESTILO.sub("", v.rstrip("\n"))
        if i < 4:
            lineas.append(v[1:] if v.startswith(" ") else v)
        elif i == 4:
            sub = re.sub(r"\s*·?\s*%H:%M.*$", "", v).strip()
    lineas = [l for l in lineas if l.strip()]
    return lineas, sub


def capturar(ses):
    rc, txt = tmux("capture-pane", "-p", "-e", "-t", "=%s:" % ses, "-S", "-%d" % LINEAS)
    if rc != 0:
        return None
    lineas = txt.split("\n")
    while lineas and not re.sub(r"\x1b\[[0-9;]*m", "", lineas[-1]).strip():
        lineas.pop()
    _, dim = tmux("display-message", "-p", "-t", "=%s:" % ses, "#{pane_width} #{pane_height} #{pane_current_command}")
    p = (dim.split() + ["120", "30", ""])[:3]
    return {"lineas": [tapar(l) for l in lineas[-LINEAS:]], "ancho": int(p[0] or 120), "alto": int(p[1] or 30), "cmd": p[2]}


def enviar(cuerpo, tok, dry):
    datos = json.dumps(cuerpo).encode()
    if dry:
        print("dry-run:", len(datos), "bytes", list(cuerpo["agentes"]), "vivas", cuerpo["vivas"])
        return {"ok": True}
    req = urllib.request.Request(URL, data=datos, method="POST", headers={"content-type": "application/json", "X-Council-Token": tok, "user-agent": "visor-publicar/r31"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read() or b"{}")


def main():
    dry, una = "--dry-run" in sys.argv, "--una" in sys.argv
    tok = token()
    if not tok and not dry:
        print("visor-publicar: sin token de máquina; no publico", file=sys.stderr)
        time.sleep(60)
        return 1
    maquina = yo()
    global EST
    EST = cargar_estado()
    if EST is None:
        print("visor-publicar: falta ~/Claude/vista/estado-agente.py (la fuente única del estado); no publico", file=sys.stderr, flush=True)
        time.sleep(60)
        return 1
    print("visor-publicar r31: estado de %s (%s)" % (EST._ruta, time.strftime("%H:%M:%S")), file=sys.stderr, flush=True)
    inv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'terminal-inventory.py')
    inv_spec = importlib.util.spec_from_file_location('terminal_inventory', inv_path)
    inv = importlib.util.module_from_spec(inv_spec)
    inv_spec.loader.exec_module(inv)
    huellas, ultimo_envio, rotulos, forzar = {}, 0.0, {}, True
    terminales, terminales_ts, ultimo_inventario, firma_sesiones = None, 0, 0, None
    while True:
        t0 = time.time()
        try:
            conf = leer_conf()
            grok = leer_conf(CONF_GROK, DEFECTO_GROK, 2)
            rc, sesiones = tmux('list-sessions', '-F', '#{session_id}\t#{session_name}\t#{session_created}')
            refrescar_inventario = sesiones != firma_sesiones or t0 - ultimo_inventario >= LATIDO
            if refrescar_inventario:
                try:
                    terminales = inv.collect(tmux=tmux, estado=EST)
                    terminales_ts = int(time.time() * 1000)
                    firma_sesiones = sesiones
                except Exception:
                    terminales, terminales_ts = None, 0
                ultimo_inventario = t0
            mias = [c for c in conf + grok if c["host"] == maquina]
            agentes, vivas, nuevas = {}, [], {}
            for c in mias:
                ses = c["sesion"]
                nombre = c["titulo"].split(" · ")[0]
                modelo, mac = EST.etiquetas(c["titulo"], c["host"])
                d = EST.decidir(ses, EST.persona_de(nombre))
                ficha = {"estado": d["estado"], "etiqueta": d["etiqueta"], "mision": tapar(d["mision"]), "linea": tapar(d["linea"]), "viejo": tapar(d["viejo"]), "modelo": modelo, "mac": mac,
                         "arte": EST.arte(nombre) or [], "cambio": d["cambio"] or int(t0 * 1000), "desde": d["desde"]}
                if d["estado"] == "vivo":
                    cap = capturar(ses)
                    if cap is None:
                        continue
                    if ses not in rotulos or int(t0) % 60 < CADA:
                        rotulos[ses] = rotulo(ses)
                    cap["rotulo"], cap["sub"] = rotulos[ses]
                    cap.update(ficha)
                else:  # Idle / Login pendiente / Sin sesión: la ficha, sin terminal (y sin enlaces de login)
                    if d["estado"] != "nosesion" and (ses not in rotulos or int(t0) % 60 < CADA):
                        rotulos[ses] = rotulo(ses)
                    cap = dict(ficha, lineas=[], ancho=120, alto=30, cmd="")
                    cap["rotulo"], cap["sub"] = rotulos.get(ses, ([], ""))
                vivas.append(ses)
                firma = dict(cap); firma.pop("cambio", None); firma.pop("desde", None)
                h = hashlib.sha1(json.dumps(firma, sort_keys=True).encode()).hexdigest()
                nuevas[ses] = h
                if forzar or huellas.get(ses) != h:
                    agentes[ses] = cap
            cambio_vivas = set(vivas) != set(huellas)
            if agentes or cambio_vivas or forzar or refrescar_inventario or t0 - ultimo_envio >= LATIDO:
                cuerpo = {"maquina": maquina, "completo": forzar, "conf": conf, "grok": grok, "agentes": agentes, "vivas": vivas, "terminales": terminales, "terminalesTs": terminales_ts, "ts": int(t0 * 1000)}
                r = enviar(cuerpo, tok, dry)
                ultimo_envio = t0
                huellas = nuevas
                forzar = bool(r.get("necesitaCompleto"))
                if forzar:
                    print("visor-publicar: el servidor pide envío completo (%s)" % time.strftime("%H:%M:%S"), file=sys.stderr, flush=True)
        except urllib.error.HTTPError as e:
            print("visor-publicar: HTTP %s (%s)" % (e.code, time.strftime("%H:%M:%S")), file=sys.stderr, flush=True)
            forzar = True
            time.sleep(10)
        except Exception as e:  # noqa: BLE001
            print("visor-publicar: %s (%s)" % (type(e).__name__, time.strftime("%H:%M:%S")), file=sys.stderr, flush=True)
            forzar = True
            time.sleep(5)
        if una:
            return 0
        time.sleep(max(0.5, CADA - (time.time() - t0)))


if __name__ == "__main__":
    sys.exit(main() or 0)
