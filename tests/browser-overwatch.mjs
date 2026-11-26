import assert from 'node:assert/strict';
import {newBattle,startBattle} from '../rules/battle.mjs';
import {sightButton} from './browser-shooter-sight.mjs';

const rifle='intercessor-3',boy='boy-3',other='weirdboy-1';
const act=name=>'[data-act="'+name+'"]';

function movementEnd(save,active){
  const game=structuredClone(save);
  delete game.training;game.layout=null;
  game.rules={...startBattle(newBattle(),active,5),step:1,cp:{marines:2,orks:2}};
  const poses={[rifle]:[0,0],[boy]:[12,0],[other]:[16,2]};
  for(const p of game.pieces){
    p.removed=!poses[p.id];
    if(!p.removed)Object.assign(p,{x:poses[p.id][0],z:poses[p.id][1],elevation:0,yaw:0});
  }
  return game;
}

export async function checkOverwatch({save,upload,click,state,js,reload,screenshot}){
  async function choose(name,value){
    const selector=JSON.stringify('[data-field="'+name+'"]');
    const result=await js(`(()=>{const e=document.querySelector(${selector}); e.value=${JSON.stringify(value)};
      const picked=e.value;e.dispatchEvent(new Event('change',{bubbles:true}));return picked})()`);
    assert.equal(result,value,'Available '+name+' option');
  }
  const available=selector=>js('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');return !!el&&!el.disabled&&!el.closest("[hidden]")})()');
  async function fixed(action,rolls){
    const faces=JSON.stringify(rolls);
    await js(`(()=>{const original=Math.random,faces=${faces};Math.random=()=>((faces.shift()??1)-.5)/6;
      try{document.querySelector(${JSON.stringify(act(action))}).click()}finally{Math.random=original}})()`);
  }
  async function offer(active){
    await upload(movementEnd(save,active));await click('[data-tab=battle]');await click(act('next'));
    const s=(await state()).rules;
    assert.equal(s.step,1);assert.equal(s.active,active);assert.equal(s.overwatch.stage,'offer');
    assert.equal(s.overwatch.team,active==='orks'?'marines':'orks');
  }
  // Both players see the decision; passing enters the shooting phase without payment.
  await offer('marines');await click(act('overwatch-decline'));
  let s=(await state()).rules;assert.equal(s.step,2);assert.equal(s.active,'marines');
  assert.deepEqual(s.cp,{marines:2,orks:2});assert.ok(!s.overwatch);

  await offer('orks');await choose('overwatch-unit','intercessor');await choose('fighter',rifle);
  await choose('weapon','0');await choose('target',boy);
  await click(sightButton(rifle,boy));
  if(screenshot)await screenshot('06-overwatch-offer.png');
  await click(act('overwatch-begin'));
  let paid=await state();assert.equal(paid.rules.cp.marines,1);assert.equal(paid.rules.cp.orks,2);
  assert.equal(paid.rules.overwatch.unit,'intercessor');assert.equal(paid.rules.active,'orks');
  await reload();assert.deepEqual(await state(),paid);
  await choose('fighter',rifle);await choose('weapon','0');await choose('target',boy);
  await click(act('attack'));await click(act('lock'));
  await fixed('staged-0',[5,6,6,1]);
  const rolled=await state(),records=rolled.rules.declaration.attackRoll.records;
  assert.deepEqual(records,[{kind:'hit',raw:[5,6],closed:true},{kind:'wound',raw:[6],closed:true},{kind:'save',raw:[1]}],
    'The 5 misses, the 6 hits normally, and only one wound and save are rolled');
  assert.match(await js('document.querySelector("[data-overwatch-hit]").textContent'),/1\s*명중|명중\s*1/);
  assert.equal(await available(act('packet-reroll')),true,'The targeted Ork unit can reroll its save');
  if(screenshot)await screenshot('06-overwatch-hit.png');
  await reload();assert.deepEqual(await state(),rolled);
  await click(act('packet-keep'));
  const ended=await state();
  assert.equal(ended.rules.hp[boy],0);assert.equal(ended.pieces.find(p=>p.id===boy).removed,true);
  assert.deepEqual(ended.rules.cp,{marines:1,orks:2});assert.equal(ended.rules.overwatch.stage,'done');
  assert.ok(!ended.rules.units.intercessor?.finishedAttack);
  await click('#undo');assert.ok((await state()).rules.declaration.attackRoll);
  await click('#redo');await reload();assert.deepEqual(await state(),ended);
  await click(act('next'));s=(await state()).rules;
  assert.equal(s.step,2);assert.equal(s.active,'orks');assert.ok(!s.overwatch);
  await choose('fighter',boy);assert.equal(await available(act('attack')),false,'The casualty cannot shoot');
  await choose('fighter',other);await choose('target',rifle);
  await click(sightButton(other,rifle));
  assert.equal(await available(act('attack')),true,'The surviving Ork can use its normal Shooting phase');

  // Reverse the turn and resolve the Boy's shots with the ordinary fast-roll controls.
  await offer('marines');await choose('overwatch-unit','boy-0');await choose('fighter',boy);
  await choose('weapon','0');await choose('target',rifle);await click(sightButton(boy,rifle));
  await click(act('overwatch-begin'));await click(act('attack'));await click(act('lock'));
  await fixed('resolve-0',[5,6,6,1]);
  s=(await state()).rules;
  assert.equal(s.overwatch.stage,'done');assert.equal(s.hp[rifle],1);
  assert.deepEqual(s.cp,{marines:2,orks:1});await click(act('next'));
  s=(await state()).rules;assert.equal(s.step,2);assert.equal(s.active,'marines');
  await upload(save);await click('[data-tab=roster]');assert.deepEqual(await state(),save);
}
