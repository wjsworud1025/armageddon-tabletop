import assert from 'node:assert/strict';
import {newBattle,startBattle} from '../rules/battle.mjs';
import {createTable} from '../data/catalog.mjs';
import {patrolTerrainPlacement} from '../rules/patrol-terrain-placement.mjs';
import {sightButton} from './browser-shooter-sight.mjs';

const upper='intercessor-2',ground='intercessor-3',enemy='gretchin-1';

function battlefield(save,upstairsTarget){
  const fixture=structuredClone(save);
  delete fixture.training;
  fixture.layout=null;
  fixture.rules={...startBattle(newBattle(),'marines',5),step:2};
  // Each upper base sits on a complete physical deck. The second ruin is
  // translated nine inches to keep the two units out of engagement range.
  const poses={'largeRuin-1':[0,0,0],[upper]:[-.9,-.55,3.37],[ground]:[.65,.9,0],[enemy]:[8,1,0]};
  if(upstairsTarget){
    poses['largeRuin-2']=[9,0,0];
    fixture.reliquaryRevision=2;
    poses[enemy]=[7.70,.65,3.02];
    const items=createTable().pieces;
    const ruin={...items.find(p=>p.id==='largeRuin-2'),x:9,z:0,yaw:0};
    const target={...items.find(p=>p.id===enemy),x:7.70,z:.65,elevation:3.02,yaw:0};
    assert.equal(patrolTerrainPlacement(target,[ruin]).error,'');
  }
  for(const p of fixture.pieces){
    p.removed=!poses[p.id];
    if(!p.removed)[p.x,p.z,p.elevation,p.yaw]=[...poses[p.id],0];
  }
  return fixture;
}

