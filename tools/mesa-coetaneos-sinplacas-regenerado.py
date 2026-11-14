# Sin cartelas (Carlos 23:39): las placas que tapan brazos/manos se rehacen con recortes regenerados (gp-*.jpg, alineados por ECC);
# Jony (sobre madera limpia) sale del relleno procedural de sinplacas.py. Al final se repintan los dos filetes analíticos.
import cv2, numpy as np, sys
base=cv2.imread(sys.argv[1]); proc=cv2.imread(sys.argv[2]); dst=sys.argv[3]
H,W=base.shape[:2]
P={'mira':((465,464,577,493),(401,358)),'jensen':((339,506,463,540),(281,403)),'lasseter':((893,545,1020,582),(836,443)),
   'elon':((246,591,387,630),(196,480)),'reynolds':((974,611,1116,653),(925,480))}
MG={'elon':(9,8,9,21)}
out=proc.astype(np.float32).copy()
Mtot=np.zeros((H,W),np.float32)
for k,((a,b,c,d),(x0,y0)) in P.items():
    ref=base[y0:y0+240,x0:x0+240]
    g=cv2.resize(cv2.imread(f'gp-{k}.jpg'),(240,240),interpolation=cv2.INTER_AREA)
    ml,mt,mr,mb=MG.get(k,(9,8,9,10))
    hole=np.zeros((240,240),np.uint8); cv2.rectangle(hole,(a-ml-x0,b-mt-y0),(c+mr-x0,d+mb-y0),255,-1)
    ecm=(cv2.dilate(hole,np.ones((15,15),np.uint8))==0).astype(np.uint8)  # alinear solo con lo que no cambia
    warp=np.eye(3,dtype=np.float32)
    try:
        _,warp=cv2.findTransformECC(cv2.cvtColor(ref,cv2.COLOR_BGR2GRAY).astype(np.float32),cv2.cvtColor(g,cv2.COLOR_BGR2GRAY).astype(np.float32),warp,cv2.MOTION_HOMOGRAPHY,(cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_COUNT,300,1e-6),ecm,5)
    except cv2.error as e: print(k,'ECC fallo',e)
    ga=cv2.warpPerspective(g,warp,(240,240),flags=cv2.INTER_LINEAR+cv2.WARP_INVERSE_MAP).astype(np.float32)
    ring=(cv2.dilate(hole,np.ones((21,21),np.uint8))>0)&(hole==0)
    r=ref.astype(np.float32)
    for ch in range(3):  # igualar color en el anillo
        ms,ss=ga[...,ch][ring].mean(),ga[...,ch][ring].std()+1e-3; mr_,sr=r[...,ch][ring].mean(),r[...,ch][ring].std()
        ga[...,ch]=(ga[...,ch]-ms)*(0.5+0.5*sr/ss)+mr_
    err=np.abs(ga-r)[ring].mean(); print(k,'error anillo',round(float(err),1))
    m=cv2.GaussianBlur(hole.astype(np.float32)/255,(0,0),2.0)
    m=np.maximum(m,hole/255.0*1.0)*0+cv2.GaussianBlur(cv2.dilate(hole,np.ones((5,5),np.uint8)).astype(np.float32)/255,(0,0),2.0)
    sl=out[y0:y0+240,x0:x0+240]
    out[y0:y0+240,x0:x0+240]=sl*(1-m[...,None])+ga*m[...,None]
    Mtot[y0:y0+240,x0:x0+240]=np.maximum(Mtot[y0:y0+240,x0:x0+240],m)
o=np.clip(out,0,255).astype(np.uint8)
# filetes: borrar los que trae la regeneración dentro del hueco y repintar los analíticos
ys=np.arange(H)[:,None].astype(float); xs=np.arange(W)[None,:].astype(float)
L1=np.polyfit([710,695,680,665,650,635,575,560,545,500],[121.5,141.5,162,183,204,225,316,337,357.5,432.5],2)
Ri=np.array([[485,848],[500,866.5],[590,986.5],[605,1005],[665,1093],[680,1113],[695,1132],[710,1151]],float)
RO=np.polyfit(Ri[:,0],Ri[:,1]+np.interp(Ri[:,0],[485,710],[12,16]),2)
sep=lambda y: 11+(y-485)*(9/225.0); anch=lambda y: 3.2+(y-485)*(4.3/225.0)
lineas=[]; banda=np.zeros((H,W),bool)
for P_,sg,y0 in [(L1,+1,480),(RO,-1,470)]:
    xa=np.polyval(P_,ys); lo=np.minimum(xa,xa+sg*26); hi=np.maximum(xa,xa+sg*26)
    banda|=(xs>=lo-12)&(xs<=hi+12)&(ys>=y0-4)
    for k in (0,1): lineas.append((xa+sg*k*sep(ys),y0))
hs=cv2.cvtColor(o,cv2.COLOR_BGR2HSV).astype(int)
mad=((hs[...,0]<=21)&(hs[...,1]>60)&(hs[...,2]<200))
gr=o.astype(np.float32).mean(2); fondo=cv2.medianBlur(o,21).astype(np.float32).mean(2)
hueco=cv2.dilate((Mtot>0.02).astype(np.uint8),np.ones((13,13),np.uint8))>0
viejo=(banda&mad&(gr>fondo+7)&hueco).astype(np.uint8)
viejo=cv2.dilate(viejo,np.ones((3,3),np.uint8))&(banda&hueco).astype(np.uint8)
o=cv2.inpaint(o,viejo*255,5,cv2.INPAINT_TELEA)
col=np.array(base[700,133:139].reshape(-1,3).astype(float).mean(0))
m2=cv2.cvtColor(o,cv2.COLOR_BGR2HSV).astype(int)
mad2=cv2.erode(((m2[...,0]<=21)&(m2[...,1]>60)&(m2[...,2]<185)).astype(np.uint8),np.ones((3,3),np.uint8))>0
of=o.astype(np.float32)
for xc,y0 in lineas:
    w=anch(ys); d=np.abs(xs-xc)
    al=np.clip((w/2+0.6-d)/1.2,0,1)*(ys>=y0)*np.clip((ys-y0)/10,0,1)*mad2*cv2.GaussianBlur(hueco.astype(np.float32),(0,0),1.0)
    of=of*(1-al[...,None])+(col[None,None,:]*(1-0.25*(d/np.maximum(w,1))[...,None]))*al[...,None]
cv2.imwrite(dst,np.clip(of,0,255).astype(np.uint8))
# mota oscura que deja la regeneración de Mira sobre la madera (≈468,496)
o2=cv2.imread(dst); g2=o2.astype(np.float32).mean(2); f2=cv2.medianBlur(o2,15).astype(np.float32).mean(2)
mm=np.zeros(g2.shape,np.uint8); mm[486:506,452:488]=1
mota=((g2<f2-6)&(mm>0)).astype(np.uint8); mota=cv2.dilate(mota,np.ones((3,3),np.uint8))
cv2.imwrite(dst,cv2.inpaint(o2,mota*255,4,cv2.INPAINT_TELEA)); print('mota px',int(mota.sum()))
