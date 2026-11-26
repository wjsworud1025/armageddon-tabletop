import {layoutGeometry, overlapsArea} from '../layouts.mjs';
import {measureFootprints} from '../ruler.mjs';
import {currentHP, groupId} from './battle.mjs';
import {patrolInfantry} from './patrol-area-cover.mjs';
import {getProfile} from './profiles.mjs';
import {rangedAttackHistory} from './ranged-history.mjs';

const range = 15, epsilon = 1e-7;
const maps = ['A','B','C'];
const cached = new Map();

export function detectionMap(state, layout) {
  if (layout) return maps.includes(layout.map) ? layout.map : null;
  const die = state?.officialSetup?.layoutDie;
  return Number.isInteger(die) && die >= 1 && die <= 6 ? maps[Math.floor((die - 1) / 2)] : null;
}

function survey(code, version) {
  const key = code + version;
  if (!cached.has(key)) {
    const geometry = layoutGeometry(code, version);
    cached.set(key, {areas: geometry.terrainAreas, poses: new Map(geometry.terrain.map(p => [p.id,p]))});
  }
  return cached.get(key);
}

// Use the registered feature-to-mat assignment while its miniature remains
// in the printed pose. For displaced or extra scenery, its bounding circle
// can rule out overlap, but cannot establish where its irregular cast lies.
function areaFeatures(area, terrain, poses) {
  let uncertain = false;
  for (const p of terrain) {
    const pose = poses.get(p.id);
    const registered = pose && Math.abs(p.x-pose.x) < epsilon && Math.abs(p.z-pose.z) < epsilon &&
      Math.abs(Math.sin(((p.yaw??0)-pose.yaw)/2)) < epsilon && !(p.elevation??0);
    if (registered) {
      if (area.terrainIds.includes(p.id)) return 'present';
      continue;
    }
    const diameter = Math.hypot(p.baseWidth,p.baseDepth);
    if (overlapsArea({...p, yaw:0, baseWidth:diameter, baseDepth:diameter},area.polygon)) uncertain = true;
  }
  return uncertain ? 'manual' : 'empty';
}

// 13.09 is a property of the individual target, informed by its unit's
// attack history. It never supplies true line of sight by itself (06.01).
export function patrolDetection(state, pieces, shooterId, targetId, layout=null, distanceFn) {
  const result = {status:'none',reason:null,distance:null,range,areas:[],history:null};
  const shooter = pieces.find(p => p.id===shooterId), target = pieces.find(p => p.id===targetId);
  if (state?.status!=='playing' || !getProfile(shooter) || !patrolInfantry(target) ||
    shooter.faction===target.faction || !currentHP(state,shooter) || !currentHP(state,target)) return result;
  const reserves = Object.values(state.reserves??{});
  if (reserves.some(ids => ids.includes(shooterId) || ids.includes(targetId))) return result;
  const code = detectionMap(state,layout);
  if (!code) return result;
  const {areas,poses} = survey(code,state.officialSetup?.version??5);
  const terrain = pieces.filter(p => p.faction==='terrain' && !p.removed);
  let present = false;
  for (const area of areas) {
    if (!overlapsArea(target,area.polygon)) continue;
    const features = areaFeatures(area,terrain,poses);
    if (features==='empty') continue;
    if (features==='present') present = true;
    result.areas.push({id:area.id,name:area.name});
  }
  if (!result.areas.length) return result;
  result.distance = distanceFn ? distanceFn(shooterId,targetId) : measureFootprints(shooter,target).distance;
  result.history = rangedAttackHistory(state,groupId(state,target));
  if (result.history==='fired') return result;
  if (result.distance<=12+epsilon) return {...result,status:'detected'};
  if (!present) return {...result,status:'manual',reason:'terrain'};
  if (result.history==='unknown') return {...result,status:'manual',reason:'history'};
  if (result.distance>range+epsilon) return {...result,status:'hidden'};
  // 13.11.01 needs the actual view through intervening dense scenery.
  return {...result,status:'manual',reason:'gone-to-ground'};
}
