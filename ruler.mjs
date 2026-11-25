// Support point of the footprint in a world-space direction. Empty table
// points have zero radii. Terrain uses its surveyed rectangular footprint.
function supportPoint(p,dx,dz){
  const c=Math.cos(p.yaw||0),s=Math.sin(p.yaw||0);
  const u=c*dx-s*dz,v=s*dx+c*dz,rx=(p.baseWidth??0)/2,rz=(p.baseDepth??0)/2;
  const norm=Math.hypot(rx*u,rz*v);
  let x=0,z=0;
  if(p.faction==='terrain'){
    x=Math.sign(u)*rx;z=Math.sign(v)*rz;
  }else if(norm){
    x=rx*rx*u/norm;z=rz*rz*v/norm;
  }
  return {x:p.x+c*x+s*z,z:p.z-s*x+c*z};
}

// Each vertex of the Minkowski difference keeps the two surface points
// that produced it, so the closest simplex also gives both ends of the tape.
function vertex(a,b,dx,dz){
  const left=supportPoint(a,dx,dz),right=supportPoint(b,-dx,-dz);
  return {left,right,x:left.x-right.x,z:left.z-right.z};
}
function segment(a,b){
  const dx=b.x-a.x,dz=b.z-a.z;
  const t=Math.max(0,Math.min(1,-(a.x*dx+a.z*dz)/(dx*dx+dz*dz||1)));
  if(t===0)return {vertices:[a],weights:[1],x:a.x,z:a.z};
  if(t===1)return {vertices:[b],weights:[1],x:b.x,z:b.z};
  return {vertices:[a,b],weights:[1-t,t],x:a.x+t*dx,z:a.z+t*dz};
}
const cross=(a,b)=>a.x*b.z-a.z*b.x;
function closestTriangle(a,b,c){
  const u=cross(b,c),v=cross(c,a),w=cross(a,b),area=u+v+w;
  if(Math.abs(area)>1e-16&&u/area>=0&&v/area>=0&&w/area>=0){
    return {vertices:[a,b,c],weights:[u/area,v/area,w/area],x:0,z:0};
  }
  const edges=[segment(a,b),segment(b,c),segment(c,a)];
  return edges.reduce((best,e)=>e.x*e.x+e.z*e.z<best.x*best.x+best.z*best.z?e:best);
}
export function measureFootprints(a,b){
  const first=vertex(a,b,b.x-a.x,b.z-a.z);
  let nearest={vertices:[first],weights:[1],x:first.x,z:first.z};
  for(let i=0;i<96;i++){
    const {vertices,x,z}=nearest,length=Math.hypot(x,z);
    if(length<1e-8)break;
    const next=vertex(a,b,-x,-z);
    // The support plane gives a lower bound on the true gap. Stop when it
    // agrees with the distance between the two current witnesses.
    if(length-(x*next.x+z*next.z)/length<1e-8)break;
    nearest=vertices.length===1?segment(vertices[0],next):closestTriangle(vertices[0],vertices[1],next);
  }
  const from={x:0,z:0,elevation:a.elevation??0},to={x:0,z:0,elevation:b.elevation??0};
  nearest.vertices.forEach((p,i)=>{
    const k=nearest.weights[i];
    from.x+=k*p.left.x;from.z+=k*p.left.z;
    to.x+=k*p.right.x;to.z+=k*p.right.z;
  });
  let horizontal=Math.hypot(from.x-to.x,from.z-to.z);
  if(horizontal<1e-8){
    from.x=to.x=(from.x+to.x)/2;
    from.z=to.z=(from.z+to.z)/2;
    horizontal=0;
  }
  return {from,to,horizontal,distance:Math.hypot(horizontal,from.elevation-to.elevation)};
}
