import assert from 'node:assert/strict';
import {snapshot} from '../state.mjs';
import {getProfile} from '../rules/profiles.mjs';
import {warbossFightBoard} from './fixtures/warboss-fight-board.mjs';

export async function checkWarbossChoice({save,upload,click,js,state,reload,screenshot}){
  const board=warbossFightBoard(),boss='warboss-1',boy='boy-2';
  const boyAttacks=getProfile(board.pieces.find(p=>p.id===boy)).weapons.find(w=>!w.range).attacks;
  const originalTab=await js('document.querySelector("[data-tab][aria-selected=true]")?.dataset.tab');
  const button=name=>'[data-act="'+name+'"]';
  const act=name=>click(button(name));
  async function choose(field,value){
    const selector=JSON.stringify('[data-field="'+field+'"]');
    const changed=await js(`(()=>{const el=document.querySelector(${selector});if(!el||el.disabled)return false;
      el.value=${JSON.stringify(String(value))};if(el.value!==${JSON.stringify(String(value))})return false;
      el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
    assert.ok(changed,field+' offers '+value);
  }
  async function allocate(actor,target,number){
    await choose('fighter',actor);await choose('target',target);await choose('allocation',number);await act('attack');
  }
  function checkRows(rules,style){
    assert.equal(rules.fightSequence.active.bossStyle,style);
    assert.deepEqual(rules.declaration.rows.map(r=>[r.actor,r.target,r.assigned,r.lethal,r.sustained]),
      [[boss,'captain',3],[boss,'librarian',3],[boy,'librarian',boyAttacks]].map(row=>
        [...row,style==='lethal',style==='sustained']));
  }
  async function resolveDice(index,dice){
    const selector=JSON.stringify(button('resolve-'+index));
    const remaining=await js(`(()=>{const el=document.querySelector(${selector}),dice=${JSON.stringify(dice)},previous=Math.random;
      try{Math.random=()=>{if(!dice.length)throw Error('Unexpected D6');return (dice.shift()-.5)/6};el.click();return dice.length}
      finally{Math.random=previous}})()`);
    assert.equal(remaining,0);
  }
  try{
    await upload(snapshot(board));await click('[data-tab=battle]');
    await act('fight-pass');await act('fight-pass');await choose('fight-unit','boy-0');
    const beforeChoice=await state();
    await click('[data-fight-tactic="crush"]');
    await act('fight-normal-sustained');
    const paid=await state();
    assert.equal(paid.rules.fightSequence.active.bossStyle,'sustained');
    assert.equal(paid.rules.cp.orks,0);assert.equal(paid.rules.patrol.tactics.crush,'1-orks-4/boy-0');
    assert.equal(await js('!!document.querySelector("[data-fight-tactic], [data-act=tactic-crush]")'),false);
    await click('#undo');assert.deepEqual(await state(),beforeChoice);
    await click('#redo');await reload();assert.deepEqual(await state(),paid);
    await upload(beforeChoice);
    for(const style of ['lethal','sustained']){
      if(style==='sustained')await upload(beforeChoice);
      await choose('fight-unit','boy-0');
      await act(style==='lethal'?'fight-normal':'fight-normal-sustained');
      assert.equal(await js('document.querySelector("[data-field=bossStyle]")===null'),true);
      await allocate(boss,'captain-1',3);
      if(style==='sustained'){
        await act('cancel-plan');
        assert.equal((await state()).rules.fightSequence.active.bossStyle,style);
        await allocate(boss,'captain-1',3);
      }
      const draft=await state();await reload();assert.deepEqual(await state(),draft);
      await allocate(boss,'librarian-1',3);await allocate(boy,'librarian-1',boyAttacks);
      checkRows((await state()).rules,style);
      if(style==='sustained'&&screenshot){
        await js('document.querySelector("[data-act=lock]").scrollIntoView({block:"center"})');
        await screenshot('06-warboss-fight-choice.png');
      }
      await act('lock');
      const locked=await state();assert.ok(locked.rules.declaration.locked);
      await reload();assert.deepEqual(await state(),locked);checkRows(locked.rules,style);
    }
    // Keep the defenders alive so the second Ork squad has its own real activation.
    for(const i of [0,1,2]){
      const target=JSON.stringify(button('resolve-'+i));
      await js(`(()=>{const previous=Math.random;try{Math.random=()=>0;document.querySelector(${target}).click()}finally{Math.random=previous}})()`);
    }
    await act('fight-finish');
    if(await js('!!document.querySelector("[data-act=fight-counter-decline]")'))await act('fight-counter-decline');
    await choose('fight-unit','boy-1');
    assert.equal(await js('!!document.querySelector("[data-act=fight-normal-sustained]")'),false);
    await act('fight-normal');await allocate('boy-12','captain-1',boyAttacks);
    const next=(await state()).rules;
    assert.equal(next.fightSequence.active.unit,'boy-1');assert.equal(next.fightSequence.active.bossStyle,undefined);
    assert.deepEqual(next.declaration.rows.map(r=>[r.lethal,r.sustained]),[[false,false]]);
    for(const pay of [false,true]){
      const injured=structuredClone(beforeChoice);injured.rules.hp['librarian-1']=1;
      await upload(injured);await choose('fight-unit','boy-0');
      if(pay)await click('[data-fight-tactic="crush"]');
      await act('fight-normal');
      await allocate(boss,'captain-1',3);await allocate(boss,'librarian-1',3);
      await allocate(boy,'librarian-1',boyAttacks);await act('lock');
      await resolveDice(0,[1,1,1]);await resolveDice(1,[1,1,1]);
      const partial=await state();assert.equal(partial.rules.declaration.rows.filter(r=>r.done).length,2);
      await reload();assert.deepEqual(await state(),partial);
      assert.equal(await js('!!document.querySelector("[data-fight-tactic], [data-act=tactic-crush]")'),false);
      await resolveDice(2,pay?[3,3,1]:[3,3]);
      const finished=await state();assert.equal(finished.rules.cp.orks,pay?0:1);
      assert.equal(finished.rules.hp['librarian-1'],pay?0:1);
      assert.equal(finished.pieces.find(p=>p.id==='librarian-1').removed,pay);
    }
  }finally{
    await upload(save);
    await click('[data-tab="'+(originalTab||'roster')+'"]');
  }
}
