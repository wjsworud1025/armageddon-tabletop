import test from 'node:test';
import assert from 'node:assert/strict';
import {newPatrolSetup,patrolSetupView,applyPatrolSetup,validatePatrolSetup} from './patrol-setup.mjs';
import {newBattle,startBattle} from './battle.mjs';

function act(s,type,data={},dice=[]){
  const before=structuredClone(s);
  let n=0;
  const next=applyPatrolSetup(s,{type,...data},()=>{
    assert.ok(n<dice.length,'unexpected dice draw');return dice[n++];
  });
  assert.equal(n,dice.length);
  assert.deepEqual(s,before);
  assert.equal(validatePatrolSetup(JSON.parse(JSON.stringify(next))),true);
  return next;
}
const reject=(s,action)=>assert.throws(()=>applyPatrolSetup(s,action,()=>assert.fail('illegal action rolled a die')),/준비 행동/);

test('one D6 fixes the published A/B/C map without selecting roles or first player',()=>{
  for(const [index,map] of ['A','A','B','B','C','C'].entries()){
    const s=act(newPatrolSetup(),'roll-layout',{},[index+1]);
    assert.equal(s.layoutDie,index+1);
    assert.deepEqual(patrolSetupView(s),{stage:'role-roll',map,roleWinner:null,attacker:null,defender:null,blue:null,first:null});
    reject(s,{type:'roll-layout'});
  }
});

test('ties roll another pair for both sides; only the eventual winner assigns roles and blue is the defender',()=>{
  let s=act(newPatrolSetup(),'roll-layout',{},[5]);
  s=act(s,'roll-role',{},[4,4]);s=act(s,'roll-role',{},[1,1]);
  assert.equal(patrolSetupView(s).stage,'role-roll');
  reject(s,{type:'choose-role',team:'marines',role:'defender'});
  s=act(s,'roll-role',{},[2,3]);
  assert.deepEqual(s.roleRolls,[[4,4],[1,1],[2,3]]);
  assert.equal(patrolSetupView(s).roleWinner,'orks');
  reject(s,{type:'roll-role'});reject(s,{type:'choose-role',team:'marines',role:'attacker'});
  reject(s,{type:'choose-role',team:'orks',role:'blue'});
  for(const [role,blue] of [['defender','orks'],['attacker','marines']]){
    const next=act(s,'choose-role',{team:'orks',role});
    const view=patrolSetupView(next);
    assert.deepEqual([view.map,view.stage,view.defender,view.blue,view.first],['C','formations',blue,blue,null]);
    assert.notEqual(view.attacker,view.defender);
    reject(next,{type:'choose-role',team:'orks',role:'attacker'});
  }
});

test('begin the independent first-turn roll only after revealed formations and deployment; winner takes first turn',()=>{
  let s=act(newPatrolSetup(),'roll-layout',{},[3]);
  s=act(s,'roll-role',{},[6,1]);s=act(s,'choose-role',{team:'marines',role:'attacker'});
  reject(s,{type:'deployment-complete'});reject(s,{type:'roll-first'});
  s=act(s,'formations-revealed');assert.equal(patrolSetupView(s).stage,'deployment');
  reject(s,{type:'roll-first'});reject(s,{type:'formations-revealed'});
  s=act(s,'deployment-complete');s=act(s,'roll-first',{},[3,3]);
  const restored=JSON.parse(JSON.stringify(s));
  s=act(restored,'roll-first',{},[2,6]);
  assert.deepEqual(s.firstRolls,[[3,3],[2,6]]);
  const view=patrolSetupView(s);
  assert.deepEqual([view.stage,view.roleWinner,view.first,view.defender],['ready','marines','orks','orks']);
  reject(s,{type:'roll-first'});reject(s,{type:'choose-first',team:'marines'});
  assert.equal(startBattle(newBattle(),view.first,5).active,'orks');
});

test('invalid D6 and incomplete callbacks cannot mutate even a partially rolled roll-off',()=>{
  const s=act(newPatrolSetup(),'roll-layout',{},[2]);
  for(const bad of [0,7,3.5,undefined,'6']){
    let calls=0;
    assert.throws(()=>applyPatrolSetup(s,{type:'roll-role'},()=>++calls===1?5:bad),/D6/);
    assert.deepEqual(s.roleRolls,[]);
    assert.throws(()=>applyPatrolSetup(newPatrolSetup(),{type:'roll-layout'},()=>bad),/D6/);
  }
  reject(s,{type:'roll-role',winner:'orks'});
  assert.equal(validatePatrolSetup(undefined),false);
});

test('resumption rejects wrong winners, premature checkpoints, additional post-win dice and fabricated derived values',()=>{
  let valid=newPatrolSetup();
  for(const [type,details,dice] of [
    ['roll-layout',{},[6]],['roll-role',{},[3,4]],['choose-role',{team:'orks',role:'defender'},[]],
    ['formations-revealed',{},[]],['deployment-complete',{},[]],['roll-first',{},[6,5]],
  ])valid=act(valid,type,details,dice);
  for(const change of [{layoutDie:null},{layoutDie:8},{roleChoice:null},{roleChoice:{team:'marines',role:'defender'}},
    {roleChoice:{team:'orks',role:'defender',blue:'orks'}},{roleRolls:[[1,2],[1,2]]},{roleRolls:[[6,6]]},
    {roleRolls:[[1,7]]},{firstRolls:[[4,1],[2,2]]},{firstRolls:[[3,,]]},{firstRolls:[[]]},
    {formationsRevealed:false},{deploymentComplete:false},{stage:'ready'},{first:'orks'}]){
    assert.equal(validatePatrolSetup({...valid,...change}),false,JSON.stringify(change));
  }
  for(const old of [newBattle(),startBattle(newBattle(),'marines',3)]){
    assert.equal(Object.hasOwn(old,'patrolSetup'),false);
    assert.equal(old.rounds,old.status==='setup'?5:3);
  }
});
