import {baseDistance} from './state.mjs';
import {getProfile} from './rules/profiles.mjs';
import {groupId} from './rules/battle.mjs';
import {patrolTerrainPlacement} from './rules/patrol-terrain-placement.mjs';

// Core Rules 03.01–04, 09.04–07, 13.06, 17.01, 21.03 and Different Move Characteristics.
// Horizontal distances are in inches, yaw is in radians, elevation is base height in inches.
const EPS = 1e-6;
const TAU = 2 * Math.PI;
const issue = (code,modelIds,message) => ({code,modelIds,message});
const isFly = p => p.kind==='vanguard' || p.kind==='landSpeeder';
const isVehicle = p => p.kind==='landSpeeder';
export function travelCost(p,from,to,takeToSkies){
  return Math.hypot(to.x-from.x,to.z-from.z)+(takeToSkies&&isFly(p)?0:Math.abs((to.elevation||0)-(from.elevation||0)));
}
export function moveLimit(p,type,advanceRoll,takeToSkies){
  return type==='remain'?0:getProfile(p).move+(type==='advance'?advanceRoll:0)-(takeToSkies?2:0);
}
const gapY = (a,b) => Math.abs((a.elevation||0)-(b.elevation||0));
const turn = (a,b) => Math.atan2(Math.sin(b-a),Math.cos(b-a));
const pose = ({x,z,elevation=0,yaw=0}) => ({x,z,elevation,yaw:yaw%TAU});
const engaged = (a,b) => gapY(a,b)<=5+EPS && baseDistance(a,b)<=2+EPS;

export function coherency(pieces) {
  const models=pieces.filter(p=>!p.removed);
  const errors=[];
  if (models.length>1) {
    const neighbours=new Set();
    for (let i=0;i<models.length;i++) for (let j=i+1;j<models.length;j++) {
      const a=models[i], b=models[j], vertical=gapY(a,b), horizontal=baseDistance(a,b);
      if (vertical<=5+EPS && horizontal<=2+EPS) {neighbours.add(a.id);neighbours.add(b.id);}
      if (vertical>5+EPS || horizontal>9+EPS)
        errors.push(issue('coherency-span',[a.id,b.id],'같은 분대의 모든 모델 쌍이 수평 9″, 수직 5″ 이내여야 합니다.'));
    }
    const isolated=models.filter(p=>!neighbours.has(p.id));
    if (isolated.length) errors.push(issue('coherency-neighbour',isolated.map(p=>p.id),'각 모델은 분대원 한 명 이상과 수평 2″, 수직 5″ 이내여야 합니다.'));
  }
  return {ok:errors.length===0,errors};
}

// Support radius in a world direction. A terrain envelope is rectangular; the
// windows, floors, and solid walls inside this envelope need physical review.
function radius(p,nx,nz) {
  const cs=Math.cos(p.yaw), sn=Math.sin(p.yaw);
  const u=(cs*nx-sn*nz)*p.baseWidth/2, v=(sn*nx+cs*nz)*p.baseDepth/2;
  return p.faction==='terrain'?Math.abs(u)+Math.abs(v):Math.hypot(u,v);
}
const outerRadius = p => (p.faction==='terrain'?Math.hypot(p.baseWidth,p.baseDepth):Math.max(p.baseWidth,p.baseDepth))/2;

// Negative when the open interior of the swept base intersects the obstacle.
// A straight segment with fixed yaw sweeps a convex hull. Evaluate separating
// axes of that hull, including segment and rectangle face normals at cusps.
export function sweptGap(start,end,other,clearance=0) {
  const sx=end.x-start.x, sz=end.z-start.z, dx=other.x-start.x, dz=other.z-start.z;
  const len2=sx*sx+sz*sz;
  const t=len2?Math.max(0,Math.min(1,(dx*sx+dz*sz)/len2)):0;
  const bound=Math.hypot(dx-t*sx,dz-t*sz)-outerRadius(start)-outerRadius(other);
  if (bound>clearance+EPS || (start.baseWidth===start.baseDepth && other.baseWidth===other.baseDepth && other.faction!=='terrain')) return bound;
  function gap(axis) {
    const nx=Math.cos(axis), nz=Math.sin(axis);
    return dx*nx+dz*nz-Math.max(0,sx*nx+sz*nz)-radius(start,nx,nz)-radius(other,nx,nz);
  }
  const step=TAU/64, samples=Array.from({length:64},(_,i)=>gap(i*step));
  let best=Math.max(...samples);
  for(let i=0;i<64;i++) {
    if(samples[i]<samples[(i+63)%64] || samples[i]<samples[(i+1)%64]) continue;
    let lo=(i-1)*step, hi=(i+1)*step;
    for(let j=0;j<25;j++) {
      const a=(2*lo+hi)/3,b=(lo+2*hi)/3;
      if(gap(a)<gap(b)) lo=a; else hi=b;
    }
    best=Math.max(best,gap((lo+hi)/2));
  }
  if(len2) {
    const normal=Math.atan2(sz,sx)+Math.PI/2;
    best=Math.max(best,gap(normal),gap(normal+Math.PI));
  }
  if(other.faction==='terrain') for(let i=0;i<4;i++)best=Math.max(best,gap(-other.yaw+i*Math.PI/2));
  return best;
}

