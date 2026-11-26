import {currentHP,groupId,pendingCommandShock,roll} from './battle.mjs';
import {getProfile} from './profiles.mjs';
import {coherency,sweptGap} from '../movement.mjs';
import {measureFootprints} from '../ruler.mjs';
import {patrolTerrainPlacement} from './patrol-terrain-placement.mjs';

const eps=1e-6;
const issue=(code,modelIds,message)=>({code,modelIds,message});
const result=(rules,message,poses={},removed={})=>({rules,message,poses,removed});
const poseOf=p=>({x:p.x,z:p.z,elevation:p.elevation??0,yaw:p.yaw??0});
const validPose=p=>p&&Object.keys(p).length===4&&['x','z','elevation','yaw'].every(k=>Number.isFinite(p[k]))&&p.elevation>=0&&p.elevation<=20;
const nearby=(a,b)=>Math.abs((a.elevation??0)-(b.elevation??0))<=5+eps&&measureFootprints(a,b).horizontal<=2+eps;

function options(game,leader){
  const r=game.rules,who=typeof leader==='string'?leader:leader?.id;
  const boss=game.pieces.find(p=>p.id===who&&p.kind==='warboss');
  const unit=boss&&r?.attachments?.[boss.id];
  const reserveIds=r?.reserves?.[unit]??[],reserve=reserveIds.length>0;
  const alive=p=>reserveIds.includes(p.id)?(r.hp?.[p.id]??getProfile(p).wounds)>0:currentHP(r,p)>0;
  const members=unit?game.pieces.filter(p=>p.faction==='orks'&&groupId(r,p)===unit):[];
  const guards=members.filter(p=>p.kind==='boy');
  const fallen=guards.filter(p=>!alive(p)).map(p=>p.id);
  const living=members.filter(p=>alive(p)&&!reserveIds.includes(p.id));
  const anchors=living.filter(p=>!r.rallyStarters||r.rallyStarters.includes(p.id)).map(p=>p.id);
  let reason='';
  if(r?.status!=='playing'||r.step!==0||r.active!=='orks'||!r.patrol?.enhanced?.warcry)
    reason='전투 함성을 선택한 워보스의 지휘 단계에 사용하세요.';
  else if(!boss||!alive(boss)||!guards.length||reserve!==reserveIds.includes(boss.id))
    reason='살아 있는 워보스가 보이즈 호위 분대에 합류해 있어야 합니다.';
  else if(!fallen.length)reason='복귀할 수 있는 전사한 호위 모델이 없습니다.';
  else if(r.hazard||r.declaration||r.movePlan||r.reinforcePlan||r.chargePlan||r.fightPlan||r.shootingReaction||r.reactionPlan||
    r.overwatch||r.fightSequence||r.units?.wartrakk?.suppressionTargets?.length||pendingCommandShock(r,game.pieces).length)
    reason='진행 중인 판정과 필수 전장 충격 검사를 먼저 마치세요.';
  return {ok:!reason,reason,unit,reserve,fallen,anchors};
}

export function rallyOptions(game,leader='warboss-1'){
  const info=options(game,leader);
  if(game.rules?.patrol?.warcryUsed||game.rules?.rallyPlan)
    return {...info,ok:false,reason:'이번 전투의 전투 함성을 이미 사용했습니다.'};
  return info;
}
export function beginRally(game,leader='warboss-1',d3=()=>roll(3)){
  const op=rallyOptions(game,leader);
  if(!op.ok)throw Error(op.reason);
  const r=game.rules,die=d3();
  if(!Number.isInteger(die)||die<1||die>3)throw Error('D3 결과는 1~3이어야 합니다.');
  const plan={unit:op.unit,leader:typeof leader==='string'?leader:leader.id,die,anchors:op.anchors,reserve:op.reserve,selected:{}};
  return result({...r,patrol:{...r.patrol,warcryUsed:true},units:{...r.units,[op.unit]:{...r.units?.[op.unit],rallied:true}},rallyPlan:plan},'전투 함성 D3 '+die+' + 2 · 최대 '+(die+2)+'명 복귀');
}

