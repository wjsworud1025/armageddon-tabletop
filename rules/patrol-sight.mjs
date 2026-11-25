import {currentHP,groupId} from './battle.mjs';
import {getProfile} from './profiles.mjs';
import {measureFootprints} from '../ruler.mjs';
import {createTable} from '../data/catalog.mjs';

const statuses=['visible','blocked','unknown'];
const alive=(state,p)=>!!getProfile(p)&&currentHP(state,p)>0;
const editable=state=>state.status==='playing'&&state.step===2&&!state.declaration?.locked&&
  !state.hazard&&!state.shootingReaction&&!state.reactionPlan&&!state.units?.wartrakk?.suppressionTargets?.length;

// The same saved angle may be normalised by the table loader on each restore.
const yawOf=p=>(p.yaw??0)%(Math.PI*2);
const startingWounds=new Map(createTable().pieces.map(p=>[p.id,getProfile(p)?.wounds??null]));
export const sightHP=(state,id)=>state.hp?.[id]??startingWounds.get(id);
const pose=(state,p)=>[p.x,p.z,p.elevation??0,yawOf(p),!!p.removed,sightHP(state,p.id)];
export const captureSightBoard=(state,pieces)=>Object.fromEntries(pieces.map(p=>[p.id,pose(state,p)]));
export function sightBoardMatches(state,pieces,board){
  return Object.keys(board).length===pieces.length&&pieces.every(p=>{
    const saved=board[p.id];
    return saved&&pose(state,p).every((v,i)=>v===saved[i]);
  });
}

function current(state,pieces){
  const sight=state.shootingSight;
  return sight&&state.step===2&&state.status==='playing'&&sight.round===state.round&&sight.active===state.active&&
    sightBoardMatches(state,pieces,sight.board);
}

export function reconcilePatrolSight(state,pieces){
  if(!state?.shootingSight||current(state,pieces))return state;
  const next={...state};
  delete next.shootingSight;
  return next;
}

export function forgetPatrolSightUnit(state,pieces,unit){
  if(!state.shootingSight)return state;
  const pairs={...state.shootingSight.pairs};
  for(const p of pieces){
    if(Object.hasOwn(pairs,p.id)&&groupId(state,p)===unit)delete pairs[p.id];
  }
  const next={...state};
  if(Object.keys(pairs).length)next.shootingSight={...state.shootingSight,pairs};
  else delete next.shootingSight;
  return next;
}

export function canSetPatrolSight(state,pieces,shooterId,targetId){
  if(!state||!editable(state))return false;
  const actor=pieces.find(p=>p.id===shooterId),target=pieces.find(p=>p.id===targetId);
  if(!alive(state,actor)||!alive(state,target)||actor.faction!==state.active||target.faction===actor.faction)return false;
  const unit=groupId(state,actor);
  return state.units?.[unit]?.finishedAttack!==2&&(!state.declaration||state.declaration.unit===unit);
}

export function patrolSightStatus(state,pieces,shooterId,targetId){
  return state&&current(state,pieces)?state.shootingSight.pairs[shooterId]?.[targetId]??'unknown':'unknown';
}

export function setPatrolSight(state,pieces,shooterId,targetId,status){
  if(!statuses.includes(status)||!canSetPatrolSight(state,pieces,shooterId,targetId))return null;
  const before=reconcilePatrolSight(state,pieces);
  const previous=before.shootingSight;
  if((previous?.pairs[shooterId]?.[targetId]??'unknown')===status)return before;
  const pairs={...previous?.pairs},row={...pairs[shooterId]};
  if(status==='unknown')delete row[targetId];
  else row[targetId]=status;
  if(Object.keys(row).length)pairs[shooterId]=row;
  else delete pairs[shooterId];
  const next={...before};
  if(Object.keys(pairs).length)next.shootingSight={round:state.round,active:state.active,board:previous?.board??captureSightBoard(state,pieces),pairs};
  else delete next.shootingSight;
  return next;
}

// 04.02 applies both conditions to a target UNIT. Its nearest member and
// the member visible to this particular model can be different miniatures.
export function patrolSightTarget(state,pieces,shooterId,targetIds,range,distance){
  const actor=pieces.find(p=>p.id===shooterId);
  const empty={distance:Infinity,visible:[]};
  if(!Number.isFinite(range)||range<=0||!alive(state,actor)||!current(state,pieces)||
    actor.faction!==state.active||state.units?.[groupId(state,actor)]?.finishedAttack===2)return empty;
  const targets=pieces.filter(p=>targetIds.includes(p.id)&&p.faction!==actor.faction&&alive(state,p));
  if(!targets.length||targets.some(p=>groupId(state,p)!==groupId(state,targets[0])))return empty;
  const measured=Math.min(...targets.map(t=>distance?distance(actor.id,t.id):measureFootprints(actor,t).distance));
  const nearest=measured>range&&measured<=range+1e-7?range:measured;
  const pairs=state.shootingSight.pairs[actor.id];
  return {distance:nearest,visible:nearest>=0&&nearest<=range?targets.filter(t=>pairs?.[t.id]==='visible').map(t=>t.id):[]};
}
export function visibleInRange(state,pieces,shooterId,targetIds,range,distance){
  return patrolSightTarget(state,pieces,shooterId,targetIds,range,distance).visible;
}
