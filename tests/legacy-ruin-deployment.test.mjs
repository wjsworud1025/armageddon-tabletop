import assert from 'node:assert/strict';
import test from 'node:test';
import {createTable} from '../data/catalog.mjs';
import {layoutGeometry,validDeployment} from '../layouts.mjs';
import {restore,snapshot} from '../state.mjs';
import {newBattle} from '../rules/battle.mjs';
import {advanceOfficialSetup,validPlacedPatrolUnits} from '../rules/official-deployment.mjs';
import {newPatrolSetup} from '../rules/patrol-setup.mjs';
import {createTrainingTwoTable,trainingTwoPlan,trainingTwoMapPoint,trainingTwoWallSegments,previousHandbookField} from '../data/training-two-layout.mjs';
import {createTrainingThreeTable,trainingThreePlan} from '../data/training-three-layout.mjs';
import {createTrainingFourTable,trainingFourPlan} from '../data/training-four-layout.mjs';
import {createTrainingTwo,trainingTwoPieces,validateTrainingTwo} from '../rules/training-two.mjs';
import {createTrainingThreeDeployment,validateTrainingThreeDeployment} from '../rules/training-three-deployment.mjs';
import {createTrainingThreeBattle,actTrainingThreeBattle,validateTrainingThreeBattle} from '../rules/training-three-battle.mjs';
import {trainingFourBattle,trainingFourDeployment} from '../rules/training-four-battle.mjs';

const find=(g,id)=>g.pieces.find(p=>p.id===id);
function at(ruin,x,z,elevation){
  const c=Math.cos(ruin.yaw),s=Math.sin(ruin.yaw);
  return {x:ruin.x+c*x+s*z,z:ruin.z-s*x+c*z,elevation};
}
function beforeSecondRuinChange(map){
  let g={...createTable(),rules:{...newBattle(),officialSetup:{...newPatrolSetup(),version:2}},logs:[]};
  const step=(act,args={},dice=[])=>{g=advanceOfficialSetup(g,{act,...args},()=>dice.shift());};
  step('official-roll-layout',{},[{A:1,B:3,C:5}[map]]);
  step('official-roll-role',{},[1,6]);
  step('official-defend');
  step('form-enhance',{team:'marines',enhancement:'veterans'});
  step('form-lock',{team:'marines'});
  step('form-open',{team:'orks'});
  step('form-enhance',{team:'orks',enhancement:'warcry'});
  step('form-lock',{team:'orks'});
  step('official-select',{unit:'warboss'});
  step('official-place');
  const prior=snapshot(g);
  delete prior.terrainRevision;
  prior.rules.deployment={defender:'orks',placed:['warboss','captain'],next:'orks'};
  const p=at(find(g,'largeRuin-2'),-1.40,-.50,2.35);
  Object.assign(find(prior,'captain-1'),p);
  return prior;
}
for(const map of ['A','C']){
  test(map+' restores a formerly supported Marine Captain on the second ruin without accepting floating or displaced saves',()=>{
    const old=beforeSecondRuinChange(map);
    const loaded=restore(createTable(),old);
    assert.equal(validPlacedPatrolUnits(loaded),true);
    assert.deepEqual(loaded.rules.deployment.placed,['warboss','captain']);
    assert.equal(loaded.rules.deployment.next,'orks');
    assert.ok(find(loaded,'captain-1').elevation>0);
    const saved=snapshot(loaded);
    assert.equal(saved.terrainRevision,2);
    assert.throws(()=>restore(createTable(),{...old,terrainRevision:2}));
    assert.deepEqual(snapshot(restore(createTable(),saved)),saved);
    for(const edit of [p=>p.elevation=10,p=>{p.x=0;p.z=0;},p=>p.elevation=1.4]){
      for(const input of [old,saved]){
        const broken=structuredClone(input);edit(find(broken,'captain-1'));
        assert.throws(()=>restore(createTable(),broken));
      }
    }
  });
}
test('the registered second ruin is outside both deployment zones of layout B, including its closest outer corner',()=>{
  const table=createTable(),base=find(table,'gretchin-1'),ruin=layoutGeometry('B',2).terrain.find(p=>p.id==='largeRuin-2');
  for(const side of ['orks','marines']){
    const g={...table,layout:{map:'B',blue:side}};
    for(const x of [-2.60,2.60])for(const z of [-2.05,2.05])
      assert.equal(validDeployment(g,{...base,...at(ruin,x,z,2.35)}),false);
  }
  assert.throws(()=>restore(createTable(),beforeSecondRuinChange('B')));
});

