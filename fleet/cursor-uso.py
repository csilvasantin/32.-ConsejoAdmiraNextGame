#!/usr/bin/env python3
"""cursor-uso.py — tokens de la cuenta Cursor Pro (Grok Bot) de HOY (Madrid) → POST /api/consumos/pulso + lecturas 00/12.

GrokBotBox, 09-10-2026 (r27). Solo stdlib. Cursor no tiene API de uso para Pro: se lee el export CSV de
https://cursor.com/dashboard/usage?from=AAAA-MM-DD&to=AAAA-MM-DD (columnas: Date, Cloud Agent ID, Automation ID, Kind,
Model, Max Mode, Input (w/ Cache Write), Input (w/o Cache Write), Cache Read, Output Tokens, Total Tokens, Cost).

MÉTRICA (igual que Claude/Codex en pulso-tokens.py): tokHoy = Input (w/ Cache Write) + Input (w/o Cache Write) + Output
= «Total Tokens» − «Cache Read»; cacheHoy = Cache Read aparte. (Total Tokens del CSV = las 4 columnas, incluida la lectura
de caché, que es ~95 % del total: por eso el CSV suma ~1,6 G en 7 días.)

QUIÉN: el CSV no separa por consejero (Cloud Agent ID solo en cloud agents, Automation ID vacío, el modelo dice
grok-bot-default/-automation/-cua, no quién). Va como UN agente «Grok Bot (Consejo)» que CUBRE a Jobs, Wozniak, Lucas y
Disney: el servidor quita de la suma sus partes de Yokup (consumo_reportar, p. ej. la ESTIMACIÓN de Woz) → sin doble
conteo. Smith NO está en este CSV (usa el Grok CLI en el Mac mini; lo mide pulso-tokens.py, motor «grok»).
PROYECTO: el CSV no trae carpeta ni repo → todo a admiranext.com (--proyecto para cambiarlo).

IDEMPOTENTE: se manda la SERIE EN HORA DEL EVENTO (acumulado de hoy cada 5 min desde las 00:00 de Madrid) y el servidor
la sustituye entera: re-mandar el mismo CSV no crea picos; un CSV con más filas solo rellena la historia real.
LECTURAS: para las 00:00 y 12:00 de Madrid de los 2 últimos días (cubiertas por el CSV) anota una lectura SOLO DE TOKENS
de la cuenta «cursor-pro» con los tokens del bloque de 12 h que acaba ahí (mismo id → se re-escribe si llegan más datos).

Uso: cursor-uso.py CSV [--dry-run] [--sin-lecturas] [--proyecto admiranext.com] [--agente "Grok Bot (Consejo)"]
"""
import csv, json, os, sys, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

MADRID = ZoneInfo("Europe/Madrid")
HOME = os.path.expanduser("~")
TOKEN_FILE = os.path.join(HOME, ".config", "admira", "consumos-lecturas.token")
BASE = os.environ.get("CONSUMOS_BASE", "https://www.admira.live")
ESTADO = os.path.join(HOME, ".fleet", "cursor-uso-estado.json")
CUBRE = ["Jobs", "Wozniak", "Lucas", "Disney"]
PASO = 300  # 5 min


def entero(x):
    try:
        return int(float(x)) if str(x).strip() != "" else None
    except ValueError:
        return None


def leer_csv(path):
    """→ lista de eventos {ts(datetime UTC), entrada, salida, cache, modelo, cloud, pendiente}."""
    out = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            try:
                ts = datetime.fromisoformat(r["Date"].replace("Z", "+00:00"))
            except Exception:
                continue
            iw, io_, cr, o = (entero(r.get(k)) for k in ("Input (w/ Cache Write)", "Input (w/o Cache Write)", "Cache Read", "Output Tokens"))
            pend = all(v is None for v in (iw, io_, cr, o))
            out.append({"ts": ts, "entrada": (iw or 0) + (io_ or 0), "salida": o or 0, "cache": cr or 0, "modelo": r.get("Model") or "",
                        "cloud": r.get("Cloud Agent ID") or "", "auto": r.get("Automation ID") or "", "pendiente": pend,
                        "total_csv": entero(r.get("Total Tokens")) or 0})
    out.sort(key=lambda e: e["ts"])
    return out


