import assert from 'node:assert/strict';
import {snapshot} from '../state.mjs';
import {wartrakkBannerDraft} from './fixtures/wartrakk-banner-board.mjs';

export async function checkWartrakkBanner({save,upload,click,state,js,reload},{expectOld=false}={}){
  const finish='[data-act="move-finish"]',vehicle=g=>g.pieces.find(p=>p.id==='wartrakk-1');
  try{
    const draft=snapshot(wartrakkBannerDraft()),start=vehicle(draft);
    await upload(draft);await click('[data-tab=roster]');
    for(const group of ['orks','wartrakk']){
      const selector='#army-list details[data-key="'+group+'"]';
      if(!await js('document.querySelector('+JSON.stringify(selector)+').open'))await click(selector+' > summary');
    }
    await click('#army-list button[title$=" · wartrakk-1"]');await click('[data-tab=battle]');await click(finish);
    if(expectOld){
      await reload();
      const previous=await state();
      assert.equal(previous.rules.movePlan,null);assert.equal(previous.rules.units.wartrakk.movement,'normal');
      assert.deepEqual(vehicle(previous),start);
      return;
    }
    assert.match(await js('document.querySelector("#rules").innerText'),/차체 또는 장비가 .*폐허 1.*관통/);
    const rejected=await state();
    assert.deepEqual(rejected.rules.movePlan,draft.rules.movePlan);assert.deepEqual(vehicle(rejected),start);
    await click('[data-tab=roster]');await click('#rotate');
    const turned=await state(),p=vehicle(turned);
    assert.deepEqual([p.x,p.z,p.elevation],[start.x,start.z,start.elevation]);
    assert.ok(Math.abs(Math.sin((p.yaw-start.yaw-Math.PI/12)/2))<1e-8);
    await click('[data-tab=battle]');await click(finish);await reload();
    const complete=await state();assert.equal(complete.rules.movePlan,null);
    assert.equal(complete.rules.units.wartrakk.movement,'normal');assert.deepEqual(vehicle(complete),p);
  }finally{
    await upload(save);await click('[data-tab=roster]');
  }
}
