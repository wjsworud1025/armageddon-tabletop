import assert from 'node:assert/strict';
import {snapshot} from '../state.mjs';
import {terrifyingChargeBoard} from './fixtures/terrifying-charge-board.mjs';

export async function checkTerrifyingCharge({save,upload,click,js,state,reload,screenshot},{expectOld=false}={}){
  const act=k=>click('[data-act="'+k+'"]'),exists=sel=>js('!!document.querySelector('+JSON.stringify(sel)+')');
  const points=s=>s.rules.cp.marines;
  async function load(ready){
    await upload(snapshot(terrifyingChargeBoard(ready)));await click('[data-tab=roster]');
    for(const key of ['marines','captain']){
      const d='#army-list details[data-key="'+key+'"]';
      if(!await js('document.querySelector('+JSON.stringify(d)+').open'))await click(d+' > summary');
    }
    await click('#army-list button[title$=" · captain-1"]');await click('[data-tab=battle]');
  }
  async function oldTactic(){
    const btn='[data-act=tactic-shockCharge]';
    await js('document.querySelector('+JSON.stringify(btn)+').closest("details").open=true');
    await click(btn);
  }
  const oldTab=await js('document.querySelector("[data-tab][aria-selected=true]")?.dataset.tab');
  try{
    await load(false);
    if(expectOld){
      await oldTactic();
      assert.equal(points(await state()),1);assert.ok(!(await state()).rules.units.captain?.charged);
      await load(true);await act('charge-finish');await oldTactic();
      const broken=await state();
      assert.equal(points(broken),1);assert.equal(broken.rules.units.captain.charged,true);
      assert.ok(!broken.rules.units['boy-0']?.shocked&&!broken.rules.units.weirdboy?.shocked);
      assert.ok(!broken.rules.terrifyingResult&&!broken.rules.terrifyingCharge);
      return;
    }
    assert.ok(!await exists('[data-act=tactic-shockCharge]'));assert.equal(points(await state()),2);
    await act('charge-normal');await act('charge-cancel');
    assert.ok(!await exists('[data-terrifying-charge]'));assert.equal(points(await state()),2);
    await load(true);await act('charge-finish');
    const offer=await state();assert.equal(points(offer),2);
    assert.equal(offer.rules.units.captain.charged,true);
    assert.deepEqual([...offer.rules.terrifyingCharge.targets].sort(),['boy-0','weirdboy']);
    assert.ok(!await exists('[data-act=next]:not(:disabled)'));
    assert.ok(await js('document.querySelector("[data-act=terrifying-use]").disabled'));
    await reload();assert.deepEqual(await state(),offer);
    await act('terrifying-pass');const passed=await state();
    assert.equal(points(passed),2);assert.ok(!passed.rules.terrifyingCharge&&!passed.rules.terrifyingResult);
    await click('#undo');assert.deepEqual(await state(),offer);
    for(const [target,die,threshold,success] of [['boy-0',3,6,false],['weirdboy',4,7,true]]){
      await js(`(()=>{const el=document.querySelector('[data-field=terrifying-target]');
        el.value=${JSON.stringify(target)};el.dispatchEvent(new Event('change',{bubbles:true}))})()`);
      assert.equal(points(await state()),2);
      if(screenshot&&!success)await screenshot('06-terrifying-charge-target.png');
      await js(`(()=>{const random=Math.random;try{Math.random=()=>(${die}-.5)/6;
        document.querySelector('[data-act=terrifying-use]').click()}finally{Math.random=random}})()`);
      const result=await state(),record=result.rules.terrifyingResult;
      assert.equal(points(result),1);assert.equal(record.target,target);assert.equal(record.leadership,threshold);
      assert.deepEqual(record.dice,[die,die]);
      assert.equal(!!result.rules.units[target]?.shocked,!success);
      assert.ok(!result.rules.units[target==='boy-0'?'weirdboy':'boy-0']?.shocked);
      assert.ok(!await exists('[data-act=terrifying-use]'));
      const summary=await js('document.querySelector("[data-terrifying-result]").textContent');
      assert.ok(summary.includes('['+die+' + '+die+'] − 1 = '+(2*die-1))&&summary.includes('리더십 '+threshold+'+'));
      assert.ok(summary.includes(success?'통과':'실패'));
      if(screenshot&&!success)await screenshot('06-terrifying-charge-result.png');
      await click('#undo');assert.deepEqual(await state(),offer);
      await click('#redo');await reload();assert.deepEqual(await state(),result);
      assert.equal(await js('document.querySelector("[data-terrifying-result]").textContent'),summary);
      if(!success)await upload(offer);
    }
  }finally{
    await upload(save);await click('[data-tab="'+(oldTab||'roster')+'"]');
  }
}
