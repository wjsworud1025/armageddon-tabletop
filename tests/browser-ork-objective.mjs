import assert from 'node:assert/strict';
import {snapshot} from '../state.mjs';
import {orkObjectiveBoard} from './fixtures/ork-objective-board.mjs';

export async function checkOrkObjective({save,upload,state,js,click,reload,screenshot}){
  for(const attached of [false,true]){
    const board=orkObjectiveBoard();
    if(!attached)delete board.rules.attachments['warboss-1'];
    await upload(snapshot(board));await click('[data-tab=battle]');
    const initial=await state();
    assert.equal(initial.rules.active,'orks');assert.equal(initial.rules.step,0);
    await click('[data-act=next]');
    const scored=await state(),home=scored.rules.objectives['blue-home'];
    assert.deepEqual([home.marineOC,home.orkOC,home.owner],[2,attached?3:2,attached?'orks':null]);
    assert.equal(scored.rules.vp.orks,attached?10:0);
    const scores=await js('document.querySelector(".br-score").closest("section").textContent');
    assert.match(scores,attached?/\(2\/3\)/:/\(2\/2\)/);
    if(attached&&screenshot){
      await js('document.querySelector(".br-score").scrollIntoView({block:"center"})');
      await screenshot('06-ork-objective.png');
    }
    await click('#undo');assert.deepEqual(await state(),initial);
    await click('#redo');await reload();assert.deepEqual(await state(),scored);
  }
  await upload(save);await click('[data-tab=roster]');
}
