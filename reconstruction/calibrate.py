"""Optional camera calibration for the offline reconstructor (OpenCV SIFT and SciPy).

Sparse photographic correspondences refine the three rigid turntable camera rings.
Held-out images are not used for matching. Final camera metadata replays with Pillow/numpy.
"""
import argparse
import json
from pathlib import Path
import cv2
import numpy as np
from scipy.optimize import least_squares
from reconstruct import HELD_OUT, apply_lens, cameras, carve, surface_nets


def matrices(params):
    """Projection relative to a ground origin; principal point near the image centre."""
    group=np.repeat(params,12,axis=0)
    cx,cy,s,pitch,yaw,roll,dist=group.T
    yaw=yaw+np.tile(np.arange(12)*np.pi/6,len(params))
    sy,cyaw=np.sin(yaw),np.cos(yaw)
    sp,cp=np.sin(pitch),np.cos(pitch)
    eye=np.stack((sy*cp,sp,cyaw*cp),axis=1)
    right=np.stack((cyaw,0*cyaw,-sy),axis=1)
    down=np.stack((sy*sp,-cp,cyaw*sp),axis=1)
    c,sn=np.cos(roll)[:,None],np.sin(roll)[:,None]
    right,down=c*right+sn*down,c*down-sn*right
    right+=((cx-.5)/(dist*s))[:,None]*eye
    down+=((cy-.5)/(dist*s))[:,None]*eye
    e=-eye/dist[:,None]
    def homogeneous(m,t):
        return np.concatenate([m,t[:,None]],1)
    proj=np.stack((homogeneous(s[:,None]*right+cx[:,None]*e,cx),
        homogeneous(s[:,None]*down+cy[:,None]*e,cy),homogeneous(e,dist*0+1)),1)
    # Right/down above are the two local numerators for each camera's rational projection.
    return proj,eye,right,down


