import cv2, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
art = Image.open('/workspace/demo-consejo-repo/assets/council-coetaneos.jpg').convert('RGB')
W, H = art.size
X0, Y0, X1, Y1 = 468, 534, 806, 630           # parche (px del arte 1280x720)
crop = np.array(art.crop((X0, Y0, X1, Y1)))
hsv = cv2.cvtColor(crop, cv2.COLOR_RGB2HSV)
h, s, v = hsv[..., 0].astype(int), hsv[..., 1].astype(int), hsv[..., 2].astype(int)
morado = ((h > 120) & (h < 165) & (s > 60)) | ((v > 170) & (s < 90))
banda = np.zeros_like(morado); banda[546 - Y0:620 - Y0, 484 - X0:796 - X0] = True
mask = (morado & banda).astype(np.uint8) * 255
mask = cv2.dilate(mask, np.ones((7, 7), np.uint8))
mask[~banda] = 0
limpio = cv2.inpaint(cv2.cvtColor(crop, cv2.COLOR_RGB2BGR), mask, 9, cv2.INPAINT_TELEA)
limpio = cv2.cvtColor(limpio, cv2.COLOR_BGR2RGB)
base = Image.fromarray(limpio)
S = 4  # superresolución para el texto
big = base.resize((base.width * S, base.height * S), Image.LANCZOS)
font = ImageFont.truetype('/usr/share/fonts/truetype/sand-box/google/Fredoka/Fredoka-VariableFont_wdth,wght.ttf', 10)
try: font.set_variation_by_name('Bold')
except Exception: pass
txt = 'PortAventuraNeXT'
target_w = (786 - 490) * S
size = 10
while True:
    f = ImageFont.truetype(font.path, size)
    f.set_variation_by_axes([700, 75])
    bb = f.getbbox(txt, stroke_width=4 * S)
    if bb[2] - bb[0] > target_w: break
    size += 2; font = f
bb = font.getbbox(txt, stroke_width=4 * S)
tw, th = bb[2] - bb[0], bb[3] - bb[1]
cx, cy = big.width // 2 + 6 * S, (583 - Y0) * S
pos = (cx - tw // 2 - bb[0], cy - th // 2 - bb[1])
def capa(fill, stroke, sw, blur=0, alpha=255):
    L = Image.new('RGBA', big.size, (0, 0, 0, 0)); d = ImageDraw.Draw(L)
    d.text(pos, txt, font=font, fill=fill, stroke_width=sw, stroke_fill=stroke)
    if blur: L = L.filter(ImageFilter.GaussianBlur(blur))
    if alpha < 255:
        a = L.split()[3].point(lambda p: p * alpha // 255); L.putalpha(a)
    return L
out = big.convert('RGBA')
out = Image.alpha_composite(out, capa((150, 70, 255, 255), (150, 70, 255, 255), 9 * S, blur=9 * S, alpha=230))   # halo
out = Image.alpha_composite(out, capa((190, 120, 255, 255), (190, 120, 255, 255), 6 * S, blur=3 * S, alpha=200))
out = Image.alpha_composite(out, capa((58, 16, 104, 255), (58, 16, 104, 255), 4 * S))                              # contorno oscuro
out = Image.alpha_composite(out, capa((235, 222, 255, 255), (168, 110, 240, 255), int(1.2 * S)))                     # relleno lila
out = Image.alpha_composite(out, capa((255, 255, 255, 255), None, 0, blur=int(0.6 * S)))                          # núcleo blanco
small = out.resize(base.size, Image.LANCZOS).convert('RGB')
# fundido de bordes con el arte original (para que no se vea el rectángulo)
m = Image.new('L', base.size, 0); dm = ImageDraw.Draw(m); dm.rectangle((10, 8, base.width - 11, base.height - 9), fill=255)
m = m.filter(ImageFilter.GaussianBlur(5))
parche = Image.composite(small, Image.fromarray(crop), m)
parche.save('logo-portaventuranext.png'); parche.save('logo-portaventuranext.webp', quality=92)
full = art.copy(); full.paste(parche, (X0, Y0)); full.save('coetaneos-con-logo.png')
full.crop((380, 470, 900, 680)).resize((1040, 420), Image.NEAREST).save('zoom.png')
print('font', size, 'pos %', round(X0 / W * 100, 4), round(Y0 / H * 100, 4), round((X1 - X0) / W * 100, 4), round((Y1 - Y0) / H * 100, 4))
