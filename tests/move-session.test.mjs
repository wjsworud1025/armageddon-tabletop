import test from 'node:test';
import assert from 'node:assert/strict';
import {newBattle,startBattle} from '../rules/battle.mjs';
import {beginMove,proposeMove,finishMove,rewindMove,rerollMove,abandonInvalidMove} from '../move-session.mjs';

const figure=(id,x,z=0,faction='marines')=>({id,kind:id.split('-')[0],variant:Number(id.split('-')[1])-1,
  name:id,x,z,yaw:0,elevation:0,faction,baseWidth:1,baseDepth:1});
const table=(pieces,active='marines')=>({width:44,depth:30,pieces,rules:{...startBattle(newBattle(),active,5),step:1}});
const applied=(g,result)=>({...g,rules:result.rules,pieces:g.pieces.map(p=>({...p,...result.poses?.[p.id]}))});

test('declare, preview, reject an incoherent finish, and commit a whole squad once',()=>{
  const a=figure('intercessor-1',0),b=figure('intercessor-2',2);
  let g=table([a,b]);
  const initial=structuredClone(g);
  const d=beginMove(g,a,'normal');
  assert.deepEqual(g,initial);
  g=applied(g,d);
  assert.deepEqual(Object.keys(g.rules.movePlan.origins),[a.id,b.id]);
  assert.throws(()=>beginMove(g,b,'normal'),/진행 중/);
  g=applied(g,proposeMove(g,a,{[a.id]:[{x:-3}]}));
  assert.throws(()=>finishMove(g),e=>e.assessment.errors.some(v=>v.code==='coherency-neighbour'));
  const cancelled=applied(g,abandonInvalidMove(g));
  assert.equal(cancelled.rules.movePlan,null);
  assert.equal(cancelled.pieces[0].x,0);
  assert.doesNotThrow(()=>beginMove(cancelled,a,'remain'));
  const corrected=proposeMove(g,b,{[b.id]:[{x:0}]});
  g=applied(g,corrected);
  assert.throws(()=>abandonInvalidMove(g),/완료할 수/);
  const end=finishMove(g);
  assert.equal(end.rules.movePlan,null);
  assert.equal(end.assessment.models[a.id].distance,3);
  g=applied(g,end);
  assert.equal(g.pieces[1].x,0);
  assert.throws(()=>beginMove(g,a,'advance'),/이미/);
});

test('rewind restores surviving poses and preserves the roll, declaration and lost models',()=>{
  const a=figure('boy-1',0,0,'orks'),b=figure('boy-2',2,0,'orks');
  let g=table([a,b],'orks');
  g=applied(g,beginMove(g,a,'advance',{advanceRoll:3}));
  g=applied(g,proposeMove(g,a,{[a.id]:[{x:-2,yaw:.4}],[b.id]:[{x:0}]}));
  g={...g,rules:{...g.rules,hp:{[b.id]:0}},pieces:g.pieces.map(p=>({...p,removed:p.id===b.id}))};
  const rewind=rewindMove(g);
  assert.deepEqual(Object.keys(rewind.poses),[a.id]);
  g=applied(g,rewind);
  assert.equal(g.pieces[0].x,0);assert.equal(g.pieces[0].yaw,0);assert.ok(g.pieces[1].removed);
  assert.deepEqual(g.rules.movePlan.paths,{});
  assert.equal(g.rules.movePlan.advanceRoll,3);
  assert.equal(g.rules.units['boy-0'].movement,'advance');
  assert.throws(()=>rerollMove(g,a,6),/움직이기 전/);
  assert.equal(finishMove(g).rules.movePlan,null);
});

test('one Ork advance reroll replaces the shared die without changing origins',()=>{
  const a=figure('gretchin-1',0,0,'orks');
  let g=table([a],'orks');
  g=applied(g,beginMove(g,a,'advance',{advanceRoll:2}));
  assert.throws(()=>rerollMove(g,a,7),/D6/);
  const result=rerollMove(g,a,5);
  assert.deepEqual(result.rules.movePlan.origins,g.rules.movePlan.origins);
  g=applied(g,result);
  assert.equal(g.rules.movePlan.advanceRoll,5);
  assert.throws(()=>rerollMove(g,a,3),/한 번/);
  assert.equal(proposeMove(g,a,{[a.id]:[{x:10}]}).assessment.models[a.id].limit,11);
});

test('the acting player, phase, valid living members, and old declarations govern eligibility',()=>{
  const a=figure('vanguard-1',0),b=figure('captain-1',-5),ork=figure('gretchin-1',-15,0,'orks');
  let g=table([a,b,ork]);
  assert.throws(()=>beginMove(g,ork,'normal'),/현재 턴/);
  assert.throws(()=>beginMove({...g,rules:{...g.rules,step:2}},a,'normal'),/이동 페이즈/);
  g=applied(g,beginMove(g,a,'normal'));
  assert.throws(()=>proposeMove(g,b,{[b.id]:[{x:-4}]}),/선언한 분대/);
  assert.throws(()=>proposeMove(g,a,{[b.id]:[{x:-4}]}),/생존 모델/);
  assert.throws(()=>proposeMove(g,a,{[a.id]:[{x:NaN}]}),/경유점/);
  const legacy={...g,rules:{...g.rules,movePlan:undefined}};
  assert.throws(()=>beginMove(legacy,a,'normal'),/이미/);
  assert.equal(beginMove(legacy,b,'remain').rules.movePlan,null);
});

test('failed path or waypoint overflow is atomic; restored drafts continue measuring the complete polyline',()=>{
  const a=figure('intercessor-1',0);
  let g=table([a]);
  g=applied(g,beginMove(g,a,'normal'));
  g=applied(g,proposeMove(g,a,{[a.id]:[{x:3},{z:1}]}));
  const saved=JSON.parse(JSON.stringify(g));
  assert.throws(()=>proposeMove(g,a,{[a.id]:[{x:0}]}),e=>e.assessment.errors.some(i=>i.code==='distance'));
  assert.deepEqual(saved,g);
  const points=Array.from({length:511},(_,i)=>({yaw:(i+1)*.01}));
  assert.throws(()=>proposeMove(g,a,{[a.id]:points}),/512/);
  assert.deepEqual(saved,g);
  assert.equal(finishMove(applied(saved,proposeMove(saved,a,{[a.id]:[{x:4}]}))).assessment.models[a.id].distance,5);
});

test('desperate escape can finish after the model originally in engagement range dies',()=>{
  const a=figure('boy-1',-1.5,0,'orks'),b=figure('boy-2',-4,0,'orks'),enemy=figure('captain-1',0);
  let g=table([a,b,enemy],'orks');
  g.rules.units['boy-0']={shocked:true};
  g=applied(g,beginMove(g,a,'fallback'));
  assert.equal(g.rules.movePlan.fallbackMode,'desperate');
  assert.throws(()=>proposeMove(g,b,{[b.id]:[{x:-5}]}),/위험 판정/);
  g.rules={...g.rules,movePlan:{...g.rules.movePlan,desperateEscapeResolved:true},hp:{[a.id]:0}};
  const moved=proposeMove(g,b,{[b.id]:[{x:-5}]});
  assert.equal(finishMove(applied(g,moved)).rules.movePlan,null);
  g.rules.hp[b.id]=0;
  assert.equal(finishMove(g).rules.movePlan,null);
});
