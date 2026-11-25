import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {baseDistance} from '../state.mjs';
import {beginCharge,selectChargeTargets,proposeCharge,finishCharge} from '../charge-session.mjs';
import {beginFightSequence,transitionFight} from '../fight-sequence.mjs';
import {newBattle,startBattle,advance} from './battle.mjs';
import {mountRules} from './panel.mjs';
import {resolvePacket} from './declarations.mjs';
import {validateRulesState} from './validate.mjs';

const boss='warboss-1',vet='vanguard-1',rifle='intercessor-1';
const restore=s=>JSON.parse(JSON.stringify(s));

function battlefield({blades=true,charge=true,lateVeterans=false}={}){
  const layout={[boss]:[charge?0:4.4,charge?0:1.4],[vet]:[lateVeterans?9:6,0],[rifle]:[6,3]};
  const pieces=createTable().pieces.filter(p=>Object.hasOwn(layout,p.id)).map(p=>({...p,x:layout[p.id][0],z:layout[p.id][1]}));
  const rules={...startBattle(newBattle(),'orks',5),step:3};
  rules.patrol.enhanced={blades};
  const game={width:44,depth:30,pieces,rules};
  const actor=pieces.find(p=>p.id===boss);
  function apply(move){
    game.rules=move.rules;
    for(const [id,pose] of Object.entries(move.poses??{}))Object.assign(pieces.find(p=>p.id===id),pose);
  }
  if(charge){
    apply(beginCharge(game,actor,{dice:[4,3]}));
    apply(selectChargeTargets(game,lateVeterans?['intercessor']:['vanguard','intercessor']));
    apply(proposeCharge(game,actor,{[boss]:[{x:4.4,z:1.4}]}));
    apply(finishCharge(game));assert.equal(game.rules.units.warboss.charged,true);
  }
  if(lateVeterans){
    const veterans=pieces.find(p=>p.id===vet);
    assert.ok(baseDistance(actor,veterans)>2);
    apply(beginCharge(game,veterans,{mode:'leapToDefend',endOfPhase:true,dice:[4,3]}));
    apply(selectChargeTargets(game,['warboss']));
    apply(proposeCharge(game,veterans,{[vet]:[{x:6,z:0}]}));apply(finishCharge(game));
    assert.ok(baseDistance(actor,veterans)<=2);
  }
  game.rules=advance(game.rules);
  let sequence=beginFightSequence(game);
  for(let i=0;i<2;i++)sequence=transitionFight(game,sequence,{type:'pass'});
  game.rules.fightSequence=transitionFight(game,sequence,{type:'select',unit:'warboss'});
  return game;
}

// The mounted rules panel calculates the modifier when an attack is declared.
// Supply its event handlers with the same fighter, target, allocation and lock
// actions as the UI. Rendering HTML and measuring layout are outside this test.
function declareSplit(game){
  const listeners={},fields={};
  const root={addEventListener(name,fn){listeners[name]=fn;},
    querySelector(selector){const field=/^\[data-field="([^"]+)"\]$/.exec(selector)?.[1];return fields[field]??null;},
    remove(){}};
  const previous=globalThis.document;
  globalThis.document={createElement:()=>root,querySelector:()=>({})};
  const by=id=>game.pieces.find(p=>p.id===id);
  const selection=by(boss);
  const click=action=>listeners.click({target:{closest:()=>({dataset:{act:action}})}});
  const input=(key,value)=>{
    fields[key]={dataset:{field:key},value:String(value),type:'select-one'};
    listeners.change({target:fields[key]});
  };
  try{
    const panel=mountRules({replaceChildren(){}},{
      getRulesState:()=>game.rules,getTable:()=>game,getPieces:()=>game.pieces,getSelection:()=>selection,
      getDistance:(a,b)=>baseDistance(by(a),by(b)),onChange:()=>()=>{},
      commitRules:rules=>{game.rules=rules;},
    });
    for(const id of [vet,rifle]){
      input('target',id);input('allocation',3);click('attack');
    }
    click('lock');panel.destroy();
    assert.equal(game.rules.declaration.locked,true);
    return game.rules;
  }finally{
    if(previous===undefined)delete globalThis.document;else globalThis.document=previous;
  }
}

test('July Blade Masters protects only attacks allocated to the upgraded Veterans, including after a saved split charge',()=>{
  const game=battlefield(),locked=restore(declareSplit(game));
  assert.equal(validateRulesState(locked,game.pieces),true);
  assert.deepEqual(locked.declaration.rows.map(r=>[r.target,r.assigned,r.wound]),[['vanguard',3,-1],['intercessor',3,0]]);
  assert.deepEqual(locked.cp,{marines:1,orks:1});
  // S8 versus T4 wounds on an unmodified 2. The identical three hit/wound
  // rolls must fail against the protected unit and succeed against the other.
  function rng(...dice){return ()=>{assert.ok(dice.length);return (dice.shift()-.5)/6;};}
  const protectedUnit=resolvePacket(locked,game.pieces,0,null,rng(4,2,4,2,4,2));
  assert.equal(protectedUnit.result.hits,3);assert.equal(protectedUnit.result.wounds,0);
  const other=resolvePacket(restore(protectedUnit.state),game.pieces,1,null,rng(4,2,6,4,2,6,4,2,6));
  assert.equal(other.result.hits,3);assert.equal(other.result.wounds,3);assert.equal(other.finished,true);
});
test('an engaged enemy that did not charge, or Veterans without the enhancement, has ordinary wound rolls on both targets',()=>{
  for(const config of [{charge:false},{blades:false}]){
    const game=battlefield(config);
    assert.deepEqual(declareSplit(game).declaration.rows.map(r=>r.wound),[0,0]);
  }
});

test('Veterans intervening after the enemy finished its charge still get the printed protection at targeting',()=>{
  const game=battlefield({lateVeterans:true});
  const locked=declareSplit(game);
  assert.deepEqual(locked.declaration.rows.map(r=>[r.target,r.wound]),[['vanguard',-1],['intercessor',0]]);
  assert.deepEqual(locked.cp,{orks:1,marines:0}); // The intervention spent the Marine CP.
});
