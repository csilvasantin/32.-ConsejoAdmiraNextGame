#!/usr/bin/env python3
"""Regresión del agente de captura sin macOS: el backend de screencapture es un doble."""
import importlib.util
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


CAP = load("fleet_capture_agent", "fleet-capture.py")
GEO = load("display_geometry", "display_geometry.py")
INP = load("fleet_input_agent", "fleet-input.py")


def jpeg_for(display):
    return b"\xff\xd8\xff" + bytes([int(display["indice"]) + 1]) + b"\x00" * 300


class FakeBackend:
    def __init__(self):
        self.calls = []
        self.mode = "ok"
        self.fail_remaining = 0

    def displays(self):
        return GEO.displays_from_ordered([
            {"id": "main", "principal": True, "x": 0, "y": 0, "w": 1440, "h": 900},
            {"id": "left", "x": -800, "y": 0, "w": 800, "h": 1200},
            {"id": "right", "x": 1440, "y": 0, "w": 800, "h": 1200},
        ])

    def capture(self, display):
        self.calls.append(int(display["screencapture_d"]))
        if self.mode == "boom":
            raise RuntimeError("could not create image from display")
        if self.fail_remaining > 0:
            self.fail_remaining -= 1
            return 1, "could not create image from display", b""
        return 0, "", jpeg_for(display)


class CaptureTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.backend = FakeBackend()

    def write_req(self, nonce, display):
        q = self.root / "capture-queue"
        q.mkdir(parents=True, exist_ok=True)
        (q / (nonce + ".req")).write_text("display=%s\n" % display, encoding="utf-8")

    def test_direct_frame_uses_same_validation_and_capture_contract(self):
        ok, output = CAP.capture_stdout("display=1\nscale=.3\nq=60\nmax_width=1600", self.backend, now=1000)
        self.assertTrue(ok)
        self.assertTrue(output.startswith("OK\n"))
        self.assertIn("display=1", output)
        self.assertIn("captured_at=1000", output)
        ok, output = CAP.capture_stdout("display=99", self.backend, now=1001)
        self.assertFalse(ok)
        self.assertTrue(output.startswith("ERR_NO_SUCH_DISPLAY"))
        self.backend.fail_remaining = 10
        ok, output = CAP.capture_stdout("display=0", self.backend, now=1002, sleep_fn=lambda _s: None)
        self.assertFalse(ok)
        self.assertIn("ERR_CAPTURE_TRANSIENT", output)

    def test_retina_width_cap_preserves_scale_upper_bound(self):
        opts = CAP.parse_frame_options("scale=0.6\nq=60\nmax_width=1600")
        self.assertEqual(CAP.frame_long_edge(5120, 2880, opts), 1600)
        self.assertEqual(CAP.frame_long_edge(5120, 2880, CAP.parse_frame_options("scale=1\nq=80\nmax_width=2560")), 2560)
        self.assertEqual(CAP.frame_long_edge(2560, 1440, opts), 1536)
        self.assertIsNone(CAP.parse_frame_options("scale=.5\nmax_width=NaN"))

    def test_transient_then_next_request_works(self):
        (self.root / "capture.paused").write_text("1", encoding="utf-8")
        self.write_req("uno", "0")
        self.backend.fail_remaining = 9
        done = CAP.service_once(self.root, self.backend, now=1_700_000_000, sleep_fn=lambda _s: None, attempts=2)
        self.assertEqual(done[0]["error"], "ERR_CAPTURE_TRANSIENT")
        text = (self.root / "capture-queue" / "uno.out").read_text(encoding="utf-8")
        self.assertIn("SCREEN_CAPTURE_FAILED rc=1", text)
        self.assertIn("could not create image from display", text)
        self.assertNotIn("ERR_CAPTURE_PAUSED", text)
        self.assertFalse((self.root / "capture.paused").exists())
        self.backend.fail_remaining = 0
        self.write_req("dos", "0")
        done = CAP.service_once(self.root, self.backend, now=1_700_000_001, sleep_fn=lambda _s: None, attempts=2)
        self.assertTrue(done[0]["ok"])
        self.assertGreaterEqual(len(self.backend.calls), 3)

    def test_runtimeerror_does_not_latch(self):
        self.backend.mode = "boom"
        self.write_req("boom", "1")
        done = CAP.service_once(self.root, self.backend, now=50, sleep_fn=lambda _s: None, attempts=2)
        self.assertEqual(done[0]["error"], "ERR_CAPTURE_TRANSIENT")
        self.assertIn("RuntimeError", done[0]["detail"])
        self.backend.mode = "ok"
        self.write_req("vive", "1")
        done = CAP.service_once(self.root, self.backend, now=51, sleep_fn=lambda _s: None, attempts=2)
        self.assertTrue(done[0]["ok"])
        self.assertEqual(done[0]["display"], 1)

    def test_invalid_display_does_not_call_screencapture(self):
        self.write_req("mala", "9")
        self.write_req("texto", "abc")
        done = CAP.service_once(self.root, self.backend, now=10, sleep_fn=lambda _s: None)
        errors = {item["nonce"]: item["error"] for item in done}
        self.assertEqual(errors["mala"], "ERR_NO_SUCH_DISPLAY")
        self.assertEqual(errors["texto"], "ERR_NO_SUCH_DISPLAY")
        self.assertEqual(self.backend.calls, [])

    def test_interleaved_requests_keep_their_display(self):
        self.write_req("a", "0")
        self.write_req("b", "1")
        (self.root / "capture.req").write_text("c|2\n", encoding="utf-8")
        done = CAP.service_once(self.root, self.backend, now=80, sleep_fn=lambda _s: None)
        by_nonce = {}
        for item in done:
            raw = (self.root / "capture-queue" / (item["nonce"] + ".out")).read_text(encoding="utf-8")
            b64 = raw.splitlines()[1]
            blob = __import__("base64").b64decode(b64)
            by_nonce[item["nonce"]] = blob[3]
        self.assertEqual(by_nonce, {"a": 1, "b": 2, "c": 3})
        self.assertEqual(self.backend.calls, [1, 2, 3])
        self.assertFalse((self.root / "capture.req").exists())

    def test_legacy_mailbox_does_not_drop_the_first_request(self):
        (self.root / "capture.req").write_text("aaa|1\n", encoding="utf-8")
        CAP.claim_legacy(self.root)
        (self.root / "capture.req").write_text("bbb|0\n", encoding="utf-8")
        CAP.claim_legacy(self.root)
        q = self.root / "capture-queue"
        self.assertEqual((q / "aaa.req").read_text(encoding="utf-8").strip(), "display=1")
        self.assertEqual((q / "bbb.req").read_text(encoding="utf-8").strip(), "display=0")

    def test_freshness_stamp_is_the_capture_clock(self):
        self.write_req("ahora", "2")
        CAP.service_once(self.root, self.backend, now=1_234, sleep_fn=lambda _s: None)
        text = (self.root / "capture-queue" / "ahora.out").read_text(encoding="utf-8")
        self.assertIn("captured_at=1234", text)
        self.assertTrue(text.startswith("OK\n/9j/"))

    def test_retry_then_success_uses_the_same_display(self):
        self.backend.fail_remaining = 1
        self.write_req("re", "2")
        done = CAP.service_once(self.root, self.backend, now=9, sleep_fn=lambda _s: None, attempts=2)
        self.assertTrue(done[0]["ok"])
        self.assertEqual(self.backend.calls, [3, 3])


class GeometryTests(unittest.TestCase):
    def test_index_zero_is_dash_d_one_and_click_stays_on_that_display(self):
        ds = GEO.displays_from_ordered([
            {"id": "main", "x": 0, "y": 0, "w": 1000, "h": 500},
            {"id": "side", "x": 1920, "y": 0, "w": 800, "h": 600},
        ])
        self.assertEqual(ds[0]["screencapture_d"], 1)
        self.assertEqual(ds[1]["screencapture_d"], 2)
        hit = GEO.map_point(ds, 1, 0, 0)
        self.assertEqual((hit["x"], hit["y"], hit["display"]), (1920, 0, 1))
        self.assertFalse(GEO.map_point(ds, 5, 0, 0)["ok"])
        self.assertEqual(GEO.map_point(ds, 5, 0, 0)["error"], "ERR_NO_SUCH_DISPLAY")
        edge = GEO.map_point(ds, 0, 5, -3)
        self.assertEqual((edge["x"], edge["y"]), (999, 0))
        self.assertLess(edge["x"], 1000)

    def test_input_plan_does_not_post_when_the_display_is_missing(self):
        ds = GEO.displays_from_ordered([{"id": "main", "x": 0, "y": 0, "w": 100, "h": 100}])
        posted = []
        result = INP.ejecutar({"type": "down", "x": 0.5, "y": 0.5, "display": 2, "button": "left"}, ds, posted.append)
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"], "ERR_NO_SUCH_DISPLAY")
        self.assertEqual(posted, [])
        ok = INP.ejecutar({"type": "text", "text": "ñ"}, ds, posted.append)
        self.assertTrue(ok["ok"])
        self.assertEqual(posted[0]["text"], "ñ")
        self.assertNotIn("x", posted[0])


