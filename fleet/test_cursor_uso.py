# r27: fleet/cursor-uso.py (Cursor Pro → pulso) y el motor «grok» (Smith) de pulso-tokens.py — funciones puras.
import importlib.util, os, tempfile, unittest
from datetime import datetime, timezone

def carga(nombre, fichero):
    spec = importlib.util.spec_from_file_location(nombre, os.path.join(os.path.dirname(__file__), fichero))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m

C = carga("cursor_uso", "cursor-uso.py")
P = carga("pulso", "pulso-tokens.py")
CAB = "Date,Cloud Agent ID,Automation ID,Kind,Model,Max Mode,Input (w/ Cache Write),Input (w/o Cache Write),Cache Read,Output Tokens,Total Tokens,Cost\n"
FILAS = [
    '"2026-10-09T12:24:22.588Z","","","Included","grok-bot-automation","No","","","","","","Free"',  # pendiente (sin tokens)
    '"2026-10-09T03:40:30.627Z","","","Included","grok-bot-default","No","136684","4","0","982","137670","Included"',
    '"2026-10-09T03:40:21.874Z","","","Included","grok-bot-default","No","624","2","76957","1706","79289","Included"',
    '"2026-10-08T21:59:00.000Z","","","Included","grok-bot-default","No","1000","0","5","10","1015","Included"',  # 23:59 Madrid de ayer
]


class TestCursorUso(unittest.TestCase):
    def setUp(self):
        self.f = tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False)
        self.f.write(CAB + "\n".join(FILAS) + "\n")
        self.f.close()
        self.ev = C.leer_csv(self.f.name)
        self.ahora = datetime(2026, 10, 9, 13, 0, tzinfo=timezone.utc)

    def tearDown(self):
        os.unlink(self.f.name)

    def test_metrica_igual_que_claude_codex(self):
        r = C.calcular(self.ev, self.ahora, "admiranext.com")
        # tokHoy = entrada (con y sin escritura de caché) + salida = Total − Cache Read; la lectura de caché va aparte.
        self.assertEqual(r["tokHoy"], (137670 - 0) + (79289 - 76957))
        self.assertEqual(r["cacheHoy"], 76957)
        self.assertEqual(r["pendientes"], 1)
        self.assertEqual(r["eventos"], 2)
        self.assertEqual(r["serie"][0][1], 0)
        self.assertEqual(r["serie"][-1][1], r["tokHoy"])
        self.assertEqual(r["serie"][-1][3], {"admiranext.com": r["tokHoy"]})
        self.assertEqual([p[0] for p in r["serie"]], sorted({p[0] for p in r["serie"]}))

    def test_mismo_csv_misma_serie(self):
        a = C.calcular(self.ev, self.ahora, "admiranext.com")
        b = C.calcular(C.leer_csv(self.f.name), self.ahora, "admiranext.com")
        self.assertEqual(a["serie"], b["serie"])

    def test_bloques_solo_si_el_csv_los_cubre(self):
        bl = C.bloques(self.ev, self.ahora)
        self.assertEqual([b["ts"][:16] for b in bl], ["2026-10-09T00:00", "2026-10-09T12:00"][-len(bl):])
        self.assertIn("incompleto", bl[-1]["nota"])


class TestGrokSmith(unittest.TestCase):
    def test_turnos_metrica(self):
        u = {"turns": [{"turnNumber": 1, "endedAt": "2026-10-08T21:00:00+00:00", "inputTokens": 10, "cachedReadTokens": 5, "outputTokens": 1},
                       {"turnNumber": 2, "endedAt": "2026-10-09T10:00:00+00:00", "inputTokens": 1832820, "cachedReadTokens": 1796992, "cacheCreationTokens": 0, "outputTokens": 18785}]}
        ini = datetime(2026, 10, 8, 22, 0, tzinfo=timezone.utc).timestamp()
        t = P.turnos_grok(u, ini, ini + 86400)
        self.assertEqual(len(t), 1)
        self.assertEqual(t[0][2], (1832820 - 1796992) + 18785)
        self.assertEqual(t[0][3], 1796992)
        self.assertEqual(t[0][4], datetime(2026, 10, 8, 21, 0, tzinfo=timezone.utc).timestamp(), "el turno empieza donde acabó el anterior")

    def test_proyecto_por_repo_github(self):
        self.assertEqual(P.proyecto_de_texto("https://github.com/csilvasantin/admira-store/commit/e8c0ffd"), "admira.store")
        self.assertIsNone(P.proyecto_de_texto("nada que ver"))


if __name__ == "__main__":
    unittest.main()
