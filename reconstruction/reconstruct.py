"""Fit and carve a physical miniature from calibrated, white-background turntable photographs.

Offsets, voxel spacing and reconstructed positions use the printed base diameter as one unit.
Runtime meshes are converted to inches on export. Only numpy and Pillow are required.
"""
import argparse
import json
import math
import struct
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


HELD_OUT = ('01-03', '02-07', '03-11')


@dataclass
class Camera:
    rgb: np.ndarray
    mask: np.ndarray
    eye: np.ndarray
    right: np.ndarray
    down: np.ndarray
    center: np.ndarray
    scale: float
    tag: str
    distance: float

    def project(self, points):
        # Explicit sums avoid dispatching dozens of small products to threaded BLAS.
        def dot(axis):
            return points[:, 0]*axis[0] + points[:, 1]*axis[1] + points[:, 2]*axis[2]
        depth = dot(self.eye)
        scale = self.scale/(1-depth/self.distance)
        return (self.center[0]+scale*dot(self.right), self.center[1]+scale*dot(self.down), depth)


def base_rim(mask):
    """Fit the lower half of the plinth's outer ellipse from contiguous foreground runs."""
    height, width = mask.shape
    yy, xx = np.nonzero(mask)
    bottom = yy.max()
    origin = np.median(xx[yy >= bottom-2])
    widths, centers, rows = [], [], []
    for dy in range(1, height//3):
        run = np.flatnonzero(mask[bottom-dy])
        groups = np.split(run, np.flatnonzero(np.diff(run)>1)+1)
        near = [g for g in groups if len(g) and g[0] <= origin+3 and g[-1] >= origin-3]
        if not near:
            break
        run = max(near, key=len)
        radius = (run[-1]-run[0]+1)/2
        center = (run[-1]+run[0])/2
        if len(widths)>5 and (radius<max(widths)-2 or abs(center-origin)>max(4, radius*.05)):
            break
        widths.append(radius)
        centers.append(center)
        rows.append(dy)
    if len(rows)<5:
        raise ValueError('plinth bottom is occluded')
    dx = np.array(rows,dtype=float)
    w = np.array(widths)
    # Fit h(dy)=rx*sqrt(1-(1-dy/ry)^2). Permit up to one pixel of subpixel offset.
    best = None
    for subpixel in [0,.25,.5,.75,1]:
        d = dx+subpixel
        for ry in np.linspace(max(2, dx[-1]*.65), min(width*.4, max(8,dx[-1]*1.9)), 65):
            valid = d <= ry*1.08
            if valid.sum()<5:
                continue
            unit = np.sqrt(np.maximum(1e-6, 1-(1-d[valid]/ry)**2))
            rx = np.median(w[valid]/unit)
            err = np.mean(np.minimum(5,np.abs(unit*rx-w[valid]))) + max(0, .92*w.max()-rx)
            if best is None or err < best[0]:
                best = err, rx, ry, bottom+subpixel-ry
    if best is None:
        raise ValueError('ellipse fit failed')
    return np.array([np.median(centers), best[3], best[1], best[2]])


def cameras(folder, limit, distance, clockwise, ellipse, footprint=False, excluded=()):
    records = []
    calibration = json.loads(ellipse.read_text()) if ellipse else {}
    for path in sorted(folder.glob('*-*.*')):
        try:
            ring, frame = map(int,path.stem.split('-'))
        except ValueError:
            continue
        if path.suffix.lower() not in ('.jpg','.jpeg','.webp','.png'):
            continue
        image = Image.open(path).convert('RGB')
        if image.width!=image.height:
            side=max(image.size)
            padded=Image.new('RGB',(side,side),'white')
            padded.paste(image,((side-image.width)//2,(side-image.height)//2))
            image=padded
        image.thumbnail((limit,limit),Image.Resampling.LANCZOS)
        rgb = np.asarray(image)
        mask = rgb.min(2)<239
        if path.stem in calibration:
            cx,cy,rx,ry=calibration[path.stem]
            fit=np.array([cx,cy,rx,ry])*rgb.shape[1]
        elif not footprint:
            try:
                fit=base_rim(mask)
            except ValueError:
                fit=np.full(4,np.nan)
        else:
            fit=np.full(4,np.nan)
        records.append((ring,frame,rgb,mask,fit))
    views=[]
    for ring in sorted({r[0] for r in records}):
        group=[r for r in records if r[0]==ring]
        rims = np.array([g[-1] for g in group])
        if footprint:
            boxes=[]
            for _,_,_,mask,_ in group:
                yy,xx=np.nonzero(mask)
                boxes.append([xx.min(),xx.max(),yy.min(),yy.max()])
            boxes=np.array(boxes)
            retained=np.array([f'{ring:02}-{g[1]:02}' not in excluded for g in group])
            pitches={1:8,2:32,3:61}
            sine=np.sin(np.radians(pitches[ring]))
            widths=boxes[:,1]-boxes[:,0]
            span=np.median(widths[retained])
            cx=np.median(((boxes[:,1]+boxes[:,0])/2)[retained])
            front=np.roll(boxes[:,1]-cx,3)
            cy=np.median((boxes[:,3]-sine*front)[retained & np.roll(retained,3)])
            rims[:]=[cx,cy,span/2,span*sine/2]
        rx = np.nanmedian(rims[:,2])
        sine = np.nanmedian(rims[:,3]/rims[:,2])
        if not (0.015<sine<1.1 and rx>10):
            raise ValueError(f'pitch or diameter could not be fitted for ring {ring}')
        pitch = np.arcsin(min(.985,sine))
        for pos,(_,frame,rgb,mask,fit) in enumerate(group):
            if footprint:
                fit=rims[pos]
            # A sword that eclipses the plinth casts an outlying lower silhouette.
            # The centre of rotation is otherwise stable over each elevation.
            typical=np.nanmedian(rims,axis=0)
            if (not np.isfinite(fit).all() or abs(fit[2]-rx)>rx*.1
                    or abs(fit[3]-rx*sine)>rx*.10 or abs(fit[1]-typical[1])>rx*.27):
                fit=typical
            yaw = (frame-1)*math.tau/12*clockwise
            horizontal=np.array([np.sin(yaw),0,np.cos(yaw)])
            right=np.array([np.cos(yaw),0,-np.sin(yaw)])
            eye=horizontal*np.cos(pitch)+[0,np.sin(pitch),0]
            down=horizontal*np.sin(pitch)-[0,np.cos(pitch),0]
            views.append(Camera(rgb,mask,eye,right,down,fit[:2],rx*2,f'{ring:02}-{frame:02}',distance))
    return views


def carving_mask(mask, apertures):
    if apertures is None:
        return np.asarray(Image.fromarray(mask.astype('u1')).filter(ImageFilter.MaxFilter(3)))
    # Preserve the exterior edge. Give enclosed white gaps their own antialiasing
    # margin so a subpixel hole does not become a solid voxel at grazing angles.
    if apertures == 0:
        return mask
    from scipy import ndimage
    holes = ndimage.binary_fill_holes(mask) & ~mask
    return mask & ~ndimage.binary_dilation(holes, iterations=apertures)


def apply_lens(views, fitted):
    if 'cameras' in fitted:
        fitted={c.tag:{**v,'center':[v['cx'],v['cy']]} for c,v in zip(views,fitted['cameras'])}
    for c in views:
        f=fitted[c.tag];w=c.rgb.shape[1]
        c.center=np.asarray(f['center'])*w;c.scale=f['scale']*w;c.distance=f['distance']
        c.eye=np.asarray(f['eye']);c.right=np.asarray(f['right']);c.down=np.asarray(f['down'])


def carve(views,density,allow,limits,apertures=None):
    start=np.array([-limits, -.24, -limits])
    stop=np.array([limits, 2.5, limits])
    step=1/density
    shape=(np.ceil((stop-start)/step).astype(int)+1).tolist()
    grid=np.moveaxis(np.indices(shape,dtype=np.float32),0,-1).reshape(-1,3)
    xyz=(start+grid*step).astype('f4')
    votes=np.zeros(len(xyz),'u1')
    for camera in views:
        indices=np.flatnonzero(votes<=allow)
        u,v,_=camera.project(xyz[indices])
        x=u.round().astype(int)
        y=v.round().astype(int)
        h,w=camera.mask.shape
        outside=(x<0)|(y<0)|(x>=w)|(y>=h)
        # One pixel of calibration tolerance preserves subpixel silver blades and trophy spikes.
        expanded=carving_mask(camera.mask,apertures)
        votes[indices]+=outside | (expanded[np.clip(y,0,h-1),np.clip(x,0,w-1)]==0)
    inside=(votes<=allow).reshape(shape)
    inside[:,0,:]=False
    inside[:, :, [0,-1]]=False
    inside[[0,-1], :, :]=False
    inside[:,-1,:]=False
    return inside,start,step


def surface_nets(inside,start,step):
    offsets=np.array([[a,b,c] for a in (0,1) for b in (0,1) for c in (0,1)])
    corners=np.stack([inside[a:a+inside.shape[0]-1,b:b+inside.shape[1]-1,c:c+inside.shape[2]-1]
                      for a,b,c in offsets],axis=-1)
    active=(corners.any(3)&~corners.all(3))
    coord=np.array(np.nonzero(active)).T
    signs=corners[active]
    sums=np.zeros((len(coord),3)); counts=np.zeros(len(coord))
    for i,a in enumerate(offsets):
        for j,b in enumerate(offsets[i+1:],i+1):
            if np.abs(a-b).sum()!=1:
                continue
            changed=signs[:,i]!=signs[:,j]
            sums[changed]+=(a+b)/2
            counts[changed]+=1
    vertices=((coord+sums/counts[:,None])*step+start).astype('f4')
    ids=np.full(active.shape,-1,dtype='i4')
    ids[active]=np.arange(len(coord))
    polygons=[]
    for axis in range(3):
        a,b=(axis+1)%3,(axis+2)%3
        origin=np.array(np.nonzero(np.diff(inside.astype('i1'),axis=axis))).T
        e1=np.eye(3,dtype=int)[a];e2=np.eye(3,dtype=int)[b]
        quads=np.stack([ids[tuple((origin-offset).T)] for offset in (e1+e2,e2,np.zeros(3,int),e1)],axis=1)
        flip=~inside[tuple(origin.T)]
        quads[flip]=quads[flip,::-1]
        polygons.extend([quads[:,[0,1,2]],quads[:,[0,2,3]]])
    faces=np.concatenate(polygons).astype('u4')
    if np.any(faces>=len(vertices)):
        raise ValueError('carved surface hits the sampling boundary')
    return vertices,faces


def color_vertices(vertices,faces,views,step):
    normals=np.zeros_like(vertices)
    p=vertices[faces]
    fn=np.cross(p[:,1]-p[:,0],p[:,2]-p[:,0])
    for i in range(3):
        np.add.at(normals,faces[:,i],fn)
    normals/=np.maximum(1e-9,np.linalg.norm(normals,axis=1)[:,None])
    total=np.zeros_like(vertices); weight=np.zeros(len(vertices))
    for view in views:
        u,v,z=view.project(vertices)
        h,w=view.mask.shape
        x=np.clip(u.round().astype(int),0,w-1);y=np.clip(v.round().astype(int),0,h-1)
        # Visibility buffer sampled near one cell per voxel. Keep front-facing observations.
        px=max(1,step*view.scale*.85)
        bx=np.floor(u/px).astype(int);by=np.floor(v/px).astype(int)
        bx-=bx.min();by-=by.min()
        zb=np.full((by.max()+1,bx.max()+1),-10,dtype='f4')
        np.maximum.at(zb,(by,bx),z)
        depth=np.pad(zb,1,constant_values=-10)
        front=np.maximum.reduce([depth[by+dy,bx+dx] for dx in range(3) for dy in range(3)])
        facing=np.maximum(.015,np.sum(normals*view.eye[None,:],axis=1))
        importance=facing**6 * np.exp(-np.maximum(0,front-z-step*1.6)/(step*.7))
        importance*=np.where(view.mask[y,x],1,.0001)
        total+=view.rgb[y,x]*importance[:,None];weight+=importance
    color=total/np.maximum(1e-22,weight[:,None])
    return np.rint(np.clip(color,0,255)).astype('u1')


def profile_metrics(rendered, target):
    from scipy import ndimage
    def substantial(mask):
        labels, _ = ndimage.label(mask)
        keep = np.bincount(labels.ravel()) >= 12
        keep[0] = False
        return keep[labels]
    def span(mask):
        ys, xs = np.where(substantial(mask))
        return np.array([np.ptp(xs), np.ptp(ys)])
    holes = substantial(ndimage.binary_fill_holes(target) & ~target)
    recall = 1 - rendered[holes].mean() if holes.any() else None
    return dict(projectedExtentRatio=(span(rendered)/span(target)).round(3).tolist(),
                enclosedWhitePixels=int(holes.sum()), enclosedWhiteRecall=round(float(recall),3) if recall is not None else None)


def preview(vertices,faces,colors,view,size=240,profile=None):
    u,v,z=view.project(vertices)
    factor=size/view.rgb.shape[1]
    xy=np.stack((u,v),axis=1)*factor
    triangles=xy[faces].round().astype(int)
    rgb=colors[faces].mean(1).astype('u1')
    image=Image.new('RGB',(size,size),'white')
    mask=Image.new('1',(size,size))
    draw=ImageDraw.Draw(image);md=ImageDraw.Draw(mask)
    for i in np.argsort(z[faces].mean(1)):
        pts=triangles[i].reshape(-1).tolist()
        draw.polygon(pts,fill=tuple(rgb[i]));md.polygon(pts,fill=1)
    reference=Image.fromarray(view.rgb).resize((size,size),Image.Resampling.LANCZOS)
    target=np.asarray(Image.fromarray(view.mask).resize((size,size),Image.Resampling.NEAREST))
    rendered=np.asarray(mask)
    if profile is not None:
        profile.update(profile_metrics(rendered,target))
    iou=np.sum(rendered & target)/np.sum(rendered | target)
    loss=np.abs(np.asarray(image,dtype=float)-np.asarray(reference,dtype=float)).mean(2)
    return reference,image,float(iou),float(loss[rendered & target].mean())


def write_mesh(path,vs,faces,colors):
    # A base diameter is 1 unit in the portable mesh. Positions retain <0.005 mm precision.
    positions=np.rint(vs*12000).astype('<i2')
    wide=vs.shape[0]>65535
    with path.open('wb') as out:
        out.write(struct.pack('<4sIII',b'WHM2',len(vs),len(faces)*3,int(wide)))
        out.write(positions.tobytes());out.write(colors.tobytes())
        out.write(bytes((-out.tell())%4));out.write(faces.astype('<u4' if wide else '<u2').tobytes())


def registration(vertices,base,depth,width=None):
    ground=float(np.percentile(vertices[:,1],.2))
    foot=vertices[vertices[:,1]<ground+.055][:,[0,2]]
    if len(foot)<20:
        raise ValueError('could not recover the ground footprint')
    angles=np.linspace(-np.pi/2,np.pi/2,181)
    spans=[]
    for a in angles:
        projection=foot[:,0]*np.sin(a)+foot[:,1]*np.cos(a)
        spans.append(np.ptp(projection))
    angle=angles[np.argmax(spans)] if depth else 0
    if width:
        # Rectangular scatter terrain uses the longest edge of its minimum-area
        # footprint rectangle, unlike oval vehicle bases which use a major axis.
        foot=vertices[:,[0,2]]
        boxes=[]
        for a in angles:
            major=np.array([np.sin(a),np.cos(a)]);minor=np.array([np.cos(a),-np.sin(a)])
            spans=(np.ptp(foot@major),np.ptp(foot@minor))
            if spans[0]>=spans[1]:
                boxes.append((spans[0]*spans[1],a))
        angle=min(boxes)[1]
    long=np.array([np.sin(angle),np.cos(angle)])
    across=np.array([np.cos(angle),-np.sin(angle)])
    projected=foot@np.array([long,across]).T
    low,high=projected.min(0),projected.max(0)
    pivot=((low+high)/2)@np.array([long,across])
    extent=(high-low).tolist()
    inches=(depth or width)/extent[0] if (depth or width) else base
    return {'inches':inches,'center':[float(pivot[0]),ground,float(pivot[1])],
            'yaw':float(-angle+np.pi/2) if width else float(-angle) if depth else None,'groundSpan':extent}


def run(args):
    started=time.perf_counter()
    views=cameras(args.frames,args.image_size,args.distance,args.direction,args.calibration,args.footprint)
    if args.lens:
        apply_lens(views,json.loads(args.lens.read_text()))
    if len(views)!=36:
        raise ValueError(f'expected 36 photographs and found {len(views)}')
    held=[v for v in views if v.tag in args.holdout]
    if len(held) != len(args.holdout) or len(held) >= len(views):
        raise ValueError('expected unique, existing held-out frame names and at least one training frame')
    train=[v for v in views if v.tag not in {h.tag for h in held}]
    def build(frames):
        inside,start,step=carve(frames,args.density,args.allow,args.extent,args.apertures)
        if not args.footprint or args.depth:
            # All studio cameras look down on the plinth. Their silhouette intersection
            # continues below it as a cone; terminate it at the calibrated ground plane.
            inside[:,np.arange(inside.shape[1])*step+start[1]<0,:]=False
        vs,faces=surface_nets(inside,start,step)
        return vs,faces,color_vertices(vs,faces,frames,step)
    vertices,faces,colors=build(train)
    comparison=Image.new('RGB',(len(held)*240,480),'white')
    metrics=[]
    for i,cam in enumerate(held):
        reference,render,iou,error=preview(vertices,faces,colors,cam)
        comparison.paste(reference,(i*240,0));comparison.paste(render,(i*240,240))
        metrics.append(dict(frame=cam.tag,silhouetteIoU=round(iou,3),meanColorError=round(error,2)))
        if args.audit_profile:
            preview(vertices,faces,colors,cam,size=480,profile=metrics[-1])
    comparison.save(args.comparison)
    if args.output:
        vertices,faces,colors=build(views)
        temporary=args.output.with_suffix('.part')
        write_mesh(temporary,vertices,faces,colors)
        temporary.replace(args.output)
        lens=[{'eye':c.eye.round(6).tolist(),'right':c.right.round(6).tolist(),'down':c.down.round(6).tolist(),
               'cx':round(c.center[0]/c.rgb.shape[1],6),'cy':round(c.center[1]/c.rgb.shape[0],6),
               'scale':round(c.scale/c.rgb.shape[1],6),'distance':round(c.distance,5)} for c in views]
        placement=registration(vertices,args.inches,args.depth,args.width)
        metadata=args.output.with_suffix('.json')
        temporary=metadata.with_suffix('.json.part')
        temporary.write_text(json.dumps({'cameras':lens,'distance':args.distance,**placement,
            'validation':metrics},separators=(',',':')))
        temporary.replace(metadata)
    print(json.dumps(dict(views=len(views),vertices=len(vertices),triangles=len(faces),validation=metrics,
        seconds=round(time.perf_counter()-started,2))))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('frames',type=Path)
    parser.add_argument('--comparison',required=True,type=Path)
    parser.add_argument('--output',type=Path)
    parser.add_argument('--inches',type=float,required=True)
    parser.add_argument('--depth',type=float,help='Fit the measured longer diameter of a vehicle base, in inches')
    parser.add_argument('--width',type=float,help='Fit terrain width along the board-local X axis, in inches')
    parser.add_argument('--density',type=float,default=64)
    parser.add_argument('--image-size',type=int,default=560)
    parser.add_argument('--allow',type=int,default=2)
    parser.add_argument('--holdout',nargs='+',default=HELD_OUT,help='Frame names excluded from validation geometry and color')
    parser.add_argument('--apertures',type=int,choices=range(4),help='Keep the exterior contour and expand enclosed white gaps by this many image pixels (requires SciPy)')
    parser.add_argument('--audit-profile',action='store_true',help='Measure projected extents and enclosed background at 480 pixels (requires SciPy)')
    parser.add_argument('--extent',type=float,default=1.5)
    parser.add_argument('--direction',type=int,choices=[-1,1],default=1)
    parser.add_argument('--distance',type=float,default=22)
    parser.add_argument('--calibration',type=Path,help='Per-frame [cx,cy,rx,ry] in image-width fractions')
    parser.add_argument('--footprint',action='store_true',help='Estimate calibration for terrain or oval bases from opposite-angle profiles')
    parser.add_argument('--lens',type=Path,help='Normalized projection calibration from calibrate.py')
    run(parser.parse_args())
