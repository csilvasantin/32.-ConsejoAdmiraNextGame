#!/usr/bin/env python3
"""
codex-espejo.py — puente Win95 ↔ Codex (Trinity · MacStudio). Carlos t1419u, 28-11-2026.
«Que podamos ver, escribir y leer lo mismo desde win95» (como el chat de ICQGram con los consejeros).

LEER     ~/.codex/state_5.sqlite (solo lectura) da los hilos interactivos de la app Codex; de cada uno
         se lee su rollout (~/.codex/sessions/…/rollout-*.jsonl) de forma incremental. Sin AX, sin foco,
         sin permisos TCC nuevos (son ficheros del propio usuario).
SUBIR    POST https://www.admira.live/api/win95/codex {accion:"snap"} con el token de máquina
         (~/.config/admira/consumos-lecturas.token, el mismo que usa pulso-tokens.py). Solo si cambia.
ESCRIBIR GET …/api/win95/codex?puente=1 → mensajes que Carlos escribió en Win95. Se entregan con el
         comando OFICIAL de Codex: `codex queue --thread <id> --message <texto>` (la app los manda al hilo
         cuando el turno en curso acaba). Acuse entregado/error por POST {accion:"acuse"}.
No imprime secretos. LaunchAgent: com.admiranext.codex-espejo (KeepAlive). Registro: ~/.fleet/logs/codex-espejo.log
"""
import json, os, re, sqlite3, subprocess, sys, time, hashlib, urllib.request, urllib.error
from collections import deque
from datetime import datetime, timezone
try:
    from zoneinfo import ZoneInfo
    MADRID = ZoneInfo("Europe/Madrid")
except Exception:  # pragma: no cover
    MADRID = None

VERSION = "codex-espejo/1.1 (t1419u)"
HOME = os.path.expanduser("~")
CODEX_HOME = os.environ.get("CODEX_HOME", os.path.join(HOME, ".codex"))
STATE_DB = os.path.join(CODEX_HOME, "state_5.sqlite")
QUEUE_DB = os.path.join(CODEX_HOME, "queue_1.sqlite")
TOKEN_FILE = os.path.join(HOME, ".config", "admira", "consumos-lecturas.token")
ENDPOINT = os.environ.get("CODEX_ESPEJO_ENDPOINT", "https://www.admira.live/api/win95/codex")
CODEX_BIN = os.environ.get("CODEX_BIN", "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex")
ESTADO_FILE = os.path.join(HOME, ".fleet", "codex-espejo-estado.json")
MAQUINA = os.environ.get("CODEX_ESPEJO_MAQUINA", "MacStudio")
AGENTE = os.environ.get("CODEX_ESPEJO_AGENTE", "Trinity")
MAX_HILOS = 4
MAX_TURNOS = 60
TAIL_INICIAL = 6 * 1024 * 1024
CICLO_S = 4
MIN_PUSH_REAL_S = 10
MIN_PUSH_LATIDO_S = 60
KEEPALIVE_S = 60
MARCA_WIN95 = "[WIN95 · ICQGRAM → CODEX"

SKIP_USER = ("<environment_context", "<skills_instructions", "# AGENTS.md", "<user_instructions", "<permissions",
             "<turn_aborted", "<user_shell_command", "<subagent_notification", "<collaboration_mode", "<tools>")


def log(*a):
    print(datetime.now().strftime("%Y-%m-%d %H:%M:%S"), *a, flush=True)


def hora_madrid(ts=None):
    d = datetime.fromtimestamp(ts or time.time(), MADRID) if MADRID else datetime.now()
    return d.strftime("%H:%M")


def leer_token():
    try:
        with open(TOKEN_FILE) as f:
            return f.read().strip()
    except OSError:
        return ""


def ro(db):
    return sqlite3.connect("file:%s?mode=ro" % db, uri=True, timeout=2)


def hilos_activos():
    """Hilos interactivos de la app (no subagentes ni guardian), más recientes primero."""
    con = ro(STATE_DB)
    try:
        rows = con.execute(
            "select id, rollout_path, coalesce(name,''), title, cwd, recency_at_ms from threads "
            "where archived=0 and preview<>'' and attached_thread_parent_id is null "
            "and source in ('cli','vscode','{\"custom\":\"atlas\"}','{\"custom\":\"chatgpt\"}') "
            "order by recency_at_ms desc limit ?", (MAX_HILOS,)).fetchall()
    finally:
        con.close()
    return [{"id": r[0], "ruta": r[1], "titulo": (r[2] or r[3] or "Hilo de Codex").strip(), "cwd": r[4] or "", "reciente": r[5] or 0} for r in rows]


