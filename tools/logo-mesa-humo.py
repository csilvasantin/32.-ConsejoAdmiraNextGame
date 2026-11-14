# Quita la mancha lila sobre «Port» (arte r192) tomando la madera de la placa de sillas vacías (misma escena, alineada). Uso: python3 tools/logo-mesa-humo.py (sobre el arte ya con el neón), luego guardar main-fixed con las qtables originales y recortar (468,534,806,630) a assets/demo/logo-portaventuranext.webp.
import cv2, numpy as np
im=cv2.imread('assets/council-coetaneos.jpg').astype(float); vac=cv2.imread('assets/consejo-vacio/coetaneos.jpg').astype(float)
y0,y1,x0,x1=494,560,500,632
hsv=cv2.cvtColor(im.astype(np.uint8),cv2.COLOR_BGR2HSV).astype(int)
pur=(hsv[...,0]>105)&(hsv[...,0]<178)&(hsv[...,1]>18)&(hsv[...,2]>60)
box=np.zeros(pur.shape,bool); box[y0:y1,x0:x1]=True
m=((pur&box).astype(np.uint8))*255
m=cv2.dilate(m,np.ones((15,15),np.uint8)); m[~box]=0
m=cv2.GaussianBlur(m.astype(float),(0,0),4)/255.0
# igualar color de la placa vacía al arte en un anillo sin humo
ring=box & (~pur) & (cv2.dilate((pur&box).astype(np.uint8),np.ones((25,25),np.uint8))>0)
shift=(im[ring].mean(0)-vac[ring].mean(0)); print('shift',shift, ring.sum())
src=np.clip(vac+shift,0,255)
out=im*(1-m[...,None])+src*m[...,None]
cv2.imwrite('/tmp/lg/main-fixed.png',out.astype(np.uint8))
z=cv2.resize(np.hstack([im[470:600,440:700],out[470:600,440:700]]).astype(np.uint8),None,fx=2,fy=2,interpolation=cv2.INTER_NEAREST); cv2.imwrite('/tmp/lg/fix-m2.png',z)
