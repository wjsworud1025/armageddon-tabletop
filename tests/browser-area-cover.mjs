import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {layoutGeometry,overlapsArea} from '../layouts.mjs';
import {restore,snapshot} from '../state.mjs';
import {newBattle,startBattle} from '../rules/battle.mjs';
import {patrolTerrainPlacement} from '../rules/patrol-terrain-placement.mjs';
import {sightButton} from './browser-shooter-sight.mjs';

const rifle='intercessor-3',secondRifle='intercessor-2',grot='gretchin-1',mate='gretchin-2',boss='warboss-1';
const models=createTable().pieces;
const byId=(rows,id)=>rows.find(p=>p.id===id);

function localPose(piece,x,z,elevation=0){
  const c=Math.cos(piece.yaw),s=Math.sin(piece.yaw);
  return {x:piece.x+c*x+s*z,z:piece.z-s*x+c*z,yaw:piece.yaw,elevation};
}

export function areaCoverBattlefield(save,map,mode){
  const game=structuredClone(save),geometry=layoutGeometry(map);
  const pylon=byId(geometry.terrain,'pylon-1'),ruin=byId(geometry.terrain,'largeRuin-1');
  const speeder=mode==='landSpeeder',vehicle=speeder||mode==='wartrakk';
  const actor=speeder?'boy-2':rifle,target=vehicle?mode+'-1':grot;
  const poses=new Map(geometry.terrain.map(t=>[t.id,{...t,elevation:0}]));
  poses.set(actor,localPose(pylon,3,8));
  if(mode==='two-rifles')poses.set(secondRifle,localPose(pylon,4.5,8));
  if(vehicle)poses.set(target,localPose(pylon,3.7,0));
  else if(mode==='upper')poses.set(target,localPose(ruin,-.9,-.55,3.37));
  else{
    // Both 25 mm Grot bases fit across the open end of the pylon mat.
    // The second Grot can step off it while still in unit coherency.
    poses.set(grot,localPose(pylon,2.6,.6));
    poses.set(mate,localPose(pylon,mode==='inside'?2.6:4.45,-.6));
    poses.set(boss,localPose(pylon,5,-3));
  }
  delete game.training;
  game.layout={map,blue:'marines'};
  game.rules={...startBattle(newBattle(),speeder?'orks':'marines',5),step:2};
  for(const p of game.pieces){
    p.removed=!poses.has(p.id);
    if(!p.removed)Object.assign(p,poses.get(p.id));
  }
  const live=game.pieces.filter(p=>!p.removed).map(p=>({...byId(models,p.id),...p}));
  const scenery=live.filter(p=>p.faction==='terrain');
  for(const p of live.filter(p=>p.faction!=='terrain')){
    assert.equal(patrolTerrainPlacement(p,scenery).error,'',map+' '+mode+' '+p.id+' must physically fit');
  }
  const inArea=id=>geometry.terrainAreas.some(a=>overlapsArea(byId(live,id),a.polygon));
  assert.ok(inArea(target),'Selected target base overlaps the printed mat');
  if(poses.has(mate))assert.equal(inArea(mate),mode==='inside');
  if(poses.has(boss))assert.equal(inArea(boss),false);
  return {game,actor,target};
}

