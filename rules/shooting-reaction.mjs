import {currentHP,groupId,roll} from './battle.mjs';
import {getProfile} from './profiles.mjs';
import {useTactic} from './patrol.mjs';
import {baseDistance} from '../state.mjs';
import {assessMove} from '../movement.mjs';
import {appendUnitPaths} from '../move-session.mjs';

// Core 03, 04.03.04, 09.05, 15.01, 21.02–03. The printed ’Ardmob
// stratagem and the current patrol card specify a surge, while the Vanguard
// data card explicitly calls its D6+1 reaction a normal move.
const EPS=1e-6;
const pose=p=>({x:p.x,z:p.z,yaw:p.yaw??0,elevation:p.elevation??0});
const altitude=p=>p.elevation??0;
const circle=p=>p.baseWidth===p.baseDepth;
const gap=(a,b)=>circle(a)&&circle(b)?Math.max(0,Math.hypot(a.x-b.x,a.z-b.z)-(a.baseWidth+b.baseWidth)/2):baseDistance(a,b);
const range=(a,b)=>Math.hypot(gap(a,b),altitude(a)-altitude(b));
const engaged=(a,b)=>Math.abs(altitude(a)-altitude(b))<=5+EPS&&gap(a,b)<=2+EPS;
const issue=(code,modelIds,message)=>({code,modelIds,message});
const unitsRange=(a,b)=>Math.min(...a.flatMap(p=>b.map(q=>range(p,q))));
const tied=(unit,other)=>unit.some(p=>other.some(q=>engaged(p,q)));
const label=mode=>mode==='rapid'?'신속 대응':'한복판으로!';
const live=(game)=>game.pieces.filter(p=>getProfile(p)&&currentHP(game.rules,p)>0);
const members=(game,key)=>live(game).filter(p=>groupId(game.rules,p)===key);
function enemyGroups(game,faction){
  const groups=new Map();
  for(const p of live(game))if(p.faction!==faction){
    const k=groupId(game.rules,p);
    if(!groups.has(k))groups.set(k,[]);
    groups.get(k).push(p);
  }
  return groups;
}
function shotContext(game,window){
  const s=game.rules;
  return s?.status==='playing'&&s.step===2&&window?.round===s.round&&window.active===s.active&&
    Array.isArray(window.targets)&&s.units[window.shooter]?.finishedAttack===2&&
    game.pieces.some(p=>getProfile(p)&&p.faction===s.active&&groupId(s,p)===window.shooter);
}
function modeFor(game,unit,figures){
  if(!figures.length||figures[0].faction===game.rules.active||game.rules.units[unit]?.reaction)return null;
  if(figures[0].faction==='marines')return figures.some(p=>p.kind==='vanguard')?'rapid':null;
  return useTactic(game.rules,'surge',unit,'orks',game.rules.units[unit]?.shocked)?'surge':null;
}
export function openShootingReaction(game,{shooter,targets,didShoot}){
  const s=game.rules;
  if(didShoot!==true||!Array.isArray(targets)||s?.declaration||s?.reactionPlan||s?.shootingReaction)return null;
  const window={round:s?.round,active:s?.active,shooter,targets:[...new Set(targets)]};
  if(!shotContext(game,window))return null;
  window.targets=window.targets.filter(key=>modeFor(game,key,members(game,key)));
  // A hazard casualty can remove the last engaging enemy. Keep the candidate
  // window until that pool has been allocated, then evaluate live positions.
  if(!window.targets.length||(!s.hazard&&!shootingReactionOptions(game,window).length))return null;
  return window;
}
export function shootingReactionOptions(game,window=game.rules?.shootingReaction){
  if(!shotContext(game,window)||game.rules.declaration||game.rules.hazard||game.rules.reactionPlan)return [];
  const result=[];
  for(const unit of window.targets){
    const figures=members(game,unit),mode=modeFor(game,unit,figures);
    if(!mode)continue;
    const foes=enemyGroups(game,figures[0].faction);
    if([...foes.values()].some(other=>tied(figures,other)))continue;
    let targets=[];
    if(mode==='surge'){
      const ranges=[...foes].map(([key,other])=>[key,unitsRange(figures,other)]);
      const minimum=Math.min(...ranges.map(([,n])=>n));
      targets=ranges.filter(([,n])=>n<=minimum+EPS).map(([key])=>key);
      if(!targets.length)continue;
    }
    result.push({unit,mode,cost:mode==='surge'?1:0,targets,canFly:mode==='rapid'&&figures.some(p=>p.kind==='vanguard')});
  }
  return result;
}
export function beginShootingReaction(game,window,{unit,target=null,takeToSkies=false,d6,random}){
  const s=game.rules,saved=s.shootingReaction;
  if(!saved||!window||saved.round!==window.round||saved.active!==window.active||saved.shooter!==window.shooter)
    throw Error('방금 사격을 마친 분대의 반응 기회가 필요합니다.');
  const choice=shootingReactionOptions(game,saved).find(o=>o.unit===unit);
  if(!choice||takeToSkies&&!choice.canFly)throw Error('이 분대는 지금 해당 반응 이동을 할 수 없습니다.');
  if(choice.mode==='surge'&&target===null&&choice.targets.length===1)target=choice.targets[0];
  if(choice.mode==='surge'?!choice.targets.includes(target):target!==null)throw Error('가장 가까운 적 분대 중 하나를 대상으로 선택하세요.');
  const die=d6??roll(6,random);
  if(!Number.isInteger(die)||die<1||die>6)throw Error('반응 이동에는 D6 한 개가 필요합니다.');
  let rules=choice.mode==='surge'?useTactic(s,'surge',unit,'orks',s.units[unit]?.shocked):s;
  const origins=Object.fromEntries(members(game,unit).map(p=>[p.id,pose(p)]));
  const plan={unit,mode:choice.mode,shooter:saved.shooter,target,die,takeToSkies,origins,paths:{}};
  rules={...rules,units:{...rules.units,[unit]:{...rules.units[unit],reaction:true,reactionTracked:true}},shootingReaction:null,reactionPlan:plan};
  return {rules,plan,message:label(plan.mode)+' · D6 '+die+' + 1'+(takeToSkies?' − 2':'')+' = '+(die+1-(takeToSkies?2:0))+'″'};
}
function atOrigins(game,plan){
  return {...game,pieces:game.pieces.map(p=>Object.hasOwn(plan.origins,p.id)?{...p,...plan.origins[p.id]}:p)};
}
const outerRadius=p=>Math.max(p.baseWidth,p.baseDepth)/2;
function compareSurgeEndpoint({args,model,end,selected,others,limit}){
  if(selected.some(enemy=>engaged(end,enemy)))return null;
  const achieved=unitsRange([end],selected);
  const lowerBound=Math.min(...selected.map(enemy=>Math.hypot(
    Math.max(0,Math.hypot(model.x-enemy.x,model.z-enemy.z)-outerRadius(model)-outerRadius(enemy)),
    altitude(model)-altitude(enemy))-limit));
  // On the same level, straight travel to a circular base attains this bound.
  // A legal alternative for this model, holding the rest of its unit fixed,
  // proves its proposed endpoint falls short. Terrain and combined maneuvers
  // that cannot be settled with such a witness are a manual judgement.
  const engagementPlausible=selected.some(e=>Math.max(0,Math.hypot(e.x-model.x,e.z-model.z)-outerRadius(e)-outerRadius(model)-2)+
    Math.max(0,Math.abs(altitude(e)-altitude(model))-5)<=limit+EPS);
  if(!engagementPlausible&&achieved<=Math.max(0,lowerBound)+EPS)return null;
  for(const enemy of selected){
    const dx=enemy.x-model.x,dz=enemy.z-model.z,d=Math.hypot(dx,dz);
    if(!d||altitude(model)>EPS||altitude(enemy)>EPS)continue;
    const distance=Math.min(limit,Math.max(0,gap(model,enemy)-2+.00001));
    for(const fraction of [1,.75,.5,.25,0]){
      const step=distance*fraction/d,at={...model,x:model.x+dx*step,z:model.z+dz*step};
      const reaches=selected.some(other=>engaged(at,other));
      if(!reaches&&unitsRange([at],selected)>=achieved-EPS||others.some(other=>engaged(at,other)))continue;
      const alternative=assessMove({...args,paths:{...args.paths,[model.id]:[pose(at)]}});
      if(alternative.ok&&!alternative.manual.length)
        return {hard:true,entry:issue(reaches?'surge-engage':'surge-closer',[model.id],reaches?
          '교전이 가능한 모델은 서지 대상과 교전한 채로 끝내야 합니다.':'이 모델을 대상에 더 가까이 합법적으로 놓을 수 있습니다.')};
    }
  }
  return {hard:false,entry:issue('surge-route',[model.id],'다른 경로나 분대 배치로 교전할 수 있는지, 그럴 수 없으면 대상에 가장 가까운지 확인하세요.')};
}
export function assessShootingReaction(game,plan,paths=plan?.paths,phase='finish'){
  const errors=[],manual=[],models={},poses={};
  const limit=plan?.die+1-(plan?.takeToSkies?2:0);
  const result=()=>({ok:!errors.length,errors,manual,models,poses,limit});
  if(game.rules?.status!=='playing'||game.rules.step!==2||!plan||!['rapid','surge'].includes(plan.mode)||!Number.isInteger(plan.die)||plan.die<1||plan.die>6||
    typeof plan.takeToSkies!=='boolean'||(plan.mode==='surge'&&plan.takeToSkies)||!plan.origins||!paths||!['path','finish'].includes(phase)){
    errors.push(issue('reaction-plan',[],'반응 이동 선언을 확인하세요.'));return result();
  }
  if(Object.keys(plan.origins).some(id=>!game.pieces.some(p=>p.id===id&&getProfile(p)&&groupId(game.rules,p)===plan.unit))){
    errors.push(issue('reaction-members',[],'반응 분대 이외 모델의 위치를 변경할 수 없습니다.'));return result();
  }
  const board=atOrigins(game,plan),figures=members(board,plan.unit);
  if(!figures.length||figures.some(p=>!Object.hasOwn(plan.origins,p.id))){
    errors.push(issue('reaction-members',[],'반응 이동 분대의 시작 위치가 필요합니다.'));return result();
  }
  const foes=enemyGroups(board,figures[0].faction),selected=foes.get(plan.target)??[];
  if(figures[0].faction===game.rules.active||(plan.mode==='rapid'?!figures.some(p=>p.kind==='vanguard'):figures[0].faction!=='orks')){
    errors.push(issue('reaction-unit',[plan.unit],'상대 사격의 표적이 된 해당 패트롤 분대를 선택하세요.'));return result();
  }
  if([...foes.values()].some(foe=>tied(figures,foe))){
    errors.push(issue('reaction-origin-engaged',[plan.unit],'이 이동은 비교전 상태에서 시작해야 합니다.'));return result();
  }
  if(plan.mode==='surge'&&(!selected.length||[...foes.values()].some(other=>unitsRange(figures,other)<unitsRange(figures,selected)-EPS))){
    errors.push(issue('surge-target',[],'서지 이동 시작 당시 가장 가까운 적 분대를 지정해야 합니다.'));return result();
  }
  // Shared path/footprint validation for a rolled distance; its "charge"
  // geometry allows engaged endpoints and free choices of rolled budget.
  // The reaction's own end conditions below determine legal engagement.
  const args={game:board,pieces:figures,origins:plan.origins,paths,phase,type:'charge',chargeDistance:plan.die+1,
    takeToSkies:plan.takeToSkies,checkEligibility:false};
  const geometry=assessMove(args);
  errors.push(...geometry.errors);manual.push(...geometry.manual);Object.assign(models,geometry.models);
  for(const [id,m] of Object.entries(models))poses[id]=m.end;
  if(!geometry.ok||phase==='path')return result();
  const others=[...foes].filter(([key])=>plan.mode==='rapid'||key!==plan.target).flatMap(([,group])=>group);
  for(const model of figures){
    const end={...model,...poses[model.id]};
    if(others.some(enemy=>engaged(end,enemy)))errors.push(issue('reaction-end-engaged',[model.id],
      plan.mode==='rapid'?'신속 대응 일반 이동은 비교전 상태로 끝내야 합니다.':'서지 대상으로 정하지 않은 적과는 교전할 수 없습니다.'));
    if(plan.mode==='surge'){
      const finding=compareSurgeEndpoint({args,model,end,selected,others,limit});
      if(finding)(finding.hard?errors:manual).push(finding.entry);
    }
  }
  return result();
}
function checked(game,plan,paths,phase){
  const assessment=assessShootingReaction(game,plan,paths,phase);
  if(!assessment.ok){
    const error=Error(assessment.errors.map(e=>e.message).join('\n'));
    error.assessment=assessment;throw error;
  }
  return assessment;
}
function currentPlan(game){
  const s=game.rules,p=s?.reactionPlan;
  if(!p||s.status!=='playing'||s.step!==2||s.hazard||s.declaration)throw Error('진행 중인 사격 반응 이동이 없습니다.');
  return p;
}
export function proposeShootingReaction(game,actor,paths){
  const plan=currentPlan(game),survivors=members(game,plan.unit);
  if(!survivors.some(p=>p.id===(typeof actor==='string'?actor:actor?.id)))throw Error('반응 분대의 생존 모델을 선택하세요.');
  const next={...plan,paths:appendUnitPaths(plan,survivors,paths)};
  const assessment=checked(game,next,next.paths,'path');
  const poses=Object.fromEntries(Object.keys(paths).map(id=>[id,assessment.poses[id]]));
  return {rules:{...game.rules,reactionPlan:next},poses,assessment,manual:assessment.manual,message:label(plan.mode)+' 경로 갱신'};
}
export function finishShootingReaction(game){
  const plan=currentPlan(game),assessment=checked(game,plan,plan.paths,'finish');
  return {rules:{...game.rules,reactionPlan:null,shootingReaction:null},poses:assessment.poses,assessment,manual:assessment.manual,message:label(plan.mode)+' 이동 완료'};
}
export function declineShootingReaction(game){
  const s=game.rules;
  if(!s?.shootingReaction&&!s?.reactionPlan||s.status!=='playing'||s.step!==2||s.hazard||s.declaration)
    throw Error('현재 사격 반응 기회를 확인하세요.');
  const plan=s.reactionPlan;
  const poses=plan?Object.fromEntries(members(game,plan.unit).map(p=>[p.id,{...plan.origins[p.id]}])):{};
  return {rules:{...s,reactionPlan:null,shootingReaction:null},poses,manual:[],
    message:plan?label(plan.mode)+' 경로 취소 · 시작 위치 복귀':'사격 반응 생략'};
}
