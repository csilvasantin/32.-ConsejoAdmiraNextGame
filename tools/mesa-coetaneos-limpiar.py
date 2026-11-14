# Mesa de Coetáneos (Carlos 21:50): limpia la madera a izquierda y derecha con recortes regenerados (GenerateImage),
# alineados por ECC (homografía), color igualado y fundidos solo en la madera: personas (recortes de consejo-vacio) y neón quedan del arte r194.
import cv2, numpy as np, json
from PIL import Image
art=cv2.imread('r194-main.jpg').astype(np.float32); H,W=art.shape[:2]
# caras: se quedan del arte r194 (parecido exacto); cuerpos, sillas, placas y madera salen del recorte regenerado (alineado)
gente=np.zeros((H,W),np.uint8)
for (cx,cy,rx,ry) in [(160,380,62,70),(326,383,52,58),(990,377,58,60),(1146,396,56,62)]:
    cv2.ellipse(gente,(cx,cy),(rx,ry),0,0,360,1,-1)
gente=gente.astype(np.float32)
logo=np.zeros((H,W),np.float32); logo[528:636,462:812]=1
proteger=np.maximum(gente,logo); proteger=cv2.GaussianBlur(proteger,(0,0),2.5)
out=art.copy()
for n,(X0,Y0,X1,Y1) in {'izq':(0,405,560,720),'der':(720,405,1280,720)}.items():
    al=cv2.resize(cv2.imread('al-%s.png'%n),(X1-X0,Y1-Y0),interpolation=cv2.INTER_AREA).astype(np.float32)
    o=art[Y0:Y1,X0:X1]; p=proteger[Y0:Y1,X0:X1]
    ref=p<0.1
    for c in range(3):
        a,b=al[...,c][ref],o[...,c][ref]; al[...,c]=(al[...,c]-a.mean())*(b.std()/a.std())+b.mean()
    h,w=Y1-Y0,X1-X0; F=16; e=np.ones((h,w),np.float32)
    rx=np.clip(np.arange(w)/F,0,1)
    if X0>0: e*=rx[None,:]
    if X1<W: e*=rx[::-1][None,:]
    e*=np.clip(np.arange(h)/F,0,1)[:,None]
    m=(1-p)*e
    out[Y0:Y1,X0:X1]=out[Y0:Y1,X0:X1]*(1-m[...,None])+np.clip(al,0,255)*m[...,None]
cv2.imwrite('comp3-main.png',out.astype(np.uint8))
