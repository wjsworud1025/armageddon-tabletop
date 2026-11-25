import assert from 'node:assert/strict';
import {newBattle,startBattle} from './battle.mjs';

export async function checkMovementRerolls({save,upload,choose,click,button,state,js,reload}){
  const has=key=>js('!!document.querySelector('+JSON.stringify(button(key))+')');
  const fixed=async(key,dice)=>{
    await js('window.originalRerollRandom=Math.random;{const dice='+JSON.stringify(dice)+';Math.random=()=>((dice.shift()??1)-.5)/6}');
    try{await click(button(key));}finally{await js('Math.random=window.originalRerollRandom');}
  };
  function fixture(step){
    const game=structuredClone(save);
    for(const p of game.pieces){
      p.removed=!['captain-1','warboss-1'].includes(p.id);
      if(!p.removed){p.x=p.id==='captain-1'?0:8;p.z=0;}
    }
    game.rules={...startBattle(newBattle(),'marines',5),step,cp:{marines:2,orks:2}};
    return game;
  }
  await upload(fixture(1));await click('[data-tab=battle]');await choose('fighter','captain-1');
  await fixed('advance',[5]);await reload();await fixed('command-reroll',[1]);
  let s=await state();assert.equal(s.rules.movePlan.advanceRoll,1);assert.equal(s.rules.cp.marines,1);
  assert.match(s.rules.last,/5 → 1/);assert.equal(await has('command-reroll'),false);
  await click('#undo');assert.equal((await state()).rules.movePlan.advanceRoll,5);
  await click('#redo');await reload();assert.equal(await has('command-reroll'),false);
  await click(button('move-finish'));assert.equal((await state()).rules.movePlan,null);
  await upload(fixture(3));await click('[data-tab=battle]');await choose('fighter','captain-1');
  await fixed('charge-normal',[1,1]);
  assert.equal(await js('document.querySelectorAll("[data-charge-target]").length'),0);
  await click(button('command-keep'));assert.equal((await state()).rules.cp.marines,2);assert.equal(await has('command-reroll'),false);
  await click('#undo');await fixed('command-reroll',[5,6]);
  s=await state();assert.deepEqual(s.rules.chargePlan.dice,[5,6]);assert.equal(s.rules.cp.marines,1);
  assert.equal(await js('document.querySelectorAll("[data-charge-target]").length'),1);
  await reload();assert.deepEqual((await state()).rules.chargePlan.dice,[5,6]);
  await click('[data-charge-target=warboss]');await click(button('charge-targets'));
  assert.equal(await has('command-reroll'),false);
  await click(button('charge-cancel'));assert.equal((await state()).rules.units.captain.charge,11);
}
