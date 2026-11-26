import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {newBattle,startBattle,groupId} from './battle.mjs';
import {getProfile} from './profiles.mjs';
import {beginOverwatch,openOverwatch,overwatchTargetEligible,overwatchUnits,declineOverwatch} from './overwatch.mjs';
import {canSetPatrolSight,setPatrolSight} from './patrol-sight.mjs';
import {appendDeclaration,lockDeclaration,attackPackets,resolvePacket} from './declarations.mjs';
import {inspectAttackRoll,stepAttackRoll} from './attack-rolls.mjs';

const catalog=createTable().pieces;
const at=(id,x,z=0)=>({...catalog.find(p=>p.id===id),x,z,yaw:0});
const battle=(team='orks')=>({...startBattle(newBattle(),team,5),step:1});
const row=(s,p,i,target,extra={})=>({actor:p.id,weapon:i,target:groupId(s,target),preferred:target.id,distance:0,
  size:1,assigned:0,hit:0,wound:0,extra:0,cover:false,lethal:false,sustained:false,ignore:false,guard:false,...extra});
function dice(...values){
  return ()=>{assert.ok(values.length,'unexpected roll');return (values.shift()-.5)/6;};
}
function armed(s,pieces,actor,target){
  const offer=openOverwatch(s,pieces);
  return beginOverwatch(setPatrolSight(offer,pieces,actor.id,target.id,'visible'),pieces,groupId(s,actor));
}

test('movement end offers only the opponent; pay once, preserve phase and normal orders, or pass for free',()=>{
  const shooter=at('intercessor-3',0),target=at('boy-3',12),others=[shooter,target,at('captain-1',2)];
  const original=battle(),offer=openOverwatch(original,others);
  assert.equal(openOverwatch({...original,step:2},others),null);
  assert.equal(openOverwatch({...original,movePlan:{}},others),null);
  assert.equal(openOverwatch({...original,cp:{marines:0,orks:2}},others),null);
  assert.deepEqual(overwatchUnits(offer,others),['intercessor','captain']);
  assert.ok(!overwatchUnits({...offer,units:{captain:{shocked:true}}},others).includes('captain'));
  assert.deepEqual(overwatchUnits({...offer,patrol:{...offer.patrol,tactics:{other:'1-orks-1/captain'}}},others),['intercessor']);
  assert.deepEqual(overwatchUnits(offer,[shooter,{...target,x:1}]),[]);
  const passed=declineOverwatch(offer);
  assert.equal(passed.cp.marines,1);assert.equal(passed.overwatch.unit,null);
  assert.equal(openOverwatch(passed,others),null);
  const seen=setPatrolSight(setPatrolSight(offer,others,others[2].id,target.id,'visible'),others,shooter.id,target.id,'visible');
  const paid=beginOverwatch(seen,others,'intercessor');
  assert.deepEqual(Object.keys(paid.shootingSight.pairs),[shooter.id]);
  assert.deepEqual([paid.step,paid.active,paid.cp.marines,paid.patrol.tactics['overwatch-marines']],[1,'orks',0,'1-orks-1/intercessor']);
  assert.equal(canSetPatrolSight(paid,others,others[2].id,target.id),false);
  assert.equal(beginOverwatch(paid,others,'intercessor'),null);
  assert.equal(declineOverwatch(paid).cp.marines,0);
});

test('one visible eligible target unit within 24 inches; individual weapon range and its own sight',()=>{
  const actor=at('boy-2',0),seen=at('intercessor-2',20),near=at('intercessor-3',17),captain=at('captain-1',16,5);
  const pieces=[actor,seen,near,captain];
  const s=armed(battle('marines'),pieces,actor,seen);
  const r=row(s,actor,0,seen);
  const first=appendDeclaration(s,pieces,[r]);
  assert.ok(first);assert.equal(first.declaration.mode,'overwatch');assert.ok(first.declaration.rows[0].distance<18);
  assert.equal(appendDeclaration(s,pieces,[{...r,weapon:1}]),null,'own 12-inch pistol cannot reach');
  assert.equal(appendDeclaration(s,pieces,[{...r,preferred:captain.id,target:'captain'}]),null,'unseen captain');
  const seeCaptain=setPatrolSight(first,pieces,actor.id,captain.id,'visible');
  assert.equal(appendDeclaration(seeCaptain,pieces,[row(s,actor,0,captain)]),null);
  assert.equal(lockDeclaration(first,pieces.map(p=>p===near?{...p,x:50}:p)),null,'a board change invalidates sight');
  const missile=at('landSpeeder-1',0),enemy=at('boy-2',28),pair=[missile,enemy];
  const far=armed(battle(),pair,missile,enemy);
  assert.equal(appendDeclaration(far,pair,[row(far,missile,1,enemy)]),null,'48-inch weapon cannot extend the 24-inch cap');
  const spectra=[actor,at('landSpeeder-1',12),at('warboss-1',13)];
  assert.equal(overwatchTargetEligible(s,spectra,actor,spectra[1],getProfile(actor).weapons[0]),false,
    '17.03 only permits an engaged enemy vehicle as a target in your own Shooting phase');
});

test('the 24-inch range cap measures unit to unit, separately from each shooter and weapon',()=>{
  const a=at('boy-1',0),b=at('boy-2',3),target=at('intercessor-3',26),pieces=[a,b,target];
  const s=armed(battle('marines'),pieces,a,target);
  // This synthetic weapon isolates the independent unit-level distance rule.
  assert.equal(overwatchTargetEligible(s,pieces,a,target,{range:48}),true);
  assert.equal(overwatchTargetEligible(s,pieces,a,target,{range:18}),false);
});

