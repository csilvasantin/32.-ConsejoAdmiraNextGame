#!/usr/bin/env python3
"""Ratón y teclado en un Mac de la flota.

Mismo contrato que fleet-input-linux.py: JSON por argumento o stdin
(type move|down|up|scroll|text|key, x/y 0..1, display índice) y
{"ok":true} o {"ok":false,"error":...}. `--displays` lista las pantallas
en el MISMO orden que la captura (NSScreen, principal = índice 0 = -D 1).

No toca la base TCC. Si Accesibilidad no está concedida a este python3,
la respuesta es ERR_NO_ACCESSIBILITY y no se publica ningún evento.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from display_geometry import displays_from_ordered, map_point  # noqa: E402

MOD_FLAGS = {"cmd": 1 << 20, "shift": 1 << 17, "alt": 1 << 19, "ctrl": 1 << 18}


def _load_displays_default():
    # Import perezoso del compañero de captura para no exigir AppKit en --help.
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from importlib.machinery import SourceFileLoader
    cap = SourceFileLoader(
        "fleet_capture_agent",
        str(Path(__file__).resolve().parent / "fleet-capture.py"),
    ).load_module()
    return displays_from_ordered(cap.nsscreen_raw())


def plan(action, displays):
    kind = str((action or {}).get("type") or "")
    if kind in ("move", "down", "up"):
        mapped = map_point(displays, action.get("display") if action.get("display") is not None else 0, action.get("x") or 0, action.get("y") or 0)
        if not mapped.get("ok"):
            return mapped
        button = "right" if str(action.get("button") or "left") == "right" else "left"
        try:
            clicks = int(action.get("clicks") or 1)
        except (TypeError, ValueError):
            clicks = 1
        clicks = min(4, max(1, clicks))
        mapped.update({"type": kind, "button": button, "clicks": clicks})
        return mapped
    if kind == "scroll":
        mapped = map_point(displays, action.get("display") if action.get("display") is not None else 0, action.get("x") or 0, action.get("y") or 0)
        if not mapped.get("ok"):
            return mapped
        try:
            dy = int(action.get("dy") or 0)
        except (TypeError, ValueError):
            dy = 0
        mapped.update({"type": "scroll", "dy": max(-2000, min(2000, dy))})
        return mapped
    if kind == "text":
        return {"ok": True, "type": "text", "text": str(action.get("text") or "")[:4000]}
    if kind == "key":
        try:
            code = int(action.get("code"))
        except (TypeError, ValueError):
            return {"ok": False, "error": "ERR_BAD_KEY", "detalle": "keycode no numérico"}
        if code < 0 or code > 255:
            return {"ok": False, "error": "ERR_BAD_KEY", "detalle": "keycode fuera de rango"}
        mods = [str(m).lower() for m in (action.get("mods") or []) if str(m).lower() in MOD_FLAGS]
        return {"ok": True, "type": "key", "code": code, "mods": mods}
    return {"ok": False, "error": "ERR_BAD_TYPE", "detalle": "tipo desconocido: " + kind}


def quartz_poster(event):
    """Publica el evento ya mapeado. Falla si Accesibilidad no está concedida."""
    import Quartz
    trusted = Quartz.AXIsProcessTrusted()
    if not trusted:
        raise PermissionError("ERR_NO_ACCESSIBILITY")
    kind = event.get("type")
    if kind == "text":
        # Un evento de teclado con la cadena Unicode, sin sintetizar keycodes.
        ev = Quartz.CGEventCreateKeyboardEvent(None, 0, True)
        Quartz.CGEventKeyboardSetUnicodeString(ev, len(event.get("text") or ""), event.get("text") or "")
        Quartz.CGEventPost(Quartz.kCGHIDEventTap, ev)
        return
    if kind == "key":
        flags = 0
        for name in event.get("mods") or []:
            flags |= MOD_FLAGS[name]
        down = Quartz.CGEventCreateKeyboardEvent(None, int(event["code"]), True)
        up = Quartz.CGEventCreateKeyboardEvent(None, int(event["code"]), False)
        if flags:
            Quartz.CGEventSetFlags(down, flags)
            Quartz.CGEventSetFlags(up, flags)
        Quartz.CGEventPost(Quartz.kCGHIDEventTap, down)
        Quartz.CGEventPost(Quartz.kCGHIDEventTap, up)
        return
    point = (event["x"], event["y"])
    button = Quartz.kCGMouseButtonRight if event.get("button") == "right" else Quartz.kCGMouseButtonLeft
    if kind == "move":
        ev = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventMouseMoved, point, button)
        Quartz.CGEventPost(Quartz.kCGHIDEventTap, ev)
        return
    if kind == "scroll":
        ev = Quartz.CGEventCreateScrollWheelEvent(None, Quartz.kCGScrollEventUnitLine, 1, int(event.get("dy") or 0))
        Quartz.CGEventPost(Quartz.kCGHIDEventTap, ev)
        return
    down_type = Quartz.kCGEventRightMouseDown if event.get("button") == "right" else Quartz.kCGEventLeftMouseDown
    up_type = Quartz.kCGEventRightMouseUp if event.get("button") == "right" else Quartz.kCGEventLeftMouseUp
    if kind == "down":
        ev = Quartz.CGEventCreateMouseEvent(None, down_type, point, button)
        if int(event.get("clicks") or 1) > 1:
            Quartz.CGEventSetIntegerValueField(ev, Quartz.kCGMouseEventClickState, int(event["clicks"]))
        Quartz.CGEventPost(Quartz.kCGHIDEventTap, ev)
        return
    if kind == "up":
        ev = Quartz.CGEventCreateMouseEvent(None, up_type, point, button)
        Quartz.CGEventPost(Quartz.kCGHIDEventTap, ev)
        return
    raise RuntimeError("evento no publicable: " + str(kind))


def ejecutar(action, displays, poster):
    mapped = plan(action, displays)
    if not mapped.get("ok"):
        return mapped
    try:
        poster(mapped)
    except PermissionError:
        return {"ok": False, "error": "ERR_NO_ACCESSIBILITY", "detalle": "Concede Accesibilidad a /usr/bin/python3. Este agente no modifica TCC."}
    except Exception as exc:
        return {"ok": False, "error": "ERR_INPUT_FAILED", "detalle": str(exc)[:200]}
    public = {k: mapped[k] for k in ("ok", "type", "x", "y", "display", "button", "clicks", "text", "code") if k in mapped}
    public["ok"] = True
    return public


def main(argv=None, displays_fn=None, poster=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    displays_fn = displays_fn or _load_displays_default
    poster = poster or quartz_poster
    if "--displays" in argv:
        try:
            ds = displays_fn()
        except Exception as exc:
            print(json.dumps({"ok": False, "error": "ERR_NO_DISPLAYS", "detalle": str(exc)[:200]}))
            return 1
        print(json.dumps({"ok": True, "displays": ds}))
        return 0
    raw = next((x for x in argv if x.startswith("{")), None)
    if raw is None:
        raw = sys.stdin.read()
    try:
        action = json.loads(raw or "{}")
    except Exception as exc:
        print(json.dumps({"ok": False, "error": "json inválido: %s" % exc}))
        return 1
    try:
        ds = displays_fn()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": "ERR_NO_DISPLAYS", "detalle": str(exc)[:200]}))
        return 1
    result = ejecutar(action, ds, poster)
    print(json.dumps(result))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
