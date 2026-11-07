"""#5845: el publicador del visor rota su propio log (lo abre launchd y nadie más lo rota)."""
import importlib.util, os, tempfile, unittest
from pathlib import Path

_s = importlib.util.spec_from_file_location("visor_publicar", Path(__file__).with_name("visor-publicar.py"))
VP = importlib.util.module_from_spec(_s)
_s.loader.exec_module(VP)


def _leer(ruta):
    with open(ruta, "rb") as f:
        return f.read()


class T(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.log = os.path.join(self.dir.name, "visor-publicar.log")
        self.fds = []

    def tearDown(self):
        for fd in self.fds:
            try:
                os.close(fd)
            except OSError:
                pass
        self.dir.cleanup()

    def _como_launchd(self, contenido):
        # launchd abre StandardOutPath y StandardErrorPath por separado, en modo añadir.
        with open(self.log, "wb") as f:
            f.write(contenido)
        self.fds = [os.open(self.log, os.O_WRONLY | os.O_APPEND) for _ in range(2)]
        return tuple(self.fds)

    def test_por_debajo_del_tope_no_rota(self):
        fds = self._como_launchd(b"x" * 100)
        self.assertFalse(VP.rotar_log(self.log, tope=1000, copias=3, fds=fds))
        self.assertFalse(os.path.exists(self.log + ".1"))

    def test_rota_y_sigue_escribiendo_en_el_mismo_sitio(self):
        fds = self._como_launchd(b"viejo\n" * 300)
        self.assertTrue(VP.rotar_log(self.log, tope=1000, copias=3, fds=fds))
        self.assertEqual(_leer(self.log + ".1"), b"viejo\n" * 300)
        os.write(fds[0], b"stdout nuevo\n")
        os.write(fds[1], b"stderr nuevo\n")
        self.assertEqual(_leer(self.log), b"stdout nuevo\nstderr nuevo\n")
        self.assertEqual(_leer(self.log + ".1"), b"viejo\n" * 300)

    def test_lanzado_en_una_terminal_no_toca_nada(self):
        with open(self.log, "wb") as f:
            f.write(b"x" * 5000)
        otro = os.path.join(self.dir.name, "terminal")
        self.fds = [os.open(otro, os.O_WRONLY | os.O_CREAT | os.O_APPEND)]
        self.assertFalse(VP.rotar_log(self.log, tope=1000, copias=3, fds=tuple(self.fds)))
        self.assertEqual(os.path.getsize(self.log), 5000)
        self.assertFalse(os.path.exists(self.log + ".1"))

    def test_desplaza_las_copias_y_descarta_la_mas_vieja(self):
        for i, txt in ((1, b"uno"), (2, b"dos"), (3, b"tres")):
            with open("%s.%d" % (self.log, i), "wb") as f:
                f.write(txt)
        fds = self._como_launchd(b"actual" * 500)
        self.assertTrue(VP.rotar_log(self.log, tope=1000, copias=3, fds=fds))
        self.assertEqual(_leer(self.log + ".1"), b"actual" * 500)
        self.assertEqual(_leer(self.log + ".2"), b"uno")
        self.assertEqual(_leer(self.log + ".3"), b"dos")
        self.assertFalse(os.path.exists(self.log + ".4"))

    def test_sin_log_no_falla(self):
        self.assertFalse(VP.rotar_log(os.path.join(self.dir.name, "no-existe.log"), tope=10, copias=3, fds=(1, 2)))


if __name__ == "__main__":
    unittest.main()
