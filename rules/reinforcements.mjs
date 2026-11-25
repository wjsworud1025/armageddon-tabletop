import {groupId} from './battle.mjs';
import {getProfile} from './profiles.mjs';
import {assessMove} from '../movement.mjs';
import {baseDistance} from '../state.mjs';
import {layoutGeometry,overlapsArea} from '../layouts.mjs';

// Core 03.02, 09.04, 13.06, 20.01–20.04, 24.09; Combat Patrol Mission
// steps 5 and 9. Coordinates and base dimensions are in battlefield inches.
const EPS=1e-6;
const issue=(code,modelIds,message)=>({code,modelIds,message});
const cameBack=(rules,key)=>key==='gretchin'&&rules.patrol?.grotReturned===true;
const enemyZone=(game,team)=>{
  const layout=game.layout;
  if(!layout||!['marines','orks'].includes(layout.blue))return null;
  return layoutGeometry(layout.map)?.[layout.blue===team?'red':'blue']??null;
};

export function reinforcementOptions(game,key){
  const rules=game.rules,errors=[],manual=[];
  const ids=rules?.reserves?.[key];
  // A member in reserve is hidden by the roster. Its removed flag and the
  // positions of its placement preview do not determine its eligibility.
  const members=Array.isArray(ids)?game.pieces.filter(p=>ids.includes(p.id)&&getProfile(p)&&groupId(rules,p)===key):[];
  if(!members.length||members.length!==ids.length||members.some(p=>rules.hp?.[p.id]===0))
    errors.push(issue('not-reserved',[],'예비대에 등록된 생존 분대가 필요합니다.'));
  if(rules?.status!=='playing'||rules.step!==1||members.length&&members[0].faction!==rules.active)
    errors.push(issue('ingress-timing',[],'자기 진영의 이동 페이즈에 증원할 수 있습니다.'));
  if(rules?.round<2)errors.push(issue('first-round',[],'이 패트롤은 2라운드부터 증원할 수 있습니다.'));
  if(rules?.round>3&&!cameBack(rules,key))errors.push(issue('expired-reserves',[],'전투 시작 전 예비대는 3라운드 종료 시까지 증원해야 합니다.'));
  if(rules?.movePlan||rules?.chargePlan||rules?.fightPlan||rules?.hazard||rules?.declaration||
    (rules?.reinforcePlan&&rules.reinforcePlan.unit!==key))
    errors.push(issue('unit-busy',[],'진행 중인 다른 분대의 판정을 먼저 마치세요.'));
  const modes=['edge'];
  if(cameBack(rules??{},key)&&members.length&&members.every(p=>p.kind==='gretchin'))modes.push('deep-strike');
  return {ok:errors.length===0,errors,manual,members,modes:errors.length?[]:modes};
}

export function reserveCapacity(game,faction){
  const {rules}=game;
  const groups=new Set(game.pieces.filter(p=>p.faction===faction&&getProfile(p)).map(p=>groupId(rules,p)));
  const maximum=Math.floor(groups.size/2);
  const reserved=[...groups].filter(k=>rules.reserves?.[k]?.length).length;
  return {total:groups.size,maximum,reserved,remaining:Math.max(0,maximum-reserved)};
}

// A base at a corner can straddle two edge strips without entering the
// central rectangle. Test for intersection with its open interior, allowing
// tangency at exactly the 6-inch limit.
function withinEdgeBand(p,width,depth,band=6){
  const x=width/2-band,z=depth/2-band;
  if(x<=0||z<=0)return true;
  if(Math.abs(p.x)<x&&Math.abs(p.z)<z)return false;
  const c=Math.cos(p.yaw),s=Math.sin(p.yaw);
  const corners=[[-x,-z],[x,-z],[x,z],[-x,z]].map(([a,b])=>{
    const dx=a-p.x,dz=b-p.z;
    return [(c*dx-s*dz)*2/p.baseWidth,(s*dx+c*dz)*2/p.baseDepth];
  });
  return corners.every(([a,b],i)=>{
    const [endX,endZ]=corners[(i+1)%corners.length],u=endX-a,v=endZ-b;
    const t=Math.max(0,Math.min(1,-(a*u+b*v)/(u*u+v*v)));
    return (a+t*u)**2+(b+t*v)**2>=1-EPS;
  });
}
function onTable(p,width,depth){
  const c=Math.cos(p.yaw),s=Math.sin(p.yaw);
  const halfX=Math.hypot(p.baseWidth*c,p.baseDepth*s)/2;
  const halfZ=Math.hypot(p.baseWidth*s,p.baseDepth*c)/2;
  return Math.abs(p.x)+halfX<=width/2+EPS&&Math.abs(p.z)+halfZ<=depth/2+EPS;
}