// The swept ellipse at a pivot need not be convex. The angular distance
// bounds point displacement, letting clear intervals terminate without samples
// that could skip a thin obstacle inside the turn.
export function crossesOnTurn(p,delta,other,clearance=0) {
  if(Math.abs(delta)<EPS || p.baseWidth===p.baseDepth) return false;
  if(Math.hypot(p.x-other.x,p.z-other.z)>outerRadius(p)+outerRadius(other)+clearance+EPS) return false;
  const gapAt=t=>{const q={...p,yaw:p.yaw+delta*t};return sweptGap(q,q,other,clearance)-clearance;};
  const queue=[[0,1]];
  while(queue.length) {
    const [lo,hi]=queue.pop(),mid=(lo+hi)/2,gap=gapAt(mid);
    if(gap < -EPS) return true;
    const displacement=outerRadius(p)*Math.abs(delta)*(hi-lo)/2;
    if(gap+EPS>=displacement || displacement<=EPS) continue;
    queue.push([lo,mid],[mid,hi]);
  }
  return false;
}

function boardContains(p,width,depth,delta=0) {
  const orientations=[p.yaw,p.yaw+delta];
  const low=Math.min(...orientations),high=Math.max(...orientations);
  // X and Z extent extrema both occur at multiples of a quarter turn.
  for(let i=Math.ceil(low/(Math.PI/2)); i<=Math.floor(high/(Math.PI/2)); i++) orientations.push(i*Math.PI/2);
  return orientations.every(yaw=>{
    const at={...p,yaw};
    return Math.abs(p.x)+radius(at,1,0)<=width/2+EPS && Math.abs(p.z)+radius(at,0,1)<=depth/2+EPS;
  });
}