test('when a new ground wall occupies the old base, resume the original unit turn after all earlier valid placements',()=>{
  const old=beforeSecondRuinChange('A');
  Object.assign(find(old,'captain-1'),at(find(old,'largeRuin-2'),0,1.70,0));
  assert.throws(()=>restore(createTable(),{...old,terrainRevision:2}));
  const g=restore(createTable(),old);
  assert.deepEqual(g.rules.deployment,{defender:'orks',next:'marines',placed:['warboss'],pending:'captain'});
  assert.equal(g.rules.officialSetup.formationsRevealed,true);
  assert.ok(validPlacedPatrolUnits(g));
  assert.throws(()=>advanceOfficialSetup(g,{act:'official-place'}));
  assert.deepEqual(snapshot(restore(createTable(),snapshot(g))),snapshot(g));
});

test('the upright cast matches the measured corner and long-arm direction on pages 61, 67 and 73',()=>{
  for(const [plan,table,yaw] of [[trainingTwoPlan,createTrainingTwoTable(),Math.PI],
    [trainingThreePlan,createTrainingThreeTable(),0],[trainingFourPlan,createTrainingFourTable(),0]]){
    const w=find(table,'largeRuin-2'),line=trainingTwoWallSegments(w).map(trainingTwoMapPoint);
    const print=plan.walls.find(w=>w.id==='largeRuin-2').points;
    assert.equal(w.yaw,yaw);
    assert.ok(Math.hypot(line[1].x-print[1][0],line[1].z-print[1][1])<1e-7);
    assert.ok((line[0].x-line[1].x)*(print[0][0]-print[1][0])>0);
    assert.ok((line[2].z-line[1].z)*(print[2][1]-print[1][1])>0);
    assert.ok(Math.abs(Math.hypot(line[0].x-line[1].x,line[0].z-line[1].z)-4.86)<1e-7);
    assert.ok(Math.abs(Math.hypot(line[2].x-line[1].x,line[2].z-line[1].z)-3.875)<1e-7);
  }
});

test('old training saves retain the exact ground wall for replay, including placement in a strip occupied by the revised casting',()=>{
  const oldTwo=createTrainingTwo(previousHandbookField(2,createTrainingTwoTable()));
  assert.equal(oldTwo.version,1);
  assert.equal(validateTrainingTwo(oldTwo),true);
  assert.equal(trainingTwoPieces(oldTwo).find(p=>p.id==='largeRuin-2').previousSecondRuin,true);
  assert.equal(createTrainingTwo().version,2);
  const oldThree={...createTrainingThreeDeployment(),version:1,positions:{'boy-1':{x:2.4,z:-2.2}}};
  assert.equal(validateTrainingThreeDeployment(oldThree),true);
  assert.equal(validateTrainingThreeDeployment({...oldThree,version:2}),false);
  const game=actTrainingThreeBattle(createTrainingThreeBattle(oldThree),{type:'next'});
  assert.equal(game.version,1);
  assert.equal(validateTrainingThreeBattle(JSON.parse(JSON.stringify(game))),true);
  const oldFour={...trainingFourDeployment.create(),version:1};
  const four=trainingFourBattle.create(oldFour);
  assert.equal(four.version,1);
  assert.equal(trainingFourBattle.validate(four),true);
  assert.equal(trainingFourBattle.pieces(four).find(p=>p.id==='largeRuin-2').previousSecondRuin,true);
});
