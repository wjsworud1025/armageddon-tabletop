import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {newBattle,startBattle} from '../rules/battle.mjs';

const objectives=['blue-home','red-home','neutral-1','neutral-2'];
const commonPads=['barricade-1','barricade-2','pylon-1','pylon-2'];

// Fixed points on map C. The captain can stand on the exposed end of the
// first pylon mat, or inside the blue home mat, without touching the scenery.
function scoreFixture(save,home){
  const game=structuredClone(save);
  const scenery=new Set(createTable().pieces.filter(p=>p.faction==='terrain').map(p=>p.id));
  game.rules={...startBattle(newBattle(),'marines',5),round:2};
  for(const p of game.pieces){
    if(p.id==='captain-1')Object.assign(p,{x:home?-16.5:-1,z:home?-9.7:1,yaw:0,elevation:0,removed:false});
    else if(p.id==='warboss-1')Object.assign(p,{x:0,z:10,yaw:0,elevation:0,removed:false});
    else if(!scenery.has(p.id))p.removed=true;
  }
  return game;
}

export async function checkTerrainAreas({save,upload,state,js,click,until,screenshot}){
  const faces=()=>js('window.tabletopView.stats().terrainAreas');
  async function select(id,value){
    const picked=await js(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));return e.value})()`);
    assert.equal(picked,value);
  }
  async function expectFaces(map){
    const actual=await faces();
    const extra=map==='B'?['largeRuin-3','largeRuin-4']:['generatorShrine-1','capacitorStack-1'];
    const wanted=[...commonPads,...extra].map(id=>id+'-pad').sort();
    assert.equal(actual.length,10,'Rendered patrol terrain faces on map '+map);
    assert.deepEqual(actual.filter(a=>a.objective===true).map(a=>a.id).sort(),[...objectives].sort());
    assert.deepEqual(actual.filter(a=>a.objective===false).map(a=>a.id).sort(),wanted,'Distinct ordinary mats, including touching corners on A and C');
  }
  const previous=await state();
  await upload(save);
  await click('[data-tab=battle]');
  const previousMap=await js('document.querySelector("#map").value');
  const previousBlue=await js('document.querySelector("#blue").value');
  const wasOpen=await js('document.querySelector("#deployment").open');
  if(!wasOpen)await click('#deployment>summary');
  const wasChecked=await js('document.querySelector("#zones").checked');
  if(!wasChecked)await click('#zones');
  await select('map',previousMap);await select('blue',previousBlue);
  assert.equal((await state()).layout,null);
  assert.deepEqual(await faces(),[],'The exhibition has no patrol mats');
  await select('blue','marines');
  for(const map of ['A','B','C']){
    await select('map',map);await click('#apply-map');
    assert.equal((await state()).layout.map,map);
    await expectFaces(map);
    await screenshot('04-terrain-areas-'+map+'.png');
    const before=await state();
    await click('#zones');
    assert.deepEqual(await faces(),[],'Hiding the overlay removes every rendered patrol face');
    assert.deepEqual(await state(),before,'Hiding the overlay preserves the save');
    await click('#zones');
    await expectFaces(map);
    assert.deepEqual(await state(),before,'Showing the overlay preserves the save');
  }
  const mapC=await state();
  for(const [key,scenario,count] of [['',1,2],['-two',2,20],['-three',3,26],['-four',4,28]]){
    await click('#training'+key+'-start');
    await until(()=>js('tabletopView.stats().visiblePieces==='+count));
    assert.equal((await state()).training.scenario,scenario);
    assert.deepEqual(await faces(),[],'Handbook '+scenario+' suppresses the underlying patrol mats');
    await click('#training'+key+'-exit');
    await expectFaces('C');
    assert.deepEqual(await state(),mapC);
  }
  for(const home of [false,true]){
    await upload(scoreFixture(mapC,home));
    assert.equal((await state()).rules.round,2);
    await click('[data-act=next]');
    const {rules}=await state();
    assert.equal(rules.step,1,'The round-two command phase was scored');
    assert.deepEqual(Object.keys(rules.objectives).sort(),[...objectives].sort());
    assert.deepEqual(Object.entries(rules.objectives).filter(([,o])=>o.owner).map(([id,o])=>[id,o.owner]),home?[['blue-home','marines']]:[]);
    assert.equal(rules.vp.marines,home?5:0,'A captain at the pylon earns no VP, the same captain at home earns 5 VP');
    assert.equal(rules.vp.orks,0);
  }
  if(!wasChecked)await click('#zones');
  if(!wasOpen)await click('#deployment>summary');
  await upload(previous);await click('#home');await click('[data-tab=roster]');
  assert.deepEqual(await state(),previous);
}
