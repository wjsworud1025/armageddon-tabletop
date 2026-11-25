import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {newBattle,startBattle} from './battle.mjs';
import {appendDeclaration,lockDeclaration,resolvePacket} from './declarations.mjs';
import {stepAttackRoll,inspectAttackRoll} from './attack-rolls.mjs';
import {validateRulesState} from './validate.mjs';
import {restore} from '../state.mjs';

const board=createTable(),by=id=>board.pieces.find(p=>p.id===id);
const begin={type:'begin'},keep={type:'keep'},paid=index=>({type:'reroll',index}),select=choice=>({type:'select',choice});
const sample=(...values)=>{let i=0;return ()=>{assert.ok(i<values.length,'future result requested before a decision');return values[i++];};};
const d=n=>(n-.5)/6;
function shot(actor,weapon,target,more={},setup={}){
  const team=by(actor).faction,game={...startBattle(newBattle(),team,5),step:2,...setup};
  const row={actor,weapon,target:game.attachments[target]??(by(target).kind==='boy'?'boy-0':by(target).kind),preferred:target,
    distance:8,size:1,assigned:0,hit:0,wound:0,extra:0,cover:false,lethal:false,sustained:false,ignore:false,guard:false,...more};
  return lockDeclaration(appendDeclaration(game,board.pieces,[row]),board.pieces);
}
const go=(state,action,...values)=>stepAttackRoll(state,board.pieces,0,action,sample(...values));
function saved(out,kind,raw){
  assert.equal(out.event.kind,kind);if(raw)assert.deepEqual(out.event.raw,raw);
  const data=JSON.parse(JSON.stringify(out.state));
  assert.equal(validateRulesState(data,board.pieces),true);
  const game=restore(board,{...board,version:1,rules:data});
  assert.deepEqual(inspectAttackRoll(game.rules,game.pieces).raw,raw);
  assert.deepEqual(game.rules.hp,out.state.hp);
  assert.equal(resolvePacket(game.rules,game.pieces,0),null);
  return game.rules;
}

test('D3+3 random attacks are rolled per firing weapon before hits; accepting reveals only the next roll',()=>{
  const initial=shot('wartrakk-1',0,'captain-1');
  let state=saved(go(initial,begin,0),'attacks',[1]);
  const out=go(state,keep,...Array(4).fill(0));state=saved(out,'hit',[1,1,1,1]);
  assert.equal(state.cp.orks,1);
  assert.deepEqual(state.declaration.attackRoll.records.map(r=>r.kind),['attacks','hit']);
  const paidOut=go(state,paid(1),d(6),d(6),d(1));
  state=saved(paidOut,'save',[1]);
  assert.equal(state.cp.orks,0);assert.equal(state.cp.marines,1);
  assert.deepEqual(state.declaration.attackRoll.records[1],{kind:'hit',raw:[1,1,1,1],closed:true,change:{index:1,value:6}});
  const final=go(state,paid(0),d(6));
  assert.deepEqual(final.state.cp,{marines:0,orks:0});assert.equal(final.result.count,4);
  assert.equal(final.result.hits,1);assert.deepEqual(final.result.saves,[6]);assert.deepEqual(final.result.damage,[]);
  const changed=go(saved(go(initial,begin,0),'attacks',[1]),paid(0),.99,...Array(6).fill(0));
  assert.equal(changed.result.count,6);assert.equal(changed.state.cp.orks,0);
});

test('Torrent creates no hit roll, Lethal Hits create no wound die; wound reroll happens before save',()=>{
  const flamer=shot('landSpeeder-1',2,'warboss-1');
  let state=saved(go(flamer,begin,0),'attacks',[1]);
  state=saved(go(state,keep,0),'wound',[1]);
  const failed=go(state,paid(0),.99,0);state=saved(failed,'save',[1]);
  assert.equal(state.cp.marines,0);assert.equal(state.cp.orks,1);
  const final=go(state,keep);assert.deepEqual(final.result.hitDice,[]);assert.deepEqual(final.result.woundDice,[6]);
  const lethal=shot('captain-1',0,'warboss-1',{lethal:true});
  state=saved(go(lethal,begin,.99),'hit',[6]);state=saved(go(state,keep,0),'save',[1]);
  assert.deepEqual(go(state,keep).result.woundDice,[]);
});

