import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {snapshot} from '../state.mjs';
import {newBattle} from '../rules/battle.mjs';
import {newPatrolSetup} from '../rules/patrol-setup.mjs';
import {advanceOfficialSetup} from '../rules/official-deployment.mjs';

const id='smallRuin-1';

function oldPatrol(){
  const game={...createTable(),logs:[],rules:{...newBattle(),officialSetup:{...newPatrolSetup(),version:3}}};
  return snapshot(advanceOfficialSetup(game,{act:'official-roll-layout'},()=>1));
}

// Drive the real canvas picker. In top view, the projected inch scale is
// available from two known piece centres, even when the sidebar is resized.
export async function checkSmallRuin({save,state,upload,js,click,send,screenshot}){
  const study=structuredClone(save);
  for(const p of study.pieces){
    p.removed=p.id!==id;
    if(!p.removed)Object.assign(p,{x:0,z:0,yaw:0,elevation:0});
  }
  async function open(snapshot){
    await upload(snapshot);await click('[data-tab=roster]');await click('#home');await click('#camera');
    await click('[aria-label$="smallRuin-1"]');await click('#focus');
  }
  async function hit(x,z){
    const screen=await js(`(()=>{
      const wall=tabletopView.pose('smallRuin-1'),centre=tabletopView.screen('smallRuin-1');
      const ref=tabletopView.state().pieces.find(p=>Math.abs(p.x-wall.x)>4);
      const scale=(tabletopView.screen(ref.id).x-centre.x)/(ref.x-wall.x);
      const rect=document.querySelector('#view').getBoundingClientRect(),c=Math.cos(wall.yaw),s=Math.sin(wall.yaw);
      return {x:rect.x+centre.x+scale*(c*${x}+s*${z}),y:rect.y+centre.y+scale*(-s*${x}+c*${z})};
    })()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...screen,button:'left',buttons:1,clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...screen,button:'left',buttons:0,clickCount:1});
    return js('document.querySelector("#selection").hidden ? null : document.querySelector("#piece-name").textContent');
  }
  const name=createTable().pieces.find(p=>p.id===id).name;
  const assertNewWalls=async()=>{
    assert.equal(await hit(.89,.25),name,'The short return wall is pickable');
    assert.equal(await hit(.31,.29),null,'The courtyard between the arms is open');
    assert.equal(await hit(-.65,.37),name,'The long wall is pickable');
  };
  const photo=await js('!document.querySelector("#appearance").hidden&&tabletopView.stats().reconstructed>0');
  await open(study);await assertNewWalls();
  if(screenshot){
    const p=await js('(()=>{const r=document.querySelector("#view").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'right',buttons:2});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x-22,y:p.y-155,buttons:2});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x-22,y:p.y-155,button:'right',buttons:0});
    await screenshot('03-small-shrine-corner.png');
  }
  await open(oldPatrol());
  assert.equal((await state()).rules.officialSetup.version,3);
  assert.equal(await hit(.89,.25),photo?name:null,'An older table retains the geometry that its edition used');
  await open(study);await assertNewWalls();
  await upload(save);await click('#home');await click('[data-tab=roster]');
  assert.deepEqual(await state(),save);
}
