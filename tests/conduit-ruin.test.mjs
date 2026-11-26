import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from '../vendor/three.module.min.js';
import {createTable} from '../data/catalog.mjs';
import {createPiece,pieceGeometry} from '../assets/pieces.mjs';

const item=createTable().pieces.find(p=>p.id==='smallRuin-4');
const previous={...item,previousPipeRuin:true};
const mesh=createPiece(T,item).children[0];
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.0001,`${actual} differs from ${expected}`);

function intersect(model,from,to){
  const start=new T.Vector3(...from),d=new T.Vector3(...to).sub(start),length=d.length();
  return new T.Raycaster(start,d.normalize(),0,length).intersectObject(model,false)[0];
}
function both(model,from,to,expected){
  assert.equal(!!intersect(model,from,to),expected);
  assert.equal(!!intersect(model,to,from),expected);
}
function face(x,y,front){
  const h=intersect(mesh,[x,y,front?1:-1],[x,y,front?-1:1]);
  assert.ok(h);
  const c=mesh.geometry.attributes.color,i=h.face.a;
  return {z:h.point.z,r:c.getX(i),g:c.getY(i),b:c.getZ(i)};
}

test('the pipe ruin keeps its footprint, has the assembled profile and uses one draw call',()=>{
  const g=pieceGeometry(T,item),b=g.boundingBox;
  assert.equal(createPiece(T,item).children.length,1);
  assert.equal(g,mesh.geometry);
  near(b.min.x,-1.25);near(b.max.x,1.25);near(b.min.z,-.70);near(b.max.z,.70);
  near(b.min.y,0);near(b.max.y,1.64);
  assert.ok(g.index.count/3<14000);
  const red=face(-.275,1.54,true),teal=face(-.71,1.41,true);
  assert.ok(red.r>red.g*3&&teal.g>teal.r*1.5,'Both pipe tips stand close to the tall corner post');
});

test('both arms block across their centre lines, leaving the inside and the bottom notch open',()=>{
  const old=createPiece(T,previous).children[0];
  for(const [a,b] of [
    [[0,.48,.05],[0,.48,.80]],[[.70,.51,-.02],[1.45,.51,-.02]]
  ]){
    both(mesh,a,b,true);both(old,a,b,false);
  }
  both(mesh,[.32,1.8,-.12],[.32,-.04,-.12],false);
  both(mesh,[.93,.064,.04],[.93,.064,.8],false);
  both(mesh,[.935,.35,.04],[.935,.35,.8],true);
});

test('the corrugated red stack, two green pipes, control wiring and rear elbow are solid relief',()=>{
  const stem=face(-.275,.65,true),flange=face(-.275,1.27,true),brass=face(-.275,.485,true);
  assert.ok(stem.r>3*stem.g&&flange.r>3*flange.g&&flange.z>stem.z+.035);
  assert.ok(brass.r>brass.g&&brass.g>brass.b*1.5);
  for(const [x,y] of [[-.017,.65],[-.71,.72]]){
    const green=face(x,y,true);
    assert.ok(green.g>green.r*1.5&&green.b>green.r*1.5);
  }
  const wire=face(.219,.682,true),box=face(.219,1.198,true);
  assert.ok(wire.r>wire.g*2);
  assert.ok(box.z>wire.z+.035);
  const elbow=face(-.067,.65,false),back=face(-.275,.65,false);
  assert.ok(elbow.z<back.z-.10,'Rear plumbing projects towards the opposite side');
});

test('historical pipe ruin saves retain every original painted vertex and index',()=>{
  const g=pieceGeometry(T,previous);
  assert.notEqual(g,mesh.geometry);
  assert.equal(g,createPiece(T,previous).children[0].geometry);
  assert.equal(g,pieceGeometry(T,{...previous,baseWidth:3,baseDepth:2}));
  const hash=createHash('sha256');
  for(const key of ['position','normal','color','uv'])hash.update(Buffer.from(g.attributes[key].array.buffer));
  hash.update(Buffer.from(g.index.array.buffer));
  assert.equal(hash.digest('hex'),'939d1e99aedb38c2ae358ea891c8e2c7551d20802d355ebf08bae43d08a818ef');
  for(const p of createTable().pieces.filter(p=>p.kind==='smallRuin'&&p.variant!==3)){
    assert.equal(pieceGeometry(T,p),pieceGeometry(T,{...p,previousPipeRuin:true}));
  }
});
