import assert from 'node:assert/strict';
import {newBattle,startBattle} from './battle.mjs';

const warboss='warboss-1',captain='captain-1';
const roster=[
  captain,...Array.from({length:5},(_,i)=>'intercessor-'+(i+1)),
  warboss,...Array.from({length:10},(_,i)=>'boy-'+(i+1)),
  'largeRuin-2','smallRuin-2','smallRuin-3',
].sort();
const option='#training-two-options ';
const close=(a,b,tolerance,message)=>assert.ok(Math.abs(a-b)<=tolerance,message+' ('+a+' vs '+b+')');

export async function checkTrainingTwo({save,upload,click,state,js,reload,send}){
  const previous=structuredClone(save);
  previous.surface='front';
  previous.rules=startBattle(newBattle(),'marines',5);
  previous.rules.hp[warboss]=3;
  Object.assign(previous.pieces.find(p=>p.id===warboss),{x:12,z:-8,elevation:1.5,yaw:.4});
  previous.pieces.find(p=>p.id===captain).removed=true;
  await upload(previous);await click('[data-tab=battle]');
  const battle=await state(),ids=battle.pieces.map(p=>p.id);
  assert.deepEqual(battle.rules,previous.rules);
  async function shown(){
    // Wait for the ordinary renderer to consume the preceding UI change.
    await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    return js('(()=>{const s=tabletopView.stats();return {width:s.boardWidth,depth:s.boardDepth,'+
      'panels:s.boardPanels,surface:s.boardSurface,count:s.visiblePieces,'+
      'poses:Object.fromEntries('+JSON.stringify(ids)+'.map(id=>[id,tabletopView.pose(id)]))}})()');
  }
  async function preserveBattle(){
    const now=await state();
    for(const key of ['rules','pieces','layout','surface'])assert.deepEqual(now[key],battle[key],key);
    return now.training;
  }
  const oldScene=await shown();
  assert.deepEqual([oldScene.width,oldScene.depth,oldScene.panels,oldScene.surface],[44,30,2,'front']);
  assert.equal(oldScene.poses[captain],null);
  assert.equal(oldScene.count,battle.pieces.filter(p=>!p.removed).length);
  assert.ok(await js('document.querySelector("#training-two-start").checkVisibility()'));
  await click('#training-two-start');
  const start=await preserveBattle();
  assert.deepEqual([start.scenario,start.active,start.phase,start.round],[2,'orks','movement',1]);
  assert.ok(await js('document.querySelector("#training-two-play").checkVisibility()'));
  const status=await js('document.querySelector("#training-two-status").innerText');
  assert.match(status,/오크/);assert.match(status,/이동/);
  // The alternate face loads asynchronously, including when studio art is installed.
  let drill=await shown();
  const deadline=Date.now()+30000;
  while(drill.surface!=='reverse'&&Date.now()<deadline)drill=await shown();
  assert.deepEqual([drill.width,drill.depth,drill.panels,drill.surface,drill.count],[30,22,1,'reverse',20]);
  assert.deepEqual(Object.keys(drill.poses).filter(id=>drill.poses[id]).sort(),roster);
  close(drill.poses[warboss].x,2.7,.4,'Warboss starts on the upper-right foundation');
  close(drill.poses[warboss].z,-2.7,.4,'Warboss deployment depth');
  close(drill.poses[captain].x,-9.4,.4,'Captain starts on the lower-left foundation');
  close(drill.poses[captain].z,4.3,.4,'Captain deployment depth');

  // Use the real top view. The difference between the projected positions of
  // the two heroes supplies a reachable point along the diagonal into open ground.
  if(await js('document.querySelector("#camera").textContent.trim()==="탑뷰"'))await click('#camera');
  await click(option+'[data-action="move"][data-unit="warboss"][data-mode="normal"]');
  const plan=await preserveBattle();
  assert.equal(plan.plan.unit,'warboss');
  const screen=id=>js('(()=>{const p=tabletopView.screen('+JSON.stringify(id)+'),r=document.querySelector("#view").getBoundingClientRect();return {x:r.left+p.x,y:r.top+p.y}})()');
  const from=await screen(warboss),toward=await screen(captain);
  const target={x:from.x+(toward.x-from.x)*.15,y:from.y+(toward.y-from.y)*.15};
  const mouse=(type,point,buttons)=>send('Input.dispatchMouseEvent',{type,...point,button:'left',buttons,clickCount:1});
  await mouse('mousePressed',from,1);
  await mouse('mouseMoved',target,1);
  await mouse('mouseReleased',target,0);
  const moved=await shown(),movedState=await preserveBattle();
  const startPose=drill.poses[warboss],endPose=moved.poses[warboss];
  for(const axis of ['x','z']){
    const expected=startPose[axis]+.15*(drill.poses[captain][axis]-startPose[axis]);
    close(endPose[axis],expected,.16,'Pointer drag moves the visible Warboss along '+axis);
  }
  for(const id of roster.filter(id=>id!==warboss))assert.deepEqual(moved.poses[id],drill.poses[id],id);
  assert.notDeepEqual(movedState,plan);
  await click('#undo');assert.deepEqual(await preserveBattle(),plan);
  assert.deepEqual((await shown()).poses,drill.poses);
  await click('#redo');assert.deepEqual(await preserveBattle(),movedState);
  assert.deepEqual((await shown()).poses,moved.poses);
  await reload();
  assert.deepEqual(await preserveBattle(),movedState);
  assert.deepEqual(await shown(),moved);
  await click(option+'[data-action="finish"]');
  assert.equal((await preserveBattle()).plan,null);
  assert.deepEqual((await shown()).poses,moved.poses);
  const committed=await state();
  const forged=structuredClone(committed);
  forged.training.hp[warboss]=0;
  await upload(forged);
  assert.deepEqual(await state(),committed,'Reject a save with damage missing from its action history');
  for(let transitions=0;transitions<90;transitions++){
    if((await state()).training.winner)break;
    await click(option+'[data-action="next"]');
  }
  assert.equal((await preserveBattle()).winner,'draw');
  assert.match(await js('document.querySelector("#training-two-status").textContent'),/무승부/);
  await click('#training-two-exit');
  assert.ok(!(await preserveBattle()));
  assert.deepEqual(await shown(),oldScene);
  assert.ok(await js('document.querySelector("#training-two-start").checkVisibility()'));
  await upload(save);await click('[data-tab=battle]');
}
