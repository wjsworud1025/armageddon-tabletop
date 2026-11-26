import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {newBattle,startBattle,advance} from './battle.mjs';
import {missionAward} from './missions.mjs';
import {rallyOptions,beginRally,toggleRallyModel,poseRallyModel,assessRally,finishRally,validatePendingRally} from './rally-placement.mjs';
import {validateRulesState} from './validate.mjs';

function fixture(){
  const g=createTable(),r=newBattle();
  r.attachments={'warboss-1':'boy-0'};r.patrol.enhanced.warcry=true;
  for(const p of g.pieces){
    p.removed=true;
    if(p.faction==='terrain')continue;
    r.hp[p.id]=0;
    if(p.id==='warboss-1'||p.kind==='boy'&&p.variant<5){
      p.removed=false;delete r.hp[p.id];
      Object.assign(p,{x:(p.kind==='warboss'?5:p.variant)*1.8-4.5,z:0,yaw:0,elevation:0});
    }
  }
  g.rules=startBattle(r,'orks',5,g.pieces);
  return g;
}
const select=(g,id,pose)=>{
  g.rules=toggleRallyModel(g,id).rules;
  if(pose)g.rules=poseRallyModel(g,id,pose).rules;
};
test('one roll, player chooses zero or fewer than limit, no premature wounds, VP or phase advance',()=>{
  const g=fixture();let n=0;
  g.rules=beginRally(g,'warboss-1',()=>{n++;return 1}).rules;
  assert.equal(n,1);assert.deepEqual(g.rules.rallyPlan.selected,{});
  assert.throws(()=>beginRally(g,'warboss-1',()=>{n++;return 3}));assert.equal(n,1);
  assert.equal(advance(g.rules,g.pieces),g.rules);
  assert.equal(missionAward({...g.rules,round:2},[{owner:'orks',home:'marines'}]),0);
  assert.equal(finishRally(g).rules.patrol.warcryUsed,true);
  select(g,'boy-6',{x:15,z:10});assert.equal(g.rules.hp['boy-6'],0);
  assert.ok(assessRally(g).errors.some(e=>e.code==='rally-anchor'));
  assert.throws(()=>finishRally(g));
  assert.equal(validatePendingRally(g),true);assert.equal(validateRulesState(g.rules,g.pieces),true);
  g.rules=poseRallyModel(g,'boy-6',{x:0,z:2}).rules;
  assert.equal(assessRally(g).ok,true);
  const done=finishRally(g);
  assert.equal(done.rules.hp['boy-6'],1);assert.equal(done.removed['boy-6'],false);
  assert.deepEqual(done.poses['boy-6'],{x:0,z:2,elevation:0,yaw:g.rules.rallyPlan.selected['boy-6'].yaw});
  assert.ok(!done.rules.rallyPlan);assert.throws(()=>beginRally({...g,rules:done.rules}));
});
const get=(g,id)=>g.pieces.find(p=>p.id===id);
const start=g=>{g.rules=beginRally(g,'warboss-1',()=>1).rules};
const has=(g,code)=>assessRally(g).errors.some(e=>e.code===code);

