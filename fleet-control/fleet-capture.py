#!/usr/bin/env python3
"""Agente de captura de la flota (LaunchAgent en la sesión gráfica del usuario).

Una petición = un fichero en ~/.fleet/capture-queue/<nonce>.req. La respuesta
va a <nonce>.out. No hay un buzón único capture.req que una petición pise a
otra, ni un pestillo de pausa: un screencapture que falla (rc=1, «could not
create image from display») se reintenta en ESA petición y la siguiente
empieza de cero.

No modifica TCC ni concede Grabación de pantalla. screencapture corre como
este mismo python3, lanzado por launchd en gui/<uid>. Si el sistema niega la
captura, la petición termina en ERR_CAPTURE_TRANSIENT y el proceso sigue.
"""
from __future__ import annotations

import base64
import math
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from display_geometry import displays_from_ordered  # noqa: E402

CAPTURE_VERSION = 4
FRAME_CLI_VERSION = 1
ATTEMPTS = 2
CAPTURE_TIMEOUT_S = 5
MIN_JPEG = 200


def safe_nonce(raw):
    text = "".join(ch for ch in str(raw or "") if ch.isalnum() or ch in "._-")
    if not text or text != str(raw or "").strip() or len(text) > 80:
        return None
    return text


def clear_pause_latch(root):
    """Un agente viejo dejaba capture.paused y ya no volvía a capturar."""
    removed = []
    for name in ("capture.paused", "capture.pause"):
        p = Path(root) / name
        if p.exists():
            p.unlink()
            removed.append(name)
    return removed


def parse_req(text):
    display = "0"
    for line in str(text or "").splitlines():
        line = line.strip()
        if line.startswith("display="):
            display = line.split("=", 1)[1].strip()
    return display


def parse_frame_options(text):
    """Only live requests opt in. Old screenshot/probe callers stay native."""
    values = dict(line.split("=", 1) for line in str(text or "").splitlines() if "=" in line)
    if "scale" not in values and "q" not in values:
        return None
    try:
        scale = float(values["scale"]) if "scale" in values else None
        quality = float(values.get("q", 60))
        max_width = float(values["max_width"]) if "max_width" in values else None
        if (scale is not None and not math.isfinite(scale)) or not math.isfinite(quality) or (max_width is not None and not math.isfinite(max_width)):
            return None
        if 0 < quality <= 1:
            quality *= 100
        return {"scale": None if scale is None else min(1, max(0.1, scale)),
                "quality": int(min(95, max(20, quality))),
                "max_width": None if max_width is None else round(min(5120, max(320, max_width)))}
    except (ValueError, TypeError):
        return None


def frame_long_edge(width, height, options):
    scale = options["scale"] if options["scale"] is not None else min(1, 1600 / width)
    if options.get("max_width") is not None:
        scale = min(scale, options["max_width"] / width)
    return max(1, round(max(width, height) * scale))


def jpeg_dimensions(blob):
    """Read the native pixel dimensions, not NSScreen's Retina point size."""
    if len(blob) < 4 or blob[:2] != b"\xff\xd8":
        return None
    at = 2
    sof = (0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf)
    while at + 3 < len(blob):
        if blob[at] != 0xff:
            return None
        at += 1
        while at < len(blob) and blob[at] == 0xff:
            at += 1
        if at >= len(blob):
            return None
        marker = blob[at]
        at += 1
        if marker in (0xd9, 0xda):
            return None
        if marker == 1 or 0xd0 <= marker <= 0xd8:
            continue
        if at + 2 > len(blob):
            return None
        size = int.from_bytes(blob[at:at + 2], "big")
        if size < 2 or at + size > len(blob):
            return None
        if marker in sof:
            if size < 8:
                return None
            height = int.from_bytes(blob[at + 3:at + 5], "big")
            width = int.from_bytes(blob[at + 5:at + 7], "big")
            return (width, height) if width and height else None
        at += size
    return None


def claim_legacy(root):
    """Saca capture.req del buzón con rename atómico antes de leerlo.

    Quien escriba después crea un capture.req nuevo; no pisa el que ya
    estamos sirviendo. El formato viejo es «nonce» o «nonce|pantalla».
    """
    root = Path(root)
    src = root / "capture.req"
    if not src.is_file():
        return None
    claimed = root / ("capture.req.claim-%d-%d" % (time.time_ns(), os.getpid()))
    try:
        os.rename(src, claimed)
    except FileNotFoundError:
        return None
    try:
        raw = claimed.read_text(encoding="utf-8", errors="replace").strip()
    finally:
        try:
            claimed.unlink()
        except OSError:
            pass
    if not raw:
        return None
    nonce, sep, dsp = raw.partition("|")
    nonce = safe_nonce(nonce.strip())
    if not nonce:
        return None
    if not sep:
        dsp = "0"
    queue = root / "capture-queue"
    queue.mkdir(parents=True, exist_ok=True)
    dest = queue / (nonce + ".req")
    dest.write_text("display=%s\n" % dsp.strip(), encoding="utf-8")
    return dest


