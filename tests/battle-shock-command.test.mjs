import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {layoutGeometry,layoutScenery,objectiveAreas} from '../layouts.mjs';
import {measureFootprints} from '../ruler.mjs';
import {restore,snapshot} from '../state.mjs';
import {newBattle,startBattle,advance} from '../rules/battle.mjs';
import {mountRules} from '../rules/panel.mjs';
import {patrolTerrainPlacement} from '../rules/patrol-terrain-placement.mjs';

const speeder='landSpeeder-1',boss='warboss-1';
function battlefield(){
  const game={...createTable(),layout:{map:'A',blue:'marines'},logs:[]};
  game.rules={...startBattle(newBattle(),'marines',5),round:4,hp:{[speeder]:4}};
  for(const [terrain,pose] of layoutScenery(game,layoutGeometry('A')))Object.assign(terrain,pose);
  for(const p of game.pieces){
    if(p.faction==='terrain')continue;
    p.removed=p.id!==speeder&&p.id!==boss;
    if(!p.removed)Object.assign(p,{x:p.id===speeder?-18:3,z:p.id===speeder?-8:13,yaw:0,elevation:0});
  }
  const vehicle=game.pieces.find(p=>p.id===speeder);
  assert.ok(objectiveAreas(game).find(a=>a.id==='blue-home').members.includes(speeder));
  assert.ok(!patrolTerrainPlacement(vehicle,game.pieces.filter(p=>p.faction==='terrain'&&!p.removed)).error);
  return game;
}