test('fast and staged attacks hit only on natural sixes; no critical hits, hit rerolls or normal shooting side effects',()=>{
  const actor=at('intercessor-3',0),target=at('boy-3',12),pieces=[actor,target];
  const initial={...battle(),units:{intercessor:{attacks:{[actor.id]:[{slot:'볼트 라이플',ranged:true}]},finishedAttack:2}}};
  const s=armed(initial,pieces,actor,target);
  const locked=lockDeclaration(appendDeclaration(s,pieces,[row(s,actor,0,target,{hit:1,lethal:true,sustained:true,cover:true})]),pieces);
  assert.equal(attackPackets(locked,pieces)[0].skill,6);
  assert.equal(declineOverwatch(locked),null);
  const fast=resolvePacket(locked,pieces,0,null,dice(5,6,6,1));
  const paused=stepAttackRoll(locked,pieces,0,{type:'begin'},dice(5,6,6,1));
  assert.deepEqual(paused.state.declaration.attackRoll.records.map(r=>[r.kind,r.raw]),[['hit',[5,6]],['wound',[6]],['save',[1]]]);
  const restored=JSON.parse(JSON.stringify(paused.state));
  assert.equal(inspectAttackRoll(restored,pieces).kind,'save');
  const forged=structuredClone(restored);
  forged.declaration.attackRoll.records[0].change={index:0,value:6};
  assert.equal(inspectAttackRoll(forged,pieces),null);
  forged.declaration.attackRoll.records=[{kind:'hit',raw:[5,6]}];
  assert.equal(inspectAttackRoll(forged,pieces),null);
  assert.equal(stepAttackRoll(forged,pieces,0,{type:'reroll',index:0},dice()),null);
  const staged=stepAttackRoll(restored,pieces,0,{type:'keep'},dice());
  for(const result of [fast,staged]){
    assert.deepEqual([result.result.hits,result.result.wounds,result.result.woundDice],[1,1,[6]]);
    assert.equal(result.state.hp[target.id],0);assert.deepEqual(result.removed,{[target.id]:true});
    assert.deepEqual(result.state.units,initial.units);
    assert.equal(result.shootingEvent,null);assert.equal(result.state.shootingSight,undefined);
    assert.equal(result.state.overwatch.stage,'done');assert.equal(result.state.step,1);
  }
  const saved=stepAttackRoll(restored,pieces,0,{type:'reroll',index:0},dice(6));
  assert.equal(saved.state.cp.orks,0);assert.equal(saved.state.hp[target.id],1);
});

test('Torrent auto-hits, and the Ork hazardous weapon queues its hazard without invoking post-shoot abilities',()=>{
  const actor=at('landSpeeder-1',0),target=at('boy-3',7),pieces=[actor,target];
  const armedFlamer=armed(battle(),pieces,actor,target);
  const flamer=lockDeclaration(appendDeclaration(armedFlamer,pieces,[row(armedFlamer,actor,2,target,{lethal:true,sustained:true})]),pieces);
  for(const result of [resolvePacket(flamer,pieces,0,null,dice(1,1)),stepAttackRoll(flamer,pieces,0,{type:'begin'},dice(1,1))]){
    assert.deepEqual(result.result.hitDice,[]);assert.equal(result.result.hits,1);assert.equal(result.result.wounds,0);
  }
  const grot=at('gretchin-3',0),marine=at('intercessor-2',5),pair=[grot,marine];
  const armedGrot=armed(battle('marines'),pair,grot,marine);
  const hazard=lockDeclaration(appendDeclaration(armedGrot,pair,[row(armedGrot,grot,1,marine)]),pair);
  const failed=resolvePacket(hazard,pair,0,null,dice(3));
  assert.deepEqual(failed.state.hazard,{unit:'gretchin',count:1});
  assert.equal(failed.state.overwatch.stage,'done');assert.deepEqual(failed.state.units,{});assert.equal(failed.shootingEvent,null);
});

test('a locked multi-profile Wartrakk volley keeps its target across a casualty and does not suppress it in the Movement phase',()=>{
  const trakk=at('wartrakk-1',0),target=at('intercessor-1',16),other=at('intercessor-3',25);
  const pieces=[trakk,target,other],s=armed(battle('marines'),pieces,trakk,target);
  const draft=appendDeclaration(s,pieces,[row(s,trakk,0,target),row(s,trakk,1,target)]);
  const locked=lockDeclaration(draft,pieces);
  // D3+3 yields four rockets. Only the first hits, wounds, and bypasses the save.
  const rocket=resolvePacket(locked,pieces,0,null,dice(1,6,6,1,1,1,1));
  assert.equal(rocket.result.hits,1);assert.equal(rocket.removed[target.id],true);assert.equal(rocket.finished,false);
  assert.equal(rocket.state.declaration.mode,'overwatch');assert.equal(rocket.state.declaration.focus,'intercessor');
  const saved=JSON.parse(JSON.stringify(rocket.state)),after=pieces.map(p=>p===target?{...p,removed:true}:p);
  assert.deepEqual(attackPackets(saved,after).map(p=>p.index),[1]);
  const shoota=resolvePacket(saved,after,1,null,dice(6,6,1,1,1,1));
  assert.equal(shoota.result.hits,1);assert.equal(shoota.result.damage[0].id,other.id);
  assert.deepEqual(shoota.state.units,{});assert.equal(shoota.state.patrol.suppressed,null);
  assert.equal(shoota.state.shootingReaction,undefined);assert.equal(shoota.shootingEvent,null);
});
