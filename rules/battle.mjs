import {getProfile, unitId} from './profiles.mjs';
import {freshPatrol,nextPatrolTurn,effectProfile,hasWaaagh} from './patrol.mjs';

export const teams = {marines:'스페이스 마린',orks:'오크'};
export const steps = ['지휘','이동','사격','돌격','근접전','턴 종료'];
export const opposite = team => team === 'marines' ? 'orks' : 'marines';
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

export function newBattle() {
  return {version:1,status:'setup',first:'marines',active:'marines',round:1,rounds:5,step:0,
    cp:{marines:0,orks:0},vp:{marines:0,orks:0},hp:{},units:{},attachments:{},objectives:{},reserves:{},patrol:freshPatrol(),notes:'',mission:'',last:''};
}
export function startBattle(state,first,rounds) {
  if (state.status !== 'setup' || !(first in teams) || !Number.isInteger(rounds) || rounds < 1 || rounds > 20) return state;
  return {...state,status:'playing',first,active:first,rounds,cp:{marines:1,orks:1}};
}
export function advance(state) {
  if (state.status !== 'playing' || state.hazard || state.declaration || state.movePlan || state.reinforcePlan || state.chargePlan || state.fightPlan || state.fightSequence?.counterAfter || state.shootingReaction || state.reactionPlan || state.units?.wartrakk?.suppressionTargets?.length) return state;
  if (state.step < steps.length - 1) return {...state,step:state.step+1,...(state.step===3?{chargeWindow:false}:state.step===4?{fightSequence:null}:{})};
  const next = opposite(state.active);
  const endRound = next === state.first;
  if (endRound && state.round === state.rounds) return {...state,status:'finished'};
  const units = Object.fromEntries(Object.entries(state.units).map(([key,u])=>[key,{shocked:!!u.shocked}]));
  return {...state,step:0,round:state.round+Number(endRound),active:next,units,patrol:nextPatrolTurn(state.patrol,next),
    cp:{marines:state.cp.marines+1,orks:state.cp.orks+1}};
}
export function roll(sides=6,random=Math.random) {
  return 1 + Math.floor(random()*sides);
}
export function diceValue(value,random=Math.random) {
  if (Number.isFinite(value)) return value;
  const match = /^D(3|6)(?:\+(\d+))?$/.exec(value);
  if (!match) throw new RangeError('알 수 없는 주사위');
  return roll(Number(match[1]),random) + Number(match[2] || 0);
}
export function woundThreshold(strength,toughness) {
  if (strength >= 2*toughness) return 2;
  if (strength > toughness) return 3;
  if (strength === toughness) return 4;
  if (2*strength <= toughness) return 6;
  return 5;
}
export function currentHP(state,piece) {
  if (piece.removed) return 0;
  return state.hp[piece.id] ?? getProfile(piece)?.wounds ?? 0;
}
export function groupId(state,piece) {
  return state.attachments[piece.id] || unitId(piece);
}
export function modelProfile(state,piece) {
  const key=groupId(state,piece);
  return effectProfile(state,piece,getProfile(piece),key,state.units[key]?.shocked);
}
export function engaged(a,b,distance) {
  const vertical=Math.abs((a.elevation||0)-(b.elevation||0));
  const horizontal=Math.sqrt(Math.max(0,distance*distance-vertical*vertical));
  return vertical<=5.000001 && horizontal<=2.000001;
}
export function weaponSlot(weapon) {
  if (weapon.range===0) return 'melee';
  if (weapon.slot) return weapon.slot;
  const families=[['스마이트','smite'],['플라즈마','plasma'],['수류탄 발사기','grenade']];
  return families.find(([name])=>weapon.name.includes(name))?.[1] || weapon.name;
}
export function unitMembers(state,pieces,piece) {
  const key = groupId(state,piece);
  return pieces.filter(p=>p.faction===piece.faction && groupId(state,p)===key);
}
export function changeUnit(state,piece,delta) {
  const key = groupId(state,piece);
  return {...state,units:{...state.units,[key]:{...state.units[key],...delta}}};
}
export function needsShock(state,members) {
  const alive=members.filter(p=>currentHP(state,p)>0);
  if (!alive.length) return false;
  if (state.units[groupId(state,alive[0])]?.shocked) return true;
  if (members.length===1) return currentHP(state,alive[0])*2 <= getProfile(alive[0]).wounds;
  return alive.length*2 <= members.length;
}
export function shockTest(state,members,random=Math.random) {
  const alive=members.filter(p=>currentHP(state,p)>0);
  if (!alive.length) return null;
  const dice=[roll(6,random),roll(6,random)];
  const target=Math.min(...alive.map(p=>getProfile(p).leadership));
  return {dice,target,passed:dice[0]+dice[1]>=target};
}
export function adjustHP(state,piece,delta) {
  const hp = clamp(currentHP(state,piece)+delta,0,getProfile(piece).wounds);
  return {...state,hp:{...state.hp,[piece.id]:hp}};
}