export async function checkPlungingFire({save,upload,state,js,click,reload,screenshot}){
  const action=key=>'[data-act="'+key+'"]';
  async function choose(key,value){
    const selected=await js(`(()=>{const e=document.querySelector('[data-field="${key}"]');e.value=${JSON.stringify(value)};
      const selected=e.value;e.dispatchEvent(new Event('change',{bubbles:true}));return selected})()`);
    assert.equal(selected,value);
  }
  const shownSkill=who=>js('Number(document.querySelector('+JSON.stringify('[data-sight-row="'+who+'"] [data-ballistic-skill]')+')?.dataset.ballisticSkill)');
  const packetLabel=index=>js('document.querySelector('+JSON.stringify(action('staged-'+index))+').textContent');
  async function selectRifleAndSight(upstairsTarget){
    await click('[data-tab=battle]');
    await choose('fighter',upper);await choose('weapon','0');await choose('target',enemy);
    for(const who of [upper,ground])await click(sightButton(who,enemy));
    for(const [who,height] of [[upper,3.37],[ground,0],[enemy,upstairsTarget?3.02:0]]){
      const pose=await js('tabletopView.pose('+JSON.stringify(who)+')');
      assert.ok(pose&&Math.abs(pose.elevation-height)<1e-7,'Rendered base height: '+who);
    }
    for(const who of [upper,ground]){
      const expected=who===upper&&!upstairsTarget?2:3;
      assert.equal(await shownSkill(who),expected,who);
      if(expected===2){
        const text=await js('document.querySelector('+JSON.stringify('[data-sight-row="'+who+'"]')+').textContent');
        assert.match(text,/고지 사격/);
      }
    }
  }
  const packetButtonTexts=()=>js('Array.from(document.querySelectorAll(\'[data-act^="staged-"]\'),b=>b.textContent)');
  async function shot(key,dice){
    // Throw on extra rolls to catch wrongly pooled shots, or a BS 3+ shooter
    // incorrectly advancing to the wound roll after a pair of natural twos.
    await js('window.plungeRandom=Math.random;window.plungeDice='+JSON.stringify(dice)+';Math.random=()=>{if(!plungeDice.length)throw Error("Unexpected attack die");return (plungeDice.shift()-.5)/6}');
    try{
      await click(action(key));
      assert.equal(await js('plungeDice.length'),0,'Unused dice at '+key);
    }finally{
      await js('Math.random=window.plungeRandom;delete window.plungeRandom;delete window.plungeDice');
    }
  }
  async function capture(selector,name){
    if(!screenshot)return;
    await js('document.querySelector('+JSON.stringify(selector)+').scrollIntoView({block:"center"})');
    await screenshot(name);
  }
  async function selectFromRoster(){
    await click('[data-tab=roster]');
    await js(`(()=>{const e=document.querySelector('#search');e.value='${upper}';e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    await click('[aria-label$="'+upper+'"]');
  }
  const upstairs='[data-floor-height="3.37"]';
  const display=battlefield(save,false),foot=display.pieces.find(p=>p.id===upper);
  foot.elevation=0;display.rules=null;
  await upload(display);await selectFromRoster();
  await capture(upstairs,'06-plunging-fire-floor.png');
  await click(upstairs);
  const poseIn=s=>s.pieces.find(p=>p.id===upper);
  assert.deepEqual(poseIn(await state()),{...foot,elevation:3.37});
  assert.equal((await js('tabletopView.pose('+JSON.stringify(upper)+')')).elevation,3.37);
  await click('#undo');assert.deepEqual(poseIn(await state()),foot);
  await click('#redo');assert.equal(poseIn(await state()).elevation,3.37);

  // §22.05 only improves BS when the target unit includes a ground-level
  // model. An attack against an entirely elevated unit remains legal.
  await upload(battlefield(save,true));await selectRifleAndSight(true);
  await click(action('volley'));await click(action('lock'));
  let plan=(await state()).rules.declaration;
  assert.equal(plan.locked,true);assert.equal(plan.rows.length,2);
  assert.ok(plan.rows.every(r=>r.plunging===false));
  let packets=await packetButtonTexts();
  assert.equal(packets.length,1);assert.match(packets[0],/BS\s*3\+/);

  const movement=structuredClone(display);
  movement.rules={...startBattle(newBattle(),'marines',5),step:1};
  await upload(movement);await click('[data-tab=battle]');await choose('fighter',upper);
  await click(action('normal'));await selectFromRoster();await click(upstairs);
  const moved=await state(),route=moved.rules.movePlan.paths[upper];
  assert.deepEqual(route,[{x:foot.x,z:foot.z,yaw:foot.yaw,elevation:3.37}]);
  assert.equal(moved.rules.movePlan.type,'normal');
  await click('[data-floor-height="0"]');
  assert.deepEqual((await state()).rules.movePlan.paths[upper],route,'Two climbs cost 6.74 inches, above the 6-inch allowance');
  assert.match(await js('document.querySelector("#notice").textContent'),/누적 이동 거리/);
  await click('[data-tab=battle]');await click(action('move-finish'));await click(action('next'));
  await click(action('overwatch-decline'));
  assert.equal((await state()).rules.step,2);
  const afterClimb=(await state()).rules;
  await selectFromRoster();
  assert.equal(await js('document.querySelector("#floor-levels").hidden'),true,'Ordinary shooting cannot edit floors');
  await selectRifleAndSight(false);
  await click('[data-field=cover]');
  assert.equal(await shownSkill(upper),3,'Cover takes the upper shooter from BS 2+ to 3+');
  assert.equal(await shownSkill(ground),3,'Manual cover against the upper shooter does not alter the ground shooter');
  await click('[data-field=cover]');
  assert.equal(await shownSkill(upper),2);assert.equal(await shownSkill(ground),3);
  await capture('[data-sight-row="'+upper+'"]','06-plunging-fire-shooters.png');
  await click(action('volley'));await click(action('lock'));
  plan=(await state()).rules.declaration;
  assert.equal(plan.locked,true);assert.equal(plan.rows.length,2);
  const upperIndex=plan.rows.findIndex(r=>r.actor===upper),groundIndex=plan.rows.findIndex(r=>r.actor===ground);
  assert.equal(plan.rows[upperIndex]?.plunging,true);assert.equal(plan.rows[groundIndex]?.plunging,false);
  assert.ok(plan.rows.every(r=>r.target==='gretchin'&&r.weapon===0&&r.hit===0&&r.heavy===false&&!r.cover),
    'The 3.37-inch climb prevents Heavy for both Intercessors, keeping the BS comparison independent');
  const saved=await state();
  await upload(save);await upload(saved);await reload();
  assert.deepEqual((await state()).rules.declaration,plan,'Saved BS groups survive import and reload');
  packets=await packetButtonTexts();assert.equal(packets.length,2);
  for(const [index,skill] of [[upperIndex,2],[groundIndex,3]]){
    assert.match(await packetLabel(index),new RegExp('BS\\s*'+skill+'\\+'));
  }
  await capture(action('staged-'+upperIndex),'06-plunging-fire-packets.png');
  await shot('staged-'+upperIndex,[2,2]);
  assert.deepEqual((await state()).rules.declaration.attackRoll.records.at(-1),{kind:'hit',raw:[2,2]});
  await shot('packet-keep',[1,1]);
  assert.deepEqual((await state()).rules.declaration.attackRoll.records.at(-1),{kind:'wound',raw:[1,1]});
  await shot('packet-keep',[]);
  assert.equal((await state()).rules.declaration.rows[upperIndex].done,true);
  await shot('resolve-'+groundIndex,[2,2]);
  const result=await state();
  assert.equal(result.rules.declaration,null);
  assert.match(result.rules.last,/0\/2 명중/);
  assert.equal(result.pieces.find(p=>p.id===enemy).removed,false);

  // Make both declarations against one visible model. Only the defender
  // selected for allocation is removed; another live Grot remains on the ground.
  const replacement='gretchin-2',casualtyGame=battlefield(save,false);
  casualtyGame.rules=structuredClone(afterClimb);
  Object.assign(casualtyGame.pieces.find(p=>p.id===replacement),{x:8,z:2.3,elevation:0,yaw:0,removed:false});
  await upload(casualtyGame);await selectRifleAndSight(false);
  await click(action('volley'));await click(action('lock'));
  const initial=(await state()).rules.declaration;
  const killer=initial.rows.findIndex(r=>r.actor===ground),waiting=initial.rows.findIndex(r=>r.actor===upper);
  assert.deepEqual(initial.rows[waiting].plungingVisible,[enemy]);
  await choose('allocate-'+killer,enemy);
  await shot('resolve-'+killer,[6,6,1,1]);
  const afterLoss=await state(),remaining=afterLoss.rules.declaration.rows[waiting];
  assert.equal(afterLoss.pieces.find(p=>p.id===enemy).removed,true);
  assert.equal(afterLoss.pieces.find(p=>p.id===replacement).removed,false);
  assert.equal(afterLoss.rules.declaration.rows[killer].done,true);
  assert.deepEqual(remaining,initial.rows[waiting]);
  assert.match(await packetLabel(waiting),/BS\s*3\+/);
  await choose('plunge-target-'+waiting,replacement);
  await click(action('plunge-view-'+waiting));
  assert.equal(await js('document.querySelector("#surface-tools").hidden'),false);
  assert.deepEqual(await state(),afterLoss,'Opening the observer camera cannot renew visibility');
  assert.match(await packetLabel(waiting),/BS\s*3\+/);
  await capture(action('plunge-confirm-'+waiting),'06-plunging-fire-recheck.png');
  await click(action('plunge-confirm-'+waiting));
  const confirmed=(await state()).rules.declaration;
  assert.equal(confirmed.locked,true);
  assert.deepEqual(confirmed.rows[waiting],{...remaining,plungingVisible:[enemy,replacement]});
  assert.deepEqual(confirmed.rows[killer],afterLoss.rules.declaration.rows[killer]);
  assert.match(await packetLabel(waiting),/BS\s*2\+/);
  await reload();
  assert.deepEqual((await state()).rules.declaration,confirmed);
  assert.match(await packetLabel(waiting),/BS\s*2\+/);
  await shot('resolve-'+waiting,[2,1,2,1]);
  assert.equal((await state()).rules.declaration,null);
  assert.match((await state()).rules.last,/2\/2 명중/);
  await upload(save);await click('[data-tab=roster]');
  await js('(()=>{const e=document.querySelector("#search");e.value="";e.dispatchEvent(new Event("input",{bubbles:true}))})()');
}
