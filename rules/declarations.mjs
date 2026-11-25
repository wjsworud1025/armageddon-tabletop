import {getProfile} from './profiles.mjs';
import {attackSkill,character,currentHP,groupId,weaponSlot,diceValue,resolveAttack,queueHazard} from './battle.mjs';
import {effectWeapon} from './patrol.mjs';
import {openCounteroffensive} from '../fight-sequence.mjs';
import {forgetPatrolSightUnit,patrolSightTarget} from './patrol-sight.mjs';
import {patrolHighGround,patrolGroundLevel} from './patrol-terrain-placement.mjs';

const unitOrder=(s,id)=>s.units[id]||{};
export const weaponFor=(state,p,i)=>effectWeapon(state,p,getProfile(p).weapons[i],groupId(state,p));
const item=(pieces,id)=>pieces.find(p=>p.id===id);
const slotFor=(pieces,row)=>weaponSlot(getProfile(item(pieces,row.actor)).weapons[row.weapon]);
const meleeLimit=(w,entry)=>w.attacks+entry.extra;

export function draftRestriction(state,pieces,actor,index,target) {
  const plan=state.declaration;
  const key=groupId(state,actor);
  if(state.shootingReaction||state.reactionPlan||state.units?.wartrakk?.suppressionTargets?.length)return '직전 사격의 제압과 반응 이동을 먼저 마치세요';
  if (plan?.locked) return '선언한 공격을 먼저 판정하세요';
  if (plan && plan.unit!==key) return '현재 분대의 공격 선언을 마치세요';
  if (state.hazard) return '앞선 위험 판정을 마치세요';
  const w=weaponFor(state,actor,index);
  const prior=(plan?.rows||[]).filter(r=>r.actor===actor.id);
  const past=unitOrder(state,key).attacks?.[actor.id]||[];
  if(past.some(a=>a.slot===weaponSlot(w)))return '이미 사용한 무기';
  if(w.range && actor.kind!=='landSpeeder' && past.some(a=>a.ranged&&!!a.pistol!==!!w.pistol))return '권총과 다른 사격 무기를 함께 선언할 수 없습니다';
  const used=prior.filter(r=>slotFor(pieces,r)===weaponSlot(w));
  if (w.range && used.length) return '이미 선언한 무기';
  if (!w.range && used.some(r=>r.weapon!==index)) return '다른 근접 무기를 선택했습니다';
  if (!w.range && used.some(r=>r.target===target)) return '해당 표적에 이미 배정했습니다';
  if (!w.range && used.length && used.reduce((n,r)=>n+r.assigned,0)>=meleeLimit(w,used[0])) return '근접 공격을 모두 배정했습니다';
  if (w.range && actor.kind!=='landSpeeder' && prior.some(r=>!!weaponFor(state,actor,r.weapon).pistol!==!!w.pistol)) return '권총과 다른 사격 무기를 함께 선언할 수 없습니다';
  return '';
}

export function appendDeclaration(state,pieces,rows) {
  if(state.status!=='playing' || ![2,4].includes(state.step) || !rows.length) return null;
  let next=state;
  for(const row of rows){
    const p=item(pieces,row.actor),target=item(pieces,row.preferred);
    if(!p||!target||!currentHP(state,p)||!currentHP(state,target)||p.faction===target.faction||
       groupId(state,target)!==row.target || (state.step===2 && state.active!==p.faction)) return null;
    const w=weaponFor(state,p,row.weapon),unit=groupId(state,p);
    if((state.step===2)!==!!w.range || unitOrder(state,unit).finishedAttack===state.step ||
        draftRestriction(next,pieces,p,row.weapon,row.target)) return null;
    if(!w.range) {
      const prior=next.declaration?.rows.filter(r=>r.actor===p.id)||[];
      if(prior.some(r=>r.extra!==row.extra) || !Number.isInteger(row.assigned) || row.assigned<1 ||
        row.assigned+prior.reduce((n,r)=>n+r.assigned,0)>meleeLimit(w,row))return null;
    }
    const old=next.declaration||{unit,locked:false,focus:null,rows:[]};
    next={...next,declaration:{...old,rows:[...old.rows,{...row,done:false}]}};
  }
  return next;
}

