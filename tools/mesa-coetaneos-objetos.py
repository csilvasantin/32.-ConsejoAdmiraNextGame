# Objetos en la mesa (Carlos 23:12): Model X (Elon), DGX (Jensen), portátil con chat (Mira). Croma verde → sprite, sombra de contacto, pegado sobre la madera.
import cv2, numpy as np, sys
from PIL import Image, ImageFilter
base=Image.open(sys.argv[1]).convert('RGBA'); dst=sys.argv[2]
def sprite(f):
    im=cv2.imread(f); hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV).astype(int)
    g=((hsv[...,0]>35)&(hsv[...,0]<90)&(hsv[...,1]>70)).astype(np.uint8)
    n,lab=cv2.connectedComponents(g); border=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))-{0}
    bg=np.isin(lab,list(border)); a=(~bg).astype(np.uint8)*255
    a=cv2.morphologyEx(a,cv2.MORPH_OPEN,np.ones((5,5),np.uint8)); a=cv2.erode(a,np.ones((3,3),np.uint8)); a=cv2.GaussianBlur(a,(3,3),0)
    b,gc,r=[im[...,i].astype(int) for i in range(3)]; gc=np.minimum(gc,np.maximum(r,b)+8)
    P=Image.fromarray(np.dstack([r,gc,b,a]).clip(0,255).astype(np.uint8),'RGBA'); return P.crop(P.getbbox())
out=base.copy()
for f,(x0,y0,w) in [('gen-modelx.jpg',(378,542,70)),('gen-dgx.jpg',(472,502,42)),('gen-laptop.jpg',(590,457,48))]:
    s=sprite(f); h=round(s.height*w/s.width); s=s.resize((w,h),Image.LANCZOS)
    # sombra de contacto
    sh=Image.new('RGBA',(w+16,24),(0,0,0,0)); m=Image.new('L',sh.size,0)
    from PIL import ImageDraw; ImageDraw.Draw(m).ellipse((4,6,w+12,18),fill=120); m=m.filter(ImageFilter.GaussianBlur(3))
    sh.putalpha(m); out.alpha_composite(sh,(x0-8,y0+h-15))
    out.alpha_composite(s,(x0,y0)); print(f,(x0,y0,x0+w,y0+h))
out.convert('RGB').save(dst)