export const character = p=>['captain','librarian','weirdboy','warboss'].includes(p.kind);

// One test per selected weapon, including weapons that scored no hits.
export function queueHazard(state,piece,copies) {
  const unit=groupId(state,piece),pending=state.hazard;
  if (state.status!=='playing' || ![2,4].includes(state.step) || state.units[unit]?.finishedAttack===state.step)
    throw new Error('이 분대는 현재 공격을 선언할 수 없습니다.');
  if (!Number.isInteger(copies) || copies<1 || copies>46 || (pending?.count||0)+copies>276)
    throw new RangeError('잘못된 위험 무기 개수');
  if (pending && (pending.unit!==unit || pending.dice)) throw new Error('앞선 분대의 위험 판정을 마치세요.');
  return {...state,hazard:{unit,count:(pending?.count||0)+copies}};
}

export function hazardCandidates(state,pieces) {
  if (!state.hazard) return [];
  const living=pieces.filter(p=>groupId(state,p)===state.hazard.unit && currentHP(state,p)>0);
  const bodyguards=living.filter(p=>!character(p));
  const group=bodyguards.length?bodyguards:living;
  const wounded=group.filter(p=>currentHP(state,p)<getProfile(p).wounds);
  return wounded.length?wounded:group;
}

// Roll the entire pool before applying losses. Forced allocations resolve
// together; the controlling player chooses between equally eligible models.
export function resolveHazard(state,pieces,preferred=null,random=Math.random,rolledDice=null) {
  const pending=state.hazard;
  if (!pending||pending.commandDice) return null;
  if(rolledDice&&(pending.dice||!Array.isArray(rolledDice)||rolledDice.length!==pending.count||
    !rolledDice.every(n=>Number.isInteger(n)&&n>=1&&n<=6)))return null;
  let {dice,remaining}=pending;
  if (dice && preferred && !hazardCandidates(state,pieces).some(p=>p.id===preferred)) return null;
  if (!dice) {
    dice=rolledDice??Array.from({length:pending.count},()=>roll(6,random));
    const alive=pieces.filter(p=>groupId(state,p)===pending.unit && currentHP(state,p)>0);
    // The Land Speeder is the only MONSTER/VEHICLE in this set. The Wartrakk is MOUNTED.
    const severity=alive.length && alive.every(p=>p.kind==='landSpeeder')?3:1;
    remaining=dice.filter(n=>n<=2).length*severity;
  }
  const total=remaining;
  const hp={...state.hp},removed={};
  let next={...state,hp};
  if(pending.reason!=='escape')next.units={...state.units,[pending.unit]:{...state.units[pending.unit],finishedAttack:state.step}};
  while (remaining>0) {
    const candidates=hazardCandidates(next,pieces);
    if (!candidates.length) {remaining=0;break;}
    const target=candidates.length===1?candidates[0]:candidates.find(p=>p.id===preferred);
    if (!target) break;
    hp[target.id]=currentHP(next,target)-1;
    if (!hp[target.id]) removed[target.id]=true;
    remaining--;
    preferred=null;
  }
  next.hazard=remaining?{...pending,dice,remaining}:null;
  if(!remaining&&pending.reason==='escape')next.movePlan={...state.movePlan,desperateEscapeResolved:true};
  return {state:next,dice,total,remaining,removed};
}

export function allocationGroups(defenders,weapon,preferred,precisionTarget){
  const groups=new Map();
  for (const p of defenders) {
    const key=character(p) ? p.id : [p.profile.wounds,p.profile.save,p.profile.invul].join('/');
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(p);
  }
  function priority(group) {
    if (weapon.precision && character(group[0]) && group[0].id===precisionTarget) return -1;
    return Number(character(group[0]))*4 + Number(!group.some(p=>p.hp<p.profile.wounds))*2
      + Number(!group.some(p=>p.id===preferred));
  }
  return [...groups.values()].sort((a,b)=>priority(a)-priority(b)).map(group=>
    group.sort((a,b)=>Number(a.hp===a.profile.wounds)-Number(b.hp===b.profile.wounds)
      || Number(b.id===preferred)-Number(a.id===preferred)));
}

