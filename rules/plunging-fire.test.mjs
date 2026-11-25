import assert from 'node:assert/strict';
import test from 'node:test';
import {createTable} from '../data/catalog.mjs';
import {snapshot,restore} from '../state.mjs';
import {newBattle,startBattle,attackSkill,attackThresholds} from './battle.mjs';
import {getProfile} from './profiles.mjs';
import {setPatrolSight} from './patrol-sight.mjs';
import {attackPackets,appendSightedDeclaration,lockSightedDeclaration,plungingFireAtDeclaration,resolvePacket,
  plungingSightCandidates,confirmPlungingSight} from './declarations.mjs';
import {stepAttackRoll,inspectAttackRoll} from './attack-rolls.mjs';
import {validateRulesState} from './validate.mjs';
import * as THREE from '../vendor/three.module.min.js';
import {createPiece,pieceGeometry} from '../assets/pieces.mjs';

const high='intercessor-1',low='intercessor-2',ground='boy-2',upper='boy-3';
function setup() {
  const game={...createTable(),rules:{...startBattle(newBattle(),'marines',5),step:2},logs:[]};
  const positions={
    'largeRuin-1':[0,0,0],[high]:[-.9,-.55,3.37],[low]:[-4,0,0],
    [ground]:[2,2,0],[upper]:[4,3,2.35]
  };
  for(const p of game.pieces){
    p.removed=!positions[p.id];
    [p.x,p.z,p.elevation]=positions[p.id]??[0,0,0];
    p.yaw=0;
  }
  return game;
}
const find=(pieces,id)=>pieces.find(p=>p.id===id);
const row=(actor,weapon=0)=>({actor,weapon,target:'boy-0',preferred:ground,distance:8,size:2,assigned:0,
  cover:false,guard:false,hit:0,wound:0,extra:0,lethal:false,sustained:false,ignore:false});
