import assert from 'node:assert/strict';
import {newBattle,startBattle} from './battle.mjs';

const captain='captain-1';
const sequence=(kind,count)=>Array.from({length:count},(_,i)=>kind+'-'+(i+1));
const models=[captain,...sequence('intercessor',5),'warboss-1',...sequence('boy',10),...sequence('gretchin',5)];
const ruins=['largeRuin-2','smallRuin-1','smallRuin-2','smallRuin-3'];

export async function checkTrainingThree({save,upload,click,state,js,reload,send}){
  // The main battle is live, with a removed captain and a wounded Warboss.
  // Entering the handbook drill must temporarily show its own healthy roster.
  const fixture=structuredClone(save);
  fixture.surface='front';
  fixture.rules=startBattle(newBattle(),'marines',5);
  fixture.rules.hp['warboss-1']=3;
  Object.assign(fixture.pieces.find(p=>p.id===captain),{x:-12,z:7,elevation:1.5,removed:true});
  await upload(fixture);await click('[data-tab=battle]');
  const battle=await state(),ids=battle.pieces.map(p=>p.id);
  assert.deepEqual(battle.rules,fixture.rules);
  async function deployment(){
    const current=await state();
    for(const key of ['pieces','rules','layout','surface'])assert.deepEqual(current[key],battle[key],key);
    return current.training;
  }
  async function scene(){
    await js('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))');
    return js('(()=>{const s=tabletopView.stats();return {width:s.boardWidth,depth:s.boardDepth,'+
      'panels:s.boardPanels,surface:s.boardSurface,count:s.visiblePieces,'+
      'poses:Object.fromEntries('+JSON.stringify(ids)+'.map(id=>[id,tabletopView.pose(id)]))}})()');
  }
  async function reverseScene(){
    // The studio texture may still be loading immediately after entry or reload.
    let drawn=await scene();
    const deadline=Date.now()+30000;
    while(drawn.surface!=='reverse'&&Date.now()<deadline)drawn=await scene();
    assert.deepEqual([drawn.width,drawn.depth,drawn.panels,drawn.surface,drawn.count],[30,22,1,'reverse',26]);
    return drawn;
  }
  const screen=id=>js('(()=>{const p=tabletopView.screen('+JSON.stringify(id)+'),r=document.querySelector("#view").getBoundingClientRect();return {x:p.x+r.left,y:p.y+r.top}})()');
  const mouse=(type,p,buttons)=>send('Input.dispatchMouseEvent',{type,...p,buttons,button:'left',clickCount:1});
  async function dragCaptain(to){
    await mouse('mousePressed',await screen(captain),1);
    await mouse('mouseMoved',to,1);
    await mouse('mouseReleased',to,0);
  }
  const prior=await scene();
  assert.deepEqual([prior.width,prior.depth,prior.panels,prior.surface],[44,30,2,'front']);
  assert.equal(prior.count,battle.pieces.filter(p=>!p.removed).length);
  assert.equal(prior.poses[captain],null);
  assert.ok(await js('document.querySelector("#training-three-start").checkVisibility()'));
  await click('#training-three-start');
  assert.ok(await js('document.querySelector("#training-three-play").checkVisibility()'));
  assert.ok(await js('document.querySelector("#training-three-status").innerText.trim().length>0'));
  const initial=await deployment();
  assert.deepEqual([initial.scenario,initial.phase,initial.positions],[3,'deployment',{}]);
  const printed=await reverseScene();
  const visible=Object.keys(printed.poses).filter(id=>printed.poses[id]).sort();
  assert.deepEqual(visible,[...models,...ruins].sort());
  assert.equal(models.length,22);assert.equal(ruins.length,4);

  if(await js('document.querySelector("#camera").textContent.trim()==="탑뷰"'))await click('#camera');
  // In the top view, a fraction of the screen-space difference between the
  // two grots gives a roughly half-inch adjustment into free space behind the
  // captain. The same difference in world coordinates supplies the expected pose.
  const from=await screen(captain),a=await screen('gretchin-1'),b=await screen('gretchin-3');
  const f=.4,target={x:from.x+f*(b.x-a.x),y:from.y+f*(b.y-a.y)};
  assert.ok(Math.hypot(target.x-from.x,target.y-from.y)>3,'Captain drag must exceed the click threshold');
  await dragCaptain(target);
  const moved=await deployment(),after=await scene();
  assert.deepEqual(Object.keys(moved.positions),[captain]);
  for(const axis of ['x','z']){
    const expected=printed.poses[captain][axis]+f*(printed.poses['gretchin-3'][axis]-printed.poses['gretchin-1'][axis]);
    assert.ok(Math.abs(after.poses[captain][axis]-expected)<.13,'Captain display '+axis);
    assert.ok(Math.abs(after.poses[captain][axis]-moved.positions[captain][axis])<1e-6,'Saved captain '+axis);
  }
  for(const id of ids.filter(id=>id!==captain))assert.deepEqual(after.poses[id],printed.poses[id],id);

  // One destination overlaps a friendly base; the other is in the far Ork zone.
  for(const destination of ['intercessor-5','warboss-1']){
    await dragCaptain(await screen(destination));
    assert.deepEqual(await deployment(),moved,'Rejected drop on '+destination);
    assert.deepEqual((await scene()).poses,after.poses,'Rejected drop must revert the rendered preview');
  }
  await click('#undo');
  assert.deepEqual(await deployment(),initial,'Rejected drops must not add undo steps');
  assert.deepEqual((await scene()).poses,printed.poses);
  await click('#redo');assert.deepEqual(await deployment(),moved);
  await reload();
  assert.deepEqual(await deployment(),moved);
  assert.deepEqual((await reverseScene()).poses,after.poses);
  await click('#training-three-begin');
  assert.equal((await deployment()).active,'orks');
  assert.deepEqual((await scene()).poses,after.poses,'Preserve the adjusted deployment at the first turn');
  const action=key=>'#training-three-options [data-action="'+key+'"]';
  async function skip(){
    const next=(await deployment()).phase==='shooting'?'shoot-next':'next';
    await click(action(next));
  }
  for(let i=0;i<20;i++){
    const s=await deployment();
    if(s.active==='marines'&&s.phase==='shooting')break;
    await skip();
  }
  await click(action('shoot-unit')+'[data-unit="captain"]');
  await click(action('shoot-weapon')+'[data-model="captain-1"][data-weapon="0"]');
  await click(action('shoot-target')+'[data-target="gretchin"]');
  await click('#training-three-options fieldset button');
  assert.match(await js('document.querySelector("#hint").textContent'),/시점 높이/);
  assert.equal(await js('tabletopView.pose("gretchin-2")'),null);
  assert.ok(await js('tabletopView.pose("gretchin-1")'));
  await click('#home');
  assert.ok(await js('tabletopView.pose("gretchin-2")'));
  for(const id of sequence('gretchin',5)){
    await click(action('shoot-sight')+'[data-id="'+id+'"][data-visibility="partial"]');
  }
  await click(action('shoot-confirm'));
  const inCover=await deployment();
  assert.equal(inCover.shooting.shot.cover,true);
  await reload();assert.deepEqual(await deployment(),inCover);
  // Each side uses the same controls as a real game. Force two successes and a
  // failed save so a single casualty and its undo are observable on the table.
  await js('window.savedRandom=Math.random;Math.random=()=>.99');
  try{
    await click(action('shoot-roll'));await click(action('shoot-roll'));
    await js('Math.random=()=>0');
    await click(action('shoot-roll'));
    await click(action('shoot-allocate')+'[data-model="gretchin-1"]');
  }finally{await js('Math.random=window.savedRandom;delete window.savedRandom')}
  assert.equal((await scene()).poses['gretchin-1'],null);
  await click('#undo');assert.ok((await scene()).poses['gretchin-1']);
  await click('#redo');assert.equal((await scene()).poses['gretchin-1'],null);
  await click(action('shoot-finish'));
  for(let i=0;i<130&&!(await deployment()).winner;i++)await skip();
  assert.equal((await deployment()).winner,'draw');
  assert.match(await js('document.querySelector("#training-three-status").textContent'),/무승부/);
  await click('#training-three-exit');
  assert.ok(!(await deployment()));
  assert.deepEqual(await scene(),prior);
  assert.ok(await js('document.querySelector("#training-three-start").checkVisibility()'));
  await upload(save);await click('[data-tab=battle]');
}