// game.pieces is the full battlefield. pieces identifies the acting unit.
// Each path waypoint overrides the previous pose; a combined waypoint moves
// horizontally, then vertically, then pivots. Include intermediate waypoints for
// another order. origins lets the UI replay a draft from its true starting pose.
export function assessMove({game,pieces,origins={},paths={},type,advanceRoll=0,phase='finish',
    takeToSkies=false,fallbackMode='ordered',desperateEscapeResolved=false,checkEligibility=true,
    chargeDistance,maxDistance}) {
  const fightMove=type==='pile-in' || type==='consolidate';
  const errors=[],manual=[],models={};
  const seen=new Set();
  function add(list,code,ids,message) {
    const key=code+'|'+ids.join('|');
    if(!seen.has(key)) {list.push(issue(code,ids,message));seen.add(key);}
  }
  const fail=(code,ids,message)=>add(errors,code,ids,message);
  const check=(code,ids,message)=>add(manual,code,ids,message);
  const result=coherence=>({ok:errors.length===0,errors,manual,models,coherency:coherence});
  if(!game || !Array.isArray(game.pieces) || !Array.isArray(pieces) || !pieces.length || !paths || typeof paths!=='object' || Array.isArray(paths) ||
    !origins || typeof origins!=='object' || Array.isArray(origins) ||
    !Number.isFinite(game.width) || !Number.isFinite(game.depth) || game.width<=0 || game.depth<=0 ||
    !['normal','advance','fallback','remain','charge','pile-in','consolidate'].includes(type) || !['path','finish'].includes(phase) ||
    (type==='charge' && (!Number.isFinite(chargeDistance)||chargeDistance<0)) ||
    (fightMove && (![3,6].includes(maxDistance)||takeToSkies)) ||
    !['ordered','desperate'].includes(fallbackMode) || (type==='advance' && (!Number.isInteger(advanceRoll) || advanceRoll<1 || advanceRoll>6))) {
    fail('invalid-move',[],'이동 종류·전장·분대·전력 이동 D6을 확인하세요.');
    return result(null);
  }
  const state={...game.rules,attachments:game.rules?.attachments||{}};
  const all=game.pieces.filter(p=>!p.removed && (state.hp?.[p.id]??1)>0);
  const ids=new Set(pieces.map(p=>typeof p==='string'?p:p.id));
  const first=all.find(p=>ids.has(p.id) && getProfile(p));
  if(!first) {fail('empty-unit',[...ids],'전장에 이동할 분대가 없습니다.');return result(null);}
  const key=groupId(state,first);
  const acting=all.filter(p=>p.faction===first.faction && groupId(state,p)===key);
  if([...ids].some(id=>!acting.some(p=>p.id===id)) || Object.keys(paths).some(id=>!acting.some(p=>p.id===id)))
    fail('other-unit',[...ids],'한 번에 같은 분대의 모델만 이동할 수 있습니다.');
  const others=all.filter(p=>!acting.includes(p)).map(p=>({...p,...pose(p)}));
  const enemies=others.filter(p=>p.faction!=='terrain' && p.faction!==first.faction);
  const starts=acting.map(p=>({...p,...pose({...p,...origins[p.id]})}));
  if(starts.some(p=>!Object.values(pose(p)).every(Number.isFinite))) {
    fail('invalid-origin',starts.map(p=>p.id),'시작 위치·각도·높이가 올바르지 않습니다.');
    return result(null);
  }
  const startedEngaged=starts.some(p=>enemies.some(enemy=>engaged(p,enemy)));
  if(checkEligibility && (type==='normal'||type==='advance') && startedEngaged) fail('start-engaged',[],'교전 중인 분대는 일반·전력 이동을 선언할 수 없습니다.');
  if(checkEligibility && type==='fallback' && !startedEngaged) fail('start-unengaged',[],'후퇴하려면 이동 시작 시 교전 중이어야 합니다.');
  if(checkEligibility && takeToSkies && (!starts.some(isFly) || type==='remain')) fail('cannot-fly',[],'비행 모델이 있는 이동 분대만 비행을 선언할 수 있습니다.');
  if(type==='fallback') {
    const shocked=state.units?.[key]?.shocked;
    if(checkEligibility && shocked && fallbackMode==='ordered') fail('ordered-shocked',[],'전장 충격 상태에서는 필사적 탈출을 선택해야 합니다.');
    if(fallbackMode==='desperate') {
      if(!desperateEscapeResolved) check('desperate-hazard',starts.map(p=>p.id),'움직이기 전에 분대 모델마다 위험 판정을 하고 사상자를 반영하세요.');
      if(phase==='finish' && !shocked) check('desperate-shock',[],'필사적 탈출 후 이 분대의 전장 충격 판정을 하세요.');
    }
  }
  const ends=[];
  for(const p of starts) {
    const budget=type==='charge'?Math.max(0,chargeDistance-(takeToSkies?2:0)):
      fightMove?maxDistance:moveLimit(p,type,advanceRoll,takeToSkies);
    const flying=takeToSkies && isFly(p);
    let position=p, distance=0;
    const route=paths[p.id]??[];
    if(!Array.isArray(route)) {fail('invalid-path',[p.id],'모델의 이동 경로를 확인하세요.');continue;}
    for(const waypoint of route) {
      if(!waypoint || typeof waypoint!=='object' || !['x','z','yaw','elevation'].every(k=>!(k in waypoint)||Number.isFinite(waypoint[k]))) {
        fail('invalid-path',[p.id],'경유점 좌표와 높이는 유한한 숫자여야 합니다.');break;
      }
      const end={...position,...pose({...position,...waypoint})};
      const translated={...position,x:end.x,z:end.z}, lifted={...translated,elevation:end.elevation};
      const ground=Math.hypot(end.x-position.x,end.z-position.z),vertical=gapY(position,end),delta=turn(position.yaw,end.yaw);
      const moving=ground>EPS || vertical>EPS || Math.abs(delta)>EPS;
      if(moving && type==='remain') fail('stationary',[p.id],'정지한 모델은 이동하거나 회전할 수 없습니다.');
      distance+=travelCost(p,position,end,takeToSkies);
      if(end.elevation<0 || !boardContains(position,game.width,game.depth) || !boardContains(translated,game.width,game.depth,delta))
        fail('board-edge',[p.id],'이동·회전 중 베이스 전체가 전장 안에 있어야 합니다.');
      if(vertical>EPS && !flying) check('climb',[p.id],'상하 이동 중 지형까지 수평 ½″ 이내이고 해당 지형을 오르내릴 수 있는지 확인하세요.');
      if(moving && type!=='remain') for(const obstacle of others) {
        const terrain=obstacle.faction==='terrain';
        const vehicleTransit=(type==='normal' || type==='advance') && isVehicle(p);
        if(!terrain && obstacle.faction===p.faction && !(vehicleTransit && isVehicle(obstacle))) continue;
        if(flying || (!terrain && (type==='fallback' && fallbackMode==='desperate' ||
            vehicleTransit && !isVehicle(obstacle)))) continue;
        const horizontal=sweptGap(position,translated,obstacle)<-EPS;
        const atEnd=sweptGap(lifted,lifted,obstacle)<-EPS;
        const rotate=crossesOnTurn(lifted,delta,obstacle);
        if(!(horizontal || atEnd || rotate)) continue;
        if(terrain) {
          check('terrain-path',[p.id,obstacle.id],'지형의 실제 벽·바닥과 통과 가능한 높이 및 이동 경로를 확인하세요.');continue;
        }
        const crossesLevel=(obstacle.elevation-position.elevation)*(obstacle.elevation-end.elevation)<=0;
        if(horizontal && gapY(position,obstacle)<=EPS || atEnd && crossesLevel || rotate && gapY(end,obstacle)<=EPS)
          fail('enemy-base',[p.id,obstacle.id],'이 경로는 통과할 수 없는 모델의 베이스와 겹칩니다.');
        else check('model-clearance',[p.id,obstacle.id],'높이가 다른 모델의 실제 조형을 통과하는지 확인하세요.');
      }
      position=end;
    }
    if(distance>budget+EPS) fail('distance',[p.id],p.name+'의 누적 이동 거리가 허용 거리를 초과합니다.');
    models[p.id]={distance,limit:budget,end:pose(position)};
    ends.push(position);
    if(phase==='finish' && type!=='remain') {
      const support=patrolTerrainPlacement(position,others);
      if(support.contacts) fail('vehicle-terrain',[p.id,...support.contacts],support.error);
      else if(position.elevation>0){
        if(support.error) fail(p.kind==='wartrakk'?'upper-floor':'unsupported-floor',[p.id],support.error);
        else if(support.manual) check('supported-floor',[p.id],support.manual);
      }else if(support.error) fail('terrain-base',[p.id],support.error);
    }
  }
  if(phase!=='finish' || type==='remain') return result(null);
  const coherence=coherency(ends);
  errors.push(...coherence.errors);
  for (const [i,p] of ends.entries()) {
    for (const other of [...ends.slice(i+1),...others]) {
      const pair=[p.id,other.id];
      if(other.faction==='terrain') {
        if(sweptGap(p,p,other)<-EPS){
          const hint=p.kind==='landSpeeder'||p.kind==='wartrakk'
            ?'Solid 지형이라면 지면에서 3″ 이하인 벽의 닫힌 문·창문 윤곽을 차량 일부가 관통하는지 확인하세요.'
            :'최종 베이스와 조형이 실제 벽·천장에 걸치지 않는지 확인하세요.';
          check('terrain-end',pair,hint);
        }
        continue;
      }
      if(sweptGap(p,p,other)<-EPS) {
        if(gapY(p,other)<=EPS) fail('base-overlap',pair,'이동 완료 시 두 베이스가 겹칩니다.');
        else check('model-clearance',pair,'다른 높이에서 두 모델이 겹칩니다. 실제 바닥 간격과 조형의 높이를 확인하세요.');
      }
      if(!fightMove && type!=='charge' && other.faction!==p.faction && engaged(p,other)) fail('end-engaged',pair,'이동을 마친 분대는 적과 교전 거리 밖에 있어야 합니다.');
    }
  }
  return result(coherence);
}
