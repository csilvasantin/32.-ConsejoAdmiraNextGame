#!/usr/bin/env python3
"""Reubica el cartel de Jensen al sitio de Mira, añade uno nuevo a Mira y quita los cargos."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SRC = Path(__file__).resolve().parents[1] / "assets" / "council-coetaneos.jpg"
FONT = "/usr/share/fonts/truetype/sand-box/google/Pixelify Sans/PixelifySans-VariableFont_wght.ttf"

# Cajas exactas del oro de cada placa (detección por color sobre el original).
PLATES = {
    "ive":      dict(box=(746, 452, 843, 481), name="JONY IVE"),
    "mira_old": dict(box=(384, 478, 502, 529), name="JENSEN HUANG"),
    "lasseter": dict(box=(858, 543, 989, 581), name="JOHN LASSETER"),
    "jensen":   dict(box=(295, 551, 427, 598), name=None),
    "reynolds": dict(box=(938, 622, 1085, 665), name="RYAN REYNOLDS"),
    "elon":     dict(box=(209, 623, 355, 665), name="ELON MUSK"),
}

# Delante de Mira, a la derecha de su placa actual (que pasa a Jensen),
# en el hueco de madera y sin cubrir el logo.
MIRA_NEW_XY = (528, 486)  # esquina; el tamaño es el de la placa original de Mira


def inner_gold(plate):
    """Color del campo interior (oro apagado), muestreado junto al bisel."""
    w, h = plate.size
    px = plate.load()
    samples = []
    # franja interior, pegada al bisel, donde no suele haber texto
    for y in list(range(7, 12)) + list(range(h - 12, h - 7)):
        for x in range(12, w - 12):
            r, g, b = px[x, y][:3]
            if r > 120 and r > g and g > b + 10:
                samples.append((r, g, b))
    if not samples:
        return (176, 122, 42)
    samples.sort()
    mid = samples[len(samples) // 2]
    return mid


def clear_and_write(plate, name):
    """Conserva el bisel; limpia el campo interior y escribe solo el nombre."""
    w, h = plate.size
    gold = inner_gold(plate)
    d = ImageDraw.Draw(plate)
    # inset del bisel: ~7-8 px en placas grandes, ~5-6 en la de Ive
    inset = 6 if min(w, h) < 40 else 8
    d.rounded_rectangle((inset, inset - 1, w - inset - 1, h - inset), radius=3, fill=gold)
    max_w, max_h = w - inset * 2 - 4, h - inset * 2 - 2
    font = None
    tw = th = 0
    for size in range(min(22, max_h), 8, -1):
        f = ImageFont.truetype(FONT, size=size)
        bb = d.textbbox((0, 0), name, font=f)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        if tw <= max_w and th <= max_h:
            font = f
            break
    if font is None:
        font = ImageFont.truetype(FONT, size=9)
        bb = d.textbbox((0, 0), name, font=font)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
    x = (w - tw) // 2
    y = (h - th) // 2 - 1
    d.text((x + 1, y + 1), name, font=font, fill=(48, 26, 10))
    d.text((x, y), name, font=font, fill=(255, 236, 196))
    return plate


def cover_with_wood(im, box, src_box):
    """Cubre box (con margen de sombra) clonando madera de src_box y fundiendo el borde."""
    x0, y0, x1, y1 = box
    margin = 8
    tx0, ty0 = max(0, x0 - margin), max(0, y0 - margin)
    tx1, ty1 = min(im.size[0], x1 + margin), min(im.size[1], y1 + margin)
    tw, th = tx1 - tx0, ty1 - ty0
    sx0, sy0, sx1, sy1 = src_box
    src = im.crop((sx0, sy0, sx1, sy1))
    # repetir si hace falta
    tile = Image.new("RGB", (tw, th))
    yy = 0
    while yy < th:
        xx = 0
        while xx < tw:
            tile.paste(src, (xx, yy))
            xx += src.size[0]
        yy += src.size[1]
    mask = Image.new("L", (tw, th), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle((1, 1, tw - 2, th - 2), radius=8, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(2.4))
    im.paste(tile, (tx0, ty0), mask)
    return im


def main():
    im = Image.open(SRC).convert("RGB")

    # Madera limpia a la derecha de la placa de Jensen (entre ella y el logo, misma altura).
    jx0, jy0, jx1, jy1 = PLATES["jensen"]["box"]
    cover_with_wood(im, (jx0, jy0, jx1, jy1), (430, 560, 515, 615))

    # Reescribir placas que se quedan (mira_old → JENSEN HUANG).
    for key, info in PLATES.items():
        if info["name"] is None:
            continue
        x0, y0, x1, y1 = info["box"]
        plate = im.crop((x0, y0, x1 + 1, y1 + 1)).copy()
        plate = clear_and_write(plate, info["name"])
        im.paste(plate, (x0, y0))

    # Nueva placa de Mira: copia de su placa original (ya reescrita no, usamos plantilla
    # de Lasseter/Mira_old reescrita como base de bisel). Mejor: recortar mira_old del
    # original. Como ya la hemos reescrito, usamos la de Jensen-ahora (mira_old) como plantilla.
    mx0, my0, mx1, my1 = PLATES["mira_old"]["box"]
    tmpl = im.crop((mx0, my0, mx1 + 1, my1 + 1)).copy()
    mira = clear_and_write(tmpl, "MIRA MURATI")
    nx, ny = MIRA_NEW_XY
    # sombra
    sh = Image.new("RGBA", (mira.size[0] + 10, mira.size[1] + 10), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((3, 4, mira.size[0] + 4, mira.size[1] + 5), radius=6, fill=(0, 0, 0, 80))
    sh = sh.filter(ImageFilter.GaussianBlur(2.2))
    base = im.convert("RGBA")
    base.alpha_composite(sh, (nx - 3, ny - 2))
    base.paste(mira.convert("RGBA"), (nx, ny))
    im = base.convert("RGB")

    im.save(SRC, "JPEG", quality=94, subsampling=0, optimize=True)
    im.crop((180, 430, 1120, 700)).save("/tmp/coet-plates-after.png", "PNG")
    w, h = im.size
    print("MIRA_NEW box", nx, ny, nx + mira.size[0], ny + mira.size[1])
    print("MIRA_NEW %",
          round(nx / w * 100, 3), round(ny / h * 100, 3),
          round((nx + mira.size[0]) / w * 100, 3), round((ny + mira.size[1]) / h * 100, 3))
    print("saved", SRC)


if __name__ == "__main__":
    main()
