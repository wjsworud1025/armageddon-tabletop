import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {newBattle,startBattle} from './battle.mjs';

const participants=['captain-1','warboss-1'];
const catalog=createTable().pieces;
const positions=ids=>'Object.fromEntries('+JSON.stringify(ids)+'.map(id=>[id,tabletopView.pose(id)]))';

export async function checkTraining({save,upload,click,state,js,reload}){
  // An injured incumbent and a removed captain make an accidental change to
  // the live battle or reuse of its visible roster immediately observable.
  const fixture=structuredClone(save);
  fixture.surface='reverse';
  fixture.rules=startBattle(newBattle(),'marines',5);
  fixture.rules.hp['warboss-1']=3;
  const captain=fixture.pieces.find(p=>p.id==='captain-1');
  Object.assign(captain,{x:-11,z:7,elevation:1.5,removed:true});
  const boss=fixture.pieces.find(p=>p.id==='warboss-1');
  Object.assign(boss,{x:12,z:-7,yaw:.625,elevation:1});
  await upload(fixture);
  await click('[data-tab=battle]');
  const original=await state();
  assert.deepEqual(original.rules,fixture.rules);
  const ids=original.pieces.map(p=>p.id);
  const draw=async()=>{
    await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    return js('({count:tabletopView.stats().visiblePieces,poses:'+positions(ids)+'})');
  };
  const oldScene=await draw();
  assert.equal(oldScene.count,original.pieces.filter(p=>!p.removed).length);
  assert.equal(oldScene.poses[captain.id],null);
  assert.ok(Math.abs(oldScene.poses[boss.id].x-boss.x)<.001);
  const unchanged=async()=>{
    const now=await state();
    for(const key of ['rules','pieces','layout','surface'])assert.deepEqual(now[key],original[key],key);
    return now.training;
  };
  async function verifyDuelScene(){
    const scene=await draw();
    assert.equal(scene.count,2);
    assert.deepEqual(await js('(()=>{const s=tabletopView.stats();return [s.boardPanels,s.boardWidth,s.boardDepth]})()'),[1,30,22]);
    assert.deepEqual(Object.keys(scene.poses).filter(id=>scene.poses[id]).sort(),participants);
    const [a,b]=participants.map(id=>scene.poses[id]);
    assert.ok(b.x<a.x&&Math.sin(a.yaw)<0&&Math.sin(b.yaw)>0,'Warboss starts on the left facing the Captain as pictured on p. 53');
    const contact=participants.reduce((sum,id)=>sum+catalog.find(p=>p.id===id).baseWidth/2,0);
    assert.ok(Math.abs(Math.hypot(a.x-b.x,a.z-b.z)-contact)<.015,'Bases must touch');
    assert.ok(Math.hypot((a.x+b.x)/2,(a.z+b.z)/2)<.25,'Duel must be centered');
    assert.deepEqual([a.elevation,b.elevation],[0,0]);
  }
  async function begin(){
    await click('#training-start');
    const t=await unchanged();
    assert.deepEqual([t.scenario,t.attacker,t.step,t.winner,t.wounds,t.rolls],
      [1,'orks','hit',null,{orks:6,marines:6},[]]);
    assert.ok(await js('document.querySelector("#training-roll").checkVisibility()'));
    assert.ok(await js('document.querySelector("#training-status").innerText.trim().length>0'));
    await verifyDuelScene();
  }
  async function roll(face,step,attacker){
    const before=await unchanged();
    await js('window.trainingAcceptanceRandom=Math.random;Math.random=()=>'+((face-.5)/6));
    try{await click('#training-roll');}
    finally{await js('Math.random=window.trainingAcceptanceRandom;delete window.trainingAcceptanceRandom');}
    const after=await unchanged();
    assert.equal(after.step,step);
    if(attacker)assert.equal(after.attacker,attacker);
    assert.equal(after.rolls.length,before.rolls.length+1);
    const dice=after.rolls.at(-1).dice;
    assert.ok(dice.length>0&&dice.every(d=>d===face));
    return after;
  }
  async function exported(){
    // Observe the Blob handed to the regular download button, including its
    // serialized training data. The subsequent upload uses the real file input.
    await js('window.trainingObjectURL=URL.createObjectURL;URL.createObjectURL=function(blob){window.trainingBlob=blob;return window.trainingObjectURL.call(URL,blob)}');
    try{
      await click('#save');
      return await js('window.trainingBlob.text().then(JSON.parse)');
    }finally{
      await js('URL.createObjectURL=window.trainingObjectURL;delete window.trainingObjectURL;delete window.trainingBlob');
    }
  }
  async function verifyWin(winner){
    const t=await unchanged(),loser=winner==='orks'?'marines':'orks';
    assert.equal(t.winner,winner);assert.equal(t.wounds[loser],0);
    const scene=await draw();
    assert.equal(scene.count,1);
    assert.deepEqual(Object.keys(scene.poses).filter(id=>scene.poses[id]),
      [winner==='orks'?'warboss-1':'captain-1']);
    const status=await js('document.querySelector("#training-status").innerText');
    assert.match(status,/승리/);
    assert.match(status,winner==='orks'?/워보스|오크/:/캡틴|마린/);
    assert.equal(await js('(()=>{const b=document.querySelector("#training-roll");return !!b&&!b.disabled&&b.checkVisibility()})()'),false);
  }
  async function checkReturned(){
    assert.ok(!(await unchanged()));
    assert.deepEqual(await draw(),oldScene);
    assert.deepEqual(await js('(()=>{const s=tabletopView.stats();return [s.boardPanels,s.boardWidth,s.boardDepth]})()'),[2,44,30]);
  }

  await begin();
  const afterMiss=await roll(1,'hit','marines');
  assert.deepEqual(afterMiss.wounds,{orks:6,marines:6});
  await roll(6,'wound','marines');
  const awaitingSave=await roll(6,'save','marines');
  const saved=await exported();
  assert.deepEqual(saved.training,awaitingSave);
  assert.deepEqual(saved.pieces,original.pieces);
  assert.deepEqual(saved.rules,original.rules);
  await click('#training-exit');await checkReturned();
  await upload(saved);
  assert.deepEqual(await unchanged(),awaitingSave);
  await reload();
  assert.deepEqual(await unchanged(),awaitingSave);
  await verifyDuelScene();
  const victory=await roll(1,'won');
  await verifyWin('marines');
  await click('#undo');assert.deepEqual(await unchanged(),awaitingSave);
  await click('#redo');assert.deepEqual(await unchanged(),victory);
  await click('#training-exit');await checkReturned();

  await begin();
  await roll(6,'wound','orks');await roll(6,'save','orks');await roll(1,'won');
  await verifyWin('orks');
  await click('#training-exit');await checkReturned();
  await upload(save);await click('[data-tab=battle]');
}
