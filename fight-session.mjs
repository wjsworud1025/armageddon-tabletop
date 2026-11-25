import {beginFightSequence,fightOptions,fightMoveOptions,assessFightMove,transitionFight} from './fight-sequence.mjs';
import {appendUnitPaths} from './move-session.mjs';
import {currentHP,groupId} from './rules/battle.mjs';
import {getProfile} from './rules/profiles.mjs';

const title=type=>type==='pile-in'?'밀착 이동':'재정비 이동';
function requireValid(assessment){
  if(assessment.ok)return;
  const error=Error(assessment.errors.map(e=>(e.modelIds.length?e.modelIds.join(', ')+' · ':'')+e.message).join('\n'));
  error.assessment=assessment;
  throw error;
}
function activeDraft(game){
  const rules=game.rules,plan=rules?.fightPlan;
  if(rules?.status!=='playing'||rules.step!==4||!plan||!rules.fightSequence)throw Error('진행 중인 밀착·재정비 이동이 없습니다.');
  const survivors=game.pieces.filter(p=>Object.hasOwn(plan.origins,p.id)&&currentHP(rules,p)>0);
  return {rules,plan,survivors};
}
function evaluate(game,sequence,plan,objectives,phase){
  const assessment=assessFightMove({game,sequence,unit:plan.unit,targets:plan.targets,origins:plan.origins,paths:plan.paths,objectives,phase});
  requireValid(assessment);
  return assessment;
}
export function beginFightMove(game,choice,objectives=[]){
  const rules=game.rules;
  if(rules?.status!=='playing'||rules.step!==4)throw Error('근접전 페이즈에서 이동하세요.');
  if(rules.fightPlan||rules.chargePlan||rules.movePlan||rules.declaration||rules.hazard)throw Error('진행 중인 분대 판정을 먼저 마치세요.');
  const sequence=fightOptions(game,rules.fightSequence??beginFightSequence(game,objectives),objectives).sequence;
  const {unit,mode,type,targets,limit}=choice,options=fightMoveOptions(game,sequence,unit,objectives);
  if(!options||mode!==options.mode||type!==(mode==='pile-in'?'pile-in':'consolidate')||
    (limit!==undefined&&limit!==options.limit)||!Array.isArray(targets))throw Error('현재 선택할 수 있는 근접전 이동을 확인하세요.');
  const members=game.pieces.filter(p=>getProfile(p)&&currentHP(rules,p)>0&&groupId(rules,p)===unit);
  const origins=Object.fromEntries(members.map(p=>[p.id,{x:p.x,z:p.z,yaw:p.yaw??0,elevation:p.elevation??0}]));
  const plan={unit,type,mode,targets:[...targets],origins,paths:{}};
  const assessment=evaluate(game,sequence,plan,objectives,'path');
  return {rules:{...rules,fightSequence:sequence,fightPlan:plan},assessment,manual:assessment.manual,message:title(type)+' 경로 지정'};
}
export function proposeFightMove(game,actor,paths,objectives=[]){
  const {rules,plan,survivors}=activeDraft(game);
  if(!survivors.some(p=>p.id===(typeof actor==='string'?actor:actor?.id)))throw Error('선택한 근접전 분대의 생존 모델만 옮길 수 있습니다.');
  const next={...plan,paths:appendUnitPaths(plan,survivors,paths)};
  const assessment=evaluate(game,rules.fightSequence,next,objectives,'path');
  const poses=Object.fromEntries(Object.keys(paths).map(id=>[id,assessment.poses[id]]));
  return {rules:{...rules,fightPlan:next},poses,assessment,manual:assessment.manual,message:title(plan.type)+' 경로 갱신'};
}
export function finishFightMove(game,objectives=[]){
  const {rules,plan,survivors}=activeDraft(game);
  if(!survivors.length)return cancelFightMove(game);
  const assessment=evaluate(game,rules.fightSequence,plan,objectives,'finish');
  const next=transitionFight(game,rules.fightSequence,{type:'move',unit:plan.unit,targets:plan.targets,origins:plan.origins,paths:plan.paths},objectives);
  return {rules:{...rules,fightPlan:null,fightSequence:next},poses:assessment.poses,assessment,manual:assessment.manual,message:title(plan.type)+' 완료'};
}
export function cancelFightMove(game){
  const {rules,plan,survivors}=activeDraft(game);
  const poses=Object.fromEntries(survivors.map(p=>[p.id,{...plan.origins[p.id]}]));
  return {rules:{...rules,fightPlan:null},poses,manual:[],message:title(plan.type)+' 경로 취소 · 시작 위치 복귀'};
}