export function validatePendingRally(game){
  const r=game.rules,p=r?.rallyPlan;
  if(!p)return true;
  const op=options(game,p.leader);
  if(!op.ok||p.leader!=='warboss-1'||p.unit!==op.unit||p.reserve!==op.reserve||
    !r.patrol.warcryUsed||!r.units?.[op.unit]?.rallied||!Number.isInteger(p.die)||p.die<1||p.die>3||
    !Array.isArray(p.anchors)||p.anchors.length!==op.anchors.length||
    new Set(p.anchors).size!==p.anchors.length||!p.anchors.every(id=>op.anchors.includes(id))||
    !p.selected||Array.isArray(p.selected)||typeof p.selected!=='object')return false;
  const entries=Object.entries(p.selected);
  return entries.length<=p.die+2&&entries.every(([id,pose])=>op.fallen.includes(id)&&(op.reserve?pose===null:validPose(pose)));
}
function pending(game){
  const p=game.rules?.rallyPlan;
  if(!p||!validatePendingRally(game))throw Error('유효한 전투 함성 배치가 필요합니다.');
  return p;
}
function edit(game,p,selected,message){
  return result({...game.rules,rallyPlan:{...p,selected}},message);
}
export function toggleRallyModel(game,id){
  const p=pending(game),selected={...p.selected};
  if(Object.hasOwn(selected,id))delete selected[id];
  else{
    if(!options(game,p.leader).fallen.includes(id))throw Error('워보스의 전사한 호위 모델을 선택하세요.');
    if(Object.keys(selected).length>=p.die+2)throw Error('이번 함성의 복귀 수 한도에 도달했습니다.');
    selected[id]=p.reserve?null:poseOf(game.pieces.find(m=>m.id===id));
  }
  return edit(game,p,selected,'호위 모델 복귀 선택 변경');
}
export function poseRallyModel(game,id,changes){
  const p=pending(game);
  if(!Object.hasOwn(p.selected,id)||p.reserve)throw Error('전장에 복귀할 모델을 먼저 선택하세요.');
  const pose={...p.selected[id],...changes};
  if(!validPose(pose))throw Error('복귀 위치와 높이를 확인하세요.');
  return edit(game,p,{...p.selected,[id]:pose},'복귀 위치 미리보기');
}
export function assessRally(game){
  const plan=game.rules?.rallyPlan,errors=[],manual=[];
  if(!plan||!validatePendingRally(game))return {ok:false,errors:[issue('rally-state',[],'전투 함성의 분대 상태를 확인하세요.')],manual};
  const chosen=Object.entries(plan.selected);
  if(!chosen.length||plan.reserve)return {ok:true,errors,manual};
  const r=game.rules,byId=new Map(game.pieces.map(p=>[p.id,p]));
  const all=game.pieces.filter(p=>p.faction!=='terrain'&&!r.reserves?.[groupId(r,p)]?.includes(p.id)&&currentHP(r,p)>0);
  const friends=all.filter(p=>groupId(r,p)===plan.unit),enemies=all.filter(p=>p.faction==='marines');
  const engaged=new Set(enemies.filter(e=>friends.some(p=>nearby(p,e))).map(p=>groupId(r,p)));
  const anchors=plan.anchors.map(id=>byId.get(id));
  const added=chosen.map(([id,pose])=>({...byId.get(id),...pose,removed:false}));
  const bodies=[...all];
  for(const p of added){
    // All returned models in this patrol have circular plinths (Boy or Boss Nob).
    if(Math.abs(p.x)+p.baseWidth/2>game.width/2+eps||Math.abs(p.z)+p.baseDepth/2>game.depth/2+eps)
      errors.push(issue('rally-edge',[p.id],'베이스 전체를 전장 안에 놓으세요.'));
    if(!anchors.some(a=>nearby(p,a)))errors.push(issue('rally-anchor',[p.id],'지휘 단계 시작부터 전장에 있던 분대원과 수평 2″, 수직 5″ 이내여야 합니다.'));
    const overlap=bodies.find(q=>Math.abs((p.elevation??0)-(q.elevation??0))<.12-eps&&sweptGap(p,p,q)<-eps);
    if(overlap)errors.push(issue('rally-overlap',[p.id,overlap.id],'두 모델의 베이스가 겹칩니다.'));
    const enemy=enemies.find(e=>!engaged.has(groupId(r,e))&&nearby(p,e));
    if(enemy)errors.push(issue('rally-engagement',[p.id,enemy.id],'복귀로 새로운 적 분대와 교전할 수 없습니다.'));
    const terrain=patrolTerrainPlacement(p,game.pieces);
    if(terrain.error)errors.push(issue('rally-terrain',[p.id],terrain.error));
    if(terrain.manual)manual.push(issue('rally-terrain-review',[p.id],terrain.manual));
    bodies.push(p);
  }
  errors.push(...coherency([...friends,...added]).errors);
  return {ok:!errors.length,errors,manual};
}
export function finishRally(game){
  const p=pending(game),check=assessRally(game);
  if(!check.ok)throw Error(check.errors[0].message);
  const r=game.rules,hp={...r.hp},ids=Object.keys(p.selected),removed={};
  for(const id of ids){
    hp[id]=getProfile(game.pieces.find(m=>m.id===id)).wounds;
    removed[id]=p.reserve;
  }
  const rules={...r,hp};
  if(p.reserve&&ids.length)rules.reserves={...r.reserves,[p.unit]:[...new Set([...r.reserves[p.unit],...ids])]};
  delete rules.rallyPlan;
  delete rules.rallyStarters;
  return result(rules,ids.length+'명 '+(p.reserve?'예비대':'전장')+' 복귀',p.reserve?{}:{...p.selected},removed);
}
