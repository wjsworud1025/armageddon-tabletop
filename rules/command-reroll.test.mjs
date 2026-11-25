import test from 'node:test';
import assert from 'node:assert/strict';
import {newBattle} from './battle.mjs';
import {acceptMovementRoll,useCommandReroll} from './command-reroll.mjs';
import {beginMove,proposeMove,rewindMove,rerollMove} from '../move-session.mjs';
import {beginCharge,selectChargeTargets,rewindCharge,rerollCharge} from '../charge-session.mjs';
import {validateRulesState} from './validate.mjs';

const p=(kind,faction,x)=>({kind,id:kind+'-1',name:kind,variant:0,faction,x,z:0,yaw:0,elevation:0,baseWidth:1,baseDepth:1});
const captain=p('captain','marines',0),boss=p('warboss','orks',7);
const table=(active,step)=>({width:44,depth:30,pieces:[captain,boss],
  rules:{...newBattle(),status:'playing',active,step,cp:{marines:3,orks:3}}});
const apply=(g,next)=>({...g,rules:next.rules,pieces:g.pieces.map(p=>({...p,...next.poses?.[p.id]}))});
const payMove=(g,p,n=6)=>rerollMove(g,p,undefined,{command:true,random:()=>((n-.5)/6)});

test('advance saves its raw D6 and optional offer, logs both results and preserves the paid use across save and undo',()=>{
  const g=table('marines',1);
  const waiting=apply(g,beginMove(g,captain,'advance',{advanceRoll:5}));
  const previous=structuredClone(waiting.rules);
  assert.ok(validateRulesState(previous));
  const paid=payMove(waiting,captain,1);assert.match(paid.message,/5 → 1/);
  assert.deepEqual(waiting.rules,previous);
  assert.equal(paid.rules.movePlan.advanceRoll,1);assert.equal(paid.rules.units.captain.rerolled,true);
  assert.equal(paid.rules.cp.marines,2);assert.equal(paid.rules.patrol.tactics['commandReroll-marines'],'1-marines-1/captain');
  assert.ok(validateRulesState(JSON.parse(JSON.stringify(paid.rules))));
  assert.throws(()=>payMove(apply(waiting,paid),captain));
  assert.throws(()=>payMove({...waiting,rules:acceptMovementRoll(previous)},captain));
  const travelled=apply(waiting,proposeMove(waiting,captain,{[captain.id]:[{x:-1}]}));
  assert.throws(()=>payMove(apply(travelled,rewindMove(travelled)),captain));
});

test('Orks can pick their free advance or the paid reroll, never both; an ineligible original roll gets no offer later',()=>{
  const g=table('orks',1),waiting=apply(g,beginMove(g,boss,'advance',{advanceRoll:2}));
  const free=apply(waiting,rerollMove(waiting,boss,3));
  assert.equal(free.rules.cp.orks,3);assert.throws(()=>payMove(free,boss));
  const paid=apply(waiting,payMove(waiting,boss));assert.throws(()=>rerollMove(paid,boss,3));
  for(const amend of [
    s=>s.cp.orks=0,s=>s.units.warboss={shocked:true},
    s=>s.patrol.tactics.other='1-orks-1/warboss',s=>s.patrol.spent['commandReroll-orks']='1-orks-1'
  ]){
    const game=table('orks',1);amend(game.rules);
    const draft=apply(game,beginMove(game,boss,'advance',{advanceRoll:2}));
    assert.equal(draft.rules.movePlan.commandRerollOpen,undefined);
    assert.throws(()=>payMove(draft,boss));
  }
  const legacy=structuredClone(waiting);delete legacy.rules.movePlan.commandRerollOpen;
  assert.ok(validateRulesState(legacy.rules));assert.throws(()=>payMove(legacy,boss));
});

test('charges replace both dice before target selection, including a failed original roll; true rerolls can worsen',()=>{
  const start=table('marines',3),g=apply(start,beginCharge(start,captain,{dice:[1,1]}));
  assert.ok(validateRulesState(g.rules));
  const draws=[.7,.99];
  const paid=rerollCharge(g,()=>draws.shift());assert.deepEqual(paid.rules.chargePlan.dice,[5,6]);
  assert.equal(paid.rules.units.captain.charge,11);assert.equal(paid.rules.cp.marines,2);assert.equal(draws.length,0);
  assert.ok(validateRulesState(paid.rules));assert.throws(()=>rerollCharge(apply(g,paid)));
  const long=apply(start,beginCharge(start,captain,{dice:[6,6]}));
  assert.equal(rerollCharge(long,()=>0).rules.chargePlan.roll,2);
  const selected=apply(long,selectChargeTargets(long,['warboss']));
  assert.throws(()=>rerollCharge(apply(selected,rewindCharge(selected))));
  const legacy=structuredClone(long);delete legacy.rules.chargePlan.commandRerollOpen;
  assert.ok(validateRulesState(legacy.rules));assert.throws(()=>rerollCharge(legacy));
});

test('captain ability permits a paid counter-charge reroll with its 6-inch cap; Heroic Intervention spent the unit’s stratagem',()=>{
  const g=table('orks',3);g.rules.chargeWindow=true;g.rules.units.warboss={charged:true};
  const cap=apply(g,beginCharge(g,captain,{mode:'masterOfBattle',endOfPhase:true,dice:[1,1]}));
  const paid=rerollCharge(cap,()=>.99);assert.deepEqual(paid.rules.chargePlan.dice,[6,6]);assert.equal(paid.rules.chargePlan.roll,6);
  assert.equal(paid.rules.cp.marines,2);assert.ok(validateRulesState(paid.rules));
  for(const mode of ['leapToDefend','intoTheFray']){
    const used=apply(g,beginCharge(g,captain,{mode,endOfPhase:true,dice:[2,3]}));
    assert.equal(used.rules.chargePlan.commandRerollOpen,undefined);assert.throws(()=>rerollCharge(used));
  }
});

test('a dice pool rerolls one selected raw D3; forbids previous rerolls, duplicate phase use and malformed snapshots',()=>{
  const state=table('orks',3).rules;
  const event={kind:'attacks',unit:'warboss',team:'orks',sides:3,dice:[3,2],rerolled:[1]};
  assert.equal(useCommandReroll(state,event,1,()=>0),null);
  const done=useCommandReroll(state,event,0,()=>0);
  assert.deepEqual(done.dice,[1,2]);assert.deepEqual(done.rerolled,[1,0]);
  assert.equal(useCommandReroll(done.rules,{...event,unit:'weirdboy'},0),null);
  const g=table('marines',3),draft=beginCharge(g,captain,{dice:[1,2]}).rules;
  for(const corrupt of [
    s=>s.cp.marines=0,s=>s.chargePlan.commandRerollOpen='yes',s=>s.chargePlan.targets=['warboss'],
    s=>s.patrol.tactics.other='1-marines-3/captain'
  ]){
    const bad=structuredClone(draft);corrupt(bad);assert.equal(validateRulesState(bad),false);
  }
});
