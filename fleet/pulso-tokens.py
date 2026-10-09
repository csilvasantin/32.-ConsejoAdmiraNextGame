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
Uso: pulso-tokens.py [--dry-run] [--maquina NOMBRE]
"""
import glob, json, os, sys, time, socket, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

MADRID = ZoneInfo("Europe/Madrid")
HOME = os.path.expanduser("~")
CACHE = os.path.join(HOME, ".fleet", "pulso-cache.json")
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
        if c.get("dia") == dia and c.get("v") == 2:
            return c
    except Exception:
        pass
    return {"v": 2, "dia": dia, "claude": {"files": {}, "msgs": {}}, "codex": {"files": {}}}


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
                st["msgs"][clave] = vals + [int(dt.timestamp())]
            if ultimo is None or dt > ultimo:
                ultimo = dt
        st["files"][path] = nuevo
    tok = sum(v[0] + v[1] + v[2] for v in st["msgs"].values())
    cache_r = sum(v[3] for v in st["msgs"].values())
    ult = max((v[4] for v in st["msgs"].values()), default=None)
    return tok, cache_r, (datetime.fromtimestamp(ult, timezone.utc).isoformat().replace("+00:00", "Z") if ult else None)


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
            f = st["files"].setdefault(path, {"off": 0, "prev": None, "tok": 0, "cache": 0, "ult": None})
            lineas, nuevo = lineas_nuevas(path, f["off"])
        except OSError:
            continue
        if nuevo < f["off"]:  # fichero reescrito: empezar de cero
            f.update({"prev": None, "tok": 0, "cache": 0})
        for raw in lineas:
            if b'"token_count"' not in raw:
                continue
            try:
                d = json.loads(raw)
            except Exception:
                continue
            p = d.get("payload") or {}
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
                    f["tok"] += max(0, d_in - d_cache) + d_out
                    f["cache"] += d_cache
                    f["ult"] = dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
            f["prev"] = cur
        f["off"] = nuevo
    files = st["files"].values()
    ult = max((f["ult"] for f in files if f.get("ult")), default=None)
    return sum(f["tok"] for f in files), sum(f["cache"] for f in files), ult


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
        tok, cache_r, ult = fn(cache, dia, inicio)
        nombre, cuenta = MAPA[maq][motor]
        agentes.append({"agente": nombre, "motor": motor, "cuenta": cuenta, "tokHoy": tok, "cacheHoy": cache_r, "ultimoEvento": ult})
    guardar_cache(cache)
    cuerpo = {"maquina": maq, "agentes": agentes, "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")}
    resumen = " · ".join("%s/%s %s tok (+%s cache)" % (a["agente"], a["motor"], format(a["tokHoy"], ","), format(a["cacheHoy"], ",")) for a in agentes)
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
