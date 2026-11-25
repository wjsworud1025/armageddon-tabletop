"""Prepare the optional painted miniature views from the three product plates.

Usage: python prepare-portraits.py marine-image ork-image terrain-image output-dir
Dependencies for asset preparation only: Pillow, numpy.
Coordinates in anchors below are normalized to the 1024x1024 catalogue plates.
"""
from pathlib import Path
from sys import argv
import json
import numpy as np
from PIL import Image, ImageFilter

# Ground reference points, measured diameter of the base at the same depth in
# the source image, and physical diameter for conversion to inches.
def specs(kind, anchors):
    return [(f"{kind}-{i}", *a) for i, a in enumerate(anchors, 1)]

marines = (
    specs("landSpeeder", [(304,448,213,3.6)]) +
    specs("vanguard", [(818,362,86,32/25.4),(725,501,97,32/25.4),(565,481,95,32/25.4),
                       (659,309,82,32/25.4),(486,335,86,32/25.4)]) +
    specs("librarian", [(225,647,131,40/25.4)]) + specs("captain", [(322,879,155,40/25.4)]) +
    specs("intercessor", [(483,663,110,32/25.4),(759,878,124,32/25.4),(561,869,124,32/25.4),
                          (805,672,112,32/25.4),(646,676,109,32/25.4)])
)
orks = (
    specs("wartrakk",[(798,336,206,3.85)]) + specs("warboss",[(819,675,170,50/25.4)]) +
    specs("weirdboy",[(643,541,150,50/25.4)]) +
    specs("boy",[(143,198,91,40/25.4),(251,184,75,32/25.4),(352,175,72,32/25.4),(422,202,73,32/25.4),
                 (514,163,70,32/25.4),(621,183,73,32/25.4),(724,177,71,32/25.4),(147,325,80,32/25.4),
                 (266,308,80,32/25.4),(377,328,86,32/25.4),(184,506,117,40/25.4),
                 (530,263,80,32/25.4),(642,293,81,32/25.4),(500,388,86,32/25.4),(327,478,97,32/25.4),
                 (454,524,95,32/25.4),(175,683,107,32/25.4),(343,631,101,32/25.4),
                 (486,678,109,32/25.4),(617,710,108,32/25.4)]) +
    specs("gretchin",[(166,818,89,25/25.4),(313,782,89,25/25.4),(494,802,88,25/25.4),
                      (706,808,89,25/25.4),(850,817,93,25/25.4),(175,937,94,25/25.4),
                      (333,918,98,25/25.4),(481,922,98,25/25.4),(608,889,96,25/25.4),(790,918,96,25/25.4)])
)
terrain = (
    specs("largeRuin",[(363,423,162,5.1),(707,415,280,6.2),(208,292,194,5.4),(833,273,164,5.4)]) +
    specs("smallRuin",[(376,603,81,2.5),(513,607,100,2.5),(506,407,115,2.5),(650,616,98,2.5)]) +
    specs("generatorShrine",[(518,318,103,3.4)]) + specs("shockArray",[(519,531,193,4.1)]) +
    specs("pylon",[(239,628,168,3.75),(790,628,170,3.75)]) +
    specs("barricade",[(255,824,197,3.8),(780,826,191,3.8)]) + specs("capacitorStack",[(508,853,202,4.2)])
)

def components(mask):
    # Run-length union-find avoids a second image-processing dependency.
    parent = []
    def root(n):
        while n != parent[n]:
            parent[n] = parent[parent[n]]
            n = parent[n]
        return n
    runs, prev = [], []
    for y, row in enumerate(mask):
        ends = np.flatnonzero(np.diff(np.r_[False,row,False]))
        curr, j = [], 0
        for lo, hi in ends.reshape(-1, 2):
            lo, hi = int(lo), int(hi)
            idx = len(parent); parent.append(idx)
            while j<len(prev) and prev[j][1]<lo: j+=1
            k=j
            while k<len(prev) and prev[k][0]<=hi:
                parent[root(prev[k][2])] = root(idx); k+=1
            curr.append((lo,hi,idx)); runs.append((y,lo,hi,idx))
        prev=curr
    labels=np.zeros(mask.shape,dtype=np.int32)
    for y,lo,hi,idx in runs: labels[y,lo:hi]=root(idx)+1
    return labels

def extract(path, records, out):
    source=Image.open(path).convert("RGB")
    if source.size==(1840,1900):
        source=source.crop((0,30,1840,1870))
    rgb=np.asarray(source)
    height,width=rgb.shape[:2]
    # Product photographs may be padded to different aspect ratios; use square plates.
    if abs(width-height)>3: raise ValueError("Expected square product plate")
    scale=width/1024
    mask=(rgb.min(axis=2)<237).astype(np.uint8)*255
    mask=Image.fromarray(mask).filter(ImageFilter.MaxFilter(5 if scale>1.5 else 3))
    labels=components(np.asarray(mask)>0)
    result={}
    seen=set()
    for key,ax,ay,diameter,inches in records:
        x,y=int(ax*scale),int(ay*scale)
        lab=labels[y,x]
        if not lab:
            near=labels[max(0,y-15):y+16,max(0,x-15):x+16]
            lab=np.bincount(near[near>0]).argmax()
        if lab in seen: raise ValueError("Touching figures at "+key)
        seen.add(lab)
        ys,xs=np.where(labels==lab)
        if xs.size<150: raise ValueError("Fragment: "+key)
        l,t,r,b=max(0,xs.min()-1),max(0,ys.min()-1),min(width,xs.max()+2),min(height,ys.max()+2)
        pixels=rgb[t:b,l:r].copy()
        # Remove studio white even inside loops (arms, weapons, arches).
        darkness=255-pixels.min(axis=2).astype(np.float32)
        local_ink=np.asarray(Image.fromarray(darkness.astype('uint8')).filter(ImageFilter.MaxFilter(5)))
        edge=np.asarray(Image.fromarray((darkness<22).astype('uint8')).filter(ImageFilter.MaxFilter(5)))>0
        coverage=np.where(edge,np.clip((darkness-5)/np.maximum(local_ink.astype(float)-5,60),0,1),1)
        coverage[labels[t:b,l:r]!=lab]=0
        # Unmix the white studio backdrop along soft edges before mipmapping.
        clean=np.clip(255-(255-pixels.astype(float))/np.maximum(coverage[:,:,None],.015),0,255)
        clean[coverage<.005]=[60,55,48]
        im=Image.fromarray(np.dstack([clean.astype('uint8'),np.uint8(coverage*255)]))
        temporary=out/(key+'.webp.tmp')
        im.save(temporary,format='WEBP',quality=95,method=4)
        temporary.replace(out/(key+'.webp'))
        result[key]={'w':round(im.width/scale/diameter*inches,4),'h':round(im.height/scale/diameter*inches,4),
                     'ax':round((x-l)/im.width,5),'ay':round(1-(y-t)/im.height,5)}
    return result

if __name__=='__main__':
    out=Path(argv[4]);out.mkdir(parents=True,exist_ok=True)
    metadata={}
    for path,items in zip(argv[1:4],(marines,orks,terrain)):metadata.update(extract(path,items,out))
    (out/'frames.json').write_text(json.dumps(metadata,indent=1),encoding='utf-8')
    print(len(metadata),'painted pieces')
