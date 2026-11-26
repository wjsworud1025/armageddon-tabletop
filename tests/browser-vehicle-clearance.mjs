import assert from 'node:assert/strict';
import {snapshot} from '../state.mjs';
import {speederPivotDraft} from './fixtures/vehicle-board.mjs';

export async function checkVehicleClearance({save,upload,click,state,js,reload}){
  const id='landSpeeder-1',finish='[data-act="move-finish"]';
  const speeder=game=>game.pieces.find(p=>p.id===id);
  try{
    const draft=snapshot(speederPivotDraft()),start=speeder(draft);
    await upload(draft);
    await click('[data-tab=roster]');
    for(const group of ['marines','landSpeeder']){
      const details='#army-list details[data-key="'+group+'"]';
      if(!await js('document.querySelector('+JSON.stringify(details)+').open'))await click(details+' > summary');
    }
    await click('#army-list button[title$=" · landSpeeder-1"]');
    await click('[data-tab=battle]');
    await click(finish);
    assert.match(await js('document.querySelector("#rules").innerText'),/차체 또는 장비가 .*폐허.*관통/);
    const rejected=await state();
    assert.deepEqual(rejected.rules.movePlan,draft.rules.movePlan);
    assert.deepEqual(speeder(rejected),start);

    await click('[data-tab=roster]');await click('#rotate');
    const rotated=await state(),p=speeder(rotated);
    assert.equal(rotated.rules.movePlan.unit,'landSpeeder');
    assert.equal(rotated.rules.movePlan.paths[id].length,draft.rules.movePlan.paths[id].length+1);
    assert.ok(Math.abs(p.yaw-Math.PI)<1e-9);
    assert.deepEqual([p.x,p.z,p.elevation],[start.x,start.z,start.elevation]);
    await click('[data-tab=battle]');await click(finish);
    const complete=await state();
    assert.equal(complete.rules.movePlan,null);
    assert.equal(complete.rules.units.landSpeeder.movement,'normal');
    assert.deepEqual(speeder(complete),p);
    await reload();
    const resumed=await state();
    assert.equal(resumed.rules.movePlan,null);
    assert.equal(resumed.rules.units.landSpeeder.movement,'normal');
    assert.deepEqual(speeder(resumed),p);
  }finally{
    await upload(save);await click('[data-tab=roster]');
  }
}
