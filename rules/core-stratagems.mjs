import {character,currentHP,groupId,needsShock} from './battle.mjs';
import {epicPrecisionForUnit,unitTargetedByStratagem} from './patrol.mjs';

// Core Rules (11th ed.), 01.07 and 15.01–15.04, pp. 54–56.

function spend(state,key,team,unit,unitChanges){
  const phase=[state.round,state.active,state.step].join('-');
  const patrol=state.patrol,playerKey=key+'-'+team;
  if(state.status!=='playing'||!(state.cp[team]>=1)||state.units[unit]?.shocked||
    unitTargetedByStratagem(state,unit)||patrol.spent[playerKey]===phase)return null;
  return {...state,cp:{...state.cp,[team]:state.cp[team]-1},
    units:{...state.units,[unit]:{...state.units[unit],...unitChanges}},
    patrol:{...patrol,spent:{...patrol.spent,[playerKey]:phase},
      tactics:{...patrol.tactics,[playerKey]:phase+'/'+unit}}};
}

export function useInsaneBravery(state,pieces,unit){
  if(state.step!==0||state.units[unit]?.shockChecked||
    Object.hasOwn(state.patrol.spent,'insaneBravery-'+state.active))return null;
  // The starting-strength appendix (p. 86) counts casualties in the original roster.
  const members=pieces.filter(p=>p.faction===state.active&&groupId(state,p)===unit);
  if(!needsShock(state,members))return null;
  return spend(state,'insaneBravery',state.active,unit,{shocked:false,shockChecked:true});
}

export function useEpicChallenge(state,pieces,characterId){
  const selected=state.fightSequence?.active;
  if(state.step!==4||!selected||state.declaration||state.hazard||state.fightPlan)return null;
  // Selecting an overrun fight opens the window before its optional extra pile-in.
  if(selected.kind==='overrun'&&!selected.extraPile)return null;
  const model=pieces.find(p=>p.id===characterId);
  if(!model||!character(model)||currentHP(state,model)<=0||groupId(state,model)!==selected.unit)return null;
  const order=state.units[selected.unit];
  if(order?.finishedAttack===4||Object.values(order?.attacks??{}).some(rows=>rows.some(r=>!r.ranged)))return null;
  return spend(state,'epicChallenge',model.faction,selected.unit,{epicChallengeModel:model.id});
}

// Use alongside the weapon's printed abilities and the unit-wide patrol stratagem.
export function hasEpicPrecision(state,piece,weapon){
  return weapon.range===0&&epicPrecisionForUnit(state,piece,groupId(state,piece));
}
