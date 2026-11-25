import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import * as T from '../vendor/three.module.min.js';
import {createTable} from '../data/catalog.mjs';
import {createPiece,pieceGeometry} from '../assets/pieces.mjs';

const item=createTable().pieces.find(p=>p.id==='smallRuin-1');
const previous={...item,previousSmallRuin:true};
const corner=[.526,-.340],long=[-.8585,.5129],short=[.5369,.8437];
const near=(actual,expected,tolerance)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} should be within ${tolerance} of ${expected}`);

function ray(mesh,start,end){
  const a=new T.Vector3(...start),direction=new T.Vector3(...end).sub(a);
  const length=direction.length();
  return new T.Raycaster(a,direction.normalize(),0,length).intersectObject(mesh,false).length>0;
}
function across(mesh,center,normal,y,expected) {
  const point=d=>[center[0]+d*normal[0],y,center[1]+d*normal[1]];
  assert.equal(ray(mesh,point(-.27),point(.27)),expected);
  assert.equal(ray(mesh,point(.27),point(-.27)),expected);
}
const along=(arm,t)=>corner.map((v,i)=>v+t*arm[i]);
const normal=arm=>[-arm[1],arm[0]];

test('the registered small shrine fits its measured raised outline as one vertex-painted draw',()=>{
  const group=createPiece(T,item),g=pieceGeometry(T,item);
  assert.equal(group.children.length,1);
  assert.equal(group.children[0].geometry,g);
  assert.equal(item.baseWidth,2.5);assert.equal(item.baseDepth,1.25);
  const b=g.boundingBox;
  near(b.max.x,1.25,.00001);near(b.min.x,-1.25,.00001);
  near(b.max.z,.625,.00001);near(b.min.z,-.625,.00001);
  near(b.min.y,0,.00001);near(b.max.y,1.70,.006);
  assert.ok(g.index.count/3<16000);
  assert.equal(g.attributes.color.count,g.attributes.position.count);
});

test('both broken walls block sight near their photographed ends and leave the interior courtyard open',()=>{
  const mesh=createPiece(T,item).children[0],old=createPiece(T,previous).children[0];
  // Registered group 18 side-wall points measured at 0.28 inches above ground.
  for(const [at,arm] of [[[-.964,.550],long],[[1.028,.449],short]]){
    across(mesh,at,normal(arm),.28,true);
    across(old,at,normal(arm),.28,false);
  }
  for(const arm of [long,short])across(mesh,corner,normal(arm),.28,true);
  assert.equal(ray(mesh,[.310,2,.290],[.310,-.01,.290]),false);
  across(mesh,along(long,1.42),normal(long),1.50,true);
  across(mesh,along(short,.86),normal(short),1.21,false);
});

test('the votive niche has a pointed opening and three paired slots between solid ornaments',()=>{
  const mesh=createPiece(T,item).children[0],n=normal(long);
  // Distances along the long wall and heights above the table, in inches.
  for(const [t,y] of [[1.030,1.260],[.975,1.127],[1.084,1.126],[.969,.986],
    [1.090,.983],[.983,.818],[1.087,.821]])across(mesh,along(long,t),n,y,false);
  for(const [t,y] of [[1.030,1.128],[1.030,.994],[1.030,.838],[.97,1.195],
    [1.09,1.066],[1.09,.915],[.934,.990],[1.122,.990],[1.11,1.258]])across(mesh,along(long,t),n,y,true);
  across(mesh,along(short,.27),normal(short),.21,true);
});

test('historical small-ruin saves keep the original cast independently of current size and cache order',()=>{
  const old=pieceGeometry(T,previous),current=pieceGeometry(T,item);
  assert.notEqual(old,current);
  assert.equal(old,pieceGeometry(T,{...previous,baseDepth:1.4}));
  assert.equal(old,createPiece(T,previous).children[0].geometry);
  near(old.boundingBox.max.z-old.boundingBox.min.z,1.4,.00001);
  near(old.boundingBox.max.y,1.501555,.00001);
  // Pins every position and triangle of the pre-corner public cast.
  const digest=createHash('sha256').update(Buffer.from(old.attributes.position.array.buffer))
    .update(Buffer.from(old.index.array.buffer)).digest('hex');
  assert.equal(digest,'fbf447be5b485417f20879b51a4224808268c4bbd070689e0c677624e929ad15');
  for(const other of createTable().pieces.filter(p=>p.kind==='smallRuin'&&p.variant!==0)){
    assert.equal(pieceGeometry(T,other),pieceGeometry(T,{...other,previousSmallRuin:true}));
  }
});
