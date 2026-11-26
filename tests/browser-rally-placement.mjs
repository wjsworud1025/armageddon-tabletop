import assert from 'node:assert/strict';
import {snapshot} from '../state.mjs';
import {rallyBoard,rallyCasualty,rallyReturnPose} from './fixtures/rally-board.mjs';

export async function checkRallyPlacement({save,upload,click,js,state,reload,screenshot,send},{expectOld=false}={}){
  const act=name=>click('[data-act="'+name+'"]');
  const piece=s=>s.pieces.find(p=>p.id===rallyCasualty);
  const initial=snapshot(rallyBoard());
  async function command(){
    await upload(initial);await click('[data-tab=roster]');
    for(const key of ['orks','warboss']){
      const d='#army-list details[data-key="'+key+'"]';
      if(!await js('document.querySelector('+JSON.stringify(d)+').open'))await click(d+' > summary');
    }
    await click('#army-list button[title$=" · warboss-1"]');await click('[data-tab=battle]');
    assert.ok(await js('!!document.querySelector("[data-act=warcry]:not(:disabled)")'));
  }
  async function start(){
    await js(`(()=>{const random=Math.random;try{Math.random=()=>.5;document.querySelector('[data-act=warcry]').click()}
      finally{Math.random=random}})()`);
  }
  async function score(expected){
    await act('next');
    const s=await state();
    assert.equal(s.rules.step,1);assert.equal(s.rules.vp.orks,expected);
    assert.equal(s.rules.objectives['blue-home'].owner,expected?'orks':null);
  }
  const previousTab=await js('document.querySelector("[data-tab][aria-selected=true]")?.dataset.tab');
  try{
    await command();await score(0);
    await command();await start();
    const started=await state();
    assert.equal(started.rules.patrol.warcryUsed,true);
    if(expectOld){
      assert.ok(!started.rules.rallyPlan);
      assert.equal(piece(started).removed,false);
      assert.equal(piece(started).x,piece(initial).x);
      await score(10);const scored=await state();await reload();assert.deepEqual(await state(),scored);
      return;
    }
    assert.ok(await js('!!document.querySelector("[data-rally-placement]")'));
    assert.equal(started.rules.rallyPlan.die,2);
    assert.deepEqual(piece(started),piece(initial));
    const toggle='[data-act=rally-toggle][data-model="'+rallyCasualty+'"]';
    await click(toggle);
    const stale=await state();
    assert.equal(stale.rules.rallyPlan.selected[rallyCasualty].x,piece(initial).x);
    // A death position is an editable draft. An invalid return cannot silently score.
    assert.ok(await js('document.querySelector("[data-act=rally-finish]").disabled'));
    await js('document.querySelector("[data-act=rally-finish]").click()');assert.deepEqual(await state(),stale);
    assert.ok(await js('!!document.querySelector("[data-rally-errors]")?.textContent.trim()'));
    assert.ok(await js('!document.querySelector("[data-act=next]:not(:disabled)")'));
    await click('#undo');assert.deepEqual(await state(),started);
    await click('#redo');await reload();assert.deepEqual(await state(),stale);
    await click('[data-act=rally-focus][data-model="'+rallyCasualty+'"]');
    for(const key of ['x','z']){
      const selector=JSON.stringify('[data-field=rally-'+key+']');
      if(send){
        await js('(()=>{const el=document.querySelector('+selector+');el.focus();el.select()})()');
        await send('Input.insertText',{text:String(rallyReturnPose[key])});
      }else{
        await js('document.querySelector('+selector+').value='+JSON.stringify(String(rallyReturnPose[key])));
      }
    }
    await act('rally-pose');
    const pending=await state(),draft=pending.rules.rallyPlan.selected[rallyCasualty];
    assert.equal(draft.x,rallyReturnPose.x);assert.equal(draft.z,rallyReturnPose.z);
    assert.equal(pending.rules.rallyPlan.die,2);assert.deepEqual(piece(pending),piece(initial));
    if(screenshot){
      await js('document.querySelector("[data-act=rally-finish]").scrollIntoView({block:"center"})');
      await screenshot('06-rally-placement.png');
    }
    await act('rally-finish');
    const finished=await state();
    assert.ok(!finished.rules.rallyPlan);assert.equal(finished.rules.hp[rallyCasualty],1);
    assert.deepEqual(piece(finished),{...piece(initial),...draft,removed:false});
    assert.deepEqual(finished.pieces.filter(p=>p.id!==rallyCasualty),initial.pieces.filter(p=>p.id!==rallyCasualty));
    assert.ok(await js('!document.querySelector("[data-act=warcry]:not(:disabled)")'));
    await click('#undo');assert.deepEqual(await state(),pending);
    await click('#redo');assert.deepEqual(await state(),finished);
    await score(0);const scored=await state();await reload();assert.deepEqual(await state(),scored);
  }finally{
    await upload(save);await click('[data-tab="'+(previousTab||'roster')+'"]');
  }
}
