import {photoFrame} from './data/catalog.mjs';

export function photoFit(w,h){
  const [nw,ne,se,sw]=photoFrame.corners;
  return {px:Math.min(w*.94/1840,h*.78/650),uMid:(nw[0]+se[0])/2,vMid:(ne[1]+sw[1])/2-35};
}

// Planar calibration. The four board corners determine the exact projection on
// the ground. Infer vertical scale from perpendicular vanishing directions.
export function photoCamera(T,width,depth){
  const [[u0,v0],[u1,v1],[u2,v2],[u3,v3]]=photoFrame.corners;
  const du1=u1-u2,du2=u3-u2,dv1=v1-v2,dv2=v3-v2;
  const su=u0-u1+u2-u3,sv=v0-v1+v2-v3,det=du1*dv2-du2*dv1;
  const g=(su*dv2-du2*sv)/det,h=(du1*sv-su*dv1)/det;
  const x=new T.Vector3(u1-u0+g*u1,v1-v0+g*v1,g);
  const z=new T.Vector3(u3-u0+h*u3,v3-v0+h*v3,h);
  const origin=new T.Vector3(u0,v0,1).addScaledVector(x,.5).addScaledVector(z,.5);
  x.multiplyScalar(1/width);z.multiplyScalar(1/depth);
  const cx=photoFrame.width/2,cy=photoFrame.height*.68;
  const focal=Math.sqrt(-((x.x/x.z-cx)*(z.x/z.z-cx)+(x.y/x.z-cy)*(z.y/z.z-cy)));
  const unproject=p=>new T.Vector3((p.x-cx*p.z)/focal,(p.y-cy*p.z)/focal,p.z);
  const X=unproject(x),Z=unproject(z),O=unproject(origin);
  const Y=Z.clone().cross(X).normalize().multiplyScalar(Math.sqrt(X.length()*Z.length()));
  const y=new T.Vector3(Y.x*focal+cx*Y.z,Y.y*focal+cy*Y.z,Y.z);
  const basis=new T.Matrix3().set(X.x,Y.x,Z.x,X.y,Y.y,Z.y,X.z,Y.z,Z.z);
  const camera=new T.PerspectiveCamera();
  camera.position.copy(O).applyMatrix3(basis.invert()).negate();camera.lookAt(0,0,0);camera.updateMatrixWorld();
  function fit(w,h,zoom=1,offsetX=0,offsetY=0){
    const base=photoFit(w,h),px=base.px*zoom,uMid=base.uMid-offsetX/px,vMid=base.vMid-offsetY/px;
    const row=(axis,mid,factor)=>[x,y,z,origin].map(v=>(v[axis]-mid*v.z)*factor);
    const rx=row('x',uMid,2*px/w),ry=row('y',vMid,-2*px/h);
    const rw=[x.z,y.z,z.z,origin.z],rz=rw.map(n=>n*1.01);rz[3]-=.17;
    const worldToClip=new T.Matrix4().set(...rx,...ry,...rz,...rw);
    camera.projectionMatrix.multiplyMatrices(worldToClip,camera.matrixWorld);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
  function frame(w,h,bounds){
    fit(w,h);
    const view=bounds.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    // Keep the entire model between the stage header and the measurement tools.
    const zoom=T.MathUtils.clamp(1.48/Math.max(view.max.x-view.min.x,view.max.y-view.min.y),.55,12);
    const center=view.getCenter(new T.Vector3());
    return {zoom,offsetX:-center.x*w*zoom/2,offsetY:center.y*h*zoom/2};
  }
  return {camera,fit,frame};
}
