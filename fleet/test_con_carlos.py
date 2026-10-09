"""Tests puros de la detección «con Carlos» (r20) de fleet/pulso-tokens.py. python3 -m unittest fleet/test_con_carlos.py"""
import importlib.util, os, unittest

spec = importlib.util.spec_from_file_location("pulso", os.path.join(os.path.dirname(__file__), "pulso-tokens.py"))
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)
T = 1_000_000.0


class Inyectado(unittest.TestCase):
    def test_avisos_de_maquina(self):
        for t in ["Nuevo(s) encargo(s) en tu bot-inbox (1): [5433] task-web", "[MISIÓN AUTO-ASIGNADA · encargo #5433] Eres Neo",
                  '  <pasted_content id="c6e2"> [MISIÓN AUTO-ASIGNADA · encargo #5433 · task-web-17', "[ENCARGO #12] Eres Morfeo en MacMini. Primero",
                  "<task-notification> <task-id>x</task-id>", "<command-name>/clear</command-name>", "", "   "]:
            self.assertTrue(P.es_inyectado(t), t)

    def test_humano(self):
        for t in ["sí, arranca con la animación facial por audio", "arregla el bug del encargo #12", '<pasted_content id="a"> mira este log']:
            self.assertFalse(P.es_inyectado(t), t)


class Turnos(unittest.TestCase):
    def test_claude(self):
        self.assertEqual(P.texto_usuario_claude({"type": "user", "message": {"content": "hola"}}), "hola")
        self.assertIsNone(P.texto_usuario_claude({"type": "user", "isMeta": True, "message": {"content": "x"}}))
        self.assertIsNone(P.texto_usuario_claude({"type": "user", "message": {"content": [{"type": "tool_result", "content": "x"}]}}))
        self.assertIsNone(P.texto_usuario_claude({"type": "assistant", "message": {"content": "x"}}))
        self.assertEqual(P.texto_usuario_claude({"type": "user", "message": {"content": [{"type": "text", "text": "mira"}]}}), "mira")

    def test_codex(self):
        u = lambda t: {"type": "response_item", "payload": {"type": "message", "role": "user", "content": [{"type": "input_text", "text": t}]}}
        self.assertEqual(P.texto_usuario_codex(u("hazlo")), "hazlo")
        self.assertIsNone(P.texto_usuario_codex(u("<environment_context> cwd")))
        self.assertIsNone(P.texto_usuario_codex({"type": "response_item", "payload": {"type": "message", "role": "developer", "content": []}}))


class Evaluar(unittest.TestCase):
    def test_reposo_manda(self):
        ok, m = P.evaluar_con_carlos(400, "Claude", {"ahora": T, "app": T - 10, "app_nombre": "Claude", "humano": (T - 5, "app de Claude")})
        self.assertFalse(ok); self.assertIn("reposo", m)
        self.assertFalse(P.evaluar_con_carlos(None, "Claude", {"ahora": T, "app": T})[0])

    def test_a_app_al_frente(self):
        ok, m = P.evaluar_con_carlos(3, "Claude", {"ahora": T, "app": T - 30, "app_nombre": "Claude"})
        self.assertTrue(ok); self.assertIn("a)", m)
        self.assertFalse(P.evaluar_con_carlos(3, "Safari", {"ahora": T, "app": T - 30, "app_nombre": "Claude"})[0])
        self.assertFalse(P.evaluar_con_carlos(3, "Claude", {"ahora": T, "app": T - 900, "app_nombre": "Claude"})[0])

    def test_b_tmux(self):
        self.assertTrue(P.evaluar_con_carlos(3, "Terminal", {"ahora": T, "tmux": ("neo", T - 20)})[0])
        self.assertFalse(P.evaluar_con_carlos(3, "Claude", {"ahora": T, "tmux": ("neo", T - 20)})[0])
        self.assertFalse(P.evaluar_con_carlos(3, "Terminal", {"ahora": T, "tmux": ("neo", T - 900)})[0])

    def test_c_prompt_humano(self):
        ok, m = P.evaluar_con_carlos(10, "Slack", {"ahora": T, "humano": (T - 60, "app de Claude")})
        self.assertTrue(ok); self.assertIn("c)", m)
        self.assertFalse(P.evaluar_con_carlos(10, "Slack", {"ahora": T, "humano": (T - 400, "app de Claude")})[0])

    def test_desde(self):
        self.assertEqual(P.desde_con_carlos(None, True, "N"), "N")
        self.assertEqual(P.desde_con_carlos({"conCarlos": True, "desde": "A"}, True, "N"), "A")
        self.assertIsNone(P.desde_con_carlos({"conCarlos": True, "desde": "A"}, False, "N"))
        self.assertEqual(P.desde_con_carlos({"conCarlos": False, "desde": None}, True, "N"), "N")


if __name__ == "__main__":
    unittest.main()
