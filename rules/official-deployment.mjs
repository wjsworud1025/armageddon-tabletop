import {groupId,opposite,startBattle} from './battle.mjs';
import {coherency,sweptGap} from '../movement.mjs';
import {applyLayout,layoutGeometry,layoutScenery,validDeployment} from '../layouts.mjs';
import {applyPatrolSetup,patrolSetupView} from './patrol-setup.mjs';
import {newPatrolFormations,actPatrolFormation} from './patrol-formations.mjs';
import {patrolTerrainPlacement,patrolTerrainLevels} from './patrol-terrain-placement.mjs';

export const officialPreparing=rules=>!!rules?.officialSetup&&rules.status==='setup';
const fighters=game=>game.pieces.filter(p=>p.faction!=='terrain'&&!p.removed);
// The solid plinth in assets/sculpt.mjs is 0.12 inches thick before decoration.
const baseThickness=.12;
export function remainingPatrolUnits(game){
  const r=game.rules,placed=r.deployment?.placed??[];
  return [...new Set(fighters(game).filter(p=>!placed.includes(groupId(r,p))).map(p=>groupId(r,p)))];
}
export function pendingPatrolPiece(r,p){
  return !!(p&&!p.removed&&p.faction!=='terrain'&&r?.deployment?.pending&&groupId(r,p)===r.deployment.pending);
}
export function visiblePatrolPiece(r,p){
  return !p.removed&&(p.faction==='terrain'||!!r.deployment&&
    (pendingPatrolPiece(r,p)||r.deployment.placed.includes(groupId(r,p))));
}
export function patrolPlacementError(game){
  const r=game.rules,d=r.deployment,all=fighters(game),unit=all.filter(p=>pendingPatrolPiece(r,p));
  return unitPlacementError(game,unit,all.filter(p=>d.placed.includes(groupId(r,p))));
}
function unitPlacementError(game,unit,bodies){
  if(!unit.length)return '배치할 분대를 고르세요.';
  if(unit.some(p=>!validDeployment(game,p)))return '모든 베이스를 배치 구역 안에 놓으세요.';
  const formation=coherency(unit);
  if(!formation.ok)return formation.errors[0].message;
  const terrain=game.pieces.filter(p=>p.faction==='terrain');
  for(const p of unit){
    const support=patrolTerrainPlacement(p,terrain);
    if(support.error)return support.error;
    if(bodies.some(q=>Math.abs((q.elevation??0)-(p.elevation??0))<baseThickness-1e-6&&sweptGap(p,p,q)<-1e-6))
      return '다른 모델의 베이스와 겹칩니다.';
    bodies.push(p);
  }
  return '';
}
export function validPlacedPatrolUnits(game){
  const r=game.rules;
  if(!officialPreparing(r)||!r.deployment)return true;
  const all=fighters(game),bodies=[];
  for(const key of r.deployment.placed){
    if(unitPlacementError(game,all.filter(p=>groupId(r,p)===key),bodies))return false;
  }
  return true;
}

