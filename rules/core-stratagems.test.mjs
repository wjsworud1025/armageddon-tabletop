import test from 'node:test';
import assert from 'node:assert/strict';
import {newBattle} from './battle.mjs';
import {effectWeapon,unitTargetedByStratagem,useTactic} from './patrol.mjs';
import {useInsaneBravery,useEpicChallenge,hasEpicPrecision} from './core-stratagems.mjs';
import {getProfile} from './profiles.mjs';
import {appendDeclaration,lockDeclaration,attackPackets,resolvePacket} from './declarations.mjs';
import {validateRulesState} from './validate.mjs';

const piece=(kind,faction,variant=0)=>({kind,faction,variant,id:kind+'-'+(variant+1)});
const captain=piece('captain','marines'),librarian=piece('librarian','marines');
const boss=piece('warboss','orks'),weirdboy=piece('weirdboy','orks');
const squad=Array.from({length:5},(_,i)=>piece('intercessor','marines',i));
const pieces=[captain,librarian,...squad,boss,weirdboy];
const battle=(overrides={})=>({...newBattle(),status:'playing',cp:{marines:2,orks:2},...overrides});
const activate=(state,key,kind='normal')=>({...state,step:4,fightSequence:{
  stage:'remaining',team:state.active,piled:[],fought:[key],consolidated:[],engagedAtFightStart:[key],
  eligibleDuringFight:[key],reactions:[],passes:0,active:{unit:key,kind,extraPile:kind==='overrun',reaction:false}
}});
const melee={range:0},gun={range:12};

test('Bravery passes a pending own Command test, spends 1 CP and keeps previous state intact',()=>{
  const rules=battle({hp:{[captain.id]:3},units:{captain:{movementTracked:true}}});
  const passed=useInsaneBravery(rules,pieces,'captain');
  assert.deepEqual(passed.cp,{marines:1,orks:2});
  assert.deepEqual(passed.units.captain,{movementTracked:true,shocked:false,shockChecked:true});
  assert.equal(unitTargetedByStratagem(passed,'captain'),true);
  assert.deepEqual(rules.cp,{marines:2,orks:2});
  assert.deepEqual(rules.units.captain,{movementTracked:true});
});

test('Bravery checks original attached starting strength including lost bodyguards',()=>{
  const rules=battle({attachments:{[captain.id]:'intercessor'}});
  const casualties=n=>pieces.map(p=>squad.slice(0,n).includes(p)?{...p,removed:true}:p);
  assert.equal(useInsaneBravery(rules,casualties(2),'intercessor'),null);
  assert.ok(useInsaneBravery(rules,casualties(3),'intercessor'));
  assert.ok(useInsaneBravery(rules,casualties(5),'intercessor'));
});

test('Bravery rejects healthy, destroyed, non-playing, enemy, empty, shocked, checked, spent and already targeted units',()=>{
  const ready=battle({hp:{[captain.id]:2}});
  for(const change of [
    {hp:{}},{hp:{[captain.id]:0}},{status:'setup'},{step:3},{active:'orks'},
    {cp:{marines:0,orks:1}},{units:{captain:{shocked:true}}},{units:{captain:{shockChecked:true}}},
    {patrol:{...ready.patrol,tactics:{prior:'1-marines-0/captain'}}}
  ]) assert.equal(useInsaneBravery({...ready,...change},pieces,'captain'),null);
  assert.equal(useInsaneBravery(ready,pieces,'missing'),null);
});

test('Bravery is once per whole battle for each player, including after a save round trip',()=>{
  const rules=battle({hp:{[captain.id]:1,[librarian.id]:1,[boss.id]:1}});
  const used=JSON.parse(JSON.stringify(useInsaneBravery(rules,pieces,'captain')));
  assert.equal(useInsaneBravery({...used,round:2},pieces,'librarian'),null);
  const ork=useInsaneBravery({...used,active:'orks'},pieces,'warboss');
  assert.deepEqual(ork.cp,{marines:1,orks:1});
});

