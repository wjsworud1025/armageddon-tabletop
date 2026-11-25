import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrainingThreeTable,trainingThreeWorldPoint} from '../data/training-three-layout.mjs';
import {
  createTrainingThreeDeployment,moveTrainingThreeDeployment,trainingThreeDeploymentPieces,
  validateTrainingThreeDeployment,
} from '../rules/training-three-deployment.mjs';

const deploy=(state,id,x,z)=>{
  const world=trainingThreeWorldPoint({x,z});
  return moveTrainingThreeDeployment(state,id,world.x,world.z);
};
const lookup=(state,id)=>trainingThreeDeploymentPieces(state).find(p=>p.id===id);

test('both factions can edit a layout, resume the JSON save, and hand its exact 26 poses to battle',()=>{
  const start=createTrainingThreeDeployment(),initial=createTrainingThreeTable().pieces;
  assert.ok(validateTrainingThreeDeployment(start));
  assert.deepEqual(trainingThreeDeploymentPieces(start),initial);
  const a=deploy(start,'gretchin-1',17.05,16.65);
  const b=deploy(a,'captain-1',5.65,15.90);
  const c=deploy(b,'warboss-1',18.65,7.90);
  const save=JSON.parse(JSON.stringify(c));
  assert.ok(validateTrainingThreeDeployment(save));
  assert.deepEqual(trainingThreeDeploymentPieces(save),trainingThreeDeploymentPieces(c));
  assert.deepEqual(Object.keys(c.positions).sort(),['captain-1','gretchin-1','warboss-1']);
  assert.deepEqual(start,createTrainingThreeDeployment());
  for(const p of trainingThreeDeploymentPieces(save)){
    const prior=initial.find(o=>o.id===p.id);
    assert.deepEqual(p,{...prior,...save.positions[p.id]});
  }
  const nextBattle=trainingThreeDeploymentPieces(save);
  nextBattle[0].x+=100;nextBattle.at(-1).removed=true;
  assert.deepEqual(trainingThreeDeploymentPieces(save),trainingThreeDeploymentPieces(c));
});

test('no-op placements preserve history and returning home restores the canonical layout',()=>{
  const start=createTrainingThreeDeployment(),p=lookup(start,'gretchin-1');
  assert.equal(moveTrainingThreeDeployment(start,p.id,p.x,p.z),start);
  const next=deploy(start,p.id,17.05,16.65);
  assert.equal(moveTrainingThreeDeployment(next,p.id,next.positions[p.id].x,next.positions[p.id].z),next);
  const reverted=moveTrainingThreeDeployment(next,p.id,p.x,p.z);
  assert.deepEqual(reverted,start);
  assert.deepEqual(trainingThreeDeploymentPieces(reverted),createTrainingThreeTable().pieces);
});

test('placement rejects an incorrect printed zone, a wall, overlapping bases, fixed terrain and invalid input',()=>{
  const state=createTrainingThreeDeployment();
  assert.throws(()=>deploy(state,'gretchin-1',20,7),/구역/);
  assert.throws(()=>deploy(state,'gretchin-1',15.60,18.30),/벽/);
  assert.throws(()=>deploy(state,'gretchin-1',17.59,17.98),/베이스와 겹/);
  assert.throws(()=>deploy(state,'gretchin-1',-1,18),/전장 안/);
  assert.throws(()=>deploy(state,'boy-2',17.15,17.30),/구역/);
  assert.throws(()=>deploy(state,'smallRuin-1',17.15,17.30),/고정/);
  assert.throws(()=>deploy(state,'gretchin-9',17.15,17.30),/미니어처/);
  assert.throws(()=>moveTrainingThreeDeployment(state,'warboss-1',NaN,0),/좌표/);
  assert.deepEqual(state,createTrainingThreeDeployment());
});

test('exact base contact is legal and an imported overlap cannot enter the deployment or battle renderer',()=>{
  const start=createTrainingThreeDeployment();
  const one=deploy(start,'gretchin-1',16.5,20.9);
  const touching=deploy(one,'gretchin-2',16.5+25/25.4,20.9);
  assert.ok(validateTrainingThreeDeployment(touching));
  const bad=structuredClone(touching);bad.positions['gretchin-2'].x-=.015;
  assert.equal(validateTrainingThreeDeployment(bad),false);
  assert.throws(()=>trainingThreeDeploymentPieces(bad),/겹/);
  assert.throws(()=>moveTrainingThreeDeployment(bad,'captain-1',0,0),/배치 기록/);
  for(const positions of [null,[],{'smallRuin-1':{x:0,z:0}},{'boy-2':{x:0,z:'1'}},
    {'boy-2':{x:0,z:0,removed:true}},JSON.parse('{"__proto__":{"x":1,"z":2}}')]){
    assert.equal(validateTrainingThreeDeployment({...start,positions}),false);
  }
  assert.equal(validateTrainingThreeDeployment({...start,phase:'shooting'}),false);
});