// This is an import-only path. First validate the complete placement against
// the exact old casting, including its footprint, walls and platform.
export function recoverPreviousRuinDeployment(game){
  const r=game.rules,d=r.deployment;
  if(!officialPreparing(r)||!d?.placed.length)return false;
  const ruin=game.pieces.find(p=>p.id==='largeRuin-2');
  const previous={...ruin,baseWidth:5.2,baseDepth:4.10,previousSecondRuin:true};
  if(!validPlacedPatrolUnits({...game,pieces:game.pieces.map(p=>p===ruin?previous:p)}))return false;
  const bodies=[];
  for(const [index,key] of d.placed.entries()){
    const members=fighters(game).filter(p=>groupId(r,p)===key);
    if(!unitPlacementError(game,members,[...bodies])){bodies.push(...members);continue;}
    const elevated=members.filter(p=>p.elevation>0&&!patrolTerrainPlacement(p,[previous]).error);
    let fitted=false;
    // Retain centres wherever possible. If the broken edge moved, test the
    // corresponding position across the ruin's local z axis instead.
    for(const mirror of [false,true]){
      const proposed=new Map();
      for(const p of elevated){
        const c=Math.cos(ruin.yaw),s=Math.sin(ruin.yaw),localZ=s*(p.x-ruin.x)+c*(p.z-ruin.z);
        const offset=mirror?-2*localZ:0;
        const q={...p,x:p.x+s*offset,z:p.z+c*offset};
        const h=patrolTerrainLevels(q,[ruin]).filter(h=>h>0&&Math.abs(h-p.elevation)<.15)
          .sort((a,b)=>Math.abs(a-p.elevation)-Math.abs(b-p.elevation))[0];
        if(h!==undefined)proposed.set(p,{...q,elevation:h});
      }
      if(!proposed.size||unitPlacementError(game,members.map(p=>proposed.get(p)??p),[...bodies]))continue;
      for(const [p,q] of proposed)Object.assign(p,{x:q.x,z:q.z,elevation:q.elevation});
      fitted=true;break;
    }
    if(!fitted){
      // No legal corresponding surface for this entire unit. Resume at its
      // original placement turn, preserving the map and sealed formations.
      r.deployment={...d,placed:d.placed.slice(0,index),next:members[0].faction,pending:key};
      r.officialSetup={...r.officialSetup,deploymentComplete:false,firstRolls:[]};
      game.logs.push('폐허 2의 조형이 바뀌어 '+members[0].name+' 분대부터 배치를 다시 확인합니다.');
      return true;
    }
    bodies.push(...members);
  }
  game.logs.push('기존에 배치한 분대를 폐허 2의 새 상판에 맞췄습니다.');
  return true;
}
function placeUnit(game){
  const r=game.rules,d=r.deployment,error=patrolPlacementError(game);
  if(error)throw Error(error);
  d.placed.push(d.pending);delete d.pending;
  const left=remainingPatrolUnits(game),other=opposite(d.next);
  if(!left.length)r.officialSetup=applyPatrolSetup(r.officialSetup,{type:'deployment-complete'});
  else if(fighters(game).some(p=>p.faction===other&&left.includes(groupId(r,p))))d.next=other;
}
// Each transition returns a detached table: terrain, formations and rules are
// checkpointed together, so a reload cannot expose a partially applied draw.
export function advanceOfficialSetup(original,action,d6){
  if(!officialPreparing(original.rules))throw Error('정식 패트롤 준비 중에 선택하세요.');
  const game=structuredClone(original),r=game.rules,v=patrolSetupView(r.officialSetup);
  if(action.act.startsWith('form-')){
    if(v.stage!=='formations')throw Error('비공개 편성 단계에 선택하세요.');
    const result=actPatrolFormation(r,game.pieces.filter(p=>p.faction!=='terrain'),action);
    game.rules=result.rules;
    if(result.complete){
      for(const p of game.pieces)if(Object.hasOwn(result.removed,p.id))p.removed=result.removed[p.id];
      game.rules.officialSetup=applyPatrolSetup(r.officialSetup,{type:'formations-revealed'});
      game.rules.deployment={defender:v.defender,next:v.defender,placed:[]};
      applyLayout(game,v.map,v.blue);
    }
    return game;
  }
  const key=action.act;
  if(key==='official-select'||key==='official-place'){
    if(v.stage!=='deployment')throw Error('현재는 분대 배치 단계가 아닙니다.');
    if(key==='official-place')placeUnit(game);
    else {
      const d=r.deployment;
      if(!fighters(game).some(p=>groupId(r,p)===action.unit&&p.faction===d.next&&!d.placed.includes(action.unit)))throw Error('현재 배치할 수 있는 분대를 고르세요.');
      d.pending=action.unit;
    }
    return game;
  }
  if(key==='official-start'){
    if(v.stage!=='ready')throw Error('양측 배치와 선공 대결을 마치세요.');
    game.rules=startBattle(r,v.first,5);return game;
  }
  const choose=key==='official-attack'||key==='official-defend';
  const input=choose?{type:'choose-role',team:v.roleWinner,role:key==='official-attack'?'attacker':'defender'}:
    {type:({'official-roll-layout':'roll-layout','official-roll-role':'roll-role','official-roll-first':'roll-first'})[key]};
  r.officialSetup=applyPatrolSetup(r.officialSetup,input,d6);
  const after=patrolSetupView(r.officialSetup);
  if(input.type==='roll-layout'){
    for(const [p,pose] of layoutScenery(game,layoutGeometry(after.map,r.officialSetup.version)))Object.assign(p,pose);
  }
  if(choose){
    game.layout={map:after.map,blue:after.blue};
    r.formations=newPatrolFormations();
  }
  return game;
}