def _jpeg_b64(blob):
    if not blob or len(blob) < MIN_JPEG or blob[0:3] != b"\xff\xd8\xff":
        return None
    return base64.b64encode(blob).decode("ascii")


def _write_out(path, lines):
    tmp = Path(str(path) + ".tmp")
    tmp.write_text("\n".join(lines) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def handle_request(req_path, backend, now=None, sleep_fn=None, attempts=ATTEMPTS):
    """Sirve una petición. Nunca deja el proceso en pausa."""
    req_path = Path(req_path)
    fixed_now = None if now is None else float(now)
    sleep_fn = sleep_fn or (lambda _s: None)

    def stamp():
        return int(time.time() if fixed_now is None else fixed_now)
    nonce = safe_nonce(req_path.name[:-4] if req_path.name.endswith(".req") else req_path.name)
    out_path = req_path.with_suffix(".out")
    busy = req_path.with_suffix(".req.busy")
    try:
        if req_path.exists():
            os.replace(req_path, busy)
        text = busy.read_text(encoding="utf-8", errors="replace") if busy.exists() else ""
    except OSError as exc:
        _write_out(out_path, ["ERR_NO_CAPTURE", "captured_at=%d" % stamp(), "detail=no se pudo leer la petición: %s" % exc])
        return {"ok": False, "error": "ERR_NO_CAPTURE", "nonce": nonce}

    display_token = parse_req(text)
    frame_options = parse_frame_options(text)
    displays = list(backend.displays() or [])
    from display_geometry import display_at
    target = display_at(displays, display_token)
    if target is None:
        _write_out(out_path, [
            "ERR_NO_SUCH_DISPLAY",
            "captured_at=%d" % stamp(),
            "display=%s" % display_token,
            "detail=índice fuera de la lista (%d pantallas)" % len(displays),
        ])
        _drop(busy)
        return {"ok": False, "error": "ERR_NO_SUCH_DISPLAY", "nonce": nonce, "display": display_token}

    last_detail = "SCREEN_CAPTURE_FAILED"
    for attempt in range(max(1, int(attempts))):
        optimized = False
        try:
            if frame_options is not None and hasattr(backend, "capture_frame"):
                rc, err, blob, optimized = backend.capture_frame(target, frame_options)
            else:
                rc, err, blob = backend.capture(target)
        except Exception as exc:  # el fallo de una petición no detiene el demonio
            rc, err, blob = 1, "RuntimeError: %s" % exc, b""
        err = str(err or "").strip().replace("\n", " ")
        b64 = _jpeg_b64(blob if rc == 0 else b"")
        if b64:
            taken = stamp()
            _write_out(out_path, [
                "OK",
                b64,
                "captured_at=%d" % taken,
                "display=%d" % target["indice"],
                "bytes=%d" % len(blob),
                "optimized=%d" % bool(optimized),
            ])
            _drop(busy)
            return {"ok": True, "nonce": nonce, "display": target["indice"], "captured_at": taken, "bytes": len(blob)}
        last_detail = "SCREEN_CAPTURE_FAILED rc=%s %s" % (rc, err or "could not create image from display")
        if attempt + 1 < attempts:
            sleep_fn(0.3)
    _write_out(out_path, [
        "ERR_CAPTURE_TRANSIENT",
        "captured_at=%d" % stamp(),
        "display=%d" % target["indice"],
        "detail=%s" % last_detail[:300],
    ])
    _drop(busy)
    return {"ok": False, "error": "ERR_CAPTURE_TRANSIENT", "nonce": nonce, "display": target["indice"], "detail": last_detail}


def _drop(path):
    try:
        Path(path).unlink()
    except OSError:
        pass


def service_once(root, backend, now=None, sleep_fn=None, attempts=ATTEMPTS, max_steps=32):
    root = Path(root)
    clear_pause_latch(root)
    (root / "capture-queue").mkdir(parents=True, exist_ok=True)
    version = root / "fleet-capture.version"
    if not version.exists():
        version.write_text("%d\n" % CAPTURE_VERSION, encoding="utf-8")
    done = []
    for _ in range(max_steps):
        claim_legacy(root)
        pending = sorted((root / "capture-queue").glob("*.req"))
        if not pending:
            break
        done.append(handle_request(pending[0], backend, now=now, sleep_fn=sleep_fn, attempts=attempts))
    return done


class ProductionBackend:
    """screencapture -D N, con N = índice de NSScreen + 1. Sin tocar TCC."""

    def displays(self):
        return displays_from_ordered(nsscreen_raw())

    def capture(self, display):
        return self._capture(display)[:3]

    def capture_frame(self, display, options):
        return self._capture(display, options)

    def _capture(self, display, options=None):
        import subprocess
        import tempfile
        number = int(display["screencapture_d"])
        fd, name = tempfile.mkstemp(prefix="fleet-cap-", suffix=".jpg")
        os.close(fd)
        try:
            proc = subprocess.run(
                ["/usr/sbin/screencapture", "-x", "-t", "jpg", "-D", str(number), name],
                capture_output=True, timeout=CAPTURE_TIMEOUT_S,
            )
            blob = b""
            try:
                blob = Path(name).read_bytes()
            except OSError:
                blob = b""
            err = (proc.stderr or b"").decode("utf-8", "replace")
            optimized = False
            dims = jpeg_dimensions(blob) if proc.returncode == 0 and options else None
            if dims:
                width, height = dims
                edge = frame_long_edge(width, height, options)
                try:
                    reduced = subprocess.run(
                        ["/usr/bin/sips", "-Z", str(edge), "-s", "formatOptions", str(options["quality"]), name],
                        capture_output=True, timeout=3,
                    )
                    candidate = Path(name).read_bytes()
                    if reduced.returncode == 0 and _jpeg_b64(candidate) and jpeg_dimensions(candidate):
                        blob, optimized = candidate, True
                except (OSError, subprocess.SubprocessError):
                    pass  # Fresh original travels to the hub for its fallback transform.
            return proc.returncode, err, blob, optimized
        except Exception as exc:
            return 1, "RuntimeError: %s" % exc, b"", False
        finally:
            try:
                os.unlink(name)
            except OSError:
                pass


def nsscreen_raw():
    """Orden de NSScreen. screens[0] es la principal = screencapture -D 1.

    El rectángulo se guarda en el espacio de CGEvent (origen arriba-izquierda
    de la principal, y hacia abajo) para que el mismo índice sirva al clic.
    """
    from AppKit import NSScreen
    screens = list(NSScreen.screens() or [])
    if not screens:
        raise RuntimeError("NSScreen no devolvió pantallas")
    primary_h = float(screens[0].frame().size.height)
    raw = []
    for s in screens:
        frame = s.frame()
        top = float(frame.origin.y) + float(frame.size.height)
        desc = s.deviceDescription() or {}
        raw.append({
            "id": int(desc.get("NSScreenNumber") or 0),
            "principal": s is screens[0],
            "x": int(frame.origin.x),
            "y": int(round(primary_h - top)),
            "w": int(frame.size.width),
            "h": int(frame.size.height),
        })
    return raw


def run_forever(root=None, backend=None, sleep_fn=None):
    root = Path(root or (Path.home() / ".fleet"))
    root.mkdir(parents=True, exist_ok=True)
    backend = backend or ProductionBackend()
    sleep_fn = sleep_fn or time.sleep
    (root / "fleet-capture.version").write_text("%d\n" % CAPTURE_VERSION, encoding="utf-8")
    while True:
        try:
            service_once(root, backend)
        except Exception as exc:
            sys.stderr.write("capture loop: %s\n" % exc)
        sleep_fn(0.03)


def capture_stdout(text, backend, **kwargs):
    """One live capture in the caller's existing SSH context, without launchd IPC.

    Use the same validated request/response contract and retry/error handling as
    the daemon. A private temporary queue cannot compete with other captures.
    This grants no OS permission; screencapture still uses the caller's TCC.
    """
    import tempfile
    with tempfile.TemporaryDirectory(prefix="fleet-direct-") as directory:
        request = Path(directory) / "frame.req"
        request.write_text(text, encoding="utf-8")
        result = handle_request(request, backend, **kwargs)
        return result["ok"], request.with_suffix(".out").read_text(encoding="utf-8")


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if "--version" in argv:
        print(CAPTURE_VERSION)
        return 0
    if argv and argv[0] == "--frame":
        try:
            if len(argv) != 2 or len(argv[1]) > 2048:
                raise ValueError("frame_request_invalid")
            text = base64.b64decode(argv[1], validate=True).decode("ascii")
            ok, output = capture_stdout(text, ProductionBackend())
        except (ValueError, UnicodeError):
            ok, output = False, "ERR_NO_CAPTURE\ndetail=frame_request_invalid\n"
        sys.stdout.write(output)
        return 0 if ok else 42
    if "--once" in argv:
        service_once(Path.home() / ".fleet", ProductionBackend())
        return 0
    run_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
