// Army and detachment rules printed on the four sides of the Starter Set
// reference sheets. Unit statistics are supplied separately by the data cards.
export const doctrines={assault:'강습 교리',devastator:'데바스테이터 교리',tactical:'전술 교리'};
export const enhancements={
  veterans:['marines','인터세서 · 속사 1'],blades:['marines','뱅가드 · 돌격 방어'],
  armour:['orks','워트랙 · 장갑 강화'],warcry:['orks','워보스 · 전투 함성']
};
export const tactics={
  precision:{name:'참수 공격',team:'marines',step:4,rule:'이 단계에 해당 분대의 근접 무기는 정밀 공격을 얻습니다.'},
  consolidate:{name:'가차 없는 공격',team:'marines',step:4,rule:'선택한 분대의 재정비 이동 한도가 6″가 됩니다.'},
  shockCharge:{name:'공포의 돌격',team:'marines',step:3,own:true,rule:'돌격을 마친 분대와 교전한 적 하나를 선택해 −1로 전장 충격을 검사합니다.'},
  crush:{name:'으깨 버려!',team:'orks',step:4,rule:'해당 분대 근접 무기의 S를 이번 단계에 1 올립니다.'},
  surge:{name:'한복판으로!',team:'orks',step:2,opponent:true,rule:'적 공격의 표적이었던 분대는 적 공격이 끝나면 D6+1″ 이내의 서지 이동을 할 수 있습니다.'},
  med:{name:'메디 스퀴그',team:'orks',step:2,opponent:true,rule:'적이 표적을 지정한 후, 해당 분대에 이번 단계 동안 무적 방어 5+를 적용합니다.'}
};
export function freshPatrol() {
  return {doctrine:null,usedDoctrines:[],waaagh:0,waaaghUsed:false,enhanced:{},tactics:{},spent:{},suppressed:null,warcryUsed:false};
}
export function nextPatrolTurn(patrol,active) {
  return {...patrol,waaagh:Math.max(0,patrol.waaagh-1),doctrine:active==='marines'?null:patrol.doctrine,
    suppressed:active==='orks'?null:patrol.suppressed};
}
export function inDoctrine(state,actor,key) {
  return actor.faction==='marines' && state.patrol?.doctrine===key;
}
export function hasWaaagh(state,actor) {
  return actor.faction==='orks' && state.patrol?.waaagh>0;
}
export function selectOrder(state,key) {
  const p=state.patrol;
  if (state.status!=='playing' || state.step!==0) return null;
  if (key==='waaagh') {
    // Waaagh! is a start-of-phase choice. Both a resolved shock test
    // (including an automatic pass) and Rallying War Cry occur later.
    if (state.active!=='orks' || p.waaaghUsed ||
      Object.values(state.units??{}).some(unit=>unit.shockChecked||unit.rallied)) return null;
    return {...state,patrol:{...p,waaagh:2,waaaghUsed:true}};
  }
  if (!(key in doctrines) || state.active!=='marines' || p.doctrine || p.usedDoctrines.includes(key)) return null;
  return {...state,patrol:{...p,doctrine:key,usedDoctrines:[...p.usedDoctrines,key]}};
}
const phaseKey=state=>[state.round,state.active,state.step].join('-');
// Core 15.01: a player can target each unit with only one stratagem per phase.
export function unitTargetedByStratagem(state,unit) {
  return Object.values(state.patrol?.tactics??{}).includes(phaseKey(state)+'/'+unit);
}
export function tacticActive(state,key,unit) {
  return state.patrol?.tactics?.[key]===phaseKey(state)+'/'+unit;
}
export function canUsePatrolTactic(state,key,unit,team,shocked) {
  const t=tactics[key],p=state.patrol;
  if (!t || !p?.spent || !p.tactics || state.status!=='playing' || t.team!==team || state.step!==t.step || shocked || !(state.cp?.[team]>=1)) return false;
  if ((t.own && team!==state.active) || (t.opponent && team===state.active) || p.spent[key]===phaseKey(state) || unitTargetedByStratagem(state,unit)) return false;
  return true;
}
function payTactic(state,key,unit,team,shocked){
  if(!canUsePatrolTactic(state,key,unit,team,shocked))return null;
  const p=state.patrol;
  return {...state,cp:{...state.cp,[team]:state.cp[team]-1},patrol:{...p,
    spent:{...p.spent,[key]:phaseKey(state)},tactics:{...p.tactics,[key]:phaseKey(state)+'/'+unit}}};
}
export function useTactic(state,key,unit,team,shocked){
  if(key==='shockCharge'||key==='crush'||key==='precision'||state.terrifyingCharge)return null;
  return payTactic(state,key,unit,team,shocked);
}
// Both starter cards specify the moment the target unit is selected to fight.
// A saved activation without a payment receipt has already passed that moment.
export function fightSelectionTactic(state,unit,team){
  if(state.fightSequence?.active||state.fightSequence?.counterAfter||state.declaration||state.fightPlan||state.hazard)return null;
  const order=state.units?.[unit];
  if(order?.finishedAttack===4||Object.values(order?.attacks??{}).some(rows=>rows.some(r=>!r.ranged)))return null;
  const key=team==='orks'?'crush':'precision';
  return canUsePatrolTactic(state,key,unit,team,order?.shocked)?key:null;
}
export function payFightSelectionTactic(state,sequence,team,key){
  const unit=sequence.active.unit;
  if(key!==fightSelectionTactic(state,unit,team))return null;
  return payTactic(state,key,unit,team,state.units[unit]?.shocked);
}
export function payTerrifyingCharge(state,unit){
  if(state.terrifyingCharge?.unit!==unit)return null;
  return payTactic(state,'shockCharge',unit,'marines',state.units?.[unit]?.shocked);
}
export function effectProfile(state,piece,base,unit,shocked) {
  const armour=piece.kind==='wartrakk' && state.patrol?.enhanced?.armour;
  let invul=armour?4:base.invul;
  if (tacticActive(state,'med',unit)) invul=invul ? Math.min(invul,5) : 5;
  return {...base,save:armour?3:base.save,invul,
    oc:shocked?0:base.oc+Number(piece.faction==='marines' && !!state.patrol)};
}
export function effectWeapon(state,piece,weapon,unit) {
  const rapid=state.patrol?.enhanced?.veterans && piece.kind==='intercessor' && weapon.name==='볼트 라이플';
  const crush=weapon.range===0 && tacticActive(state,'crush',unit);
  return {...weapon,rapid:rapid?1:weapon.rapid,strength:weapon.strength+Number(crush),
    precision:weapon.precision || (weapon.range===0 && (tacticActive(state,'precision',unit) ||
      epicPrecisionForUnit(state,piece,unit)))};
}

export function epicPrecisionForUnit(state,piece,unit) {
  return state.status==='playing' && state.step===4 && state.units?.[unit]?.epicChallengeModel===piece.id &&
    tacticActive(state,'epicChallenge-'+piece.faction,unit);
}
