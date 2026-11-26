import * as T from '../vendor/three.module.min.js';
import {pieceGeometry} from '../assets/pieces.mjs';

// Core Rules 13.06, p.48: a non-ground surface must support the model
// stably with its entire base inside the outer edge. Of these patrols'
// models the Wartrakk is MOUNTED; the Land Speeder has FLY.
// https://assets.warhammer-community.com/eng_01-06_warhammer40k_new40k_core_rules-was6fbu1ix-hfewhmxyiy.pdf
const upperFloorKinds=new Set(['captain','librarian','intercessor','vanguard','landSpeeder','warboss','weirdboy','boy','gretchin']);
const casts=new WeakMap();
const eps=1e-7;
// Inch input rounded to two decimals and the shallow ribs on the cast metal floor.
const roundHeight=y=>Math.round(y*100)/100;
const ribDepth=.035;
const allowed={error:'',manual:''};
const fail=error=>({error,manual:''});
const review=manual=>({error:'',manual});
const cross=(a,b,p)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);

function cast(t){
  const geometry=pieceGeometry(T,t);
  if(casts.has(geometry))return casts.get(geometry);
  const position=geometry.attributes.position,indices=geometry.index.array;
  const vertices=Array.from({length:position.count},(_,i)=>({x:position.getX(i),y:position.getY(i),z:position.getZ(i)}));
  const triangles=[],tops=new Map();
  for(let i=0;i<indices.length;i+=3){
    const a=vertices[indices[i]],b=vertices[indices[i+1]],c=vertices[indices[i+2]];
    const low=Math.min(a.y,b.y,c.y),high=Math.max(a.y,b.y,c.y),area=cross(a,b,c);
    const tri={a,b,c,low,high,area};
    triangles.push(tri);
    if(area>=-eps||high-low>.001||low<.01)continue;
    const level=roundHeight(high);
    if(!tops.has(level))tops.set(level,[]);
    tops.get(level).push(tri);
  }
  const shape={triangles,tops,supportBridges:geometry.userData.supportBridges??[],sections:new Map(),floors:new Map()};
  casts.set(geometry,shape);
  return shape;
}

function nearby(p,terrain){
  const sites=[];
  for(const t of terrain){
    if(t.removed||t.faction!=='terrain')continue;
    const c=Math.cos(t.yaw||0),s=Math.sin(t.yaw||0),dx=p.x-t.x,dz=p.z-t.z;
    const x=c*dx-s*dz,z=s*dx+c*dz,yaw=(p.yaw||0)-(t.yaw||0);
    const rx=p.baseWidth/2,rz=p.baseDepth/2,cs=Math.cos(yaw),sn=Math.sin(yaw);
    if(Math.abs(x)>t.baseWidth/2+Math.hypot(rx*cs,rz*sn)||
      Math.abs(z)>t.baseDepth/2+Math.hypot(rx*sn,rz*cs))continue;
    sites.push({t,shape:cast(t),x,z,rx,rz,cs,sn,ground:t.elevation||0});
  }
  return sites;
}

// Slice the actual registered cast, including rotated walls, gate openings and feet.
function slice(shape,h){
  if(shape.sections.has(h))return shape.sections.get(h);
  const segments=[];
  for(const {a,b,c,low,high} of shape.triangles){
    if(h<low||h>=high)continue;
    const cut=[];
    for(const [v,w] of [[a,b],[b,c],[c,a]]){
      if((v.y>h)===(w.y>h))continue;
      const k=(h-v.y)/(w.y-v.y);
      cut.push({x:v.x+k*(w.x-v.x),z:v.z+k*(w.z-v.z)});
    }
    if(cut.length===2)segments.push(cut);
  }
  if(shape.sections.size>=8)shape.sections.clear();
  shape.sections.set(h,segments);
  return segments;
}
function normPoint(site,v){
  const {x,z,cs,sn,rx,rz}=site;
  return {x:(cs*(v.x-x)-sn*(v.z-z))/rx,z:(sn*(v.x-x)+cs*(v.z-z))/rz};
}
function cutsBase(site,h,radius){
  // In base-local coordinates the terrain segments cut a unit disk, even for vehicles.
  for(const [v,w] of slice(site.shape,h)){
    const a=normPoint(site,v),b=normPoint(site,w),dx=b.x-a.x,dz=b.z-a.z;
    const u=Math.max(0,Math.min(1,-(a.x*dx+a.z*dz)/(dx*dx+dz*dz||1)));
    if(Math.hypot(a.x+u*dx,a.z+u*dz)<radius-eps)return true;
  }
  // A base can also be completely inside a single wall/solid, clear of its edges.
  const center={x:site.x+1.7e-7,z:site.z+2.9e-7};
  let winding=0;
  for(const {a,b,c,area,high} of site.shape.triangles){
    if(high<=h||Math.abs(area)<eps)continue;
    const wa=cross(b,c,center)/area,wb=cross(c,a,center)/area,wc=1-wa-wb;
    if(Math.min(wa,wb,wc)>0&&wa*a.y+wb*b.y+wc*c.y>h)winding-=Math.sign(area);
  }
  return winding>0;
}

