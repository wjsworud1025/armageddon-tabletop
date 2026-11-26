import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import {createTable,photoToBoard} from '../data/catalog.mjs';
import {photoCamera,photoFit} from '../photo-camera.mjs';
import {matchesPortraitPose} from '../painted.mjs';
import {studioViewFrame} from '../studio-scene.mjs';
import {patrolTerrainPlacement} from '../rules/patrol-terrain-placement.mjs';
import {restore,snapshot} from '../state.mjs';

const rad=Math.PI/180;
const display=createTable();
const ruin=display.pieces.find(p=>p.id==='largeRuin-2');
const view=photoCamera(T,44,30);
view.fit(1920,1212);

test('the initial ruin keeps its inch footprint and both arms point toward the photographed ground contacts',()=>{
  assert.deepEqual([ruin.baseWidth,ruin.baseDepth],[5.2,4.22]);
  const {px,uMid,vMid}=photoFit(1920,1212);
  const matrix=new T.Matrix4().makeRotationY(ruin.yaw).setPosition(ruin.x,0,ruin.z);
  const marks=[
    [[-2.270,0,1.765],[709,964]],
    [[2.590,.025,1.765],[511,908]],
    [[-2.270,.025,-2.110],[588.5,1034]]
  ];
  const squared=marks.map(([local,[u,v]])=>{
    const point=new T.Vector3(...local).applyMatrix4(matrix).project(view.camera);
    return (uMid+point.x*960/px-u)**2+(vMid-point.y*606/px-v)**2;
  });
  // The photograph's three contacts cannot coincide with the fixed inch footprint.
  assert.ok(Math.sqrt(squared.reduce((sum,v)=>sum+v,0)/marks.length)<23);
  for(const model of display.pieces.filter(p=>p.faction!=='terrain')){
    assert.equal(patrolTerrainPlacement(model,[ruin]).error,'',model.id);
  }
});

test('the photo table shows the open landing from the registered middle-ring direction',()=>{
  assert.equal(matchesPortraitPose(ruin,ruin.yaw),false);
  const eye=view.camera.position;
  const dx=eye.x-ruin.x,dz=eye.z-ruin.z;
  const frame=studioViewFrame(12,Math.atan2(dx,dz)-ruin.yaw,Math.atan2(eye.y,Math.hypot(dx,dz)));
  assert.deepEqual([frame.elevationIndex,frame.azimuthIndex],[1,3]); // 02-04
});

test('loading a previous exhibition retains its positions and door-side photograph',()=>{
  const saved=snapshot({...display,logs:[],rules:{hp:{}}});
  const previous={...photoToBoard(619,949),yaw:76*rad};
  Object.assign(saved.pieces.find(p=>p.id===ruin.id),previous);
  const reloaded=restore(display,saved);
  assert.deepEqual(snapshot(reloaded),saved);
  assert.equal(matchesPortraitPose(reloaded.pieces.find(p=>p.id===ruin.id),ruin.yaw),true);
});
