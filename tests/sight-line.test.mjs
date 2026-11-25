import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import {sightObstructions} from '../assets/sight-line.mjs';
import {createSightPicker} from '../assets/sight-picker.mjs';
const v=(x,y,z)=>new T.Vector3(x,y,z);
function box(id,x,y,z,w,h,d){
  const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshBasicMaterial());
  mesh.userData.pieceId=id;mesh.position.set(x,y,z);return mesh;
}
test('a finite 1 mm line catches rods missed by its centre and excludes objects beyond its ends',()=>{
  const from=v(0,0,0),to=v(0,0,2),mm=1/25.4;
  const near=box('near',.48*mm,0,1,.1*mm,.2,.2),far=box('clear',.57*mm,0,1,.1*mm,.2,.2);
  const after=box('after',0,0,2.06,1,1,.1),before=box('before',0,0,-.06,1,1,.1);
  const wall=box('wall',0,0,.7,2,2,.1);
  for(const [a,b] of [[from,to],[to,from]])assert.deepEqual(sightObstructions(a,b,[near,far,before,after,wall]),['near','wall']);
  assert.throws(()=>sightObstructions(from,from,[near]));
});
test('a triangle spanning a tip is clipped to the flat cap before distance is measured',()=>{
  const mesh=new T.Mesh(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([-.002,0,1.2,.002,0,1.2,.3,0,.8],3)));
  mesh.userData.pieceId='tip';assert.deepEqual(sightObstructions(v(0,0,0),v(0,0,1),[mesh]),[]);
  mesh.position.x=-.15;assert.deepEqual(sightObstructions(v(0,0,0),v(0,0,1),[mesh]),['tip']);
});
test('selecting a surface returns its real world point after orbit, independent of parent visibility',()=>{
  const pick=createSightPicker(),root=box('raised',3,2,1,2,2,2);root.visible=false;
  root.rotation.y=.3;root.updateMatrixWorld(true);
  pick.show(root,0);
  assert.equal(pick.sample(new T.Vector2(-.99,.99),600,400),null);
  for(const [dx,dy] of [[0,0],[160,35],[-70,44]]){
    pick.orbit(dx,dy);const point=pick.sample(new T.Vector2(0,0),600,400);assert.ok(point);
    const p=root.worldToLocal(point.clone());assert.ok(Math.abs(Math.max(Math.abs(p.x),Math.abs(p.y),Math.abs(p.z))-1)<1e-6);
  }
  pick.clear();assert.equal(root.visible,false);
});