export function lockDeclaration(state,pieces,eligibleMelee=[]) {
  const plan=state.declaration;
  if(!plan || plan.locked || !plan.rows.length)return null;
  if(state.step===4) {
    for(const actor of eligibleMelee){
      const rows=plan.rows.filter(r=>r.actor===actor.id);
      if(!rows.length || rows.reduce((n,r)=>n+r.assigned,0)!==meleeLimit(weaponFor(state,actor,rows[0].weapon),rows[0]))return null;
    }
  }
  return {...state,declaration:{...plan,locked:true}};
}

export function plungingFireAtDeclaration(state,pieces,actor,weapon,targets,visible){
  return visible===true&&state.status==='playing'&&state.step===2&&!!actor&&state.active===actor.faction&&
    currentHP(state,actor)>0&&weapon.range>0&&!weapon.torrent&&
    targets.some(t=>getProfile(t)&&t.faction!==actor.faction&&currentHP(state,t)>0&&patrolGroundLevel(t))&&
    patrolHighGround(actor,pieces);
}

function sightedRows(state,pieces,rows,distance){
  if(state.step!==2)return rows;
  const checked=[];
  for(const row of rows){
    const actor=item(pieces,row.actor),profile=getProfile(actor);
    if(!profile?.weapons[row.weapon])return null;
    const weapon=weaponFor(state,actor,row.weapon);
    const targets=pieces.filter(p=>getProfile(p)&&groupId(state,p)===row.target);
    const target=patrolSightTarget(state,pieces,row.actor,targets.map(p=>p.id),weapon.range,distance);
    if(!target.visible.length)return null;
    const plunging=plungingFireAtDeclaration(state,pieces,actor,weapon,targets,true);
    const updated={...row,distance:target.distance,plunging};
    if(plunging)updated.plungingVisible=target.visible;
    else delete updated.plungingVisible;
    checked.push(updated);
  }
  return checked;
}

// The table uses these entry points both when drafting and when confirming.
// Older, already locked declarations resolve from their original rows.
export function appendSightedDeclaration(state,pieces,rows,distance){
  const checked=sightedRows(state,pieces,rows,distance);
  return checked&&appendDeclaration(state,pieces,checked);
}
export function lockSightedDeclaration(state,pieces,eligibleMelee=[],distance){
  const plan=state.declaration;
  if(!plan||plan.locked)return null;
  const checked=sightedRows(state,pieces,plan.rows,distance);
  return checked&&lockDeclaration({...state,declaration:{...plan,rows:checked}},pieces,eligibleMelee);
}

// Recheck only visibility for an unresolved 22.05 modifier. Original
// weapon, unit target, distance, and damage allocation remain untouched.
export function plungingSightCandidates(state,pieces,index){
  const plan=state.declaration,row=plan?.rows[index];
  if(state.status!=='playing'||state.step!==2||!Number.isInteger(index)||!plan?.locked||plan.attackRoll||plan.precisionRoll||
    !row?.plunging||row.done||plan.focus&&plan.focus!==row.target)return [];
  const actor=item(pieces,row.actor),weapon=getProfile(actor)?.weapons[row.weapon];
  if(!weapon)return [];
  const targets=pieces.filter(p=>getProfile(p)&&groupId(state,p)===row.target&&currentHP(state,p)>0);
  if(targets.some(p=>row.plungingVisible.includes(p.id))||
    !plungingFireAtDeclaration(state,pieces,actor,weapon,targets,true))return [];
  return targets;
}

export function confirmPlungingSight(state,pieces,index,targetId){
  if(!plungingSightCandidates(state,pieces,index).some(p=>p.id===targetId))return null;
  const plan=state.declaration;
  const rows=plan.rows.map((r,i)=>i===index?{...r,plungingVisible:[...r.plungingVisible,targetId]}:r);
  return {...state,declaration:{...plan,rows}};
}

