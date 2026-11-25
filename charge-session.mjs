import {assessCharge,chargeOptions} from './charge.mjs';
import {appendUnitPaths} from './move-session.mjs';
import {changeUnit,currentHP,roll as rollDie} from './rules/battle.mjs';

const pose=p=>({x:p.x,z:p.z,elevation:p.elevation??0,yaw:p.yaw??0});
const name={normal:'돌격',masterOfBattle:'전쟁의 달인',leapToDefend:'영웅적 개입 · 방어 지원',intoTheFray:'영웅적 개입 · 전투 합류'};

function requireValid(assessment) {
  if(assessment.ok) return;
  const error=new Error(assessment.errors.map(e=>(e.modelIds.length?e.modelIds.join(', ')+' · ':'')+e.message).join('\n'));
  error.assessment=assessment;
  throw error;
}
function draft(game) {
  const rules=game.rules,plan=rules?.chargePlan;
  if(rules?.status!=='playing'||rules.step!==3||!plan) throw new Error('진행 중인 분대 돌격이 없습니다.');
  const survivors=game.pieces.filter(p=>Object.hasOwn(plan.origins,p.id) && currentHP(rules,p)>0);
  return {rules,plan,survivors};
}
function evaluate(game,plan,survivors,phase) {
  const actor=survivors.find(p=>p.id===plan.actor)||survivors[0];
  const paths=Object.fromEntries(survivors.filter(p=>plan.paths[p.id]).map(p=>[p.id,plan.paths[p.id]]));
  const assessment=assessCharge({...plan,game,actor,paths,declared:true,endOfPhase:plan.mode!=='normal',phase});
  requireValid(assessment);
  return assessment;
}

// roll stores the patrol-adjusted roll before the optional flight deduction.
// dice stores both physical D6. Declining even a double one consumes the attempt.
export function beginCharge(game,actor,options={}) {
  const rules=game.rules;
  if(rules?.chargePlan||rules?.movePlan||rules?.declaration||rules?.hazard)
    throw new Error('진행 중인 분대 판정을 먼저 마치세요.');
  const mode=options.mode??'normal',endOfPhase=options.endOfPhase===true;
  const declaration=chargeOptions(game,actor,{mode,endOfPhase});
  requireValid(declaration);
  const dice=options.dice??[rollDie(6,options.random),rollDie(6,options.random)];
  if(!Array.isArray(dice)||dice.length!==2||!dice.every(n=>Number.isInteger(n)&&n>=1&&n<=6))
    throw new Error('돌격 주사위는 D6 두 개여야 합니다.');
  const total=dice[0]+dice[1];
  const rolled=chargeOptions(game,actor,{mode,roll:total,endOfPhase});
  const model=declaration.members.find(p=>p.id===(typeof actor==='string'?actor:actor.id));
  const origins=Object.fromEntries(declaration.members.map(p=>[p.id,pose(p)]));
  const plan={unit:declaration.unit,actor:model.id,mode,roll:rolled.limit,dice:[...dice],targets:[],origins,paths:{},takeToSkies:false};
  let next=changeUnit(rules,model,{charge:plan.roll,chargeTracked:true,...(mode==='masterOfBattle'?{counterCharge:true}:{})});
  if(declaration.cost) {
    const key=[next.round,next.active,next.step].join('-');
    next={...next,cp:{...next.cp,[model.faction]:next.cp[model.faction]-declaration.cost},patrol:{...next.patrol,
      spent:{...next.patrol.spent,heroicIntervention:key},tactics:{...next.patrol.tactics,heroicIntervention:key+'/'+plan.unit}}};
  }
  return {rules:{...next,chargePlan:plan},message:model.name+' · '+name[mode]+' '+dice.join(' + ')+' → '+plan.roll+'″',assessment:rolled};
}

export function selectChargeTargets(game,targets,{takeToSkies=false}={}) {
  const {rules,plan,survivors}=draft(game);
  if(Object.values(plan.paths).some(path=>path.length)) throw new Error('표적이나 비행을 바꾸려면 먼저 원점으로 되돌리세요.');
  if(!Array.isArray(targets)||!targets.length) throw new Error('돌격할 적 표적 분대를 선택하세요.');
  const next={...plan,targets:[...targets],takeToSkies:takeToSkies===true};
  const assessment=evaluate(game,next,survivors,'path');
  return {rules:{...rules,chargePlan:next},assessment,manual:assessment.manual,message:'돌격 표적 '+targets.length+'개 확정 · '+assessment.limit+'″'};
}

export function proposeCharge(game,actor,paths) {
  const {rules,plan,survivors}=draft(game);
  if(!survivors.some(p=>p.id===(typeof actor==='string'?actor:actor?.id))) throw new Error('돌격 분대의 생존 모델만 움직일 수 있습니다.');
  if(!plan.targets.length) throw new Error('이동하기 전에 돌격 표적을 선택하세요.');
  const next={...plan,paths:appendUnitPaths(plan,survivors,paths)};
  const assessment=evaluate(game,next,survivors,'path');
  const poses=Object.fromEntries(Object.keys(paths).map(id=>[id,assessment.models[id].end]));
  return {rules:{...rules,chargePlan:next},poses,assessment,manual:assessment.manual,message:'돌격 경로 갱신'};
}

export function finishCharge(game) {
  const {rules,plan,survivors}=draft(game);
  if(!survivors.length) return cancelCharge(game);
  const assessment=evaluate(game,plan,survivors,'finish');
  const poses=Object.fromEntries(Object.entries(assessment.models).map(([id,m])=>[id,m.end]));
  const next=changeUnit(rules,survivors[0],{charged:true});
  return {rules:{...next,chargePlan:null},poses,assessment,manual:assessment.manual,message:'돌격 이동 완료 · 이번 턴 선제 전투'};
}

export function rewindCharge(game) {
  const {rules,plan,survivors}=draft(game);
  const poses=Object.fromEntries(survivors.map(p=>[p.id,{...plan.origins[p.id]}]));
  return {rules:{...rules,chargePlan:{...plan,paths:{}}},poses,message:'굴림과 표적을 유지하고 돌격 분대를 원점으로 되돌렸습니다.'};
}

export function cancelCharge(game) {
  const {rules,poses}=rewindCharge(game);
  return {rules:{...rules,chargePlan:null},poses,message:'돌격 이동 없이 선언을 종료했습니다.'};
}
