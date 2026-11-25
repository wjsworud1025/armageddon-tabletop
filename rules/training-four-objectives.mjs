// Starter Set Handbook pp. 72–75, photographed by Sprues & Brews at 15:33:
// https://www.youtube.com/watch?v=TKObcaZUZbw&t=933s
// A tied OC total has no unique highest side; the handbook gives no tiebreak.
// Shock checks, OC loss and recovery use 11th-edition Core Rules 01.06–07,
// 08.03 and the Starting Strength and Half-strength appendix table.
import {createTable} from '../data/catalog.mjs';
import {overlapsArea} from '../layouts.mjs';
import {getProfile,unitId} from './profiles.mjs';
import {currentHP,needsShock,shockTest,controlObjective,opposite} from './battle.mjs';

const memberCounts={captain:1,intercessor:5,landSpeeder:1,warboss:1,boy:10,gretchin:5,wartrakk:1};
const roster=createTable().pieces.filter(p=>p.variant<(memberCounts[p.kind]??0));
const names={captain:'캡틴',intercessor:'인터세서',landSpeeder:'랜드 스피더',warboss:'워보스','boy-0':'보이',gretchin:'그레친',wartrakk:'워트랙'};
const byUnit=new Map(Object.keys(names).map(key=>[key,roster.filter(p=>unitId(p)===key)]));
const requireRule=(ok,message)=>{if(!ok)throw new Error(message);};
const isDie=n=>Number.isInteger(n)&&n>=1&&n<=6;
const roundOK=n=>Number.isInteger(n)&&n>=1&&n<=5;
const teams=['orks','marines'];


export const trainingFourRosterIds=Object.freeze(roster.map(p=>p.id));

export function newTrainingFourObjectives(){return {turns:[]};}

export function trainingFourNextTurn(round,active){
  if(!roundOK(round)||!teams.includes(active))throw new Error('훈련 4의 라운드와 진영을 확인하세요.');
  if(active==='orks')return {round,active:'marines',phase:'command'};
  return round<5?{round:round+1,active:'orks',phase:'command'}:null;
}

export function trainingFourShocked(mission){
  const shocked={};
  for(const turn of mission.turns)for(const {unit,dice,target} of turn.checks){
    if(dice[0]+dice[1]<target)shocked[unit]=true;else delete shocked[unit];
  }
  return shocked;
}

function checksFor(shocked){
  return Object.fromEntries(Object.keys(shocked).map(key=>[key,{shocked:true}]));
}

// Members absent from a scene projection count as lost. Keep the full original
// unit for the half-strength calculation, including previously removed models.
function forces(pieces){
  const scene=new Map(pieces.map(p=>[p.id,p]));
  return roster.map(p=>scene.get(p.id)??{...p,removed:true});
}

function scoreRows(areas,team){
  const enemy=opposite(team);
  let own=0,opposing=0;
  for(const a of areas){
    if(a[team]>a[enemy])own++;
    if(a[enemy]>a[team])opposing++;
  }
  const conditions=[own>=1,own>=2,own>opposing];
  return {own,opposing,conditions,points:5*conditions.filter(Boolean).length};
}

export function trainingFourVP(mission){
  const vp={orks:0,marines:0};
  for(const turn of mission.turns)if(turn.areas!==null)vp[turn.team]+=scoreRows(turn.areas,turn.team).points;
  return vp;
}

// The map supplies the terrain pieces currently assigned to each printed
// terrain area. A bare printed area can never award points. Coordinates use
// world inches and each polygon contains [x,z] points (like layouts.mjs).
export function trainingFourControl(s,pieces,areas){
  const ids=new Set(),liveTerrain=new Set(pieces.filter(p=>p.faction==='terrain'&&!p.removed).map(p=>p.id));
  const shocked=trainingFourShocked(s.mission),models=forces(pieces).filter(p=>currentHP(s,p)>0);
  const controlled=[];
  for(const area of areas){
    requireRule(typeof area.id==='string'&&area.id.length>0&&!ids.has(area.id),'훈련 4 거점 ID가 중복되거나 비어 있습니다.');
    ids.add(area.id);
    requireRule(Array.isArray(area.terrainIds)&&Array.isArray(area.polygon)&&area.polygon.length>=3&&
      area.polygon.every(v=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite)),'훈련 4의 지형 구역을 확인하세요.');
    if(!area.terrainIds.some(id=>liveTerrain.has(id)))continue;
    const totals={orks:0,marines:0};
    for(const p of models)if(!shocked[unitId(p)]&&overlapsArea(p,area.polygon))totals[p.faction]+=getProfile(p).oc;
    controlled.push({id:area.id,name:area.name??area.id,...totals,controller:controlObjective(totals.marines,totals.orks)});
  }
  return controlled;
}

export function trainingFourOutcome(s,pieces,{endOfTurn=false}={}){
  const alive=new Set(forces(pieces).filter(p=>currentHP(s,p)>0).map(p=>p.faction));
  if(alive.size===2&&!(endOfTurn&&s.round===5&&s.active==='marines'))return null;
  const vp=trainingFourVP(s.mission);
  return controlObjective(vp.marines,vp.orks)??'draw';
}