// Only the HTML host and event transport are substituted. The buttons, form
// handler, objective membership, mission scoring and save loader are the game’s.
function panel(t,game,selected=speeder){
  const listeners={},root={addEventListener:(name,handler)=>{listeners[name]=handler;},querySelector:()=>null,remove(){}};
  const previous=globalThis.document;
  globalThis.document={createElement:()=>root,querySelector:()=>true};
  t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
  const get=id=>game.pieces.find(p=>p.id===id);
  const view=mountRules({replaceChildren(){}},{
    getSelection:()=>get(selected),selectPiece:id=>{selected=id;},getRulesState:()=>game.rules,
    getTable:()=>game,getPieces:()=>game.pieces,getObjectiveAreas:()=>objectiveAreas(game),
    getDistance:(a,b)=>measureFootprints(get(a),get(b)).distance,onChange:()=>()=>{},
    commitRules(rules,changes,message){
      game.rules=rules;for(const [id,removed] of Object.entries(changes))get(id).removed=removed;
      game.logs.push(message);
    }
  });
  t.after(()=>view.destroy());
  const tag=act=>root.innerHTML.match(new RegExp('<button[^>]*data-act="'+act+'"[^>]*>'))?.[0];
  const dispatch=act=>listeners.click({target:{closest:()=>({dataset:{act}})}});
  const enabled=act=>!!tag(act)&&!tag(act).includes('disabled');
  return {enabled,dispatch,pending(){return [...root.innerHTML.matchAll(/data-act="select-shock-([^"]+)"/g)].map(m=>m[1]);},
    click(act){assert.ok(enabled(act),act+' is available');dispatch(act);},
    select(id){selected=id;view.refresh();},
    load(save){Object.assign(game,restore(createTable(),structuredClone(save)));view.refresh();}};
}
function withDice(dice,action){
  const previous=Math.random;let i=0;
  Math.random=()=>{assert.ok(i<dice.length,'unexpected die');return (dice[i++]-.5)/6;};
  try{action();assert.equal(i,dice.length);}finally{Math.random=previous;}
}

for(const [label,dice,shocked,points] of [
  ['exactly meeting Ld 6+ earns 5 VP',[3,3],false,5],['a failed test earns 0 VP',[1,1],true,0]
]){
  test('at the Marine home objective in round four, '+label,t=>{
    const game=battlefield(),ui=panel(t,game);
    const original=snapshot(game);
    assert.ok(!ui.enabled('next'));
    ui.dispatch('next');assert.deepEqual(snapshot(game),original,'a stale Next event cannot commit scores or change phase');
    assert.strictEqual(advance(game.rules,game.pieces),game.rules);
    ui.load(original);assert.ok(!ui.enabled('next'));
    withDice(dice,()=>ui.click('shock'));
    assert.equal(game.rules.units.landSpeeder.shockChecked,true);
    assert.equal(game.rules.units.landSpeeder.shocked,shocked);
    assert.equal(game.rules.step,0);assert.equal(game.rules.vp.marines,0);
    const checked=snapshot(game);ui.load(checked);
    assert.ok(!ui.enabled('shock'));assert.ok(ui.enabled('next'));
    withDice([],()=>ui.dispatch('shock'));assert.deepEqual(snapshot(game),checked);
    ui.load(original);assert.ok(ui.enabled('shock'));assert.ok(!ui.enabled('next'));
    ui.load(checked);ui.click('next');
    assert.equal(game.rules.step,1);assert.equal(game.rules.vp.marines,points);
    const home=game.rules.objectives['blue-home'];
    assert.equal(home.marineOC,shocked?0:3);assert.equal(home.owner,shocked?null:'marines');
    ui.load(snapshot(game));assert.equal(game.rules.vp.marines,points);
    // Cross an actual opponent turn before checking that this below-half
    // vehicle owes a new test on the following Marine player's turn.
    for(let i=0;i<13&&game.rules.round===4;i++){
      if(game.rules.overwatch?.stage==='offer')ui.click('overwatch-decline');
      else ui.click('next');
      assert.equal(game.rules.vp.marines,points,'the same scoring window paid twice');
      if(game.rules.active==='orks')assert.ok(!game.rules.units.landSpeeder?.shockChecked);
    }
    assert.equal(game.rules.round,5);assert.equal(game.rules.active,'marines');assert.equal(game.rules.step,0);
    ui.select(speeder);assert.ok(ui.enabled('shock'));assert.ok(!ui.enabled('next'));
  });
}

test('successful Insane Bravery completes one required test with one CP, including after reload',t=>{
  const game=battlefield(),ui=panel(t,game);
  withDice([],()=>ui.click('insane-bravery'));
  assert.deepEqual(game.rules.cp,{marines:0,orks:1});
  assert.equal(game.rules.units.landSpeeder.shockChecked,true);assert.equal(game.rules.units.landSpeeder.shocked,false);
  const checked=snapshot(game);ui.load(checked);
  withDice([],()=>{ui.dispatch('shock');ui.dispatch('insane-bravery');});
  assert.deepEqual(snapshot(game),checked);
  ui.click('next');assert.equal(game.rules.vp.marines,5);
});

test('two Ork units must each test: a previously shocked healthy boss and a Gretchin unit at exactly half strength',t=>{
  const game=battlefield();
  game.rules={...game.rules,active:'orks',units:{warboss:{shocked:true}}};
  for(let i=1;i<=5;i++){
    const member=game.pieces.find(p=>p.id==='gretchin-'+i);
    Object.assign(member,{removed:false,x:i*1.2,z:9,elevation:0});
  }
  const ui=panel(t,game,boss);
  assert.ok(!ui.enabled('next'));withDice([6,6],()=>ui.click('shock'));
  assert.equal(game.rules.units.warboss.shockChecked,true);assert.equal(game.rules.units.warboss.shocked,false);
  assert.ok(!ui.enabled('next'));const partial=snapshot(game);ui.load(partial);
  ui.dispatch('next');assert.deepEqual(snapshot(game),partial);
  ui.select('gretchin-2');withDice([1,1],()=>ui.click('shock'));
  assert.equal(game.rules.units.gretchin.shockChecked,true);assert.equal(game.rules.units.gretchin.shocked,true);
  assert.ok(ui.enabled('next'));ui.click('next');assert.equal(game.rules.step,1);
  assert.equal(game.rules.units.landSpeeder?.shockChecked,undefined,'the other player’s wounded vehicle owes no test this turn');
});

test('an attached unit has one command test and shocked reserves remain addressable through the roster',t=>{
  const game=battlefield();
  game.rules.hp[speeder]=5;
  game.rules.attachments={'captain-1':'intercessor'};
  const detachment=['captain-1','intercessor-1','intercessor-2'];
  for(const [i,id] of detachment.entries()){
    const p=game.pieces.find(m=>m.id===id);
    Object.assign(p,{removed:false,x:-5+i*1.5,z:4,yaw:0,elevation:0});
  }
  const reservists=game.pieces.filter(m=>m.kind==='vanguard').map(m=>m.id);
  game.rules.reserves={vanguard:reservists,librarian:['librarian-1']};
  game.rules.units={vanguard:{shocked:true}};
  const ui=panel(t,game),pending=ui.pending();
  assert.equal(pending.length,2,'the full reserve Librarian, destroyed units and the 5/9-wound Speeder are excluded');
  const bodyguard=pending.find(id=>detachment.includes(id)),reserve=pending.find(id=>reservists.includes(id));
  assert.ok(bodyguard);assert.ok(reserve);
  ui.click('select-shock-'+bodyguard);withDice([4,4],()=>ui.click('shock'));
  assert.equal(game.rules.units.intercessor.shockChecked,true);
  assert.equal(game.rules.units.captain?.shockChecked,undefined);
  const partial=snapshot(game);ui.load(partial);assert.deepEqual(ui.pending(),[reserve]);
  ui.click('select-shock-'+reserve);withDice([1,1],()=>ui.click('shock'));
  assert.equal(game.rules.units.vanguard.shockChecked,true);assert.equal(game.rules.units.vanguard.shocked,true);
  assert.deepEqual(game.rules.reserves.vanguard,reservists);
  assert.ok(game.pieces.filter(p=>reservists.includes(p.id)).every(p=>p.removed));
  assert.deepEqual(ui.pending(),[]);assert.ok(ui.enabled('next'));ui.click('next');assert.equal(game.rules.step,1);
});
