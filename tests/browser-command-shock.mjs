import assert from 'node:assert/strict';
import {layoutGeometry} from '../layouts.mjs';
import {newBattle,startBattle} from '../rules/battle.mjs';

const speeder='landSpeeder-1',boss='warboss-1';

export async function checkCommandShock({save,upload,click,js,state,reload,screenshot}){
  const game=structuredClone(save);
  delete game.training;
  game.layout={map:'A',blue:'marines'};
  game.rules={...startBattle(newBattle(),'marines',5),round:4,hp:{[speeder]:4}};
  const poses=new Map(layoutGeometry('A').terrain.map(p=>[p.id,p]));
  poses.set(speeder,{x:-18,z:-8,yaw:0});poses.set(boss,{x:3,z:13,yaw:0});
  for(const piece of game.pieces){
    piece.removed=!poses.has(piece.id);
    if(!piece.removed)Object.assign(piece,poses.get(piece.id),{elevation:0});
  }
  const act=name=>'[data-act="'+name+'"]';
  const isDisabled=name=>js('document.querySelector('+JSON.stringify(act(name))+')?.disabled');
  for(const [face,points] of [[1,0],[3,5]]){
    await upload(game);await click('[data-tab=battle]');
    await click(act('select-shock-'+speeder));
    assert.equal(await isDisabled('next'),true);
    await js('document.querySelector(\'[data-act="next"]\').click()');
    const before=await state();assert.equal(before.rules.step,0);assert.equal(before.rules.vp.marines,0);
    if(screenshot&&face===1){
      await js('document.querySelector("[data-command-shock-list]").scrollIntoView({block:"center"})');
      await screenshot('06-command-shock.png');
    }
    await js(`(()=>{const rand=Math.random;try{Math.random=()=>(${face}-.5)/6;
      document.querySelector('[data-act="shock"]').click()}finally{Math.random=rand}})()`);
    const checked=await state();
    assert.equal(checked.rules.units.landSpeeder.shocked,face===1);
    assert.equal(checked.rules.units.landSpeeder.shockChecked,true);
    await click('#undo');assert.deepEqual(await state(),before);
    assert.equal(await isDisabled('next'),true);
    await click('#redo');await reload();assert.deepEqual(await state(),checked);
    assert.equal(await isDisabled('next'),false);
    await click(act('next'));
    const scored=await state();
    assert.equal(scored.rules.step,1);assert.equal(scored.rules.vp.marines,points);
    assert.equal(scored.rules.objectives['blue-home'].marineOC,face===1?0:3);
    await reload();assert.deepEqual(await state(),scored);
  }
  await upload(save);await click('[data-tab=roster]');
}
