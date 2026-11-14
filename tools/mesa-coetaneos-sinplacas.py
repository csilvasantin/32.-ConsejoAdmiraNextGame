# Mesa de Coetáneos sin cartelas (Carlos 23:39): borra las 6 placas horneadas, rellena con madera y repinta los dos filetes.
import cv2, numpy as np, sys
src=sys.argv[1]; dst=sys.argv[2]
im=cv2.imread(src); H,W=im.shape[:2]
# placas (bbox del dorado) y márgenes (izq, arriba, der, abajo) para su borde oscuro y sombra
P={'jony':(745,455,843,482,(8,7,8,9)),'mira':(465,464,577,493,(8,6,8,9)),'jensen':(339,506,463,540,(8,7,8,9)),
   'lasseter':(893,545,1020,582,(8,7,9,9)),'elon':(246,591,387,630,(9,8,9,21)),'reynolds':(974,611,1116,653,(9,8,9,10))}
M=np.zeros((H,W),np.uint8)
hs0=cv2.cvtColor(im,cv2.COLOR_BGR2HSV).astype(int)
# personas, sillas y piel: nunca se tocan (solo la placa y su borde/sombra de madera)
prot=(hs0[...,1]<55)|((hs0[...,0]>24)&(hs0[...,0]<168))|((hs0[...,2]>150)&(hs0[...,0]<=12))|(hs0[...,0]>=168)
prot=cv2.dilate(prot.astype(np.uint8),np.ones((3,3),np.uint8))>0
for k,(a,b,c,d,(ml,mt,mr,mb)) in P.items():
    R=np.zeros((H,W),bool); R[b-mt:d+mb+1,a-ml:c+mr+1]=True
    core=np.zeros((H,W),bool); core[b-1:d+2,a-1:c+2]=True
    M[(R&~prot)|core]=255
Mf=cv2.GaussianBlur(M.astype(np.float32)/255,(0,0),1.6)[...,None]
ys=np.arange(H)[:,None].astype(float); xs=np.arange(W)[None,:].astype(float)
L1=np.polyfit([710,695,680,665,650,635,575,560,545,500],[121.5,141.5,162,183,204,225,316,337,357.5,432.5],2)
Ri=np.array([[485,848],[500,866.5],[590,986.5],[605,1005],[665,1093],[680,1113],[695,1132],[710,1151]],float)
RO=np.polyfit(Ri[:,0],Ri[:,1]+np.interp(Ri[:,0],[485,710],[12,16]),2)
sep=lambda y: 11+(y-485)*(9/225.0); anch=lambda y: 3.2+(y-485)*(4.3/225.0)
lineas=[]
for P_,sg,y0 in [(L1,+1,480),(RO,-1,470)]:
    for k in (0,1): lineas.append((np.polyval(P_,ys)+sg*k*sep(ys),y0))
fil=np.zeros((H,W),np.uint8)
for xc,y0 in lineas: fil|=((np.abs(xs-xc)<=anch(ys)/2+2.2)&(ys>=y0-2)).astype(np.uint8)
# 1) madera sin filetes alrededor de las placas
zona=cv2.dilate(M,np.ones((41,41),np.uint8))
S=cv2.inpaint(im,(fil&(zona>0)).astype(np.uint8)*255,4,cv2.INPAINT_TELEA)
# 2) hueco de la placa: base suave + veta de un parche donante de madera limpia
hsv=cv2.cvtColor(S,cv2.COLOR_BGR2HSV).astype(int)
mad=((hsv[...,0]<=21)&(hsv[...,1]>60)&(hsv[...,2]<150)&(hsv[...,2]>35)&(M==0)&(fil==0)).astype(np.uint8)
mad[528:640,455:820]=0   # neón PortAventuraNeXT: ni base ni donante
mad=cv2.erode(mad,np.ones((5,5),np.uint8))
# base: media de la madera vecina (convolución normalizada), sin sangrar piel, ropa ni neón
Sf0=S.astype(np.float32); mm=mad.astype(np.float32)
base=None
for sg in (60,30,15,8):   # de lo grueso a lo fino: cada escala manda donde tiene madera suficiente
    num=cv2.GaussianBlur(Sf0*mm[...,None],(0,0),sg); den=cv2.GaussianBlur(mm,(0,0),sg)[...,None]
    est=num/np.maximum(den,1e-4); wgt=np.clip(den/0.35,0,1)
    base=est if base is None else base*(1-wgt)+est*wgt
Sf=S.astype(np.float32); hf=Sf-cv2.GaussianBlur(Sf,(0,0),3)
out=Sf.copy()
for k,(a,b,c,d,(ml,mt,mr,mb)) in P.items():
    x0,y0_,x1,y1=a-ml-4,b-mt-4,c+mr+5,d+mb+5; w,h=x1-x0,y1-y0_
    best=None
    for dy in range(-80,81,4):
        for dx in list(range(-420,-w,6))+list(range(w,420,6)):
            X,Y=x0+dx,y0_+dy
            if X<0 or Y<0 or X+w>W or Y+h>H: continue
            f=mad[Y:Y+h,X:X+w].mean()
            if best is None or f>best[0]+1e-9 or (abs(f-best[0])<1e-9 and abs(dy)+abs(dx)/4<best[3]): best=(f,X,Y,abs(dy)+abs(dx)/4)
    f,X,Y,_=best; print(k,'donante',X,Y,round(f,3))
    region=base[y0_:y1,x0:x1]+hf[Y:Y+h,X:X+w]*0.9
    m=Mf[y0_:y1,x0:x1]
    out[y0_:y1,x0:x1]=out[y0_:y1,x0:x1]*(1-m)+region*m
# fuera de las placas, la imagen original (con sus filetes ya buenos)
o=im.astype(np.float32)*(1-Mf)+out*Mf
# 3) repintar los dos filetes dentro de los huecos (misma fórmula que mesa-coetaneos-filetes.py)
col=np.array(im[700,133:139].reshape(-1,3).astype(float).mean(0))
m2=cv2.cvtColor(np.clip(o,0,255).astype(np.uint8),cv2.COLOR_BGR2HSV).astype(int)
mad2=cv2.erode(((m2[...,0]<=21)&(m2[...,1]>60)&(m2[...,2]<185)).astype(np.uint8),np.ones((3,3),np.uint8))>0
zonaf=cv2.GaussianBlur(cv2.dilate(M,np.ones((5,5),np.uint8)).astype(np.float32)/255,(0,0),1.2)
for xc,y0 in lineas:
    w=anch(ys); d=np.abs(xs-xc)
    al=np.clip((w/2+0.6-d)/1.2,0,1)*(ys>=y0)*np.clip((ys-y0)/10,0,1)*mad2*zonaf
    o=o*(1-al[...,None])+(col[None,None,:]*(1-0.25*(d/np.maximum(w,1))[...,None]))*al[...,None]
cv2.imwrite(dst,np.clip(o,0,255).astype(np.uint8)); cv2.imwrite('placas-mask.png',M)
