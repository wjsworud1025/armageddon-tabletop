"""Pack the Starter Set and matching Battlezone turntables from local frames.

Sources: https://www.warhammer.com/ko-KR/shop/40k-starter-set-2026-eng
Gallery entries 5–19 each expose three elevations and twelve angles.
Groups 16–18 are the corresponding additional sculpts on the product page
https://www.warhammer.com/en-GB/shop/combat-patrol-battlezone-2026
Usage: python tabletop/assets/tools/pack-turntables.py path/to/wh-turns
Expected source path: 01/01-01.webp through 18/03-12.webp (JPEG or WebP).
"""
import json
import math
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import numpy as np
from PIL import Image


SIZES = {1:(40,40),2:(40,40),3:(32,32),4:(32,32),5:(70,105),
         6:(50,50),7:(40,40),8:(50,50),9:(32,32),10:(25,25),11:(70,105)}
TERRAIN = {12:(5.2,4.1),13:(4.2,1.75),14:(3.5,1.4),15:(3.5,1.5),
           16:(5.2,4.1),17:(3.8,.65),18:(2.5,1.4)}
CELL = 512
OUTPUT = Path(__file__).resolve().parents[1] / "turns"


def footprint(rgb, mask, box, group, ring, angle):
    x0,y0,x1,y1=box
    h,w=mask.shape
    if group in TERRAIN:
        # Unbased terrain has no circular rim; use the estimated catalog
        # footprint for a conservative registration, exposed as an estimate.
        a,b=TERRAIN[group]
        yaw=angle*math.tau/12
        extent=abs(a*math.cos(yaw))+abs(b*math.sin(yaw))
        return [(x0+x1)/2,y1-(y1-y0)*(.06+.05*ring)], (x1-x0)/extent, None
    r,g,b=np.moveaxis(rgb.astype(np.int16),-1,0)
    brown=(r>g+4)&(g>b+2)&(r>38)&(r<220)&(r-b<112)
    floor=mask & (np.indices(mask.shape)[0]>=y0+.53*(y1-y0))
    xs=np.arange(x0,x1+1)
    bottom=h-1-np.argmax(mask[::-1,xs],axis=0)
    inside=mask[bottom,xs] & floor[bottom,xs]
    # The edge antialiases into white. Sample the actual paint just above it.
    used=inside & (brown[np.maximum(0,bottom-3),xs] | brown[np.maximum(0,bottom-5),xs])
    inds=np.flatnonzero(used)
    if len(inds)<14: inds=np.flatnonzero(inside)
    split=np.split(inds,np.flatnonzero(np.diff(inds)>9)+1)
    longest=max(split,key=len)
    xs=xs[longest]; bottom=bottom[longest]
    left,right=xs[0],xs[-1];mid=(left+right)/2
    a=(right-left)/2
    # Bottom arc of a tilted ellipse. The linear term handles oval vehicles.
    hx=(xs-mid)/max(a,1)
    basis=np.stack([np.ones(len(xs)),hx,np.sqrt(np.maximum(0,1-hx**2))],axis=1)
    keep=np.ones(len(xs),dtype=bool)
    for _ in range(3):
        coeff=np.linalg.lstsq(basis[keep],bottom[keep],rcond=None)[0]
        err=np.abs(bottom-basis@coeff)
        keep=err<max(2,np.percentile(err,78))
    cy,tilt,bottom_arc=coeff
    if not (y0<cy<y1+1 and bottom_arc>=0):
        bottom_arc=a*[.14,.45,.72][ring]
        cy=y1-bottom_arc
    small,large=SIZES[group]
    if small==large:
        px=(2*a)/(small/25.4)
    else:
        # Apparent horizontal width of a rotated oval varies with azimuth.
        # Its product with the demagnified cross-axis is constant. The fitted
        # ellipse half-area equals pi*a*bottom_arc at this elevation.
        elevation=[.17,.48,.76][ring]
        px=math.sqrt(max(1,4*a*bottom_arc)/(elevation*small*large/25.4**2))
    return [mid,cy],px,float(bottom_arc/max(a,1))


