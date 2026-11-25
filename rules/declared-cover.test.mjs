import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {snapshot,restore} from '../state.mjs';
import {newBattle,startBattle} from './battle.mjs';
import {setPatrolSight} from './patrol-sight.mjs';
import {appendDeclaration,appendSightedDeclaration,lockDeclaration,lockSightedDeclaration,attackPackets,resolvePacket,
  pendingManualCover,confirmDraftCover} from './declarations.mjs';
import {inspectAttackRoll,stepAttackRoll} from './attack-rolls.mjs';
import {validateRulesState} from './validate.mjs';

const layout={map:'A',blue:'marines'},a='intercessor-1',b='intercessor-2',inside='boy-2',other='boy-3';
const home=[-15.46,-6.18],outside=[-20.78,13.75];
function table(mixed=false){
  const game={...createTable(),rules:{...startBattle(newBattle(),'marines',5),step:2},layout,logs:[]};
  const at={[a]:[-12,0],[b]:[-13,0],[inside]:home,[other]:mixed?outside:[home[0]+2,home[1]]};
  for(const p of game.pieces){
    if(p.faction==='terrain')continue;
    p.removed=!at[p.id];
    [p.x,p.z]=at[p.id]??[0,0];p.yaw=0;p.elevation=0;
  }
  return game;
}
const row=(actor,cover=false)=>({actor,weapon:0,target:'boy-0',preferred:other,distance:12,size:2,assigned:0,
  cover,guard:false,hit:0,wound:0,extra:0,lethal:false,sustained:false,ignore:false});
function evidence(state,pieces,rows){
  for(const {actor} of rows)state=setPatrolSight(state,pieces,actor,inside,'visible');
  return state;
}
function draft(g,rows){
  const s=evidence(g.rules,g.pieces,rows);
  return appendSightedDeclaration(s,g.pieces,rows,undefined,layout);
}
const lock=(s,g)=>lockSightedDeclaration(s,g.pieces,[],undefined,layout);
const face=n=>()=>(n-.5)/6;

test('13.08 automatic and manual cover combine only once; staged and immediate results match the shown BS',()=>{
  const g=table(),p=g.pieces,s=lock(draft(g,[row(a),row(b,true)]),g);
  assert.deepEqual(s.declaration.rows.map(r=>[r.areaCover,r.manualCover,r.cover]),[[true,false,true],[true,true,true]]);
  const [packet]=attackPackets(s,p);
  assert.deepEqual([packet.indices,packet.cover,packet.skill],[[0,1],true,4]);
  assert.equal(resolvePacket(s,p,0,null,face(3)).result.hits,0);
  const begin=stepAttackRoll(s,p,0,{type:'begin'},face(3));
  assert.deepEqual(begin.event.raw,[3,3,3,3]);
  const copy=restore(createTable(),snapshot({...g,rules:begin.state}));
  assert.equal(inspectAttackRoll(copy.rules,copy.pieces).packet.skill,4);
  const keep=stepAttackRoll(copy.rules,copy.pieces,0,{type:'keep'},face(3));
  assert.equal(keep.result.hits,0);
  const paid=stepAttackRoll(copy.rules,copy.pieces,0,{type:'reroll',index:0},face(4));
  assert.equal(paid.result.hits,1);
  assert.equal(paid.state.cp.marines,0);
});

test('locking remeasures the area separately from each shooter’s manual choice',()=>{
  const g=table(),p=g.pieces,s=draft(g,[row(a),row(b,true)]);
  const mover=p.find(x=>x.id===other);[mover.x,mover.z]=outside;
  assert.equal(lock(s,g),null);
  assert.deepEqual(pendingManualCover(s,p),[1]);
  const locked=lock(evidence(confirmDraftCover(s,p,1,true),p,s.declaration.rows),g);
  assert.deepEqual(locked.declaration.rows.map(r=>[r.areaCover,r.manualCover,r.cover]),[[false,false,false],[false,true,true]]);
  assert.deepEqual(attackPackets(locked,p).map(k=>[k.indices,k.skill]),[[[0],3],[[1],4]]);
  const free=lockSightedDeclaration(draft(table(),[row(a)]),table().pieces,[],undefined,null);
  assert.equal(free.declaration.rows[0].cover,false);
});