test('damage is rolled for one allocated model at a time; MELTA bonus is applied after the reroll',()=>{
  const gun=shot('landSpeeder-1',0,'warboss-1');
  let state=saved(go(gun,begin,.99,.99),'hit',[6,6]);
  state=saved(go(state,keep,.99,.99),'wound',[6,6]);
  state=saved(go(state,keep,0,0),'save',[1,1]);
  const first=go(state,keep,0);state=saved(first,'damage',[1]);
  assert.deepEqual([first.event.model,first.event.remaining,first.event.bonus],['warboss-1',6,2]);
  assert.equal(state.hazard,undefined);assert.deepEqual(state.hp,{});
  const final=go(state,paid(0),.99);
  assert.deepEqual(final.result.damage,[{id:'warboss-1',raw:8,lost:6,remaining:0}]);
  assert.deepEqual(final.removed,{'warboss-1':true});assert.equal(final.shootingEvent.didShoot,true);
});

test('defender rerolls unsorted raw saves; defender fixes model before the attacker sees its damage',()=>{
  const gun=shot('landSpeeder-1',0,'boy-2');
  let state=saved(go(gun,begin,.99,.99),'hit',[6,6]);
  state=saved(go(state,keep,.99,.99),'wound',[6,6]);
  state=saved(go(state,keep),'order');
  state=saved(go(state,select('boy-2'),.99,0),'save',[6,1]);
  // Save 6 against AP-4 still fails; the now lower selected result is sorted first.
  const choice=go(state,paid(0),d(2));state=saved(choice,'model');
  assert.deepEqual(state.declaration.attackRoll.records.at(-2).change,{index:0,value:2});
  assert.equal(choice.event.save,1);
  const first=go(state,select('boy-4'),0);state=saved(first,'damage',[1]);assert.equal(first.event.model,'boy-4');
  const second=go(state,keep);state=saved(second,'model');assert.equal(second.event.choices.includes('boy-4'),false);
  assert.equal(second.event.save,2);state=saved(go(state,select('boy-2'),0),'damage',[1]);
  const final=go(state,keep);assert.deepEqual(final.result.damage.map(p=>p.id),['boy-4','boy-2']);
});

test('Precision allocates after wounds and before defending dice; unavailable rolls advance for free',()=>{
  const gun=shot('weirdboy-1',0,'captain-1',{}, {attachments:{'captain-1':'intercessor'},cp:{orks:0,marines:0}});
  let state=saved(go(gun,begin,.99,.99),'precision');
  assert.equal(go(state,select('warboss-1')),null);
  const final=go(state,select('captain-1'),0);assert.deepEqual(final.result.damage.map(p=>p.id),['captain-1']);
  assert.deepEqual(final.state.cp,{orks:0,marines:0});
  const hazard=shot('gretchin-1',1,'vanguard-1',{distance:4});
  state=saved(go(hazard,begin,0),'hit',[1]);assert.equal(state.hazard,undefined);
  const done=go(state,keep);assert.equal(done.state.hazard.count,1);assert.deepEqual(done.shootingEvent.targets,['vanguard']);
});

test('restored histories reject out-of-order or hidden future dice, mismatch in die sizes, and unpaid replacement',()=>{
  const state=saved(go(shot('wartrakk-1',0,'captain-1'),begin,0),'attacks',[1]);
  const real=saved(go(state,keep,0,0,0,0),'hit',[1,1,1,1]);
  for(const mutate of [
    r=>r[0].raw[0]=4,r=>r[1].raw.push(1),r=>r[0].change={index:0,value:3},r=>r[1].kind='wound',
    r=>r.push({kind:'save',raw:[5]}),r=>r[1].raw[0]='<img>',
  ]){
    const corrupt=structuredClone(real);mutate(corrupt.declaration.attackRoll.records);
    assert.throws(()=>restore(board,{...board,version:1,rules:corrupt}));
  }
  assert.deepEqual(state.declaration.attackRoll.records,[{kind:'attacks',raw:[1]}]);
});



test('a pending roll cannot be replayed against a second target with the same weapon profile',()=>{
  const first=shot('intercessor-1',0,'gretchin-1');
  const second={...first.declaration.rows[0],actor:'intercessor-2',target:'warboss',preferred:'warboss-1'};
  const initial=lockDeclaration(appendDeclaration({...first,declaration:{...first.declaration,locked:false}},board.pieces,[second]),board.pieces);
  const state=saved(go(initial,begin,0,0),'hit',[1,1]);
  assert.equal(stepAttackRoll(state,board.pieces,1,keep,sample()),null);
  assert.equal(stepAttackRoll(state,board.pieces,1,paid(0),sample()),null);
  assert.deepEqual(state.hp,{});
  const one=go(state,keep);
  assert.equal(one.finished,false);assert.deepEqual(one.state.declaration.rows.map(r=>r.done),[true,false]);
  const two=stepAttackRoll(one.state,board.pieces,1,begin,sample(.99,0));
  assert.deepEqual(two.event.raw,[6,1]);assert.equal(two.state.declaration.focus,'warboss');
  assert.equal(two.state.declaration.attackRoll.records.length,1);
});
