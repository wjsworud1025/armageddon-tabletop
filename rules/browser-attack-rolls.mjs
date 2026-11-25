import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {newBattle,startBattle} from './battle.mjs';

export async function checkAttackRerolls({save,upload,choose,click,button,state,js,reload}){
  const has=action=>js('!!document.querySelector('+JSON.stringify(button(action))+')');
  async function act(action,...samples){
    await js('window.originalAttackRandom=Math.random;{const samples='+JSON.stringify(samples)+
      ';Math.random=()=>{if(!samples.length)throw Error("Unexpected attack die");return samples.shift()}}');
    try{await click(button(action));}finally{await js('Math.random=window.originalAttackRandom');}
  }
  async function start(actor,weapon,target){
    const game=structuredClone(save),shooter=createTable().pieces.find(p=>p.id===actor);
    game.rules={...startBattle(newBattle(),shooter.faction,5),step:2};
    for(const p of game.pieces){
      p.removed=![actor,target].includes(p.id);
      if(!p.removed){p.x=p.id===actor?0:8;p.z=0;p.elevation=0;}
    }
    await upload(game);await click('[data-tab=battle]');await choose('fighter',actor);
    await choose('weapon',String(weapon));await choose('target',target);
    await click(button('attack'));await click(button('lock'));
  }
  async function stage(kind,raw){
    const s=await state(),record=s.rules.declaration.attackRoll.records.at(-1);
    assert.deepEqual(record,{kind,raw});
    assert.equal(await has('next'),false);assert.equal(await has('resolve-0'),false);
    assert.equal(await js('document.querySelector("#remove").disabled'),true);
    return s;
  }
  await start('landSpeeder-1',0,'warboss-1');
  await act('staged-0',.99,.99);await stage('hit',[6,6]);
  await act('packet-keep',.99,.99);await stage('wound',[6,6]);
  await act('packet-keep',.99,0);const before=await stage('save',[6,1]);
  await choose('attack-die','0');
  await act('packet-reroll',0,0);const damage=await stage('damage',[1]);
  assert.deepEqual(damage.rules.cp,{marines:1,orks:0});
  assert.deepEqual(damage.rules.hp,{});assert.ok(damage.rules.last.includes('6 → 1'));
  assert.ok(await js('document.querySelector(".battle-rules").textContent.includes("warboss-1")'));
  const corrupt=structuredClone(damage);
  corrupt.rules.declaration.attackRoll.records.at(-1).raw.push(5);
  await upload(corrupt);assert.deepEqual(await state(),damage);
  await click('#undo');assert.deepEqual((await state()).rules.declaration,before.rules.declaration);
  await click('#redo');await reload();assert.deepEqual((await state()).rules.declaration,damage.rules.declaration);
  await act('packet-reroll',.99);
  let end=await state();assert.deepEqual(end.rules.cp,{marines:0,orks:0});
  assert.equal(end.rules.hp['warboss-1'],0);assert.equal(end.pieces.find(p=>p.id==='warboss-1').removed,true);
  assert.equal(end.rules.declaration,null);assert.ok(end.rules.last.includes('1 → 6'));

  await start('wartrakk-1',0,'captain-1');
  await act('staged-0',0);await stage('attacks',[1]);
  await act('packet-keep',0,0,0,0);await stage('hit',[1,1,1,1]);await choose('attack-die','2');
  await act('packet-reroll',.99,.99,0);const defending=await stage('save',[1]);
  assert.deepEqual(defending.rules.cp,{marines:1,orks:0});
  assert.deepEqual(defending.rules.declaration.attackRoll.records[1].change,{index:2,value:6});
  await act('packet-keep');end=await state();assert.equal(end.rules.hp['captain-1'],3);
  assert.equal(end.rules.units.wartrakk.suppressedEnemy,true);

  await start('landSpeeder-1',2,'warboss-1');
  await act('staged-0',0);await stage('attacks',[1]);await act('packet-keep',0);await stage('wound',[1]);
  await act('packet-reroll',.99,0);await stage('save',[1]);await act('packet-keep');
  end=await state();assert.equal(end.rules.hp['warboss-1'],5);assert.equal(end.rules.cp.marines,0);
  await start('wartrakk-1',0,'captain-1');await act('staged-0',0);
  await act('packet-reroll',.99,...Array(6).fill(0));end=await state();
  assert.equal(end.rules.declaration,null);assert.equal(end.rules.cp.orks,0);assert.ok(end.rules.last.includes('0/6'));
}
