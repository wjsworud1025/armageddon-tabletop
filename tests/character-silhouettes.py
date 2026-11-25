"""Compare the four original character meshes with 30 unseen views each.

Run from the repository with a local copy of the manufacturer's 800px studio
turntables: python tests/character-silhouettes.py PATH/TO/wh-turns
An optional --baseline PATH/TO/old-checkout compares both procedurals.

Each character was drawn from views 01/01, 01/04, 01/07, 01/10, 02/01
and 03/01 only. The turntable has 12 azimuths and three sampled elevations.
A shared 35-inch camera distance and 6, 30 and 60 degree elevations are
approximations. Normalized silhouettes preserve the projected aspect ratio,
align at the bottom, and trim the bottom 10%. Low-camera scores also measure
absolute size and position above the plinth, anchored to the observed rim.
Neither metric measures paint detail, internal cutouts hidden by another
surface, or exact dimensions of the physical miniature.
"""
import argparse
from pathlib import Path
from runpy import run_path

import numpy as np
from PIL import Image,ImageDraw

# The two exercises share their public geometry exporter and silhouette metric.
common=run_path(str(Path(__file__).with_name('vehicle-silhouettes.py')))
# Studio group, catalog base in mm, rim width in low camera pixels, centre,
# and the height coordinate of the captured rim at its maximum width.
HEROES={
    'captain':(1,40,308,386.5,643),
    'librarian':(2,40,303,389.3,591.3),
    'warboss':(6,50,351,398,688),
    'weirdboy':(8,50,435,390,648),
}


def silhouette(mesh,survey,row,col):
    _,mm,rim,cx,base_y=survey
    theta=np.radians(30*col)
    pitch=np.radians([6,30,60][row])
    right=np.array([np.cos(theta),0,-np.sin(theta)])
    eye=np.array([np.sin(theta)*np.cos(pitch),np.sin(pitch),np.cos(theta)*np.cos(pitch)])
    up=np.cross(eye,right)
    vertices,triangles=mesh
    magnification=rim/(mm/25.4)/(1-(vertices@eye)/35)
    center_y=base_y-[0,45,108][row]
    xy=(np.stack([cx+magnification*(vertices@right), center_y-magnification*(vertices@up)],axis=1)*.5).astype(int)
    image=Image.new('1',(400,400))
    draw=ImageDraw.Draw(image)
    for triangle in triangles:
        draw.polygon([tuple(p) for p in xy[triangle]],1)
    return np.asarray(image)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('frames',type=Path)
    parser.add_argument('--baseline',type=Path)
    args=parser.parse_args()
    for kind,survey in HEROES.items():
        group,mm,rim,_,base_y=survey
        cutoff=int((base_y-(.135+mm/25.4*.5*np.sin(np.radians(6)))*rim/(mm/25.4))*.5)
        checkouts={'current':Path(__file__).resolve().parents[1]}
        if args.baseline:checkouts['baseline']=args.baseline
        meshes={label:common['export_mesh'](root,kind) for label,root in checkouts.items()}
        normalized={key:[] for key in meshes}
        fixed={key:[] for key in meshes}
        for row in range(3):
            for col in range(12):
                if (row,col) in common['STUDIES']:continue
                filename=args.frames/f'{group:02d}'/f'{row+1:02d}-{col+1:02d}.webp'
                with Image.open(filename) as raw:
                    if raw.size!=(800,800):raise ValueError(f'Expected original 800 x 800 photo: {filename}')
                    photo=np.asarray(raw.convert('RGB').resize((400,400))).min(2)<217
                values={}
                for label,mesh in meshes.items():
                    predicted=silhouette(mesh,survey,row,col)
                    score=common['iou'](common['normalized'](photo),common['normalized'](predicted))
                    normalized[label].append(score)
                    values[label]=round(score,4)
                    if row==0:fixed[label].append(common['iou'](photo[:cutoff],predicted[:cutoff]))
                print(kind,filename.stem,values)
        print(kind,'normalized 30',{k:round(float(np.mean(v)),4) for k,v in normalized.items()},
              'fixed-scale low 8',{k:round(float(np.mean(v)),4) for k,v in fixed.items()})


if __name__=='__main__':
    main()
