import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {newBattle,startBattle,advance,modelProfile} from './battle.mjs';
import {beginCharge,selectChargeTargets,proposeCharge,finishCharge,cancelCharge} from '../charge-session.mjs';
import {useTactic} from './patrol.mjs';
import {validateRulesState} from './validate.mjs';
import {terrifyingChargeTargets,resolveTerrifyingCharge,declineTerrifyingCharge} from './terrifying-charge.mjs';
import {snapshot,restore} from '../state.mjs';

const find=(g,id)=>g.pieces.find(p=>p.id===id);
function fixture({attached=false,two=false}={}){
  const game={...createTable(),logs:[]};
  game.rules={...startBattle(newBattle(),'marines',5),step:3,round:2,cp:{marines:2,orks:2}};
  for(const p of game.pieces)p.removed=true;
  function add(id,x,z){Object.assign(find(game,id),{x,z,removed:false,elevation:0,yaw:0})}
  add('captain-1',0,0);add('warboss-1',6,0);
  if(attached){add('boy-2',7.65,0);game.rules.attachments['warboss-1']='boy-0';}
  if(two)add('weirdboy-1',5.75,2.0);
  return game;
}
function apply(g,c){g.rules=c.rules;for(const [id,pose] of Object.entries(c.poses??{}))Object.assign(find(g,id),pose);}
function charge(g,targets=['warboss']){
  apply(g,beginCharge(g,'captain-1',{dice:[4,4]}));
  apply(g,selectChargeTargets(g,targets));
  apply(g,proposeCharge(g,'captain-1',{'captain-1':[{x:4.1,z:targets.length>1?.6:0}]}));
  apply(g,finishCharge(g));
}
const randomDie=d=>(()=>(d-.5)/6);

test('after actual successful charge the payer is the Marine unit, the chosen enemy suffers the modified test, once',()=>{
  const g=fixture(),orc=find(g,'warboss-1');
  assert.deepEqual(terrifyingChargeTargets(g),[]);assert.equal(useTactic(g.rules,'shockCharge','captain','marines',false),null);
  charge(g);assert.deepEqual(terrifyingChargeTargets(g),['warboss']);
  assert.strictEqual(advance(g.rules,g.pieces),g.rules);
  assert.throws(()=>beginCharge(g,'captain-1',{dice:[2,2]}));
  let n=0;const random=()=>{n++;return randomDie(3)()};
  assert.throws(()=>resolveTerrifyingCharge(g,'boy-1',random));assert.equal(n,0);
  const c=resolveTerrifyingCharge(g,'warboss',random);apply(g,c);
  assert.equal(n,2);assert.deepEqual(c.dice,[3,3]);assert.equal(c.total,5);assert.equal(c.leadership,6);
  assert.equal(c.passed,false);assert.equal(g.rules.units.warboss.shocked,true);
  assert.equal(g.rules.units.warboss.shockChecked,undefined);assert.equal(modelProfile(g.rules,orc).oc,0);
  assert.equal(g.rules.cp.marines,1);assert.equal(g.rules.cp.orks,2);
  assert.throws(()=>resolveTerrifyingCharge(g,'warboss',random));assert.equal(n,2);
  assert.equal(advance(g.rules,g.pieces).terrifyingResult,undefined);
});


test('select either engaged enemy group, use best living attached Leadership, and avoid applying shock to its neighbour',()=>{
  const g=fixture({attached:true,two:true});charge(g,['boy-0','weirdboy']);
  assert.deepEqual(terrifyingChargeTargets(g),['boy-0','weirdboy']);
  for(const [key,ld] of [['boy-0',6],['weirdboy',7]]){
    const c=resolveTerrifyingCharge(g,key,randomDie(2));
    assert.equal(c.leadership,ld);assert.equal(c.rules.units[key].shocked,true);
    assert.equal(c.rules.units[key==='boy-0'?'weirdboy':'boy-0']?.shocked,undefined);
    assert.equal(modelProfile(c.rules,find(g,'warboss-1')).oc,key==='boy-0'?0:1);
    assert.equal(modelProfile(c.rules,find(g,'boy-2')).oc,key==='boy-0'?0:2);
  }
});

test('success at modified threshold does not clear prior shock, or confer a Command-phase check',()=>{
  for(const existing of [false,true]){
    const g=fixture();g.rules.units.warboss={shocked:existing};charge(g);
    const rolls=[3,4];const c=resolveTerrifyingCharge(g,'warboss',()=>randomDie(rolls.shift())());
    assert.equal(c.total,6);assert.equal(c.passed,true);
    assert.deepEqual(c.rules.units.warboss,{shocked:existing});
  }
});

test('declining is free, consumes the event, and permits ordinary phase handover',()=>{
  const g=fixture();charge(g);apply(g,declineTerrifyingCharge(g));
  assert.deepEqual(g.rules.patrol.spent,{});assert.equal(g.rules.cp.marines,2);
  assert.throws(()=>resolveTerrifyingCharge(g,'warboss'));assert.throws(()=>declineTerrifyingCharge(g));
  assert.equal(advance(g.rules,g.pieces).step,4);
});