def feature_pairs(views, held_out=HELD_OUT):
    sift=cv2.SIFT_create(nfeatures=1100)
    matcher=cv2.BFMatcher(cv2.NORM_L2)
    features=[]
    for v in views:
        gray=cv2.cvtColor(v.rgb,cv2.COLOR_RGB2GRAY)
        key,desc=sift.detectAndCompute(gray,v.mask.astype('u1')*255)
        features.append((np.array([k.pt for k in key]),desc))
    indices=[];first=[];second=[]
    skip=set(held_out)
    for a in range(36):
        neighbors=[a//12*12+(a+1)%12]
        if a<24:
            neighbors+=[a+12,a//12*12+12+(a+1)%12,a//12*12+12+(a-1)%12]
        for b in neighbors:
            if views[a].tag in skip or views[b].tag in skip:
                continue
            p,des=features[a];q,target=features[b]
            raw=matcher.knnMatch(des,target,k=2)
            matched=[x for x,y in raw if x.distance<.77*y.distance]
            if len(matched)<12:
                continue
            pts1=np.array([p[m.queryIdx] for m in matched])
            pts2=np.array([q[m.trainIdx] for m in matched])
            _,good=cv2.findFundamentalMat(pts1,pts2,cv2.FM_RANSAC,.8,.99)
            if good is None or good.sum()<10:
                continue
            kept=np.flatnonzero(good.ravel())[:70]
            edge=len(indices);indices.append((a,b))
            scale=views[a].rgb.shape[1]
            first.extend((edge,*v,1) for v in pts1[kept]/scale)
            second.extend((edge,*v,1) for v in pts2[kept]/scale)
    return np.array(indices),np.array(first),np.array(second)


def fit(views, held_out=HELD_OUT):
    edges,first,second=feature_pairs(views, held_out)
    pairs=first[:,0].astype(int);pts1=first[:,1:];pts2=second[:,1:]
    a,b=edges.T
    initial=[]
    for i in range(3):
        ring=views[i*12:i*12+12];v=ring[0];width=v.rgb.shape[1]
        cx,cy=np.median([v.center for v in ring],axis=0)/width
        initial.append([cx,cy,v.scale/width,np.arcsin(v.eye[1]),0,0,15])
    initial=np.array(initial)
    def residual(x):
        x=x.reshape(3,7)
        P,_,_,_=matrices(x)
        u,s,v=np.linalg.svd(P)
        centers=v[:,-1,:]
        ep=np.einsum('eij,ej->ei',P[b],centers[a])
        skew=np.zeros((len(a),3,3));ex,ey,ez=ep.T
        skew[:,0,1]=-ez;skew[:,1,0]=ez;skew[:,0,2]=ey;skew[:,2,0]=-ey;skew[:,1,2]=-ex;skew[:,2,1]=ex
        F=skew@P[b]@np.linalg.pinv(P)[a]
        line2=np.einsum('pij,pj->pi',F[pairs],pts1)
        line1=np.einsum('pji,pj->pi',F[pairs],pts2)
        err=(line2*pts2).sum(1)/np.maximum(1e-9,np.sqrt((line2[:,:2]**2+line1[:,:2]**2).sum(1)))
        # Ground origin, orientation and scale gauges. Keep weakly observed distortion plausible.
        prior=(x-initial)/np.array([[.02,.012,.004,.25,.002,.10,20],[.15,.12,.15,.25,.15,.10,20],[.15,.12,.15,.25,.15,.10,20]])
        # Independent plinth fits across the studio establish three repeatable elevations.
        # This prevents a sparsely textured, symmetric machine from producing an arbitrary camera.
        inclination=(x[:,3]-np.radians([6,30,60]))/np.radians(2)
        focalConsistency=np.diff(np.log(x[:,6]))/.20
        return np.concatenate([512*err,prior.ravel(),inclination,focalConsistency])
    lower=np.tile([.10,.20,.10,-.05,-.20,-.07,4],(3,1))
    upper=np.tile([.90,1.15,1.40,1.42,.20,.07,90],(3,1))
    x=np.clip(initial,lower+.001,upper-.001)
    result=least_squares(residual,x.ravel(),bounds=(lower.ravel(),upper.ravel()),loss='soft_l1',f_scale=.4,
        max_nfev=65,x_scale='jac')
    p=result.x.reshape(3,7)
    _,eye,right,down=matrices(p)
    settings={}
    for i,v in enumerate(views):
        cx,cy,scale,pitch,yaw,roll,dist=p[i//12]
        settings[v.tag]={'center':[cx,cy],'scale':scale,'distance':dist,
            'eye':eye[i].tolist(),'right':right[i].tolist(),'down':down[i].tolist()}
    n=len(first)
    print(json.dumps({'matches':n,'reprojectionEpipolarMedianPixels':round(float(np.median(np.abs(result.fun[:n]))),3),
        'elevationDegrees':np.degrees(p[:,3]).round(2).tolist(),'distance':p[:,6].round(1).tolist()}),flush=True)
    return settings


def align_high_ring(views, settings, held_out):
    """Recover the high camera from the two lower elevations' common exterior profile."""
    from scipy.spatial import ConvexHull
    apply_lens(views, settings)
    low = [v for v in views[:24] if v.tag not in held_out]
    inside, start, step = carve(low, 58, 0, 1.35)
    vertices, _ = surface_nets(inside, start, step)
    vertices = vertices[::3]
    hull = vertices[ConvexHull(vertices).vertices]
    angles = np.linspace(0, 2*np.pi, 32, endpoint=False)
    directions = np.stack([np.cos(angles), np.sin(angles)])
    targets = {}
    for i, view in enumerate(views[24:]):
        if view.tag in held_out:
            continue
        contours, _ = cv2.findContours(view.mask.astype('u1'), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        points = np.concatenate([c.reshape(-1, 2) for c in contours if cv2.contourArea(c) > 6])
        targets[i] = (points @ directions).max(axis=0)
    view = views[24]
    size = view.rgb.shape[1]
    initial = np.array([*(view.center/size), view.scale/size, np.arcsin(view.eye[1]),
                        np.arctan2(view.eye[0], view.eye[2]), 0, view.distance])
    def residual(x):
        _, eyes, rights, downs = matrices(x[None, :])
        errors = []
        for i, expected in targets.items():
            scale = x[2] / (1 - (hull @ eyes[i]) / x[6])
            uv = (x[:2] + scale[:, None] * (hull @ np.stack([rights[i], downs[i]]).T)) * size
            errors.extend((uv @ directions).max(axis=0) - expected)
        return np.r_[errors, (x-initial)/[.08, .15, .12, .2, .08, .05, 10]]
    bounds = ([.2,.3,.15,.6,-.28,-.12,5], [.8,1.15,1.2,1.45,.28,.12,90])
    x = least_squares(residual, np.clip(initial, *bounds), bounds=bounds, loss='soft_l1', f_scale=2).x
    _, eyes, rights, downs = matrices(x[None, :])
    for i, view in enumerate(views[24:]):
        settings[view.tag] = dict(center=x[:2].tolist(), scale=x[2], distance=x[6],
                                  eye=eyes[i].tolist(), right=rights[i].tolist(), down=downs[i].tolist())
    return settings


if __name__=='__main__':
    arg=argparse.ArgumentParser(description=__doc__)
    arg.add_argument('frames',type=Path);arg.add_argument('out',type=Path);arg.add_argument('--footprint',action='store_true')
    arg.add_argument('--align-high',action='store_true',help='Fit the highest terrain camera to the low and middle silhouettes')
    arg.add_argument('--holdout',nargs='+',default=HELD_OUT)
    args=arg.parse_args()
    if args.align_high and not args.footprint:
        arg.error('--align-high requires --footprint')
    cv2.setNumThreads(2)
    excluded = args.holdout if args.align_high or args.holdout != HELD_OUT else ()
    views=cameras(args.frames,600,15,1,None,args.footprint,excluded=excluded)
    settings=fit(views,args.holdout)
    if args.align_high:
        settings=align_high_ring(views,settings,args.holdout)
    args.out.write_text(json.dumps(settings,separators=(',',':')))
