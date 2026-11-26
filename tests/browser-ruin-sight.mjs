import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import {createTable} from '../data/catalog.mjs';
import {createPiece} from '../assets/pieces.mjs';
import {createSightPicker} from '../assets/sight-picker.mjs';
import {newBattle,startBattle} from '../rules/battle.mjs';
import {inspectButton,sightButton} from './browser-shooter-sight.mjs';

// The same two procedural figures are available in both distributions.
const observer='intercessor-2',target='boy-2';
function acrossRuin(start,end){
  const a=new T.Vector3(...start),b=new T.Vector3(...end);
  return [-6,3].map(x=>a.clone().lerp(b,(x-a.x)/(b.x-a.x)).toArray());
}
function aimFixture(save,offset,y,wall,pickY,alongX,viewLine,mapCasting){
  const data=structuredClone(save),pieces=createTable().pieces;
  data.training=undefined;data.layout=null;data.rules=startBattle(newBattle(),'marines',5);data.rules.step=2;
  const scale=wall==='largeRuin-2'&&!mapCasting?3/2.30:1;
  if(mapCasting){
    data.layout={map:'B',blue:'marines'};
    if(mapCasting==='CD')data.reliquaryRevision=3;else delete data.reliquaryRevision;
  }else if(wall==='largeRuin-2')data.reliquaryRevision=2;
  offset*=scale;y*=scale;
  const surfacePoints=viewLine?.map(p=>new T.Vector3(...p).multiplyScalar(scale));
  const models=[observer,target].map((id,i)=>{
    const piece=pieces.find(p=>p.id===id),obj=createPiece(T,piece);
    const distance=i?6:-6;
    obj.position.set(alongX?distance:offset,0,alongX?offset:distance);
    if(surfacePoints)obj.position.copy(surfacePoints[i]);
    return obj;
  });
  const picker=createSightPicker();
  // Align the two actual surface points, compensating for asymmetric sculpts.
  for(let i=0;i<6;i++)for(const [index,obj] of models.entries()){
    const other=models[1-index].position,p=obj.position;
    picker.show(obj,Math.atan2(other.x-p.x,other.z-p.z));
    const q=picker.sample(new T.Vector2(0,pickY),1000,700);assert.ok(q,'Selected point hits the figure');
    if(surfacePoints)p.add(surfacePoints[index].clone().sub(q));
    else{
      if(alongX)p.z+=offset-q.z;else p.x+=offset-q.x;
      p.y+=y-q.y;
    }
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

export function checkRuinSight(tools){
  return checkSightSamples(tools,[
    ['06-ruin-window','largeRuin-2',-1.42,2.84,0,false],
    ['06-ruin-bar','largeRuin-2',-1.42,2.96,0,true],
    // Look across the low corner with the actual 1 mm sight cylinder.
    ['06-ruin-lower-opening','largeRuin-2',1.583,1.672,0,false,true],
    ['06-ruin-lower-strap','largeRuin-2',1.675,1.950,0,true,true],
    // The full line between these figures clears the piece through the gap in view 01-01.
    ['06-ruin-lower-oblique','largeRuin-2',0,0,0,false,true,
      acrossRuin([-2.65,1.661910,1.853008],[-1.85,1.758049,1.303559])],
    // The short segment across the post in 01-06 is clear, but a second
    // surface of the ruin still obstructs the longer 1 mm line.
    ['06-ruin-lower-oblique-wall','largeRuin-2',0,0,0,true,true,
      acrossRuin([-2.65,1.801749,1.643054],[-1.85,1.710852,1.616966])],
    ['06-small-return-wall','smallRuin-1',.89,.5,-.5,true],
    ['06-small-return-above','smallRuin-1',.89,1.48,0,false],
    ['06-pipe-return-wall','smallRuin-4',-.27,.5,-.5,true,true],
    ['06-pipe-return-above','smallRuin-4',-.27,1.65,0,false,true]
  ]);
}

export function checkGretchinSight(tools){
  // Extend view 01-01 through the gap and the neighbouring gripping hand.
  // Both endpoints belong to selectable figures outside engagement range.
  return checkSightSamples(tools,[
    ['06-gretchin-raised-arm','gretchin-5',0,0,-.15,false,false,
      [[.1059853,1.3554871,5],[.2081908,.880546,-4.3]]],
    ['06-gretchin-raised-hand','gretchin-5',0,0,-.15,true,false,
      [[.2333559,1.3162808,5],[.458123,.8038585,-4.3]]]
  ]);
}

export function checkBarricadeSight(tools){
  return checkSightSamples(tools,[
    ['06-barricade-open-rail','barricade-1',.97,1.70,-.15,false],
    ['06-barricade-crossbar','barricade-1',.97,1.94,-.15,true],
    ['06-barricade-perforation','barricade-1',1.035,2.15,-.15,true]
  ]);
}

export async function checkSightSamples({save,upload,state,js,click,send,screenshot},samples,mapCasting){
  async function select(key,value){
    await js(`(()=>{const el=document.querySelector('[data-field="${key}"]');el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  }
  async function pickSurface(pickY){
    const pt=await js('(()=>{const r=document.querySelector("#view").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height*'+((1-pickY)/2)+'}})()');
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...pt,button:'left',buttons:1,clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...pt,button:'left',buttons:0,clickCount:1});
  }
  for(const [label,wall,offset,y,pickY,blocked,alongX,viewLine] of samples){
    await upload(aimFixture(save,offset,y,wall,pickY,alongX,viewLine,mapCasting));await click('[data-tab=battle]');
    await select('fighter',observer);await select('target',target);
    await click(inspectButton(observer,target));await click('#surface-start');
    assert.match(await js('document.querySelector("#surface-status").textContent'),/시선을 시작할 점/);
    const before=await state();
    await pickSurface(pickY);assert.match(await js('document.querySelector("#surface-status").textContent'),/시선이 닿을 점/);
    await pickSurface(pickY);
    const result=await js('document.querySelector("#surface-status").textContent');
    const name=createTable().pieces.find(p=>p.id===wall).name;
    assert.ok(result.includes(blocked?'교차한 조형: '+name:'교차한 조형 표면 없음'),label+' '+result);
    assert.deepEqual(await state(),before,'Checking either ray cannot decide a whole-model sight line');
    assert.match(await js('document.querySelector("#sight-verdict").textContent'),/미확인/);
    assert.equal(await js('document.querySelector("[data-act=attack]").disabled'),true);
    if(screenshot)await screenshot(label+'.png');
    const status=blocked?'blocked':'visible';
    await click('#sight-'+status);
    assert.equal((await state()).rules.shootingSight.pairs[observer][target],status);
    assert.equal(await js('document.querySelector("#surface-tools").hidden'),false,'Keep the camera on the shooter');
    assert.equal(await js('document.querySelector("#surface-status").textContent'),result,'Keep the measured ray');
    assert.match(await js('document.querySelector("#sight-verdict").textContent'),blocked?/가림/:/보임/);
    const confirmed=await state();
    await click('#sight-'+status);
    assert.deepEqual(await state(),confirmed,'Reconfirming the same sight line has no side effects');
    await click('#surface-cancel');await click('#home');
    assert.deepEqual(await state(),confirmed,'Leaving the camera preserves the explicit verdict');
    assert.equal(await js('document.querySelector('+JSON.stringify(sightButton(observer,target,status))+').getAttribute("aria-pressed")'),'true');
    assert.equal(await js('document.querySelector("[data-act=attack]").disabled'),blocked);
  }
  await upload(save);await click('[data-tab=roster]');
}
