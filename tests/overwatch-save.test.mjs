import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {restore,snapshot} from '../state.mjs';
import {advance,newBattle,startBattle} from '../rules/battle.mjs';
import {beginOverwatch,declineOverwatch} from '../rules/overwatch.mjs';
import {setPatrolSight} from '../rules/patrol-sight.mjs';
import {appendSightedDeclaration,lockSightedDeclaration,resolvePacket} from '../rules/declarations.mjs';
import {rollHazardPool} from '../rules/hazard-reroll.mjs';
import {inspectAttackRoll,stepAttackRoll} from '../rules/attack-rolls.mjs';
import {validateRulesState} from '../rules/validate.mjs';
import {beginMove} from '../move-session.mjs';
import {beginReinforcement} from '../rules/reinforcement-session.mjs';

const shooter='vanguard-4',target='warboss-1';
function fixture(){
  const game={...createTable(),logs:[],rules:advance(startBattle(newBattle(),'orks',5))};
  for(const piece of game.pieces){
    if(piece.faction==='terrain')continue;
    piece.removed=![shooter,target,'captain-1'].includes(piece.id);
    piece.x=piece.id===target?4:-3;piece.z=piece.id==='captain-1'?-3:0;
  }
  return game;
}
function roundTrip(game,rules){
  assert.ok(rules);
  const save=JSON.parse(JSON.stringify(snapshot({...game,rules})));
  const resumed=restore(createTable(),save);
  assert.deepEqual(resumed.rules,rules);
  return resumed.rules;
}
const plasma={actor:shooter,weapon:1,target:'warboss',preferred:target,distance:7,size:1,assigned:0,hit:0,wound:0,
  extra:0,cover:false,lethal:false,sustained:false,ignore:false,guard:false};
function declare(game){
  const p=game.pieces,offer=advance(game.rules,p);
  const selected=beginOverwatch(offer,p,'vanguard');
  const sight=setPatrolSight(selected,p,shooter,target,'visible');
  return appendSightedDeclaration(sight,p,[plasma]);
}

test('movement ends only once, with a free decline or one paid unit and no change of turn',()=>{
  const game=fixture(),p=game.pieces,old=structuredClone(game.rules);
  assert.deepEqual(roundTrip(game,game.rules),old);
  const offered=advance(game.rules,p);
  assert.deepEqual(offered.overwatch,{stage:'offer',team:'marines',unit:null});
  assert.equal(advance(offered,p),offered);
  let reviewed=setPatrolSight(offered,p,'captain-1',target,'blocked');
  reviewed=roundTrip(game,setPatrolSight(reviewed,p,shooter,target,'visible'));
  const skipped=advance(roundTrip(game,declineOverwatch(reviewed)),p);
  assert.equal(skipped.step,2);assert.equal(skipped.cp.marines,1);
  assert.equal(skipped.shootingSight,undefined);assert.equal(skipped.overwatch,undefined);
  const paid=roundTrip(game,beginOverwatch(reviewed,p,'vanguard'));
  assert.equal(paid.active,'orks');assert.deepEqual(paid.cp,{marines:0,orks:1});
  assert.deepEqual(Object.keys(paid.shootingSight.pairs),[shooter]);
  assert.equal(advance(paid,p),paid);assert.equal(beginOverwatch(paid,p,'captain'),null);
  const passed=roundTrip(game,declineOverwatch(paid)),next=roundTrip(game,advance(passed,p));
  assert.equal(next.step,2);assert.equal(next.overwatch,undefined);assert.equal(next.shootingSight,undefined);
  assert.equal(next.patrol.tactics['overwatch-marines'],'1-orks-1/vanguard');
  assert.deepEqual(game.rules,old);
  assert.equal(advance({...old,cp:{orks:1,marines:0}},p).step,2);
  for(const field of ['movePlan','reinforcePlan','hazard','chargePlan','fightPlan','reactionPlan']){
    const pending={...old,[field]:{}};assert.equal(advance(pending,p),pending);
  }
});

