import {unitId} from '../rules/profiles.mjs';
import {groupId} from '../rules/battle.mjs';

// Core 06.01 ignores other models in the two endpoint units. The observer
// itself is hidden because the camera sits inside its sculpt.
export function sightHiddenPieces(table,pair){
  const hidden=new Set();
  if(!pair)return hidden;
  const observer=table.pieces.find(p=>p.id===pair[0]&&!p.removed);
  const target=table.pieces.find(p=>p.id===pair[1]&&!p.removed);
  if(!observer||!target||observer===target)return hidden;
  hidden.add(observer.id);
  if(observer.faction==='terrain'||target.faction==='terrain')return hidden;
  // Handbook units are printed in each scenario, independently of the
  // attachments in the player's saved Combat Patrol.
  const unit=table.training||!table.rules?.attachments?unitId:p=>groupId(table.rules,p);
  const from=unit(observer),to=unit(target);
  for(const p of table.pieces){
    if(p.id===target.id||p.removed||p.faction==='terrain')continue;
    const group=unit(p);
    if(p.faction===observer.faction&&group===from||p.faction===target.faction&&group===to)hidden.add(p.id);
  }
  return hidden;
}