function packetKey(w,r,plunging) {
  const half=w.range>0&&r.distance<=w.range/2;
  return JSON.stringify([r.target,w.skill,w.strength,w.ap+Number(r.guard&&w.ap<0),w.damage,half?w.melta||0:0,
    !!w.precision,!!w.torrent,!!w.devastating,!!w.psychic,w.antiVehicle||0,r.cover,r.hit-(r.vehiclePenalty||0),r.wound,r.lethal,r.sustained,r.ignore,plunging]);
}
export function attackPackets(state,pieces) {
  const plan=state.declaration;
  if(!plan?.locked)return [];
  const packets=new Map();
  const hasTerrain=pieces.some(p=>p.faction==='terrain');
  const living=pieces.filter(p=>getProfile(p)&&currentHP(state,p)>0);
  const liveIds=new Set(living.map(p=>p.id));
  const grounded=new Set(living.filter(patrolGroundLevel).map(p=>groupId(state,p)));
  for(const [i,r] of plan.rows.entries()){
    if(r.done || (plan.focus && plan.focus!==r.target))continue;
    const actor=item(pieces,r.actor),w=weaponFor(state,actor,r.weapon);
    const plunging=r.plunging===true&&actor.elevation>=3&&grounded.has(r.target)&&r.plungingVisible.some(id=>liveIds.has(id))&&
      (!hasTerrain||patrolHighGround(actor,pieces));
    const key=packetKey(w,r,plunging);
    if(!packets.has(key))packets.set(key,{index:i,target:r.target,indices:[],names:new Set(),plunging,
      skill:attackSkill(w,{cover:r.cover,plunging,ignorePenalties:r.ignore})});
    const packet=packets.get(key);
    packet.indices.push(i);packet.names.add(w.name);
  }
  const all=[...packets.values()];
  const pending=plan.precisionRoll??plan.attackRoll;
  return pending?all.filter(p=>p.index===pending.index):all;
}

export function resolvePacket(state,pieces,index,preferred=null,random=Math.random,precisionTarget=undefined) {
  const packet=attackPackets(state,pieces).find(p=>p.index===index);
  if(!packet||state.declaration.attackRoll)return null;
  const plan=state.declaration,rows=plan.rows.slice(),first=rows[index],actor=item(pieces,first.actor);
  const defenders=pieces.filter(p=>getProfile(p) && groupId(state,p)===first.target && currentHP(state,p)>0);
  const base=weaponFor(state,actor,first.weapon);
  const w=first.guard?{...base,ap:Math.min(0,base.ap+1)}:base;
  const rolled=plan.precisionRoll;
  if(rolled && precisionTarget===undefined)return null;
  if(precisionTarget!=null && (!rolled||!w.precision||!defenders.some(p=>character(p)&&p.id===precisionTarget)))return null;
  const awaitAllocation=!rolled && w.precision && defenders.length>1 && defenders.some(character);
  let count=rolled?.count??0;
  for(const i of packet.indices){
    const r=rows[i],p=item(pieces,r.actor),weapon=weaponFor(state,p,r.weapon);
    if(!rolled && defenders.length && currentHP(state,p)>0) {
      const split=rows.some((s,j)=>j!==i&&s.actor===r.actor&&s.weapon===r.weapon);
      const half=weapon.range && r.distance<=weapon.range/2;
      const bonus=(weapon.blast||0)+(split?0:weapon.cleave||0);
      count+=(weapon.range?diceValue(weapon.attacks,random)+r.extra:r.assigned)+
        (half?weapon.rapid||0:0)+Math.floor(r.size/5)*bonus;
    }
  }
  const result=count&&defenders.length?resolveAttack({weapon:w,targets:defenders,state,preferred:preferred||first.preferred,precisionTarget,awaitAllocation,rolled,distance:first.distance,
    attackCount:count,hitMod:first.hit-(first.vehiclePenalty||0),woundMod:first.wound,cover:first.cover,plunging:packet.plunging,lethal:first.lethal,
    sustained:first.sustained,ignorePenalties:first.ignore,random}):null;
  if(awaitAllocation&&result?.wounds){
    const precisionRoll={index,...result};
    return {state:{...state,declaration:{...plan,focus:first.target,precisionRoll}},precisionRoll,
      actor,target:item(pieces,first.preferred),packet,removed:{},finished:false,shootingEvent:null};
  }
  return closePacket(state,pieces,packet,result);
}

