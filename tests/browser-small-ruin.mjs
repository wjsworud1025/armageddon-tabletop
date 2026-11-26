import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {snapshot} from '../state.mjs';
import {newBattle} from '../rules/battle.mjs';
import {newPatrolSetup} from '../rules/patrol-setup.mjs';
import {advanceOfficialSetup} from '../rules/official-deployment.mjs';

function oldPatrol(version){
  const game={...createTable(),logs:[],rules:{...newBattle(),officialSetup:{...newPatrolSetup(),version}}};
  return snapshot(advanceOfficialSetup(game,{act:'official-roll-layout'},()=>1));
}

// Drive the real canvas picker. In top view, the projected inch scale is
// available from two known piece centres, even when the sidebar is resized.
async function checkCorner({save,state,upload,js,click,send,screenshot},spec){
  const {id,version,arm,court,front,oldHit}=spec;
  const study=structuredClone(save);
  for(const p of study.pieces){
    p.removed=p.id!==id;
    if(!p.removed)Object.assign(p,{x:0,z:0,yaw:0,elevation:0});
  }
  async function open(snapshot){
    await upload(snapshot);await click('[data-tab=roster]');await click('#home');await click('#camera');
    await click('[aria-label$="'+id+'"]');await click('#focus');
  }
  async function hit(x,z){
    const screen=await js(`(()=>{
      const wall=tabletopView.pose(${JSON.stringify(id)}),centre=tabletopView.screen(${JSON.stringify(id)});
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
    assert.equal(await hit(...arm),name,id+' short return wall');
    assert.equal(await hit(...front),name,id+' long wall');
    assert.equal(await hit(...court),null,id+' open courtyard');
  };
  const photo=await js('!document.querySelector("#appearance").hidden&&tabletopView.stats().reconstructed>0');
  await open(study);await assertNewWalls();
  if(screenshot){
    const p=await js('(()=>{const r=document.querySelector("#view").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'right',buttons:2});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x-22,y:p.y-155,buttons:2});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x-22,y:p.y-155,button:'right',buttons:0});
    await screenshot(spec.image);
  }
  await open(oldPatrol(version));
  assert.equal((await state()).rules.officialSetup.version,version);
  assert.equal(await hit(...arm),oldHit(photo)?name:null,id+' retains its archived geometry');
  await open(study);await assertNewWalls();
  await upload(save);await click('#home');await click('[data-tab=roster]');
  assert.deepEqual(await state(),save);
}

export async function checkSmallRuin(tools){
  await checkCorner(tools,{id:'smallRuin-1',version:3,arm:[.89,.25],court:[.31,.29],front:[-.65,.37],
    oldHit:photo=>photo,image:'03-small-shrine-corner.png'});
  await checkCorner(tools,{id:'smallRuin-4',version:4,arm:[1.08,-.53],court:[.39,-.07],front:[-.62,.43],
    oldHit:()=>false,image:'03-small-pipe-corner.png'});
}
