#!/usr/bin/env python3
"""visor-publicar.py — publica la pantalla de los deepagents de pago para admira.live/visor (r27 · Carlos 11-10-2026).

Lee la MISMA lista que la cuadratura del Mac: ~/.config/admiranext/cuadratura.conf (Título|host|sesión-tmux|skin).
Cada 3 s, para las líneas cuyo host es ESTE Mac, hace `tmux capture-pane -p -e` (últimas ~60 líneas, con colores),
tapa secretos (tokens, claves, Bearer, sk-/ghp_/xai-…, password=…) y, solo si algo cambió, hace POST a
https://www.admira.live/api/visor/pane con el token de máquina (~/.config/admira/consumos-lecturas.token o
COUNCIL_MACHINE_TOKEN). Latido cada 60 s aunque no cambie nada. Solo stdlib; el token nunca se imprime.
Lo lanza el LaunchAgent com.admiranext.visor-publicar (KeepAlive). Uso: visor-publicar.py [--una] [--dry-run]
"""
import hashlib, json, os, re, subprocess, sys, time, urllib.request, urllib.error

HOME = os.path.expanduser("~")
CONF = os.path.join(HOME, ".config", "admiranext", "cuadratura.conf")
URL = os.environ.get("VISOR_URL", "https://www.admira.live/api/visor/pane")
CADA = float(os.environ.get("VISOR_CADA", "3"))
LATIDO = 60
LINEAS = 60
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
RX_PORTADOR = re.compile(r"\b(Bearer|Basic|token)\s+[A-Za-z0-9._~+/=\-]{12,}", re.I)
RX_ASIG = re.compile(r"((?:pass(?:word|wd)?|pwd|contrase(?:ñ|n)a|clave|secret|api[_-]?key|access[_-]?key|token)[A-Za-z_\-]*[\"']?\s*[:=]\s*[\"']?)([^\s\"'\x1b]{4,})", re.I)


def tapar(s):
    for rx in PATRONES:
        s = rx.sub("[oculto]", s)
    s = RX_PORTADOR.sub(lambda m: m.group(1) + " [oculto]", s)
    return RX_ASIG.sub(lambda m: m.group(1) + "[oculto]", s)


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
    try:
        return subprocess.run(["scutil", "--get", "LocalHostName"], capture_output=True, text=True, timeout=5).stdout.strip().lower()
    except Exception:
        return os.uname().nodename.split(".")[0].lower()


def leer_conf():
    try:
        lineas = [l.strip() for l in open(CONF, encoding="utf-8") if l.strip() and not l.lstrip().startswith("#") and "|" in l]
    except OSError:
        lineas = DEFECTO
    out = []
    for l in lineas[:4]:
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
        rc, v = tmux("show-options", "-v", "-t", ses, "status-format[%d]" % i)
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
    rc, txt = tmux("capture-pane", "-p", "-e", "-t", ses, "-S", "-%d" % LINEAS)
    if rc != 0:
        return None
    lineas = txt.split("\n")
    while lineas and not re.sub(r"\x1b\[[0-9;]*m", "", lineas[-1]).strip():
        lineas.pop()
    _, dim = tmux("display-message", "-p", "-t", ses, "#{pane_width} #{pane_height} #{pane_current_command}")
    p = (dim.split() + ["120", "30", ""])[:3]
    return {"lineas": [tapar(l) for l in lineas[-LINEAS:]], "ancho": int(p[0] or 120), "alto": int(p[1] or 30), "cmd": p[2]}


def enviar(cuerpo, tok, dry):
    datos = json.dumps(cuerpo).encode()
    if dry:
        print("dry-run:", len(datos), "bytes", list(cuerpo["agentes"]), "vivas", cuerpo["vivas"])
        return {"ok": True}
    req = urllib.request.Request(URL, data=datos, method="POST", headers={"content-type": "application/json", "X-Council-Token": tok, "user-agent": "visor-publicar/1"})
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
    huellas, ultimo_envio, rotulos, forzar = {}, 0.0, {}, True
    while True:
        t0 = time.time()
        try:
            conf = leer_conf()
            mias = [c for c in conf if c["host"] == maquina]
            agentes, vivas, nuevas = {}, [], {}
            for c in mias:
                cap = capturar(c["sesion"])
                if cap is None:
                    continue
                vivas.append(c["sesion"])
                if c["sesion"] not in rotulos or int(t0) % 60 < CADA:
                    rotulos[c["sesion"]] = rotulo(c["sesion"])
                cap["rotulo"], cap["sub"] = rotulos[c["sesion"]]
                h = hashlib.sha1(json.dumps(cap, sort_keys=True).encode()).hexdigest()
                nuevas[c["sesion"]] = h
                if forzar or huellas.get(c["sesion"]) != h:
                    cap["cambio"] = int(t0 * 1000)
                    agentes[c["sesion"]] = cap
            cambio_vivas = set(vivas) != set(huellas)
            if mias and (agentes or cambio_vivas or forzar or t0 - ultimo_envio >= LATIDO):
                cuerpo = {"maquina": maquina, "completo": forzar, "conf": conf, "agentes": agentes, "vivas": vivas, "ts": int(t0 * 1000)}
                r = enviar(cuerpo, tok, dry)
                ultimo_envio = t0
                huellas = nuevas
                forzar = bool(r.get("necesitaCompleto"))
        except urllib.error.HTTPError as e:
            print("visor-publicar: HTTP %s" % e.code, file=sys.stderr)
            forzar = True
            time.sleep(10)
        except Exception as e:  # noqa: BLE001
            print("visor-publicar: %s" % type(e).__name__, file=sys.stderr)
            forzar = True
            time.sleep(5)
        if una:
            return 0
        time.sleep(max(0.5, CADA - (time.time() - t0)))


if __name__ == "__main__":
    sys.exit(main() or 0)
