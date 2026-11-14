# Mesa de Coetáneos (Carlos 23:12): dos filetes de madera clara iguales a ambos lados de la mesa, de punta a punta.
import cv2, numpy as np, sys
src=sys.argv[1] if len(sys.argv)>1 else 'r195-main.jpg'; dst=sys.argv[2] if len(sys.argv)>2 else 'filetes.png'
im=cv2.imread(src); H,W=im.shape[:2]
hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV).astype(int); h,s,v=hsv[...,0],hsv[...,1],hsv[...,2]
L1=np.polyfit([710,695,680,665,650,635,575,560,545,500],[121.5,141.5,162,183,204,225,316,337,357.5,432.5],2)
Ri=np.array([[485,848],[500,866.5],[590,986.5],[605,1005],[665,1093],[680,1113],[695,1132],[710,1151]],float)
RO=np.polyfit(Ri[:,0],Ri[:,1]+np.interp(Ri[:,0],[485,710],[12,16]),2)
sep=lambda y: 11+(y-485)*(9/225.0)
anch=lambda y: 3.2+(y-485)*(4.3/225.0)   # ancho del filete
lados=[('izq',L1,+1,480),('der',RO,-1,470)]
madera=((h<=21)&(s>60)&(v<185)).astype(np.uint8)
ys=np.arange(H)[:,None].astype(float); xs=np.arange(W)[None,:].astype(float)
banda=np.zeros((H,W),bool); dist=[]
for n,P,sg,y0 in lados:
    xa=np.polyval(P,ys)  # x del filete exterior
    lo=np.minimum(xa,xa+sg*(26+0*ys)); hi=np.maximum(xa,xa+sg*(26+0*ys))
    b=(xs>=lo-7)&(xs<=hi+7)&(ys>=y0)
    banda|=b
    dist.append((P,sg,y0))
# 1) borrar filetes viejos: píxeles de madera más claros que la madera vecina dentro de la banda
g=im.astype(np.float32).mean(2)
fondo=cv2.medianBlur(im,21).astype(np.float32).mean(2)
viejo=(banda&(madera>0)&(g>fondo+12)).astype(np.uint8)
viejo=cv2.dilate(viejo,np.ones((3,3),np.uint8))&banda.astype(np.uint8)
limpio=cv2.inpaint(im,viejo*255,6,cv2.INPAINT_TELEA)
# 2) pintar dos filetes nuevos (color muestreado del filete original abajo a la izquierda)
col=np.array(im[700,133:139].reshape(-1,3).mean(0)); colb=np.array(im[700,136:138].reshape(-1,3).mean(0))*1.08
out=limpio.astype(np.float32)
m2=cv2.cvtColor(limpio,cv2.COLOR_BGR2HSV).astype(int)
madera2=((m2[...,0]<=21)&(m2[...,1]>60)&(m2[...,2]<185))
madera2=cv2.erode(madera2.astype(np.uint8),np.ones((3,3),np.uint8))>0
for P,sg,y0 in dist:
    for k in (0,1):
        xc=np.polyval(P,ys)+sg*k*sep(ys)
        w=anch(ys)
        d=np.abs(xs-xc)
        a=np.clip((w/2+0.6-d)/1.2,0,1)*(ys>=y0)
        # punta suave en el extremo lejano
        a*=np.clip((ys-y0)/10,0,1)
        a*=madera2
        out=out*(1-a[...,None])+(col[None,None,:]*(1-0.25*(d/np.maximum(w,1))[...,None]))*a[...,None]
cv2.imwrite(dst,np.clip(out,0,255).astype(np.uint8))
cv2.imwrite('viejo-mask.png',viejo*255)
