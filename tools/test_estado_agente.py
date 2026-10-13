"""#5824: la etiqueta de escritorio sale de la máquina leída ahora, nunca de un equipo fijo."""
import importlib.util, unittest
from pathlib import Path

_s = importlib.util.spec_from_file_location("estado_agente", Path(__file__).with_name("estado-agente.py"))
EST = importlib.util.module_from_spec(_s)
_s.loader.exec_module(EST)


def _leer(tabla):
    def leer(argv):
        return tabla.get(tuple(argv), "")
    return leer


class T(unittest.TestCase):
    def test_pro14_hoy(self):
        leer = _leer({("scutil", "--get", "ComputerName"): "MacBookProNegro14"})
        self.assertEqual(EST.maquina_detectada(leer), "MBP14")
        self.assertEqual(EST.etiqueta_escritorio("vigilante de incidencias de admira.app", leer), "MBP14 · vigilante de incidencias de admira.app")

    def test_air_si_la_lectura_es_el_air(self):
        leer = _leer({("scutil", "--get", "LocalHostName"): "MacBookAir16plata"})
        # ComputerName vacío cae al siguiente.
        self.assertEqual(EST.maquina_detectada(leer), "MBA16")
        self.assertEqual(EST.etiqueta_escritorio("vigilante de incidencias de admira.app", leer), "MBA16 · vigilante de incidencias de admira.app")

    def test_sin_lectura_no_inventa_equipo(self):
        self.assertIsNone(EST.maquina_detectada(_leer({})))
        self.assertEqual(EST.etiqueta_escritorio("vigilante de incidencias de admira.app", _leer({})), "vigilante de incidencias de admira.app")
        self.assertNotIn("MBA16", EST.etiqueta_escritorio("vigilante de incidencias de admira.app", _leer({})))
        self.assertNotIn("MBP14", EST.etiqueta_escritorio("", _leer({})))

    def test_etiquetas_usa_el_nombre_leido(self):
        self.assertEqual(EST.etiquetas("Trinity · Codex", "MacBookProNegro14")[1], "MacBook Pro 14")
        self.assertEqual(EST.etiquetas("Trinity · Codex", "macbook-pro-16")[1], "MacBook Pro 16")


if __name__ == "__main__":
    unittest.main()
