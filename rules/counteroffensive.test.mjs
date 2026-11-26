import test from 'node:test';
import assert from 'node:assert/strict';
import {newBattle,advance,resolveHazard} from './battle.mjs';
import {useTactic} from './patrol.mjs';
import {beginFightSequence,fightOptions,transitionFight,resolveCounteroffensive} from '../fight-sequence.mjs';
import {appendDeclaration,lockDeclaration,resolvePacket} from './declarations.mjs';
import {validateRulesState} from './validate.mjs';

function fixture(active='orks',source='warboss',flags={}){
  const poses=[['warboss',0,0],['captain',2,0],['weirdboy',0,8],['librarian',2,8]];
  const pieces=poses.map(([kind,x,z])=>({id:kind+'-1',kind,variant:0,x,z,yaw:0,baseWidth:1,baseDepth:1,
    faction:['captain','librarian'].includes(kind)?'marines':'orks'}));
  const game={pieces,rules:{...newBattle(),status:'playing',active,step:4,cp:{marines:3,orks:3},units:flags}};
  let seq=beginFightSequence(game);
  for(let i=0;i<2;i++)seq=transitionFight(game,seq,{type:'pass'});
  game.rules.fightSequence=transitionFight(game,seq,{type:'select',unit:source});
  return game;
}
function rollAttack(game,{source='warboss',target='captain',weapon=1,random=()=>0}={}){
  const row={actor:source+'-1',weapon,target,preferred:target+'-1',distance:1,size:1,assigned:1,
    hit:0,wound:0,extra:0,cover:false,lethal:false,sustained:false,ignore:false,guard:false};
  const draft=appendDeclaration(game.rules,game.pieces,[row]);
  const locked=lockDeclaration(draft,game.pieces);
  return resolvePacket(locked,game.pieces,0,null,random).state;
}

test('opponent pays two once after a real enemy attack, even a miss; owns the next activation',()=>{
  const game=fixture('orks','warboss',{warboss:{charged:true},weirdboy:{charged:true},captain:{fightsFirst:true}});
  assert.equal(resolveCounteroffensive(game,'librarian'),null);
  game.rules=rollAttack(game);
  const offered=game.rules;
  assert.equal(validateRulesState(offered),true);
  assert.deepEqual(fightOptions(game,offered.fightSequence).counters,['captain','librarian']);
  assert.equal(advance(offered),offered);
  assert.throws(()=>transitionFight(game,offered.fightSequence,{type:'finish'}));
  assert.equal(resolveCounteroffensive(game,'weirdboy'),null);
  const declined=resolveCounteroffensive(game,null);
  assert.equal(declined.cp.marines,3);
  assert.equal(resolveCounteroffensive({...game,rules:declined},'librarian'),null);
  game.rules=resolveCounteroffensive(game,'librarian');
  assert.deepEqual(game.rules.cp,{marines:1,orks:3});
  assert.equal(game.rules.units.librarian.fightsFirst,true);
  assert.equal(validateRulesState(JSON.parse(JSON.stringify(game.rules))),true);
  assert.equal(resolveCounteroffensive(game,'captain'),null);
  assert.equal(useTactic(game.rules,'precision','librarian','marines',false),null);
  const seq=transitionFight(game,game.rules.fightSequence,{type:'finish'});
  assert.equal(seq.stage,'first');
  assert.deepEqual(fightOptions(game,seq).units,['librarian']);
  assert.throws(()=>transitionFight(game,seq,{type:'select',unit:'captain'}));
  assert.equal(transitionFight(game,seq,{type:'select',unit:'librarian'}).active.unit,'librarian');
});