test('each of the four living characters can use Epic Challenge on either player’s fight turn',()=>{
  for(const model of [captain,librarian,boss,weirdboy]){
    for(const active of ['marines','orks']){
      const rules=activate(battle({active}),model.kind);
      const used=useEpicChallenge(rules,pieces,model.id);
      assert.equal(used.cp[model.faction],1);
      assert.equal(hasEpicPrecision(used,model,melee),true);
      assert.equal(hasEpicPrecision(used,model,gun),false);
      assert.equal(hasEpicPrecision(rules,model,melee),false);
    }
  }
});

test('Epic Challenge distinguishes the selected attached model, blocks other stratagems on the unit, and expires at phase end',()=>{
  const ready=activate(battle({attachments:{[captain.id]:'intercessor'}}),'intercessor');
  const used=useEpicChallenge(ready,pieces,captain.id);
  assert.equal(hasEpicPrecision(used,squad[0],melee),false);
  assert.equal(hasEpicPrecision(used,librarian,melee),false);
  assert.equal(hasEpicPrecision({...used,step:5},captain,melee),false);
  assert.equal(hasEpicPrecision({...used,active:'orks'},captain,melee),false);
  assert.equal(useTactic(used,'precision','intercessor','marines',false),null);
});

test('Epic Challenge is limited once per player per phase, with both sides independently eligible',()=>{
  const used=useEpicChallenge(activate(battle(),'captain'),pieces,captain.id);
  assert.equal(useEpicChallenge(activate(used,'librarian'),pieces,librarian.id),null);
  const both=useEpicChallenge(activate(used,'warboss'),pieces,boss.id);
  assert.deepEqual(both.cp,{marines:1,orks:1});
  assert.equal(hasEpicPrecision(both,captain,melee),true);
  assert.equal(hasEpicPrecision(both,boss,melee),true);
  assert.ok(useEpicChallenge(activate({...both,active:'orks'},'librarian'),pieces,librarian.id));
});

test('Epic Challenge only opens just after selection, including overrun before its extra pile-in and consolidation reaction fights',()=>{
  const ready=activate(battle(),'captain'),overrun=activate(battle(),'captain','overrun');
  assert.ok(useEpicChallenge(overrun,pieces,captain.id));
  assert.ok(useEpicChallenge({...ready,fightSequence:{stage:'consolidate',active:{...ready.fightSequence.active,reaction:true}}},pieces,captain.id));
  for(const change of [
    {fightSequence:null},{fightSequence:{active:null}},{step:3},{status:'finished'},
    {cp:{marines:0,orks:2}},{declaration:{unit:'captain'}},{hazard:{unit:'captain'}},{fightPlan:{unit:'captain'}},
    {fightSequence:{active:{...overrun.fightSequence.active,extraPile:false}}},
    {units:{captain:{shocked:true}}},{units:{captain:{finishedAttack:4}}},
    {units:{captain:{attacks:{[captain.id]:[{slot:'melee',ranged:false,pistol:false}]}}}},
    {hp:{[captain.id]:0}}
  ]) assert.equal(useEpicChallenge({...ready,...change},pieces,captain.id),null);
  assert.equal(useEpicChallenge(ready,pieces,librarian.id),null);
  assert.equal(useEpicChallenge(activate(battle(),'intercessor'),pieces,squad[0].id),null);
  const shot={...ready,units:{captain:{finishedAttack:2,attacks:{[captain.id]:[{slot:'gun',ranged:true,pistol:false}]}}}};
  assert.ok(useEpicChallenge(shot,pieces,captain.id));
});