export function attackThresholds(state,defenders,weapon,{cover,hitMod,woundMod,ignorePenalties}){
  const bodyguards=defenders.filter(p=>!character(p));
  const toughness=Math.max(...(bodyguards.length ? bodyguards : defenders).map(p=>p.profile.toughness));
  if (weapon.strength>toughness && hasWaaagh(state,defenders[0])) woundMod-=1;
  if (ignorePenalties || weapon.psychic) {cover=false;hitMod=Math.max(0,hitMod);}
  if (ignorePenalties) woundMod=Math.max(0,woundMod);
  const hitTarget=weapon.skill + Number(cover && weapon.range>0);
  const woundTarget=woundThreshold(weapon.strength,toughness);
  const anti=weapon.antiVehicle&&defenders.some(p=>p.kind==='landSpeeder');
  const critical=d=>d===6||!!anti&&d>=weapon.antiVehicle;
  return {critical,hits:d=>d!==1&&(d===6||d+clamp(hitMod,-1,1)>=hitTarget),
    wounds:d=>d!==1&&(critical(d)||d+clamp(woundMod,-1,1)>=woundTarget)};
}

// Resolve a single weapon profile. The defender chooses the order of models with
// otherwise identical allocation priority. Each damage roll belongs to one attack.
export function resolveAttack({weapon,targets,preferred,precisionTarget=null,awaitAllocation=false,rolled=null,state,distance,cover=false,hitMod=0,
  woundMod=0,extraAttacks=0,copies=1,attackCount=null,lethal=false,sustained=false,ignorePenalties=false,random=Math.random}) {
  const living=targets.filter(p=>currentHP(state,p)>0);
  if (!living.length) throw new Error('생존한 표적이 없습니다.');
  const inRange=weapon.range===0 || distance<=weapon.range;
  if (!inRange || !Number.isFinite(distance) || distance<0) throw new Error('무기 사거리 밖입니다.');
  const half=weapon.range>0 && distance<=weapon.range/2;
  if (!Number.isInteger(copies) || copies<1 || copies>46) throw new RangeError('잘못된 무기 개수');
  const bonus=extraAttacks + (half ? weapon.rapid || 0 : 0)
    + Math.floor(living.length/5)*((weapon.blast || 0)+(weapon.cleave || 0));
  let count=attackCount??0;
  if(attackCount===null)for(let i=0;i<copies;i++) count+=diceValue(weapon.attacks,random)+bonus;
  const defenders = living.map(p=>({...p,profile:modelProfile(state,p),hp:currentHP(state,p)}));
  const required=attackThresholds(state,defenders,weapon,{cover,hitMod,woundMod,ignorePenalties});
  const hitDice=rolled?.hitDice??[],woundDice=rolled?.woundDice??[],saves=[],damage=[];
  let hits=rolled?.hits??0,wounds=rolled?.wounds??0,devastating=rolled?.devastating??0;
  const woundOnce=autoWound=>{
    hits++;
    const die=autoWound ? null : roll(6,random);
    if (die!==null) woundDice.push(die);
    const critical=die!==null && required.critical(die);
    if (die!==null && !required.wounds(die)) return;
    wounds++;
    if (weapon.devastating && critical) devastating++;
    else if(!awaitAllocation)saves.push(roll(6,random));
  };
  for (let i=0;!rolled&&i<count;i++) {
    const hit=weapon.torrent ? null : roll(6,random);
    if (hit!==null) hitDice.push(hit);
    if (hit!==null && !required.hits(hit)) continue;
    woundOnce(hit===6 && lethal);
    if (hit===6 && sustained) woundOnce(false);
  }
  if(awaitAllocation && wounds)return {count,hits,wounds,hitDice,woundDice,devastating};
  if(rolled)for(let i=0;i<wounds-devastating;i++)saves.push(roll(6,random));
  // A group with an already wounded non-character must take damage first.
  const ordered=allocationGroups(defenders,weapon,preferred,precisionTarget).flat();
  saves.sort((a,b)=>a-b);
  for (const save of [...saves,...Array(devastating).fill(null)]) {
    const target=ordered.find(p=>p.hp>0);
    if (!target) break;
    if (save!==null && save!==1 &&
      ((target.profile.invul>0 && save>=target.profile.invul) || save+weapon.ap>=target.profile.save)) continue;
    const raw=diceValue(weapon.damage,random)+(half ? weapon.melta || 0 : 0);
    const lost=Math.min(raw,target.hp);
    target.hp-=lost;
    damage.push({id:target.id,raw,lost,remaining:target.hp});
  }
  return {count,hits,wounds,hitDice,woundDice,saves,devastating,damage,
    hp:Object.fromEntries(defenders.map(p=>[p.id,p.hp]))};
}

export function controlObjective(marineOC,orkOC,secured=null) {
  if (marineOC===orkOC) return secured;
  return marineOC>orkOC ? 'marines' : 'orks';
}
