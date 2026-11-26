import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {objectiveAreas} from '../layouts.mjs';
import {measureFootprints} from '../ruler.mjs';
import {beginRally,toggleRallyModel,poseRallyModel,finishRally} from '../rules/rally-placement.mjs';
import {missionAward,objectiveSnapshot} from '../rules/missions.mjs';
import {startBattle} from '../rules/battle.mjs';
import {snapshot,restore} from '../state.mjs';
import {rallyBoard,rallyCasualty,rallyReturnPose} from './fixtures/rally-board.mjs';

function apply(game,result){
  game.rules=result.rules;
  for(const p of game.pieces){
    Object.assign(p,result.poses[p.id]??{});
    if(Object.hasOwn(result.removed,p.id))p.removed=result.removed[p.id];
  }
  game.logs.push(result.message);
}
const find=(g,id)=>g.pieces.find(p=>p.id===id);
const load=s=>restore(createTable(),s);
function score(g){
  const distance=(a,b)=>measureFootprints(find(g,a),find(g,b)).distance;
  const obj=objectiveSnapshot(g.rules,g.pieces,objectiveAreas(g),distance);
  return missionAward(g.rules,Object.values(obj));
}
function start(){
  const g=rallyBoard();
  apply(g,beginRally(g,'warboss-1',()=>2));return g;
}

test('a legal return onto the Marine home objective earns 10 VP only after placement',()=>{
  const g=rallyBoard();
  for(const ork of g.pieces.filter(p=>p.faction==='orks'&&!p.removed)){
    ork.x-=13;ork.z+=6;
  }
  assert.equal(score(g),0);
  apply(g,beginRally(g,'warboss-1',()=>2));
  const skipped=load(snapshot(g));
  apply(skipped,finishRally(skipped));
  assert.equal(score(skipped),0);
  apply(g,toggleRallyModel(g,rallyCasualty));
  apply(g,poseRallyModel(g,rallyCasualty,{x:-19.5,z:-2.5}));
  assert.equal(score(g),0);
  apply(g,finishRally(g));
  assert.deepEqual(objectiveAreas(g).find(a=>a.id==='blue-home').members,[rallyCasualty]);
  assert.equal(score(g),10);
  assert.equal(score(load(snapshot(g))),10);
});

test('War Cry reload keeps the roll and the casualty off the board until a legal return is confirmed',()=>{
  let g=start();
  assert.deepEqual(g.rules.rallyPlan.selected,{});
  apply(g,toggleRallyModel(g,rallyCasualty));
  const stale=snapshot(g),before=structuredClone(find(g,rallyCasualty));
  g=load(stale);assert.deepEqual(snapshot(g),stale);
  assert.equal(g.rules.rallyPlan.die,2);assert.equal(score(g),0);
  assert.throws(()=>finishRally(g));assert.equal(find(g,rallyCasualty).removed,true);
  apply(g,poseRallyModel(g,rallyCasualty,rallyReturnPose));
  const pending=snapshot(g);
  g=load(pending);assert.deepEqual(snapshot(g),pending);
  assert.equal(find(g,rallyCasualty).x,before.x);assert.equal(g.rules.hp[rallyCasualty],0);
  apply(g,finishRally(g));
  assert.equal(find(g,rallyCasualty).removed,false);
  assert.equal(find(g,rallyCasualty).x,rallyReturnPose.x);
  assert.equal(g.rules.hp[rallyCasualty],1);assert.equal(score(g),0);
  const resolved=snapshot(g);g=load(resolved);assert.deepEqual(snapshot(g),resolved);
  assert.throws(()=>finishRally(g));assert.throws(()=>beginRally(g,'warboss-1',()=>1));
});

