import assert from 'node:assert/strict';

// Invoked by browser-acceptance.mjs in both the public and local-art editions.
// Build each firing opportunity through the ordinary declarations and dice UI.
export async function checkShootingReactions({movementFixture,upload,choose,click,button,state,js,drag,reload}){
  const available=action=>js('!!document.querySelector('+JSON.stringify(button(action)+':not(:disabled)')+')');
  const field=name=>'[data-field="'+name+'"]';
  const choices=name=>js('Array.from(document.querySelector('+JSON.stringify(field(name))+')?.options??[],o=>o.value)');
  const point=(s,id)=>{const p=s.pieces.find(p=>p.id===id);return [p.x,p.z];};
  function at(s,id,x,z){
    const pair=point(s,id);
    assert.ok(Math.hypot(pair[0]-x,pair[1]-z)<.16,'Expected '+id+' near '+[x,z]+', found '+pair);
  }
  async function load(g){
    await upload(g);await click('[data-tab=battle]');await click('#home');await click('#camera');
  }
  async function act(key,sample){
    if(sample===undefined){await click(button(key));return;}
    const generator=Array.isArray(sample)?'(()=>{const d='+JSON.stringify(sample)+';return ()=>d.shift()??.01})()':'()=>'+sample;
    await js('window.savedReactionRandom=Math.random;Math.random='+generator);
    try{await click(button(key));}finally{await js('Math.random=window.savedReactionRandom');}
  }
  async function row(shooter,index,target){
    await choose('fighter',shooter);await choose('weapon',String(index));await choose('target',target);await act('attack');
  }
  async function shoot(shooter,index,target){
    await row(shooter,index,target);await act('lock');await act('resolve-0',.01);
  }
  const vet='vanguard-1',grot='gretchin-1',otherGrot='gretchin-2',boss='warboss-1';
  const center='captain-1',far='landSpeeder-1',boy='boy-2',rifle='intercessor-1';
  const marineGame=movementFixture({[grot]:[0,0],[otherGrot]:[0,1.6],[vet]:[5.8,0],
    [boss]:[-3,-3],[center]:[7.9,0],[far]:[10.4,0]},[grot,otherGrot,vet,boss],'orks');
  marineGame.rules.step=2;
  // Rapid Reactions is a datasheet ability. Battle-shock does not prevent a normal move.
  marineGame.rules.units.vanguard={shocked:true};
  await load(marineGame);
  await row(grot,1,vet);await row(otherGrot,0,vet);await act('lock');await act('resolve-0',.01);
  let s=await state();assert.ok(s.rules.declaration?.locked);assert.ok(!s.rules.shootingReaction);
  assert.equal(await available('reaction-start'),false);
  await act('resolve-'+s.rules.declaration.rows.findIndex(r=>!r.done),.01);
  s=await state();assert.equal(s.rules.hazard.count,1);
  assert.equal(await available('reaction-start'),false);assert.equal(await available('next'),false);
  await act('hazard-roll',.01);s=await state();assert.deepEqual(s.rules.hazard.commandDice,[1]);
  assert.equal(await available('reaction-start'),false);
  await act('hazard-command',.98);s=await state();
  assert.equal(s.rules.cp.orks,0);
  assert.deepEqual(s.rules.units.gretchin.hitTargets,[]);assert.equal(s.rules.hazard,null);
  assert.ok(s.rules.shootingReaction.targets.includes('vanguard'));assert.equal(s.rules.shootingReaction.shooter,'gretchin');
  assert.equal(await available('next'),false);assert.equal(await available('attack'),false);
  await choose('reaction-unit','vanguard');await click(field('reaction-fly'));await act('reaction-start',.5);
  s=await state();assert.equal(s.rules.reactionPlan.mode,'rapid');assert.equal(s.rules.reactionPlan.die,4);
  assert.equal(s.rules.reactionPlan.takeToSkies,true);assert.equal(s.rules.cp.marines,1);
  const before=structuredClone(s.rules.reactionPlan);
  await drag(vet,far);s=await state();assert.deepEqual(s.rules.reactionPlan,before);at(s,vet,5.8,0);
  await drag(vet,center);s=await state();at(s,vet,7.9,0);
  const edited=structuredClone(s.rules.reactionPlan);
  await reload();s=await state();assert.deepEqual(s.rules.reactionPlan,edited);at(s,vet,7.9,0);
  await act('reaction-finish');s=await state();assert.ok(!s.rules.reactionPlan);assert.ok(!s.rules.shootingReaction);
  await click('#undo');assert.deepEqual((await state()).rules.reactionPlan,edited);
  await click('#redo');at(await state(),vet,7.9,0);
  await shoot(boss,0,vet);s=await state();assert.ok(!s.rules.shootingReaction,'Vanguard can react only once per turn');

  // The captain is the shooter. The Vanguard and Intercessor are equally close
  // to the single surviving Boy. Both are closer than the captain.
  const orkGame=movementFixture({[center]:[0,-10],[boy]:[0,0],[rifle]:[6,0],[vet]:[-6,0],
    [far]:[4.2,0],'librarian-1':[-4.2,0]},[center,boy,rifle,vet],'marines');
  orkGame.rules.step=2;orkGame.rules.cp.orks=2;
  await load(orkGame);await shoot(center,0,boy);
  s=await state();
  assert.equal(s.rules.shootingReaction.shooter,'captain');assert.deepEqual(s.rules.shootingReaction.targets,['boy-0']);
  assert.deepEqual(s.rules.units.captain.hitTargets,[]);assert.equal(s.rules.cp.orks,2);
  const offered=structuredClone(s.rules.shootingReaction);
  await act('reaction-decline');s=await state();assert.ok(!s.rules.shootingReaction);assert.equal(s.rules.cp.orks,2);
  await click('#undo');assert.deepEqual((await state()).rules.shootingReaction,offered);
  await choose('reaction-unit','boy-0');
  assert.deepEqual((await choices('reaction-target')).filter(Boolean).sort(),['intercessor','vanguard']);
  await choose('reaction-target','intercessor');await act('reaction-start',.7);
  s=await state();assert.equal(s.rules.reactionPlan.target,'intercessor');assert.equal(s.rules.reactionPlan.mode,'surge');
  assert.equal(s.rules.reactionPlan.die,5);assert.equal(s.rules.cp.orks,1);
  await drag(boy,'librarian-1');at(await state(),boy,-4.2,0);
  await act('reaction-finish');assert.ok((await state()).rules.reactionPlan,'Surge must not engage the unselected tied enemy');
  await act('reaction-cancel');s=await state();at(s,boy,0,0);assert.equal(s.rules.cp.orks,1);
  assert.ok(!s.rules.reactionPlan);assert.ok(!s.rules.shootingReaction);
  await click('#undo');s=await state();at(s,boy,-4.2,0);assert.equal(s.rules.reactionPlan.target,'intercessor');
  await click('#undo');s=await state();at(s,boy,0,0);
  await drag(boy,far);at(await state(),boy,4.2,0);await act('reaction-finish');s=await state();
  assert.ok(!s.rules.reactionPlan);assert.equal(s.rules.cp.orks,1);
  await drag(boy,'librarian-1');at(await state(),boy,4.2,0);
  for(const change of [g=>{g.rules.units['boy-0']={shocked:true};},g=>{g.rules.cp.orks=0;},
    g=>{g.pieces.find(p=>p.id===center).z=-2.4;}]){
    const blocked=structuredClone(orkGame);change(blocked);
    await load(blocked);await shoot(center,0,boy);
    assert.equal(await available('reaction-start'),false);assert.ok(!(await state()).rules.shootingReaction);
  }
  // Medi-squigs is used as targets are declared. One stratagem per unit per
  // phase prevents that same unit from buying a surge after the last shot.
  await load(orkGame);await choose('fighter',boy);assert.equal(await available('tactic-med'),false);
  await row(center,0,boy);await choose('fighter',boy);assert.equal(await available('tactic-med'),false);
  await act('lock');await choose('fighter',boy);await act('tactic-med');
  s=await state();assert.equal(s.rules.cp.orks,1);assert.equal(s.rules.patrol.tactics.med,'1-marines-2/boy-0');
  await act('resolve-0',.01);s=await state();
  assert.ok(!s.rules.shootingReaction);assert.equal(s.rules.cp.orks,1);
  const secondRifle='intercessor-2';
  const split=movementFixture({[rifle]:[6,0],[secondRifle]:[6,2],[boy]:[0,0],[grot]:[0,3]},
    [rifle,secondRifle,boy,grot],'marines');
  split.rules.step=2;split.rules.cp.orks=2;
  await load(split);await row(rifle,0,boy);await row(secondRifle,0,grot);await act('lock');
  await act('resolve-0',.01);s=await state();assert.ok(!s.rules.shootingReaction);
  await act('resolve-'+s.rules.declaration.rows.findIndex(r=>!r.done),.01);
  assert.deepEqual((await choices('reaction-unit')).sort(),['boy-0','gretchin']);
  await choose('reaction-unit','gretchin');await act('reaction-start',.5);await act('reaction-cancel');
  s=await state();assert.equal(s.rules.cp.orks,1);assert.ok(!s.rules.shootingReaction);assert.ok(!s.rules.reactionPlan);
  const trakk='wartrakk-1';
  const suppression=movementFixture({[trakk]:[0,-8],[rifle]:[-3,1],[vet]:[3,1]},[trakk,rifle,vet],'orks');
  suppression.rules.step=2;
  await load(suppression);await row(trakk,0,rifle);await row(trakk,1,vet);await act('lock');
  // One hit and zero wounds with each weapon. The rokkit rolls for attack count first.
  await act('resolve-0',[.01,.96,.01]);s=await state();
  await act('resolve-'+s.rules.declaration.rows.findIndex(r=>!r.done),[.96,.01]);
  s=await state();assert.deepEqual([...s.rules.units.wartrakk.hitTargets].sort(),['intercessor','vanguard']);
  assert.deepEqual((await choices('suppressTarget')).sort(),['intercessor','vanguard']);
  assert.equal(await available('reaction-start'),false);assert.equal(await available('next'),false);
  await choose('suppressTarget','intercessor');await act('suppress-shot');s=await state();
  assert.equal(s.rules.patrol.suppressed,'intercessor');assert.equal(s.rules.units.wartrakk.suppressedEnemy,true);
  assert.deepEqual(await choices('reaction-unit'),['vanguard']);assert.equal(await available('reaction-start'),true);
  await act('reaction-decline');assert.equal(await available('next'),true);
  return {rapidAfterHazard:true,rapidFly:true,rapidOnce:true,surgeClosestTie:true,surgeCost:true,
    reactionUndoReload:true,unavailableSurges:4,mediSquigWindow:true,splitShotReaction:true,wartrakkBeforeVanguard:true};
}
