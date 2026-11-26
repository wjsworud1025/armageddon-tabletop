import {currentHP,engaged,groupId,shockTest} from './battle.mjs';
import {canUsePatrolTactic,payTerrifyingCharge} from './patrol.mjs';
import {measureFootprints} from '../ruler.mjs';

function onTable(r,p){
  return p.faction!=='terrain'&&currentHP(r,p)>0&&!r.reserves?.[groupId(r,p)]?.includes(p.id);
}
function canOffer(r,unit){
  const order=r?.units?.[unit];
  return !!(r?.status==='playing'&&r.step===3&&r.active==='marines'&&order?.charged&&order.chargeTracked&&Number.isInteger(order.charge)&&order.charge>=2&&order.charge<=12&&
    !r.chargePlan&&!r.chargeWindow&&!r.hazard&&!r.declaration&&!r.movePlan&&!r.fightPlan&&!r.fightSequence&&
    !r.rallyPlan&&!r.reinforcePlan&&!r.overwatch&&!r.reactionPlan&&!r.shootingReaction&&!r.terrifyingResult&&
    canUsePatrolTactic(r,'shockCharge',unit,'marines',order.shocked));
}
function engagedUnits(game,unit){
  const r=game.rules,live=game.pieces.filter(p=>onTable(r,p));
  const charging=live.filter(p=>p.faction==='marines'&&groupId(r,p)===unit);
  const foes=live.filter(p=>p.faction==='orks'&&charging.some(m=>engaged(m,p,measureFootprints(m,p).distance)));
  return [...new Set(foes.map(p=>groupId(r,p)))].sort();
}

// Called only at the completion of a successful own Charge move. A saved
// "charged" flag from an earlier activation does not open a fresh window.
export function openTerrifyingCharge(game,unit){
  const r=game.rules;
  if(!canOffer(r,unit)||r.terrifyingCharge)return r;
  const targets=engagedUnits(game,unit);
  return targets.length?{...r,terrifyingCharge:{round:r.round,unit,targets}}:r;
}
export function terrifyingChargeTargets(game){
  const r=game.rules,w=r?.terrifyingCharge;
  if(!w||w.round!==r.round||!canOffer(r,w.unit))return [];
  const legal=engagedUnits(game,w.unit);
  return legal.filter(key=>w.targets.includes(key));
}
export function validTerrifyingOffer(r,pieces){
  const w=r.terrifyingCharge;
  if(!w||w.round!==r.round||!w.targets.length||new Set(w.targets).size!==w.targets.length||!canOffer(r,w.unit))return false;
  if(!pieces)return true;
  const expected=engagedUnits({rules:r,pieces},w.unit);
  return expected.length===w.targets.length&&expected.every(key=>w.targets.includes(key));
}
export function declineTerrifyingCharge(game){
  if(!game.rules?.terrifyingCharge)throw Error('공포의 돌격을 선택할 기회가 없습니다.');
  const rules={...game.rules};delete rules.terrifyingCharge;
  return {rules,message:'공포의 돌격 생략'};
}
export function resolveTerrifyingCharge(game,target,random=Math.random){
  if(!terrifyingChargeTargets(game).includes(target))throw Error('방금 돌격한 분대와 교전 중인 적 분대를 선택하세요.');
  const r=game.rules,{unit}=r.terrifyingCharge;
  const paid=payTerrifyingCharge(r,unit);
  if(!paid)throw Error('공포의 돌격을 사용할 수 없습니다.');
  const defenders=game.pieces.filter(p=>p.faction==='orks'&&onTable(r,p)&&groupId(r,p)===target);
  const {dice,target:leadership,passed}=shockTest(r,defenders,random,-1);
  const total=dice[0]+dice[1]-1;
  const rules={...paid,terrifyingResult:{round:r.round,unit,target,dice,leadership}};
  delete rules.terrifyingCharge;
  // 01.07: a successful roll outside 08.03 leaves existing shock intact.
  if(!passed)rules.units={...r.units,[target]:{...r.units[target],shocked:true}};
  return {rules,dice,total,leadership,passed,message:'공포의 돌격 (1 CP) · '+defenders[0].name+' 분대 · '+dice.join(' + ')+' − 1 = '+total+' / '+leadership+'+ · '+(passed?'통과':'전장 충격')};
}
