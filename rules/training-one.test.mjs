import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrainingOne, rollTrainingOne, trainingOneView, validateTrainingOne} from './training-one.mjs';

function roll(state, values) {
  let used = 0;
  const next = rollTrainingOne(state, () => values[used++]);
  assert.equal(used, values.length);
  assert.ok(validateTrainingOne(JSON.parse(JSON.stringify(next))));
  return next;
}

test('the Warboss begins the duel, and only hits and wounds are handed to the next player', () => {
  let state = createTrainingOne();
  function check(actor, step, count, threshold) {
    const view = trainingOneView(state);
    assert.deepEqual([view.actor, view.step, view.count, view.threshold], [actor, step, count, threshold]);
  }
  check('orks', 'hit', 4, 3);
  state = roll(state, [1, 2, 3, 6]);
  check('orks', 'wound', 2, 2);
  state = roll(state, [1, 2]);
  check('marines', 'save', 1, 4);
  state = roll(state, [3]);
  assert.deepEqual(state.wounds, {orks: 6, marines: 4});
  check('marines', 'hit', 5, 2);
  state = roll(state, [1, 2, 3, 4, 5]);
  check('marines', 'wound', 4, 4);
  state = roll(state, [2, 3, 4, 6]);
  check('orks', 'save', 2, 6);
  state = roll(state, [5, 6]);
  check('orks', 'hit', 4, 3);
  assert.deepEqual(state.wounds, {orks: 4, marines: 4});
});

test('an empty pool skips to the other champion, and successful saves prevent damage', () => {
  let state = roll(createTrainingOne(), [1, 1, 2, 2]);
  assert.equal(state.attacker, 'marines');
  state = roll(state, [1, 1, 1, 1, 2]);
  state = roll(state, [3]);
  assert.equal(state.attacker, 'orks');
  state = roll(state, [1, 1, 1, 3]);
  state = roll(state, [6]);
  state = roll(state, [4]);
  assert.deepEqual(state.wounds, {orks: 6, marines: 6});
  assert.equal(state.attacker, 'marines');
});

test('each side can win immediately and overflow damage cannot continue the duel', () => {
  for (const winner of ['orks', 'marines']) {
    let state = createTrainingOne();
    if (winner === 'marines') state = roll(state, [1, 1, 1, 1]);
    const dice = Array(trainingOneView(state).count).fill(6);
    state = roll(state, dice);
    state = roll(state, dice);
    state = roll(state, dice.map(() => 1));
    assert.equal(state.winner, winner);
    const view = trainingOneView(state);
    assert.deepEqual([view.step, view.actor, view.count, view.threshold], ['won', null, 0, null]);
    assert.equal(Math.min(state.wounds.orks, state.wounds.marines), 0);
    assert.throws(() => rollTrainingOne(state, () => 6));
  }
});

test('saved wounds, rolls, acting side, sequence and winner agree with the complete dice record', () => {
  const initial = createTrainingOne();
  const state = roll(initial, [2, 3, 4, 5]);
  assert.deepEqual(initial, createTrainingOne());
  for (const change of [
    {version: 7}, {scenario: 2}, {wounds: {orks: 0, marines: 6}},
    {attacker:'marines'}, {step:'save'}, {rolls:[]}, {winner:'orks'}
  ]) assert.equal(validateTrainingOne({...state, ...change}), false);
  const corrupt = structuredClone(state);
  corrupt.rolls[0].dice[0] = 7;
  assert.equal(validateTrainingOne(corrupt), false);
  for (const bad of [null, undefined, [], {}, 'duel']) assert.equal(validateTrainingOne(bad), false);
  for (const invalid of [0, 7, 1.2, '6']) assert.throws(() => rollTrainingOne(initial, () => invalid));
  assert.deepEqual(initial, createTrainingOne());
});
