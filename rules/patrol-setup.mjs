import {opposite,roll} from './battle.mjs';
import {createTable} from '../data/catalog.mjs';

// Combat Patrol Mission Sequence 2–8, Warhammer 40,000 app 2.7.1:
// https://wahapedia.ru/wh40k11ed_cp/the-rules/combat-patrol-mission/
// https://www.warhammer-community.com/en-gb/articles/2akzkx92/combat-patrol-is-now-live-in-your-app/
// In all three diagrams the blue shield is the Defender's edge. The players
// agree how the diagram faces the physical table before rolling for roles.
const teams=['marines','orks'];
const roles=['attacker','defender'];
const die=value=>Number.isInteger(value)&&value>=1&&value<=6;
const fields=(value,keys)=>value!==null&&typeof value==='object'&&
  [Object.prototype,null].includes(Object.getPrototypeOf(value))&&
  Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));

export function newPatrolSetup(){
  return {version:4,layoutDie:null,roleRolls:[],roleChoice:null,
    formationsRevealed:false,deploymentComplete:false,firstRolls:[]};
}

// A saved official game keeps the same terrain for deployment, movement,
// sight, and replay. Custom tables use the current cast at their saved pose.
export function patrolTerrainPiece(piece,version){
  if(piece.id!=='smallRuin-1')return piece;
  if([1,2,3].includes(version))return {...piece,previousSmallRuin:true,baseWidth:2.5,baseDepth:1.4};
  if(!piece.previousSmallRuin)return piece;
  const current=createTable().pieces.find(p=>p.id===piece.id);
  return {...piece,previousSmallRuin:false,baseWidth:current.baseWidth,baseDepth:current.baseDepth};
}

// Each pair preserves both players' rolls, always [Marines, Orks]. A tie
// requires another pair. A decisive roll ends that particular roll-off.
function rollOffWinner(rolls){
  const pair=rolls.at(-1);
  if(!pair||pair[0]===pair[1])return null;
  return pair[0]>pair[1]?'marines':'orks';
}

function validRolls(rolls){
  if(!Array.isArray(rolls))return false;
  for(const [i,pair] of rolls.entries()){
    if(!Array.isArray(pair)||pair.length!==2||!die(pair[0])||!die(pair[1]))return false;
    if(i<rolls.length-1&&pair[0]!==pair[1])return false;
  }
  return true;
}

export function validatePatrolSetup(s){
  if(!fields(s,['version','layoutDie','roleRolls','roleChoice','formationsRevealed','deploymentComplete','firstRolls'])||
    ![1,2,3,4].includes(s.version)||s.layoutDie!==null&&!die(s.layoutDie)||
    !validRolls(s.roleRolls)||!validRolls(s.firstRolls)||
    typeof s.formationsRevealed!=='boolean'||typeof s.deploymentComplete!=='boolean')return false;
  if(s.roleRolls.length&&s.layoutDie===null)return false;
  if(s.roleChoice!==null&&(!fields(s.roleChoice,['team','role'])||
    !teams.includes(s.roleChoice.team)||s.roleChoice.team!==rollOffWinner(s.roleRolls)||
    !roles.includes(s.roleChoice.role)))return false;
  return !(s.formationsRevealed&&!s.roleChoice||s.deploymentComplete&&!s.formationsRevealed||
    s.firstRolls.length&&!s.deploymentComplete);
}

export function patrolSetupView(s){
  if(!validatePatrolSetup(s))throw Error('컴뱃 패트롤 준비 기록을 확인하세요.');
  const map=s.layoutDie===null?null:['A','B','C'][Math.floor((s.layoutDie-1)/2)];
  const roleWinner=rollOffWinner(s.roleRolls),first=rollOffWinner(s.firstRolls);
  const defender=s.roleChoice?(s.roleChoice.role==='defender'?roleWinner:opposite(roleWinner)):null;
  let stage='ready';
  if(!map)stage='layout';
  else if(!roleWinner)stage='role-roll';
  else if(!defender)stage='role-choice';
  else if(!s.formationsRevealed)stage='formations';
  else if(!s.deploymentComplete)stage='deployment';
  else if(!first)stage='first-roll';
  return {stage,map,roleWinner,attacker:defender?opposite(defender):null,defender,blue:defender,first};
}

// The parent session reports the two checkpoints only when its existing
// formation/reveal and alternating-deployment procedures have finished.
// It starts a five-round battle after any pre-battle abilities are resolved.
export function applyPatrolSetup(s,action,d6=()=>roll(6)){
  const {stage,roleWinner}=patrolSetupView(s);
  const valid=action?.type==='choose-role'?fields(action,['type','team','role']):fields(action,['type']);
  if(!valid)throw Error('준비 행동과 입력 항목을 확인하세요.');
  const nextDie=()=>{
    const value=d6();if(!die(value))throw new RangeError('준비 굴림은 1~6의 D6입니다.');
    return value;
  };
  switch(action.type){
    case 'roll-layout':
      if(stage==='layout')return {...s,layoutDie:nextDie()};
      break;
    case 'roll-role':
      if(stage==='role-roll')return {...s,roleRolls:[...s.roleRolls,[nextDie(),nextDie()]]};
      break;
    case 'choose-role':
      if(stage==='role-choice'&&action.team===roleWinner&&roles.includes(action.role))
        return {...s,roleChoice:{team:action.team,role:action.role}};
      break;
    case 'formations-revealed':
      if(stage==='formations')return {...s,formationsRevealed:true};
      break;
    case 'deployment-complete':
      if(stage==='deployment')return {...s,deploymentComplete:true};
      break;
    case 'roll-first':
      if(stage==='first-roll')return {...s,firstRolls:[...s.firstRolls,[nextDie(),nextDie()]]};
      break;
  }
  throw Error('현재 단계에서 선택할 수 없는 컴뱃 패트롤 준비 행동입니다.');
}
