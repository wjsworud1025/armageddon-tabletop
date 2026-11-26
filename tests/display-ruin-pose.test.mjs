import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import {createMapTable,createTable,photoToBoard} from '../data/catalog.mjs';
import {photoCamera,photoFit} from '../photo-camera.mjs';
import {matchesPortraitPose} from '../painted.mjs';
import {studioViewFrame} from '../studio-scene.mjs';
import {patrolTerrainPlacement,patrolHighGround} from '../rules/patrol-terrain-placement.mjs';
import {restore,snapshot} from '../state.mjs';
import {applyLayout} from '../layouts.mjs';
import {newBattle,startBattle} from '../rules/battle.mjs';
import {createTrainingThreeTable} from '../data/training-three-layout.mjs';

const rad=Math.PI/180;
const display=createTable();
const ruin=display.pieces.find(p=>p.id==='largeRuin-2');
const view=photoCamera(T,44,30);
view.fit(1920,1212);

test('the 3-inch exhibition ruin places both walls on the photographed ground contacts',()=>{
  assert.deepEqual([ruin.baseWidth,ruin.baseDepth],[5.2*(3/2.30),4.22*(3/2.30)]);
  const {px,uMid,vMid}=photoFit(1920,1212);
  const matrix=new T.Matrix4().makeRotationY(ruin.yaw).setPosition(ruin.x,0,ruin.z);
  const marks=[
    [[-2.270,0,1.765],[709,964]],
    [[2.590,.025,1.765],[511,908]],
    [[-2.270,.025,-2.110],[588.5,1034]]
  ];
  const squared=marks.map(([local,[u,v]])=>{
    const point=new T.Vector3(...local).multiplyScalar(3/2.30).applyMatrix4(matrix).project(view.camera);
    return (uMid+point.x*960/px-u)**2+(vMid-point.y*606/px-v)**2;
  });
  assert.ok(Math.sqrt(squared.reduce((sum,v)=>sum+v,0)/marks.length)<1);
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
  delete saved.reliquaryRevision;
  const previous={...photoToBoard(619,949),yaw:76*rad};
  Object.assign(saved.pieces.find(p=>p.id===ruin.id),previous);
  const reloaded=restore(display,saved);
  assert.deepEqual(snapshot(reloaded),saved);
  assert.equal(matchesPortraitPose(reloaded.pieces.find(p=>p.id===ruin.id),ruin.yaw),true);
});

test('the saved exhibition firing position keeps its 3-inch floor or the preceding 2.30-inch cast',()=>{
  const table={...createTable(),logs:[],rules:startBattle(newBattle(),'marines',5)};
  table.rules.step=2;
  const wall=table.pieces.find(p=>p.id===ruin.id),shooter=table.pieces.find(p=>p.id==='intercessor-2');
  Object.assign(wall,{x:0,z:0,yaw:0});
  Object.assign(shooter,{x:-1.3,z:.65,elevation:3.02});
  const current=snapshot(table);
  const previous=structuredClone(current);
  delete previous.reliquaryRevision;
  previous.pieces.find(p=>p.id===shooter.id).elevation=2.31;
  let template=createMapTable();
  for(const [save,high] of [[current,true],[previous,false],[current,true]]){
    const resumed=restore(template,save);
    const r=resumed.pieces.find(p=>p.id===ruin.id),s=resumed.pieces.find(p=>p.id===shooter.id);
    assert.equal(patrolTerrainPlacement(s,[r]).error,'');
    assert.equal(patrolHighGround(s,[r]),high);
    assert.ok(patrolTerrainPlacement({...s,elevation:high?2.31:3.02},[r]).error);
    assert.deepEqual(snapshot(resumed),save);
    template=resumed;
  }
});

test('quick maps and the handbook keep the documented earlier footprint when entered from a new display',()=>{
  const table={...createTable(),logs:[],rules:newBattle()};
  for(const map of ['A','B','C']){
    applyLayout(table,map,'marines');
    const save=snapshot(table),resumed=restore(createTable(),save);
    for(const game of [table,resumed,createTrainingThreeTable()]){
      const p=game.pieces.find(p=>p.id===ruin.id);
      assert.deepEqual([p.baseWidth,p.baseDepth],[5.2,4.22]);
    }
    assert.ok(!Object.hasOwn(save,'reliquaryRevision'));
    assert.deepEqual(snapshot(resumed),save);
  }
  const copied={...createTable(),logs:[],layout:{map:'B',blue:'marines'},rules:newBattle()};
  assert.deepEqual(snapshot(restore(display,snapshot(copied))),snapshot(copied));
});
