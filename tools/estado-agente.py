#!/usr/bin/env python3
"""estado-agente.py — ÚNICA fuente de verdad del estado de un deepagent (r31 · Carlos 11-10-2026 13:13).

«Que la cuadrícula del Mac y el visor del Fold digan lo mismo»: lo usan
  · panel-agente.sh (cuadratura del MBP16 / MBP14 / mitad Grok del Air)  →  estado-agente.py --sh <sesión> <Persona>
  · visor-publicar.py (admira.live/visor, MBP16 y Mac mini)              →  import + decidir(sesión, persona)
Ambos, en el mismo Mac, comparten el estado guardado en ~/.cache/admiranext/estado-agentes/<sesión>.json (con lock),
así que la histéresis es la misma por construcción, no por copiar reglas.

Estados:
  vivo     → hay indicio de trabajo («esc to interrupt», «Working (», spinner…) o la pantalla cambió hace < IDLE_TRAS s
  idle     → IDLE_TRAS s (80) sin cambios ni indicios
  login    → la pantalla pide iniciar sesión (Not logged in / Login expired / Paste code / Run /login …)  «Login pendiente»
  nosesion → no existe la sesión tmux                                                                  «Sin sesión»
Histéresis: entra en vivo al primer indicio; vuelve a idle tras IDLE_TRAS s quieto.
Indicios también: «shell still running», «background terminal(s) running», «Running», spinner… y, si su encargo está
in_progress, sigue en misión mientras la pantalla cambió hace < EN_CURSO_S (10 min): un deploy largo deja la pantalla quieta.
Última misión: admira.live/Yokup (en curso > acusada > última hecha), cacheada 60 s: «#NNNN · estado · título».
Solo lee: capture-pane / list-sessions. Nunca escribe en la sesión del agente. Solo stdlib (Python 3.9 de macOS).
"""
import fcntl, json, os, re, subprocess, sys, time, unicodedata, urllib.request, zlib

VERSION = "r31"
HOME = os.path.expanduser("~")
DIR = os.path.join(HOME, ".cache", "admiranext", "estado-agentes")
IDLE_TRAS = int(os.environ.get("IDLE_TRAS", "80"))
MISION_CADA = 60
INBOX = "https://bot.yokup.com/api/public/inbox?persona="
TMUX = next((p for p in ("/opt/homebrew/bin/tmux", "/usr/local/bin/tmux", "/usr/bin/tmux") if os.path.exists(p)), "tmux")
FIGLET = next((p for p in ("/opt/homebrew/bin/figlet", "/usr/local/bin/figlet", "/usr/bin/figlet") if os.path.exists(p)), "")

RX_RELOJ = re.compile(r"[0-9]+:[0-9]{2}( |$)")
BORDES = str.maketrans("", "", " \t─━│╭╮╰╯-")
RX_TRABAJO = re.compile(r"esc to interrupt|Working \(|esc to cancel|ctrl\+c to (stop|interrupt)|[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] |Thinking|Running…|… \([0-9]+[ms]"
                        r"|shells? still running|background (terminal|shell|task|job)s? running|[0-9]+ (shells?|background)\b|\bRunning\b")
# r31: un encargo in_progress con la pantalla quieta < EN_CURSO_S cuenta como en misión (deploys largos en segundo plano)
EN_CURSO_S = int(os.environ.get("EN_CURSO_S", "600"))
RX_LOGIN = re.compile(r"Not logged in|Login expired|Paste code here|Run /login|Please run /login|run /login|Sign in with ChatGPT|Browser didn't open\? Use the url below to sign in|OAuth (token|error)", re.I)
ETIQUETA = {"vivo": "en misión", "idle": "Idle", "login": "Login pendiente", "nosesion": "Sin sesión"}


def _tmux(*args):
    try:
        r = subprocess.run([TMUX, *args], capture_output=True, text=True, timeout=8)
        return r.returncode, r.stdout
    except Exception:
        return 1, ""


def existe(ses):
    rc, out = _tmux("list-sessions", "-F", "#{session_name}")
    return rc == 0 and ses in out.split("\n")


def pantalla(ses):
    rc, out = _tmux("capture-pane", "-p", "-J", "-t", "=%s:" % ses)
    return out if rc == 0 else None


def huella(txt):
    ls = [l for l in txt.split("\n") if not RX_RELOJ.search(l)]
    return "%08x" % (zlib.crc32("\n".join(l.translate(BORDES) for l in ls).encode("utf-8", "replace")) & 0xffffffff)


def ultimas(txt, n):
    return [l for l in txt.split("\n") if l.strip()][-n:]


def trabajando(txt):
    return any(RX_TRABAJO.search(l) for l in ultimas(txt, 10))


def pide_login(txt):
    return any(RX_LOGIN.search(l) for l in ultimas(txt, 16))


def persona_de(nombre):
    s = unicodedata.normalize("NFD", (nombre or "").split("·")[0]).encode("ascii", "ignore").decode()
    s = re.sub(r"[^A-Za-z]", "", s)
    return s[:1].upper() + s[1:].lower()


