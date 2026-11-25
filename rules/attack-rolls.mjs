import {getProfile} from './profiles.mjs';
import {currentHP,groupId,modelProfile,character,roll,attackThresholds,allocationGroups} from './battle.mjs';
import {attackPackets,weaponFor,closePacket} from './declarations.mjs';
import {canCommandReroll,useCommandReroll} from './command-reroll.mjs';

export const attackRollNames={attacks:'공격 횟수',hit:'명중',wound:'상처',save:'방어',damage:'피해량'};
const characteristic=value=>Number.isInteger(value)?{sides:0,bonus:value}:
  {sides:Number(value[1]),bonus:Number(value.split('+')[1]||0)};
const repeat=(n,value)=>Array(n).fill(value);

// Rebuild the current decision from previously exposed dice. Replaying never
// samples randomness; only advancing off the last decision can roll new dice.
function* procedure(state,pieces,packet,preferred){
  const plan=state.declaration,byId=new Map(pieces.map(p=>[p.id,p]));
  const first=plan.rows[packet.index],actor=byId.get(first.actor);
  const base=weaponFor(state,actor,first.weapon);
  const weapon=first.guard?{...base,ap:Math.min(0,base.ap+1)}:base;
  const defenders=pieces.filter(p=>getProfile(p)&&groupId(state,p)===packet.target&&currentHP(state,p)>0)
    .map(p=>({...p,profile:modelProfile(state,p),hp:currentHP(state,p)}));
  if(!defenders.length)return null;
  const attacker={team:actor.faction,unit:plan.unit};
  const defender={team:defenders[0].faction,unit:packet.target};
  const shooting=[],sizes=[];
  let count=0;
  for(const i of packet.indices){
    const r=plan.rows[i],p=byId.get(r.actor);
    if(!currentHP(state,p))continue;
    const w=weaponFor(state,p,r.weapon),a=characteristic(w.range?w.attacks:r.assigned);
    if(a.sides){shooting.push(p.id);sizes.push(a.sides);}
    const split=plan.rows.some((s,j)=>j!==i&&s.actor===r.actor&&s.weapon===r.weapon);
    count+=a.bonus+(w.range?r.extra:0)+(w.range&&r.distance<=w.range/2?w.rapid||0:0)
      +Math.floor(r.size/5)*((w.blast||0)+(split?0:w.cleave||0));
  }
  if(sizes.length){
    const dice=yield {kind:'attacks',...attacker,sizes,models:shooting};
    count+=dice.reduce((a,b)=>a+b,0);
  }
  if(!count)return null;
  const threshold=attackThresholds(state,defenders,weapon,{cover:first.cover,hitMod:first.hit-(first.vehiclePenalty||0),
    woundMod:first.wound,ignorePenalties:first.ignore});
  const hitDice=weapon.torrent?[]:yield {kind:'hit',...attacker,sizes:repeat(count,6)};
  const sixes=hitDice.filter(d=>d===6).length;
  const hits=(weapon.torrent?count:hitDice.filter(threshold.hits).length)+(first.sustained?sixes:0);
  const auto=first.lethal?sixes:0;
  const woundDice=hits>auto?yield {kind:'wound',...attacker,sizes:repeat(hits-auto,6)}:[];
  const wounds=auto+woundDice.filter(threshold.wounds).length;
  const devastating=weapon.devastating?woundDice.filter(threshold.critical).length:0;
  const damage=[],saves=[];
  if(wounds){
    const characters=defenders.filter(character);
    let precision=null;
    if(weapon.precision&&characters.length&&defenders.length>1)
      precision=yield {kind:'precision',...attacker,choices:[null,...characters.map(p=>p.id)],hits,wounds};
    const groups=allocationGroups(defenders,weapon,preferred,precision);
    // With this set the only mixed non-Character profiles are Nob and Boy.
    // When either group can legally take the first save, let the defender set the order now.
    const bodies=groups.filter(g=>!character(g[0]));
    const firstBodies=bodies.filter(g=>g.some(p=>p.hp<p.profile.wounds));
    const options=firstBodies.length?firstBodies:bodies;
    if(options.length>1){
      const id=yield {kind:'order',...defender,choices:options.map(g=>g[0].id),hits,wounds};
      const group=groups.find(g=>g.some(p=>p.id===id));
      groups.splice(groups.indexOf(group),1);groups.splice(precision?1:0,0,group);
    }
    if(wounds>devastating)saves.push(...yield {kind:'save',...defender,sizes:repeat(wounds-devastating,6)});
    const d=characteristic(weapon.damage),melta=weapon.range&&first.distance<=weapon.range/2?weapon.melta||0:0;
    for(const save of [...saves].sort((a,b)=>a-b).concat(repeat(devastating,null))){
      const group=groups.find(g=>g.some(p=>p.hp>0));
      if(!group)break;
      const profile=group[0].profile;
      if(save!==null&&save!==1&&((profile.invul&&save>=profile.invul)||save+weapon.ap>=profile.save))continue;
      const alive=group.filter(p=>p.hp>0),injured=alive.filter(p=>p.hp<p.profile.wounds);
      const candidates=injured.length?injured:alive;
      let target=candidates[0];
      if(candidates.length>1){
        const chosen=yield {kind:'model',...defender,choices:candidates.map(p=>p.id),save};
        target=candidates.find(p=>p.id===chosen);
      }
      const die=d.sides?(yield {kind:'damage',...attacker,sizes:[d.sides],model:target.id,remaining:target.hp,bonus:d.bonus+melta})[0]:0;
      const raw=die+d.bonus+melta,lost=Math.min(raw,target.hp);
      target.hp-=lost;damage.push({id:target.id,raw,lost,remaining:target.hp});
    }
  }
  return {count,hits,wounds,devastating,hitDice,woundDice,saves,damage,hp:Object.fromEntries(defenders.map(p=>[p.id,p.hp]))};
}

