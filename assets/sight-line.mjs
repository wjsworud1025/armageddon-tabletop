import * as T from '../vendor/three.module.min.js';

// A 1 mm line is a finite cylinder between the two selected surfaces.
const radius=.5/25.4, eps=1e-9;
function clipFace(poly,z,above){
  const out=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];
    const keep=above?a.z>=z:a.z<=z,next=above?b.z>=z:b.z<=z;
    if(keep)out.push(a);
    if(keep!==next)out.push(a.clone().lerp(b,(z-a.z)/(b.z-a.z)));
  }
  return out;
}
function touchesDisk(poly){
  let area=0,positive=false,negative=false;
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],dx=b.x-a.x,dy=b.y-a.y;
    const t=T.MathUtils.clamp(-(a.x*dx+a.y*dy)/(dx*dx+dy*dy||1),0,1);
    if((a.x+t*dx)**2+(a.y+t*dy)**2<=radius**2+eps)return true;
    const cross=a.x*b.y-a.y*b.x;area+=cross;
    if(cross>eps)positive=true;if(cross< -eps)negative=true;
  }
  return Math.abs(area)>eps&&!(positive&&negative);
}

// Each root is a tabletop piece after excluding the two endpoint units.
// Return all obstructions. The order of pieces is independent of depth.
export function sightObstructions(from,to,roots){
  const along=new T.Vector3().subVectors(to,from),length=along.length();
  if(length<=eps)throw Error('서로 다른 표면점을 선택하세요.');
  along.divideScalar(length);
  const side=new T.Vector3().crossVectors(along,Math.abs(along.y)<.9?new T.Vector3(0,1,0):new T.Vector3(1,0,0)).normalize();
  const up=new T.Vector3().crossVectors(along,side);
  const local=new T.Matrix4().makeBasis(side,up,along).setPosition(from).invert();
  const segment=new T.Box3().setFromPoints([from,to]).expandByScalar(radius),blocked=[];
  for(const root of roots){
    root.updateWorldMatrix(true,true);
    if(!segment.intersectsBox(new T.Box3().setFromObject(root)))continue;
    let hit=false;
    root.traverse(mesh=>{
      if(hit||!mesh.isMesh)return;
      const geometry=mesh.geometry;
      const matrix=new T.Matrix4().multiplyMatrices(local,mesh.matrixWorld);
      if(!geometry.boundingBox)geometry.computeBoundingBox();
      const box=geometry.boundingBox.clone().applyMatrix4(matrix);
      if(box.min.x>radius||box.max.x< -radius||box.min.y>radius||box.max.y< -radius||box.min.z>length||box.max.z<0)return;
      const positions=geometry.attributes.position,index=geometry.index,verts=[];
      for(let i=0;i<positions.count;i++)verts.push(new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(matrix));
      for(let i=0;i<(index?.count??positions.count);i+=3){
        const a=verts[index?index.getX(i):i],b=verts[index?index.getX(i+1):i+1],c=verts[index?index.getX(i+2):i+2];
        if(Math.min(a.x,b.x,c.x)>radius||Math.max(a.x,b.x,c.x)< -radius||
           Math.min(a.y,b.y,c.y)>radius||Math.max(a.y,b.y,c.y)< -radius||
           Math.min(a.z,b.z,c.z)>length||Math.max(a.z,b.z,c.z)<0)continue;
        let face=[a,b,c];
        if(Math.min(a.z,b.z,c.z)<0)face=clipFace(face,0,true);
        if(Math.max(a.z,b.z,c.z)>length)face=clipFace(face,length,false);
        if(touchesDisk(face)){hit=true;break;}
      }
    });
    if(hit)blocked.push(root.userData.pieceId);
  }
  return blocked;
}
