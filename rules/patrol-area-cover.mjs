import {layoutGeometry, overlapsArea} from '../layouts.mjs';
import {currentHP, groupId} from './battle.mjs';
import {getProfile} from './profiles.mjs';

// The two starter patrols field INFANTRY models from these datasheets.
// Neither has BEASTS or SWARM. The Land Speeder is a VEHICLE and the
// Wartrakk is MOUNTED. An attached unit does not give a model a new keyword.
const infantry = new Set([
  'captain', 'librarian', 'intercessor', 'vanguard',
  'warboss', 'weirdboy', 'boy', 'gretchin'
]);

// Core Rules 13.08, first alternative. Partial visibility due to terrain
// is attacker-specific and is checked separately for each remaining model.
export function patrolAreaCover(game, targets) {
  const none = {automatic: false, models: []};
  if (!game?.layout?.map || game.training || game.rules?.status !== 'playing') return none;
  const terrain = layoutGeometry(game.layout.map)?.terrainAreas;
  if (!terrain?.length) return none;

  const {pieces, rules} = game;
  const requested = new Set((Array.isArray(targets) ? targets : [targets])
    .map(target => typeof target === 'string' ? target : target?.id));
  const reserves = new Set(Object.values(rules.reserves ?? {}).flat());
  const survivors = pieces.filter(piece => getProfile(piece) && !reserves.has(piece.id) && currentHP(rules, piece) > 0);
  const unitKeys = new Set(survivors.filter(piece => requested.has(piece.id)).map(piece => groupId(rules, piece)));
  if (unitKeys.size !== 1) return none;

  const [unit] = unitKeys;
  const models = survivors.filter(piece => groupId(rules, piece) === unit).map(piece => {
    const areas = terrain.filter(area => overlapsArea(piece, area.polygon)).map(({id, name}) => ({id, name}));
    return {id: piece.id, eligible: infantry.has(piece.kind) && areas.length > 0, areas};
  });
  return {automatic: models.every(model => model.eligible), models};
}