def make_frame(image,group,ring,angle):
    image=image.convert("RGB")
    if image.width!=image.height:
        side=max(image.size)
        square=Image.new("RGB",(side,side),"white")
        square.paste(image,((side-image.width)//2,(side-image.height)//2))
        image=square
    rgb=np.asarray(image)
    h,w=rgb.shape[:2]
    loss=255-rgb.min(axis=2).astype(np.float32)
    alpha=np.clip((loss-7)/16,0,1)
    # Reverse the white studio backdrop at translucent edge pixels.
    straight=255-(255-rgb.astype(np.float32))/np.maximum(alpha[:,:,None],1/255)
    rgba=np.dstack([np.clip(straight,0,255),alpha*255]).astype(np.uint8)
    mask=alpha>.68
    ys,xs=np.nonzero(mask)
    box=[int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())]
    center,scale,ratio=footprint(rgb,mask,box,group,ring,angle)
    frame=Image.fromarray(rgba).resize((CELL,CELL),Image.Resampling.LANCZOS)
    info=[round(center[0]/w,5),round(center[1]/h,5),round(scale*CELL/w,3),
          *[round(n/w,5) for n in box]]
    return frame,info,ratio


def pack_ring(args):
    source,group,ring=args
    atlas=Image.new("RGBA",(CELL*4,CELL*3))
    meta=[]; ratios=[]
    for a in range(12):
        with Image.open(source/f"{group:02d}"/f"{ring+1:02d}-{a+1:02d}.webp") as image:
            frame,info,ratio=make_frame(image,group,ring,a)
        atlas.paste(frame,((a%4)*CELL,(a//4)*CELL))
        meta.append(info)
        if ratio is not None: ratios.append(ratio)
    atlas.save(OUTPUT/f"{group:02d}-{ring+1}.webp",quality=85,method=4)
    return group,ring,meta,ratios


def main():
    source=Path(sys.argv[1]);OUTPUT.mkdir(exist_ok=True)
    all_info={g:[None]*3 for g in range(1,19)}
    elevations=[[] for _ in range(3)]
    jobs=[(source,g,r) for g in all_info for r in range(3)]
    with ThreadPoolExecutor(max_workers=4) as pool:
        for g,r,meta,ratios in pool.map(pack_ring,jobs):
            all_info[g][r]=meta
            if g in SIZES and SIZES[g][0]==SIZES[g][1]:elevations[r].extend(ratios)
    # Based pieces at one elevation have a constant physical magnification
    # across azimuth. Median suppresses rare foot/rim silhouette overlap.
    for g,levels in all_info.items():
        if g not in SIZES:continue
        for row in levels:
            scales=np.asarray([i[2] for i in row])
            median=float(np.median(scales))
            for i in row:
                if abs(i[2]-median)>median*.13:i[2]=round(median,3)
    degrees=[round(math.degrees(math.asin(np.clip(np.median(v),0,1))),1) for v in elevations]
    # The studio chose a different cover angle for every structure. Fit that
    # yaw from the measured width trace instead of assuming frame 1 faces +Z.
    for g,(wide,deep) in TERRAIN.items():
        for ri,row in enumerate(all_info[g]):
            widths=np.array([(f[5]-f[3])*CELL for f in row])
            th=np.arange(12)*math.tau/12
            candidates=[]
            for offset in np.linspace(0,math.pi,181):
                ext=wide*np.abs(np.cos(th+offset))+deep*np.abs(np.sin(th+offset))
                magnification=np.median(widths/ext)
                error=np.mean(np.abs(widths-ext*magnification))
                candidates.append((error,offset,magnification))
            _,offset,magnification=min(candidates)
            for k,f in enumerate(row):
                depth_projection=wide*abs(math.sin(th[k]+offset))+deep*abs(math.cos(th[k]+offset))
                floor_half=depth_projection*.5*math.sin(math.radians(degrees[ri]))*magnification/CELL
                f[1]=round(max(f[4],f[6]-floor_half),5)
                f[2]=round(magnification,3)
    data={"frames":all_info,"elevationsDegrees":degrees}
    (OUTPUT/"registration.mjs").write_text("// Generated by assets/tools/pack-turntables.py.\nexport const registration="+
        json.dumps(data,separators=(",", ":"))+";\n",encoding="utf-8")
    print("Exported",len(jobs),"atlases; median camera elevations",data["elevationsDegrees"])


if __name__=="__main__":main()
