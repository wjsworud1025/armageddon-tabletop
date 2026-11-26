import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from '../vendor/three.module.min.js';
import {createPiece,pieceGeometry} from '../assets/pieces.mjs';
import {createTable} from '../data/catalog.mjs';
import {patrolCDSize,mapReliquarySize} from '../data/reliquary-dimensions.mjs';
import {patrolHighGround,patrolTerrainPlacement} from '../rules/patrol-terrain-placement.mjs';

const pieces=createTable().pieces;
const display=pieces.find(p=>p.id==='largeRuin-2');
const cd={...display,...patrolCDSize,patrolCD:true,x:0,z:0,yaw:0};
const solid=createPiece(T,cd);
solid.updateMatrixWorld(true);
const jointX=-3.035,jointZ=1.25;
function checkLine(label,a,b,blocked){
  for(const [from,to] of [[a,b],[b,a]]){
    const origin=new T.Vector3(...from),direction=new T.Vector3(...to).sub(origin);
    const length=direction.length();
    const hits=new T.Raycaster(origin,direction.normalize(),0,length).intersectObject(solid,true);
    assert.equal(hits.length>0,blocked,label+' from '+from);
  }
}

test('CD uses an independent rules and render cast and belongs only to large ruin two',()=>{
  const shape=pieceGeometry(T,cd);
  assert.equal(shape,solid.children[0].geometry);
  assert.equal(shape,pieceGeometry(T,{...cd,yaw:Math.PI}));
  for(const other of [display,{...display,...mapReliquarySize},
    {...display,...mapReliquarySize,previousSecondRuin:true}]){
    assert.notEqual(shape,pieceGeometry(T,other));
  }
  const first=pieces.find(p=>p.id==='largeRuin-1');
  assert.equal(pieceGeometry(T,first),pieceGeometry(T,{...first,patrolCD:true}));
  const bounds=shape.boundingBox;
  assert.ok(bounds.min.x>=-cd.baseWidth/2&&bounds.max.x<=cd.baseWidth/2);
  assert.ok(bounds.min.z>=-cd.baseDepth/2&&bounds.max.z<=cd.baseDepth/2);
  const size=bounds.getSize(new T.Vector3());
  assert.ok(Math.abs(size.x-6.58)<.03&&Math.abs(size.z-3.29)<.03);
  assert.ok(Math.abs(size.y-4.71)<.05);
});

test('D has a short ground toe, an overhanging shelf and openings between its three bars',()=>{
  function across(station,y,blocked){
    const z=jointZ-station;
    checkLine('wall D at '+[station,y],[jointX-.60,y,z],[jointX+.40,y,z],blocked);
  }
  across(2.06,.060,true);
  across(2.12,.060,false);
  across(2.30,.30,false);
  across(2.49,3.04,true);
  across(2.58,3.04,false);
  for(const y of [3.49,3.90,4.26])across(.72,y,false);
  for(const y of [3.32,3.72,4.12])across(.72,y,true);
});

test('floor six has two projecting beams with open air between them and a solid upper deck',()=>{
  function through(u,d,blocked){
    checkLine('floor at '+[u,d],[jointX+u,3.18,jointZ-d],[jointX+u,2.62,jointZ-d],blocked);
  }
  for(const u of [1.71,3.24])through(u,2.82,true);
  through(2.35,2.82,false);
  through(.71,2.67,false);
  through(4.52,2.10,false);
  through(.93,.94,true);
  through(2.47,.94,true);
});

test('a 32 mm base is supported three inches high over the hatches and can enter the open courtyard at ground level',()=>{
  const marine=pieces.find(p=>p.id==='intercessor-1');
  for(const u of [.93,2.47]){
    const p={...marine,x:jointX+u,z:jointZ-.94,elevation:3};
    assert.equal(patrolTerrainPlacement(p,[cd]).error,'');
    assert.equal(patrolHighGround(p,[cd]),true);
  }
  const yard={...marine,x:jointX+2.35,z:jointZ-2.82,elevation:0};
  assert.equal(patrolTerrainPlacement(yard,[cd]).error,'');
  assert.ok(patrolTerrainPlacement({...yard,elevation:3},[cd]).error);
});