function currentTurn(s){
  const last=s.mission.turns.at(-1);
  if(last&&last.round===s.round&&last.team===s.active)return last;
  const expected=last&&last.areas!==null?trainingFourNextTurn(last.round,last.team):
    !last?{round:1,active:'orks'}:null;
  if(expected?.round!==s.round||expected?.active!==s.active)return null;
  return {round:s.round,team:s.active,checks:[],areas:null};
}

export function trainingFourCommandView(s,pieces,areas){
  const vp=trainingFourVP(s.mission),shocked=trainingFourShocked(s.mission);
  const control=trainingFourControl(s,pieces,areas);
  const inactive={vp,shocked,options:[],finished:false,areas:control,control:[],award:null};
  if(s.phase!=='command'||(s.scenario!==undefined&&s.scenario!==4)||s.winner||trainingFourOutcome(s,pieces))return inactive;
  const turn=currentTurn(s);
  if(!turn)return inactive;
  if(turn.areas!==null)return {...inactive,finished:true,control:turn.areas.map(a=>({...a,controller:controlObjective(a.marines,a.orks)})),award:scoreRows(turn.areas,s.active)};
  const rules={hp:s.hp,units:checksFor(shocked),attachments:{}},models=forces(pieces),checked=new Set(turn.checks.map(r=>r.unit));
  const required=[...byUnit.keys()].filter(key=>{
    const members=models.filter(p=>unitId(p)===key);
    return members[0].faction===s.active&&!checked.has(key)&&needsShock(rules,members);
  });
  const options=required.length?required.map(unit=>({type:'four-shock',unit,label:names[unit]+' 전장 충격 검사'})):
    [{type:'four-score',label:'거점 승점 확정'}];
  return {...inactive,control,options,award:required.length?null:scoreRows(control,s.active)};
}

export function applyTrainingFourCommand(s,pieces,areas,action,d6=()=>1+Math.floor(Math.random()*6)){
  const view=trainingFourCommandView(s,pieces,areas);
  requireRule(view.options.some(o=>o.type===action?.type&&o.unit===action.unit),'지금 처리할 수 없는 훈련 4 지휘 행동입니다.');
  const turn=currentTurn(s),rolls=[];
  let next;
  if(action.type==='four-shock'){
    const members=forces(pieces).filter(p=>unitId(p)===action.unit);
    const {dice,target,passed}=shockTest({hp:s.hp},members,()=>{
      const value=d6();requireRule(isDie(value),'전장 충격 검사의 D6 결과를 확인하세요.');return (value-.5)/6;
    });
    next={...turn,checks:[...turn.checks,{unit:action.unit,dice,target}]};
    rolls.push({unit:action.unit,actor:s.active,step:'shock',dice,threshold:target,successes:Number(passed)});
  }else next={...turn,areas:view.control.map(({id,marines,orks})=>({id,marines,orks}))};
  const prior=s.mission.turns.at(-1)===turn?s.mission.turns.slice(0,-1):s.mission.turns;
  return {mission:{turns:[...prior,next]},rolls,finished:next.areas!==null,award:view.award};
}

// A save stores the actual leadership dice and the OC totals at that scoring
// instant. A scene integration can additionally replay past actions/poses to
// authenticate those totals against its historical battlefield.
export function validTrainingFourObjectives(mission){
  const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const keys=(v,allowed)=>plain(v)&&Object.keys(v).length===allowed.length&&allowed.every(k=>Object.hasOwn(v,k));
  if(!keys(mission,['turns'])||!Array.isArray(mission.turns)||mission.turns.length>10)return false;
  for(const [i,t] of mission.turns.entries()){
    if(!keys(t,['round','team','checks','areas'])||t.round!==1+Math.floor(i/2)||t.team!==teams[i%2]||
       !Array.isArray(t.checks)||t.checks.length>byUnit.size||new Set(t.checks.map(c=>c?.unit)).size!==t.checks.length)return false;
    for(const check of t.checks){
      if(!keys(check,['unit','dice','target'])||!Array.isArray(check.dice)||check.dice.length!==2||!check.dice.every(isDie))return false;
      const models=byUnit.get(check.unit);
      if(!models||models[0].faction!==t.team||!models.some(p=>getProfile(p).leadership===check.target))return false;
    }
    if(t.areas===null){if(i+1!==mission.turns.length)return false;continue;}
    if(!Array.isArray(t.areas)||new Set(t.areas.map(a=>a?.id)).size!==t.areas.length)return false;
    for(const a of t.areas){
      if(!keys(a,['id','marines','orks'])||typeof a.id!=='string'||!a.id.length)return false;
      for(const team of teams){
        const max=roster.filter(p=>p.faction===team).reduce((sum,p)=>sum+getProfile(p).oc,0);
        if(!Number.isInteger(a[team])||a[team]<0||a[team]>max)return false;
      }
    }
  }
  return true;
}
