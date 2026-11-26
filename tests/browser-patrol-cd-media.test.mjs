import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from '../vendor/three.module.min.js';
import {createTable,createMapTable} from '../data/catalog.mjs';
import {studioGroupFor} from '../assets/turntable.mjs';
import {matchesPortraitPose} from '../painted.mjs';
import {studioScene} from '../studio-scene.mjs';
import {createPiece} from '../assets/pieces.mjs';
import {sightObstructions} from '../assets/sight-line.mjs';

const wall=table=>table.pieces.find(p=>p.id==='largeRuin-2');
test('group 12 and the door portrait represent C+B; an active C+D hides an existing studio sprite',()=>{
  const legacy=wall(createMapTable()),current=wall(createMapTable({patrolCD:true})),exhibition=wall(createTable());
  const front=76*Math.PI/180;
  assert.equal(studioGroupFor(exhibition),12);assert.equal(studioGroupFor(legacy),12);
  assert.equal(studioGroupFor(current),null);assert.equal(studioGroupFor(current,{allowExemplar:true}),null);
  assert.equal(matchesPortraitPose({...current,yaw:front},front),false);
  assert.equal(matchesPortraitPose({...legacy,yaw:front},front),true);
  assert.equal(matchesPortraitPose(exhibition,exhibition.yaw),false);
  const studio=studioScene(T,new T.Scene(),[exhibition],()=>{});
  studio.objects[0].visible=true;
  assert.equal(studio.update(current,0,.4,22,true),false);
  assert.equal(studio.objects[0].visible,false);
});
test('canvas pick and 1mm sight fixtures distinguish both physical assemblies from either direction',()=>{
  for(const cd of [false,true]){
    const p=wall(createMapTable({patrolCD:cd})),mesh=createPiece(T,p);mesh.userData.pieceId=p.id;
    mesh.updateMatrixWorld(true);
    for(const [x,z,hit] of [[0,-.5,cd],[0,1.8,!cd]]){
      const pick=new T.Raycaster(new T.Vector3(x,10,z),new T.Vector3(0,-1,0));
      assert.equal(pick.intersectObject(mesh,true).length>0,hit);
    }
    for(const [y,z,blocked] of [[4.1,.75,cd],[1.5,1.8,!cd]]){
      const a=new T.Vector3(-6,y,z),b=new T.Vector3(6,y,z);
      for(const [from,to] of [[a,b],[b,a]])assert.equal(sightObstructions(from,to,[mesh]).length>0,blocked);
    }
  }
});
