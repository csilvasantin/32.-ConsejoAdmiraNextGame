"""r233 (Carlos, 21-11 21:37: «esta Trinity a tope y aparece en rojo… no está en el cli del MacStudio sino en la desktop app»).
La app Codex del MacStudio mantiene hilos que empezaron hace semanas (rollouts del 17/21/29-10 que escriben hoy): ya no hay
ventana de 15 días, las sesiones largas se leen desde la primera línea de hoy y por trozos, y las apps mandan su %cpu."""
import json, os, tempfile, unittest
from datetime import datetime, timedelta
from test_pulso_fuentes import cargar


def tc(ts, i, c, o):
    return {"timestamp": ts, "type": "event_msg", "payload": {"type": "token_count", "info": {"total_token_usage": {"input_tokens": i, "cached_input_tokens": c, "output_tokens": o}}}}


class R233(unittest.TestCase):
    def sesion(self, m, h, dias_atras, lineas, relleno=0):
        d0 = datetime.now(m.MADRID) - timedelta(days=dias_atras)
        d = os.path.join(h, ".codex", "sessions", d0.strftime("%Y/%m/%d")); os.makedirs(d, exist_ok=True)
        p = os.path.join(d, "rollout-x-01a186e2-8dea-7dd3-89fa-6d510d428d4c.jsonl")
        with open(p, "w") as f:
            for i, l in enumerate(lineas):
                f.write(json.dumps(l) + "\n")
                if i == 1 and relleno:  # líneas de ayer para que el fichero sea «largo»
                    ayer = lineas[1]["timestamp"]
                    for k in range(relleno):
                        f.write(json.dumps({"timestamp": ayer, "type": "response_item", "payload": {"x": "a" * 2000}}) + "\n")
        return p

    def test_sesion_de_hace_un_mes_cuenta_solo_lo_de_hoy(self):
        h = tempfile.mkdtemp(); m = cargar(h)
        ahora = datetime.now(m.MADRID); hoy = ahora.astimezone(m.timezone.utc).isoformat()
        ayer = (ahora - timedelta(days=1)).astimezone(m.timezone.utc).isoformat()
        self.sesion(m, h, 30, [{"timestamp": ayer, "type": "session_meta", "payload": {"cwd": "/x"}}, tc(ayer, 1000, 600, 50), tc(hoy, 1300, 800, 60)])
        inicio = ahora.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
        c = {"claude": {"files": {}, "msgs": {}, "ult": {}}, "codex": {"files": {}}}
        tok, cache, ult, pp = m.codex(c, ahora.strftime("%Y-%m-%d"), inicio)
        self.assertEqual(tok, (300 - 200) + 10)  # (Δin − Δcache) + Δout
        self.assertEqual(cache, 200)
        self.assertIsNotNone(ult)

    def test_sesion_larga_salta_a_hoy_con_base_previa(self):
        h = tempfile.mkdtemp(); m = cargar(h)
        m.TROZO = 64 * 1024  # umbral de «larga» = 16 KB en el test
        ahora = datetime.now(m.MADRID); hoy = ahora.astimezone(m.timezone.utc).isoformat()
        ayer = (ahora - timedelta(days=1)).astimezone(m.timezone.utc).isoformat()
        p = self.sesion(m, h, 25, [{"timestamp": ayer, "type": "session_meta", "payload": {"cwd": "/x"}}, tc(ayer, 5000, 4000, 100), tc(hoy, 5600, 4400, 130)], relleno=3000)
        inicio = ahora.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
        off = m.offset_desde(p, inicio)
        self.assertGreater(off, 1024 * 1024)
        self.assertEqual(m.ultimo_token_count(p, off), [5000, 4000, 100])
        c = {"claude": {"files": {}, "msgs": {}, "ult": {}}, "codex": {"files": {}}}
        tok, cache, _u, _pp = m.codex(c, ahora.strftime("%Y-%m-%d"), inicio)
        self.assertEqual(tok, (600 - 400) + 30)
        f = list(c["codex"]["files"].values())[0]
        self.assertEqual(f["cwd"], "/x")
        self.assertEqual(f["off"], os.path.getsize(p))

    def test_sin_base_previa_el_primer_token_count_solo_fija_base(self):
        h = tempfile.mkdtemp(); m = cargar(h)
        f = {"off": 0, "prev": None, "tok": 0, "cache": 0, "ult": None, "cwd": "/x", "pp": {}, "base_pend": True}
        hoy = datetime.now(m.MADRID); dia = hoy.strftime("%Y-%m-%d"); ts = hoy.astimezone(m.timezone.utc).isoformat()
        m.procesa_linea_codex(f, json.dumps(tc(ts, 26541934259, 26430897664, 13956111)).encode(), dia)
        self.assertEqual(f["tok"], 0)
        m.procesa_linea_codex(f, json.dumps(tc(ts, 26542474731, 26431437568, 13956241)).encode(), dia)
        self.assertEqual(f["tok"], (540472 - 539904) + 130)

    def test_cpu_arbol(self):
        m = cargar(tempfile.mkdtemp())
        procs = [(10, 1, "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT"), (11, 10, "helper"), (12, 11, "codex app-server"), (20, 1, "otro")]
        self.assertEqual(m.cpu_arbol(10, procs, {10: 3.0, 11: 1.5, 12: 40.25, 20: 99.0}), 44.8)


if __name__ == "__main__":
    unittest.main()