class FrameOptionsTests(unittest.TestCase):
    @staticmethod
    def jpeg(width, height):
        return b"\xff\xd8\xff\xc0\x00\x11\x08" + height.to_bytes(2, "big") + width.to_bytes(2, "big") + bytes(230)

    def test_settings_are_opt_in_and_cannot_inject_commands(self):
        self.assertIsNone(CAP.parse_frame_options("display=0\n"))
        self.assertIsNone(CAP.parse_frame_options("display=0\nscale=nan\n"))
        self.assertIsNone(CAP.parse_frame_options("q=$(bad)\n"))
        self.assertEqual(CAP.parse_frame_options("scale=.5\nq=.6\n"), {"scale": .5, "quality": 60, "max_width": None})
        self.assertEqual(CAP.parse_frame_options("scale=6\nq=600\n")["scale"], 1)

    def test_origin_resizes_native_retina_pixels_and_preserves_normalized_geometry(self):
        backend = CAP.ProductionBackend()
        calls = []
        def run(args, **kwargs):
            calls.append(args)
            if args[0].endswith("screencapture"):
                Path(args[-1]).write_bytes(self.jpeg(2560, 1440))
            else:
                self.assertEqual(args[:6], ["/usr/bin/sips", "-Z", "1280", "-s", "formatOptions", "60"])
                Path(args[-1]).write_bytes(self.jpeg(1280, 720))
            return SimpleNamespace(returncode=0, stderr=b"")
        with patch("subprocess.run", side_effect=run):
            rc, _err, blob, optimized = backend.capture_frame({"screencapture_d": 2}, {"scale": .5, "quality": 60, "max_width": None})
        self.assertEqual(rc, 0)
        self.assertTrue(optimized)
        self.assertEqual(CAP.jpeg_dimensions(blob), (1280, 720))
        self.assertEqual(calls[0][-2], "2")
        self.assertFalse(Path(calls[0][-1]).exists())

    def test_origin_failure_preserves_original_for_hub_fallback_and_native_action_has_no_sips(self):
        backend = CAP.ProductionBackend()
        calls = []
        source = self.jpeg(2560, 1440)
        def run(args, **kwargs):
            calls.append(args)
            if args[0].endswith("screencapture"):
                Path(args[-1]).write_bytes(source)
                return SimpleNamespace(returncode=0, stderr=b"")
            raise OSError("sips unavailable")
        with patch("subprocess.run", side_effect=run):
            result = backend.capture_frame({"screencapture_d": 1}, {"scale": .5, "quality": 60, "max_width": None})
            self.assertEqual(result, (0, "", source, False))
            calls.clear()
            self.assertEqual(backend.capture({"screencapture_d": 1}), (0, "", source))
            self.assertEqual(len(calls), 1)

    def test_queue_reports_origin_optimization_without_changing_display(self):
        root = Path(tempfile.mkdtemp())
        q = root / "capture-queue"
        q.mkdir()
        (q / "live.req").write_text("display=1\nscale=.5\nq=60\n")
        backend = FakeBackend()
        got = []
        def capture_frame(target, options):
            got.append((target["indice"], options))
            return 0, "", self.jpeg(1280, 720), True
        backend.capture_frame = capture_frame
        CAP.service_once(root, backend, now=1000)
        self.assertIn("optimized=1", (q / "live.out").read_text())
        self.assertEqual(got[0][0], 1)
        self.assertEqual(got[0][1]["scale"], .5)


if __name__ == "__main__":
    unittest.main()
