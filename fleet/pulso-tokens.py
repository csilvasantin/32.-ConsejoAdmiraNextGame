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
r20 (con Carlos): regla de Carlos — si trabaja directamente con un agente, nadie le inyecta encargos. En cada
pasada se evalúa, por agente, conCarlos (ver con_carlos() más abajo: reposo del Mac < 5 min Y una señal a/b/c) y se
escribe ~/.fleet/con-carlos.json (lo lee el vigilante agent-inbox-watcher.sh antes de inyectar; sin red) y se manda
conCarlos + conCarlosMotivo + conCarlosDesde en el pulso. Nunca se envía contenido de las conversaciones.
r21 (Carlos, 09-10-2026 — «no salen los proyectos en los que trabajo»): el cwd de la sesión no basta (Neo arranca en
~/Claude/xpaceos-pub y trabaja en ~/Projects/csilvasantin/digitalavatar-metahuman-58; Trinity arranca en
~/Documents/ChatGPT/Yokup.com y trabaja en worktrees /tmp/trinity-* del repo pixeria). Ahora manda la RUTA DE TRABAJO
REAL: Claude → rutas que tocan las herramientas de ese mensaje (Bash/Read/Edit…), si no la última del mismo fichero
(≤ 30 min), si no el cwd; Codex → cwd de cada CommandExecution (file://…), si no session_meta/turn_context. Reglas por
carpeta (metahuman/unreal → admiranext.com) antes que el git remote; pixeria/pixer-worker → admira.studio (Adaptador).
Codex: sesiones de días anteriores que siguen vivas hoy (cualquier carpeta AAAA/MM/DD con mtime de hoy).
«otros» no se cachea (se reevalúa) y cada ruta que cae en «otros» queda en ~/.fleet/pulso-otros.json con sus tokens.
r27 (Smith, 09-10-2026): Smith corre el Grok CLI (~/.grok/bin/grok, sesión tmux «smith», modelo grok-4.7-build), NO
cursor-agent ni la cuenta Cursor Pro. Cada sesión deja ~/.grok/sessions/<cwd>/<id>/usage.json con turns[] (endedAt,
inputTokens [incluye la caché], cachedReadTokens, cacheCreationTokens, outputTokens). tokHoy = (input − cachedRead) +
cacheCreation + output de los turnos que ACABAN hoy (Madrid); cacheHoy = cachedRead (misma métrica que Claude/Codex).
Granularidad: por turno (un turno largo cae entero al acabar). Proyecto por turno: rutas y repos de GitHub que salen en
los logs de terminal de ese turno (terminal/*.log con mtime dentro del turno), si no el del turno anterior (≤ 30 min), si
no el cwd de la sesión.
Uso: pulso-tokens.py [--dry-run] [--maquina NOMBRE] [--con-carlos]   (--con-carlos: solo evalúa e imprime)
r40: MacBookAir16plata en MAPA; PULSO_MAQUINA=<nombre> fuerza la máquina si el hostname no la delata.
"""
import glob, json, os, re, sys, time, socket, subprocess, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

MADRID = ZoneInfo("Europe/Madrid")
HOME = os.path.expanduser("~")
CACHE = os.path.join(HOME, ".fleet", "pulso-cache.json")
CACHE_PROY = os.path.join(HOME, ".fleet", "pulso-proyectos-v2.json")
LOG_OTROS = os.path.join(HOME, ".fleet", "pulso-otros.json")

# repo (sin dueño, en minúsculas) → proyecto. Misma lista que tools/hackeo-corpus.py (13 proyectos de la Galaxia).
# clearchannel-tv sirve admira.biz y clearchannel.tv: como en el corpus, cuenta para el primero (admira.biz).
REPOS = {
    "admira-studio": "admira.studio", "admira-store": "admira.store", "admira-tv": "admira.tv", "admira-app": "admira.app",
    "clearchannel-tv": "admira.biz", "pixeria": "pixeria.com", "xpaceos": "xpaceos.com", "tool": "yokup.com",
    "admira-next-web": "admiranext.com", "ainimation": "ainimation.studio", "digitalavatar.ai": "digitalavatar.ai",
    "32.-consejoadmiranextgame": "admira.live",
    # r20: el Adaptador / Admira Studio vive en el repo pixeria (y su worker); pixeria.com.git aloja el MetaHuman.
    "pixeria.com": "admira.studio", "pixer-worker": "admira.studio", "admira-telegram": "admira.live",
}
REPOS["pixeria"] = "admira.studio"
# r20: reglas por nombre de carpeta, ANTES que el git remote (el repo no siempre dice el proyecto).
REGLAS_RUTA = [
    (re.compile(r"metahuman|unreal|ue_5"), "admiranext.com"),
    (re.compile(r"consejoadmiranextgame|admira-live|admira-telegram|^admira-vault$"), "admira.live"),
    (re.compile(r"admira-next-web|admiranext-web|admira-presentation|admira-remote-presentation"), "admiranext.com"),
    (re.compile(r"admira-studio|pixeria|pixer-|adaptador|adapter"), "admira.studio"),
    (re.compile(r"admira-store|^store-"), "admira.store"),
    (re.compile(r"admira-tv|^tv-"), "admira.tv"),
    (re.compile(r"clearchannel|admira-biz|^biz-"), "admira.biz"),
    (re.compile(r"admira-app|^app-"), "admira.app"),
    (re.compile(r"xpaceos|xpacio"), "xpaceos.com"),
    (re.compile(r"yokup"), "yokup.com"),
    (re.compile(r"ainimation"), "ainimation.studio"),
    (re.compile(r"digitalavatar"), "digitalavatar.ai"),
]
# Rutas que NO dicen nada del proyecto (logs, memorias, scratch de las apps): se ignoran al buscar la ruta de trabajo.
RUTA_NEUTRA = re.compile(r"/(\.claude|\.codex|\.grok|\.fleet|\.config|\.agents-comms|\.local|library|claude-\d+)(/|$)|/admira-vault(/|$)", re.I)
RX_RUTA = re.compile(r"(?:file://)?((?:/Users/[^/\s\"'`]+|/private/tmp|/tmp|~)/[^\s\"'`;|&<>()$*]+)")
OTROS = "otros"
_proy_cache = None


def _repo_de_url(url):
    m = re.search(r"[/:]([^/:]+?)(?:\.git)?/?$", (url or "").strip())
    return m.group(1).lower() if m else ""


def _por_regla(cwd):
    for parte in reversed(re.split(r"[/\\]", (cwd or "").lower())):
        for rx, proy in REGLAS_RUTA:
            if parte and rx.search(parte):
                return proy
    return None


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
    cwd = str(cwd)
    if cwd.startswith("file://"):
        cwd = cwd[7:]
    if cwd in _proy_cache:
        return _proy_cache[cwd]
    proy = _por_regla(cwd)
    if not proy and os.path.isdir(cwd):
        try:
            r = subprocess.run(["git", "-C", cwd, "remote", "get-url", "origin"], capture_output=True, text=True, timeout=4)
            repo = _repo_de_url(r.stdout) if r.returncode == 0 else ""
            proy = (REPOS.get(repo) or _por_regla(repo)) if repo else None  # r20: xpaceos-mcp → xpaceos.com
        except Exception:
            proy = None
    proy = proy or _por_ruta(cwd)
    if proy != OTROS:
        _proy_cache[cwd] = proy  # «otros» no se cachea: se reevalúa (carpetas nuevas, reglas nuevas)
    return proy


def _dir_trabajo(ruta):
    """Ruta de fichero/carpeta → carpeta de trabajo (hasta 6 niveles) para preguntar a git y a las reglas."""
    r = os.path.expanduser(ruta.rstrip("/.,:"))
    if r.startswith("/private/tmp/"):
        r = r[8:]
    partes = r.split("/")
    r = "/".join(partes[:7]) if r.startswith(("/Users/", "/home/")) else "/".join(partes[:4])
    if os.path.isfile(r):
        r = os.path.dirname(r)
    return r


def proyecto_de_rutas(texto):
    """Primer proyecto (≠ otros) de las rutas que aparecen en el texto de una herramienta; None si ninguna casa."""
    vistos = set()
    for m in RX_RUTA.finditer(texto or ""):
        ruta = m.group(1)
        if RUTA_NEUTRA.search(ruta.lower()):
            continue
        d = _dir_trabajo(ruta)
        if not d or d in vistos or d.count("/") < 3:
            continue
        vistos.add(d)
        pr = proyecto_de(d)
        if pr != OTROS:
            return pr
    return None


_otros = {}


def anota_otros(ruta, tok):
    if tok > 0:
        k = (ruta or "(sin cwd)")[:200]
        _otros[k] = _otros.get(k, 0) + tok


def guardar_otros():
    try:
        with open(LOG_OTROS, "w") as f:
            json.dump({"actualizado": datetime.now(MADRID).isoformat(timespec="seconds"),
                       "rutas": dict(sorted(_otros.items(), key=lambda x: -x[1])[:60])}, f, ensure_ascii=False, indent=1)
    except OSError:
        pass


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
    "MacMini": {"claude": ("Morfeo", "csilvasantin@gmail.com"), "codex": ("Oráculo", "csilvasantin@gmail.com"), "grok": ("Smith", "Grok CLI (grok-4.7)")},
    "MacBookPro16": {"claude": ("Neo", "csilva@admira.com"), "codex": ("Trinity", "ChatGPT Pro")},
    # r40 (Carlos, 10-10-2026): el Mac donde trabaja Carlos no mandaba pulso (máquina no reconocida → salía con código 2).
    # r41 (Carlos, 12:48 — «Neo está conmigo en el MBP16, no en el Air»): el pulso atribuye por MOTOR, y en el Air los
    # agentes que viven ahí son los de tmux con bot-inbox: Morfeo (Claude, tmux «morfeo») y Oráculo (Codex, tmux
    # «oraculo»). Atribuir Claude→Neo y Codex→Trinity aquí ponía a Neo «con Carlos» en el Air estando en el MBP16.
    # Los tokens de la app de escritorio de este Mac (si la hay) cuentan para el mismo motor: Morfeo / Oráculo.
    "MacBookAir16plata": {"claude": ("Morfeo", "por confirmar (MacBookAir16plata)"), "codex": ("Oráculo", "por confirmar (MacBookAir16plata)")},
    # r14 (Carlos, 14:39): el MBP14 negro no tiene agentes de tokens propios; manda solo «grokbotApp» (Jobs y Wozniak).
    "MacBookProNegro14": {},
}

# r14: la app de escritorio Grok Bot de este Mac. Sin secretos: proceso vivo, desktop-status.json (signedIn,
# appVersion) y la cuenta de un fichero de config NO secreto, porque la app no guarda la cuenta en claro fuera de su
# sesión (cookies/tokens, que no se leen). Una línea: csilva@admira.com (Jobs + Wozniak) o csilvasantin@gmail.com (Musk + Huang).
GROKBOT_CUENTA_FILE = os.path.join(HOME, ".config", "admiranext", "grokbot-cuenta")
GROKBOT_STATUS_FILE = os.path.join(HOME, "Library", "Application Support", "Grok Bot", "desktop-status.json")


def grokbot_app(reposo=None, frente=None):
    abierta = bool(_cmd(["pgrep", "-f", "Grok Bot.app/Contents/MacOS/Grok Bot"]).strip())
    estado = {}
    try:
        with open(GROKBOT_STATUS_FILE) as f:
            estado = json.load(f) or {}
    except Exception:
        estado = {}
    cuenta = None
    try:
        with open(GROKBOT_CUENTA_FILE) as f:
            cuenta = (f.read().strip().splitlines() or [""])[0].strip().lower() or None
    except OSError:
        pass
    return {"abierta": abierta, "firmada": estado.get("signedIn") if isinstance(estado.get("signedIn"), bool) else None,
            "cuenta": cuenta, "alFrente": abierta and (frente or "") == "Grok Bot", "reposoS": reposo,
            "version": str(estado.get("appVersion") or "")[:20] or None}


def maquina_local():
    forzada = os.environ.get("PULSO_MAQUINA")
    if forzada:
        return forzada
    n = (socket.gethostname() or "").lower()
    if "negro14" in n:
        return "MacBookProNegro14"
    if "air16plata" in n or "air-16-plata" in n:
        return "MacBookAir16plata"
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
        if c.get("dia") == dia and c.get("v") == 4:
            return c
    except Exception:
        pass
    # v4 (r20): se reprocesa el día con la atribución por ruta de trabajo real.
    return {"v": 4, "dia": dia, "claude": {"files": {}, "msgs": {}, "ult": {}}, "codex": {"files": {}}}


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
            # r20: ruta de trabajo real = la que tocan las herramientas de este mensaje; si no, la última del fichero (≤ 30 min).
            usos = [json.dumps(x.get("input"), ensure_ascii=False) for x in (msg.get("content") or []) if isinstance(x, dict) and x.get("type") == "tool_use"]
            pr_tool = proyecto_de_rutas(" ".join(usos)) if usos else None
            ult = st.setdefault("ult", {})
            if pr_tool:
                ult[path] = [pr_tool, int(dt.timestamp())]
            elif path in ult and int(dt.timestamp()) - ult[path][1] <= 1800:
                pr_tool = ult[path][0]
            pr = pr_tool or proyecto_de(d.get("cwd"))
            clave = (msg.get("id") or "") + "|" + (d.get("requestId") or "")
            if clave == "|":
                clave = d.get("uuid") or ""
            vals = [int(u.get("input_tokens") or 0), int(u.get("output_tokens") or 0),
                    int(u.get("cache_creation_input_tokens") or 0), int(u.get("cache_read_input_tokens") or 0)]
            prev = st["msgs"].get(clave)
            # La misma respuesta aparece en varias líneas (una por bloque): nos quedamos con la mayor.
            if prev is None or sum(vals) > sum(prev[:4]):
                st["msgs"][clave] = vals + [int(dt.timestamp()), pr, d.get("cwd") or ""]
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
        if pr == OTROS:
            anota_otros("claude:" + (v[6] if len(v) > 6 else ""), v[0] + v[1] + v[2])
    return tok, cache_r, (datetime.fromtimestamp(ult, timezone.utc).isoformat().replace("+00:00", "Z") if ult else None), pp


def codex(cache, dia, inicio_dia):
    st = cache["codex"]
    hoy = datetime.now(MADRID)
    rutas = set()
    # r20: una sesión de Codex vive en la carpeta del día en que EMPEZÓ (Trinity lleva desde el 07-10): se miran
    # las de los últimos 14 días y se filtran por mtime de hoy.
    for delta in range(0, 15):
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
            es_exec = b'"CommandExecution"' in raw and b'"cwd"' in raw
            if b'"token_count"' not in raw and not es_ctx and not es_exec:
                continue
            try:
                d = json.loads(raw)
            except Exception:
                continue
            p = d.get("payload") or {}
            if d.get("type") in ("session_meta", "turn_context") and p.get("cwd"):
                if not f.get("cwd_exec"):
                    f["cwd"] = p.get("cwd")
                f["cwd_sesion"] = p.get("cwd")
                continue
            it = p.get("item") or {}
            if p.get("type") == "item_completed" and it.get("type") == "CommandExecution" and it.get("cwd"):
                # r20: el cwd del comando es donde trabaja de verdad (worktrees /tmp/trinity-*, ~/Projects/*).
                c = str(it.get("cwd"))
                c = c[7:] if c.startswith("file://") else c
                if not RUTA_NEUTRA.search(c.lower()):
                    if c != f.get("cwd_sesion") or not f.get("cwd_exec"):
                        f["cwd"] = c
                        f["cwd_exec"] = True
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
                    if pr == OTROS:
                        po = f.setdefault("otros", {})
                        po[f.get("cwd") or ""] = po.get(f.get("cwd") or "", 0) + max(0, d_in - d_cache) + d_out
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
        for c, t in (f.get("otros") or {}).items():
            anota_otros("codex:" + c, t)
    return sum(f["tok"] for f in files), sum(f["cache"] for f in files), ult, pp


RX_GITHUB = re.compile(r"github\.com[/:]csilvasantin/([A-Za-z0-9._-]+?)(?:\.git)?(?:[/\s\"'#?]|$)")


def proyecto_de_texto(texto):
    """r27: proyecto por rutas (como Claude) y, si no, por repos de GitHub que salen en el texto. None si nada casa."""
    pr = proyecto_de_rutas(texto)
    if pr:
        return pr
    for m in RX_GITHUB.finditer(texto or ""):
        repo = m.group(1).lower()
        pr = REPOS.get(repo) or _por_regla(repo)
        if pr:
            return pr
    return None


def turnos_grok(usage, ini_dia, fin_dia):
    """Pura: turnos de un usage.json del Grok CLI que acaban en [ini_dia, fin_dia) → [(n, ts_fin, tok, cache, ts_ini)]."""
    out, prev = [], None
    for t in sorted(usage.get("turns") or [], key=lambda x: x.get("turnNumber") or 0):
        dt = ts_de(t.get("endedAt"))
        if dt is None:
            continue
        fin = dt.timestamp()
        if ini_dia <= fin < fin_dia:
            i, c = int(t.get("inputTokens") or 0), int(t.get("cachedReadTokens") or 0)
            tok = max(0, i - c) + int(t.get("cacheCreationTokens") or 0) + int(t.get("outputTokens") or 0)
            out.append((int(t.get("turnNumber") or 0), fin, tok, c, prev if prev is not None else fin - 3600))
        prev = fin
    return out


def grok(cache, dia, inicio_dia):
    import urllib.parse
    st = cache.setdefault("grok", {"turnos": {}, "ult": {}})
    base = os.path.join(HOME, ".grok", "sessions")
    for path in glob.glob(os.path.join(base, "*", "*", "usage.json")):
        try:
            if os.path.getmtime(path) < inicio_dia:
                continue
            with open(path) as f:
                usage = json.load(f)
        except Exception:
            continue
        sdir = os.path.dirname(path)
        cwd = urllib.parse.unquote(os.path.basename(os.path.dirname(sdir)))
        logs = None
        for n, fin, tok, cr, ini in turnos_grok(usage, inicio_dia, inicio_dia + 86400 + 7200):
            clave = sdir + "#" + str(n)
            if clave in st["turnos"]:
                continue
            if logs is None:
                logs = []
                for lg in glob.glob(os.path.join(sdir, "terminal", "*.log")):
                    try:
                        mt = os.path.getmtime(lg)
                    except OSError:
                        continue
                    if mt >= inicio_dia - 3600:
                        logs.append((mt, lg))
            texto = []
            for mt, lg in sorted(logs):
                if ini < mt <= fin + 5 and len(texto) < 60:
                    try:
                        with open(lg, "rb") as h:
                            texto.append(h.read(4096).decode("utf-8", "replace"))
                    except OSError:
                        pass
            pr = proyecto_de_texto("\n".join(texto))
            u = st["ult"].get(sdir)
            if pr:
                st["ult"][sdir] = [pr, fin]
            elif u and fin - u[1] <= 1800:
                pr = u[0]
            pr = pr or proyecto_de(cwd if cwd not in ("/", HOME) else None)
            st["turnos"][clave] = [tok, cr, int(fin), pr, cwd]
    vals = [v for v in st["turnos"].values() if es_hoy(datetime.fromtimestamp(v[2], timezone.utc), dia)]
    pp = {}
    for v in vals:
        pp[v[3]] = pp.get(v[3], 0) + v[0]
        if v[3] == OTROS:
            anota_otros("grok:" + (v[4] or ""), v[0])
    ult = max((v[2] for v in vals), default=None)
    return (sum(v[0] for v in vals), sum(v[1] for v in vals),
            datetime.fromtimestamp(ult, timezone.utc).isoformat().replace("+00:00", "Z") if ult else None, pp)


# ───────────────────────── r20 · ¿Está Carlos trabajando con este agente? ─────────────────────────
# conCarlos = reposo HID del Mac < 5 min  Y  alguna de:
#  (a) la app al frente es la de Claude (→ agente claude de este Mac) o la de Codex/ChatGPT (→ agente codex) y esa
#      app tiene actividad de sesión en los últimos 5 min (logs con entrypoint claude-desktop / originator *desktop*);
#  (b) la sesión tmux del agente tiene un cliente adjunto activo hace < 5 min y la app al frente es un terminal;
#  (c) el último turno de usuario del agente en sus logs es un prompt TECLEADO por una persona hace < 5 min
#      (no un aviso inyectado: «Nuevo(s) encargo(s) en tu bot-inbox», «[MISIÓN AUTO-ASIGNADA», «[ENCARGO #»…).
# Conservador: sin reposo < 5 min no hay conCarlos; si una señal no se puede leer, no cuenta.
CON_CARLOS_FILE = os.path.join(HOME, ".fleet", "con-carlos.json")
VENTANA_CC_S = 300
APPS_CLAUDE = {"claude"}
APPS_CODEX = {"codex", "chatgpt"}
APPS_TERMINAL = {"terminal", "iterm2", "iterm", "ghostty", "wezterm", "alacritty", "kitty", "warp", "hyper", "tabby"}
INYECTADO = re.compile(
    r"^\s*(nuevos?(\(s\))?\s+encargos?(\(s\))?\s+en\s+tu\s+bot-inbox|\[misi[oó]n auto-asignada|\[encargo\s*#|"
    r"\[ventana|\[agora|\[recordatorio|\[aviso|eres\s+\w+\s+en\s+\S+\.\s+(primero|recl)|<task-notification|<command-|"
    r"<local-command|<system-reminder|<user-prompt-submit-hook|caveat:|\[request interrupted)", re.I)


def es_inyectado(texto):
    """True si el turno de usuario lo puso una máquina (vigilante, hooks, notificaciones), no una persona."""
    t = str(texto or "")
    m = re.match(r"\s*<pasted_content[^>]*>\s*", t)  # el vigilante pega por tmux: el pegado envuelve el aviso
    if m:
        t = t[m.end():]
    t = t.strip()
    if not t:
        return True
    return bool(INYECTADO.match(t))


def texto_usuario_claude(d):
    """Texto de un turno de usuario de Claude Code (o None si no es un prompt: tool_result, meta, sidechain)."""
    if d.get("type") != "user" or d.get("isMeta") or d.get("isSidechain") or d.get("toolUseResult") is not None:
        return None
    c = (d.get("message") or {}).get("content")
    if isinstance(c, list):
        if any(isinstance(x, dict) and x.get("type") == "tool_result" for x in c):
            return None
        c = " ".join(x.get("text") or "" for x in c if isinstance(x, dict) and x.get("type") == "text")
    return c if isinstance(c, str) and c.strip() else None


def texto_usuario_codex(d):
    """Texto de un turno de usuario de Codex (response_item message role=user, sin contexto inyectado por Codex)."""
    p = d.get("payload") or {}
    if d.get("type") != "response_item" or p.get("type") != "message" or p.get("role") != "user":
        return None
    t = " ".join(x.get("text") or "" for x in (p.get("content") or []) if isinstance(x, dict) and x.get("type") == "input_text").strip()
    if not t or re.match(r"^<(environment_context|user_instructions|permissions|turn_aborted|subagent)", t) or t.startswith("# AGENTS.md"):
        return None
    return t


def evaluar_con_carlos(idle_s, frente, senales, ventana=VENTANA_CC_S):
    """Puro. senales: {'app': ts_ult_actividad_app|None, 'app_nombre': str, 'tmux': (sesion, ts_actividad)|None,
    'humano': (ts, superficie)|None, 'ahora': ts}. Devuelve (bool, motivo)."""
    ahora = senales.get("ahora") or time.time()
    if idle_s is None:
        return False, "reposo del Mac desconocido: no se da por presente"
    if idle_s >= ventana:
        return False, "Mac en reposo %d min" % (idle_s // 60)
    f = (frente or "").strip().lower()
    motivos = []
    app_ts = senales.get("app")
    if app_ts and ahora - app_ts < ventana and f and f == (senales.get("app_nombre") or "").lower():
        motivos.append("a) app %s al frente con sesión activa hace %ds" % (frente, int(ahora - app_ts)))
    tm = senales.get("tmux")
    if tm and f in APPS_TERMINAL and ahora - tm[1] < ventana:
        motivos.append("b) tmux '%s' con cliente adjunto (actividad hace %ds) y %s al frente" % (tm[0], int(ahora - tm[1]), frente))
    hu = senales.get("humano")
    if hu and ahora - hu[0] < ventana:
        motivos.append("c) prompt tecleado por persona en %s hace %ds" % (hu[1], int(ahora - hu[0])))
    if not motivos:
        return False, "Mac activo (reposo %ds, %s al frente) pero sin señal de este agente" % (idle_s, frente or "?")
    return True, "reposo %ds · " % idle_s + " · ".join(motivos)


def desde_con_carlos(prev, activo, ahora_iso):
    """Puro: mantiene el 'desde' mientras siga activo; lo pone al entrar; None al salir."""
    if not activo:
        return None
    if prev and prev.get("conCarlos") and prev.get("desde"):
        return prev["desde"]
    return ahora_iso


def _cmd(args, timeout=4):
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        return r.stdout if r.returncode == 0 else ""
    except Exception:
        return ""


def idle_mac():
    m = re.search(r'"HIDIdleTime"\s*=\s*(\d+)', _cmd(["ioreg", "-c", "IOHIDSystem"]))
    return int(m.group(1)) // 1_000_000_000 if m else None


def app_al_frente():
    asn = _cmd(["lsappinfo", "front"]).strip()
    if not asn:
        return None
    m = re.search(r'"LSDisplayName"="([^"]*)"', _cmd(["lsappinfo", "info", "-only", "name", asn]))
    return m.group(1) if m else None


def clientes_tmux():
    """{sesion: ts última actividad de un cliente adjunto}."""
    out = {}
    for l in _cmd(["tmux", "list-clients", "-F", "#{session_name}\t#{client_activity}"]).splitlines():
        p = l.split("\t")
        if len(p) == 2 and p[1].isdigit():
            out[p[0]] = max(out.get(p[0], 0), int(p[1]))
    return out


def sesiones_tmux_por_agente():
    """{persona: [sesiones tmux]} de los LaunchAgents com.admiranext.agent-inbox-*.plist (AGENT_PERSONA/AGENT_TMUX)."""
    import plistlib
    res = {}
    for f in glob.glob(os.path.join(HOME, "Library", "LaunchAgents", "com.admiranext.agent-inbox-*.plist")):
        try:
            with open(f, "rb") as h:
                env = (plistlib.load(h).get("EnvironmentVariables") or {})
        except Exception:
            continue
        per = env.get("AGENT_PERSONA")
        if per:
            res.setdefault(per, []).append(env.get("AGENT_TMUX") or per.lower())
    return res


def _cola(path, n=8 * 1024 * 1024):
    with open(path, "rb") as f:
        f.seek(0, 2)
        tam = f.tell()
        f.seek(max(0, tam - n))
        data = f.read()
    return data.splitlines()[1:] if tam > n else data.splitlines()


def actividad_claude(ahora, ventana=VENTANA_CC_S):
    """{'desktop': ts última línea de sesión claude-desktop, 'humano': (ts, superficie)} de logs tocados < ventana."""
    res = {"desktop": None, "humano": None}
    for path in glob.glob(os.path.join(HOME, ".claude", "projects", "**", "*.jsonl"), recursive=True):
        try:
            if ahora - os.path.getmtime(path) > ventana or "/subagents/" in path:
                continue
            lineas = _cola(path)
        except OSError:
            continue
        ultima_desktop = False
        for raw in reversed(lineas):  # de la más nueva a la más vieja: basta la última de cada clase
            es_user = b'"type":"user"' in raw
            if ultima_desktop and not es_user:
                continue
            if b'"timestamp"' not in raw:
                continue
            try:
                d = json.loads(raw)
            except Exception:
                continue
            dt = ts_de(d.get("timestamp"))
            if dt is None:
                continue
            t = dt.timestamp()
            if ahora - t > ventana:
                break
            ep = d.get("entrypoint") or ""
            ultima_desktop = True
            if ep == "claude-desktop" and (res["desktop"] is None or t > res["desktop"]):
                res["desktop"] = t
            txt = texto_usuario_claude(d)
            if txt is not None and not es_inyectado(txt) and (res["humano"] is None or t > res["humano"][0]):
                res["humano"] = (t, "app de Claude" if ep == "claude-desktop" else "Claude Code (%s)" % (ep or "cli"))
    return res


def actividad_codex(ahora, ventana=VENTANA_CC_S):
    res = {"desktop": None, "humano": None}
    hoy = datetime.now(MADRID)
    rutas = set()
    for delta in (0, 1, 2, 3):  # el escritorio de Codex reabre sesiones de días anteriores
        rutas.update(glob.glob(os.path.join(HOME, ".codex", "sessions", (hoy - timedelta(days=delta)).strftime("%Y/%m/%d"), "*.jsonl")))
    for path in rutas:
        try:
            if ahora - os.path.getmtime(path) > ventana:
                continue
            with open(path) as h:
                meta = (json.loads(h.readline() or "{}").get("payload") or {})
            lineas = _cola(path)
        except Exception:
            continue
        desktop = "desktop" in str(meta.get("originator") or "").lower()
        sub = isinstance(meta.get("source"), dict)
        visto = False
        for raw in reversed(lineas):
            if visto and b'"user"' not in raw:
                continue
            try:
                d = json.loads(raw)
            except Exception:
                continue
            dt = ts_de(d.get("timestamp"))
            if dt is None:
                continue
            t = dt.timestamp()
            if ahora - t > ventana:
                break
            visto = True
            if desktop and (res["desktop"] is None or t > res["desktop"]):
                res["desktop"] = t
            if sub:
                continue
            txt = texto_usuario_codex(d)
            if txt is not None and not es_inyectado(txt) and (res["humano"] is None or t > res["humano"][0]):
                res["humano"] = (t, "app de Codex" if desktop else "Codex CLI")
    return res


def con_carlos(maq):
    """Evalúa todas las señales y escribe ~/.fleet/con-carlos.json. Devuelve {persona: {conCarlos, motivo, desde}}."""
    ahora = time.time()
    ahora_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    idle = idle_mac()
    frente = app_al_frente()
    try:
        with open(CON_CARLOS_FILE) as f:
            prev = (json.load(f).get("agentes") or {})
    except Exception:
        prev = {}
    clientes = clientes_tmux() if idle is not None and idle < VENTANA_CC_S else {}
    tmux_de = sesiones_tmux_por_agente()
    act = {"claude": actividad_claude(ahora), "codex": actividad_codex(ahora)} if idle is not None and idle < VENTANA_CC_S else {"claude": {}, "codex": {}}
    app_nombre = {"claude": "Claude", "codex": frente if (frente or "").lower() in APPS_CODEX else "Codex"}
    agentes = {}
    motor_de = {nombre: motor for motor, (nombre, _c) in MAPA[maq].items()}
    personas = list(motor_de) + [p for p in tmux_de if p not in motor_de and persona_simple(p) not in {persona_simple(x) for x in motor_de}]
    for per in personas:
        motor = motor_de.get(per)
        ses = tmux_de.get(per) or tmux_de.get(persona_simple(per).capitalize()) or [per.lower()]
        tm = max(((s, clientes[s]) for s in ses if s in clientes), key=lambda x: x[1], default=None)
        a = act.get(motor) or {}
        sen = {"ahora": ahora, "app": a.get("desktop"), "app_nombre": app_nombre.get(motor, ""), "tmux": tm, "humano": a.get("humano")}
        activo, motivo = evaluar_con_carlos(idle, frente, sen)
        agentes[per] = {"conCarlos": activo, "motivo": motivo, "desde": desde_con_carlos(prev.get(per), activo, ahora_iso),
                        "motor": motor, "tmux": ses}
    doc = {"maquina": maq, "ts": int(ahora), "tsIso": ahora_iso, "reposoS": idle, "alFrente": frente, "agentes": agentes}
    try:
        tmp = CON_CARLOS_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(doc, f, ensure_ascii=False, indent=1)
        os.replace(tmp, CON_CARLOS_FILE)
    except OSError:
        pass
    return doc


def persona_simple(n):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", str(n or "")) if unicodedata.category(c) != "Mn").lower()


def main():
    dry = "--dry-run" in sys.argv
    maq = sys.argv[sys.argv.index("--maquina") + 1] if "--maquina" in sys.argv else maquina_local()
    if maq not in MAPA:
        print("pulso: máquina no reconocida (%r); usa --maquina %s (o PULSO_MAQUINA)" % (maq, "|".join(MAPA)), file=sys.stderr)
        return 2
    ahora = datetime.now(MADRID)
    dia = ahora.strftime("%Y-%m-%d")
    inicio = ahora.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    t0 = time.time()
    try:
        cc = con_carlos(maq)
    except Exception as e:  # la detección nunca tumba el pulso de tokens
        cc = {"agentes": {}, "error": str(e)[:200]}
    for per, x in (cc.get("agentes") or {}).items():
        print("%s conCarlos %s=%s · %s%s" % (ahora.strftime("%H:%M:%S"), per, "SÍ" if x["conCarlos"] else "no", x["motivo"],
                                           (" · desde " + x["desde"]) if x.get("desde") else ""))
    if "--con-carlos" in sys.argv:
        return 0
    cache = cargar_cache(dia)
    agentes = []
    for motor, fn in (("claude", claude), ("codex", codex), ("grok", grok)):
        if motor not in MAPA[maq]:
            continue
        tok, cache_r, ult, pp = fn(cache, dia, inicio)
        nombre, cuenta = MAPA[maq][motor]
        x = (cc.get("agentes") or {}).get(nombre) or {}
        agentes.append({"agente": nombre, "motor": motor, "cuenta": cuenta, "tokHoy": tok, "cacheHoy": cache_r, "ultimoEvento": ult,
                        "porProyecto": {k: v for k, v in sorted(pp.items(), key=lambda x: -x[1]) if v > 0},
                        "conCarlos": bool(x.get("conCarlos")), "conCarlosMotivo": x.get("motivo"), "conCarlosDesde": x.get("desde")})
    guardar_cache(cache)
    guardar_proyectos()
    guardar_otros()
    cuerpo = {"maquina": maq, "agentes": agentes, "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")}
    try:
        app = grokbot_app(cc.get("reposoS"), cc.get("alFrente"))
    except Exception:
        app = None
    if app and app["abierta"]:
        cuerpo["grokbotApp"] = app
        print("%s grokbotApp %s · cuenta %s · al frente %s · reposo %ss" % (ahora.strftime("%H:%M:%S"), "abierta" if app["abierta"] else "cerrada",
              app["cuenta"] or "¿? (falta %s)" % GROKBOT_CUENTA_FILE, "sí" if app["alFrente"] else "no", app["reposoS"]))
    if not agentes and "grokbotApp" not in cuerpo:
        print("%s %s sin agentes ni app Grok Bot abierta: nada que mandar" % (ahora.strftime("%H:%M:%S"), maq))
        return 0
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
