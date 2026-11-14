# Carlo Bonomi con la luz de la mesa (Carlos 23:39): más cálido, algo más oscuro y con sombra suave (como Mira).
import numpy as np, cv2, sys
from PIL import Image
im=np.array(Image.open(sys.argv[1]).convert('RGBA')).astype(np.float32); H,W=im.shape[:2]
rgb=im[...,:3]; a=im[...,3]
rgb=rgb*np.array([0.93,0.87,0.79])                     # luz cálida de la lámpara
ys=np.linspace(0,1,H)[:,None]; xs=np.linspace(0,1,W)[None,:]
luz=1.0-0.10*np.clip((ys-0.35)/0.65,0,1)-0.07*np.clip((xs-0.55)/0.45,0,1)+0.03*np.clip((0.45-xs)/0.45,0,1)
rgb=rgb*luz[...,None]
# oclusión suave en el contorno (como el sombreado de los consejeros dibujados)
m=(a>128).astype(np.float32); d=cv2.distanceTransform((m*255).astype(np.uint8),cv2.DIST_L2,5)
rgb=rgb*(1-0.12*np.clip(1-d/14,0,1))[...,None]
# un punto menos de luminancia en las altas luces (la camisa no «brilla»)
lum=rgb.mean(-1,keepdims=True); rgb=np.where(lum>185,185+(rgb-185)*0.6,rgb)
im[...,:3]=np.clip(rgb,0,255)
Image.fromarray(im.astype(np.uint8),'RGBA').save(sys.argv[2],quality=92,method=6)
