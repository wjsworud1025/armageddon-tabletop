import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import {createTable} from '../data/catalog.mjs';
import {createPiece} from '../assets/pieces.mjs';
import {createSightPicker} from '../assets/sight-picker.mjs';
import {newBattle,startBattle} from '../rules/battle.mjs';

// The same two procedural figures are available in both distributions.
const observer='intercessor-2',target='boy-2',wall='largeRuin-2';
function aimFixture(save,x,y){
  const data=structuredClone(save),pieces=createTable().pieces;
  data.training=undefined;data.layout=null;data.rules=startBattle(newBattle(),'marines',5);data.rules.step=2;
  const models=[observer,target].map((id,i)=>{
    const piece=pieces.find(p=>p.id===id),obj=createPiece(T,piece);
    obj.position.set(x,0,i?6:-6);return obj;
  });
  const picker=createSightPicker();
  // Align the two actual surface points, compensating for asymmetric sculpts.
  for(let i=0;i<6;i++)for(const [index,obj] of models.entries()){
    const other=models[1-index].position,p=obj.position;
    picker.show(obj,Math.atan2(other.x-p.x,other.z-p.z));
    const q=picker.sample(new T.Vector2(0,0),1000,700);assert.ok(q,'Centre hits the figure');
    p.x+=x-q.x;p.y+=y-q.y;
  }
  picker.clear();
  for(const rec of data.pieces){
    const i=[observer,target].indexOf(rec.id);
    if(i>=0){
      const p=models[i].position;Object.assign(rec,{x:p.x,z:p.z,elevation:p.y,yaw:0,removed:false});
    }else if(rec.id===wall)Object.assign(rec,{x:0,z:0,elevation:0,yaw:0,removed:false});
    else rec.removed=true;
  }
  return data;
}

export async function checkRuinSight({save,upload,state,js,click,send,screenshot}){
  const samples=[['06-ruin-window',-1.42,2.84,false],['06-ruin-bar',-1.42,2.96,true]];
  async function select(key,value){
    await js(`(()=>{const el=document.querySelector('[data-field="${key}"]');el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  }
  async function centre(){
    const pt=await js('(()=>{const r=document.querySelector("#view").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...pt,button:'left',buttons:1,clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...pt,button:'left',buttons:0,clickCount:1});
  }
  for(const [label,x,y,blocked] of samples){
    await upload(aimFixture(save,x,y));await click('[data-tab=battle]');
    await select('fighter',observer);await select('target',target);
    await click('[data-act="inspect-sight"]');await click('#surface-start');
    assert.match(await js('document.querySelector("#surface-status").textContent'),/시선을 시작할 점/);
    const before=await state();
    await centre();assert.match(await js('document.querySelector("#surface-status").textContent'),/시선이 닿을 점/);
    await centre();
    const result=await js('document.querySelector("#surface-status").textContent');
    assert.match(result,blocked?/교차한 조형: 대형 제조공장 폐허 2/:/교차한 조형 표면 없음/,label);
    if(screenshot)await screenshot(label+'.png');
    await click('#surface-cancel');await click('#home');
    assert.deepEqual(await state(),before,'Picking points must preserve all model positions and rules');
  }
  await upload(save);await click('[data-tab=roster]');
}