function plan(game,rows) {
  let s=game.rules;
  for(const id of new Set(rows.map(r=>r.actor)))s=setPatrolSight(s,game.pieces,id,upper,'visible');
  return lockSightedDeclaration(appendSightedDeclaration(s,game.pieces,rows),game.pieces);
}
test('22.05 uses a supported shooter and a visible unit containing a living ground-level model; that member need not be visible',()=>{
  const {rules,pieces}=setup(),a=find(pieces,high),onFloor=find(pieces,ground),upstairs=find(pieces,upper);
  const [gun,,melee]=getProfile(a).weapons;
  const eligible=(actor,weapon,targets,visible=true)=>plungingFireAtDeclaration(rules,pieces,actor,weapon,targets,visible);
  assert.ok(eligible(a,gun,[onFloor,upstairs]));
  assert.equal(eligible(a,gun,[upstairs]),false);
  assert.equal(eligible(a,gun,[{...onFloor,removed:true},upstairs]),false);
  assert.equal(eligible(a,gun,[onFloor],false),false);
  assert.equal(eligible(a,melee,[onFloor]),false);
  assert.equal(eligible(a,{...gun,skill:0,torrent:true},[onFloor]),false);
  assert.equal(eligible({...a,x:10},gun,[onFloor]),false);
  assert.equal(eligible(find(pieces,low),gun,[onFloor]),false);
});
test('mixed-height rifles resolve separately at the appropriate BS in both the fast and replayable roll paths',()=>{
  const g=setup(),p=g.pieces,s=plan(g,[row(high),row(low)]);
  assert.deepEqual(s.declaration.rows.map(r=>r.plunging),[true,false]);
  assert.deepEqual(attackPackets(s,p).map(x=>[x.indices,x.plunging,x.skill]),[[[0],true,2],[[1],false,3]]);
  const twos=()=>.2;
  assert.equal(resolvePacket(s,p,0,null,twos).result.hits,2);
  assert.equal(resolvePacket(s,p,1,null,twos).result.hits,0);
  const start=stepAttackRoll(s,p,0,{type:'begin'},twos);
  assert.deepEqual(start.event.raw,[2,2]);
  const restored=restore(createTable(),snapshot({...g,rules:start.state}));
  assert.equal(inspectAttackRoll(restored.rules,restored.pieces).packet.skill,2);
  const second=stepAttackRoll(restored.rules,restored.pieces,0,{type:'keep'},twos);
  assert.equal(second.event.kind,'wound');
  assert.deepEqual(second.event.raw,[2,2]);
  assert.equal(restore(createTable(),snapshot({...g,rules:second.state})).rules.declaration.attackRoll.records.length,2);
  const noElevation=stepAttackRoll(s,p,1,{type:'begin'},twos);
  assert.equal(stepAttackRoll(noElevation.state,p,1,{type:'keep'},twos).result.hits,0);
  const forged=structuredClone(s);
  forged.declaration.rows[1].plunging=true;
  forged.declaration.rows[1].plungingVisible=[upper];
  assert.equal(validateRulesState(forged,p),false);
});
test('each new group of attack dice checks for a surviving ground target, and old locked saves keep their original BS',()=>{
  const g=setup(),p=g.pieces,s=plan(g,[row(high),{...row(low),extra:1}]);
  const deterministic=[.99,.99,0,0,0,0];let i=0;
  const first=resolvePacket(s,p,1,ground,()=>deterministic[i++]??0);
  assert.equal(first.removed[ground],true);
  assert.equal(first.state.hp[upper],1);
  const saved=restore(createTable(),snapshot({...g,pieces:p.map(m=>first.removed[m.id]?{...m,removed:true}:m),rules:first.state}));
  assert.equal(attackPackets(saved.rules,saved.pieces)[0].skill,3);
  assert.equal(resolvePacket(saved.rules,saved.pieces,0,null,()=>.2).result.hits,0);
  const old=structuredClone(s);old.declaration.rows.forEach(r=>{delete r.plunging;delete r.plungingVisible;});
  const legacy=restore(createTable(),snapshot({...g,rules:old}));
  assert.deepEqual(attackPackets(legacy.rules,legacy.pieces).map(x=>x.indices),[[0,1]]);
  assert.equal(attackPackets(legacy.rules,legacy.pieces)[0].skill,3);
  const edited=structuredClone(s);edited.declaration.rows[0].plunging='yes';
  assert.equal(validateRulesState(edited,p),false);
});
test('a surviving ground-level model cannot supply line of sight after the only confirmed visible member dies',()=>{
  const g=setup(),p=g.pieces,s=plan(g,[row(high),row(low)]);
  assert.deepEqual(s.declaration.rows[0].plungingVisible,[upper]);
  const dice=[.99,.99,0,0];let i=0;
  const first=resolvePacket(s,p,1,upper,()=>dice[i++]??0);
  assert.equal(first.removed[upper],true);
  assert.equal(first.state.hp[ground],1);
  assert.equal(attackPackets(first.state,p)[0].plunging,false);
  assert.deepEqual(plungingSightCandidates(first.state,p,0).map(t=>t.id),[ground]);
  for(const [index,target] of [[1,ground],[0,upper],[0,high],[0,'gretchin-2'],['0',ground]]){
    assert.equal(confirmPlungingSight(first.state,p,index,target),null);
  }
  for(const change of [{attackRoll:{index:0}},{precisionRoll:{index:0}},{focus:'warboss'},{locked:false}]){
    assert.deepEqual(plungingSightCandidates({...first.state,declaration:{...first.state.declaration,...change}},p,0),[]);
  }
  assert.deepEqual(plungingSightCandidates(first.state,p.map(m=>m.id===high?{...m,x:12}:m),0),[]);
  const again=confirmPlungingSight(first.state,p,0,ground);
  assert.deepEqual(again.declaration.rows[0],{...first.state.declaration.rows[0],plungingVisible:[upper,ground]});
  assert.equal(again.declaration.rows[1],first.state.declaration.rows[1]);
  assert.equal(confirmPlungingSight(again,p,0,ground),null);
  const saved=restore(createTable(),snapshot({...g,rules:again,pieces:p.map(m=>m.id===upper?{...m,removed:true}:m)}));
  assert.equal(attackPackets(saved.rules,saved.pieces)[0].skill,2);
  assert.equal(resolvePacket(saved.rules,saved.pieces,0,null,()=>.2).result.hits,2);
  assert.equal(resolvePacket(first.state,p,0,null,()=>.2).result.hits,0);
  for(const witnesses of [[],[upper,upper],[high],['largeRuin-1']]){
    const edited=structuredClone(s);edited.declaration.rows[0].plungingVisible=witnesses;
    assert.equal(validateRulesState(edited,p),false);
  }
});
test('skill applies cover and height before its limits, independently of hit dice and psychic/ignored penalties',()=>{
  const {rules,pieces}=setup(),gun=getProfile(find(pieces,high)).weapons[0];
  assert.equal(attackSkill(gun,{plunging:true,cover:true}),3);
  assert.equal(attackSkill({...gun,skill:2},{plunging:true,cover:true}),2);
  assert.equal(attackSkill({...gun,skill:2},{plunging:true}),2);
  assert.equal(attackSkill({...gun,skill:6},{cover:true}),6);
  assert.equal(attackSkill({...gun,psychic:true},{cover:true,plunging:true}),2);
  assert.equal(attackSkill(gun,{cover:true,plunging:true,ignorePenalties:true}),2);
  assert.equal(attackSkill({...gun,torrent:true,skill:0},{cover:true,plunging:true}),0);
  const target=find(pieces,upper),defenders=[{...target,profile:getProfile(target)}];
  const test=attackThresholds(rules,defenders,{...gun,skill:4},{cover:false,plunging:true,hitMod:2,woundMod:0,ignorePenalties:false});
  assert.equal(test.hits(1),false);
  assert.equal(test.hits(2),true);
});

test('the first terrain query after rendering, repeated previews, save replay and a hit roll use exactly the two attack dice',()=>{
  const game=setup(),p=game.pieces,terrain=find(p,'largeRuin-1');
  // Exercise a fresh cast even if other tests have prepared the stock mesh.
  terrain.baseWidth+=.011;
  const rendered=createPiece(THREE,terrain).children[0].geometry;
  const original=Math.random;
  let used=0;
  Math.random=()=>{
    assert.ok(used<2,'a non-dice operation used the attack dice');
    used++;return .2;
  };
  try{
    assert.equal(pieceGeometry(THREE,terrain),rendered);
    const locked=plan(game,[row(high),row(low)]);
    assert.equal(attackPackets(locked,p)[0].skill,2);
    assert.equal(attackPackets(locked,p)[0].skill,2);
    assert.equal(used,0);
    const start=stepAttackRoll(locked,p,0,{type:'begin'});
    assert.deepEqual(start.event.raw,[2,2]);
    assert.deepEqual(inspectAttackRoll(start.state,p).raw,[2,2]);
    assert.deepEqual(snapshot({...game,rules:start.state}).rules.declaration.attackRoll.records[0].raw,[2,2]);
    assert.equal(used,2);
  }finally{Math.random=original;}
});
