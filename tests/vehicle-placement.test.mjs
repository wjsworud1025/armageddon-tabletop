import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {validDeployment} from '../layouts.mjs';
import {newBattle} from '../rules/battle.mjs';
import {vehicleMapA as mapA,relative,speederPivotDraft} from './fixtures/vehicle-board.mjs';
import {beginMove,proposeMove,finishMove} from '../move-session.mjs';
import {assessReinforcement} from '../rules/reinforcements.mjs';
import {patrolTerrainPlacement as placement} from '../rules/patrol-terrain-placement.mjs';
import {newPatrolSetup} from '../rules/patrol-setup.mjs';
import {advanceOfficialSetup} from '../rules/official-deployment.mjs';
import {snapshot,restore} from '../state.mjs';

const find=(game,id)=>game.pieces.find(p=>p.id===id);
const vehicle='landSpeeder-1',ruin='largeRuin-1';
function commit(g,r){
  g.rules=r.rules;
  for(const [id,pose] of Object.entries(r.poses??{}))Object.assign(find(g,id),pose);
}
test('the map A wing can be cleared by a single 15° pivot at the same location',()=>{
  const game=speederPivotDraft(),p=find(game,vehicle),{x,z}=p;
  assert.throws(()=>finishMove(game),e=>e.assessment?.errors.some(issue=>issue.code==='vehicle-terrain'));
  commit(game,proposeMove(game,p,{[p.id]:[{yaw:p.yaw+Math.PI/12}]}));
  commit(game,finishMove(game));
  assert.deepEqual([p.x,p.z],[x,z]);
  assert.ok(Math.abs(p.yaw-Math.PI)<1e-10);
});

for(const takeToSkies of [false,true]){
  test('map A: a wing clips the ruin at 2.90″ with the entire base clear; correcting the draft permits landing ('+
    (takeToSkies?'flight':'ordinary movement')+')',()=>{
    const game=mapA(),p=find(game,vehicle),t=find(game,ruin);
    const origin=relative(t,-4.75,-1.35),blocked=relative(t,-4.05,0),clear=relative(t,-4.75,0);
    Object.assign(p,origin);
    assert.equal(placement({...p,...blocked},game.pieces,{checkVehicleBody:false}).error,'');
    assert.deepEqual(placement({...p,...blocked},game.pieces).contacts,[ruin]);
    assert.equal(placement({...p,...clear},game.pieces).error,'');
    commit(game,beginMove(game,p,'normal',{takeToSkies}));
    commit(game,proposeMove(game,p,{[vehicle]:[blocked]}));
    const loaded=restore(createTable(),snapshot(game));
    assert.throws(()=>finishMove(loaded),e=>e.assessment?.errors.some(issue=>issue.code==='vehicle-terrain'));
    commit(loaded,proposeMove(loaded,find(loaded,vehicle),{[vehicle]:[clear]}));
    commit(loaded,finishMove(loaded));
    assert.equal(loaded.rules.movePlan,null);assert.equal(find(loaded,vehicle).x,clear.x);
  });
}

test('a reserve vehicle must also fit its body after all the entry and base conditions pass',()=>{
  const g=mapA(),p=find(g,vehicle),t=find(g,ruin);
  Object.assign(t,{x:-15,z:4,yaw:0});
  g.pieces=[p,t];p.removed=true;g.rules.round=3;g.rules.reserves={landSpeeder:[p.id]};
  const check=x=>assessReinforcement(g,'landSpeeder',{[vehicle]:relative(t,x,0)},{mode:'edge'});
  assert.deepEqual(check(-4.05).errors.map(e=>e.code),['vehicle-terrain']);
  assert.ok(check(-4.75).ok);
});

function pendingSpeeder(version){
  let game={...createTable(),logs:[],rules:{...newBattle(),officialSetup:{...newPatrolSetup(),version}}};
  const step=(act,args={},dice=[])=>{game=advanceOfficialSetup(game,{act,...args},()=>dice.shift());};
  step('official-roll-layout',{},[1]);step('official-roll-role',{},[6,2]);step('official-defend');
  step('form-enhance',{team:'marines',enhancement:'veterans'});step('form-lock',{team:'marines'});
  step('form-open',{team:'orks'});step('form-enhance',{team:'orks',enhancement:'warcry'});
  step('form-lock',{team:'orks'});step('official-select',{unit:'landSpeeder'});
  return game;
}

test('pre-v7 committed wing contact survives import; all new placement decisions and v7 completed saves reject it',()=>{
  for(const version of [6,7]){
    const game=pendingSpeeder(version),p=find(game,vehicle),t=find(game,ruin);
    const clear={x:p.x,z:p.z,yaw:p.yaw,elevation:0};
    // This interior pose fits on the blue side. At 2.90″ the wing cuts a wall and at 3.30″ the body cuts the ruined landing.
    const blocked=relative(t,-.62,.75,0);
    assert.ok(validDeployment(game,{...p,...blocked}));
    assert.equal(placement({...p,...blocked},game.pieces,{checkVehicleBody:false}).error,'');
    assert.deepEqual(placement({...p,...blocked},game.pieces).contacts,[ruin]);
    Object.assign(p,blocked);
    const draft=restore(createTable(),snapshot(game));
    assert.throws(()=>advanceOfficialSetup(draft,{act:'official-place'}),/관통/);
    Object.assign(find(draft,vehicle),clear);
    const accepted=advanceOfficialSetup(draft,{act:'official-place'});
    const completed=snapshot(accepted);
    Object.assign(find(completed,vehicle),blocked);
    if(version===6){
      const old=restore(createTable(),completed),previous=find(old,vehicle);
      assert.deepEqual(old.rules.deployment.placed,['landSpeeder']);
      assert.equal(old.rules.deployment.next,'orks');
      assert.deepEqual([previous.x,previous.z,previous.yaw],[blocked.x,blocked.z,blocked.yaw]);
      assert.equal(advanceOfficialSetup(old,{act:'official-select',unit:'warboss'}).rules.deployment.pending,'warboss');
    }else assert.throws(()=>restore(createTable(),completed),/이미 배치한 분대/);
  }
});