function replay(state,pieces,packet,progress){
  const flow=procedure(state,pieces,packet,progress.preferred);
  let next=flow.next(),last=null;
  for(const [i,record] of progress.records.entries()){
    if(next.done||next.value.kind!==record.kind)return null;
    const event=next.value;
    if(event.sizes){
      if(!Array.isArray(record.raw)||record.raw.length!==event.sizes.length||
        !record.raw.every((v,k)=>Number.isInteger(v)&&v>=1&&v<=event.sizes[k]))return null;
    }else if(record.raw!==undefined)return null;
    if(i===progress.records.length-1){
      if(record.closed||record.change||Object.hasOwn(record,'choice'))return null;
      last=event;break;
    }
    if(record.closed!==true)return null;
    if(event.sizes){
      if(Object.hasOwn(record,'choice'))return null;
      const dice=[...record.raw];
      if(record.change){
        const {index,value}=record.change;
        if(!Number.isInteger(index)||index<0||index>=dice.length||!Number.isInteger(value)||value<1||value>event.sizes[index])return null;
        dice[index]=value;
      }
      next=flow.next(dice);
    }else{
      if(record.change||!event.choices.includes(record.choice))return null;
      next=flow.next(record.choice);
    }
  }
  if(!last)return null;
  return {event:last,flow};
}

export function inspectAttackRoll(state,pieces){
  const progress=state.declaration?.attackRoll;
  if(!progress)return null;
  const packet=attackPackets(state,pieces).find(p=>p.index===progress.index);
  if(!packet)return null;
  const played=replay(state,pieces,packet,progress);
  if(!played)return null;
  return {...played.event,raw:progress.records.at(-1).raw,packet};
}

// No change to table HP, casualties, hazardous weapons or post-shoot reactions
// is published until the attack packet has been resolved.
export function stepAttackRoll(state,pieces,index,action={type:'begin'},random=Math.random){
  const plan=state.declaration,packet=attackPackets(state,pieces).find(p=>p.index===index);
  if(!packet||plan.precisionRoll)return null;
  const preferred=plan.attackRoll?.preferred??action.preferred??plan.rows[index].preferred;
  if(!pieces.some(p=>p.id===preferred&&groupId(state,p)===packet.target))return null;
  const records=[...(plan.attackRoll?.records??[])];
  let flow,next,note='';
  if(plan.attackRoll){
    const played=replay(state,pieces,packet,plan.attackRoll);
    if(!played)return null;
    flow=played.flow;
    const event=played.event,record={...records.pop(),closed:true};
    if(event.sizes){
      if(!['keep','reroll'].includes(action.type))return null;
      const dice=[...record.raw];
      if(action.type==='reroll'){
        const i=action.index;
        if(!Number.isInteger(i)||i<0||i>=dice.length)return null;
        const paid=useCommandReroll(state,{...event,sides:event.sizes[i],dice:[dice[i]]},0,random);
        if(!paid)return null;
        state=paid.rules;record.change={index:i,value:paid.dice[0]};dice[i]=paid.dice[0];
        note=attackRollNames[event.kind]+' 지휘 재굴림 (1 CP) · '+(i+1)+'번 '+record.raw[i]+' → '+dice[i];
      }
      next=flow.next(dice);
    }else{
      if(action.type!=='select'||!event.choices.includes(action.choice))return null;
      record.choice=action.choice;next=flow.next(action.choice);
    }
    records.push(record);
  }else{
    if(action.type!=='begin')return null;
    flow=procedure(state,pieces,packet,preferred);next=flow.next();
  }
  while(!next.done){
    const event=next.value,record={kind:event.kind};
    if(event.sizes)record.raw=event.sizes.map(sides=>roll(sides,random));
    records.push(record);
    if(!event.sizes||canCommandReroll(state,event.unit,event.team)){
      const attackRoll={index,preferred,records};
      return {state:{...state,declaration:{...plan,focus:packet.target,attackRoll}},event:{...event,raw:record.raw},note,packet};
    }
    record.closed=true;
    next=flow.next(record.raw);
  }
  return {...closePacket(state,pieces,packet,next.value),note};
}
