import {unitId} from './profiles.mjs';
import {currentHP,groupId,modelProfile,engaged,controlObjective} from './battle.mjs';

export const patrolMissions={marines:'Honour the Chapter',orks:"Duff ’em Up!"};
import {playerTurnNumber as turnNumber} from './ranged-history.mjs';
export function recordLosses(state,pieces) {
  if (state.status!=='playing') return state;
  const present=new Set();
  const army={};
  for (const p of pieces) {
    if (p.faction==='terrain') continue;
    const group=unitId(p);
    army[group]=p.faction;
    if (currentHP(state,p)>0 || state.reserves?.[groupId(state,p)]?.includes(p.id)) present.add(group);
  }
  const previous=state.destroyedUnits||{}, dead={};
  const events=[...(state.lossEvents||[])];
  for (const [id,faction] of Object.entries(army)) {
    if (present.has(id)) continue;
    dead[id]=true;
    if (!previous[id]) events.push({id,faction,turn:turnNumber(state)});
  }
  return {...state,destroyedUnits:dead,lossEvents:events};
}

export function objectiveSnapshot(state,pieces,areas,distance) {
  const live=pieces.filter(p=>p.faction!=='terrain' && currentHP(state,p)>0 && !state.reserves?.[groupId(state,p)]?.includes(p.id));
  const byId=new Map(live.map(p=>[p.id,p]));
  const engagedGroups=new Set();
  if (distance) {
    // Grab Dat Scrap comes from the Boyz bodyguard. Any living member of
    // their attached unit can put that unit in engagement (03.04, 19.04).
    const boyz=new Set(live.filter(p=>p.kind==='boy').map(p=>groupId(state,p)));
    const marines=live.filter(p=>p.faction==='marines');
    for (const ork of live.filter(p=>p.faction==='orks')) {
      const unit=groupId(state,ork);
      if (boyz.has(unit) && !engagedGroups.has(unit) &&
        marines.some(enemy=>engaged(ork,enemy,distance(ork.id,enemy.id)))) engagedGroups.add(unit);
    }
  }
  return Object.fromEntries(areas.map(area=>{
    const members=[...new Set(area.members)].map(id=>byId.get(id)).filter(Boolean);
    const totals={marines:0,orks:0};
    for (const p of members) {
      const group=groupId(state,p);
      totals[p.faction]+=modelProfile(state,p).oc+
        Number(engagedGroups.has(group) && !state.units[group]?.shocked);
    }
    const old=state.objectives?.[area.id]?.secured || null;
    const owner=controlObjective(totals.marines,totals.orks,old);
    let secured=old===owner?old:null;
    const weirdboy=live.find(p=>p.kind==='weirdboy');
    if (state.active==='orks' && state.step===0 && owner==='orks' && weirdboy &&
      members.some(p=>groupId(state,p)===groupId(state,weirdboy) && modelProfile(state,p).oc>0)) secured='orks';
    return [area.id,{name:area.name,home:area.home,marineOC:totals.marines,orkOC:totals.orks,owner,secured}];
  }));
}
export function missionAward(state,objectives) {
  if(state.rallyPlan)return 0;
  const team=state.active;
  let vp=0;
  const fifth=state.round===5;
  const objectiveWindow=state.round>=2 && ((fifth && state.step===5) || (!fifth && state.step===0));
  if (objectiveWindow) {
    const mine=objectives.filter(area=>area.owner===team);
    const enemy=objectives.filter(area=>area.owner && area.owner!==team);
    const away=mine.filter(area=>area.home!==team);
    if (team==='marines') {
      if (mine.length && mine.length>=enemy.length) vp+=5;
      if (away.length>=2) vp+=10;
    } else {
      if (away.length) vp+=5;
      if (mine.some(area=>area.home==='marines')) vp+=5;
    }
  }
  if (state.step===5 && team==='orks' && state.lossEvents?.some(e=>
    e.faction==='marines' && e.turn>=turnNumber(state)-1 && e.turn<=turnNumber(state))) vp+=5;
  return vp;
}
