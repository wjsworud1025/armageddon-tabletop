import assert from 'node:assert/strict';
import {snapshot} from '../state.mjs';
import {heavyRifleBoard,heavyShooter,heavyTarget} from './fixtures/heavy-rifle-board.mjs';
import {sightButton} from './browser-shooter-sight.mjs';

export async function checkHeavyRifles({save,upload,click,state,js,reload,screenshot}){
  const act=id=>'[data-act="'+id+'"]';
  const row='[data-sight-row="'+heavyShooter+'"]';
  const line=selector=>js('document.querySelector('+JSON.stringify(selector)+')?.textContent');
  async function change(field,value){
    assert.equal(await js(`(()=>{const e=document.querySelector('[data-field="${field}"]');
      e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));return e.value})()`),value);
  }
  async function dice(action,faces){
    await js(`(()=>{const previous=Math.random,faces=${JSON.stringify(faces)};
      try{Math.random=()=>{if(!faces.length)throw Error('Unexpected attack die');return (faces.shift()-.5)/6};
        document.querySelector(${JSON.stringify(act(action))}).click();
        if(faces.length)throw Error('Unused attack die: '+faces.length)
      }finally{Math.random=previous}})()`);
  }
  async function open(mode,status,reason){
    await upload(snapshot(heavyRifleBoard(mode)));await click('[data-tab=battle]');
    await change('fighter',heavyShooter);
    if(mode!=='legacy'){
      await click(act(mode==='remain'?'remain':'move-finish'));
      await click(act('next'));
    }
    assert.equal((await state()).rules.step,2);
    await change('weapon','0');await change('target',heavyTarget);
    const note=row+' [data-heavy-status="'+status+'"][data-heavy-reason="'+reason+'"]';
    assert.match(await line(note),/Heavy/);
    assert.match(await line(row+' [data-ballistic-skill="3"]'),/BS 3\+/);
    await click(sightButton(heavyShooter,heavyTarget));
    return note;
  }
  async function lock(manual,applied){
    if(manual){
      if(!await js('document.querySelector(\'[data-detail="mods"]\').open'))await click('[data-detail="mods"] summary');
      await change('hitMod',String(manual));
    }else assert.equal(await js('document.querySelector(\'[data-field="hitMod"]\').value'),'0');
    await click(act('attack'));await click(act('lock'));
    const plan=(await state()).rules.declaration;
    assert.ok(plan.locked);assert.equal(plan.rows[0].hit,manual);
    assert.equal(plan.rows[0].heavy,applied);
    assert.match(await line('[data-heavy-applied="'+(applied===undefined?'legacy':applied)+'"]'),/Heavy/);
  }
  try{
    const note=await open('short','active','eligible');
    assert.match(await line(note),/3″/);
    if(screenshot){
      await js('document.querySelector('+JSON.stringify(note)+').scrollIntoView({block:"center"})');
      await screenshot('06-heavy-rifle.png');
    }
    await change('weapon','1');assert.ok(!(await line(row+' [data-heavy-status]')));
    await change('weapon','0');
    await lock(0,true);
    const locked=(await state()).rules.declaration;
    await reload();assert.deepEqual((await state()).rules.declaration,locked);
    assert.match(await line('[data-heavy-applied="true"]'),/최종 명중 굴림 보정 \+1/);
    await dice('staged-0',[2,1]);
    assert.deepEqual((await state()).rules.declaration.attackRoll.records.at(-1),{kind:'hit',raw:[2,1]});
    await dice('packet-keep',[1]);
    assert.deepEqual((await state()).rules.declaration.attackRoll.records.at(-1),{kind:'wound',raw:[1]});
    await click(act('packet-keep'));
    assert.match((await state()).rules.last,/1\/2 명중/);

    await open('moving','inactive','distance');await lock(0,false);
    await dice('resolve-0',[2,1]);
    assert.match((await state()).rules.last,/0\/2 명중/);

    await open('remain','active','eligible');await lock(-1,true);
    assert.match(await line('[data-heavy-applied="true"]'),/최종 명중 굴림 보정 0/);
    await dice('resolve-0',[2,1]);assert.match((await state()).rules.last,/0\/2 명중/);

    const old=await open('legacy','unknown','unknown');
    assert.match(await line(old),/직접 입력/);
    await lock(1,undefined);await dice('resolve-0',[2,1,1]);
    assert.match((await state()).rules.last,/1\/2 명중/);
  }finally{
    await upload(save);await click('[data-tab=roster]');
  }
}
