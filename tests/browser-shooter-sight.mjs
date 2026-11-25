import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {baseDistance} from '../state.mjs';
import {newBattle,startBattle} from '../rules/battle.mjs';
import {getProfile} from '../rules/profiles.mjs';

export const sightButton=(shooter,target,status='visible')=>
  `[data-act="shot-sight"][data-shooter="${shooter}"][data-target="${target}"][data-status="${status}"]`;
export const inspectButton=(shooter,target)=>
  `[data-act="inspect-sight"][data-shooter="${shooter}"][data-target="${target}"]`;

export async function checkShooterSight({save,upload,state,js,click,reload,screenshot}){
  const a='intercessor-2',b='intercessor-3',near='gretchin-1',far='gretchin-2',boss='warboss-1';
  const positions={[a]:[-8,0],[b]:[-8,2],[near]:[3,0],[far]:[20,1],[boss]:[20,-7]};
  const game=structuredClone(save);
  game.training=undefined;game.layout=null;game.rules={...startBattle(newBattle(),'marines',5),step:2};
  for(const p of game.pieces){
    p.removed=!positions[p.id];
    if(!p.removed)Object.assign(p,{x:positions[p.id][0],z:positions[p.id][1],yaw:0,elevation:0});
  }
  const pieces=createTable().pieces.map(p=>({...p,...game.pieces.find(r=>r.id===p.id)}));
  const piece=id=>pieces.find(p=>p.id===id);
  const rifleRange=getProfile(piece(a)).weapons[0].range;
  const distance=baseDistance(piece(a),piece(near));
  assert.ok(distance<rifleRange/2&&baseDistance(piece(a),piece(far))>rifleRange);
  async function choose(field,value){
    const actual=await js(`(()=>{const e=document.querySelector('[data-field="${field}"]');e.value=${JSON.stringify(value)};const picked=e.value;e.dispatchEvent(new Event('change',{bubbles:true}));return picked})()`);
    assert.equal(actual,value,'Available '+field+' choice');
  }
  async function disabled(action,expected){
    const selector=JSON.stringify('[data-act="'+action+'"]');
    assert.equal(await js('document.querySelector('+selector+')?.disabled'),expected,action+' availability');
    if(expected){
      const before=await state();
      await js('document.querySelector('+selector+').click()');
      assert.deepEqual(await state(),before,action+' must reject clicks while disabled');
    }
  }
  const rows=async()=>(await state()).rules.declaration.rows;
  const pair=(s,shooter,target)=>s.rules.shootingSight?.pairs?.[shooter]?.[target]??'unknown';
  await upload(game);await click('[data-tab=battle]');
  await choose('fighter',a);await choose('weapon','0');await choose('target',near);
  await disabled('attack',true);await disabled('volley',true);
  await click(sightButton(a,near,'blocked'));await click(sightButton(b,near));
  const mixed=await state();
  assert.equal(pair(mixed,a,near),'blocked');assert.equal(pair(mixed,b,near),'visible');
  await disabled('attack',true);await disabled('volley',false);
  if(screenshot){
    await js('document.querySelector("[data-sight-row]").closest("section").scrollIntoView({block:"center"})');
    await screenshot('06-shooter-visibility.png');
  }
  await click('[data-act=volley]');assert.deepEqual((await rows()).map(r=>r.actor),[b]);
  await click('#undo');assert.deepEqual(await state(),mixed);
  await click(sightButton(b,near,'unknown'));
  assert.equal(pair(await state(),b,near),'unknown');await disabled('volley',true);
  await upload(mixed);await reload();
  assert.deepEqual((await state()).rules.shootingSight,mixed.rules.shootingSight);
  await choose('fighter',a);await choose('weapon','0');await choose('target',far);
  await click(sightButton(a,far));
  await choose('target',boss);await click(sightButton(a,boss));await disabled('attack',true);
  await choose('target',near);
  assert.equal(pair(await state(),a,near),'blocked');
  await disabled('attack',false);
  await click('[data-act=attack]');assert.deepEqual((await rows()).map(r=>r.actor),[a]);
  await choose('target',far);await click(sightButton(a,far,'unknown'));
  await disabled('lock',true);
  await click(sightButton(a,far));await disabled('lock',false);await click('[data-act=lock]');
  const plan=(await state()).rules.declaration;
  assert.equal(plan.locked,true);assert.equal(plan.rows[0].target,'gretchin');
  assert.ok(Math.abs(plan.rows[0].distance-distance)<1e-6,'Use the nearest base in the enemy unit for range');
  await reload();assert.deepEqual((await state()).rules.declaration,plan);
  await upload(save);await click('[data-tab=roster]');
}