test('no chaining through another returnee, enforce whole-board edge, plinth clearance and solid support',()=>{
  const g=fixture(); start(g);
  select(g,'boy-6',{x:0,z:2});select(g,'boy-7',{x:0,z:4});
  assert.ok(has(g,'rally-anchor'));
  g.rules=poseRallyModel(g,'boy-7',{x:0,z:2}).rules;
  assert.ok(has(g,'rally-overlap'));
  g.rules=poseRallyModel(g,'boy-7',{x:g.width/2,z:0}).rules;
  assert.ok(has(g,'rally-edge'));
  g.rules=poseRallyModel(g,'boy-7',{x:0,z:2,elevation:1}).rules;
  assert.ok(has(g,'rally-terrain'));
  const ruin=get(g,'largeRuin-1');
  Object.assign(ruin,{removed:false,x:0,z:2,yaw:0});
  g.rules=poseRallyModel(g,'boy-7',{x:-2.30,z:2,elevation:0}).rules;
  assert.ok(has(g,'rally-terrain'));
});
test('enemy engagement is tested by enemy unit against the living unit before any returned model is placed',()=>{
  const g=fixture();
  const marine=get(g,'intercessor-1');
  Object.assign(marine,{removed:false,x:0,z:4});delete g.rules.hp[marine.id];
  const other=get(g,'intercessor-2');
  Object.assign(other,{removed:false,x:0,z:8});delete g.rules.hp[other.id];
  start(g);select(g,'boy-6',{x:0,z:2});
  assert.ok(has(g,'rally-engagement'));
  Object.assign(other,{x:-4.5,z:-2});
  assert.equal(assessRally(g).ok,true);
  const outsider=get(g,'captain-1');Object.assign(outsider,{removed:false,x:0,z:4.5});delete g.rules.hp[outsider.id];
  assert.ok(has(g,'rally-engagement'));
});
test('reserve models stay off-table with full profile wounds; alive reserves are not casualties',()=>{
  const g=fixture(),ids=['warboss-1','boy-2','boy-3','boy-4','boy-5'];
  g.rules.reserves={'boy-0':ids};g.rules.units={'boy-0':{shockChecked:true}};
  for(const id of [...ids,'boy-1'])get(g,id).removed=true;
  g.rules.hp['boy-1']=0;
  const options=rallyOptions(g);assert.equal(options.reserve,true);
  assert.ok(!options.fallen.includes('boy-2'));
  start(g);select(g,'boy-1');
  assert.deepEqual(g.rules.rallyPlan.selected,{'boy-1':null});assert.equal(validatePendingRally(g),true);
  assert.throws(()=>poseRallyModel(g,'boy-1',{x:1}));const done=finishRally(g);
  assert.equal(done.rules.hp['boy-1'],2);assert.equal(done.removed['boy-1'],true);assert.deepEqual(done.poses,{});
  assert.deepEqual(done.rules.reserves['boy-0'],[...ids,'boy-1']);
});
test('sole survivor may revive his former guard after shock; unassigned and slain leaders cannot',()=>{
  const g=fixture();
  for(const p of g.pieces.filter(p=>p.kind==='boy')){p.removed=true;g.rules.hp[p.id]=0}
  assert.equal(rallyOptions(g).ok,false); g.rules.units['boy-0']={shockChecked:true,shocked:true};
  assert.equal(rallyOptions(g).ok,true);
  get(g,'warboss-1').removed=true;assert.equal(rallyOptions(g).ok,false);
  get(g,'warboss-1').removed=false;g.rules.attachments={};assert.equal(rallyOptions(g).ok,false);
});
test('phase-start snapshot does not admit a late model as an anchor, and expires when the phase ends',()=>{
  const g=fixture();
  assert.equal(g.rules.rallyStarters.includes('boy-6'),false);
  Object.assign(get(g,'boy-6'),{x:0,z:3,removed:false});g.rules.hp['boy-6']=1;
  start(g);select(g,'boy-7',{x:0,z:5});
  assert.ok(has(g,'rally-anchor'));
  g.rules=toggleRallyModel(g,'boy-7').rules;g.rules=finishRally(g).rules;
  assert.equal(advance(g.rules,g.pieces).step,1);
  const legacy=fixture();delete legacy.rules.rallyStarters;
  start(legacy);assert.equal(legacy.rules.rallyPlan.anchors.length,6);
});
test('cap counts selected casualties, rejects wrong unit, forged pool and ineligible anchor while permitting uncommitted invalid spots',()=>{
  const g=fixture();start(g);
  for(const id of ['boy-6','boy-7','boy-8'])select(g,id);
  for(const id of ['boy-9','boy-11','warboss-1','boy-2'])assert.throws(()=>toggleRallyModel(g,id));
  g.rules=toggleRallyModel(g,'boy-7').rules;select(g,'boy-9');
  assert.equal(validateRulesState(g.rules,g.pieces),true);
  const malformed=structuredClone(g.rules);malformed.rallyPlan.selected['boy-11']=malformed.rallyPlan.selected['boy-6'];
  assert.equal(validateRulesState(malformed,g.pieces),false);
  const forged=structuredClone(g.rules);forged.rallyPlan.anchors[0]='boy-6';
  assert.equal(validateRulesState(forged,g.pieces),false);
});