export function closePacket(state,pieces,packet,result) {
  const plan=state.declaration,rows=plan.rows.slice(),first=rows[packet.index],actor=item(pieces,first.actor);
  const order=unitOrder(state,plan.unit),attacks={...order.attacks},count=result?.count??0;
  for(const i of packet.indices){
    const r=rows[i],p=item(pieces,r.actor),weapon=weaponFor(state,p,r.weapon);
    rows[i]={...r,done:true};
    const list=attacks[p.id]||[],slot=weaponSlot(weapon);
    if(!list.some(a=>a.slot===slot)) attacks[p.id]=[...list,{slot,ranged:!!weapon.range,pistol:!!weapon.pistol}];
  }
  const hitTargets=[...new Set([...(order.hitTargets||[]),...(result?.hits?[first.target]:[])])];
  const updated={...order,attacks,hitTargets};
  let next={...state,hp:{...state.hp,...result?.hp},units:{...state.units,[plan.unit]:updated}};
  if(next.shootingSight&&Object.entries(result?.hp??{}).some(([id,hp])=>hp!==currentHP(state,item(pieces,id))))delete next.shootingSight;
  const finished=rows.every(r=>r.done);
  const didShoot=state.step===2&&(count>0||(plan.didShoot??plan.rows.some(r=>r.done)));
  const didFight=state.step===4&&(count>0||plan.didFight===true);
  next.declaration=finished?null:{...plan,rows,...(state.step===2?{didShoot}:{didFight}),focus:rows.some(r=>!r.done&&r.target===first.target)?first.target:null};
  if(next.declaration){delete next.declaration.precisionRoll;delete next.declaration.attackRoll;}
  if(finished){
    next=forgetPatrolSightUnit(next,pieces,plan.unit);
    const dangerous=new Set();
    for(const r of rows){
      const weapon=weaponFor(state,item(pieces,r.actor),r.weapon);
      if(weapon.hazardous)dangerous.add(r.actor+'/'+weaponSlot(weapon));
      if(state.step===2)next.units[r.target]={...unitOrder(next,r.target),shotAt:true};
    }
    if(dangerous.size)next=queueHazard(next,actor,dangerous.size);
    next.units[plan.unit]={...updated,finishedAttack:state.step};
    if(didFight&&next.fightSequence)next.fightSequence=openCounteroffensive({rules:next,pieces},plan.unit);
    if(state.step===2&&plan.unit==='wartrakk'){
      const liveTargets=hitTargets.filter(key=>pieces.some(p=>getProfile(p)&&groupId(next,p)===key&&currentHP(next,p)>0));
      next.units.wartrakk.suppressionTargets=liveTargets;
      if(liveTargets.length===1)next=chooseSuppression(next,liveTargets[0]);
    }
  }
  const removed=Object.fromEntries(Object.entries(result?.hp||{}).filter(([,hp])=>hp===0).map(([id])=>[id,true]));
  const shootingEvent=finished&&didShoot?{shooter:plan.unit,targets:[...new Set(rows.map(r=>r.target))],didShoot}:null;
  return {state:next,result,removed,packet,finished,shootingEvent,actor,target:item(pieces,first.preferred)};
}

export function chooseSuppression(state,target){
  const unit=state.units?.wartrakk;
  if(!unit?.suppressionTargets?.includes(target))return null;
  return {...state,units:{...state.units,wartrakk:{...unit,suppressionTargets:[],suppressedEnemy:true}},
    patrol:{...state.patrol,suppressed:target}};
}
