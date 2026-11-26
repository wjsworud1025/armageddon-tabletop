import * as T from '../vendor/three.module.min.js';
import {pieceGeometry} from './pieces.mjs';
import {createTable} from '../data/catalog.mjs';

const terrainKinds=new Set(createTable().pieces.filter(p=>p.faction==='terrain').map(p=>p.kind));
const shapes=new WeakMap();
// The baked vertices are Float32 tabletop inches. Do not turn a shared
// surface or round-off at a rotated edge into a physical penetration.
const eps=1e-6;
const axes=['x','y','z'];
const interiorOverlap=(a,b)=>axes.every(k=>Math.min(a.max[k],b.max[k])-Math.max(a.min[k],b.min[k])>eps);

function shape(geometry){
  if(shapes.has(geometry))return shapes.get(geometry);
  const pos=geometry.attributes.position,indices=geometry.index.array;
  const vertices=Array.from({length:pos.count},(_,i)=>new T.Vector3().fromBufferAttribute(pos,i));
  const starts=geometry.userData.partIndexOffsets,parts=[];
  for(let i=0;i<starts.length;i++){
    const start=starts[i],end=starts[i+1]??indices.length;
    if(start<(geometry.userData.vehicleBodyIndexOffset??0)||geometry.userData.paintOnlyIndexOffsets?.includes(start))continue;
    const ix=indices.subarray(start,end),ids=[...new Set(ix)];
    const box=new T.Box3().setFromPoints(ids.map(j=>vertices[j]));
    parts.push({ix,ids,box});
  }
  const data={vertices,parts};shapes.set(geometry,data);return data;
}

function posed(geometry,p){
  const data=shape(geometry),elevation=p.elevation??0,yaw=p.yaw??0;
  const last=data.last;
  if(last&&last.x===p.x&&last.z===p.z&&last.yaw===yaw&&last.elevation===elevation)return last;
  const matrix=new T.Matrix4().makeRotationY(yaw).setPosition(p.x,elevation,p.z);
  const parts=data.parts.map(source=>({source,box:source.box.clone().applyMatrix4(matrix)}));
  data.last={x:p.x,z:p.z,yaw,elevation,parts,vertices:[],data,matrix,contacts:new WeakMap()};
  return data.last;
}

function faces(object,part){
  if(part.tris)return part;
  const vertex=i=>object.vertices[i]??=object.data.vertices[i].clone().applyMatrix4(object.matrix);
  const {ix,ids}=part.source;
  part.points=ids.map(vertex);part.tris=[];
  part.box.setFromPoints(part.points);
  for(let i=0;i<ix.length;i+=3){
    const a=vertex(ix[i]),b=vertex(ix[i+1]),c=vertex(ix[i+2]);
    const normal=new T.Vector3().subVectors(b,a).cross(new T.Vector3().subVectors(c,a));
    if(normal.lengthSq()<1e-20)continue;
    normal.normalize();
    part.tris.push({a,b,c,normal,box:new T.Box3().setFromPoints([a,b,c])});
  }
  const plane=part.tris[0];
  // Flush paint discs in the vehicle draw have no cast thickness.
  part.flat=!plane||part.points.every(p=>Math.abs(plane.normal.dot(p)-plane.normal.dot(plane.a))<=eps);
  return part;
}

// Only a closed constituent can contain a point. Painted circles and open
// strips cannot turn the space behind them into a solid. Weld the coincident
// seam/cap vertices of the original primitive before checking edge valence.
function closed(object,part){
  const source=part.source;
  if(source.closed!==undefined)return source.closed;
  const vertices=object.data.vertices,keys=new Map(),weld=new Map(),edges=new Map();
  for(const i of source.ids){
    const v=vertices[i],key=axes.map(k=>Math.round(v[k]/eps)).join('/');
    if(!keys.has(key))keys.set(key,keys.size);
    weld.set(i,keys.get(key));
  }
  const ix=source.ix;
  for(let i=0;i<ix.length;i+=3){
    const a=weld.get(ix[i]),b=weld.get(ix[i+1]),c=weld.get(ix[i+2]);
    if(a===b||b===c||c===a)continue;
    for(const [u,v] of [[a,b],[b,c],[c,a]]){
      const key=Math.min(u,v)*keys.size+Math.max(u,v);
      edges.set(key,(edges.get(key)??0)+1);
    }
  }
  return source.closed=edges.size>0&&[...edges.values()].every(n=>n===2);
}