def en_cola():
    try:
        con = ro(QUEUE_DB)
        try:
            return dict(con.execute("select thread_id, count(*) from queued_items group by thread_id").fetchall())
        finally:
            con.close()
    except Exception:
        return {}


def texto_de(payload):
    out = []
    for c in payload.get("content") or []:
        if isinstance(c, dict) and isinstance(c.get("text"), str):
            out.append(c["text"])
    return "\n".join(out).strip()


def tag(txt, nombre):
    m = re.search(r"<%s>\s*([\s\S]*?)\s*</%s>" % (nombre, nombre), txt)
    return m.group(1).strip() if m else ""


def latido(txt):
    auto = tag(txt, "automation_id") or "automatización"
    dec = tag(txt, "decision")
    msg = tag(txt, "message")
    s = "⏱ " + auto + (" · " + dec if dec else "")
    if msg:
        s += " · " + re.sub(r"\s+", " ", msg)[:240]
    return s


def ts_ms(ts):
    try:
        return int(datetime.fromisoformat(str(ts).replace("Z", "+00:00")).timestamp() * 1000)
    except Exception:
        return int(time.time() * 1000)


def turno_de(d):
    """Línea del rollout → turno visible (dict) o None. Mismo criterio que la app: mensajes de Carlos y de Codex."""
    if d.get("type") != "response_item":
        return None
    p = d.get("payload") or {}
    if p.get("type") != "message":
        return None
    rol = p.get("role")
    txt = texto_de(p)
    if not txt:
        return None
    ts = d.get("timestamp") or ""
    tid = str(d.get("ordinal", "")) or hashlib.sha1(raw_id(ts, txt)).hexdigest()[:12]
    base = {"id": tid, "ts": ts_ms(ts), "fase": ""}
    if rol == "user":
        if "<heartbeat>" in txt[:40]:
            return dict(base, rol="latido", texto="⏱ " + (tag(txt, "automation_id") or "latido") + " · revisión programada")
        if txt.startswith(MARCA_WIN95):
            return dict(base, rol="win95", texto=txt[:6000])
        if txt.lstrip().startswith("<") or txt.startswith(SKIP_USER):
            return None
        return dict(base, rol="carlos", texto=txt[:6000])
    if rol == "assistant":
        fase = p.get("phase") or ""
        if txt.lstrip().startswith("<heartbeat>"):
            # NOTIFY = Codex quiere que Carlos lo lea (p. ej. la respuesta a un mensaje de Win95): va como mensaje.
            if tag(txt, "decision").upper() == "NOTIFY" and tag(txt, "message"):
                return dict(base, rol="codex", fase=fase, texto=tag(txt, "message")[:6000])
            return dict(base, rol="latido", fase=fase, texto=latido(txt))
        return dict(base, rol="codex", fase=fase, texto=txt[:6000])
    return None


def escanear_atras(ruta, hasta, n=12, max_bytes=256 * 1024 * 1024, paso=32 * 1024 * 1024):
    """Busca hacia atrás los últimos n turnos reales (no latidos) antes de `hasta`."""
    out = []
    pos = hasta
    with open(ruta, "rb") as f:
        while pos > 0 and len(out) < n and hasta - pos < max_bytes:
            ini = max(0, pos - paso)
            f.seek(ini)
            b = f.read(pos - ini)
            if ini > 0:
                corte = b.find(b"\n")
                if corte < 0:
                    pos = ini; continue
                b = b[corte + 1:]; ini += corte + 1
            trozo = []
            for raw in b.split(b"\n"):
                if b'"role":"user"' not in raw and b'"role":"assistant"' not in raw:
                    continue
                try:
                    t = turno_de(json.loads(raw))
                except Exception:
                    continue
                if t and t["rol"] != "latido":
                    trozo.append(t)
            out = trozo + out
            pos = ini
    return out[-n:]