test('old resolved War Cry saves preserve the prior outcome without creating another return',()=>{
  for(const historicalPoints of [0,10]){
    const g=rallyBoard(),p=find(g,rallyCasualty);
    p.removed=false;g.rules.hp[p.id]=1;g.rules.patrol.warcryUsed=true;
    g.rules.units['boy-0']={rallied:true};
    if(!historicalPoints)Object.assign(p,rallyReturnPose);
    assert.equal(score(g),historicalPoints);
    g.rules.step=1;g.rules.vp.orks=historicalPoints;
    const old=snapshot(g),restored=load(old);
    assert.deepEqual(snapshot(restored),old);
    assert.equal(restored.rules.rallyPlan,undefined);
    assert.throws(()=>beginRally(restored,'warboss-1',()=>1));
  }
});

test('a Boy returned after the Command phase began does not become an anchor on reload',()=>{
  let g=rallyBoard();
  const late=find(g,'boy-3');
  late.removed=true;g.rules.hp[late.id]=0;
  g.rules=startBattle({...g.rules,status:'setup'},'orks',5,g.pieces);
  assert.ok(!g.rules.rallyStarters.includes(late.id));
  late.removed=false;g.rules.hp[late.id]=1;
  apply(g,beginRally(g,'warboss-1',()=>1));
  const saved=snapshot(g);
  g=load(saved);assert.deepEqual(snapshot(g),saved);
  assert.ok(!g.rules.rallyPlan.anchors.includes(late.id));
  saved.rules.rallyPlan.anchors.push(late.id);
  assert.throws(()=>load(saved));
});

test('a reserve draft carries no board pose and restores exactly one Boy to the reserve list',()=>{
  let g=rallyBoard();
  const anchors=g.pieces.filter(p=>p.faction==='orks'&&!p.removed);
  g.rules.reserves['boy-0']=anchors.map(p=>p.id);
  for(const p of anchors)p.removed=true;
  const oldPose=snapshot(g).pieces.find(p=>p.id===rallyCasualty);
  apply(g,beginRally(g,'warboss-1',()=>1));
  apply(g,toggleRallyModel(g,rallyCasualty));
  const pending=snapshot(g);
  assert.equal(pending.rules.rallyPlan.reserve,true);
  assert.deepEqual(pending.rules.rallyPlan.selected,{[rallyCasualty]:null});
  g=load(pending);assert.deepEqual(snapshot(g),pending);
  apply(g,finishRally(g));
  const done=snapshot(g),ids=done.rules.reserves['boy-0'];
  assert.deepEqual(done.pieces.find(p=>p.id===rallyCasualty),oldPose);
  assert.equal(done.rules.hp[rallyCasualty],1);
  assert.equal(ids.filter(id=>id===rallyCasualty).length,1);
  assert.deepEqual(snapshot(load(done)),done);
});

test('pending War Cry rejects inconsistent receipts, selections and moved off-board records on restore',()=>{
  const g=start();apply(g,toggleRallyModel(g,rallyCasualty));
  const edits={
    die:s=>s.rules.rallyPlan.die=4,
    team:s=>s.rules.active='marines',
    step:s=>s.rules.step=1,
    unspent:s=>s.rules.patrol.warcryUsed=false,
    detached:s=>delete s.rules.attachments['warboss-1'],
    missingAnchor:s=>s.rules.rallyPlan.anchors.pop(),
    repeatedAnchor:s=>s.rules.rallyPlan.anchors.push(s.rules.rallyPlan.anchors[0]),
    otherUnit:s=>s.rules.rallyPlan.selected['boy-12']=rallyReturnPose,
    leader:s=>s.rules.rallyPlan.selected['warboss-1']=rallyReturnPose,
    alreadyAlive:s=>{find(s,rallyCasualty).removed=false;s.rules.hp[rallyCasualty]=1},
    reserve:s=>s.rules.rallyPlan.reserve=true,
    nullPosition:s=>s.rules.rallyPlan.selected[rallyCasualty]=null,
    badPreview:s=>s.rules.rallyPlan.selected[rallyCasualty].x=Infinity,
    anchorOutside:s=>find(s,'warboss-1').x=50,
  };
  for(const [name,mutate] of Object.entries(edits)){
    const damaged=snapshot(g);mutate(damaged);
    assert.throws(()=>load(damaged),undefined,name);
  }
});