def etiquetas(titulo, host):
    """modelo y Mac de la línea de info, igual que cuadratura.sh («Neo · Claude» + macbook-pro-16 → Claude Code · MacBook Pro 16)."""
    resto = (titulo or "").split(" · ", 1)[1] if " · " in (titulo or "") else (titulo or "")
    mod = "Claude Code" if resto.startswith("Claude") else "Codex CLI" if resto.startswith("Codex") else "Grok CLI" if resto.startswith("Grok") else resto
    h = (host or "").lower()
    mac = ("MacBook Pro 16" if h.startswith("macbook-pro-16") else "MacBook Pro 14" if h.startswith(("macbookpronegro14", "macbook-pro-14"))
           else "Mac mini" if h.startswith("macmini") else "MacBook Air 16" if h.startswith("macbookair16")
           else "GrokBotBox" if h.startswith("grokbotbox") else host)
    return mod, mac


_ARTE = {}


def arte(nombre):
    """Nombre grande como en el Idle del Mac (figlet big; sin figlet, None y el visor usa su rótulo)."""
    k = unicodedata.normalize("NFD", nombre or "").encode("ascii", "ignore").decode().upper()
    if k in _ARTE:
        return _ARTE[k]
    a = None
    if FIGLET:
        try:
            out = subprocess.run([FIGLET, "-w", "200", "-f", "big", k], capture_output=True, text=True, timeout=5).stdout
            ls = [l.rstrip() for l in out.split("\n")]
            while ls and not ls[-1].strip():
                ls.pop()
            a = ls or None
        except Exception:
            a = None
    _ARTE[k] = a
    return a


def _mision(persona):
    try:
        req = urllib.request.Request(INBOX + persona, headers={"user-agent": "estado-agente/" + VERSION})
        with urllib.request.urlopen(req, timeout=5) as r:
            it = json.loads(r.read() or b"{}").get("items", [])
    except Exception:
        return None
    k = lambda x: -max(x.get("ts") or 0, x.get("ack_at") or 0, x.get("done_at") or 0)
    for st in ("in_progress", "ack", "done"):
        xs = sorted([i for i in it if i.get("status") == st], key=k)
        if xs:
            i = xs[0]
            return "#%s · %s · %s" % (i.get("id"), st, " ".join((i.get("text") or "").split()))
    return "sin misiones registradas"


def decidir(ses, persona=None, ahora=None):
    """Decide y guarda (con lock) el estado de la sesión. Devuelve dict: estado, etiqueta, mision, cambio, desde, pantalla."""
    ahora = time.time() if ahora is None else ahora
    os.makedirs(DIR, exist_ok=True)
    ruta = os.path.join(DIR, re.sub(r"[^A-Za-z0-9._-]", "_", ses) + ".json")
    with open(ruta + ".lock", "a+") as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        try:
            st = json.load(open(ruta))
        except Exception:
            st = {}
        persona = persona or persona_de(ses)
        if ahora - st.get("mis_t", 0) >= MISION_CADA:
            st["mis_t"] = ahora
            m = _mision(persona)
            if m:
                st["mis"] = m
        en_curso = " · in_progress · " in (st.get("mis") or "")
        txt = pantalla(ses) if existe(ses) else None
        if txt is None:
            est = "nosesion"
        else:
            h = huella(txt)
            visto = st.get("visto", 0)
            # el primer vistazo (o uno tras > 30 s sin nadie mirando) no cuenta como actividad
            if h != st.get("h") and st.get("h") and ahora - visto < 30:
                st["cambio"] = ahora
            st["h"], st["visto"] = h, ahora
            if trabajando(txt):
                st["cambio"] = ahora
            if trabajando(txt):
                est = "vivo"
            elif pide_login(txt):
                est = "login"  # una pantalla de login que cambia (código pegado, etc.) no es una misión
            elif ahora - st.get("cambio", 0) < (EN_CURSO_S if en_curso else IDLE_TRAS):
                est = "vivo"
            else:
                est = "idle"
        if est != st.get("est"):
            st["est"], st["desde"] = est, ahora
        tmp = ruta + ".tmp%d" % os.getpid()
        with open(tmp, "w") as f:
            json.dump({k: v for k, v in st.items() if k != "pantalla"}, f)
        os.replace(tmp, ruta)
    return {"estado": est, "etiqueta": ETIQUETA[est], "mision": st.get("mis") or "sin misiones registradas",
            "cambio": int(st.get("cambio", 0) * 1000), "desde": int(st.get("desde", ahora) * 1000), "pantalla": txt}


def _q(s):
    return "'" + str(s).replace("'", "'\\''") + "'"


def main(argv):
    if len(argv) >= 2 and argv[0] in ("--sh", "--json"):
        r = decidir(argv[1], argv[2] if len(argv) > 2 else None)
        if argv[0] == "--json":
            r.pop("pantalla", None)
            print(json.dumps(r, ensure_ascii=False))
        else:
            print("E=%s; ETQ=%s; MIS=%s" % (_q(r["estado"]), _q(r["etiqueta"]), _q(r["mision"])))
        return 0
    print("uso: estado-agente.py --sh|--json <sesión-tmux> [Persona]", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