test('no window for a failed charge, opponent turn or charge unit already targeted by a stratagem',()=>{
  const failed=fixture();apply(failed,beginCharge(failed,'captain-1',{dice:[1,1]}));apply(failed,cancelCharge(failed));
  assert.deepEqual(terrifyingChargeTargets(failed),[]);
  for(const mod of [
    r=>{r.cp.marines=0},r=>{r.units.captain={shocked:true}},
    r=>{r.patrol.spent.shockCharge='2-marines-3'},
    r=>{r.patrol.tactics['commandReroll-marines']='2-marines-3/captain'}]){
    const g=fixture();mod(g.rules);charge(g);assert.equal(g.rules.terrifyingCharge,undefined);
  }
  const orks=fixture();orks.rules.active='orks';
  apply(orks,beginCharge(orks,'warboss-1',{dice:[4,4]}));apply(orks,selectChargeTargets(orks,['captain']));
  apply(orks,proposeCharge(orks,'warboss-1',{'warboss-1':[{x:1.9}]}));apply(orks,finishCharge(orks));
  assert.equal(orks.rules.terrifyingCharge,undefined);
});

test('capture the event on finish only, persist offer and result, and reject forged or stale live windows',()=>{
  const g=fixture();charge(g);
  const saved=snapshot(g),restored=restore(createTable(),saved);
  assert.deepEqual(terrifyingChargeTargets(restored),['warboss']);
  const old=structuredClone(saved);delete old.rules.terrifyingCharge;
  assert.deepEqual(terrifyingChargeTargets(restore(createTable(),old)),[]);
  for(const change of [
    r=>r.terrifyingCharge.round++,r=>r.terrifyingCharge.targets.push('warboss'),r=>r.terrifyingCharge.targets=['boy-0'],
    r=>r.terrifyingCharge.unit='intercessor',r=>r.chargeWindow=true,r=>r.cp.marines=0,
    r=>delete r.units.captain.charge,r=>r.units.captain.charged=false,r=>r.patrol.spent.shockCharge='2-marines-3']){
    const bad=structuredClone(saved);change(bad.rules);assert.throws(()=>restore(createTable(),bad));
  }
  const moved=structuredClone(saved);moved.pieces.find(p=>p.id==='warboss-1').x=20;
  assert.throws(()=>restore(createTable(),moved));
  const charged=resolveTerrifyingCharge(restored,'warboss',randomDie(3));apply(restored,charged);
  const done=snapshot(restored);assert.deepEqual(snapshot(restore(createTable(),done)),done);
  for(const change of [r=>r.terrifyingResult.leadership=11,r=>r.terrifyingResult.dice=[7,3],r=>r.terrifyingResult.dice.pop(),
    r=>r.terrifyingResult.round=4,r=>r.terrifyingResult.target='captain',
    r=>delete r.patrol.spent.shockCharge]){
    const malformed=structuredClone(done);change(malformed.rules);assert.equal(validateRulesState(malformed.rules,malformed.pieces),false);
  }
  const historical=structuredClone(done);delete historical.rules.terrifyingResult;delete historical.rules.units.warboss;
  assert.deepEqual(snapshot(restore(createTable(),historical)),historical);
});

test('decline leaves the option for a later charging unit but payment spends it for this phase',()=>{
  for(const skip of [true,false]){
    const g=fixture();
    Object.assign(find(g,'librarian-1'),{removed:false,x:0,z:9});
    Object.assign(find(g,'weirdboy-1'),{removed:false,x:6,z:9});
    charge(g);apply(g,skip?declineTerrifyingCharge(g):resolveTerrifyingCharge(g,'warboss',randomDie(3)));
    apply(g,beginCharge(g,'librarian-1',{dice:[4,4]}));
    apply(g,selectChargeTargets(g,['weirdboy']));apply(g,proposeCharge(g,'librarian-1',{'librarian-1':[{x:4.1,z:9}]}));
    apply(g,finishCharge(g));assert.deepEqual(terrifyingChargeTargets(g),skip?['weirdboy']:[]);
  }
});

test('a successful Captain reaction during the Ork end-of-phase window never triggers the own-phase stratagem',()=>{
  const g=fixture();g.rules.active='orks';g.rules.chargeWindow=true;g.rules.units.warboss={charged:true};
  apply(g,beginCharge(g,'captain-1',{mode:'masterOfBattle',endOfPhase:true,dice:[3,3]}));
  apply(g,selectChargeTargets(g,['warboss']));apply(g,proposeCharge(g,'captain-1',{'captain-1':[{x:4.1}]}));
  apply(g,finishCharge(g));assert.ok(g.rules.units.captain.charged);
  assert.deepEqual(terrifyingChargeTargets(g),[]);assert.ok(g.rules.chargeWindow);
});