def tok(e):
    return e["entrada"] + e["salida"]


def calcular(eventos, ahora, proyecto):
    """Pura: tokens de hoy (Madrid), serie de 5 min en hora del evento, último evento con tokens y pendientes."""
    hoy = ahora.astimezone(MADRID).replace(hour=0, minute=0, second=0, microsecond=0)
    ini = int(hoy.timestamp())
    de_hoy = [e for e in eventos if int(e["ts"].timestamp()) >= ini and e["ts"] <= ahora]
    con = [e for e in de_hoy if not e["pendiente"]]
    cubos = {}
    for e in con:
        t = int(e["ts"].timestamp())
        c = ini + ((t - ini) // PASO + 1) * PASO  # fin del cubo de 5 min
        x = cubos.setdefault(c, [0, 0])
        x[0] += tok(e)
        x[1] += e["cache"]
    serie, acum, acc = [[ini, 0, 0, {proyecto: 0}]], 0, 0
    for c in sorted(cubos):
        acum += cubos[c][0]
        acc += cubos[c][1]
        serie.append([min(c, int(ahora.timestamp())), acum, acc, {proyecto: acum}])
    ult = con[-1]["ts"] if con else None
    return {"tokHoy": acum, "cacheHoy": acc, "serie": serie, "ultimoEvento": ult, "pendientes": sum(1 for e in de_hoy if e["pendiente"]),
            "eventos": len(con), "entrada": sum(e["entrada"] for e in con), "salida": sum(e["salida"] for e in con),
            "modelos": sorted({e["modelo"] for e in con})}


def canonicas(ahora, dias=2):
    """Instantes 00:00 y 12:00 de Madrid de los últimos `dias` días, ≤ ahora (más viejo primero)."""
    m = ahora.astimezone(MADRID)
    out = []
    for d in range(dias, -1, -1):
        base = (m - timedelta(days=d)).replace(hour=0, minute=0, second=0, microsecond=0)
        for h in (0, 12):
            t = base.replace(hour=h)
            if t <= m:
                out.append(t)
    return out[-2 * dias:]


def bloques(eventos, ahora):
    """Pura: lecturas de tokens de los bloques de 12 h que acaban en cada canónica cubierta por el CSV."""
    if not eventos:
        return []
    primero = eventos[0]["ts"]
    con = [e for e in eventos if not e["pendiente"]]
    hasta_datos = con[-1]["ts"] if con else None
    out = []
    for fin in canonicas(ahora):
        ini = fin - timedelta(hours=12)
        if primero > ini.astimezone(timezone.utc) + timedelta(hours=1):
            continue  # el CSV no cubre el bloque entero: no se inventa
        es = [e for e in con if ini < e["ts"].astimezone(MADRID) <= fin]
        parcial = hasta_datos is None or hasta_datos < fin
        nota = "export CSV de Cursor · " + str(len(es)) + " eventos · datos hasta " + (hasta_datos.astimezone(MADRID).strftime("%d/%m %H:%M") if hasta_datos else "—") + " (Madrid)" + (" · bloque aún incompleto (retraso de Cursor)" if parcial else "")
        out.append({"ts": fin.isoformat(), "tokens": {"total": sum(tok(e) for e in es), "entrada": sum(e["entrada"] for e in es), "salida": sum(e["salida"] for e in es),
                                                      "cache": sum(e["cache"] for e in es)}, "nota": nota})
    return out


def post(url, cuerpo, token):
    req = urllib.request.Request(url, data=json.dumps(cuerpo).encode(), method="POST",
                                 headers={"content-type": "application/json", "X-Council-Token": token, "user-agent": "cursor-uso/1"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, r.read(400).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read(400).decode("utf-8", "replace")


def main(argv):
    args = [a for a in argv[1:]]
    if not args or args[0].startswith("-"):
        print(__doc__, file=sys.stderr)
        return 2
    path = args[0]
    opt = lambda k, d: args[args.index(k) + 1] if k in args else d
    proyecto, agente = opt("--proyecto", "admiranext.com"), opt("--agente", "Grok Bot (Consejo)")  # r42: /consumos lo enseña como «Merovingio» (agenteVisible) — no cambiar la clave del KV
    dry = "--dry-run" in args
    ahora = datetime.now(timezone.utc)
    ev = leer_csv(path)
    r = calcular(ev, ahora, proyecto)
    ult = r["ultimoEvento"]
    retraso_h = (ahora - ult).total_seconds() / 3600 if ult else None
    a = {"agente": agente, "motor": "cursor", "fuente": "cursor", "cuenta": "Cursor Pro (Carlos Silva Santin)", "modelo": "Grok Bot / Cursor Pro",
         "tokHoy": r["tokHoy"], "cacheHoy": r["cacheHoy"], "ultimoEvento": ult.isoformat().replace("+00:00", "Z") if ult else None,
         "porProyecto": {proyecto: r["tokHoy"]} if r["tokHoy"] else {}, "cubre": CUBRE, "serie": r["serie"],
         "nota": "export CSV · %d eventos hoy · %d pendientes de tokens · modelos %s" % (r["eventos"], r["pendientes"], ", ".join(r["modelos"]) or "—")}
    cuerpo = {"maquina": "GrokBotBox", "agentes": [a], "ts": ahora.isoformat().replace("+00:00", "Z")}
    print("%s cursor %s: hoy %s tok (+%s caché) · %d eventos · %d pendientes · último %s (retraso %s h) · %d puntos" % (
        ahora.astimezone(MADRID).strftime("%H:%M:%S"), agente, format(r["tokHoy"], ","), format(r["cacheHoy"], ","), r["eventos"], r["pendientes"],
        ult.astimezone(MADRID).strftime("%d/%m %H:%M") if ult else "—", "%.1f" % retraso_h if retraso_h is not None else "—", len(r["serie"])))
    bl = [] if "--sin-lecturas" in args else bloques(ev, ahora)
    for b in bl:
        print("  lectura %s → %s tok · %s" % (b["ts"], format(b["tokens"]["total"], ","), b["nota"]))
    if dry:
        return 0
    try:
        with open(TOKEN_FILE) as f:
            token = f.read().strip()
    except OSError:
        print("cursor-uso: falta %s" % TOKEN_FILE, file=sys.stderr)
        return 3
    st, txt = post(BASE + "/api/consumos/pulso", cuerpo, token)
    print("  POST pulso → %s %s" % (st, txt[:200]))
    try:
        with open(ESTADO) as f:
            estado = json.load(f)
    except Exception:
        estado = {}
    hechas = estado.get("lecturas", {})
    for b in bl:
        firma = json.dumps(b["tokens"], sort_keys=True) + b["nota"].split(" · datos hasta")[0]
        if hechas.get(b["ts"]) == firma:
            continue  # ya anotada igual: no se gasta una escritura
        s2, t2 = post(BASE + "/api/consumos/lecturas", {"cuenta": "cursor-pro", "grupo": "cursor", "agente": "Tokens " + agente, "tokens": b["tokens"],
                                                         "fuente": "auto", "autor": "GrokBotBox", "ts": b["ts"], "nota": b["nota"]}, token)
        print("  POST lectura %s → %s %s" % (b["ts"], s2, t2[:120]))
        if s2 == 200:
            hechas[b["ts"]] = firma
    estado["lecturas"] = dict(sorted(hechas.items())[-12:])
    try:
        os.makedirs(os.path.dirname(ESTADO), exist_ok=True)
        with open(ESTADO, "w") as f:
            json.dump(estado, f, indent=1)
    except OSError:
        pass
    return 0 if st in (200, 202) else 4


if __name__ == "__main__":
    sys.exit(main(sys.argv))
