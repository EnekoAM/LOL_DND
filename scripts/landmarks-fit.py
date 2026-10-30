# Ajuste de los sprites 3D a las sombras pintadas en los tiles (ver public/assets/runeterra/landmarks/README.md).
# Requiere opencv-python, numpy, el mapa completo 8192 (full.png, cosido de los tiles z4) y las siluetas de landmarks-render.js (shear 0).
import json,cv2,numpy as np,sys
full=cv2.imread('/workspace/full.png')
pois={p['slug']:p for p in json.load(open('/workspace/mapa/runeterraPois.json'))['pois']}
slugs=['demacia-city-landmark','sun-disc','placidium','the-void','immortal-bastion','frostguard','ixaocan','mount-targon']
R=230
SCALES=[float(a) for a in sys.argv[1].split(',')] if len(sys.argv)>1 else np.arange(3.5,4.81,0.05)
def fit(mask,a):
    best=None
    for sc in SCALES:
        t=cv2.resize(a,None,fx=sc/16,fy=sc/16,interpolation=cv2.INTER_AREA); tb=(t>0.5).astype(np.float32)
        m=cv2.matchTemplate(mask,tb-0.6*(1-tb),cv2.TM_CCORR); _,mx,_,loc=cv2.minMaxLoc(m)
        sub=mask[loc[1]:loc[1]+tb.shape[0],loc[0]:loc[0]+tb.shape[1]]; i=(sub*tb).sum(); iou=i/(tb.sum()+sub.sum()-i)
        if best is None or mx>best[0]: best=(mx,sc,loc,iou)
    return best
res={}; tiles=[]
for s in slugs:
    p=pois[s]; x0,y0=p['x']-R,p['y']-R
    win=full[y0:y0+2*R,x0:x0+2*R]; wf=win.astype(np.float32)
    L=cv2.cvtColor(win,cv2.COLOR_BGR2GRAY).astype(np.float32)+1
    ratio=L/np.maximum(cv2.GaussianBlur(L,(0,0),90),1)
    br=wf[:,:,0]-wf[:,:,2]; blu=br-cv2.GaussianBlur(br,(0,0),90)
    masks=[((ratio<0.8)&(blu>4)),(ratio<0.72)]
    masks=[cv2.morphologyEx(m.astype(np.float32),cv2.MORPH_OPEN,np.ones((5,5),np.uint8)) for m in masks]
    meta=json.load(open(f'/workspace/lm/r2/{s}_0.json'))
    a=cv2.imread(f'/workspace/lm/r2/{s}_0.png',cv2.IMREAD_UNCHANGED)[:,:,3].astype(np.float32)/255
    fits=[fit(m,a) for m in masks]; mi=int(np.argmax([f[3] for f in fits])); mx,sc,loc,iou=fits[mi]; mask=masks[mi]
    ox=x0+loc[0]-meta['minX']*sc; oy=y0+loc[1]+meta['maxY']*sc
    res[s]=dict(scale=round(float(sc),2),ox=round(float(ox),1),oy=round(float(oy),1),iou=round(float(iou),2),mask=mi,pin=[p['x'],p['y']])
    print(s,res[s])
    dbg=win.copy(); t=cv2.resize(a,None,fx=sc/16,fy=sc/16)
    roi=dbg[loc[1]:loc[1]+t.shape[0],loc[0]:loc[0]+t.shape[1]]
    roi[cv2.Canny((t>0.5).astype(np.uint8)*255,50,150)>0]=(0,0,255)
    dbg[(mask>0)&(np.indices(mask.shape).sum(0)%6==0)]=(0,255,255)
    tiles.append(cv2.resize(dbg,(400,400)))
json.dump(res,open('/workspace/lm/fit.json','w'),indent=1)
cv2.imwrite(sys.argv[2] if len(sys.argv)>2 else '/tmp/fit/all3.png',np.vstack([np.hstack(tiles[:4]),np.hstack(tiles[4:])]))
