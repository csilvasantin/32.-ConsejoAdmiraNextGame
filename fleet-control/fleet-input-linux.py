#!/usr/bin/env python3
"""Ejecutor de RATÓN y TECLADO en una caja Linux de la flota (misión 0052, 4-sep-2026).

Mismo CONTRATO que fleet-input.py (macOS): recibe una acción JSON por argumento o stdin
—type move|down|up|scroll|text|key, x/y NORMALIZADAS (0..1) de la pantalla `display`,
button, clicks, text, code (keycode macOS), mods— y responde {"ok":true,...} o
{"ok":false,"error":...}. `--displays` devuelve las pantallas.

Herramientas, por orden: xdotool (X11) → ydotool (Wayland, necesita ydotoold). Las
pantallas salen de xrandr (X11) o de wlr-randr/swaymsg (Wayland); sin ninguna, una
sola pantalla con el tamaño de xdpyinfo o 1920x1080.

El panel manda keycodes de macOS (kVK): aquí se traducen a keysyms X11 (tabla KVK).
Para texto se usa `type` (Unicode), que no depende de la distribución de teclado.
"""
import json, os, re, shutil, subprocess, sys

KVK = {0:"a",1:"s",2:"d",3:"f",4:"h",5:"g",6:"z",7:"x",8:"c",9:"v",11:"b",12:"q",13:"w",14:"e",
       15:"r",16:"y",17:"t",18:"1",19:"2",20:"3",21:"4",22:"6",23:"5",24:"equal",25:"9",26:"7",
       27:"minus",28:"8",29:"0",30:"bracketright",31:"o",32:"u",33:"bracketleft",34:"i",35:"p",
       36:"Return",37:"l",38:"j",39:"apostrophe",40:"k",41:"semicolon",42:"backslash",43:"comma",
       44:"slash",45:"n",46:"m",47:"period",48:"Tab",49:"space",50:"grave",51:"BackSpace",53:"Escape",
       96:"F5",97:"F6",98:"F7",99:"F3",100:"F8",101:"F9",103:"F11",109:"F10",111:"F12",118:"F4",
       120:"F2",122:"F1",115:"Home",116:"Prior",117:"Delete",119:"End",121:"Next",
       123:"Left",124:"Right",125:"Down",126:"Up"}
MODS = {"cmd":"super","shift":"shift","alt":"alt","ctrl":"ctrl"}

def env():
    e = dict(os.environ)
    e.setdefault("DISPLAY", ":0")
    e.setdefault("XDG_RUNTIME_DIR", "/run/user/%d" % os.getuid())
    return e

def run(cmd, timeout=6):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env())

def wayland():
    return bool(os.environ.get("WAYLAND_DISPLAY")) or (not shutil.which("xdotool") and bool(shutil.which("ydotool")))

def displays():
    out = []
    if shutil.which("xrandr") and not wayland():
        try:
            for line in run(["xrandr", "--query"]).stdout.splitlines():
                m = re.search(r"^(\S+) connected( primary)? (\d+)x(\d+)\+(\d+)\+(\d+)", line)
                if m:
                    out.append({"id": m.group(1), "principal": bool(m.group(2)), "w": int(m.group(3)),
                                "h": int(m.group(4)), "x": int(m.group(5)), "y": int(m.group(6))})
        except Exception:
            pass
    if not out and shutil.which("swaymsg"):
        try:
            for o in json.loads(run(["swaymsg", "-t", "get_outputs"]).stdout):
                if o.get("active"):
                    r = o.get("rect", {})
                    out.append({"id": o.get("name"), "principal": bool(o.get("focused")), "w": r.get("width", 0),
                                "h": r.get("height", 0), "x": r.get("x", 0), "y": r.get("y", 0)})
        except Exception:
            pass
    if not out:
        w, h = 1920, 1080
        if shutil.which("xdpyinfo"):
            m = re.search(r"dimensions:\s+(\d+)x(\d+)", run(["xdpyinfo"]).stdout)
            if m: w, h = int(m.group(1)), int(m.group(2))
        out.append({"id": "default", "principal": True, "w": w, "h": h, "x": 0, "y": 0})
    for i, p in enumerate(out):
        p["indice"] = i
        p["nombre"] = ("Principal" if p["principal"] else "Pantalla %d" % (i + 1)) + " · %dx%d" % (p["w"], p["h"])
    return out

