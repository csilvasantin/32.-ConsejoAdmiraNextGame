"""Geometría de pantallas compartida por la captura y el ratón.

El índice 0 es la pantalla principal y `screencapture -D 1`. El orden lo
marca quien enumera (en macOS, NSScreen.screens: el 0 es la del menú).
No se reordena aquí: reordenar por coordenada desincroniza el `-D` del
clic y el fotograma deja de ser la pantalla que se está tocando.

Las coordenadas de entrada van NORMALIZADAS (0..1) dentro de ESA pantalla.
Un índice que no existe no se convierte en la principal.
"""


def displays_from_ordered(raw):
    out = []
    for i, src in enumerate(raw or []):
        d = dict(src)
        w = int(d.get("w") or 0)
        h = int(d.get("h") or 0)
        d["indice"] = i
        d["screencapture_d"] = i + 1
        d["principal"] = True if i == 0 else bool(d.get("principal"))
        d["x"] = int(d.get("x") or 0)
        d["y"] = int(d.get("y") or 0)
        d["w"] = w
        d["h"] = h
        nombre = "Principal" if d["principal"] else "Pantalla %d" % (i + 1)
        d["nombre"] = "%s · %dx%d" % (nombre, w, h)
        out.append(d)
    return out


def display_at(displays, index):
    try:
        idx = int(index)
    except (TypeError, ValueError):
        return None
    if isinstance(index, bool) or idx < 0 or idx >= len(displays or []):
        return None
    # int("2.5") is 2 in Python, but a float index is not a panel index.
    if isinstance(index, float) and not index.is_integer():
        return None
    if isinstance(index, str) and not str(index).strip().isdigit():
        return None
    return displays[idx]


def map_point(displays, index, nx, ny):
    """Punto en el sistema de la lista (origen arriba-izquierda, y hacia abajo).

    El recorte a 0..1 se queda DENTRO de la pantalla pedida. No salta a otra.
    """
    d = display_at(displays, index)
    if d is None:
        return {
            "ok": False,
            "error": "ERR_NO_SUCH_DISPLAY",
            "detalle": "pantalla %s no está en la lista (%d)" % (index, len(displays or [])),
        }
    try:
        x = float(nx)
        y = float(ny)
    except (TypeError, ValueError):
        return {"ok": False, "error": "ERR_BAD_COORDS", "detalle": "x/y no numéricos"}
    if x != x or y != y:
        return {"ok": False, "error": "ERR_BAD_COORDS", "detalle": "x/y no numéricos"}
    x = min(1.0, max(0.0, x))
    y = min(1.0, max(0.0, y))
    max_x = max(0, int(d["w"]) - 1)
    max_y = max(0, int(d["h"]) - 1)
    return {
        "ok": True,
        "display": d["indice"],
        "screencapture_d": d["screencapture_d"],
        "x": int(d["x"] + x * max_x),
        "y": int(d["y"] + y * max_y),
    }
