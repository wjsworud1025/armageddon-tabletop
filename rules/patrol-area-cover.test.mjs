import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {layoutGeometry} from '../layouts.mjs';
import {newBattle, startBattle} from './battle.mjs';
import {patrolAreaCover} from './patrol-area-cover.mjs';

const roster = createTable().pieces;
const at = (id, x, z) => ({...roster.find(p => p.id === id), x, z, yaw: 0});
const game = pieces => ({
  pieces, layout: {map: 'A', blue: 'marines'}, rules: {...startBattle(newBattle(), 'marines', 5), step: 2}
});
const home = [-15.46, -6.18];
const outside = [-20.78, 13.75];
const empty = {automatic: false, models: []};

test('all ten printed areas can give an infantry model cover, including six non-objectives on each layout', () => {
  for (const map of ['A', 'B', 'C']) {
    const layout = layoutGeometry(map);
    for (const area of layout.terrainAreas) {
      const centre = layout.terrain.find(t => t.id === area.terrainIds[0]);
      const grot = at('gretchin-1', centre.x, centre.z);
      const state = game([grot]);
      state.layout.map = map;
      assert.deepEqual(patrolAreaCover(state, [grot.id]), {
        automatic: true, models: [{id: grot.id, eligible: true, areas: [{id: area.id, name: area.name}]}]
      }, map + ' ' + area.id);
    }
  }
});

test('13.08 checks every live model in the attached target unit, including members in another mat', () => {
  const a = at('intercessor-1', ...home);
  const b = at('intercessor-2', ...home);
  const leader = at('librarian-1', ...outside);
  const otherUnit = at('vanguard-1', ...outside);
  const table = game([a, b, leader, otherUnit]);
  table.rules.attachments[leader.id] = 'intercessor';

  // A caller may pass only the visible bodyguard as the target seed.
  const partial = patrolAreaCover(table, [a]);
  assert.equal(partial.automatic, false);
  assert.deepEqual(partial.models.map(m => [m.id, m.eligible]), [[a.id, true], [b.id, true], [leader.id, false]]);
  const neutral = layoutGeometry('A').terrain.find(p => p.id === 'largeRuin-3');
  leader.x = neutral.x;
  leader.z = neutral.z;
  const covered = patrolAreaCover(table, [leader.id, b.id]);
  assert.equal(covered.automatic, true);
  assert.deepEqual(covered.models.map(m => m.areas[0].id), ['blue-home', 'blue-home', 'neutral-1']);

  leader.x = outside[0];
  leader.z = outside[1];
  table.rules.hp[leader.id] = 0;
  assert.deepEqual(patrolAreaCover(table, a.id).models.map(m => m.id), [a.id, b.id]);
  table.rules.hp[leader.id] = 1;
  table.rules.reserves.intercessor = [leader.id];
  assert.equal(patrolAreaCover(table, b.id).automatic, true);
  assert.deepEqual(patrolAreaCover(table, leader.id), empty);
  delete table.rules.reserves.intercessor;
  leader.removed = true;
  assert.equal(patrolAreaCover(table, b.id).automatic, true);
  assert.deepEqual(patrolAreaCover(table, [a, otherUnit]), empty);
});

test('partial base overlap and the yaw of oval bases are respected independently of model keywords', () => {
  // Straight edge of A's home mat is image v=531. Increasing world X leaves the mat.
  const edgeX = (531 - 154) * 44 / 1654 - 22;
  const grot = at('gretchin-1', edgeX, home[1]);
  grot.x += grot.baseWidth / 2 - .02;
  const table = game([grot]);
  assert.equal(patrolAreaCover(table, grot.id).automatic, true);
  grot.x += .04;
  assert.equal(patrolAreaCover(table, grot.id).automatic, false);
  for (const id of ['landSpeeder-1', 'wartrakk-1']) {
    const vehicle = at(id, edgeX + 1.65, home[1]);
    const board = game([vehicle]);
    assert.deepEqual(patrolAreaCover(board, vehicle).models[0].areas, []);
    vehicle.yaw = Math.PI / 2;
    const covered = patrolAreaCover(board, [vehicle]);
    assert.equal(covered.automatic, false, id);
    assert.equal(covered.models[0].eligible, false, id);
    assert.deepEqual(covered.models[0].areas.map(a => a.id), ['blue-home']);
  }
});

test('training, display, missing maps and empty targets retain manual cover; evaluation is read-only', () => {
  const target = at('captain-1', ...home);
  const table = game([target]);
  const snapshot = structuredClone(table);
  assert.equal(patrolAreaCover(table, target).automatic, true);
  assert.deepEqual(table, snapshot);
  for (const board of [{...table, training: {scenario: 4}}, {...table, rules: newBattle()},
    {...table, layout: null}, {...table, layout: {map: 'custom'}}]) {
    assert.deepEqual(patrolAreaCover(board, target), empty);
  }
  assert.deepEqual(patrolAreaCover(table, []), empty);
  assert.deepEqual(patrolAreaCover(table, 'missing'), empty);
});
