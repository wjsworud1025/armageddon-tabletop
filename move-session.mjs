import {assessMove} from './movement.mjs';
import {changeUnit,currentHP,groupId,roll,unitMembers} from './rules/battle.mjs';
import {getProfile} from './rules/profiles.mjs';

const moveNames={normal:'일반 이동',advance:'전력 이동',fallback:'후퇴',remain:'정지'};
const point=p=>({x:p.x,z:p.z,elevation:p.elevation??0,yaw:p.yaw??0});
const poseKeys=['x','z','elevation','yaw'];

function movementPhase(game) {
  const rules=game.rules;
  if(rules?.status!=='playing' || rules.step!==1) throw new Error('대전의 이동 페이즈에서 사용할 수 있습니다.');
  return {hp:{},units:{},attachments:{},...rules};
}
function actingModel(game,actor) {
  const id=typeof actor==='string'?actor:actor?.id;
  const p=game.pieces.find(m=>m.id===id);
  if(!p || !getProfile(p) || p.removed || (game.rules.hp?.[p.id]??1)<=0) throw new Error('전장에 있는 모델을 선택하세요.');
  if(p.faction!==game.rules.active) throw new Error('현재 턴 진영의 분대를 선택하세요.');
  return p;
}
function assertValid(assessment) {
  if(assessment.ok) return;
  const error=new Error(assessment.errors.map(e=>
    (e.modelIds.length?e.modelIds.join(', ')+' · ':'')+e.message).join('\n'));
  error.assessment=assessment;
  throw error;
}
function declaration(type,advanceRoll,takeToSkies,fallbackMode) {
  return moveNames[type]+(type==='advance'?' · D6 '+advanceRoll:'')+
    (type==='fallback'?(fallbackMode==='desperate'?' · 필사적 탈출':' · 질서 있는 후퇴'):'')+
    (takeToSkies?' · 비행':'');
}
function view(game,actor) {
  const rules=movementPhase(game), plan=rules.movePlan;
  if(!plan) throw new Error('먼저 분대 이동을 선언하세요.');
  if(actor!==undefined) {
    const p=actingModel(game,actor);
    if(groupId(rules,p)!==plan.unit || !Object.hasOwn(plan.origins,p.id))
      throw new Error('진행 중인 이동은 선언한 분대의 모델만 조정할 수 있습니다.');
  }
  const survivors=game.pieces.filter(p=>Object.hasOwn(plan.origins,p.id) && currentHP(rules,p)>0);
  return {rules,plan,survivors};
}
function assessPlan(game,plan,survivors,phase) {
  const paths=Object.fromEntries(survivors.filter(p=>plan.paths[p.id]).map(p=>[p.id,plan.paths[p.id]]));
  const assessment=assessMove({...plan,game,pieces:survivors,paths,phase,checkEligibility:false});
  assertValid(assessment);
  return assessment;
}
function requireEscapeRolls(plan) {
  if(plan.type==='fallback' && plan.fallbackMode==='desperate' && !plan.desperateEscapeResolved)
    throw new Error('필사적 탈출의 위험 판정과 사상자 배정을 먼저 마치세요.');
}

// The caller commits the returned rules and optional poses together as one edit.
// No view coordinates or state are changed here, including when validation fails.
export function beginMove(game,actor,type,options={}) {
  const rules=movementPhase(game), member=actingModel(game,actor);
  if(rules.movePlan||rules.reinforcePlan) throw new Error('진행 중인 분대 이동이나 예비대 배치를 먼저 마치세요.');
  if(!Object.hasOwn(moveNames,type)) throw new Error('알 수 없는 이동 종류입니다.');
  const unit=groupId(rules,member), existing=rules.units[unit]||{};
  if(existing.movement) throw new Error('이 분대는 이번 턴에 이동을 이미 선언했습니다.');
  if(existing.reinforcing) throw new Error('이번 이동 페이즈에 증원 배치한 분대는 추가 이동할 수 없습니다.');
  const pieces=unitMembers(rules,game.pieces,member).filter(p=>currentHP(rules,p)>0);
  const origins=Object.fromEntries(pieces.map(p=>[p.id,point(p)]));
  const advanceRoll=type==='advance'?(options.advanceRoll??roll()):0;
  const fallbackMode=type==='fallback'?(options.fallbackMode??(existing.shocked?'desperate':'ordered')):'ordered';
  const takeToSkies=options.takeToSkies===true;
  const plan={unit,type,advanceRoll,origins,paths:{},takeToSkies,fallbackMode,desperateEscapeResolved:options.desperateEscapeResolved===true};
  const assessment=assessMove({game,pieces,...plan,phase:'path'});
  assertValid(assessment);
  const order=declaration(type,advanceRoll,takeToSkies,fallbackMode);
  const next=changeUnit(rules,member,{movement:type,order,movementTracked:true});
  return {rules:{...next,movePlan:type==='remain'?null:plan},message:member.name+' · '+order,manual:assessment.manual,assessment};
}

