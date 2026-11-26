import assert from 'node:assert/strict';
import {newBattle,startBattle} from './battle.mjs';
import {trainingFourVP} from './training-four-objectives.mjs';
import {trainingFourDeployment} from './training-four-battle.mjs';

export async function checkTrainingFour({save,upload,click,state,js,reload,send}){
  const fixture=structuredClone(save),speeder='landSpeeder-1',wartrakk='wartrakk-1';
  fixture.surface='front';fixture.rules=startBattle(newBattle(),'marines',5);
  fixture.rules.hp[speeder]=0;fixture.pieces.find(p=>p.id===speeder).removed=true;
  fixture.rules.hp[wartrakk]=3;
  await upload(fixture);await click('[data-tab=battle]');
  const original=await state();
  const drill=async()=>(await state()).training;
  const action=(key,filter='')=>'#training-four-options [data-action="'+key+'"]'+filter;
  const has=selector=>js('!!document.querySelector('+JSON.stringify(selector)+')');
  const hud=()=>js('Array.from(document.querySelectorAll("#training-four-objectives [data-area]"),el=>'+
    '({id:el.dataset.area,marines:Number(el.dataset.marines),orks:Number(el.dataset.orks)}))');
  const pad=async id=>(await hud()).find(a=>a.id===id);
  const world=async()=>js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const s=tabletopView.stats();'+
    'resolve({w:s.boardWidth,h:s.boardDepth,panels:s.boardPanels,surface:s.boardSurface,visible:s.visiblePieces,'+
    'speeder:tabletopView.pose("landSpeeder-1"),trakk:tabletopView.pose("wartrakk-1")})})))');
  async function advanceUntil(stop){
    for(let i=0;i<120;i++){
      const t=await drill();if(stop(t))return t;
      assert.ok(!t.winner,'Scenario ended before the expected checkpoint');
      const key=t.phase==='command'?'four-score':t.phase==='shooting'?'shoot-next':'next';
      assert.ok(await has(action(key)),'No legal '+key+' during '+t.phase);
      await click(action(key));
    }
    assert.fail('Failed to reach the next handbook checkpoint');
  }
  await click('#training-four-start');
  assert.deepEqual([(await drill()).scenario,(await drill()).phase],[4,'deployment']);
  let displayed=await world();
  const deadline=Date.now()+30000;
  while(displayed.surface!=='reverse'&&Date.now()<deadline)displayed=await world();
  assert.deepEqual([displayed.w,displayed.h,displayed.panels,displayed.surface,displayed.visible],[30,22,1,'reverse',28]);
  assert.ok(displayed.speeder&&displayed.trakk);
  if(await js('document.querySelector("#camera").textContent.trim()==="탑뷰"'))await click('#camera');
  async function selectTrakk(){
    await world();
    const at=await js('(()=>{const r=document.querySelector("#view").getBoundingClientRect(),p=tabletopView.screen("wartrakk-1");return {x:r.left+p.x,y:r.top+p.y}})()');
    for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{
      type,...at,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1,
    });
  }
  await selectTrakk();
  assert.ok(await js('document.querySelector("#training-four-right").checkVisibility()'));
  await click('#training-four-right');
  const rotated=await drill();
  assert.ok(Number.isFinite(rotated.positions[wartrakk]?.yaw));
  await click('#undo');assert.deepEqual((await drill()).positions,{});
  assert.equal(await js('document.querySelector("#training-four-zones").checked'),true);
  await click('#training-four-zones');assert.equal(await js('document.querySelector("#training-four-zones").checked'),false);
  await click('#training-four-zones');
  await click('#training-four-begin');const initial=await drill();
  assert.deepEqual([initial.round,initial.active,initial.phase],[1,'orks','command']);
  assert.equal(initial.hp[speeder],9);assert.equal(initial.hp[wartrakk],7);
  assert.deepEqual(trainingFourVP(initial.mission),{orks:0,marines:0});
  const sites=await hud();assert.equal(sites.length,3);
  assert.deepEqual(sites.map(a=>a.id).sort(),['grot-foundation','marine-foundation','ork-foundation']);
  assert.equal((await pad('marine-foundation')).marines,3);
  await click(action('four-score'));const scored=await drill();
  assert.deepEqual(trainingFourVP(scored.mission),{orks:15,marines:0});
  assert.equal(scored.phase,'movement');assert.equal(await has(action('four-score')),false);
  await click('#undo');assert.deepEqual(await drill(),initial);
  await click('#redo');await reload();assert.deepEqual(await drill(),scored);
  assert.equal(await has(action('four-score')),false);
  const snapshot=await state(),tampered=structuredClone(snapshot);
  tampered.training.mission.turns[0].areas[0].orks++;
  await upload(tampered);assert.deepEqual((await state()).training,snapshot.training);

  const marines=await advanceUntil(t=>t.active==='marines'&&t.phase==='command');
  assert.deepEqual(trainingFourVP(marines.mission),{orks:15,marines:0});
  await click(action('four-score'));const marineMove=await drill();
  assert.deepEqual(trainingFourVP(marineMove.mission),{orks:15,marines:5});
  // Move the Speeder 4.5 inches south, beyond its foundation. Compute the
  // projected displacement from three known model positions in the top view.
  if(await js('document.querySelector("#camera").textContent.trim()==="탑뷰"'))await click('#camera');
  await click(action('move','[data-unit="landSpeeder"][data-mode="normal"]'));
  const points=await js('new Promise(resolve=>requestAnimationFrame(()=>{const r=document.querySelector("#view").getBoundingClientRect();'+
    'resolve(["landSpeeder-1","wartrakk-1","gretchin-1"].map(id=>{const p=tabletopView.screen(id),w=tabletopView.pose(id);'+
    'return {x:r.left+p.x,y:r.top+p.y,wx:w.x,wz:w.z}}))}))');
  const [a,b,c]=points,dx=b.wx-a.wx,dz=b.wz-a.wz,ex=c.wx-a.wx,ez=c.wz-a.wz,det=dx*ez-dz*ex;
  const k=-4.5*ex/det,l=4.5*dx/det;
  const to={x:a.x+k*(b.x-a.x)+l*(c.x-a.x),y:a.y+k*(b.y-a.y)+l*(c.y-a.y)};
  const mouse=(type,p,buttons)=>send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',buttons,clickCount:1});
  await mouse('mousePressed',a,1);await mouse('mouseMoved',to,1);await mouse('mouseReleased',to,0);
  const draft=await drill();assert.ok(draft.plan.paths[speeder]?.length,'A real pointer drag must create a legal move');
  await click(action('finish'));const moved=await drill();
  assert.equal(moved.plan,null);assert.ok(Math.abs(moved.poses[speeder].z-marineMove.poses[speeder].z-4.5)<.18);
  assert.equal((await pad('marine-foundation')).marines,1);
  assert.deepEqual(trainingFourVP(moved.mission),{orks:15,marines:5});
  await reload();assert.deepEqual(await drill(),moved);assert.equal((await pad('marine-foundation')).marines,1);

  const final=await advanceUntil(t=>t.winner);
  assert.deepEqual([final.round,final.winner,final.mission.turns.length],[5,'orks',10]);
  assert.deepEqual(trainingFourVP(final.mission),{orks:75,marines:25});
  assert.match(await js('document.querySelector("#training-four-status").textContent'),/오크/);
  await reload();assert.deepEqual(await drill(),final);
  await click('#training-four-exit');const restored=await state();
  for(const key of ['rules','pieces','surface','layout'])assert.deepEqual(restored[key],original[key],key);
  assert.ok(!restored.training);
  const normal=await world();
  assert.deepEqual([normal.w,normal.h,normal.panels,normal.surface,normal.speeder],[44,30,2,'front',null]);
  // A 15° pivot into small ruin 2 is an illegal placement, but the same
  // facing is a permissible intermediate waypoint in an actual move.
  const fresh=trainingFourDeployment.create(),start=trainingFourDeployment.pieces(fresh).find(p=>p.id===wartrakk);
  const parked=trainingFourDeployment.move(fresh,wartrakk,start.x,start.z-.25,start.yaw+Math.PI/6);
  await upload({...original,training:parked});await click('[data-tab=battle]');
  if(await js('document.querySelector("#camera").textContent.trim()==="탑뷰"'))await click('#camera');
  await selectTrakk();
  await click('#training-four-left');
  assert.match(await js('document.querySelector("#notice").textContent'),/워트랙.*차체.*폐허 2.*관통/);
  assert.deepEqual(await drill(),parked);
  await click('#training-four-begin');await click(action('four-score'));
  await click(action('move','[data-unit="wartrakk"][data-mode="normal"]'));
  await selectTrakk();await click('#training-four-left');
  const inside=await drill();assert.equal(inside.plan.paths[wartrakk].length,1);
  await click(action('finish'));
  assert.deepEqual(await drill(),inside);
  assert.match(await js('document.querySelector("#notice").textContent'),/워트랙.*차체.*폐허 2.*관통/);
  await click('#training-four-right');await click(action('finish'));
  const done=await drill();
  assert.equal(done.plan,null);
  assert.deepEqual(done.poses[wartrakk],parked.positions[wartrakk]);
  await reload();assert.deepEqual(await drill(),done);
  await click('#training-four-exit');
  await upload(save);await click('[data-tab=battle]');
}