test('a printed Precision weapon pauses before saves; a declared character alone never overrides the bodyguard',()=>{
  const ork=activate(battle({active:'orks'}),'weirdboy');
  const rules={...ork,step:2,fightSequence:null,attachments:{[librarian.id]:'intercessor'}};
  const row={actor:weirdboy.id,weapon:0,target:'intercessor',preferred:librarian.id,distance:8,size:6,
    assigned:0,hit:0,wound:0,extra:0,cover:false,lethal:false,sustained:false,ignore:false,guard:false};
  const locked=lockDeclaration(appendDeclaration(rules,pieces,[row]),pieces);
  let rolls=0;
  const one=resolvePacket(locked,pieces,0,librarian.id,()=>{rolls++;return .99;});
  assert.deepEqual([rolls,one.precisionRoll.wounds],[2,1]);
  assert.equal(one.finished,false);
  const resumed=JSON.parse(JSON.stringify(one.state));
  assert.equal(validateRulesState(resumed),true);
  assert.equal(resolvePacket(resumed,pieces,0,librarian.id,()=>0),null);
  assert.equal(resolvePacket(resumed,pieces,0,librarian.id,()=>0,squad[0].id),null);
  assert.equal(resolvePacket(resumed,pieces,0,librarian.id,()=>0,boss.id),null);
  const skipped=resolvePacket(resumed,pieces,0,librarian.id,()=>0,null);
  assert.equal(skipped.result.damage[0].id,squad[0].id);
  const picked=resolvePacket(resumed,pieces,0,squad[0].id,()=>0,librarian.id);
  assert.deepEqual(picked.result.hitDice,one.precisionRoll.hitDice);
  assert.equal(picked.result.damage[0].id,librarian.id);
  assert.deepEqual(picked.shootingEvent,{shooter:'weirdboy',targets:['intercessor'],didShoot:true});
  const miss=resolvePacket(locked,pieces,0,librarian.id,()=>0);
  assert.equal(miss.finished,true);
  assert.equal(miss.precisionRoll,undefined);
  for(const change of [{index:1},{count:0},{wounds:'bad'},{hits:30},{devastating:2},{hitDice:[7]}]){
    const invalid=structuredClone(resumed);
    Object.assign(invalid.declaration.precisionRoll,change);
    assert.equal(validateRulesState(invalid),false);
  }
});

test('Challenge only changes the chosen model in the same unit; save history is per faction and per model',()=>{
  const picked=useEpicChallenge(activate(battle({attachments:{[librarian.id]:'intercessor'}}),'intercessor'),pieces,librarian.id);
  const state={...picked,fightSequence:null};
  assert.equal(effectWeapon(state,librarian,melee,'intercessor').precision,true);
  assert.equal(!!effectWeapon(state,squad[0],melee,'intercessor').precision,false);
  assert.equal(!!effectWeapon(state,librarian,gun,'intercessor').precision,false);
  assert.equal(validateRulesState(state),true);
  const row={target:'warboss',preferred:boss.id,distance:1,size:1,assigned:1,hit:0,wound:0,extra:0,
    cover:false,lethal:false,sustained:false,ignore:false,guard:false};
  const rows=[librarian,squad[0]].map(p=>({...row,actor:p.id,weapon:getProfile(p).weapons.findIndex(w=>w.range===0)}));
  const locked=lockDeclaration(appendDeclaration(state,pieces,rows),pieces);
  assert.equal(attackPackets(locked,pieces).length,2);
  for(const mutate of [
    s=>{s.units.intercessor.epicChallengeModel=boss.id},
    s=>{s.patrol.tactics['epicChallenge-marines']='1-marines-4/warboss'},
    s=>{s.patrol.spent['epicChallenge-marines']='<script>'}
  ]){
    const invalid=structuredClone(state);mutate(invalid);
    assert.equal(validateRulesState(invalid),false);
  }
});

test('Precision uses one selection for normal and devastating wounds; a destroyed character hands remaining attacks to the defender',()=>{
  const base=activate(battle({active:'orks',attachments:{[librarian.id]:'intercessor'}}),'weirdboy');
  const rules=useEpicChallenge(base,pieces,weirdboy.id);
  const row={actor:weirdboy.id,weapon:3,target:'intercessor',preferred:squad[0].id,distance:1,size:6,
    assigned:3,hit:0,wound:0,extra:0,cover:false,lethal:false,sustained:false,ignore:false,guard:false};
  const dice=(...values)=>()=>{assert.ok(values.length);return (values.shift()-.5)/6;};
  for(const startingHP of [1,4]){
    const locked=lockDeclaration(appendDeclaration({...rules,hp:{[librarian.id]:startingHP}},pieces,[row]),pieces);
    const one=resolvePacket(locked,pieces,0,null,dice(6,5,6,5,6,6));
    assert.equal(one.precisionRoll.devastating,1);
    const two=resolvePacket(one.state,pieces,0,squad[0].id,dice(6,1),librarian.id);
    assert.deepEqual(two.result.saves,[1,6]);
    assert.equal(two.result.damage[0].id,librarian.id);
    assert.equal(two.result.damage[1].id,startingHP===1?squad[0].id:librarian.id);
    assert.equal(two.state.hazard.count,1);
  }
});