export async function checkAreaCover({save,upload,state,js,click,reload,screenshot}){
  const field=key=>'[data-field="'+key+'"]',act=key=>'[data-act="'+key+'"]';
  const control=selector=>js('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');return [e.checked,e.disabled]})()');
  const skill=id=>js('Number(document.querySelector('+JSON.stringify('[data-sight-row="'+id+'"] [data-ballistic-skill]')+').dataset.ballisticSkill)');
  async function pick(key,value){
    const actual=await js('(()=>{const e=document.querySelector('+JSON.stringify(field(key))+');e.value='+JSON.stringify(value)+';e.dispatchEvent(new Event("change",{bubbles:true}));return e.value})()');
    assert.equal(actual,value,'Available '+key);
  }
  async function open(map,mode){
    const {game,actor,target}=areaCoverBattlefield(save,map,mode);
    await upload(game);await click('[data-tab=battle]');
    assert.equal((await state()).layout.map,map);
    await pick('fighter',actor);await pick('weapon','0');await pick('target',target);
    await click(sightButton(actor,target));
    return {actor,target};
  }
  async function expectCover(automatic,manual=false){
    const status=await js('(()=>{const e=document.querySelector("#area-cover-status");return [e.checkVisibility(),e.dataset.automatic,e.textContent.trim().length>0]})()');
    assert.deepEqual(status,[true,String(automatic),true]);
    assert.deepEqual(await control(field('cover')),[automatic||manual,automatic]);
  }
  async function capture(name){
    await js('document.querySelector("#area-cover-status").scrollIntoView({block:"center"})');
    await screenshot(name);
  }
  async function lock(action){
    await click(act(action));await click(act('lock'));
    const plan=(await state()).rules.declaration;
    assert.equal(plan.locked,true);
    return plan;
  }
  async function rollThrees(covered){
    const dice=covered?[3,3]:[3,1,3,1];
    // Immediate resolution rolls each attack in full before the next shot.
    const unused=await js(`(()=>{const before=Math.random,dice=${JSON.stringify(dice)};
      try{Math.random=()=>{if(!dice.length)throw Error('Unexpected attack die');return (dice.shift()-.5)/6};
        document.querySelector('[data-act="resolve-0"]').click();return dice.length;
      }finally{Math.random=before}
    })()`);
    assert.equal(unused,0);
    const after=await state();
    assert.equal(after.rules.declaration,null);
    assert.match(after.rules.last,covered?/0\/2 명중/:/2\/2 명중/);
    assert.match(after.rules.last,/명중 \[3 · 3\]/);
  }
  const flags=row=>[row.cover,row.manualCover,row.areaCover];
  for(const map of ['A','B','C']){
    await open(map,'inside');await expectCover(true);
    assert.equal(await skill(rifle),4);
    if(map==='A'){
      await js('document.querySelector(\'[data-field="cover"]\').click()');await expectCover(true);
      await capture('06-area-cover-automatic.png');
      const plan=await lock('attack'),saved=await state();
      assert.deepEqual(flags(plan.rows[0]),[true,false,true]);
      await upload(save);await upload(saved);await reload();
      assert.deepEqual((await state()).rules.declaration,plan);
      assert.match(await js('document.querySelector(\'[data-act="staged-0"]\').textContent'),/BS\s*4\+/);
      await rollThrees(true);
    }
  }

  await open('B','mixed');await expectCover(false);
  assert.equal(await skill(rifle),3);
  const clear=await lock('attack');assert.deepEqual(flags(clear.rows[0]),[false,false,false]);
  await rollThrees(false);

  await open('B','mixed');await click(field('cover'));await click(act('attack'));
  const draft=await state();
  assert.equal(draft.rules.declaration.locked,false);
  assert.deepEqual(flags(draft.rules.declaration.rows[0]),[true,true,false]);
  const movedGame=restore(createTable(),structuredClone(draft));
  const shooter=byId(movedGame.pieces,rifle),outside=byId(movedGame.pieces,mate);
  const wall=byId(movedGame.pieces,'barricade-1');
  Object.assign(wall,{x:(shooter.x+outside.x)/2,z:(shooter.z+outside.z)/2,yaw:0});
  // Export through the normal serializer so the old sight observations are
  // invalidated exactly as they are after moving scenery in the game.
  const moved=snapshot(movedGame);
  assert.equal(moved.rules.shootingSight,undefined);
  assert.deepEqual(moved.rules.declaration,draft.rules.declaration);
  const lockDisabled=()=>js('document.querySelector(\'[data-act="lock"]\').disabled');
  for(const manual of [false,true]){
    await upload(moved);await click('[data-tab=battle]');
    await pick('fighter',rifle);await pick('weapon','0');await pick('target',grot);
    assert.deepEqual(byId((await state()).pieces,wall.id),byId(moved.pieces,wall.id));
    for(const answer of ['yes','no']){
      const selector=JSON.stringify(act('cover-'+answer+'-0'));
      assert.equal(await js('(()=>{const b=document.querySelector('+selector+');return b?.checkVisibility()&&!b.disabled})()'),true);
    }
    assert.equal(await lockDisabled(),true);
    await click(sightButton(rifle,grot));
    assert.equal(await lockDisabled(),true,'Renewing sight alone cannot renew the old manual cover decision');
    await click(act('lock'));
    assert.equal((await state()).rules.declaration.locked,false);
    await click(act(manual?'cover-yes-0':'cover-no-0'));
    assert.equal(await lockDisabled(),false);
    await click(act('lock'));
    const reviewed=(await state()).rules.declaration;
    assert.equal(reviewed.locked,true);assert.equal(reviewed.rows.length,1);
    const row=reviewed.rows[0],original=draft.rules.declaration.rows[0];
    assert.deepEqual([row.actor,row.weapon,row.target,row.preferred],[original.actor,original.weapon,original.target,original.preferred]);
    assert.deepEqual(flags(row),[manual,manual,false]);
    const label=await js('document.querySelector(\'[data-act="staged-0"]\').textContent');
    assert.match(label,manual?/BS\s*4\+/:/BS\s*3\+/);
    await rollThrees(manual);
  }

  await open('A','two-rifles');await expectCover(false);
  await click(field('cover'));await expectCover(false,true);
  assert.equal(await skill(rifle),4);
  await pick('target',boss);await expectCover(false);
  assert.equal(await skill(rifle),3,'Manual cover must not carry over to another target unit');
  await pick('target',grot);
  if((await control(field('cover')))[0])await click(field('cover'));
  await click(sightButton(secondRifle,grot));
  await click('[data-cover-shooter="'+secondRifle+'"]');
  await expectCover(false);
  assert.equal(await skill(rifle),3);assert.equal(await skill(secondRifle),4);
  await capture('06-area-cover-shooters.png');
  const mixed=await lock('volley');
  assert.equal(mixed.rows.length,2);
  assert.deepEqual(flags(mixed.rows.find(r=>r.actor===rifle)),[false,false,false]);
  assert.deepEqual(flags(mixed.rows.find(r=>r.actor===secondRifle)),[true,true,false]);
  const packets=await js('Array.from(document.querySelectorAll(\'[data-act^="staged-"]\'),b=>b.textContent)');
  assert.equal(packets.length,2);assert.ok(packets.some(s=>/BS\s*3\+/.test(s))&&packets.some(s=>/BS\s*4\+/.test(s)));

  await open('A','upper');await expectCover(true);
  assert.equal((await js('tabletopView.pose("gretchin-1")')).elevation,3.37);
  for(const mode of ['wartrakk','landSpeeder']){
    await open('A',mode);await expectCover(false);
    await click(field('cover'));await expectCover(false,true);
    await click(field('cover'));
  }
  await upload(save);await click('[data-tab=roster]');
}
