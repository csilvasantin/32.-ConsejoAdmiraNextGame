#!/usr/bin/env python3
"""Recorta un consejero dibujado sobre fondo magenta plano (croma) para sentarlo en la mesa.
Uso: python3 tools/cabecera-croma.py DIBUJO.jpg SALIDA.webp [escala=0.3]
Fondo = parecido al magenta y conectado con los bordes (los labios no se pierden) + bolsas
grandes de magenta puro; fuera la mesa marrón del dibujo (se apoya en la del arte); borde de
1 px suavizado y despill del magenta. Lucas, 14-11-2026."""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage
im = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.float32)
H, W, _ = im.shape
R, G, B = im[..., 0], im[..., 1], im[..., 2]
border = np.concatenate([im[:20].reshape(-1,3), im[:, :20].reshape(-1,3), im[:, -20:].reshape(-1,3)])
key = np.median(border, axis=0)
d = np.sqrt(((im - key) ** 2).sum(-1))
def tocan(mask, lados):
    lab, n = ndimage.label(mask)
    ids = set()
    if 'top' in lados: ids |= set(np.unique(lab[0]))
    if 'left' in lados: ids |= set(np.unique(lab[:, 0]))
    if 'right' in lados: ids |= set(np.unique(lab[:, -1]))
    if 'bottom' in lados: ids |= set(np.unique(lab[-1]))
    ids.discard(0)
    return np.isin(lab, list(ids))
# fondo: parecido al magenta y conectado con los bordes (los labios no tocan el borde)
casi = (d < 110) | (((R - G) > 110) & ((B - G) > 50))
fondo = tocan(casi, ['top', 'left', 'right', 'bottom'])
# bolsas de fondo encerradas (entre brazo y cuerpo): magenta puro y grandes; los labios son pequeños
puro = (d < 60)
lab0, n0 = ndimage.label(puro & ~fondo)
if n0:
    sz = ndimage.sum(np.ones((H, W)), lab0, range(1, n0 + 1))
    fondo |= np.isin(lab0, [i + 1 for i, s_ in enumerate(sz) if s_ > 400])
    fondo = ndimage.binary_dilation(fondo, iterations=1) & (casi | fondo)
# mesa marrón oscura conectada con el borde de abajo
mesa = (R < 140) & (G < 80) & (B < 50) & (R > G) & (G > B - 8) & (np.arange(H)[:, None] > 880)
mesa = tocan(mesa, ['bottom', 'left'])
mesa = ndimage.binary_opening(mesa, iterations=1) | (mesa & (np.arange(H)[:, None] > 990))
fuera = fondo | mesa
dentro = ~fuera
dentro = ndimage.binary_opening(dentro, iterations=1)
lab, n = ndimage.label(dentro)
sizes = ndimage.sum(np.ones((H, W)), lab, range(1, n + 1))
dentro = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 2000])
# borde: 1 px a 0.6 y despill del magenta en 3 px
er = ndimage.binary_erosion(dentro, iterations=1)
borde = dentro & ~er
a = np.where(dentro, 1.0, 0.0); a[borde] = 0.6
cerca = dentro & ~ndimage.binary_erosion(dentro, iterations=3)
sp = np.clip(np.minimum(R - G, B - G) - 15, 0, None)
rgb = im.copy()
rgb[..., 0] = np.where(cerca, R - sp * 0.8, R)
rgb[..., 2] = np.where(cerca, B - sp * 0.8, B)
out = np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.uint8)
img = Image.fromarray(out, 'RGBA')
bbox = img.getbbox(); print('bbox', bbox)
rec = img.crop(bbox); esc = float(sys.argv[3]) if len(sys.argv) > 3 else 0.3
rec.resize((round(rec.width * esc), round(rec.height * esc)), Image.LANCZOS).save(sys.argv[2], 'WEBP', lossless=True)