test('a locked plasma declaration resumes once, resolves hazard before normal shooting, without spending the unit activation',()=>{
  const game=fixture(),p=game.pieces,draft=roundTrip(game,declare(game));
  const locked=roundTrip(game,lockSightedDeclaration(draft,p));
  assert.equal(locked.declaration.mode,'overwatch');assert.equal(declineOverwatch(locked),null);
  const shot=resolvePacket(locked,p,0,null,()=>0);
  const pending=roundTrip(game,shot.state);
  assert.equal(shot.result.hits,0);assert.equal(pending.hazard.unit,'vanguard');
  assert.equal(pending.overwatch.stage,'done');assert.equal(advance(pending,p),pending);
  const complete=roundTrip(game,rollHazardPool(pending,p,()=>0).state);
  assert.equal(complete.hp[shooter],1);assert.equal(complete.units.vanguard?.finishedAttack,undefined);
  const next=advance(complete,p);assert.equal(next.step,2);assert.equal(next.active,'orks');
  assert.equal(next.overwatch,undefined);assert.equal(next.cp.marines,0);
});

test('edited windows, declarations, contradictory stratagem receipts and out-of-turn sight are rejected on import',()=>{
  const game=fixture(),p=game.pieces,offered=advance(game.rules,p);
  function reject(state,edits){
    for(const edit of edits){
      const bad=structuredClone(state);edit(bad);
      assert.equal(validateRulesState(bad,p),false,String(edit));
      const save=snapshot(game);save.rules=bad;assert.throws(()=>restore(createTable(),save),/규칙/);
    }
  }
  reject(offered,[r=>r.step=2,r=>r.active='marines',r=>r.status='finished',r=>r.cp.marines=0,
    r=>r.overwatch.unit='vanguard',r=>r.hazard={unit:'vanguard',count:1}]);
  const locked=lockSightedDeclaration(declare(game),p);
  reject(locked,[r=>delete r.overwatch,r=>delete r.patrol.spent['overwatch-marines'],r=>r.overwatch.stage='done',
    r=>r.overwatch.unit='captain',r=>delete r.declaration.mode,r=>r.units.vanguard={shocked:true},
    r=>r.shootingSight.pairs[shooter][target]='blocked',r=>r.declaration.rows[0].plunging=true,
    r=>r.patrol.tactics['commandReroll-marines']='1-orks-1/vanguard',
    r=>r.declaration.rows[0].distance=60,r=>r.declaration.rows[0].weapon=2,
    r=>r.declaration.rows.push({...r.declaration.rows[0]})]);
  const done=advance(declineOverwatch(beginOverwatch(offered,p,'vanguard')),p);
  reject(done,[r=>r.patrol.spent['overwatch-marines']='1-marines-1',
    r=>r.patrol.tactics['overwatch-marines']='1-orks-1/warboss',r=>r.step=1,r=>r.step=0]);
});

test('overwatch resumes at the moving player’s saving throw and preserves that phase’s command reroll',()=>{
  const g=fixture(),p=g.pieces,locked=lockSightedDeclaration(declare(g),p);
  const out=stepAttackRoll(locked,p,0,{type:'begin'},()=>.99);
  const resumed=roundTrip(g,out.state);
  const event=inspectAttackRoll(resumed,p);
  assert.equal(event.kind,'save');assert.equal(event.team,'orks');
  assert.deepEqual(event.raw,[6]);assert.equal(advance(resumed,p),resumed);
  const finish=stepAttackRoll(resumed,p,0,{type:'reroll',index:0},()=>0);
  const done=roundTrip(g,finish.state);
  assert.deepEqual(done.cp,{orks:0,marines:0});
  assert.equal(done.patrol.tactics['commandReroll-orks'],'1-orks-1/warboss');
  assert.equal(done.hazard.count,1);assert.equal(done.hp[target],4);
  for(const field of ['commandDice','dice']){
    const bad=structuredClone(done);
    if(field==='commandDice')bad.hazard.commandDice=[1];
    else bad.hazard={...bad.hazard,count:2,dice:[1,1],remaining:2};
    assert.equal(validateRulesState(bad,p),false);
  }
  const save=JSON.parse(JSON.stringify(snapshot({...g,rules:done})));
  save.pieces.find(t=>t.id===shooter).x=100;
  assert.throws(()=>restore(createTable(),save),/경계 사격/);
});

test('neither a new move nor a reinforcement can reopen the movement phase after the end-of-phase window',()=>{
  const game=fixture(),p=game.pieces;
  const base={...game.rules,round:2,reserves:{weirdboy:['weirdboy-1']}};
  assert.ok(beginReinforcement({...game,rules:base},'weirdboy'));
  const offer=advance(base,p),paid=beginOverwatch(offer,p,'vanguard');
  for(const rules of [offer,paid,declineOverwatch(paid)]){
    assert.throws(()=>beginMove({...game,rules},target,'remain'),/경계 사격/);
    assert.throws(()=>beginReinforcement({...game,rules},'weirdboy'),/경계 사격/);
  }
});
