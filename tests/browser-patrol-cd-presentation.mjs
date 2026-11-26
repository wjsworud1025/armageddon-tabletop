import assert from 'node:assert/strict';
import {checkSightSamples} from './browser-ruin-sight.mjs';

const wall='largeRuin-2';
export async function checkPatrolCDPresentation({save,upload,click,js,state,reload,send,screenshot}){
  const photo=await js('!!document.querySelector(\'meta[name="local-studio-photos"]\')');
  const originalTab=await js('document.querySelector("[data-tab][aria-selected=true]")?.dataset.tab');
  const oldFilter=await js('document.querySelector("#search").value');
  const byId=s=>s.pieces.find(p=>p.id===wall);
  const search=text=>js(`(()=>{const e=document.querySelector('#search');e.value=${JSON.stringify(text)};e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  async function selectWall(){
    await click('[data-tab=roster]');await search(wall);await click('#army-list button[title$=" · '+wall+'"]');
  }
  async function checkSelection(cd){
    assert.equal(await js('document.querySelector("#piece-spec").textContent.includes("C+D")'),cd);
    assert.equal(await js('!document.querySelector("#studio-tools").hidden'),photo&&!cd);
    assert.equal(await js('!!document.querySelector(\'#army-list button[title$=" · '+wall+'"] img\')'),photo&&!cd);
  }
  function isolate(s,yaw){
    const result=structuredClone(s);result.rules=null;
    for(const p of result.pieces)p.removed=p.id!==wall;
    if(yaw!==undefined)byId(result).yaw=yaw;
    return result;
  }
  async function topPick(x,z){
    const pt=await js(`(()=>{const centre=tabletopView.screen('largeRuin-2'),pose=tabletopView.pose('largeRuin-2');
      const ref=tabletopView.state().pieces.find(p=>Math.abs(p.x-pose.x)>4);
      const scale=(tabletopView.screen(ref.id).x-centre.x)/(ref.x-pose.x),r=document.querySelector('#view').getBoundingClientRect();
      return {x:r.x+centre.x+${x}*scale,y:r.y+centre.y+${z}*scale}})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...pt,button:'left',buttons:1,clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...pt,button:'left',buttons:0,clickCount:1});
    return js('!document.querySelector("#selection").hidden');
  }
  async function field(s,cd,studio){
    await upload(s);await click('#home');await selectWall();await checkSelection(cd);
    if(photo&&!await js('document.querySelector("#appearance").getAttribute("aria-pressed")==="true"'))await click('#appearance');
    const stats=await js(`(async()=>{const end=performance.now()+10000;
      while(tabletopView.stats().studioVisible!==${photo?studio:0}&&performance.now()<end)await new Promise(r=>setTimeout(r,80));
      return tabletopView.stats()})()`);
    assert.equal(stats.visiblePieces,1);assert.equal(stats.studioVisible,photo?studio:0);
    const p=byId(s);
    assert.deepEqual(await js('tabletopView.pose("largeRuin-2")'),{x:p.x,z:p.z,elevation:p.elevation,yaw:p.yaw});
  }
  try{
    await upload(save);await click('[data-tab=battle]');await js('document.querySelector("#map").value="B"');await click('#apply-map');
    const current=await state();assert.equal(current.layout.map,'B');assert.equal(current.reliquaryRevision,3);
    const archived=structuredClone(current);delete archived.reliquaryRevision;
    await field(isolate(archived,76*Math.PI/180),false,0);
    await field(isolate(current,76*Math.PI/180),true,0); // The old door portrait would otherwise appear at 76°.
    await reload();await selectWall();await checkSelection(true);
    if(photo){
      await click('#appearance');await checkSelection(true);await click('#appearance');
      await js('document.querySelector("#studio-view").click()');
      assert.ok(!await js('!!document.querySelector(\'dialog[open][aria-label="실물 미니어처 회전 사진"]\')'));
    }
    await click('#camera');await click('#focus');assert.ok(await js('!!tabletopView.pose("largeRuin-2")'));
    if(screenshot)await screenshot('06-patrol-cd-sculpt.png');
    await field(isolate(current,132*Math.PI/180),true,0);
    await field(isolate(archived,132*Math.PI/180),false,1);
    for(const [s,cd] of [[archived,false],[current,true]]){
      await upload(isolate(s,0));await click('#home');await click('#camera');await selectWall();await click('#focus');
      assert.equal(await topPick(0,-.5),cd,'floor six occupies its forward middle cell');
      assert.equal(await topPick(0,1.8),!cd,'the earlier wall extends into this strip');
    }
    await field(isolate(save),false,1); // The corrected exhibition keeps its middle-ring studio view.
    await upload(current);await click('[data-tab=battle]');await click('#training-three-start');
    await selectWall();await checkSelection(false);
    await click('[data-tab=battle]');await click('#training-three-exit');await selectWall();await checkSelection(true);
    for(const casting of ['CB','CD']){
      const cd=casting==='CD';
      await checkSightSamples({save,upload,click,js,state,send,screenshot},[
        ['06-patrol-'+casting+'-return',wall,.75,4.1,0,cd,true],
        ['06-patrol-'+casting+'-yard',wall,1.8,1.5,0,!cd,true],
      ],casting);
    }
  }finally{
    await upload(save);await search(oldFilter);await click('[data-tab="'+(originalTab||'roster')+'"]');
  }
}
