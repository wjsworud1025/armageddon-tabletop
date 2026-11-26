import {currentHP,engaged,groupId,opposite} from './battle.mjs';
import {getProfile} from './profiles.mjs';
import {unitTargetedByStratagem} from './patrol.mjs';
import {measureFootprints} from '../ruler.mjs';

// 15.08–09, p. 57. This is always the moving player's Movement phase.
const phase=s=>[s.round,s.active,s.step].join('-');
const fighters=(s,pieces)=>pieces.filter(p=>getProfile(p)&&currentHP(s,p)>0);
const separation=(a,b)=>measureFootprints(a,b).distance;
const reaches=(friends,enemies,limit)=>friends.some(a=>enemies.some(b=>separation(a,b)<=limit+1e-7));
const tied=(friends,enemies)=>friends.some(a=>enemies.some(b=>engaged(a,b,separation(a,b))));
const during=s=>s.status==='playing'&&s.step===1;
export const isOverwatchShooting=s=>during(s)&&s.overwatch?.stage==='shoot';

export function overwatchUnitReady(s,pieces,unit){
  const alive=fighters(s,pieces),team=opposite(s.active);
  const members=alive.filter(p=>p.faction===team&&groupId(s,p)===unit);
  // The starter patrols contain no Titanic units.
  return during(s)&&!s.units[unit]?.shocked&&members.some(p=>getProfile(p).weapons.some(w=>w.range>0))&&
    !tied(members,alive.filter(p=>p.faction===s.active));
}
export function overwatchUnits(s,pieces){
  if(!during(s)||!s.patrol?.spent||!s.patrol.tactics||!s.units||!s.hp||!s.attachments||
    s.movePlan||s.reinforcePlan||s.declaration||s.hazard||s.shootingReaction||s.reactionPlan||
    s.overwatch&&s.overwatch.stage!=='offer')return [];
  const team=opposite(s.active);
  if(!(s.cp?.[team]>=1)||s.patrol.spent['overwatch-'+team]===phase(s))return [];
  const groups=new Set(pieces.filter(p=>p.faction===team&&getProfile(p)).map(p=>groupId(s,p)));
  return [...groups].filter(unit=>!unitTargetedByStratagem(s,unit)&&overwatchUnitReady(s,pieces,unit));
}
export function openOverwatch(s,pieces){
  if(s.overwatch||!overwatchUnits(s,pieces).length)return null;
  return {...s,overwatch:{stage:'offer',team:opposite(s.active),unit:null}};
}
export function beginOverwatch(s,pieces,unit){
  if(s.overwatch?.stage!=='offer'||!overwatchUnits(s,pieces).includes(unit))return null;
  const team=opposite(s.active),key='overwatch-'+team,stamp=phase(s);
  if(s.overwatch.team!==team)return null;
  const next={...s,overwatch:{stage:'shoot',team,unit},cp:{...s.cp,[team]:s.cp[team]-1},
    patrol:{...s.patrol,spent:{...s.patrol.spent,[key]:stamp},tactics:{...s.patrol.tactics,[key]:stamp+'/'+unit}}};
  if(s.shootingSight){
    const keys=new Set(pieces.filter(p=>groupId(s,p)===unit).map(p=>p.id));
    const pairs=Object.fromEntries(Object.entries(s.shootingSight.pairs).filter(([id])=>keys.has(id)));
    if(Object.keys(pairs).length)next.shootingSight={...s.shootingSight,pairs};
    else delete next.shootingSight;
  }
  return next;
}
export function declineOverwatch(s){
  if(!during(s)||!['offer','shoot'].includes(s.overwatch?.stage)||s.declaration?.locked||s.hazard)return null;
  const next={...s,overwatch:{...s.overwatch,stage:'done'},declaration:null};
  delete next.shootingSight;
  return next;
}

// Visibility is recorded separately for each shooter. The 24-inch limit measures
// unit to unit, and the weapon's own range measures this shooter to the target unit.
export function overwatchTargetEligible(s,pieces,shooter,target,weapon){
  if(!during(s)||!['offer','shoot'].includes(s.overwatch?.stage)||!getProfile(shooter)||!getProfile(target)||
    !currentHP(s,shooter)||!currentHP(s,target)||shooter.faction!==s.overwatch.team||target.faction!==s.active||!weapon?.range)return false;
  const unit=groupId(s,shooter),key=groupId(s,target);
  if(s.overwatch.unit&&s.overwatch.unit!==unit||s.declaration?.rows?.some(r=>r.target!==key))return false;
  const alive=fighters(s,pieces),friendly=alive.filter(p=>p.faction===shooter.faction),enemy=alive.filter(p=>p.faction===target.faction);
  const members=friendly.filter(p=>groupId(s,p)===unit),targets=enemy.filter(p=>groupId(s,p)===key);
  // 04.02 requires an unengaged target. The engaged vehicle exception (17.03)
  // applies only in the shooting player's own Shooting phase.
  return !tied(members,enemy)&&!tied(targets,friendly)&&reaches(members,targets,24)&&reaches([shooter],targets,weapon.range);
}
