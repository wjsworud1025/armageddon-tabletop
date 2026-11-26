import {currentHP,engaged,groupId,unitMembers} from './battle.mjs';
import {measureFootprints} from '../ruler.mjs';

// Core 24.16, p.82. Check the firing unit, including attached leaders.
// The distance limit belongs to each surviving model's path this turn.
export function heavyStatus(state,pieces,actor,weapon){
  if(!actor||!weapon?.heavy)return {status:'none',reason:'weapon'};
  if(state.status!=='playing'||state.step!==2||state.active!==actor.faction)
    return {status:'inactive',reason:'phase'};
  const unit=state.units?.[groupId(state,actor)]??{};
  if(unit.reinforcing)return {status:'inactive',reason:'setup'};
  const members=unitMembers(state,pieces,actor).filter(p=>currentHP(state,p)>0);
  const enemies=pieces.filter(p=>p.faction!=='terrain'&&p.faction!==actor.faction&&currentHP(state,p)>0);
  if(members.some(p=>enemies.some(q=>engaged(p,q,measureFootprints(p,q).distance))))
    return {status:'inactive',reason:'engaged'};
  if(members.some(p=>unit.heavyTravel?.[p.id]>3+1e-7))return {status:'inactive',reason:'distance'};
  if(unit.movement!=='remain'&&(!unit.heavyTravel||
      unit.movement&&members.some(p=>!Object.hasOwn(unit.heavyTravel,p.id))))
    return {status:'unknown',reason:'unknown'};
  return {status:'active',reason:'eligible'};
}