class Hilo:
    def __init__(self, meta):
        self.id = meta["id"]
        self.meta = meta
        self.offset = None
        self.reales = deque(maxlen=40)
        self.latidos = deque(maxlen=20)
        self.estado = "en reposo"
        self.ultimo = 0

    def leer(self):
        ruta = self.meta["ruta"]
        try:
            tam = os.path.getsize(ruta)
        except OSError:
            return False
        primero = False
        if self.offset is None or tam < self.offset:
            self.offset = max(0, tam - TAIL_INICIAL)
            primero = True
        if tam == self.offset:
            return False
        inicio = self.offset
        with open(ruta, "rb") as f:
            f.seek(self.offset)
            datos = f.read(min(tam - self.offset, 64 * 1024 * 1024))
        fin = datos.rfind(b"\n")
        if fin < 0:
            return False
        bloque = datos[: fin + 1]
        self.offset += len(bloque)
        lineas = bloque.split(b"\n")
        if primero and inicio > 0 and lineas:
            lineas = lineas[1:]  # la primera puede venir cortada
        cambio = False
        for raw in lineas:
            if not raw.strip():
                continue
            try:
                d = json.loads(raw)
            except Exception:
                continue
            cambio |= self.procesar(d)
        if primero and inicio > 0 and len(self.reales) < 12:
            try:
                previos = escanear_atras(ruta, inicio, n=12 - len(self.reales))
                vistos = {t["id"] for t in self.reales}
                for t in reversed(previos):
                    if t["id"] not in vistos:
                        self.reales.appendleft(t)
            except Exception as e:
                log("escaneo hacia atrás falló", self.id[:8], type(e).__name__)
        return cambio

    def procesar(self, d):
        if d.get("type") == "event_msg":
            pt = (d.get("payload") or {}).get("type")
            if pt == "task_started":
                self.estado = "trabajando"; self.ultimo = ts_ms(d.get("timestamp")); return True
            if pt in ("task_complete", "turn_aborted"):
                self.estado = "en reposo"; self.ultimo = ts_ms(d.get("timestamp")); return True
            return False
        t = turno_de(d)
        if not t:
            return False
        dq = self.latidos if t["rol"] == "latido" else self.reales
        if dq and dq[-1]["id"] == t["id"]:
            return False
        dq.append(t)
        self.ultimo = max(self.ultimo, t["ts"])
        return True

    def turnos(self):
        return sorted(list(self.reales) + list(self.latidos), key=lambda x: x["ts"])[-MAX_TURNOS:]

    def snap(self, cola):
        return {"id": self.id, "titulo": self.meta["titulo"], "proyecto": os.path.basename(self.meta["cwd"].rstrip("/")),
                "estado": self.estado, "actualizado": self.ultimo or self.meta["reciente"], "enCola": cola.get(self.id, 0),
                "turnos": self.turnos()}


def raw_id(ts, txt):
    return (ts + txt[:200]).encode("utf-8", "replace")


def peticion(metodo, url, token, cuerpo=None, timeout=20):
    data = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(url, data=data, method=metodo, headers={
        "content-type": "application/json", "X-Council-Token": token, "user-agent": VERSION})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {}
    except Exception as e:
        return 0, {"error": type(e).__name__}


def cargar_estado():
    try:
        with open(ESTADO_FILE) as f:
            d = json.load(f)
            return {"entregados": d.get("entregados", {})}
    except Exception:
        return {"entregados": {}}


def guardar_estado(est):
    ent = dict(sorted(est["entregados"].items(), key=lambda kv: kv[1].get("ts", 0))[-200:])
    tmp = ESTADO_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump({"entregados": ent}, f)
    os.replace(tmp, ESTADO_FILE)


def entregar(item):
    """Entrega con `codex queue` (comando oficial). Devuelve (estado, nota)."""
    texto = "%s · %s · %s]\n%s" % (MARCA_WIN95, str(item.get("autorNombre") or "Carlos").upper(), hora_madrid((item.get("ts") or 0) / 1000 or None), item.get("texto") or "")
    try:
        r = subprocess.run([CODEX_BIN, "queue", "--thread", item["hilo"], "--message", texto],
                           capture_output=True, text=True, timeout=60, stdin=subprocess.DEVNULL)
    except Exception as e:
        return "error", "codex queue no arrancó (%s)" % type(e).__name__
    if r.returncode == 0:
        return "entregado", "en la cola del hilo de Codex " + hora_madrid()
    err = (r.stderr or r.stdout or "").strip().splitlines()
    return "error", ("codex queue salió con %d: %s" % (r.returncode, err[-1] if err else ""))[:200]


