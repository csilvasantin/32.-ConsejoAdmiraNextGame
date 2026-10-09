"""r30: atribución de commits a agentes y filtro de ficheros de tools/lineas-commits.py."""
import importlib.util, unittest
from pathlib import Path
_s = importlib.util.spec_from_file_location("lc", Path(__file__).with_name("lineas-commits.py"))
LC = importlib.util.module_from_spec(_s); _s.loader.exec_module(LC)


class T(unittest.TestCase):
    def test_agentes(self):
        self.assertEqual(LC.agente_de("TrinityMBP16", "csilva@admira.com", []), ("Trinity", None))
        self.assertEqual(LC.agente_de("LucasGrokBotBox", "lucas@grokbotbox.local", [])[0], "Lucas")
        self.assertEqual(LC.agente_de("WaltDisneyBox", "walt@admira.local", [])[0], "Disney")
        self.assertEqual(LC.agente_de("Carlos Silva", "x@gmail.com", ["GrokBot <grokbot@admira.local>"])[0], "Grok Bot")
        self.assertEqual(LC.agente_de("Cursor Agent", "cursoragent@cursor.com", [])[0], "Grok Bot")
        self.assertEqual(LC.agente_de("Carlos Silva", "csilva@admira.co", ["Carlos Silva <csilvasantin@MacBook-Pro-16.local>", "Claude Opus 5.5 <noreply@anthropic.com>"]), ("Neo", "MacBook Pro 16"))
        self.assertEqual(LC.agente_de("csilvasantin", "csilvasantin@MacMini.local", []), ("sin atribuir", "MacMini"))
        self.assertEqual(LC.agente_de("Carlos Silva", "csilvasantin@gmail.com", []), ("sin atribuir", None))

    def test_parsea_y_filtra(self):
        log = ("\x1eabc1234567\x1f1791500000\x1fOraculoMacMini\x1fx@y\x1f\x1fAdaptador\n\n"
               "10\t2\tsrc/a.js\n500\t0\tpackage-lock.json\n7\t1\tdist/b.js\n3\t0\t{old => new}/c.py\n-\t-\timg.png\n"
               "\x1eshallow000\x1f1791400000\x1fNeo\x1fx@y\x1f\x1fborde\n\n90000\t0\tsrc/todo.js\n")
        cs = LC.parsea_log(log, {"shallow000"})
        self.assertEqual(cs, [{"s": "abc1234", "t": 1791500000, "a": 13, "d": 2, "g": "Oráculo", "m": None}])


if __name__ == "__main__":
    unittest.main()
