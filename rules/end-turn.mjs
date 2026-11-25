import {coherency} from '../movement.mjs';
import {currentHP,groupId} from './battle.mjs';

// Core 03.03. Recalculate after each removal: the controlling player can
// choose any surviving model in the affected unit, including a leader.
export function brokenFormations(state,pieces){
  if(state.status!=='playing'||state.step!==5)return [];
  const formations=new Map();
  for(const p of pieces){
    if(p.faction==='terrain'||!currentHP(state,p))continue;
    const id=groupId(state,p);
    if(state.reserves?.[id]?.includes(p.id))continue;
    if(!formations.has(id))formations.set(id,[]);
    formations.get(id).push(p);
  }
  return [...formations.values()].filter(models=>!coherency(models).ok);
}

export function removeForCoherency(state,pieces,id){
  const models=brokenFormations(state,pieces).find(group=>group.some(p=>p.id===id));
  if(!models)return null;
  const piece=models.find(p=>p.id===id);
  return {rules:{...state,hp:{...state.hp,[id]:0}},removed:{[id]:true},message:piece.name+' · 턴 종료 응집도 이탈로 제거'};
}
