import assert from 'node:assert/strict';
import test from 'node:test';
import {createTable} from '../data/catalog.mjs';
import {snapshot,restore} from '../state.mjs';
import {adjustHP,advance,newBattle,startBattle} from './battle.mjs';
import {appendDeclaration,appendSightedDeclaration,lockSightedDeclaration,lockDeclaration,resolvePacket} from './declarations.mjs';
import {canSetPatrolSight,patrolSightStatus,setPatrolSight,visibleInRange,reconcilePatrolSight} from './patrol-sight.mjs';
import {validateRulesState} from './validate.mjs';

const shooter='intercessor-1',other='intercessor-2',near='boy-2',far='boy-3';
function fixture(){
  const game={...createTable(),rules:{...startBattle(newBattle(),'marines',5),step:2},logs:[]};
  for(const p of game.pieces){
    p.x=p.id===near?0:p.id===far?10:17;
    p.z=0;
  }
  return game;
}
const row=(actor=shooter,target='boy-0',preferred=near)=>({actor,weapon:0,target,preferred,distance:99,size:10,
  assigned:0,hit:0,wound:0,extra:0,cover:true,lethal:false,sustained:false,ignore:false,guard:false});
const dist=(_actor,target)=>target===near?7:28;
test('04.02 independently checks unit range and visibility for every shooter; half range and cover keep their own evidence',()=>{
  const {rules:r,pieces:p}=fixture(),targets=[near,far];
  assert.equal(patrolSightStatus(r,p,shooter,far),'unknown');
  const blocked=setPatrolSight(r,p,shooter,near,'blocked');
  assert.equal(patrolSightStatus(blocked,p,shooter,near),'blocked');
  assert.equal(appendSightedDeclaration(blocked,p,[row()],dist),null);
  const s=setPatrolSight(blocked,p,shooter,far,'visible');
  assert.deepEqual(visibleInRange(s,p,shooter,targets,24,dist),[far]);
  assert.deepEqual(visibleInRange(s,p,shooter,targets,6,dist),[]);
  assert.deepEqual(visibleInRange(s,p,other,targets,24,dist),[]);
  assert.deepEqual(visibleInRange(s,p,shooter,[near,'gretchin-1'],24,dist),[]);
  assert.equal(appendSightedDeclaration(s,p,[row(),row(other)],dist),null);
  const draft=appendSightedDeclaration(s,p,[row()],dist);
  assert.equal(draft.declaration.rows[0].distance,7);
  assert.equal(draft.declaration.rows[0].cover,true);
  assert.equal(draft.declaration.rows[0].preferred,near);
  assert.equal(setPatrolSight(draft,p,'captain-1',far,'visible'),null);
  const revised=setPatrolSight(draft,p,shooter,far,'unknown');
  assert.equal(lockSightedDeclaration(revised,p,[],dist),null);
  const locked=lockSightedDeclaration(draft,p,[],dist);
  assert.equal(canSetPatrolSight(locked,p,shooter,far),false);
  assert.equal(resolvePacket(locked,p,0,null,()=>0).state.shootingSight,undefined);
  const boundary=lockSightedDeclaration(draft,p,[],()=>24+1e-10);
  assert.equal(boundary.declaration.rows[0].distance,24);
  assert.ok(resolvePacket(boundary,p,0,null,()=>0).finished);
});

