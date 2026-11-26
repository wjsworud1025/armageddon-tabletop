import {assessReinforcement,reinforcementOptions,reserveCapacity} from './reinforcements.mjs';
import {changeUnit,groupId} from './battle.mjs';
import {place} from '../state.mjs';

const position=p=>({x:p.x,z:p.z,elevation:p.elevation??0,yaw:p.yaw??0});
function check(result){
  if(!result.ok)throw Error(result.errors.map(e=>(e.modelIds?.length?e.modelIds.join(', ')+' · ':'')+e.message).join('\n'));
}

export function attachForDeployment(game,leader,bodyguard){
  const rules=game.rules;
  if(rules.status!=='setup')throw Error('대전 시작 전에 지휘관을 편성하세요.');
  const allowed=leader.kind==='librarian'?['intercessor']:['weirdboy','warboss'].includes(leader.kind)?['boy-0','boy-1']:[];
  if(!allowed.length||bodyguard&&!allowed.includes(bodyguard))throw Error('합류할 수 없는 분대입니다.');
  const attachments={...rules.attachments},reserves={...rules.reserves};
  if(bodyguard&&Object.entries(attachments).some(([id,key])=>id!==leader.id&&key===bodyguard))
    throw Error('그 분대에는 이미 지휘관이 합류했습니다.');
  const oldKey=groupId(rules,leader),wasReserved=!!reserves[oldKey]?.includes(leader.id);
  if(wasReserved){
    const remaining=reserves[oldKey].filter(id=>id!==leader.id);
    if(remaining.length)reserves[oldKey]=remaining;else delete reserves[oldKey];
  }
  if(bodyguard)attachments[leader.id]=bodyguard;else delete attachments[leader.id];
  const next={...rules,attachments,reserves};
  const reserved=bodyguard?!!reserves[bodyguard]?.length:wasReserved;
  if(reserved){
    const key=groupId(next,leader);
    reserves[key]=[...(reserves[key]??[]),leader.id];
  }
  const capacity=reserveCapacity({...game,rules:next},leader.faction);
  if(capacity.reserved>capacity.maximum)throw Error('이 편성은 예비대 한도를 초과합니다. 먼저 한 분대를 배치로 복귀시키세요.');
  return {rules:next,removed:wasReserved||reserved?{[leader.id]:reserved}:{}};
}

export function beginReinforcement(game,unit,mode='edge'){
  const rules=game.rules;
  if(rules.overwatch)throw Error('경계 사격 순서에 들어가 이번 단계의 증원 배치가 끝났습니다.');
  if(rules.reinforcePlan||rules.movePlan||rules.hazard)throw Error('진행 중인 분대 판정을 먼저 마치세요.');
  const options=reinforcementOptions(game,unit);
  check(options);
  if(!options.modes.includes(mode))throw Error('이 분대가 사용할 수 없는 증원 방식입니다.');
  const origins=Object.fromEntries(options.members.map(p=>[p.id,position(p)]));
  const poses=Object.fromEntries(options.members.map(p=>[p.id,{removed:false}]));
  return {rules:{...rules,reinforcePlan:{unit,mode,origins}},poses,message:'예비대 배치 시작 · 분대원의 위치를 지정하세요.'};
}

export function placeReinforcement(game,actor,paths){
  const plan=game.rules.reinforcePlan;
  if(!plan||!Object.hasOwn(plan.origins,actor.id))throw Error('배치 중인 예비대 모델을 선택하세요.');
  const poses={};
  for(const [id,path] of Object.entries(paths)){
    if(!Object.hasOwn(plan.origins,id)||!path.length)throw Error('배치 중인 예비대만 옮길 수 있습니다.');
    const model=game.pieces.find(p=>p.id===id);
    const candidate={...model,...path.at(-1)};
    const pose=position(candidate);
    if(!Object.values(pose).every(Number.isFinite)||pose.elevation<0||pose.elevation>20)throw Error('배치 좌표를 확인하세요.');
    place(candidate,pose.x,pose.z,game);
    poses[id]=position(candidate);
  }
  return {rules:game.rules,poses,message:'예비대 배치 위치 조정'};
}

export function finishReinforcement(game,cancel=false){
  const rules=game.rules,plan=rules.reinforcePlan;
  if(!plan)throw Error('진행 중인 예비대 배치가 없습니다.');
  if(cancel){
    const poses=Object.fromEntries(Object.entries(plan.origins).map(([id,p])=>[id,{...p,removed:true}]));
    return {rules:{...rules,reinforcePlan:null},poses,message:'배치 취소 · 분대를 예비대로 복귀'};
  }
  const members=game.pieces.filter(p=>Object.hasOwn(plan.origins,p.id));
  const poses=Object.fromEntries(members.map(p=>[p.id,position(p)]));
  const result=assessReinforcement(game,plan.unit,poses,{mode:plan.mode});
  check(result);
  const reserves={...rules.reserves};
  delete reserves[plan.unit];
  const earlierMove=rules.units[plan.unit]?.movement;
  const movement=['advance','fallback'].includes(earlierMove)?earlierMove:'normal';
  const next=changeUnit(rules,members[0],{reinforcing:true,movement,movementTracked:true,order:'증원 배치'});
  return {rules:{...next,reserves,reinforcePlan:null},message:'분대 증원 배치 완료',manual:result.manual};
}