test('only surviving eligible unspent units qualify; cost, shock, phase use, no attacks and consolidation are checked',()=>{
  for(const condition of ['spent','cost','shocked','already targeted','already fought','dead','no attacks','consolidation']){
    const game=fixture();
    const s=game.rules;
    if(condition==='spent')s.patrol.spent.counteroffensive='1-orks-4';
    if(condition==='cost')s.cp.marines=1;
    if(condition==='already targeted')s.patrol.tactics={precision:'1-orks-4/captain',consolidate:'1-orks-4/librarian'};
    if(condition==='shocked')s.units={captain:{shocked:true},librarian:{shocked:true}};
    if(condition==='already fought')s.fightSequence.fought.push('librarian','captain');
    if(condition==='consolidation'){s.fightSequence.stage='consolidate';s.fightSequence.active.reaction=true;}
    if(condition==='dead'||condition==='no attacks'){
      s.hp['librarian-1']=0;
      if(condition==='dead')s.hp['captain-1']=1;
      else s.fightSequence.engagedAtFightStart=['warboss','librarian','captain'];
    }
    if(condition==='no attacks'){
      const row={actor:'warboss-1',weapon:1,target:'captain',preferred:'captain-1',distance:1,size:1,assigned:1,hit:0,wound:0,
        extra:0,cover:false,lethal:false,sustained:false,ignore:false,guard:false};
      const locked=lockDeclaration(appendDeclaration(s,game.pieces,[row]),game.pieces);
      const removed=game.pieces.map(p=>p.kind==='captain'?{...p,removed:true}:p);
      // An otherwise eligible surviving unit cannot react to an empty pool.
      locked.hp['librarian-1']=4;
      assert.equal(resolvePacket(locked,removed,0).state.fightSequence.counterAfter,undefined);
    }else{
      const dice=[.5,.99,0]; // Ordinary hit, wound, failed invulnerable save.
      const result=rollAttack(game,condition==='dead'?{random:()=>dice.shift()??0}:{});
      assert.equal(result.fightSequence.counterAfter,undefined,condition);
    }
  }
});

test('hazard of the active player resolves before the defensive choice; promotion restarts First in Remaining Combats',()=>{
  const game=fixture('orks','weirdboy');
  game.rules=rollAttack(game,{source:'weirdboy',target:'librarian',weapon:3});
  assert.equal(game.rules.fightSequence.stage,'remaining');
  assert.equal(game.rules.fightSequence.counterAfter,'weirdboy');
  assert.ok(game.rules.hazard);
  assert.equal(resolveCounteroffensive(game,'captain'),null);
  assert.equal(validateRulesState(game.rules),true);
  game.rules=resolveHazard(game.rules,game.pieces,null,()=>.99).state;
  game.rules=resolveCounteroffensive(game,'captain');
  const sequence=transitionFight(game,game.rules.fightSequence,{type:'finish'});
  assert.equal(sequence.stage,'first');assert.equal(sequence.team,'marines');
  assert.deepEqual(fightOptions(game,sequence).units,['captain']);
});

test('both patrols can defend; old saves are not offered retroactive reactions; corrupt sources and payment are rejected',()=>{
  const g=fixture('marines','captain');
  g.rules=rollAttack(g,{source:'captain',target:'warboss'});
  const offer=g.rules.fightSequence;
  assert.deepEqual(fightOptions(g,offer).counters,['warboss','weirdboy']);
  const legacy=structuredClone(g.rules);
  delete legacy.fightSequence.counterAfter;
  assert.ok(validateRulesState(legacy));
  assert.equal(resolveCounteroffensive({...g,rules:legacy},'warboss'),null);
  for(const mutate of [
    s=>s.fightSequence.counterAfter='warboss',s=>s.fightSequence.counterAfter='<html>',
    s=>s.units.captain.finishedAttack=2,s=>s.active='orks'
  ]){
    const bad=structuredClone(g.rules);mutate(bad);
    assert.equal(validateRulesState(bad),false);
  }
  const paid=resolveCounteroffensive(g,'warboss');assert.equal(paid.cp.orks,1);
  assert.equal(validateRulesState(paid),true);
  const bad=structuredClone(paid);bad.patrol.tactics.counteroffensive='1-marines-4/captain';
  assert.equal(validateRulesState(bad),false);
});

test('split attacks open a single window after the final packet, including a vanished last target',()=>{
  const g=fixture();
  const first={actor:'warboss-1',weapon:1,target:'captain',preferred:'captain-1',distance:1,size:1,assigned:3,
    hit:0,wound:0,extra:0,cover:false,lethal:false,sustained:false,ignore:false,guard:false};
  const last={...first,target:'librarian',preferred:'librarian-1'};
  const locked=lockDeclaration(appendDeclaration(g.rules,g.pieces,[first,last]),g.pieces);
  const partial=resolvePacket(locked,g.pieces,0,null,()=>0).state;
  assert.equal(partial.fightSequence.counterAfter,undefined);
  assert.equal(partial.declaration.didFight,true);
  assert.equal(validateRulesState(partial),true);
  const dead=g.pieces.map(p=>p.kind==='librarian'?{...p,removed:true}:p);
  const final=resolvePacket(partial,dead,1,null,()=>{throw Error('Empty last packet must not roll');}).state;
  assert.equal(final.fightSequence.counterAfter,'warboss');
  assert.deepEqual(fightOptions({rules:final,pieces:dead},final.fightSequence).counters,['captain']);
});
