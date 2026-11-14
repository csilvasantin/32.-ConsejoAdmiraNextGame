# Objetos en el sitio de cada cartela (Carlos 23:39): Model X (Elon), DGX (Jensen), portátil con chat (Mira); sin placas.
# Y la maqueta de Ferrari Land de Carlo Bonomi como capa aparte (assets/cabecera/), porque la cabecera es una capa HTML.
import cv2, numpy as np, sys
from PIL import Image, ImageFilter, ImageDraw
def sprite(f):
    im=cv2.imread(f); hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV).astype(int)
    g=((hsv[...,0]>35)&(hsv[...,0]<90)&(hsv[...,1]>70)).astype(np.uint8)
    n,lab=cv2.connectedComponents(g); border=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))-{0}
    bg=np.isin(lab,list(border)); a=(~bg).astype(np.uint8)*255
    a=cv2.morphologyEx(a,cv2.MORPH_OPEN,np.ones((5,5),np.uint8)); a=cv2.erode(a,np.ones((3,3),np.uint8)); a=cv2.GaussianBlur(a,(3,3),0)
    b,gc,r=[im[...,i].astype(int) for i in range(3)]; gc=np.minimum(gc,np.maximum(r,b)+8)
    P=Image.fromarray(np.dstack([r,gc,b,a]).clip(0,255).astype(np.uint8),'RGBA'); return P.crop(P.getbbox())
def sombra(w):
    sh=Image.new('RGBA',(w+16,24),(0,0,0,0)); m=Image.new('L',sh.size,0)
    ImageDraw.Draw(m).ellipse((4,6,w+12,18),fill=120); sh.putalpha(m.filter(ImageFilter.GaussianBlur(3))); return sh
def calido(s,k=(0.96,0.92,0.86)):
    a=np.array(s).astype(np.float32); a[...,:3]*=np.array(k); return Image.fromarray(a.clip(0,255).astype(np.uint8),'RGBA')
if __name__=='__main__':
    base=Image.open(sys.argv[1]).convert('RGBA'); dst=sys.argv[2]; out=base.copy()
    for f,(cx,yb,w) in [('gen-modelx.jpg',(316,628,74)),('gen-dgx.jpg',(401,537,46)),('gen-laptop.jpg',(521,492,52))]:
        s=sprite(f); h=round(s.height*w/s.width); s=s.resize((w,h),Image.LANCZOS); x0=round(cx-w/2); y0=yb-h
        out.alpha_composite(sombra(w),(x0-8,y0+h-15)); out.alpha_composite(s,(x0,y0)); print(f,(x0,y0,x0+w,yb))
    out.convert('RGB').save(dst)
    # Ferrari Land: sprite a 2x (se ve a 1x sobre el arte de 1280) con su sombra de contacto
    if len(sys.argv)>3:
        s=calido(sprite('gen-ferrariland.jpg')); H2=2*62; W2=round(s.width*H2/s.height); s=s.resize((W2,H2),Image.LANCZOS)
        can=Image.new('RGBA',(W2+24,H2+10),(0,0,0,0)); m=Image.new('L',can.size,0)
        ImageDraw.Draw(m).ellipse((6,H2-20,W2+18,H2+8),fill=130); sh=Image.new('RGBA',can.size,(0,0,0,255)); sh.putalpha(m.filter(ImageFilter.GaussianBlur(5)))
        can.alpha_composite(sh); can.alpha_composite(s,(12,0)); can.save(sys.argv[3],quality=92,method=6); print('ferrari',can.size)