test('a new declaration or reviewing one stale shooter never confirms an earlier shooter on a changed board',()=>{
  const g=table(true),p=g.pieces,c='intercessor-3';
  const third=p.find(t=>t.id===c);Object.assign(third,{x:-13,z:1.5,removed:false});
  let s=draft(g,[row(a,true),row(b,true)]);
  assert.deepEqual(pendingManualCover(s,p),[]);
  p.find(t=>t.id==='largeRuin-1').yaw+=.1;
  assert.deepEqual(pendingManualCover(s,p),[0,1]);
  s=evidence(s,p,[row(a),row(b),row(c)]);
  const after=appendSightedDeclaration(s,p,[row(c,true)],undefined,layout);
  assert.deepEqual(pendingManualCover(after,p),[0,1]);
  assert.equal(lock(after,g),null);
  const checked=confirmDraftCover(after,p,1,true);
  assert.deepEqual(pendingManualCover(checked,p),[0]);
  assert.equal(checked.declaration.rows[2].manualCover,true);
  const restored=restore(createTable(),snapshot({...g,rules:checked}));
  assert.deepEqual(pendingManualCover(restored.rules,restored.pieces),[0]);
  assert.equal(confirmDraftCover(restored.rules,restored.pieces,1,false),null);
  const reviewed=confirmDraftCover(restored.rules,restored.pieces,0,false);
  const locked=lock(reviewed,restored);
  assert.deepEqual(locked.declaration.rows.map(r=>r.cover),[false,true,true]);
  assert.deepEqual(pendingManualCover(locked,restored.pieces),[]);
  assert.equal(confirmDraftCover(locked,restored.pieces,0,true),null);
  // Removing the first row shifts indices, but the other row remains stale.
  const shortened={...after,declaration:{...after.declaration,rows:after.declaration.rows.slice(1)}};
  assert.deepEqual(pendingManualCover(shortened,p),[0]);
  const oldDraft=appendDeclaration(g.rules,p,[row(a,true)]);
  assert.deepEqual(pendingManualCover(oldDraft,p),[0]);
  assert.equal(confirmDraftCover(oldDraft,p,0,true).declaration.coverBoard[a].length,6);
});

test('removing the only uncovered model leaves later weapons at their declared cover, including across restore',()=>{
  const g=table(true),p=g.pieces,s=lock(draft(g,[row(a,true),row(b)]),g);
  const dice=[.99,.99,0,0];let i=0;
  const shot=resolvePacket(s,p,0,other,()=>dice[i++]??0);
  assert.equal(shot.removed[other],true);
  assert.equal(shot.state.hp[inside],1);
  const copy=restore(createTable(),snapshot({...g,rules:shot.state,pieces:p.map(t=>t.id===other?{...t,removed:true}:t)}));
  assert.deepEqual(attackPackets(copy.rules,copy.pieces).map(k=>[k.cover,k.skill]),[[false,3]]);
  assert.equal(resolvePacket(copy.rules,copy.pieces,1,null,face(3)).result.hits,2);
});

test('saved cover qualifiers reject contradictions and forged area claims while legacy locked declarations preserve their dice',()=>{
  const g=table(),p=g.pieces,s=lock(draft(g,[row(a)]),g);
  for(const change of [{manualCover:'no'},{areaCover:1},{cover:false},{manualCover:undefined},{areaCover:false,cover:false}]){
    const edit=structuredClone(s);Object.assign(edit.declaration.rows[0],change);
    assert.equal(validateRulesState(edit,p,layout),false);
  }
  assert.equal(validateRulesState(s,p,null),false);
  const obsolete=lock(draft(g,[row(a,true)]),g);
  obsolete.declaration.coverBoard=structuredClone(obsolete.declaration.coverBoard);
  obsolete.declaration.coverBoard[a][0]+=1;
  assert.equal(validateRulesState(obsolete,p,layout),false);
  const legacy=lockDeclaration(appendDeclaration(g.rules,p,[row(a)]),p);
  const begin=stepAttackRoll(legacy,p,0,{type:'begin'},face(3));
  const copy=restore(createTable(),snapshot({...g,rules:begin.state}));
  assert.equal(inspectAttackRoll(copy.rules,copy.pieces).packet.skill,3);
  assert.equal(stepAttackRoll(copy.rules,copy.pieces,0,{type:'keep'},face(3)).event.kind,'wound');
});
