import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {groupId} from './battle.mjs';
import {patrolSetupView} from './patrol-setup.mjs';

export async function checkPatrolSetup({save,upload,click,state,js,reload,onDeployment}){
  const pieces=createTable().pieces;
  const action=(name,filter='')=>'[data-act="'+name+'"]'+filter;
  const available=selector=>js('Array.from(document.querySelectorAll('+JSON.stringify(selector)+')).some(el=>!el.disabled && el.checkVisibility())');
  const current=async()=>(await state()).rules;
  const stage=async()=>patrolSetupView((await current()).officialSetup).stage;
  const formation=(name,team,filter='')=>click(action('form-'+name,'[data-team="'+team+'"]'+filter));
  const selectUnit=unit=>click(action('official-select','[data-unit="'+unit+'"]'));
  async function roll(name,dice){
    const selector=action('official-roll-'+name);
    await js(`(()=>{
      const el=document.querySelector(${JSON.stringify(selector)}), dice=${JSON.stringify(dice)};
      if(!el || el.disabled || !el.checkVisibility())throw Error("Roll unavailable: "+${JSON.stringify(name)});
      const original=Math.random;
      try{
        Math.random=()=>dice.length?(dice.shift()-.5)/6:original();
        el.click();
      }finally{Math.random=original;}
    })()`);
  }
  async function checkBoard(expected){
    const ids=pieces.map(p=>p.id);
    const board=await js(`(()=>{
      const ids=${JSON.stringify(ids)};
      return {visible:ids.filter(id=>tabletopView.pose(id)!==null),count:tabletopView.stats().visiblePieces};
    })()`);
    const visible=expected.map(p=>p.id).sort();
    assert.deepEqual(board.visible.sort(),visible,'Visible terrain and miniatures in the 3D scene');
    assert.equal(board.count,visible.length,'Each visible piece is rendered once');
  }
  const catalogTerrain=pieces.filter(p=>p.faction==='terrain');
  const terrain=catalogTerrain.filter(p=>p.id!=='shockArray-1');
  const privateControls='[data-act^="form-"][data-team="marines"]';
  await upload(save);
  await click('[data-tab=battle]');
  await click(action('official-new'));
  assert.equal(await stage(),'layout');
  await checkBoard(catalogTerrain);
  assert.equal(await available(action('start')),false);
  await roll('layout',[1]);
  await checkBoard(terrain);
  await roll('role',[3,3]);
  assert.deepEqual((await current()).officialSetup.roleRolls,[[3,3]]);
  assert.equal(await stage(),'role-roll');
  assert.equal(await available(action('official-defend')),false);
  await roll('role',[6,2]);
  assert.equal(await stage(),'role-choice');
  await click(action('official-defend'));
  let rules=await current();
  assert.equal(patrolSetupView(rules.officialSetup).defender,'marines');
  assert.equal(rules.formations.stage,'marines');
  await formation('attach','marines','[data-leader="librarian-1"][data-unit="intercessor"]');
  await formation('reserve','marines','[data-unit="landSpeeder"]');
  await formation('enhance','marines','[data-enhancement="veterans"]');
  await formation('lock','marines');
  const handoff=await current();
  assert.equal(handoff.formations.stage,'handoff');
  assert.deepEqual(handoff.attachments,{});
  assert.deepEqual(handoff.reserves,{});
  assert.deepEqual(handoff.patrol.enhanced,{});
  await reload();
  assert.deepEqual((await current()).formations,handoff.formations);
  assert.equal(await available(privateControls),false);
  await checkBoard(terrain);
  await formation('open','orks');
  assert.equal(await available(privateControls),false);
  await formation('enhance','orks','[data-enhancement="armour"]');
  await formation('lock','orks');
  rules=await current();
  assert.equal(await stage(),'deployment');
  assert.deepEqual(rules.attachments,{'librarian-1':'intercessor'});
  assert.deepEqual(rules.reserves,{landSpeeder:['landSpeeder-1']});
  assert.deepEqual(rules.patrol.enhanced,{veterans:true,armour:true});
  assert.equal(rules.deployment.next,'marines');
  assert.equal(await available(action('official-select','[data-unit="landSpeeder"]')),false);
  await checkBoard(terrain);

  const deployed=pieces.filter(p=>p.faction!=='terrain'&&p.id!=='landSpeeder-1');
  const exposed=groups=>[...terrain,...deployed.filter(p=>groups.includes(groupId(rules,p)))];
  const joint=exposed(['intercessor']);
  assert.equal(joint.length-terrain.length,6);
  await selectUnit('intercessor');
  assert.equal((await current()).deployment.pending,'intercessor');
  await checkBoard(joint);
  await click(action('official-place'));
  assert.deepEqual((await current()).deployment.placed,['intercessor']);
  await click('#undo');
  assert.deepEqual((await current()).deployment.placed,[]);
  assert.equal((await current()).deployment.pending,'intercessor');
  await checkBoard(joint);
  await click('#redo');
  await reload();
  assert.deepEqual((await current()).deployment.placed,['intercessor']);
  assert.equal((await current()).deployment.next,'orks');
  await checkBoard(joint);

  // The defender alternates with the attacker until one player runs out of units.
  const units=new Map(deployed.map(p=>[groupId(rules,p),p.faction]));
  const placed=['intercessor'];
  let next='orks';
  while(placed.length<units.size){
    const canPlace=[...units].filter(([id,team])=>team===next&&!placed.includes(id)).map(([id])=>id);
    const candidates=await js('Array.from(document.querySelectorAll('+JSON.stringify(action('official-select'))+
      ')).filter(el=>!el.disabled && el.checkVisibility()).map(el=>el.dataset.unit)');
    assert.deepEqual(candidates.sort(),canPlace.sort(),'Only the next player can choose an unplaced unit');
    const chosen=candidates[0];
    await selectUnit(chosen);
    placed.push(chosen);
    await checkBoard(exposed(placed));
    await click(action('official-place'));
    assert.deepEqual((await current()).deployment.placed,placed);
    const other=next==='marines'?'orks':'marines';
    if([...units].some(([id,team])=>team===other&&!placed.includes(id)))next=other;
  }
  assert.equal(await stage(),'first-roll');
  if(onDeployment)await onDeployment();
  assert.equal(await available(action('official-start')),false);
  assert.deepEqual((await current()).officialSetup.firstRolls,[]);
  await roll('first',[2,2]);
  assert.equal(await stage(),'first-roll');
  await roll('first',[1,5]);
  const ready=await current();
  assert.equal(patrolSetupView(ready.officialSetup).roleWinner,'marines');
  assert.deepEqual(ready.officialSetup.firstRolls,[[2,2],[1,5]]);
  assert.equal(patrolSetupView(ready.officialSetup).first,'orks');
  await click(action('official-start'));
  const started=await current();
  assert.deepEqual([started.status,started.rounds,started.round,started.step,started.first,started.active],
    ['playing',5,1,0,'orks','orks']);
  assert.equal(await available(action('next')),true);
  await checkBoard([...terrain,...deployed]);
  await click('#undo');
  assert.equal(await stage(),'ready');
  assert.equal((await current()).status,'setup');
  await click('#redo');
  await reload();
  assert.deepEqual(await current(),started);
  await upload(save);
  await click('[data-tab=battle]');
  assert.deepEqual(await current(),save.rules);
  assert.equal(await available(action('start')),true);
  await checkBoard(pieces.filter(p=>!save.pieces.find(s=>s.id===p.id).removed));
}
