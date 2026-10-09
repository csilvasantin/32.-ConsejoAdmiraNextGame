#!/usr/bin/env python3
"""pulso-tokens.py — tokens de hoy (Madrid) de Claude Code y Codex en este Mac → POST /api/consumos/pulso.

GrokBotBox, 09-10-2026. Solo stdlib. Se instala en ~/.fleet/pulso-tokens.py y lo lanza el LaunchAgent
com.admiranext.pulso-tokens cada 60 s. Lee (nunca escribe) los logs locales:
  - Claude Code: ~/.claude/projects/**/*.jsonl → mensajes assistant con message.usage
    (input + output + cache_creation = tokHoy; cache_read aparte = cacheHoy). Dedupe por message.id/requestId.
  - Codex: ~/.codex/sessions/AAAA/MM/DD/*.jsonl → eventos token_count. Se suma el DELTA de total_token_usage
    entre eventos consecutivos de cada fichero cuyo timestamp cae hoy (Madrid): sin doble conteo aunque un
    token_count se repita. tokHoy = (input − cached) + output; cacheHoy = cached.
Caché incremental (offsets por fichero) en ~/.fleet/pulso-cache.json. El token del endpoint se lee de
~/.config/admira/consumos-lecturas.token y nunca se imprime.
r19 (por proyecto): cada tokens se atribuye a un proyecto por su cwd (Claude: campo cwd de la línea; Codex: cwd de
session_meta / turn_context) → `git -C <cwd> remote get-url origin` (caché en ~/.fleet/pulso-proyectos.json) → uno
de los 13 proyectos de la Galaxia (misma lista que tools/hackeo-corpus.py); sin casar → «otros».
Uso: pulso-tokens.py [--dry-run] [--maquina NOMBRE]
"""
import glob, json, os, re, sys, time, socket, subprocess, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

MADRID = ZoneInfo("Europe/Madrid")
HOME = os.path.expanduser("~")
CACHE = os.path.join(HOME, ".fleet", "pulso-cache.json")
CACHE_PROY = os.path.join(HOME, ".fleet", "pulso-proyectos.json")

# repo (sin dueño, en minúsculas) → proyecto. Misma lista que tools/hackeo-corpus.py (13 proyectos de la Galaxia).
# clearchannel-tv sirve admira.biz y clearchannel.tv: como en el corpus, cuenta para el primero (admira.biz).
REPOS = {
    "admira-studio": "admira.studio", "admira-store": "admira.store", "admira-tv": "admira.tv", "admira-app": "admira.app",
    "clearchannel-tv": "admira.biz", "pixeria": "pixeria.com", "xpaceos": "xpaceos.com", "tool": "yokup.com",
    "admira-next-web": "admiranext.com", "ainimation": "ainimation.studio", "digitalavatar.ai": "digitalavatar.ai",
    "32.-consejoadmiranextgame": "admira.live",
}
OTROS = "otros"
_proy_cache = None


def _repo_de_url(url):
    m = re.search(r"[/:]([^/:]+?)(?:\.git)?/?$", (url or "").strip())
    return m.group(1).lower() if m else ""


def _por_ruta(cwd):
    """Sin git (carpeta borrada, worktree ya quitado): casa por nombre de carpeta en la ruta."""
    for parte in reversed(re.split(r"[/\\]", (cwd or "").lower())):
        parte = re.sub(r"^\d+\.-", "32.-", parte) if parte.endswith("consejoadmiranextgame") else parte
        if parte in REPOS:
            return REPOS[parte]
        if parte.endswith("consejoadmiranextgame"):
            return "admira.live"
    return OTROS


def proyecto_de(cwd):
    global _proy_cache
    if _proy_cache is None:
        try:
            with open(CACHE_PROY) as f:
                _proy_cache = json.load(f)
        except Exception:
            _proy_cache = {}
    if not cwd:
        return OTROS
    if cwd in _proy_cache:
        return _proy_cache[cwd]
    proy = None
    if os.path.isdir(cwd):
        try:
            r = subprocess.run(["git", "-C", cwd, "remote", "get-url", "origin"], capture_output=True, text=True, timeout=4)
            repo = _repo_de_url(r.stdout) if r.returncode == 0 else ""
            proy = REPOS.get(repo) if repo else None
        except Exception:
            proy = None
    proy = proy or _por_ruta(cwd)
    _proy_cache[cwd] = proy
    return proy


def guardar_proyectos():
    if _proy_cache is None:
        return
    try:
        tmp = CACHE_PROY + ".tmp"
        with open(tmp, "w") as f:
            json.dump(_proy_cache, f, separators=(",", ":"))
        os.replace(tmp, CACHE_PROY)
    except OSError:
        pass
