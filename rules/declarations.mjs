import {getProfile} from './profiles.mjs';
import {currentHP,groupId,weaponSlot,diceValue,resolveAttack,queueHazard} from './battle.mjs';
import {effectWeapon} from './patrol.mjs';

const unitOrder=(s,id)=>s.units[id]||{};
const weaponFor=(state,p,i)=>effectWeapon(state,p,getProfile(p).weapons[i],groupId(state,p));
const item=(pieces,id)=>pieces.find(p=>p.id===id);
const slotFor=(pieces,row)=>weaponSlot(getProfile(item(pieces,row.actor)).weapons[row.weapon]);
const meleeLimit=(w,entry)=>w.attacks+entry.extra;

export function draftRestriction(state,pieces,actor,index,target) {
  const plan=state.declaration;
  const key=groupId(state,actor);
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

function packetKey(w,r) {
  const half=w.range>0&&r.distance<=w.range/2;
  return JSON.stringify([r.target,w.skill,w.strength,w.ap+Number(r.guard&&w.ap<0),w.damage,half?w.melta||0:0,
    !!w.precision,!!w.torrent,!!w.devastating,!!w.psychic,w.antiVehicle||0,r.cover,r.hit-(r.vehiclePenalty||0),r.wound,r.lethal,r.sustained,r.ignore]);
}
export function attackPackets(state,pieces) {
  const plan=state.declaration;
  if(!plan?.locked)return [];
  const packets=new Map();
  for(const [i,r] of plan.rows.entries()){
    if(r.done || (plan.focus && plan.focus!==r.target))continue;
    const w=weaponFor(state,item(pieces,r.actor),r.weapon),key=packetKey(w,r);
    if(!packets.has(key))packets.set(key,{index:i,target:r.target,indices:[],names:new Set()});
    const packet=packets.get(key);
    packet.indices.push(i);packet.names.add(w.name);
  }
  return [...packets.values()];
}

export function resolvePacket(state,pieces,index,preferred=null,random=Math.random) {
  const packet=attackPackets(state,pieces).find(p=>p.index===index);
  if(!packet)return null;
  const plan=state.declaration,rows=plan.rows.slice(),first=rows[index],actor=item(pieces,first.actor);
  const defenders=pieces.filter(p=>getProfile(p) && groupId(state,p)===first.target && currentHP(state,p)>0);
  const base=weaponFor(state,actor,first.weapon);
  const w=first.guard?{...base,ap:Math.min(0,base.ap+1)}:base;
  let count=0;
  const order=unitOrder(state,plan.unit),attacks={...order.attacks};
  for(const i of packet.indices){
    const r=rows[i],p=item(pieces,r.actor),weapon=weaponFor(state,p,r.weapon);
    if(defenders.length && currentHP(state,p)>0) {
      const split=rows.some((s,j)=>j!==i&&s.actor===r.actor&&s.weapon===r.weapon);
      const half=weapon.range && r.distance<=weapon.range/2;
      const bonus=(weapon.blast||0)+(split?0:weapon.cleave||0);
      count+=(weapon.range?diceValue(weapon.attacks,random)+r.extra:r.assigned)+
        (half?weapon.rapid||0:0)+Math.floor(r.size/5)*bonus;
    }
    rows[i]={...r,done:true};
    const list=attacks[p.id]||[],slot=weaponSlot(weapon);
    if(!list.some(a=>a.slot===slot)) attacks[p.id]=[...list,{slot,ranged:!!weapon.range,pistol:!!weapon.pistol}];
  }
  const result=count?resolveAttack({weapon:w,targets:defenders,state,preferred:preferred||first.preferred,distance:first.distance,
    attackCount:count,hitMod:first.hit-(first.vehiclePenalty||0),woundMod:first.wound,cover:first.cover,lethal:first.lethal,
    sustained:first.sustained,ignorePenalties:first.ignore,random}):null;
  const hitTargets=[...new Set([...(order.hitTargets||[]),...(result?.hits?[first.target]:[])])];
  const updated={...order,attacks,hitTargets};
  let next={...state,hp:{...state.hp,...result?.hp},units:{...state.units,[plan.unit]:updated}};
  const finished=rows.every(r=>r.done);
  next.declaration=finished?null:{...plan,rows,focus:rows.some(r=>!r.done&&r.target===first.target)?first.target:null};
  if(finished){
    const dangerous=new Set();
    for(const r of rows){
      const weapon=weaponFor(state,item(pieces,r.actor),r.weapon);
      if(weapon.hazardous)dangerous.add(r.actor+'/'+weaponSlot(weapon));
      if(state.step===2)next.units[r.target]={...unitOrder(next,r.target),shotAt:true};
    }
    if(dangerous.size)next=queueHazard(next,actor,dangerous.size);
    next.units[plan.unit]={...updated,finishedAttack:state.step};
  }
  const removed=Object.fromEntries(Object.entries(result?.hp||{}).filter(([,hp])=>hp===0).map(([id])=>[id,true]));
  return {state:next,result,removed,packet,finished,actor,target:item(pieces,first.preferred)};
}
