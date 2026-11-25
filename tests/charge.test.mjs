import test from 'node:test';
import assert from 'node:assert/strict';
import {chargeOptions,assessCharge} from '../charge.mjs';
import {assessMove} from '../movement.mjs';
import {newBattle} from '../rules/battle.mjs';

function model(kind,x,z=0,n=1) {
  const faction=['boy','gretchin','warboss','wartrakk'].includes(kind)?'orks':'marines';
  return {id:kind+'-'+n,kind,faction,name:kind,variant:n-1,x,z,elevation:0,yaw:0,baseWidth:1,baseDepth:1};
}
const board=(pieces,state={})=>({width:44,depth:30,pieces,rules:{...newBattle(),status:'playing',step:3,...state}});
const has=(result,code)=>result.errors.some(e=>e.code===code);
const actor=model('captain',0), boy=model('boy',6), grot=model('gretchin',8);
const assess=(game,rest)=>assessCharge({game,actor:game.pieces[0],targets:['boy-0'],roll:6,...rest});

test('eligibility precedes the roll; actual charge targets are selected afterwards at at most the rolled distance',()=>{
  const game=board([actor,boy,grot]);
  assert.ok(chargeOptions(game,actor).ok);
  const options=chargeOptions(game,actor,{roll:5});
  assert.deepEqual(options.targets.map(t=>[t.unit,t.eligible]),[['boy-0',true],['gretchin',false]]);
  assert.ok(has(assess(game,{targets:[] }),'no-target'));
  assert.ok(has(assess(game,{roll:6,targets:['gretchin']}),'ineligible-target'));
  assert.ok(has(assess(game,{roll:2}),'ineligible-target'));
  assert.ok(has(chargeOptions(board([actor,{...boy,x:13.1}]),actor),'no-enemy'));
  assert.ok(has(chargeOptions(board([actor,{...boy,x:3,elevation:5}]),actor),'start-engaged'));
  assert.ok(chargeOptions(board([actor,{...boy,x:3,elevation:5.1}]),actor).ok);
  assert.ok(has(chargeOptions(board([actor,boy],{units:{captain:{charge:2}}}),actor),'already-declared'));
});

test('advance / fall-back exceptions use the starter patrol doctrines and Waaagh',()=>{
  const game=board([actor,boy],{units:{captain:{movement:'advance'}}});
  assert.ok(has(chargeOptions(game,actor),'movement-order'));
  game.rules.patrol.doctrine='assault';
  assert.ok(chargeOptions(game,actor).ok);
  game.rules.units.captain.movement='fallback';
  assert.ok(has(chargeOptions(game,actor),'movement-order'));
  game.rules.patrol.doctrine='tactical';
  assert.ok(chargeOptions(game,actor).ok);
  game.rules.active='orks';game.rules.units['boy-0']={movement:'advance'};
  assert.ok(has(chargeOptions(game,boy),'movement-order'));
  game.rules.patrol.waaagh=1;
  assert.ok(chargeOptions(game,boy).ok);
});

test('Captain and Heroic Intervention are opponent-end reactions with separate ranges, modes, and costs',()=>{
  const game=board([actor,boy,grot],{active:'orks',cp:{marines:2,orks:1},units:{'boy-0':{charged:true}}});
  assert.ok(has(chargeOptions(game,actor),'wrong-side'));
  const counter=chargeOptions(game,actor,{mode:'masterOfBattle',roll:11});
  assert.ok(counter.ok);assert.equal(counter.limit,6);assert.equal(counter.cost,0);
  assert.ok(has(chargeOptions(board([actor,grot],{active:'orks'}),actor,{mode:'masterOfBattle'}),'no-enemy'));
  assert.ok(has(chargeOptions(game,actor,{mode:'masterOfBattle',endOfPhase:false}),'reaction-timing'));
  const leap=chargeOptions(game,actor,{mode:'leapToDefend',roll:12});
  assert.deepEqual(leap.targets.map(t=>t.eligible),[true,false]);assert.equal(leap.cost,1);
  const fray=chargeOptions(game,actor,{mode:'intoTheFray',roll:8});
  assert.equal(fray.limit,6);assert.equal(fray.cost,2);
  const speeder=model('landSpeeder',0);
  assert.ok(has(chargeOptions(board([speeder,boy],{active:'orks'}),speeder,{mode:'leapToDefend'}),'heroic-unit'));
});

test('full paths charge against the roll, stop at models, and can cross engagement range in transit',()=>{
  const game=board([actor,boy]);
  const snapshot=structuredClone(game);
  assert.ok(assess(game,{phase:'path',paths:{[actor.id]:[{x:1}]}}).ok);
  assert.ok(assess(game,{paths:{[actor.id]:[{x:4}]}}).ok);
  assert.ok(has(assess(game,{paths:{[actor.id]:[{x:-3},{x:4}]}}),'distance'));
  assert.ok(has(assess(game,{roll:9,paths:{[actor.id]:[{x:8}]}}),'enemy-base'));
  assert.deepEqual(game,snapshot);
});

test('charge geometry requires one engagement per target and forbids engagement with unselected units',()=>{
  const near={...grot,x:5,z:1.5},game=board([actor,boy,near]);
  const paths={[actor.id]:[{x:4.5}]};
  assert.ok(has(assess(game,{paths}),'non-target-engaged'));
  assert.ok(assess(game,{paths,targets:['boy-0','gretchin']}).ok);
  const opposite={...grot,x:-5};
  assert.ok(has(assess(board([actor,boy,opposite]),{paths,targets:['boy-0','gretchin']}),'target-unengaged'));
});

test('a model that can legally reach 1 inch must do so; each model must get closer to a selected unit',()=>{
  const game=board([actor,boy]);
  assert.ok(has(assess(game,{paths:{[actor.id]:[{x:3.3}]}}),'within-one'));
  assert.ok(has(assess(game,{paths:{[actor.id]:[{x:-1}]}}),'not-closer'));
  const leader=model('librarian',0,2),inter=model('intercessor',0);
  const attached=board([inter,leader,boy],{attachments:{[leader.id]:'intercessor'}});
  const result=assess(attached,{paths:{[inter.id]:[{x:4.8}]}});
  assert.ok(result.errors.some(e=>e.code==='not-closer' && e.modelIds.includes(leader.id)));
});

test('flight deducts 2 from target-selection range and from each route, and ignores vertical distance travelled',()=>{
  const v=model('vanguard',0), game=board([v,boy]);
  assert.ok(has(assess(game,{takeToSkies:true,roll:6}),'ineligible-target'));
  const res=assess(game,{takeToSkies:true,roll:7,paths:{[v.id]:[{elevation:7},{x:4.5},{elevation:0}]}});
  assert.ok(res.ok);assert.equal(res.models[v.id].distance,4.5);assert.equal(res.models[v.id].limit,5);
  assert.ok(has(assess(board([actor,boy]),{takeToSkies:true}),'cannot-fly'));
});

test('fight movement shares common route and endpoint checks without borrowing normal move or FLY shortcuts',()=>{
  const game=board([actor,boy]);
  for(const [type,limit] of [['pile-in',3],['consolidate',6]]) {
    const options={game,pieces:[actor],type,maxDistance:limit,paths:{[actor.id]:[{x:3}]}};
    assert.ok(assessMove(options).ok);assert.equal(assessMove(options).models[actor.id].limit,limit);
    assert.ok(has(assessMove({...options,paths:{[actor.id]:[{x:limit+0.01}]}}),'distance'));
  }
});
