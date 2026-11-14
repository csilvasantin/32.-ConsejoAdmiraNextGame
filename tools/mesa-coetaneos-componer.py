# Mesa de Coetáneos regenerada (t560u 21:33): recorte (360,405)-(920,720) del arte original editado con GenerateImage («PortAventuraNeXT» limpio), alineado por ECC, color igualado y fundido con máscara suave (personas intactas). Ver /workspace/demo-consejo/mesa-pan/.
import cv2, numpy as np, sys
# uso: componer.py orig.jpg gen.jpg out.png  [cajas de personas en coords de recorte 560x315: x0,y0,x1,y1;...]
orig=cv2.imread(sys.argv[1]); gen=cv2.imread(sys.argv[2]); out=sys.argv[3]
cajas=[tuple(map(int,c.split(','))) for c in sys.argv[4].split(';')] if len(sys.argv)>4 and sys.argv[4] else []
X0,Y0,X1,Y1=360,405,920,720; w,h=X1-X0,Y1-Y0
o=orig[Y0:Y1,X0:X1]
o2=cv2.resize(o,(w*2,h*2),interpolation=cv2.INTER_LANCZOS4); g2=cv2.resize(gen,(w*2,h*2),interpolation=cv2.INTER_AREA)
og=cv2.cvtColor(o2,cv2.COLOR_BGR2GRAY).astype(np.float32); gg=cv2.cvtColor(g2,cv2.COLOR_BGR2GRAY).astype(np.float32)
m=np.ones(og.shape,np.uint8); m[180:470,180:860]=0
W=np.eye(2,3,dtype=np.float32)
cc,W=cv2.findTransformECC(og,gg,W,cv2.MOTION_AFFINE,(cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_COUNT,200,1e-6),m,5)
al=cv2.warpAffine(g2,W,(w*2,h*2),flags=cv2.INTER_LINEAR+cv2.WARP_INVERSE_MAP,borderMode=cv2.BORDER_REPLICATE)
al=cv2.resize(al,(w,h),interpolation=cv2.INTER_AREA).astype(np.float32)
# corrección de color de baja frecuencia (sólo fuera del logo)
ref=np.ones((h,w),bool); ref[90:235,90:430]=False
for x0,y0,x1,y1 in cajas: ref[y0:y1,x0:x1]=False
of=o.astype(np.float32)
for c in range(3):
    a,b=al[...,c][ref],of[...,c][ref]
    al[...,c]=(al[...,c]-a.mean())*(b.std()/a.std())+b.mean()
mask=np.ones((h,w),np.float32)
for x0,y0,x1,y1 in cajas: mask[y0:y1,x0:x1]=0
mask=cv2.GaussianBlur(mask,(0,0),3)
edge=np.ones((h,w),np.float32); F=14
ramp=np.clip(np.arange(w)/F,0,1); edge*=ramp[None,:]; edge*=ramp[::-1][None,:]
edge*=np.clip(np.arange(h)/F,0,1)[:,None]
mask*=edge
res=orig.copy().astype(np.float32)
res[Y0:Y1,X0:X1]=of*(1-mask[...,None])+np.clip(al,0,255)*mask[...,None]
cv2.imwrite(out,res.astype(np.uint8)); print('ecc',cc)