export function assessReinforcement(game,key,poses,{mode='edge'}={}){
  const choice=reinforcementOptions(game,key),errors=[...choice.errors],manual=[],placed={};
  const result=()=>({ok:errors.length===0,errors,manual,poses:placed});
  if(!choice.ok)return result();
  if(!choice.modes.includes(mode)){
    errors.push(issue('ingress-mode',[],'이 분대가 사용할 수 있는 증원 방식을 선택하세요.'));return result();
  }
  const {members}=choice,ids=new Set(members.map(p=>p.id));
  if(!poses||typeof poses!=='object'||Array.isArray(poses)||Object.keys(poses).length!==ids.size||Object.keys(poses).some(id=>!ids.has(id))){
    errors.push(issue('ingress-members',[...ids],'예비대 분대원 전원의 최종 위치를 지정하세요.'));return result();
  }
  for(const p of members){
    const v=poses[p.id];
    const pose={x:v?.x,z:v?.z,yaw:v?.yaw??p.yaw??0,elevation:v?.elevation??p.elevation??0};
    if(!v||typeof v!=='object'||Object.keys(v).some(k=>!Object.hasOwn(pose,k))||
      !Object.values(pose).every(Number.isFinite)||pose.elevation<0||pose.elevation>20){
      errors.push(issue('ingress-pose',[p.id],'배치 위치·높이·각도를 확인하세요.'));
    }else placed[p.id]=pose;
  }
  if(errors.length)return result();
  const team=members[0].faction,zone=enemyZone(game,team);
  if(mode==='edge'&&game.rules.round===2&&!zone)manual.push(issue('deployment-map',[],
    '자유·제품 전장에서는 두 플레이어가 합의한 상대 배치 구역에 받침대가 걸치지 않는지 확인하세요.'));
  const reservedIds=new Set(Object.values(game.rules.reserves).flat());
  const pieces=game.pieces.map(p=>ids.has(p.id)?{...p,...placed[p.id],removed:false}:
    reservedIds.has(p.id)?{...p,removed:true}:p);
  const arrivals=pieces.filter(p=>ids.has(p.id));
  const others=pieces.filter(p=>!p.removed&&!ids.has(p.id)&&(game.rules.hp?.[p.id]??1)>0);
  const enemies=others.filter(p=>getProfile(p)&&p.faction!==team);
  const terrain=others.filter(p=>p.faction==='terrain');
  for(const p of arrivals){
    if(!onTable(p,game.width,game.depth))errors.push(issue('board-edge',[p.id],'받침대 전체를 전장 안에 놓으세요.'));
    if(mode==='edge'){
      if(!withinEdgeBand(p,game.width,game.depth))errors.push(issue('edge-band',[p.id],'받침대 전체가 전장 가장자리 6″ 이내에 있어야 합니다.'));
      else if(p.elevation>EPS&&!withinEdgeBand(p,game.width,game.depth,Math.sqrt(Math.max(0,36-p.elevation**2))))
        manual.push(issue('elevated-edge',[p.id],'상층 배치에서 가장자리까지 높이를 포함한 실제 6″ 거리를 확인하세요.'));
    }
    if(mode==='edge'&&game.rules.round===2&&zone&&overlapsArea(p,zone))errors.push(issue('enemy-zone',[p.id],'2라운드 일반 증원은 상대 배치 구역에 걸칠 수 없습니다.'));
    for(const enemy of enemies)if(baseDistance(p,enemy)<=8+EPS)
      errors.push(issue('enemy-distance',[p.id,enemy.id],'모든 적과 받침대 간 수평 거리가 8″를 초과해야 합니다.'));
    if(p.elevation>EPS&&!terrain.some(t=>baseDistance(p,t)<=EPS))
      errors.push(issue('unsupported-base',[p.id],'높이를 지정한 받침대 아래에 지형 표면이 필요합니다.'));
  }
  // The move starts at the proposed positions. With no route, this applies
  // the shared end-placement geometry without charging movement distance
  // from the off-board storage position.
  const geometry=assessMove({game:{...game,pieces},pieces:arrivals,type:'normal',paths:{},checkEligibility:false});
  errors.push(...geometry.errors.filter(e=>e.code!=='end-engaged'));
  manual.push(...geometry.manual);
  return result();
}

export function expiringReserves(game){
  const r=game.rules;
  const final=r?.status==='playing'&&r.step===5&&r.active!==r.first&&r.round===r.rounds;
  const deadline=r?.status==='playing'&&r.step===5&&r.active!==r.first&&r.round===3;
  const units=Object.keys(r?.reserves??{}).filter(key=>final||deadline&&!cameBack(r,key));
  return {units,ids:units.flatMap(key=>r.reserves[key]),final};
}