function footprint(site,angle,r=1){
  const x=r*site.rx*Math.cos(angle),z=r*site.rz*Math.sin(angle);
  return {x:site.x+site.cs*x+site.sn*z,z:site.z-site.sn*x+site.cs*z};
}
function covers(tri,p){
  return cross(tri.a,tri.b,p)<=eps&&cross(tri.b,tri.c,p)<=eps&&cross(tri.c,tri.a,p)<=eps;
}
function floorAt(shape,level){
  const key=roundHeight(level);
  if(shape.floors.has(key))return shape.floors.get(key);
  const contact=shape.tops.get(key);
  if(!contact)return null;
  const faces=[];
  for(const [height,triangles] of shape.tops){
    if(height<=key&&height>=key-ribDepth)faces.push(...triangles);
  }
  const bridges=shape.supportBridges.filter(edge=>edge.every(p=>{
    const height=roundHeight(p.y);
    return height<=key&&height>=key-ribDepth;
  }));
  const points=faces.flatMap(t=>[t.a,t.b,t.c]).concat(bridges.flat()).sort((a,b)=>a.x-b.x||a.z-b.z);
  const half=points=>{
    const chain=[];
    for(const p of points){
      while(chain.length>=2&&cross(chain.at(-2),chain.at(-1),p)<=eps)chain.pop();
      chain.push(p);
    }
    chain.pop();
    return chain;
  };
  const hull=[...half(points),...half(points.reverse())];
  const floor={faces,contact,hull,bridges};
  shape.floors.set(key,floor);
  return floor;
}
function supported(site,level){
  // A cast grill may have holes and a ripped edge. At each rim point check
  // for metal there or further out on the same ray. A missing outward
  // intersection proves overhang; holes inside the frame need a stability check.
  const floor=floorAt(site.shape,level);
  if(!floor)return false;
  const {faces,contact,hull,bridges}=floor;
  // Support of the full ellipse in each hull-edge direction catches partial
  // overhang even between sampled rim points and with a rotated oval base.
  for(let i=0;i<hull.length;i++){
    const a=hull[i],b=hull[(i+1)%hull.length],nx=b.z-a.z,nz=a.x-b.x;
    const extent=Math.hypot(site.rx*(site.cs*nx-site.sn*nz),site.rz*(site.sn*nx+site.cs*nz));
    if(cross(a,b,site)<extent-eps)return false;
  }
  let touching=contact.some(t=>covers(t,site));
  for(let i=0;i<64;i++){
    const p=footprint(site,i*Math.PI/32);
    if(contact.some(t=>covers(t,p))){touching=true;continue;}
    if(faces.some(t=>covers(t,p)))continue;
    const dx=p.x-site.x,dz=p.z-site.z;
    function crossesOutward(v,w){
      const ex=w.x-v.x,ez=w.z-v.z,det=dx*ez-dz*ex;
      if(Math.abs(det)<eps)return false;
      const vx=v.x-p.x,vz=v.z-p.z,u=(vx*dz-vz*dx)/det;
      return u>=-eps&&u<=1+eps&&(vx*ez-vz*ex)/det>=-eps;
    }
    // A base can span the hairline fracture between two pieces of the
    // same rim. Only physical faces can supply contact or obstruct sight.
    if(bridges.some(([a,b])=>crossesOutward(a,b)))continue;
    let beyond=false;
    for(const {a,b,c} of faces){
      if(crossesOutward(a,b)||crossesOutward(b,c)||crossesOutward(c,a)){beyond=true;break;}
    }
    if(!beyond)return false;
  }
  // A narrow rib or hatch under the interior can also touch the base.
  return touching||contact.some(t=>[t.a,t.b,t.c].some(v=>{
    const q=normPoint(site,v);return Math.hypot(q.x,q.z)<1;
  }));
}
function hitsBase(site,y){
  const local=y-site.ground;
  // Plinth top at 0.12″ and tapered edge. Small hatch relief under an
  // elevated base is left to the players' stability check.
  return cutsBase(site,local+.105,.95)||(y===0&&cutsBase(site,local+.025,.985));
}

