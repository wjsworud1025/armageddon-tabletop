"""Optional 30-view registration check using a local, original studio pack.

From the table repository:
  python tests/vehicle-silhouettes.py PATH/TO/wh-turns [--baseline PATH/TO/old-checkout]
Requires Node.js, Pillow and NumPy. No photographs or geometry are written.
"""
import argparse
import base64
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image,ImageDraw


STUDIES={(0,0),(0,3),(0,6),(0,9),(1,0),(2,0)}
# Observed widths of the low-camera oval in the two orthogonal camera pairs.
VEHICLES={'landSpeeder':(5,376.5,397.5,586,564),'wartrakk':(11,410.5,465.5,581,552)}
EXPORT="""
import * as T from './vendor/three.module.min.js';
import {createTable} from './data/catalog.mjs';
import {createPiece} from './assets/pieces.mjs';
const item=createTable().pieces.find(p=>p.kind===process.argv[1]);
const g=createPiece(T,item).children[0].geometry;
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength).toString('base64');
console.log(JSON.stringify([bytes(g.attributes.position.array),bytes(Uint32Array.from(g.index.array))]));
"""


def export_mesh(checkout,kind):
    out=subprocess.run(['node','--input-type=module','-e',EXPORT,kind],cwd=checkout,
                       check=True,capture_output=True,text=True)
    vertices,faces=(base64.b64decode(v) for v in json.loads(out.stdout))
    return np.frombuffer(vertices,'<f4').reshape(-1,3),np.frombuffer(faces,'<u4').reshape(-1,3)


def calibrated_mask(mesh,kind,row,col):
    group,first,fourth,low,_=VEHICLES[kind]
    minor,major=70/25.4,105/25.4
    scale=np.hypot(first,fourth)/np.hypot(minor,major)
    phase=np.arcsin(np.sqrt(((first/scale)**2-minor**2)/(major**2-minor**2)))
    yaw=phase+np.radians(30*col)
    pitch=np.radians([6,30,60][row])
    right=np.array([np.cos(yaw),0,-np.sin(yaw)])
    eye=np.array([np.sin(yaw)*np.cos(pitch),np.sin(pitch),np.cos(yaw)*np.cos(pitch)])
    up=np.cross(eye,right)
    p,tri=mesh
    factor=scale/(1-(p@eye)/35)
    center_y=([low,563,520] if group==5 else [low,558,501])[row]
    xy=(np.stack([401+factor*(p@right),center_y-factor*(p@up)],axis=1)*.5).astype(int)
    image=Image.new('1',(400,400))
    draw=ImageDraw.Draw(image)
    for face in tri:draw.polygon([tuple(v) for v in xy[face]],1)
    return np.asarray(image)


def normalized(mask):
    silhouette=Image.fromarray(mask.astype('uint8')*255)
    box=silhouette.crop(silhouette.getbbox())
    box.thumbnail((145,145),Image.Resampling.NEAREST)
    common=Image.new('L',(155,155))
    common.paste(box,((155-box.width)//2,150-box.height))
    result=np.asarray(common)>0
    result[int(150-.10*box.height):]=False
    return result


def iou(a,b):
    return np.count_nonzero(a&b)/np.count_nonzero(a|b)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('frames',type=Path)
    parser.add_argument('--baseline',type=Path)
    args=parser.parse_args()
    root=Path(__file__).resolve().parents[1]
    for kind,(group,_,_,_,cutoff) in VEHICLES.items():
        meshes={'current':export_mesh(root,kind)}
        if args.baseline:meshes['baseline']=export_mesh(args.baseline,kind)
        all_angles={key:[] for key in meshes}
        low_angles={key:[] for key in meshes}
        for row in range(3):
            for col in range(12):
                if (row,col) in STUDIES:continue
                file=args.frames/f'{group:02d}'/f'{row+1:02d}-{col+1:02d}.webp'
                with Image.open(file) as raw:
                    if raw.size!=(800,800):raise ValueError(f'Expected original 800 × 800 frame: {file}')
                    ref=np.asarray(raw.convert('RGB').resize((400,400))).min(2)<217
                scores={}
                for stage,mesh in meshes.items():
                    pred=calibrated_mask(mesh,kind,row,col)
                    scores[stage]=iou(normalized(ref),normalized(pred))
                    all_angles[stage].append(scores[stage])
                    if row==0:low_angles[stage].append(iou(ref[:cutoff//2],pred[:cutoff//2]))
                print(kind,file.stem,{k:round(v,4) for k,v in scores.items()})
        print(kind,'normalized 30',{k:round(np.mean(v),4) for k,v in all_angles.items()},
              'fixed-scale low 8',{k:round(np.mean(v),4) for k,v in low_angles.items()})


if __name__=='__main__':
    main()
