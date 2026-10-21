import importlib.util, json, os, sys, tempfile, unittest
from datetime import datetime, timedelta

AQUI = os.path.dirname(os.path.abspath(__file__))


def cargar(home):
    os.environ["HOME"] = home
    spec = importlib.util.spec_from_file_location("pulso", os.path.join(AQUI, "pulso-tokens.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    m.HOME = home; m.APP_CLAUDE = os.path.join(home, "Library", "Application Support", "Claude")
    m.proyecto_de = lambda cwd: "proy" if cwd else m.OTROS
    return m


class Fuentes(unittest.TestCase):
    def test_maquinas(self):
        m = cargar(tempfile.mkdtemp())
        self.assertEqual(m.MAPA["MacStudio"]["claude"][0], "Neo")
        self.assertEqual(m.MAPA["MacStudio"]["codex"][0], "Trinity")
        self.assertEqual(m.MAPA["MacBookPro16"], {})

    def test_codex_sin_doble(self):
        h = tempfile.mkdtemp(); m = cargar(h)
        hoy = datetime.now(m.MADRID); ts = hoy.astimezone(m.timezone.utc).isoformat()
        uid = "01a15525-2c47-7642-b34c-a51fc2dcec75"
        lin = [{"timestamp": ts, "type": "session_meta", "payload": {"cwd": "/x"}},
               {"timestamp": ts, "type": "event_msg", "payload": {"type": "token_count", "info": {"total_token_usage": {"input_tokens": 100, "cached_input_tokens": 40, "output_tokens": 10}}}}]
        for sub in (os.path.join("sessions", hoy.strftime("%Y/%m/%d")), "archived_sessions"):
            d = os.path.join(h, ".codex", sub); os.makedirs(d)
            open(os.path.join(d, "rollout-x-%s.jsonl" % uid), "w").write("\n".join(json.dumps(x) for x in lin) + "\n")
        c = m.cargar_cache(hoy.strftime("%Y-%m-%d"))
        tok, cache, _, _ = m.codex(c, hoy.strftime("%Y-%m-%d"), hoy.replace(hour=0, minute=0).timestamp())
        self.assertEqual((tok, cache), (70, 40))

    def test_claude_app_dedupe(self):
        h = tempfile.mkdtemp(); m = cargar(h)
        hoy = datetime.now(m.MADRID); ts = hoy.astimezone(m.timezone.utc).isoformat()
        l = {"type": "assistant", "timestamp": ts, "cwd": "/x", "entrypoint": "claude-desktop", "requestId": "r",
             "message": {"id": "m", "usage": {"input_tokens": 5, "output_tokens": 7, "cache_creation_input_tokens": 3, "cache_read_input_tokens": 50}}}
        for d in (os.path.join(h, ".claude", "projects", "p"), os.path.join(m.APP_CLAUDE, "claude-code-sessions", "a")):
            os.makedirs(d); open(os.path.join(d, "s.jsonl"), "w").write(json.dumps(l) + "\n")
        c = m.cargar_cache(hoy.strftime("%Y-%m-%d"))
        tok, cache, _, pp = m.claude(c, hoy.strftime("%Y-%m-%d"), hoy.replace(hour=0, minute=0).timestamp())
        self.assertEqual((tok, cache, pp), (15, 50, {"proy": 15}))


if __name__ == "__main__":
    unittest.main()