export function patrolTerrainPlacement(p,terrain){
  const y=p.elevation??0;
  if(!Number.isFinite(y)||y<0)return fail('베이스에 올바른 지면 높이를 지정하세요.');
  if(y>0&&!upperFloorKinds.has(p.kind))return fail('이 모델은 지면에 배치해야 합니다. 상층 배치에 필요한 키워드가 없습니다.');
  const sites=nearby(p,terrain);
  if(sites.some(site=>hitsBase(site,y)))return fail('베이스가 지형의 벽이나 구조물 안에 들어갑니다.');
  if(!sites.length)return y===0?allowed:fail('이 높이에 베이스를 지지할 지형이 없습니다.');
  if(y===0)return review('지면에 놓은 모델의 무기·차체가 벽, 장식 또는 위층 바닥을 뚫지 않는지 확인하세요.');
  if(sites.some(site=>supported(site,y-site.ground))){
    return review('베이스 전체가 같은 상판 가장자리 안에 있고, 모델이 흔들리지 않으며 장식과 간섭하지 않는지 확인하세요.');
  }
  return fail('이 높이에 베이스 전체를 지지할 상판이 없거나 베이스가 가장자리 밖으로 돌출됩니다.');
}

// Core Rules 22.05, p.73. The target condition uses the base's ground
// level, including on the ground floor inside a ruin. A FLY model's display
// stand or an upper floor somewhere above its head does not raise its base.
export function patrolGroundLevel(piece){
  return !!piece && !piece.removed && piece.faction!=='terrain' && (piece.elevation??0)===0;
}

// The shooter must stand on the qualifying section itself. Casting and
// testing each terrain piece separately prevents neighbouring balconies or
// the tallest point of a wall from supplying missing support. For this kit
// we can certify cast terrain resting on the board. An elevated terrain
// prop's supporting assembly is not represented by its edited Y alone.
export function patrolHighGround(piece,terrain){
  if(!piece || piece.removed || !upperFloorKinds.has(piece.kind) ||
      !Number.isFinite(piece.elevation) || piece.elevation<3 ||
      !Number.isFinite(piece.x) || !Number.isFinite(piece.z) ||
      !(piece.baseWidth>0) || !(piece.baseDepth>0))return false;
  const y=piece.elevation,sites=nearby(piece,terrain);
  if(sites.some(site=>hitsBase(site,y)))return false;
  return sites.some(site=>site.ground===0 && supported(site,y));
}

export function patrolTerrainLevels(p,terrain){
  const levels=[0];
  if(!upperFloorKinds.has(p.kind))return levels;
  const sites=nearby(p,terrain);
  for(const site of sites){
    // Check highest nearby faces first so the ribs and the sheet propose one landing.
    for(const local of [...site.shape.tops.keys()].sort((a,b)=>b-a)){
      const y=roundHeight(site.ground+local);
      if(levels.some(h=>Math.abs(h-y)<=ribDepth)||!supported(site,local))continue;
      if(!sites.some(other=>hitsBase(other,y)))levels.push(y);
    }
  }
  return levels.sort((a,b)=>a-b);
}
