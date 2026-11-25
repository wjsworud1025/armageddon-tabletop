import test from 'node:test';
import assert from 'node:assert/strict';
import {newBattle,resolveHazard} from './battle.mjs';
import {rollHazardPool,finishHazardPool} from './hazard-reroll.mjs';
import {validateRulesState} from './validate.mjs';

const piece=(kind,faction,n=1)=>({id:kind+'-'+n,kind,faction,variant:n-1});
const dice=(...values)=>()=>{assert.ok(values.length);return (values.shift()-.5)/6;};
const fresh=(unit='gretchin',reason=null)=>({...newBattle(),status:'playing',step:reason?1:2,active:'orks',cp:{orks:2,marines:2},
  hazard:{unit,count:2,...(reason?{reason}:{})},...(reason?{movePlan:{unit,type:'fallback',fallbackMode:'desperate'}}:{})});

test('one physical hazard die can change before losses; original die, CP or other dice never change during the offer',()=>{
  const pieces=[piece('gretchin','orks'),piece('gretchin','orks',2)],rules=fresh();
  const wait=rollHazardPool(rules,pieces,dice(1,5));
  assert.ok(validateRulesState(JSON.parse(JSON.stringify(wait.state))));
  assert.deepEqual(wait.state.hazard.commandDice,[1,5]);assert.deepEqual(wait.state.hp,{});
  assert.deepEqual(wait.state.cp,{marines:2,orks:2});assert.deepEqual(wait.removed,{});
  assert.equal(resolveHazard(wait.state,pieces),null);assert.equal(rollHazardPool(wait.state,pieces),null);
  assert.equal(finishHazardPool(wait.state,pieces,2),null);
  const paid=finishHazardPool(JSON.parse(JSON.stringify(wait.state)),pieces,0,dice(6));
  assert.deepEqual(paid.dice,[6,5]);assert.equal(paid.state.cp.orks,1);
  assert.deepEqual(paid.removed,{});assert.equal(paid.state.hazard,null);
  assert.equal(paid.state.units.gretchin.finishedAttack,2);
  assert.equal(finishHazardPool(paid.state,pieces,0),null);
  const kept=finishHazardPool(wait.state,pieces,null,dice());
  assert.equal(kept.remaining,1);assert.deepEqual(kept.dice,[1,5]);assert.equal(kept.state.cp.orks,2);
  assert.equal(kept.state.hazard.commandDice,undefined);
  assert.ok(validateRulesState(kept.state));assert.equal(finishHazardPool(kept.state,pieces,0),null);
  const lost=resolveHazard(kept.state,pieces,pieces[1].id);
  assert.deepEqual(lost.removed,{[pieces[1].id]:true});
});

test('rejects corrupt or already committed hazard choices on import and never reopens a legacy allocation',()=>{
  const p=piece('warboss','orks'),s=rollHazardPool(fresh('warboss'),[p],dice(3,5)).state;
  for(const corrupt of [
    b=>b.hazard.commandDice=[2],b=>b.hazard.commandDice=[1,'3'],b=>b.hazard.commandDice=[7,2],
    b=>b.hazard.dice=[2,2],b=>b.hazard.remaining=1,b=>b.cp.orks=0,b=>b.units.warboss={shocked:true}
  ]){
    const bad=structuredClone(s);corrupt(bad);assert.equal(validateRulesState(bad),false);
  }
  const legacy=fresh('warboss');Object.assign(legacy.hazard,{dice:[1,5],remaining:1});
  assert.ok(validateRulesState(legacy));
  assert.equal(rollHazardPool(legacy,[p]),null);
  assert.equal(finishHazardPool(legacy,[p]),null);
  assert.equal(resolveHazard(legacy,[p]).state.hp[p.id],5);
});

test('escape hazards allow a successful die to get worse; shocked units get no stratagem and lose wounds immediately',()=>{
  const pieces=[piece('warboss','orks')],rules=fresh('warboss','escape');
  rules.hazard.count=1;
  const waiting=rollHazardPool(rules,pieces,dice(5));
  const paid=finishHazardPool(waiting.state,pieces,0,dice(1));
  assert.equal(paid.state.hp['warboss-1'],5);assert.equal(paid.state.hazard,null);
  assert.equal(paid.state.movePlan.desperateEscapeResolved,true);
  assert.equal(paid.state.units.warboss?.finishedAttack,undefined);
  const direct=rollHazardPool({...rules,units:{warboss:{shocked:true}}},pieces,dice(1));
  assert.equal(direct.state.hazard,null);assert.equal(direct.state.hp['warboss-1'],5);assert.equal(direct.state.cp.orks,2);
});

test('reactive hazards spend the rolling player’s CP; original successes can be kept without extra draws',()=>{
  const p=piece('librarian','marines'),rules={...fresh('librarian'),step:4};
  const wait=rollHazardPool(rules,[p],dice(1,6));
  const paid=finishHazardPool(wait.state,[p],0,dice(6));
  assert.deepEqual(paid.state.cp,{marines:1,orks:2});
  const blocked=rollHazardPool({...rules,patrol:{...rules.patrol,tactics:{precision:'1-orks-4/librarian'}}},[p],dice(5,6));
  assert.equal(blocked.state.hazard,null);assert.equal(blocked.state.cp.marines,2);
});
