import test from 'node:test';
import assert from 'node:assert/strict';
import {beginCharge,selectChargeTargets,proposeCharge,finishCharge,cancelCharge,rewindCharge} from '../charge-session.mjs';
import {newBattle} from '../rules/battle.mjs';
import {useTactic} from '../rules/patrol.mjs';

const model=(kind,x,faction)=>({kind,id:kind+'-1',variant:0,name:kind,faction,x,z:0,yaw:0,elevation:0,baseWidth:1,baseDepth:1});
const marine=model('captain',0,'marines'), ork=model('boy',6,'orks');
const board=(active='marines')=>({width:44,depth:30,pieces:[marine,ork],rules:{...newBattle(),status:'playing',step:3,active,cp:{marines:2,orks:2}}});
const apply=(game,change)=>({...game,rules:change.rules,pieces:game.pieces.map(p=>({...p,...change.poses?.[p.id]}))});

test('declare, mark targets, preview from original pose, undo routes, and complete one charge',()=>{
  let game=board();
  const original=structuredClone(game);
  game=apply(game,beginCharge(game,marine,{dice:[3,3]}));
  assert.deepEqual(board(),original);
  assert.equal(game.rules.units.captain.charge,6);
  assert.deepEqual(game.rules.chargePlan.targets,[]);
  assert.throws(()=>beginCharge(game,marine),/진행 중/);
  assert.throws(()=>proposeCharge(game,marine,{[marine.id]:[{x:4.2}]}),/표적/);
  game=apply(game,selectChargeTargets(game,['boy-0']));
  assert.throws(()=>proposeCharge(game,ork,{[ork.id]:[{x:4}]}),/분대/);
  game=apply(game,proposeCharge(game,marine,{[marine.id]:[{x:2}]}));
  assert.throws(()=>finishCharge(game),e=>e.assessment.errors.some(v=>v.code==='target-unengaged'));
  assert.throws(()=>selectChargeTargets(game,['boy-0']),/원점/);
  assert.throws(()=>proposeCharge(game,marine,{[marine.id]:[{x:-2},{x:4}]}),e=>e.assessment.errors.some(v=>v.code==='distance'));
  game=apply(game,rewindCharge(game));
  assert.equal(game.pieces[0].x,0);
  assert.deepEqual(game.rules.chargePlan.dice,[3,3]);
  const target=['boy-0'];
  game=apply(game,selectChargeTargets(game,target));target.push('warboss');
  assert.deepEqual(game.rules.chargePlan.targets,['boy-0']);
  game=apply(game,proposeCharge(game,marine,{[marine.id]:[{x:4.3}]}));
  game=apply(game,finishCharge(game));
  assert.equal(game.rules.units.captain.charged,true);assert.equal(game.rules.chargePlan,null);
  assert.throws(()=>beginCharge(game,marine),/이미/);
});

test('a failed or declined charge consumes the declaration, restores poses, and never grants Fights First',()=>{
  let game=board();
  game=apply(game,beginCharge(game,marine,{dice:[1,1]}));
  assert.throws(()=>selectChargeTargets(game,['boy-0']),/표적/);
  game=apply(game,cancelCharge(game));
  assert.equal(game.rules.units.captain.charge,2);assert.ok(!game.rules.units.captain.charged);
  assert.equal(game.rules.units.captain.chargeTracked,true);
  assert.throws(()=>beginCharge(game,marine),/이미/);
  let moving=board();
  moving=apply(moving,beginCharge(moving,marine,{dice:[6,6]}));
  moving=apply(moving,selectChargeTargets(moving,['boy-0']));
  moving=apply(moving,proposeCharge(moving,marine,{[marine.id]:[{x:4}]}));
  moving=apply(moving,cancelCharge(moving));
  assert.equal(moving.pieces[0].x,0);assert.ok(!moving.rules.units.captain.charged);
});

test('opponent-end reactions require an explicit window, persist their two dice, and pay once even on failure',()=>{
  let game=board('orks');
  assert.throws(()=>beginCharge(game,marine,{mode:'masterOfBattle',dice:[6,3]}),/종료/);
  const master=beginCharge(game,marine,{mode:'masterOfBattle',dice:[6,3],endOfPhase:true});
  assert.deepEqual(master.rules.chargePlan.dice,[6,3]);assert.equal(master.rules.chargePlan.roll,6);
  assert.equal(master.rules.cp.marines,2);assert.equal(master.rules.units.captain.counterCharge,true);
  game=apply(game,beginCharge(game,marine,{mode:'intoTheFray',dice:[3,1],endOfPhase:true}));
  assert.equal(game.rules.cp.marines,0);assert.equal(game.rules.patrol.spent.heroicIntervention,'1-orks-3');
  game=apply(game,cancelCharge(game));
  assert.equal(game.rules.cp.marines,0);
});

test('15.01 forbids a second stratagem on one unit during the same phase, independently of stratagem identity',()=>{
  const game=board('orks');
  game.rules.patrol.tactics.precision='1-orks-3/captain';
  assert.throws(()=>beginCharge(game,marine,{mode:'leapToDefend',dice:[4,3],endOfPhase:true}),/전술/);
  // The restriction is per unit. A previous phase, or a different target, does not prevent using it.
  game.rules.patrol.tactics.precision='1-orks-3/vanguard';
  const next=beginCharge(game,marine,{mode:'leapToDefend',dice:[4,3],endOfPhase:true});
  assert.equal(next.rules.patrol.tactics.heroicIntervention,'1-orks-3/captain');
  const shooting=board('marines').rules;shooting.step=2;
  const defended=useTactic(shooting,'med','boy-0','orks',false);
  assert.equal(useTactic(defended,'surge','boy-0','orks',false),null);
  assert.ok(useTactic(defended,'surge','boy-1','orks',false));
});
