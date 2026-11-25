import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {newBattle,advance} from './battle.mjs';
import {validateRulesState} from './validate.mjs';
import {attachForDeployment,beginReinforcement,finishReinforcement} from './reinforcement-session.mjs';

test('joining and leaving a reserved bodyguard keeps its leader on the same side of the table',()=>{
  const game={...createTable(),rules:newBattle()};
  const leader=game.pieces.find(p=>p.kind==='librarian');
  const ids=game.pieces.filter(p=>p.kind==='intercessor').map(p=>p.id);
  game.rules.reserves.intercessor=ids;
  const joined=attachForDeployment(game,leader,'intercessor');
  assert.deepEqual(joined.rules.reserves.intercessor,[...ids,leader.id]);
  assert.equal(joined.removed[leader.id],true);
  const split=attachForDeployment({...game,rules:joined.rules},leader,'');
  assert.deepEqual(split.rules.reserves.intercessor,ids);
  assert.deepEqual(split.rules.reserves.librarian,[leader.id]);
  const atCap={...joined.rules,reserves:{...joined.rules.reserves,captain:['captain-1']}};
  assert.throws(()=>attachForDeployment({...game,rules:atCap},leader,''),/한도/);
  assert.deepEqual(atCap.reserves.intercessor,[...ids,leader.id]);
});

test('reserve draft is round-trippable and cannot switch players or advance a phase',()=>{
  const game={...createTable(),rules:{...newBattle(),status:'playing',round:2,step:1,reserves:{captain:['captain-1']}}};
  const captain=game.pieces.find(p=>p.kind==='captain');
  captain.removed=true;
  const draft=beginReinforcement(game,'captain');
  assert.equal(draft.poses[captain.id].removed,false);
  assert.ok(validateRulesState(draft.rules));
  assert.equal(validateRulesState({...draft.rules,active:'orks'}),false);
  assert.equal(validateRulesState({...draft.rules,reserves:{}}),false);
  assert.equal(advance(draft.rules),draft.rules);
  const canceled=finishReinforcement({...game,rules:draft.rules},true);
  assert.deepEqual(canceled.rules.reserves,game.rules.reserves);
  assert.equal(canceled.poses[captain.id].removed,true);
});