def main():
    once = "--once" in sys.argv
    token = leer_token()
    if not token:
        log("falta el token de máquina en", TOKEN_FILE); return 3
    est = cargar_estado()
    hilos = {}
    ult_push = 0; ult_firma_real = None; ult_firma = None; urgente = False
    log("arranca", VERSION, "→", ENDPOINT)
    while True:
        t0 = time.time()
        try:
            metas = hilos_activos()
            vivos = set()
            for m in metas:
                h = hilos.get(m["id"])
                if not h:
                    h = hilos[m["id"]] = Hilo(m)
                h.meta = m
                vivos.add(m["id"])
                h.leer()
            for k in list(hilos):
                if k not in vivos:
                    del hilos[k]
            cola = en_cola()
            orden = [hilos[m["id"]] for m in metas]
            snap_hilos = [h.snap(cola) for h in orden]
            firma = hashlib.sha1(json.dumps(snap_hilos, sort_keys=True).encode()).hexdigest()
            firma_real = hashlib.sha1(json.dumps([[h["id"], h["estado"], h["enCola"], [x["id"] for x in h["turnos"] if x["rol"] != "latido"]] for h in snap_hilos]).encode()).hexdigest()
            ahora = time.time()
            if "--dry" in sys.argv:
                for h in snap_hilos:
                    print(h["id"], h["estado"], h["titulo"][:50], "cola", h["enCola"], "turnos", len(h["turnos"]))
                    for x in h["turnos"][-4:]:
                        print("   ", x["rol"], x["fase"], x["texto"][:110].replace("\n", " "))
                return 0
            toca = (firma_real != ult_firma_real and ahora - ult_push >= MIN_PUSH_REAL_S) or \
                   (firma != ult_firma and ahora - ult_push >= MIN_PUSH_LATIDO_S) or \
                   (ahora - ult_push >= KEEPALIVE_S) or urgente
            if toca:
                cuerpo = {"accion": "snap", "maquina": MAQUINA, "agente": AGENTE, "app": "Codex", "version": VERSION,
                          "generado": int(ahora * 1000), "hilos": snap_hilos, "urgente": bool(urgente or firma_real != ult_firma_real)}
                st, r = peticion("POST", ENDPOINT, token, cuerpo)
                if st in (200, 202):
                    ult_push = ahora; ult_firma = firma; ult_firma_real = firma_real; urgente = False
                    if st == 200:
                        log("snap", len(snap_hilos), "hilos", " | ".join("%s:%s:%d" % (h["id"][:8], h["estado"], len(h["turnos"])) for h in snap_hilos))
                else:
                    log("snap HTTP", st, r.get("error", ""))
            # Bandeja de salida (Win95 → Codex)
            st, r = peticion("GET", ENDPOINT + "?puente=1", token)
            acuses = []
            if st == 200:
                for it in r.get("pendientes") or []:
                    iid = str(it.get("id") or "")
                    if not iid:
                        continue
                    if iid in est["entregados"]:
                        prev = est["entregados"][iid]
                        acuses.append({"id": iid, "estado": prev["estado"], "nota": prev.get("nota", "")}); continue
                    estado, nota = entregar(it)
                    est["entregados"][iid] = {"estado": estado, "nota": nota, "ts": int(time.time())}
                    guardar_estado(est)
                    log("entrega", iid, "→ hilo", str(it.get("hilo", ""))[:8], estado, nota)
                    acuses.append({"id": iid, "estado": estado, "nota": nota})
                    urgente = True
            elif st:
                log("bandeja HTTP", st, r.get("error", ""))
            if acuses:
                st2, r2 = peticion("POST", ENDPOINT, token, {"accion": "acuse", "acuses": acuses})
                if st2 != 200:
                    log("acuse HTTP", st2, r2.get("error", ""))
        except Exception as e:
            log("ciclo falló:", type(e).__name__, str(e)[:200])
        if once:
            return 0
        time.sleep(max(1.0, CICLO_S - (time.time() - t0)))


if __name__ == "__main__":
    sys.exit(main())