function distances(t,plane){
  const offset=plane.normal.dot(plane.a);
  return [plane.normal.dot(t.a)-offset,plane.normal.dot(t.b)-offset,plane.normal.dot(t.c)-offset];
}
function interval(t,d,k){
  const coords=[t.a[k],t.b[k],t.c[k]],found=[];
  for(let i=0;i<3;i++){
    if(Math.abs(d[i])<=eps)found.push(coords[i]);
    const j=(i+1)%3;
    if(d[i]*d[j]<0)found.push(coords[i]+(coords[j]-coords[i])*d[i]/(d[i]-d[j]));
  }
  return [Math.min(...found),Math.max(...found)];
}
function crosses(a,b){
  if(!a.box.intersectsBox(b.box))return false;
  const da=distances(a,b);
  if(Math.min(...da)>=-eps||Math.max(...da)<=eps)return false;
  const db=distances(b,a);
  if(Math.min(...db)>=-eps||Math.max(...db)<=eps)return false;
  const axis=new T.Vector3().crossVectors(a.normal,b.normal);
  let k='x';
  for(const next of ['y','z'])if(Math.abs(axis[next])>Math.abs(axis[k]))k=next;
  const [a0,a1]=interval(a,da,k),[b0,b1]=interval(b,db,k);
  return Math.min(a1,b1)-Math.max(a0,b0)>eps;
}

const rayDirection=new T.Vector3(.8131,.3773,.4439).normalize();
function inside(p,part){
  if(axes.some(k=>p[k]<=part.box.min[k]+eps||p[k]>=part.box.max[k]-eps))return false;
  const hits=[],ray=new T.Ray(p,rayDirection),hit=new T.Vector3(),triangle=new T.Triangle();
  for(const t of part.tris){
    if(Math.abs(t.normal.dot(p)-t.normal.dot(t.a))<=eps&&
      triangle.set(t.a,t.b,t.c).closestPointToPoint(p,hit).distanceToSquared(p)<=eps*eps)return false;
    if(ray.intersectTriangle(t.a,t.b,t.c,false,hit))
      hits.push({d:hit.distanceTo(p),sign:Math.sign(t.normal.dot(rayDirection))});
  }
  hits.sort((a,b)=>a.d-b.d);
  let crossings=0;
  for(let i=0;i<hits.length;){
    const first=hits[i++];let side=first.sign;
    while(i<hits.length&&hits[i].d-first.d<=eps){
      if(hits[i++].sign!==first.sign)side=0; // The ray grazed a shared edge.
    }
    if(side)crossings++;
  }
  return crossings%2===1;
}
function surrounds(container,outer,inner){
  if(!closed(container,outer))return false;
  if(inner.points.some(p=>inside(p,outer)))return true;
  // A pair of aligned solids can have coincident caps and no interior vertex.
  const probe=new T.Vector3();
  for(const {a,b,c} of inner.tris){
    if(inside(probe.copy(a).add(b).add(c).multiplyScalar(1/3),outer))return true;
    for(const [u,v] of [[a,b],[b,c],[c,a]])
      if(inside(probe.copy(u).lerp(v,.5),outer))return true;
  }
  return false;
}
function partsIntersect(a,ap,b,bp){
  faces(a,ap);faces(b,bp);
  if(ap.flat||bp.flat||!interiorOverlap(ap.box,bp.box))return false;
  for(const t of ap.tris)for(const u of bp.tris)if(crosses(t,u))return true;
  if(surrounds(a,ap,bp)||surrounds(b,bp,ap))return true;
  // Coincident closed shells can share all their surface samples. A real
  // common interior still counts. An empty box around an arch does not.
  const middle=ap.box.clone().intersect(bp.box).getCenter(new T.Vector3());
  return closed(a,ap)&&closed(b,bp)&&inside(middle,ap)&&inside(middle,bp);
}

/** Physical body intersections at one pose. Plinth legality and whether a
 * route may pass through scenery belong to the movement/placement rules. */
export function vehicleTerrainContacts(piece,terrain){
  if(!piece||piece.removed||!['landSpeeder','wartrakk'].includes(piece.kind))return [];
  const contacts=[];
  const geometry=pieceGeometry(T,piece);
  const matrix=new T.Matrix4().makeRotationY(piece.yaw??0).setPosition(piece.x,piece.elevation??0,piece.z);
  const bounds=geometry.boundingBox.clone().applyMatrix4(matrix);
  let body;
  for(const p of terrain){
    if(p.removed||p.faction!=='terrain'||!terrainKinds.has(p.kind))continue;
    const c=Math.abs(Math.cos(p.yaw??0)),s=Math.abs(Math.sin(p.yaw??0));
    const rx=(p.baseWidth*c+p.baseDepth*s)/2,rz=(p.baseWidth*s+p.baseDepth*c)/2;
    if(p.x+rx<bounds.min.x||p.x-rx>bounds.max.x||p.z+rz<bounds.min.z||p.z-rz>bounds.max.z)continue;
    const cast=pieceGeometry(T,p);
    const at=new T.Matrix4().makeRotationY(p.yaw??0).setPosition(p.x,p.elevation??0,p.z);
    if(!interiorOverlap(bounds,cast.boundingBox.clone().applyMatrix4(at)))continue;
    body??=posed(geometry,piece);
    const scenery=posed(cast,p);
    if(!body.contacts.has(scenery)){
      const hit=body.parts.some(bp=>scenery.parts.some(sp=>interiorOverlap(bp.box,sp.box)&&partsIntersect(body,bp,scenery,sp)));
      body.contacts.set(scenery,hit);
    }
    if(body.contacts.get(scenery))contacts.push(p.id);
  }
  return contacts;
}