test('observations stay with individual shooters, including attached leaders, while other activations lock editing',()=>{
  const {rules:r,pieces:p}=fixture();
  const s=setPatrolSight({...r,attachments:{'captain-1':'intercessor'}},p,shooter,near,'visible');
  const t=setPatrolSight(s,p,'captain-1',far,'blocked');
  assert.equal(patrolSightStatus(t,p,shooter,near),'visible');
  const otherUnit=setPatrolSight(t,p,'librarian-1',far,'visible');
  assert.equal(patrolSightStatus(otherUnit,p,shooter,near),'visible');
  assert.equal(patrolSightStatus(otherUnit,p,'captain-1',far),'blocked');
  const plan=appendSightedDeclaration(otherUnit,p,[row()],dist);
  assert.equal(canSetPatrolSight(plan,p,'librarian-1',far),false);
  const stored=restore(createTable(),snapshot({...fixture(),pieces:p,rules:plan}));
  const locked=lockSightedDeclaration(stored.rules,stored.pieces,[],dist);
  const dice=[.9,.9,0];
  let n=0;
  const casualty=resolvePacket(locked,stored.pieces,0,null,()=>dice[n++%3]);
  assert.ok(Object.keys(casualty.removed).length);
  assert.equal(casualty.state.shootingSight,undefined);
  const finished=resolvePacket(locked,stored.pieces,0,null,()=>0).state;
  assert.deepEqual(Object.keys(finished.shootingSight.pairs),['librarian-1']);
  const reloaded=restore(createTable(),snapshot({...stored,rules:finished}));
  assert.equal(patrolSightStatus(reloaded.rules,reloaded.pieces,'librarian-1',far),'visible');
  assert.equal(canSetPatrolSight(reloaded.rules,reloaded.pieces,shooter,near),false);
  for(const [a,b] of [[near,shooter],[shooter,other],[shooter,'largeRuin-1'],[shooter,'missing']]){
    assert.equal(canSetPatrolSight(s,p,a,b),false);
  }
  for(const change of [{step:1},{status:'setup'},{units:{intercessor:{finishedAttack:2}}},{hazard:{unit:'intercessor'}},
    {shootingReaction:{shooter:'intercessor'}},{reactionPlan:{unit:'vanguard'}}]){
    assert.equal(setPatrolSight({...s,...change},p,shooter,near,'blocked'),null);
  }
  assert.equal(setPatrolSight(s,p,shooter,near,'full'),null);
  assert.equal(setPatrolSight(s,p,shooter,near,'unknown').shootingSight,undefined);
  assert.equal(advance(s).shootingSight,undefined);
});

test('moving intervening scenery, unrelated models, changing HP and losing the visible member invalidate prior evidence',()=>{
  const {rules:r,pieces:p}=fixture();
  const s=setPatrolSight(r,p,shooter,far,'visible');
  for(const [id,change] of [['largeRuin-2',{yaw:1.4}],['gretchin-1',{elevation:1}],['captain-1',{x:2}],
    [far,{removed:true}],[near,{z:3}]]){
    const moved=p.map(m=>m.id===id?{...m,...change}:m);
    assert.equal(patrolSightStatus(s,moved,shooter,far),'unknown');
    assert.equal(reconcilePatrolSight(s,moved).shootingSight,undefined);
    assert.equal(snapshot({...fixture(),pieces:moved,rules:s}).rules.shootingSight,undefined);
    assert.equal(appendSightedDeclaration(s,moved,[row()],dist),null);
  }
  assert.equal(adjustHP(s,p.find(m=>m.id===other),-1).shootingSight,undefined);
  assert.equal(patrolSightStatus({...s,hp:{[far]:0}},p,shooter,far),'unknown');
});

test('save/import verifies bounded model pairs, team, round, hit points and every board pose, preserving previous games',()=>{
  const g=fixture();g.rules=setPatrolSight(g.rules,g.pieces,shooter,far,'visible');
  const saved=snapshot(g),loaded=restore(createTable(),JSON.parse(JSON.stringify(saved)));
  assert.equal(patrolSightStatus(loaded.rules,loaded.pieces,shooter,far),'visible');
  for(const corrupt of [
    s=>s.pairs[shooter][far]='<img>',s=>s.pairs[shooter][other]='visible',s=>s.pairs[shooter]={},
    s=>s.pairs[near]={[far]:'blocked'},s=>s.unit='captain',s=>s.round++,s=>s.active='orks',
    s=>s.board[far][0]+=1,s=>s.board[far][4]=true,s=>s.board[far][5]=0,
    s=>s.board[near][1]='0',s=>delete s.board['largeRuin-1'],s=>s.pairs=JSON.parse('{"__proto__":{}}')
  ]){
    const copy=structuredClone(saved);corrupt(copy.rules.shootingSight);
    assert.equal(validateRulesState(copy.rules,copy.pieces),false);
    assert.throws(()=>restore(createTable(),copy),/규칙 데이터/);
  }
  const old={...saved,rules:{...saved.rules}};delete old.rules.shootingSight;
  const draft=appendDeclaration(old.rules,g.pieces,[{...row(),distance:7}]);
  assert.equal(lockSightedDeclaration(restore(createTable(),{...old,rules:draft}).rules,g.pieces,[],dist),null);
  const locked=lockDeclaration(draft,g.pieces);
  const rebuilt=restore(createTable(),{...old,rules:locked});
  assert.ok(resolvePacket(rebuilt.rules,rebuilt.pieces,0,null,()=>0).finished);
});
