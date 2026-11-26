import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {restore,snapshot} from '../state.mjs';
import {newBattle} from '../rules/battle.mjs';
import {newPatrolSetup} from '../rules/patrol-setup.mjs';
import {patrolTerrainPlacement} from '../rules/patrol-terrain-placement.mjs';
import {createTrainingTwo,trainingTwoPieces} from '../rules/training-two.mjs';
import {createTrainingThreeDeployment,trainingThreeDeploymentPieces,validateTrainingThreeDeployment} from '../rules/training-three-deployment.mjs';
import {actTrainingThreeBattle,createTrainingThreeBattle,validateTrainingThreeBattle} from '../rules/training-three-battle.mjs';
import {trainingFourDeployment,trainingFourBattle} from '../rules/training-four-battle.mjs';

const model=(pieces,id)=>pieces.find(p=>p.id===id);
const wall=pieces=>model(pieces,'smallRuin-1');
const saveTable=()=>({...createTable(),logs:[],rules:newBattle()});
const courtyard={x:.9,z:5.65};

test('the fourth ruin carries its own edition when switching between official, handbook, and custom tables',()=>{
  const fresh=saveTable(),pipe=pieces=>model(pieces,'smallRuin-4');
  const poses={x:-11.72,z:4.63,elevation:0,yaw:.64};
  const manual=saveTable();
  Object.assign(pipe(manual.pieces),poses);
  const trainings=[createTrainingTwo(),createTrainingThreeDeployment(),trainingFourDeployment.create()];
  assert.deepEqual(trainings.map(s=>s.version),[2,3,5]);
  for(const pieces of [trainingTwoPieces(trainings[0]),trainingThreeDeploymentPieces(trainings[1]),trainingFourDeployment.pieces(trainings[2])])
    assert.equal(pipe(pieces),undefined);
  for(const version of [1,2,3,4]){
    const old=saveTable();
    old.rules.officialSetup={...newPatrolSetup(),version};
    const training=trainings[(version-1)%trainings.length];
    const withTraining=snapshot({...old,training});
    const loaded=restore(createTable(),withTraining);
    assert.equal(pipe(loaded.pieces).previousPipeRuin,true);
    assert.deepEqual([pipe(loaded.pieces).baseWidth,pipe(loaded.pieces).baseDepth],[2.5,1.4]);
    assert.equal(!!wall(loaded.pieces).previousSmallRuin,version<=3);
    assert.deepEqual(snapshot(loaded),withTraining);
    const malformed=structuredClone(withTraining);
    pipe(malformed.pieces).previousPipeRuin=false;
    assert.equal(pipe(restore(createTable(),malformed).pieces).previousPipeRuin,true);
    const official=saveTable();
    official.rules.officialSetup=newPatrolSetup();
    for(const next of [manual,official]){
      const save=snapshot(next),switched=restore(loaded,save),p=pipe(switched.pieces);
      assert.equal(!!p.previousPipeRuin,false);
      assert.deepEqual([p.baseWidth,p.baseDepth],[pipe(fresh.pieces).baseWidth,pipe(fresh.pieces).baseDepth]);
      assert.deepEqual(snapshot(switched),save);
    }
  }
});

test('switching from a prior official table to a current patrol or custom save restores the current cast at its own recorded pose',()=>{
  const template=createTable(),old=saveTable();
  old.rules.officialSetup={...newPatrolSetup(),version:3};
  const legacy=restore(template,snapshot(old));
  assert.equal(wall(legacy.pieces).previousSmallRuin,true);
  assert.equal(wall(legacy.pieces).baseDepth,1.4);
  const custom=saveTable(),pose={x:-10.2,z:5.78,yaw:.84};
  Object.assign(wall(custom.pieces),pose);
  const currentPatrol=saveTable();
  currentPatrol.rules.officialSetup=newPatrolSetup();
  for(const game of [custom,currentPatrol]){
    const save=snapshot(game),loaded=restore(legacy,save),small=wall(loaded.pieces);
    assert.equal(!!small.previousSmallRuin,false);
    assert.equal(small.baseDepth,1.25);
    assert.deepEqual(snapshot(loaded),save);
    const actor={...model(template.pieces,'captain-1'),x:-.6,z:1.3,yaw:0,elevation:0};
    const atOrigin=p=>({...p,x:0,z:0,yaw:0,elevation:0});
    assert.ok(patrolTerrainPlacement(actor,[atOrigin(small)]).error);
    assert.ok(!patrolTerrainPlacement(actor,[atOrigin(wall(legacy.pieces))]).error);
  }
});

test('handbook deployment revisions keep each physical wall independently across saves',()=>{
  assert.equal(createTrainingTwo().version,2);
  for(const [create,validate,pieces] of [
    [createTrainingThreeDeployment,validateTrainingThreeDeployment,trainingThreeDeploymentPieces],
    [trainingFourDeployment.create,trainingFourDeployment.validate,trainingFourDeployment.pieces],
  ]){
    const current=create();
    assert.equal(current.version,current.scenario===4?5:3);
    assert.equal(!!wall(pieces(current)).previousSmallRuin,false);
    assert.equal(validate({...current,positions:{'gretchin-1':courtyard}}),false);
    for(const version of [1,2]){
      const training={...current,version,positions:{'gretchin-1':courtyard}};
      assert.ok(validate(training));
      const save=snapshot({...saveTable(),training}),loaded=restore(createTable(),save);
      assert.deepEqual(loaded.training,training);
      const field=pieces(loaded.training);
      assert.equal(wall(field).previousSmallRuin,true);
      assert.equal(wall(field).baseDepth,1.4);
      assert.equal(!!model(field,'largeRuin-2').previousSecondRuin,version===1);
      if(training.scenario===4)assert.ok(trainingFourBattle.validate(trainingFourBattle.create(training)));
      else assert.ok(validateTrainingThreeBattle(createTrainingThreeBattle(training)));
    }
  }
});

test('a recorded Advance replays its original dice and route through the former small ruin',()=>{
  const select={type:'move',unit:'gretchin',mode:'advance'},path={type:'path',id:'gretchin-1',...courtyard};
  const initial=version=>createTrainingThreeBattle({...createTrainingThreeDeployment(),version});
  for(const version of [1,2]){
    const moving=actTrainingThreeBattle(initial(version),select,()=>4);
    const training=actTrainingThreeBattle(moving,path);
    assert.deepEqual(training.history.map(r=>r.dice),[[4],[]]);
    const loaded=restore(createTable(),snapshot({...saveTable(),training})).training;
    assert.deepEqual(loaded,training);
    assert.ok(validateTrainingThreeBattle(loaded));
    assert.equal(validateTrainingThreeBattle({...loaded,version:3}),false);
  }
  const current=actTrainingThreeBattle(initial(3),select,()=>4);
  assert.throws(()=>actTrainingThreeBattle(current,path),/지형 벽/);
});
