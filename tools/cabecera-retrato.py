#!/usr/bin/env python3
"""Retrato pixel-art para la cabecera de la mesa de Coetáneos (Lucas, 14-nov-2026).

Uso:
  python3 tools/cabecera-retrato.py FOTO SALIDA.webp [--recorte x,y,w,h]
  python3 tools/cabecera-retrato.py --provisional SALIDA.webp   # silueta sin foto

Dibuja el respaldo de la silla de cabecera con un marco dorado y, dentro, la foto
recortada (cabeza y hombros) en baja resolución y ampliada sin suavizar, como el
resto del arte de la mesa. Sin --recorte toma el tercio superior centrado.
"""
import sys
from PIL import Image, ImageDraw, ImageOps

W, H = 74, 99          # lienzo base (se amplía ×2 → 148×198, el hueco de la cabecera)
ESCALA = 2
MARCO = (14, 12, 60, 64)   # caja interior del retrato (x, y, w, h) en el lienzo base


def plantilla():
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Respaldo de la silla de cabecera (cuero oscuro, como las sillas del arte)
    d.rounded_rectangle((4, 2, W - 5, H - 8), radius=10, fill=(52, 26, 22, 255), outline=(20, 8, 6, 255), width=2)
    d.rounded_rectangle((8, 6, W - 9, H - 14), radius=8, outline=(86, 44, 34, 255), width=1)
    # Pie de la silla
    d.rectangle((W // 2 - 4, H - 9, W // 2 + 3, H - 3), fill=(30, 14, 10, 255))
    # Marco dorado
    x, y, w, h = MARCO
    d.rectangle((x - 4, y - 4, x + w + 3, y + h + 3), fill=(201, 162, 39, 255))
    d.rectangle((x - 2, y - 2, x + w + 1, y + h + 1), fill=(120, 86, 20, 255))
    d.rectangle((x - 3, y - 3, x + w + 2, y - 3), fill=(255, 215, 94, 255))
    return im


def silueta():
    """Retrato provisional: hombre con gafas, traje oscuro y corbata azul (sin cara inventada)."""
    _, _, w, h = MARCO
    im = Image.new("RGBA", (w, h), (34, 40, 58, 255))
    d = ImageDraw.Draw(im)
    for i in range(h):  # degradado de fondo
        d.line((0, i, w, i), fill=(34 + i // 6, 40 + i // 6, 58 + i // 5, 255))
    cx = w // 2
    d.ellipse((cx - 13, 9, cx + 13, 39), fill=(222, 178, 146, 255))      # cabeza
    d.pieslice((cx - 14, 6, cx + 14, 30), 180, 360, fill=(58, 50, 46, 255))  # pelo
    d.rectangle((cx - 11, 23, cx - 2, 28), outline=(20, 20, 24, 255))    # gafas
    d.rectangle((cx + 2, 23, cx + 11, 28), outline=(20, 20, 24, 255))
    d.line((cx - 2, 25, cx + 2, 25), fill=(20, 20, 24, 255))
    d.polygon([(cx - 26, h), (cx - 22, 46), (cx - 8, 41), (cx + 8, 41), (cx + 22, 46), (cx + 26, h)], fill=(28, 30, 40, 255))  # traje
    d.polygon([(cx - 7, 41), (cx + 7, 41), (cx, 58)], fill=(236, 236, 240, 255))  # camisa
    d.polygon([(cx - 2, 43), (cx + 2, 43), (cx + 3, 57), (cx, 61), (cx - 3, 57)], fill=(44, 92, 196, 255))  # corbata azul
    return im


def recorte_foto(ruta, caja=None):
    foto = ImageOps.exif_transpose(Image.open(ruta)).convert("RGBA")
    fw, fh = foto.size
    _, _, w, h = MARCO
    if caja:
        x, y, cw, ch = caja
    else:  # tercio superior centrado con la proporción del marco
        cw = int(fw * 0.62)
        ch = int(cw * h / w)
        x = (fw - cw) // 2
        y = max(0, int(fh * 0.04))
        if y + ch > fh:
            ch = fh - y
            cw = int(ch * w / h)
            x = (fw - cw) // 2
    trozo = foto.crop((x, y, x + cw, y + ch)).resize((w, h), Image.LANCZOS)
    rgb = trozo.convert("RGB").quantize(colors=48, method=Image.MEDIANCUT).convert("RGBA")
    return rgb


def componer(retrato, salida):
    base = plantilla()
    x, y, _, _ = MARCO
    base.alpha_composite(retrato, (x, y))
    base = base.resize((W * ESCALA, H * ESCALA), Image.NEAREST)
    base.save(salida, "WEBP", lossless=True)
    print("ok", salida, base.size)


def main(argv):
    if len(argv) >= 3 and argv[1] == "--provisional":
        componer(silueta(), argv[2]); return 0
    if len(argv) < 3:
        print(__doc__); return 2
    caja = None
    if "--recorte" in argv:
        caja = tuple(int(v) for v in argv[argv.index("--recorte") + 1].split(","))
    componer(recorte_foto(argv[1], caja), argv[2]); return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
