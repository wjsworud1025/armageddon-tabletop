import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import {castPiece} from '../assets/sculpt.mjs';
import {relief} from '../assets/wall-relief.mjs';
import {createPiece} from '../assets/pieces.mjs';
import {createTable} from '../data/catalog.mjs';

test('a model eye ray meets the closed ground floor and passes through an upstairs window from both sides',()=>{
  const width=4.35,height=3.95;
  const wall=castPiece(T,{kind:'manufactorum-door-test'},s=>relief(s,'door',width,height));
  for(const face of [-1,1]){
    const ray=(x,y)=>new T.Raycaster(new T.Vector3(x*width,y*height,face*3),new T.Vector3(0,0,-face))
      .intersectObject(wall,true).length>0;
    for(const x of [.07,.20,.25,.46,.54,.65,.74])assert.ok(ray(x,.33),'closed lower bay at '+x);
    assert.ok(!ray(.17,.75),'open light above the upper sill');
    assert.ok(ray(.17,.785),'horizontal glazing bar');
    assert.ok(!ray(.72,.76),'collapsed end of upper wall');
  }
});

test('all eight ruins preserve their footprints, cache one pickable mesh and have different cast sections',()=>{
  const ruins=createTable().pieces.filter(p=>p.kind.endsWith('Ruin'));
  assert.equal(ruins.length,8);
  for(const p of ruins){
    const group=createPiece(T,p),mesh=group.children[0],box=mesh.geometry.boundingBox;
    assert.equal(group.children.length,1);
    assert.equal(createPiece(T,p).children[0].geometry,mesh.geometry);
    const size=box.getSize(new T.Vector3());
    assert.ok(Math.abs(size.x-p.baseWidth)<1e-5&&Math.abs(size.z-p.baseDepth)<1e-5);
    assert.ok(mesh.geometry.attributes.position.array.every(Number.isFinite));
  }
  const large=ruins.filter(p=>p.kind==='largeRuin').map(p=>createPiece(T,p).children[0].geometry);
  assert.notEqual(large[0].index.count,large[1].index.count);
});
