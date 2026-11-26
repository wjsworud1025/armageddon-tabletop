import assert from 'node:assert/strict';
import test from 'node:test';
import {beginFightSequence,selectPatrolFight,transitionFight} from '../fight-sequence.mjs';
import {warbossFightBoard} from '../tests/fixtures/warboss-fight-board.mjs';
import {effectWeapon,fightSelectionTactic,tacticActive,useTactic} from './patrol.mjs';
import {useEpicChallenge} from './core-stratagems.mjs';
import {getProfile} from './profiles.mjs';
import {createTable} from '../data/catalog.mjs';
import {restore,snapshot} from '../state.mjs';

function ready(team){
  const game=warbossFightBoard();game.rules.active=team;
  const unit=team==='orks'?'boy-0':'captain';
  game.rules.units={[unit]:{charged:true}};
  let seq=beginFightSequence(game);
  for(let i=0;i<2;i++)seq=transitionFight(game,seq,{type:'pass'});
  game.rules.fightSequence=seq;
  return {game,unit};
}
test('an overrun charges the selected side before its extra pile-in and never repeats a legacy purchase',()=>{
  const {game,unit}=ready('orks');game.rules.active='marines';
  // The Ork unit charged. The defenders have moved away, leaving an overrun.
  for(const model of game.pieces.filter(p=>p.faction==='marines'))model.x+=10;
  const event={type:'select',unit,kind:'overrun'};
  const paid=selectPatrolFight(game,event,[],'crush');
  assert.deepEqual(paid.cp,{marines:1,orks:0});
  assert.equal(paid.fightSequence.active.extraPile,true);
  const committed={...game,rules:paid},checkpoint=snapshot(committed);
  const restored=restore(createTable(),checkpoint);
  assert.deepEqual(snapshot(restored),checkpoint);
  assert.throws(()=>selectPatrolFight(restored,event,[],'crush'));
});
test('old records of a melee attack close the purchase window even without an active declaration',()=>{
  const {game,unit}=ready('orks');
  const previous={...game.rules,units:{[unit]:{charged:true,attacks:{'boy-2':[{ranged:false,slot:'melee'}]}}}};
  assert.equal(fightSelectionTactic(previous,unit,'orks'),null);
  assert.throws(()=>selectPatrolFight({...game,rules:previous},{type:'select',unit,kind:'normal'},[],'crush'));
  previous.units[unit].attacks['boy-2'][0].ranged=true;
  assert.equal(fightSelectionTactic(previous,unit,'orks'),'crush');
});
for(const [team,key,actor] of [['orks','crush','boy-2'],['marines','precision','captain-1']]){
  test(key+' is optional at legal selection only, applies to the unit and survives a save',()=>{
    const {game,unit}=ready(team),event={type:'select',unit,kind:'normal'};
    const model=game.pieces.find(p=>p.id===actor),weapon=getProfile(model).weapons.find(w=>!w.range);
    assert.equal(fightSelectionTactic(game.rules,unit,team),key);
    assert.equal(useTactic(game.rules,key,unit,team,false),null);
    const free=selectPatrolFight(game,event,[],null);
    assert.equal(free.cp[team],1);assert.equal(tacticActive(free,key,unit),false);
    assert.equal(fightSelectionTactic(free,unit,team),null);
    assert.throws(()=>selectPatrolFight({...game,rules:free},event,[],key));
    assert.throws(()=>selectPatrolFight(game,event,[],team==='marines'?'crush':'precision'));
    const paid=selectPatrolFight(game,event,[],key);
    assert.equal(paid.cp[team],0);assert.equal(tacticActive(paid,key,unit),true);
    const character=team==='orks'?'warboss-1':'captain-1';
    assert.equal(useEpicChallenge({...paid,cp:{marines:2,orks:2}},game.pieces,character),null);
    assert.equal(tacticActive(paid,key,team==='orks'?'boy-1':'librarian'),false);
    const saved=snapshot({...game,rules:paid}),loaded=restore(createTable(),saved);
    assert.deepEqual(snapshot(loaded),saved);
    const enhanced=effectWeapon(loaded.rules,model,weapon,unit);
    if(key==='precision')assert.equal(enhanced.precision,true);
    else assert.equal(enhanced.strength,weapon.strength+1);
    for(const state of [{...game.rules,cp:{marines:0,orks:0}},
      {...game.rules,units:{[unit]:{charged:true,shocked:true}}},
      {...game.rules,patrol:{...game.rules.patrol,tactics:{med:'1-'+team+'-4/'+unit}}},
      {...game.rules,patrol:{...game.rules.patrol,spent:{[key]:'1-'+team+'-4'}}}]){
      assert.throws(()=>selectPatrolFight({...game,rules:state},event,[],key));
      assert.ok(selectPatrolFight({...game,rules:state},event,[],null));
    }
  });
}
