import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import {createPiece} from '../assets/pieces.mjs';
import {createTable} from '../data/catalog.mjs';
import {getProfile} from '../rules/profiles.mjs';

const vehicles=createTable().pieces.filter(p=>p.kind==='landSpeeder'||p.kind==='wartrakk');

test('Two vehicles preserve oval bases and loadouts with one cached, pickable draw each',()=>{
  const materials=new Set();
  for(const p of vehicles){
    assert.ok(Math.abs(p.baseWidth*25.4-70)<1e-8);
    assert.ok(Math.abs(p.baseDepth*25.4-105)<1e-8);
    const group=createPiece(T,p);
    assert.equal(group.children.length,1);
    const mesh=group.children[0],g=mesh.geometry;
    assert.ok(mesh.isMesh&&g.index);
    assert.equal(createPiece(T,p).children[0].geometry,g);
    materials.add(mesh.material);
    assert.ok(Math.abs(g.boundingBox.min.y)<1e-5);
    for(const key of ['position','color','normal'])assert.ok(g.attributes[key].array.every(Number.isFinite));
    const speeder=p.kind==='landSpeeder';
    assert.ok(g.boundingBox.max.y>(speeder?3.72:3.32)&&g.boundingBox.max.y<(speeder?4.00:3.65));
    assert.ok(g.index.count/3<(speeder?8500:14000));
    for(const label of speeder?['멀티 멜타','스톰퓨리 미사일','헤비 플레이머']:['로킷 런처','커스텀 슈타','초파'])
      assert.ok(getProfile(p).weapons.some(w=>w.name===label),p.id);
    assert.ok(new T.Raycaster(new T.Vector3(0,8,0),new T.Vector3(0,-1,0)).intersectObject(mesh,false).length);
  }
  assert.equal(vehicles.length,2);
  assert.equal(materials.size,1);
});

test('Speeder wings flank a raised body and the Wartrakk has a central front wheel and two rear tracks',()=>{
  const [speeder,trakk]=['landSpeeder','wartrakk'].map(k=>createPiece(T,vehicles.find(p=>p.kind===k)).children[0]);
  const ray=(mesh,point,direction,yaw)=>{
    const rot=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),yaw);
    const origin=new T.Vector3(...point).applyQuaternion(rot);
    const dir=new T.Vector3(...direction).applyQuaternion(rot);
    return new T.Raycaster(origin,dir).intersectObject(mesh,false);
  };
  // Below the forward hull one can see under the hovering skimmer.
  assert.equal(ray(speeder,[3,.91,1.02],[-1,0,0],.28).length,0);
  for(const sign of [-1,1]){
    assert.ok(ray(speeder,[sign*1.28,6,-.89],[0,-1,0],.28)[0].point.y>2);
    assert.ok(ray(trakk,[sign*.60,5,-1.22],[0,-1,0],.06)[0].point.y>.66);
  }
  // The centre of the wheel must be hit by a horizontal ray above the base.
  assert.ok(ray(trakk,[3,.60,1.17],[-1,0,0],.06)[0].distance<3);
  // Forward of the tracks and well outside the front tyre there is open space.
  assert.equal(ray(trakk,[.80,.63,2.50],[0,0,-1],.06)[0].distance>1.75,true);
});
