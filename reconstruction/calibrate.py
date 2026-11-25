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
from reconstruct import cameras


def matrices(params):
    """Projection relative to a ground origin; principal point near the image centre."""
    group=np.repeat(params,12,axis=0)
    cx,cy,s,pitch,yaw,roll,dist=group.T
    yaw=yaw+np.tile(np.arange(12)*np.pi/6,3)
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


def feature_pairs(views):
    sift=cv2.SIFT_create(nfeatures=1100)
    matcher=cv2.BFMatcher(cv2.NORM_L2)
    features=[]
    for v in views:
        gray=cv2.cvtColor(v.rgb,cv2.COLOR_RGB2GRAY)
        key,desc=sift.detectAndCompute(gray,v.mask.astype('u1')*255)
        features.append((np.array([k.pt for k in key]),desc))
    indices=[];first=[];second=[]
    skip={'01-03','02-07','03-11'}
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


def fit(views):
    edges,first,second=feature_pairs(views)
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


if __name__=='__main__':
    arg=argparse.ArgumentParser(description=__doc__)
    arg.add_argument('frames',type=Path);arg.add_argument('out',type=Path);arg.add_argument('--footprint',action='store_true')
    args=arg.parse_args()
    cv2.setNumThreads(2)
    views=cameras(args.frames,600,15,1,None,args.footprint)
    args.out.write_text(json.dumps(fit(views),separators=(',',':')))