TOKEN_FILE = os.path.join(HOME, ".config", "admira", "consumos-lecturas.token")
ENDPOINT = os.environ.get("PULSO_ENDPOINT", "https://www.admira.live/api/consumos/pulso")

# Atribución por máquina (encargo de Carlos, 09-10-2026). Clave: nombre corto de la máquina.
MAPA = {
    "MacMini": {"claude": ("Morfeo", "csilvasantin@gmail.com"), "codex": ("Oráculo", "csilvasantin@gmail.com")},
    "MacBookPro16": {"claude": ("Neo", "csilva@admira.com"), "codex": ("Trinity", "ChatGPT Pro")},
}


def maquina_local():
    n = (socket.gethostname() or "").lower()
    if "mini" in n:
        return "MacMini"
    if "pro-16" in n or "pro16" in n:
        return "MacBookPro16"
    return None


def ts_de(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None


def cargar_cache(dia):
    try:
        with open(CACHE) as f:
            c = json.load(f)
        if c.get("dia") == dia and c.get("v") == 3:
            return c
    except Exception:
        pass
    return {"v": 3, "dia": dia, "claude": {"files": {}, "msgs": {}}, "codex": {"files": {}}}


def guardar_cache(c):
    tmp = CACHE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(c, f, separators=(",", ":"))
    os.replace(tmp, CACHE)


def lineas_nuevas(path, offset):
    """Devuelve (lineas completas desde offset, nuevo offset). Si el fichero encogió, empieza de cero."""
    size = os.path.getsize(path)
    if size < offset:
        offset = 0
    if size == offset:
        return [], offset
    with open(path, "rb") as f:
        f.seek(offset)
        data = f.read()
    corte = data.rfind(b"\n")
    if corte < 0:
        return [], offset
    return data[: corte + 1].splitlines(), offset + corte + 1


def es_hoy(dt, dia):
    return dt is not None and dt.astimezone(MADRID).strftime("%Y-%m-%d") == dia


def claude(cache, dia, inicio_dia):
    st = cache["claude"]
    ultimo = None
    base = os.path.join(HOME, ".claude", "projects")
    for path in glob.glob(os.path.join(base, "**", "*.jsonl"), recursive=True):
        try:
            if os.path.getmtime(path) < inicio_dia:
                continue
            off = st["files"].get(path, 0)
            lineas, nuevo = lineas_nuevas(path, off)
        except OSError:
            continue
        for raw in lineas:
            if b'"usage"' not in raw:
                continue
            try:
                d = json.loads(raw)
            except Exception:
                continue
            if d.get("type") != "assistant":
                continue
            msg = d.get("message") or {}
            u = msg.get("usage") or {}
            dt = ts_de(d.get("timestamp"))
            if not es_hoy(dt, dia):
                continue
            clave = (msg.get("id") or "") + "|" + (d.get("requestId") or "")
            if clave == "|":
                clave = d.get("uuid") or ""
            vals = [int(u.get("input_tokens") or 0), int(u.get("output_tokens") or 0),
                    int(u.get("cache_creation_input_tokens") or 0), int(u.get("cache_read_input_tokens") or 0)]
            prev = st["msgs"].get(clave)
            # La misma respuesta aparece en varias líneas (una por bloque): nos quedamos con la mayor.
            if prev is None or sum(vals) > sum(prev[:4]):
                st["msgs"][clave] = vals + [int(dt.timestamp()), proyecto_de(d.get("cwd"))]
            if ultimo is None or dt > ultimo:
                ultimo = dt
        st["files"][path] = nuevo
    tok = sum(v[0] + v[1] + v[2] for v in st["msgs"].values())
    cache_r = sum(v[3] for v in st["msgs"].values())
    ult = max((v[4] for v in st["msgs"].values()), default=None)
    pp = {}
    for v in st["msgs"].values():
        pr = v[5] if len(v) > 5 else OTROS
        pp[pr] = pp.get(pr, 0) + v[0] + v[1] + v[2]
    return tok, cache_r, (datetime.fromtimestamp(ult, timezone.utc).isoformat().replace("+00:00", "Z") if ult else None), pp


def codex(cache, dia, inicio_dia):
    st = cache["codex"]
    hoy = datetime.now(MADRID)
    rutas = set()
    for delta in (0, 1):  # las sesiones de ayer que siguen vivas hoy están en la carpeta de ayer
        d = hoy - timedelta(days=delta)
        rutas.update(glob.glob(os.path.join(HOME, ".codex", "sessions", d.strftime("%Y/%m/%d"), "*.jsonl")))
    for path in rutas:
        try:
            if os.path.getmtime(path) < inicio_dia:
                continue
            f = st["files"].setdefault(path, {"off": 0, "prev": None, "tok": 0, "cache": 0, "ult": None, "cwd": None, "pp": {}})
            lineas, nuevo = lineas_nuevas(path, f["off"])
        except OSError:
            continue
        if nuevo < f["off"]:  # fichero reescrito: empezar de cero
            f.update({"prev": None, "tok": 0, "cache": 0})
        for raw in lineas:
            es_ctx = b'"session_meta"' in raw or b'"turn_context"' in raw
            if b'"token_count"' not in raw and not es_ctx:
                continue
            try:
                d = json.loads(raw)
            except Exception:
                continue
            p = d.get("payload") or {}
            if d.get("type") in ("session_meta", "turn_context") and p.get("cwd"):
                f["cwd"] = p.get("cwd")
                continue
            if p.get("type") != "token_count":
                continue
            tu = ((p.get("info") or {}).get("total_token_usage")) or None
            if not tu:
                continue
            cur = [int(tu.get("input_tokens") or 0), int(tu.get("cached_input_tokens") or 0), int(tu.get("output_tokens") or 0)]
            prev = f["prev"] or [0, 0, 0]
            dt = ts_de(d.get("timestamp"))
            if es_hoy(dt, dia):
                if cur[0] < prev[0] or cur[2] < prev[2]:
                    prev = [0, 0, 0]  # contador reiniciado
                d_in, d_cache, d_out = cur[0] - prev[0], max(0, cur[1] - prev[1]), cur[2] - prev[2]
                if d_in or d_out:
                    pr = proyecto_de(f.get("cwd"))
                    f.setdefault("pp", {})[pr] = f["pp"].get(pr, 0) + max(0, d_in - d_cache) + d_out
                    f["tok"] += max(0, d_in - d_cache) + d_out
                    f["cache"] += d_cache
                    f["ult"] = dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
            f["prev"] = cur
        f["off"] = nuevo
    files = st["files"].values()
    ult = max((f["ult"] for f in files if f.get("ult")), default=None)
    pp = {}
    for f in files:
        for pr, t in (f.get("pp") or {}).items():
            pp[pr] = pp.get(pr, 0) + t
    return sum(f["tok"] for f in files), sum(f["cache"] for f in files), ult, pp


def main():
    dry = "--dry-run" in sys.argv
    maq = sys.argv[sys.argv.index("--maquina") + 1] if "--maquina" in sys.argv else maquina_local()
    if maq not in MAPA:
        print("pulso: máquina no reconocida (%r); usa --maquina MacMini|MacBookPro16" % maq, file=sys.stderr)
        return 2
    ahora = datetime.now(MADRID)
    dia = ahora.strftime("%Y-%m-%d")
    inicio = ahora.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    t0 = time.time()
    cache = cargar_cache(dia)
    agentes = []
    for motor, fn in (("claude", claude), ("codex", codex)):
        tok, cache_r, ult, pp = fn(cache, dia, inicio)
        nombre, cuenta = MAPA[maq][motor]
        agentes.append({"agente": nombre, "motor": motor, "cuenta": cuenta, "tokHoy": tok, "cacheHoy": cache_r, "ultimoEvento": ult,
                        "porProyecto": {k: v for k, v in sorted(pp.items(), key=lambda x: -x[1]) if v > 0}})
    guardar_cache(cache)
    guardar_proyectos()
    cuerpo = {"maquina": maq, "agentes": agentes, "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")}
    resumen = " · ".join("%s/%s %s tok (+%s cache) %s" % (a["agente"], a["motor"], format(a["tokHoy"], ","), format(a["cacheHoy"], ","),
                          json.dumps(a["porProyecto"], ensure_ascii=False)) for a in agentes)
    print("%s %s %s [%.1fs]" % (ahora.strftime("%H:%M:%S"), maq, resumen, time.time() - t0))
    if dry:
        return 0
    try:
        with open(TOKEN_FILE) as f:
            token = f.read().strip()
    except OSError:
        print("pulso: falta %s" % TOKEN_FILE, file=sys.stderr)
        return 3
    req = urllib.request.Request(ENDPOINT, data=json.dumps(cuerpo).encode(), method="POST",
                                 headers={"content-type": "application/json", "X-Council-Token": token, "user-agent": "pulso-tokens/1"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            print("  POST %s → %s %s" % (ENDPOINT, r.status, r.read(300).decode("utf-8", "replace")))
    except urllib.error.HTTPError as e:
        print("  POST → HTTP %s %s" % (e.code, e.read(300).decode("utf-8", "replace")), file=sys.stderr)
        return 4
    except Exception as e:
        print("  POST → error %s" % e, file=sys.stderr)
        return 5
    return 0


if __name__ == "__main__":
    sys.exit(main())
