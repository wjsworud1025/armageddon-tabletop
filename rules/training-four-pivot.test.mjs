import test from 'node:test';
import assert from 'node:assert/strict';
import {trainingFourBattle as battle,trainingFourDeployment as deploy} from './training-four-battle.mjs';
import {createTrainingThreeDeployment,moveTrainingThreeDeployment,validateTrainingThreeDeployment} from './training-three-deployment.mjs';
import {createTrainingThreeTable} from '../data/training-three-layout.mjs';
import {createTrainingFourTable} from '../data/training-four-layout.mjs';
import {assessMove,crossesOnTurn,sweptGap} from '../movement.mjs';

const step=Math.PI/12,id='wartrakk-1',board=createTrainingFourTable();
const vehicle=board.pieces.find(p=>p.id===id);
const p=(s,key)=>battle.pieces(s).find(m=>m.id===key);
const clone=v=>JSON.parse(JSON.stringify(v));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,a+' ≠ '+b);

test('deployment accepts both 15-degree directions, carries facing across drags, and 24 clicks restore the original record',()=>{
  const captain=board.pieces.find(p=>p.id==='captain-1'),base=deploy.create();
  let s=base;
  for(let i=0;i<24;i++){
    const previous=deploy.pieces(s).find(m=>m.id===captain.id);
    s=deploy.move(s,captain.id,previous.x,previous.z,previous.yaw-step);
    assert.equal(deploy.validate(clone(s)),true);
  }
  assert.deepEqual(s,base);
  s=deploy.move(base,id,vehicle.x,vehicle.z,vehicle.yaw+step);
  const angle=s.positions[id].yaw;
  s=deploy.move(s,id,vehicle.x-.05,vehicle.z+.2);assert.equal(s.positions[id].yaw,angle);
  assert.deepEqual(battle.create(s).initial[id],s.positions[id]);
  assert.equal(battle.validate(battle.create(s)),true);
  assert.throws(()=>deploy.move(base,id,vehicle.x,vehicle.z,vehicle.yaw+.01));
  assert.throws(()=>deploy.move(base,id,vehicle.x,vehicle.z,vehicle.yaw-step),/벽/);
  assert.throws(()=>deploy.move(base,id,3,100,angle),/전장/);
  const wrong=clone(s);wrong.positions[id].yaw='<bad>';assert.equal(deploy.validate(wrong),false);
});
test('a pending advance preserves its D6, rotated preview and yaw across later waypoints, rewind, finalisation and JSON replay',()=>{
  let s=battle.act(battle.create(deploy.create()),{type:'four-score'});
  s=battle.act(s,{type:'move',mode:'advance',unit:'wartrakk'},()=>2);
  const base=clone(s),position=s.poses[id];
  const noRoll=()=>assert.fail('a rotation or a path must never roll another die');
  assert.throws(()=>battle.act(s,{type:'pivot',id,direction:-1},noRoll),/벽/);
  for(const a of [{type:'pivot',id,direction:0},{type:'pivot',id,direction:'1'},{type:'pivot',id:'captain-1',direction:1}]){
    assert.throws(()=>battle.act(s,a,noRoll));
  }
  s=battle.act(s,{type:'pivot',id,direction:1},noRoll);
  s=battle.act(s,{type:'path',id,x:position.x,z:position.z+1},noRoll);
  close(p(s,id).yaw,vehicle.yaw+step);assert.equal(p(s,id).z,position.z+1);
  assert.equal(s.poses[id].yaw,vehicle.yaw);assert.equal(battle.validate(clone(s)),true);
  const damaged=clone(s);damaged.plan.paths[id].at(-1).yaw=0;assert.equal(battle.validate(damaged),false);
  const tampered=clone(s);tampered.history.at(-2).action.direction=5;assert.equal(battle.validate(tampered),false);
  const rewound=battle.act(s,{type:'rewind'},noRoll);assert.deepEqual(rewound.plan.paths,{});assert.equal(p(rewound,id).yaw,vehicle.yaw);
  const finished=battle.act(clone(s),{type:'finish'},noRoll);
  close(finished.poses[id].yaw,vehicle.yaw+step);assert.deepEqual(finished.rolls,base.rolls);
  assert.equal(finished.moved.wartrakk,'advance');assert.equal(battle.validate(clone(finished)),true);
});
test('rotating a vehicle costs zero distance and translating still uses the full printed movement allowance',()=>{
  const m={...vehicle,x:0,z:0,yaw:0,elevation:0};
  const assess=distance=>assessMove({game:{width:100,depth:100,pieces:[m],rules:{}},pieces:[m],type:'normal',
    paths:{[id]:[{yaw:step},{x:distance,z:0},{yaw:0}]}});
  assert.equal(assess(12).ok,true);assert.equal(assess(12).models[id].distance,12);
  assert.ok(assess(12.01).errors.some(e=>e.code==='distance'));
});
test('a 15-degree pivot is checked through its whole arc against a wall, an enemy, engagement distance and the board edge',()=>{
  const m={...vehicle,x:0,z:0,yaw:-step/2,elevation:0},r=m.baseDepth/2;
  const end={...m,yaw:step/2};
  const needle={id:'fixture',kind:'captain',faction:'marines',x:0,z:r+.001,yaw:0,elevation:0,baseWidth:.006,baseDepth:.006};
  const wall={...needle,faction:'terrain'};
  assert.ok(sweptGap(m,m,needle)>0&&sweptGap(end,end,needle)>0);
  assert.ok(crossesOnTurn(m,step,needle));assert.ok(crossesOnTurn(m,step,wall));
  const distant={...needle,z:needle.z+2};assert.equal(crossesOnTurn(m,step,distant),false);assert.equal(crossesOnTurn(m,step,distant,2),true);
  const args={game:{width:44,depth:30,pieces:[m,needle],rules:{}},pieces:[m],type:'charge',chargeDistance:4,
    phase:'path',paths:{[id]:[{yaw:end.yaw}]}};
  assert.ok(assessMove(args).errors.some(e=>e.code==='enemy-base'));
  const edge={...m,z:15-r+.003};
  assert.ok(assessMove({...args,game:{...args.game,pieces:[edge]},pieces:[edge]}).errors.some(e=>e.code==='board-edge'));
  const friend={...needle,faction:'orks',kind:'warboss',id:'warboss-1',z:r-.05};
  assert.ok(assessMove({...args,game:{...args.game,pieces:[m,friend]},phase:'finish'}).errors.some(e=>e.code==='base-overlap'));
});
test('older deployment and path saves remain unchanged and scenario 3 keeps its printed facings',()=>{
  const d3=createTrainingThreeDeployment(),p3=createTrainingThreeTable().pieces[0];
  assert.equal(validateTrainingThreeDeployment(d3),true);
  assert.equal(validateTrainingThreeDeployment({...d3,positions:{[p3.id]:{x:p3.x,z:p3.z,yaw:p3.yaw+step}}}),false);
  const past=moveTrainingThreeDeployment(d3,p3.id,p3.x,p3.z);assert.deepEqual(past,d3);
  const start=battle.act(battle.create(deploy.create()),{type:'four-score'});
  const m=battle.act(start,{type:'move',unit:'wartrakk',mode:'normal'});
  const translated=battle.act(m,{type:'path',id,x:vehicle.x,z:vehicle.z+.75});
  assert.deepEqual(translated.plan.paths[id],[{x:vehicle.x,z:vehicle.z+.75}]);
  assert.equal(battle.validate(clone(translated)),true);
});
