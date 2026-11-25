import {unitTargetedByStratagem} from './patrol.mjs';

const kinds=new Set(['advance','charge','damage','hazard','hit','save','wound','attacks']);
const phase=state=>[state.round,state.active,state.step].join('-');

export function canCommandReroll(state,unit,team){
  return state.status==='playing'&&!!state.patrol&&['marines','orks'].includes(team)&&
    (state.cp?.[team]??0)>=1&&!state.units?.[unit]?.shocked&&
    state.patrol.spent?.['commandReroll-'+team]!==phase(state)&&!unitTargetedByStratagem(state,unit);
}

export function acceptMovementRoll(state){
  const move=!!state.movePlan?.commandRerollOpen,field=move?'movePlan':'chargePlan';
  if(!state[field]?.commandRerollOpen)return state;
  const plan={...state[field]};delete plan.commandRerollOpen;
  if(move)plan.rerollClosed=true;
  return {...state,[field]:plan};
}

// The calling roll sequence owns the timing window. Raw dice stay in their
// original order; "rerolled" identifies indices already used by any rule.
export function useCommandReroll(state,event,index,random=Math.random){
  const {kind,unit,team,sides,dice,rerolled=[]}=event;
  if(!kinds.has(kind)||![3,6].includes(sides)||!Array.isArray(dice)||!dice.length||
    !dice.every(n=>Number.isInteger(n)&&n>=1&&n<=sides)||!canCommandReroll(state,unit,team))return null;
  const charge=kind==='charge';
  if(charge&&(dice.length!==2||sides!==6))return null;
  if(!Number.isInteger(index)||index<0||index>=dice.length)return null;
  const indices=charge?[0,1]:[index];
  if(indices.some(i=>rerolled.includes(i)))return null;
  const result=[...dice];
  for(const i of indices)result[i]=1+Math.floor(random()*sides);
  const patrol=state.patrol,key='commandReroll-'+team,stamp=phase(state);
  return {dice:result,rerolled:[...rerolled,...indices],rules:{...state,cp:{...state.cp,[team]:state.cp[team]-1},
    patrol:{...patrol,spent:{...patrol.spent,[key]:stamp},tactics:{...patrol.tactics,[key]:stamp+'/'+unit}}}};
}