def punto(a, ds):
    idx = int(a.get("display") or 0)
    p = ds[idx] if 0 <= idx < len(ds) else ds[0]
    nx = min(1.0, max(0.0, float(a.get("x") or 0))); ny = min(1.0, max(0.0, float(a.get("y") or 0)))
    return int(p["x"] + nx * p["w"]), int(p["y"] + ny * p["h"])

def ejecutar(a):
    ds = displays(); t = str(a.get("type") or ""); wl = wayland()
    tool = "ydotool" if wl else "xdotool"
    if not shutil.which(tool):
        return {"ok": False, "error": "ERR_NO_INPUT_TOOL", "detalle": "instala %s (%s)" % (tool, "Wayland" if wl else "X11")}
    if t == "move":
        x, y = punto(a, ds)
        run([tool, "mousemove", str(x), str(y)] if not wl else ["ydotool", "mousemove", "--absolute", "-x", str(x), "-y", str(y)])
        return {"ok": True, "x": x, "y": y}
    if t in ("down", "up"):
        x, y = punto(a, ds); btn = 3 if str(a.get("button") or "left") == "right" else 1
        clicks = int(a.get("clicks") or 1)
        if not wl:
            run(["xdotool", "mousemove", str(x), str(y)])
            if t == "down" and clicks > 1:
                run(["xdotool", "click", "--repeat", str(clicks), "--delay", "80", str(btn)])
                return {"ok": True, "x": x, "y": y, "clicks": clicks, "nota": "clic múltiple emitido en down"}
            run(["xdotool", "mousedown" if t == "down" else "mouseup", str(btn)])
        else:
            run(["ydotool", "mousemove", "--absolute", "-x", str(x), "-y", str(y)])
            code = 0x40 if btn == 1 else 0x41   # ydotool: 0x40 izq, 0x41 der (+0x80 = down? usa click para simplicidad)
            if t == "down":
                run(["ydotool", "click", "--repeat", str(clicks), hex(0xC0 if btn == 1 else 0xC1)])
                return {"ok": True, "x": x, "y": y, "clicks": clicks, "nota": "clic completo emitido en down (ydotool)"}
        return {"ok": True, "x": x, "y": y, "clicks": clicks}
    if t == "scroll":
        dy = int(a.get("dy") or 0)
        if not wl:
            btn = "5" if dy > 0 else "4"
            run(["xdotool", "click", "--repeat", str(min(20, max(1, abs(dy) // 40 or 1))), btn])
        else:
            run(["ydotool", "mousemove", "-w", "-x", "0", "-y", str(-1 if dy > 0 else 1)])
        return {"ok": True}
    if t == "text":
        txt = str(a.get("text") or "")
        run([tool, "type", "--delay", "6", txt] if not wl else ["ydotool", "type", "--key-delay", "6", txt], timeout=30)
        return {"ok": True, "n": len(txt)}
    if t == "key":
        code = int(a.get("code")); key = KVK.get(code)
        if not key: return {"ok": False, "error": "keycode macOS sin traducción: %d" % code}
        mods = [MODS.get(str(m).lower()) for m in (a.get("mods") or []) if MODS.get(str(m).lower())]
        combo = "+".join(mods + [key])
        if not wl: run(["xdotool", "key", combo])
        else: run(["ydotool", "key", combo])
        return {"ok": True, "code": code, "key": combo}
    return {"ok": False, "error": "tipo desconocido: " + t}

def main():
    if "--displays" in sys.argv:
        print(json.dumps({"ok": True, "displays": displays()})); return 0
    crudo = next((x for x in sys.argv[1:] if x.startswith("{")), None) or sys.stdin.read()
    try: a = json.loads(crudo)
    except Exception as e:
        print(json.dumps({"ok": False, "error": "json inválido: %s" % e})); return 1
    try: print(json.dumps(ejecutar(a))); return 0
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)})); return 1

if __name__ == "__main__":
    sys.exit(main())
