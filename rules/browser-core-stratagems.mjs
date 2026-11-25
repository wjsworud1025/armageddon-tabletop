import assert from 'node:assert/strict';
import {newBattle,startBattle} from './battle.mjs';
import {checkMovementRerolls} from './browser-command-reroll.mjs';

export async function checkCoreStratagems({save,upload,choose,click,button,state,js,reload}){
  const has=key=>js('!!document.querySelector('+JSON.stringify(button(key))+')');
  const command=structuredClone(save);
  command.rules=startBattle(newBattle(),'orks',5);
  command.rules.hp['warboss-1']=3;
  await upload(command);await click('[data-tab=battle]');await choose('fighter','warboss-1');
  await click(button('insane-bravery'));
  assert.equal((await state()).rules.units.warboss.shockChecked,true);
  assert.equal((await state()).rules.cp.orks,0);
  await click('#undo');await choose('fighter','warboss-1');assert.equal(await has('insane-bravery'),true);
  await click('#redo');await reload();await choose('fighter','warboss-1');
  assert.equal(await has('insane-bravery'),false);
  assert.equal(await js('document.querySelector("[data-act=shock]").disabled'),true);

  const fight=structuredClone(save);
  const locations={'librarian-1':[0,0],'intercessor-1':[0,1.6],'warboss-1':[2.2,0],'boy-1':[2.2,1.6]};
  for(const p of fight.pieces){p.removed=!locations[p.id];if(!p.removed)[p.x,p.z]=locations[p.id];}
  fight.rules={...startBattle(newBattle(),'marines',5),step:4,
    attachments:{'librarian-1':'intercessor','warboss-1':'boy-0'},units:{intercessor:{charged:true}}};
  await upload(fight);await click('[data-tab=battle]');await choose('fighter','intercessor-1');
  assert.equal(await has('epic-librarian-1'),false);
  await click(button('fight-pass'));await click(button('fight-pass'));
  await choose('fight-unit','intercessor');await click(button('fight-normal'));
  await click(button('epic-librarian-1'));
  assert.equal((await state()).rules.units.intercessor.epicChallengeModel,'librarian-1');
  assert.equal(await has('tactic-precision'),false);
  await reload();await choose('fighter','librarian-1');await choose('target','warboss-1');await click(button('attack'));
  await choose('fighter','intercessor-1');await choose('target','warboss-1');await click(button('attack'));await click(button('lock'));
  await js('window.coreRandom=Math.random;{const dice=[6,6,6,6,6,6,1];Math.random=()=>((dice.shift()??1)-.5)/6}');
  await click(button('resolve-0'));await js('Math.random=window.coreRandom');
  const rolled=await state();
  assert.equal(rolled.rules.declaration.precisionRoll.wounds,3);
  const corrupted=structuredClone(rolled);
  corrupted.rules.declaration.precisionRoll.wounds='<script>';
  await upload(corrupted);assert.deepEqual(await state(),rolled);
  await reload();
  assert.deepEqual((await state()).rules.declaration.precisionRoll,rolled.rules.declaration.precisionRoll);
  assert.equal(await has('resolve-1'),false);
  async function saveRolls(target){
    await choose('precision-target',target);
    await js('window.coreRandom=Math.random;Math.random=()=>0');
    try{await click(button('resolve-0'));}finally{await js('Math.random=window.coreRandom');}
  }
  await saveRolls('');
  let result=await state();
  assert.equal(result.pieces.find(p=>p.id==='boy-1').removed,true);
  assert.equal(result.rules.hp['warboss-1'],2);
  await click('#undo');assert.deepEqual((await state()).rules.declaration.precisionRoll,rolled.rules.declaration.precisionRoll);
  await saveRolls('warboss-1');
  result=await state();
  assert.equal(result.pieces.find(p=>p.id==='warboss-1').removed,true);
  assert.equal(result.rules.hp['boy-1'],2);
  assert.equal(result.rules.declaration.precisionRoll,undefined);
  await click(button('resolve-1'));assert.equal((await state()).rules.declaration,null);

  const counter=structuredClone(save);
  const pairs={'warboss-1':[0,0],'captain-1':[2.1,0],'weirdboy-1':[0,8],'librarian-1':[2.1,8]};
  for(const p of counter.pieces){p.removed=!pairs[p.id];if(!p.removed)[p.x,p.z]=pairs[p.id];}
  counter.rules={...startBattle(newBattle(),'orks',5),step:4,cp:{marines:3,orks:3},
    units:{warboss:{charged:true},weirdboy:{charged:true},captain:{fightsFirst:true}}};
  await upload(counter);await click('[data-tab=battle]');
  await click(button('fight-pass'));await click(button('fight-pass'));
  await choose('fight-unit','warboss');await click(button('fight-normal'));
  await choose('fighter','warboss-1');await choose('target','captain-1');await click(button('attack'));await click(button('lock'));
  assert.equal(await has('fight-counter-librarian'),false);
  await js('window.coreRandom=Math.random;Math.random=()=>0');
  try{await click(button('resolve-0'));}finally{await js('Math.random=window.coreRandom');}
  assert.equal((await state()).rules.fightSequence.counterAfter,'warboss');
  assert.equal(await has('fight-counter-captain'),true);
  assert.equal(await has('fight-finish'),false);
  await reload();await click(button('fight-counter-decline'));
  assert.equal((await state()).rules.cp.marines,3);
  assert.equal(await has('fight-counter-librarian'),false);
  await click('#undo');await click(button('fight-counter-librarian'));
  assert.equal((await state()).rules.cp.marines,1);
  assert.equal((await state()).rules.units.librarian.fightsFirst,true);
  await click('#undo');assert.equal((await state()).rules.cp.marines,3);
  await click('#redo');await reload();await click(button('fight-finish'));
  assert.deepEqual(await js('Array.from(document.querySelector("[data-field=fight-unit]").options,o=>o.value)'),['librarian']);
  await click(button('fight-normal'));
  assert.equal((await state()).rules.fightSequence.active.unit,'librarian');
  await checkMovementRerolls({save,upload,choose,click,button,state,js,reload});
  await upload(save);await click('[data-tab=battle]');
}
