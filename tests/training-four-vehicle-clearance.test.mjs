import assert from 'node:assert/strict';
import test from 'node:test';
import {createTable} from '../data/catalog.mjs';
import {createTrainingFourTable,validateTrainingFourLayout} from '../data/training-four-layout.mjs';
import {vehicleTerrainContacts} from '../assets/vehicle-clearance.mjs';
import {newBattle} from '../rules/battle.mjs';
import {trainingFourBattle as battle,trainingFourDeployment as deploy} from '../rules/training-four-battle.mjs';
import {snapshot,restore} from '../state.mjs';

const id='wartrakk-1';
const roundtrip=training=>restore(createTable(),snapshot({...createTable(),logs:[],rules:newBattle(),training})).training;
const noDie=()=>assert.fail('moving or rotating a vehicle must not use dice');
function occludedDraft(deployment){
  let s=battle.act(battle.create(deployment),{type:'four-score'},noDie);
  s=battle.act(s,{type:'move',unit:'wartrakk',mode:'normal'},noDie);
  s=battle.act(s,{type:'pivot',id,direction:1},noDie);
  const p=s.poses[id];
  return battle.act(s,{type:'path',id,x:p.x,z:p.z-.25},noDie);
}

test('new handbook 4 deployment and completed moves reject a Wartrakk caught on small ruin 2',()=>{
  const field=createTrainingFourTable(),deployment=deploy.create();
  const trakk=field.pieces.find(p=>p.id===id);
  const blocked={...trakk,z:trakk.z-.25,yaw:trakk.yaw+Math.PI/12};
  for(const p of field.pieces.filter(p=>p.kind==='landSpeeder'||p.kind==='wartrakk'))
    assert.deepEqual(vehicleTerrainContacts(p,field.pieces),[]);
  assert.deepEqual(validateTrainingFourLayout(field),[]);
  assert.deepEqual(vehicleTerrainContacts(blocked,field.pieces),['smallRuin-2']);
  assert.throws(()=>deploy.move(deployment,id,blocked.x,blocked.z,blocked.yaw),/차체|장비/);
  assert.equal(deployment.version,4);
  const draft=occludedDraft(deployment);
  assert.deepEqual(roundtrip(draft),draft);
  assert.throws(()=>battle.act(draft,{type:'finish'},noDie),/차체|장비/);
  const clear=battle.act(draft,{type:'path',id,x:trakk.x,z:trakk.z+.75},noDie);
  const done=battle.act(clear,{type:'finish'},noDie);
  assert.equal(done.poses[id].z,trakk.z+.75);
  assert.deepEqual(roundtrip(done),done);
});

test('versions 1–3 preserve already accepted hull intersections in both setup and battle histories',()=>{
  for(const version of [1,2,3]){
    const deployment={...deploy.create(),version},p=deploy.pieces(deployment).find(p=>p.id===id);
    const old=deploy.move(deployment,id,p.x,p.z-.25,p.yaw+Math.PI/12);
    assert.deepEqual(roundtrip(old),old);assert.ok(battle.validate(battle.create(old)));
    const finished=battle.act(occludedDraft(deployment),{type:'finish'},noDie);
    assert.deepEqual(roundtrip(finished),finished);assert.equal(finished.poses[id].z,p.z-.25);
    const forged={...finished,version:4};
    assert.equal(battle.validate(forged),false);
  }
});