export function appendUnitPaths(plan,survivors,paths) {
  if(!paths || typeof paths!=='object' || Array.isArray(paths)) throw new Error('모델별 경유점 목록이 필요합니다.');
  const nextPaths={...plan.paths};
  for(const [id,added] of Object.entries(paths)) {
    if(!survivors.some(p=>p.id===id) || !Array.isArray(added)) throw new Error('해당 분대의 생존 모델 경로만 편집할 수 있습니다.');
    const route=[...(nextPaths[id]||[])];
    let last=point(route.at(-1)||plan.origins[id]);
    for(const waypoint of added) {
      if(!waypoint || typeof waypoint!=='object' || Array.isArray(waypoint) ||
        Object.keys(waypoint).some(k=>!poseKeys.includes(k) || !Number.isFinite(waypoint[k])))
        throw new Error('잘못된 경유점 좌표입니다.');
      const end={...last,...waypoint};
      if(end.elevation<0 || end.elevation>20) throw new Error('디지털 전장의 높이는 0″부터 20″까지입니다.');
      if(poseKeys.some(k=>last[k]!==end[k])) route.push(end);
      if(route.length>512) throw new Error('모델당 경유점은 512개까지입니다. 현재 경로로 이동을 완료하거나 원점으로 되돌리세요.');
      last=end;
    }
    if(route.length) nextPaths[id]=route;
  }
  return nextPaths;
}

export function proposeMove(game,actor,paths) {
  const {rules,plan,survivors}=view(game,actor);
  requireEscapeRolls(plan);
  const nextPaths=appendUnitPaths(plan,survivors,paths);
  const next={...plan,paths:nextPaths};
  if(plan.type==='advance' && Object.values(nextPaths).some(route=>route.length)) next.rerollClosed=true;
  const assessment=assessPlan(game,next,survivors,'path');
  const poses=Object.fromEntries(Object.keys(paths).map(id=>[id,assessment.models[id].end]));
  return {rules:{...rules,movePlan:next},poses,message:'분대 이동 경로 갱신',manual:assessment.manual,assessment};
}

export function finishMove(game) {
  const {rules,plan,survivors}=view(game);
  if(!survivors.length) return {rules:{...rules,movePlan:null},poses:{},message:'분대 전멸 · 이동 종료',manual:[]};
  requireEscapeRolls(plan);
  const assessment=assessPlan(game,plan,survivors,'finish');
  const poses=Object.fromEntries(Object.entries(assessment.models).map(([id,m])=>[id,m.end]));
  return {rules:{...rules,movePlan:null},poses,message:moveNames[plan.type]+' 완료',manual:assessment.manual,assessment};
}

export function rewindMove(game) {
  const {rules,plan,survivors}=view(game);
  const poses=Object.fromEntries(survivors.map(p=>[p.id,point(plan.origins[p.id])]));
  return {rules:{...rules,movePlan:{...plan,paths:{}}},poses,message:'이동 선언을 유지하고 분대 경로를 원점으로 되돌렸습니다.'};
}

// Core 03.01: a unit which cannot meet its end conditions returns to the
// start of the move. Losses sustained before moving still apply.
export function abandonInvalidMove(game){
  const {rules,plan}=view(game);
  requireEscapeRolls(plan);
  try{finishMove(game)}catch(error){
    if(!error.assessment)throw error;
    const {poses}=rewindMove(game),unit={...rules.units[plan.unit]};
    delete unit.movement;delete unit.order;delete unit.rerolled;delete unit.movementTracked;
    return {rules:{...rules,movePlan:null,units:{...rules.units,[plan.unit]:unit}},poses,message:'이동 불가 · 생존 모델을 시작 위치로 복귀'};
  }
  throw new Error('현재 배치는 이동을 완료할 수 있습니다.');
}

export function rerollMove(game,actor,d6) {
  const {rules,plan}=view(game,actor);
  const member=actingModel(game,actor);
  if(plan.type!=='advance' || member.faction!=='orks' || rules.units[plan.unit]?.rerolled)
    throw new Error('오크의 전력 이동 굴림은 한 번만 재굴림할 수 있습니다.');
  if(plan.rerollClosed || Object.values(plan.paths).some(route=>route.length)) throw new Error('전력 이동 재굴림은 모델을 움직이기 전에 선언하세요.');
  const advanceRoll=d6??roll();
  if(!Number.isInteger(advanceRoll) || advanceRoll<1 || advanceRoll>6) throw new Error('재굴림 결과는 D6이어야 합니다.');
  const order=declaration('advance',advanceRoll,plan.takeToSkies,plan.fallbackMode);
  const next=changeUnit(rules,member,{order,rerolled:true});
  return {rules:{...next,movePlan:{...plan,advanceRoll}},message:member.name+' · 재굴림 · '+order};
}
