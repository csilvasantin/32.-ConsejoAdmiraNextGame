#!/usr/bin/env python3
"""Modo y etiqueta del publicador (#5822). No abre red ni imprime secretos."""
import importlib.util
import os
import subprocess
import tempfile
import unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)


def cargar():
    spec = importlib.util.spec_from_file_location("visor_publicar", os.path.join(AQUI, "visor-publicar.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


V = cargar()


class Modo(unittest.TestCase):
    def test_etiquetas(self):
        self.assertEqual(V.etiqueta_modo("nube"), "GrokBot")
        self.assertEqual(V.etiqueta_modo("hibrido", ""), "GrokBot → MBP16")
        self.assertEqual(V.etiqueta_modo("hibrido", "MBP16"), "GrokBot → MBP16")
        self.assertEqual(V.etiqueta_modo("edge", "MBP14"), "MBP14")
        self.assertEqual(V.etiqueta_modo("edge", "MBA16"), "MBA16")
        self.assertEqual(V.etiqueta_modo("sin_terminal"), "sin terminal, solo encargo")

    def test_escritorio_no_lleva_terminal(self):
        cfg = {"maquina": "macbookpronegro14", "modo": "edge", "terminal": "MBP14"}
        linea = {"modo": "", "terminal": "", "superficie": "escritorio"}
        modo, terminal, etq = V.resolver_modo(linea, cfg)
        self.assertEqual(modo, "sin_terminal")
        self.assertEqual(etq, "sin terminal, solo encargo")
        cap = {"lineas": ["no debe salir"], "cmd": "claude", "mision": "#5801 · in_progress · foco"}
        V.aplicar_modo(cap, modo, terminal, etq, cap["mision"])
        self.assertEqual(cap["lineas"], [])
        self.assertEqual(cap["cmd"], "")
        self.assertEqual(cap["encargo"], "5801")
        self.assertEqual(cap["encargo_estado"], "in_progress")
        self.assertEqual(cap["marca"], "sin terminal, solo encargo")

    def test_la_linea_manda_sobre_la_maquina(self):
        cfg = {"modo": "nube", "terminal": "GrokBot"}
        modo, terminal, etq = V.resolver_modo({"modo": "hibrido", "terminal": "MBP16", "superficie": "tmux"}, cfg)
        self.assertEqual((modo, terminal, etq), ("hibrido", "MBP16", "GrokBot → MBP16"))

    def test_conf_de_maquina(self):
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "visor-maquina.conf")
            with open(ruta, "w", encoding="utf-8") as f:
                f.write("# caja\nmaquina=grokbotbox\nmodo=nube\nterminal=GrokBot\n")
            cfg = V.leer_maquina(ruta)
        self.assertEqual(cfg["maquina"], "grokbotbox")
        self.assertEqual(V.yo(cfg), "grokbotbox")
        self.assertEqual(V.etiqueta_modo(cfg["modo"], cfg["terminal"]), "GrokBot")

    def test_no_publica_si_queda_un_secreto(self):
        cuerpo = {"agentes": {"neo": {"lineas": ["sk-ant-" + "a" * 20]}}}
        r = V.enviar(cuerpo, "no-se-imprime", True)
        self.assertEqual(r.get("error"), "secretos")
        self.assertNotIn("sk-ant-", str(r))

    def test_el_resumen_no_lleva_el_texto_del_pane(self):
        cuerpo = {"agentes": {"merovingio": {"modo_agente": "nube", "etiqueta_modo": "GrokBot", "estado": "vivo", "lineas": ["linea privada del pane"], "encargo": ""}}}
        txt = str(V.resumen(cuerpo))
        self.assertIn("GrokBot", txt)
        self.assertNotIn("privada", txt)


class Scripts(unittest.TestCase):
    def test_planes_de_los_tres_macs(self):
        inst = os.path.join(AQUI, "visor-instalar.sh")
        esperado = {
            "MacBookPro16": ("perfil=mbp16", "modo=hibrido", "etiqueta=GrokBot → MBP16", "claves=no se leen"),
            "MacBookProNegro14": ("perfil=mbp14", "etiqueta=MBP14", "superficie=escritorio", "sesion=neo", "marca=sin terminal, solo encargo"),
            "MacBookAir16Plata": ("perfil=mba16", "etiqueta=MBA16", "sesion=trinity", "marca=sin terminal, solo encargo"),
        }
        for equipo, trozos in esperado.items():
            r = subprocess.run(["bash", inst, "--plan", "--equipo", equipo], capture_output=True, text=True, check=True)
            for t in trozos:
                self.assertIn(t, r.stdout, equipo)
            self.assertNotIn("token", r.stdout.lower())

    def test_plan_desconocido_no_instala(self):
        r = subprocess.run(["bash", os.path.join(AQUI, "visor-instalar.sh"), "--plan", "--equipo", "ThinkStation"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 2)

    def test_lanzador_en_plan_no_llama_a_tmux(self):
        r = subprocess.run(["bash", "-x", os.path.join(AQUI, "tmux-edge-lanzar.sh"), "--plan"], capture_output=True, text=True, check=True)
        self.assertIn("arranca=no", r.stdout)
        self.assertIn("toca_sesiones=no", r.stdout)
        self.assertIn("neo runtime=claude", r.stdout)
        self.assertIn("trinity runtime=codex", r.stdout)
        self.assertNotIn("new-session", r.stderr)
        self.assertNotIn("has-session", r.stderr)

    def test_lanzador_no_arranca_fuera_de_macos(self):
        r = subprocess.run(["bash", os.path.join(AQUI, "tmux-edge-lanzar.sh"), "--arrancar"], capture_output=True, text=True, env={**os.environ, "EDGE_CONFIRMO": "si"})
        self.assertEqual(r.returncode, 2)
        self.assertIn("no toco tmux", r.stderr)

    def test_el_instalador_no_lee_ficheros_de_clave(self):
        txt = open(os.path.join(AQUI, "visor-instalar.sh"), encoding="utf-8").read()
        self.assertNotIn("consumos-lecturas.token", txt)
        self.assertNotIn("COUNCIL_MACHINE_TOKEN", txt)
        self.assertIn("copia previa", txt)


if __name__ == "__main__":
    unittest.main()
