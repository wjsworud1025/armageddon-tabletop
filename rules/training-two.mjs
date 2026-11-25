import {createTrainingTwoTable, trainingTwoWallSegments, validateTrainingTwoLayout} from '../data/training-two-layout.mjs';
import {handbookFacing,handbookTurn} from './handbook-deployment.mjs';
import {assessMove,sweptGap,crossesOnTurn} from '../movement.mjs';
import {measureFootprints} from '../ruler.mjs';
import {getProfile, unitId} from './profiles.mjs';
import {opposite, woundThreshold} from './battle.mjs';

export function handbookBattleEngine({scenario,field,names,validateLayout,wallSegments,shooting=null,command=null}){
  const models=field.pieces.filter(p=>p.faction!=='terrain');
  const keys=Object.keys(names);
  const factions=Object.fromEntries(models.map(p=>[unitId(p),p.faction]));
  const eps = 1e-6;
  const pose = p => ({x:p.x,z:p.z,yaw:p.yaw});
  const gap = (a,b) => a.baseWidth!==a.baseDepth||b.baseWidth!==b.baseDepth?measureFootprints(a,b).horizontal:
    Math.max(0, Math.hypot(a.x-b.x,a.z-b.z)-(a.baseWidth+b.baseWidth)/2);
  const req = (condition, message) => {if (!condition) throw new Error(message);};
  const isDie = n => Number.isInteger(n) && n>=1 && n<=6;
  const terrainLines=field.pieces.filter(p=>p.faction==='terrain').flatMap(wall=>{
    const vertices=wallSegments(wall);
    return vertices.slice(1).map((end,i)=>[vertices[i],end]);
  });
  const wallFootprints=terrainLines.map(([a,b])=>({faction:'terrain',x:(a.x+b.x)/2,z:(a.z+b.z)/2,
    baseWidth:Math.hypot(b.x-a.x,b.z-a.z),baseDepth:scenario===4?.2:0,yaw:-Math.atan2(b.z-a.z,b.x-a.x)}));
  const wallClearance=scenario===4?0:.1;
  function pointSegment(p,a,b) {
    const dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz || 1)));
    return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
  }
  function segmentDistance(a,b,c,d) {
    const cross=(p,q,r)=>(q.x-p.x)*(r.z-p.z)-(q.z-p.z)*(r.x-p.x);
    if(cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0) return 0;
    return Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b));
  }

  function initial(poses) {
    return {version:1,scenario,...(shooting?{first:'orks',shooting:null}:{}),...(command?{mission:command.create()}:{}),
      round:1,active:'orks',phase:command?'command':'movement',initial:poses,poses:{...poses},
      hp:Object.fromEntries(models.map(p=>[p.id,getProfile(p).wounds])),moved:{},charged:{},
      fight:null,plan:null,attack:null,winner:null,rolls:[],history:[]};
  }
  function create(table=field) {
    req(!validateLayout(table).length,'훈련 '+scenario+'의 스타터 배치와 편성을 확인하세요.');
    for(const original of field.pieces.filter(p=>p.faction==='terrain')) {
      const wall=table.pieces.find(p=>p.id===original.id);
      req(same(pose(wall),pose(original)) && same(wall.displayScale,original.displayScale),'훈련 지형은 배치도의 벽 위치에 놓으세요.');
    }
    const poses=Object.fromEntries(table.pieces.filter(p=>p.faction!=='terrain').map(p=>[p.id,pose(p)]));
    if(!shooting)req(keys.every(u=>coherent(members(table.pieces,u))),'배치한 분대는 2″ 간격으로 이어져야 합니다.');
    if(shooting)req(models.every(p=>scenario===4?handbookFacing(p.yaw,poses[p.id].yaw)!==null:poses[p.id].yaw===p.yaw),'훈련 '+scenario+'의 배치 방향을 확인하세요.');
    return initial(poses);
  }
  function pieces(s) {
    return field.pieces.map(p=>{
      if(p.faction==='terrain') return {...p};
      const preview=s.plan?.paths?.[p.id]?.at(-1);
      return {...p,...s.poses[p.id],...preview,elevation:0,removed:s.hp[p.id]===0};
    });
  }
  function forces(s) {
    return models.filter(p=>s.hp[p.id]>0).map(p=>({...p,...s.poses[p.id]}));
  }
  const members=(all,u)=>all.filter(p=>unitId(p)===u);
  const enemies=(all,u)=>all.filter(p=>p.faction!==factions[u]);
  const distanceTo=(p,list)=>Math.min(...list.map(q=>gap(p,q)));
  function unitGap(all,u,t) {
    const targets=members(all,t);
    return Math.min(...members(all,u).map(p=>distanceTo(p,targets)));
  }
  const foes=(all,u,range)=>keys.filter(t=>factions[t]!==factions[u] && unitGap(all,u,t)<=range+eps);
  const engaged=(all,u)=>foes(all,u,2).length>0;
  function coherent(unit) {
    if(!unit.length) return true;
    const reached=new Set([unit[0]]);
    for(const p of reached) for(const q of unit) if(gap(p,q)<=2+eps) reached.add(q);
    return reached.size===unit.length;
  }
  const option=(type,label,params={})=>({type,...params,label});
  const next=()=>option('next','다음 단계');
  function moveOptions(s,all) {
    const out=[];
    for(const u of keys.filter(k=>factions[k]===s.active && members(all,k).length && !s.moved[k])) {
      const modes=engaged(all,u)?['fallback']:['normal','advance'];
      for(const mode of modes) out.push(option('move',names[u]+' '+({fallback:'후퇴',normal:'이동',advance:'전력 이동'})[mode],{unit:u,mode}));
    }
    out.push(next());
    return out;
  }
  function chargeOptions(s,all) {
    return [...keys.filter(u=>factions[u]===s.active && members(all,u).length && !(u in s.charged) &&
      !['advance','fallback'].includes(s.moved[u]) && !engaged(all,u) && foes(all,u,12).length)
      .map(u=>option('charge',names[u]+' 돌격 2D6',{unit:u})), next()];
  }
  function fightKeys(s,all) {
    const f=s.fight;
    return keys.filter(u=>factions[u]===f.actor && members(all,u).length && engaged(all,u) &&
      (f.stage==='pile' ? !f.piled.includes(u) :
       f.stage==='consolidate' ? f.fought.includes(u) && !f.consolidated.includes(u) :
       !f.fought.includes(u) && (f.stage!=='first' || s.charged[u]===true)));
  }
  function fightOptions(s,all) {
    const f=s.fight;
    const type=f.stage==='pile'?'pile':f.stage==='consolidate'?'consolidate':'fight';
    const label={pile:'접근 이동',consolidate:'재정비 이동',fight:'근접 공격'}[type];
    const out=fightKeys(s,all).flatMap(u=>{
      if(type==='fight')return [option(type,names[u]+' '+label,{unit:u})];
      return foes(all,u,2).map(target=>option(type,names[u]+' '+label+' → '+names[target],{unit:u,target}));
    });
    if(type!=='fight' || !out.length) out.push(next());
    return out;
  }
  const profileOf=id=>getProfile(models.find(p=>p.id===id));
  function attackOptions(s,all) {
    const a=s.attack;
    if(a.stage==='allocate') {
      const candidates=members(all,a.target);
      const wounded=candidates.find(p=>s.hp[p.id]<getProfile(p).wounds);
      return (wounded?[wounded]:candidates).map(p=>option('allocate',p.name+'에 피해 배정',{model:p.id}));
    }
    if(a.stage!=='select') return [option('roll',({hit:'명중',wound:'상처',save:'방어'})[a.stage]+' 주사위')];
    const out=[];
    for(const [id,targets] of Object.entries(a.eligible)) {
      if(a.used.includes(id)) continue;
      const p=all.find(m=>m.id===id);
      if(!p) continue;
      for(const target of targets.filter(t=>members(all,t).length)) {
        getProfile(p).weapons.forEach((w,weapon)=>{
          if(w.range===0)out.push(option('strike',p.name+' · '+w.name+' → '+names[target],{model:id,target,weapon}));
        });
      }
    }
    return out;
  }
  function planOptions(s) {
    const p=s.plan;
    if(p.mode==='charge' && !p.target) {
      const options=p.targets.map(unit=>option('target',names[unit]+' 돌격',{unit}));
      if(p.checkBlocked) options.push(option('blocked','경유해도 어느 적에게도 닿을 수 없음 확인'));
      return options;
    }
    const options=[option('finish','이동 확정'),option('rewind','경로 되돌리기')];
    if(p.mode==='charge')options.push(option('retarget','돌격 표적 다시 선택'));
    return options;
  }
  function view(s) {
    const all=forces(s);
    const ranged=s.phase==='shooting'?shooting.view(s,pieces(s)):null;
    const orders=s.phase==='command'?command.view(s,pieces(s)):null;
    const actor=s.winner?null:ranged?ranged.actor:s.attack && ['save','allocate'].includes(s.attack.stage)?opposite(factions[s.attack.unit]):
      s.fight?.actor || s.active;
    const options=s.winner?[]:orders?orders.options:ranged?ranged.options:s.plan?planOptions(s):s.attack?attackOptions(s,all):
      s.phase==='movement'?moveOptions(s,all):s.phase==='charge'?chargeOptions(s,all):fightOptions(s,all);
    return {round:s.round,active:s.active,phase:s.phase,actor,options,...(shooting?{shooting:ranged}:{}),plan:s.plan,attack:s.attack,fight:s.fight,winner:s.winner};
  }
  function makePlan(s,all,unit,mode,limit,extras={}) {
    s.plan={unit,mode,limit,ids:members(all,unit).map(p=>p.id),paths:{},...extras};
  }
  function dice(s,d6,n,unit,step,threshold=null) {
    const values=Array.from({length:n},()=>{const v=d6();req(isDie(v),'D6 결과가 잘못되었습니다.');return v;});
    const successes=threshold===null?null:values.filter(v=>v>=threshold).length;
    s.rolls.push({unit,actor:step==='save'?opposite(factions[unit]):factions[unit],step,dice:values,threshold,successes});
    return successes??values.reduce((a,b)=>a+b,0);
  }
  function checkPath(s,all,finish) {
    const p=s.plan;
    const type={pile:'pile-in',consolidate:'consolidate'}[p.mode]||p.mode;
    const unit=members(all,p.unit);
    const result=assessMove({game:{width:field.width,depth:field.depth,pieces:all,rules:{}},
      pieces:unit,type,paths:p.paths,advanceRoll:p.mode==='advance'?p.limit-getProfile(unit[0]).move:0,
      chargeDistance:p.limit,maxDistance:3,phase:finish?'finish':'path'});
    const error=result.errors.find(e=>!e.code.startsWith('coherency-'));
    req(!error,error?.message);
    const opponents=enemies(all,p.unit);
    const ends=unit.map(m=>{
      const route=p.paths[m.id]||[];
      let at=m;
      for(const waypoint of route) {
        const end={...at,...waypoint};
        const delta=Math.atan2(Math.sin(end.yaw-at.yaw),Math.cos(end.yaw-at.yaw));
        if(Math.abs(delta)>eps){
          for(const wall of wallFootprints)req(!crossesOnTurn(at,delta,wall,wallClearance),'회전 중 베이스가 지형 벽에 닿습니다.');
          if(p.mode==='normal'||p.mode==='advance')for(const enemy of opponents)
            req(!crossesOnTurn(at,delta,enemy,2+2*eps),'회전 중 적 교전 거리에 들어갈 수 없습니다.');
        }
        if(Math.hypot(end.x-at.x,end.z-at.z)>eps) {
          if(scenario===4||m.baseWidth!==m.baseDepth){
            for(const wall of wallFootprints)req(sweptGap(at,end,wall,wallClearance)>=wallClearance-eps,'지형 벽을 가로지르는 경로입니다.');
          }else for(const [a,b] of terrainLines)
              req(segmentDistance(at,end,a,b)>=m.baseWidth/2+.1-eps,'지형 벽을 가로지르는 경로입니다.');
          if(p.mode==='normal'||p.mode==='advance') for(const enemy of opponents)
            req(sweptGap({...m,...at},end,enemy,2)>2+eps,'일반·전력 이동으로 적 교전 거리에 들어갈 수 없습니다.');
        }
        at=end;
      }
      const end={...m,...at};
      if(finish && route.length && p.mode==='charge') {
        const approaching=p.targets.some(t=>distanceTo(end,members(all,t))<=distanceTo(m,members(all,t))+eps);
        req(approaching,'돌격 경로는 도달 가능한 적 분대를 향해야 합니다.');
      }
      if(finish && route.length && (p.mode==='pile'||p.mode==='consolidate') &&
          (Math.hypot(end.x-m.x,end.z-m.z)>eps||Math.abs(end.yaw-m.yaw)>eps)) {
        const target=members(all,p.target);
        req(distanceTo(end,target)<distanceTo(m,target)-eps,'선택한 적 분대에 더 가까워져야 합니다.');
        if(p.mode==='pile') {
          const oldTargets=foes(all,p.unit,2);
          req(opponents.every(q=>oldTargets.includes(unitId(q)) || gap(end,q)>2+eps),'접근 이동으로 새 적 분대와 교전할 수 없습니다.');
        }
      }
      return end;
    });
    if(!finish)return;
    req(coherent(ends),'같은 분대가 2″ 간격으로 하나의 연결된 무리를 이루어야 합니다.');
    if(p.mode==='charge')req(ends.some(m=>distanceTo(m,members(all,p.target))<=2+eps),'돌격 표적의 교전 거리 안에서 끝내세요.');
    if(p.mode==='fallback')req(ends.every(m=>distanceTo(m,opponents)>2+eps),'적 교전 거리 밖에서 후퇴를 마치세요.');
    for(const end of ends)s.poses[end.id]=pose(end);
  }
  function finishPlan(s,all) {
    const {unit,mode}=s.plan;
    checkPath(s,all,true);
    if(mode==='charge')s.charged[unit]=true;
    else if(mode==='pile')s.fight.piled.push(unit);
    else if(mode==='consolidate')s.fight.consolidated.push(unit);
    else s.moved[unit]=mode;
    s.plan=null;
  }
  // A legal straight path proves the charge must go ahead. A keyhole in a
  // ruin or a sequence of bends may still admit a charge when these paths fail.
  function straightChargeExists(s,all,p) {
    const unit=members(all,p.unit);
    for(const target of p.targets) for(const foe of members(all,target)) for(const lead of unit) {
      const dx=foe.x-lead.x,dz=foe.z-lead.z,length=Math.hypot(dx,dz);
      const travel=gap(lead,foe)-2+.00001;
      if(travel<=0||travel>p.limit+eps)continue;
      const path=m=>[{x:m.x+dx/length*travel,z:m.z+dz/length*travel}];
      for(const movers of unit.length===1?[[lead]]:[[lead],unit]) {
        const paths=Object.fromEntries(movers.map(m=>[m.id,path(m)]));
        const probe={...s,poses:{...s.poses},plan:{...p,target,paths}};
        try {checkPath(probe,all,true);return true;} catch { /* Check another legal endpoint. */ }
      }
    }
    return false;
  }
  function endGame(s,winner) {
    if(shooting)s.shooting=null;
    s.phase='ended';s.winner=winner;s.plan=null;s.fight=null;s.attack=null;
  }
  function nextTurn(s) {
    const last=s.active==='marines';
    if(s.round===5 && last){endGame(s,command?command.outcome(s,pieces(s),{endOfTurn:true}):'draw');return;}
    if(last)s.round++;
    s.active=opposite(s.active);s.phase=command?'command':'movement';s.fight=null;s.moved={};s.charged={};
  }
  function advanceFight(s,all,pass=false) {
    const f=s.fight;
    // Both armies complete their pile-ins before anyone attacks. Pile-ins and
    // consolidations are voluntary. Charging units attack in the first tier.
    for(let transitions=0;transitions<10;transitions++) {
      if(!pass && fightKeys(s,all).length)return;
      pass=false;
      if(f.stage==='pile'||f.stage==='consolidate') {
        if(f.actor===s.active){f.actor=opposite(s.active);continue;}
        if(f.stage==='consolidate'){nextTurn(s);return;}
        f.stage='first';f.actor=s.active;continue;
      }
      f.actor=opposite(f.actor);
      if(fightKeys(s,all).length)return;
      if(f.stage==='first'){f.stage='other';f.actor=s.active;continue;}
      f.stage='consolidate';f.actor=s.active;
    }
  }
  function finishAttack(s,all) {
    const {unit}=s.attack;
    s.fight.fought.push(unit);s.attack=null;s.fight.actor=opposite(factions[unit]);
    advanceFight(s,all);
  }
  function nextModel(s,all) {
    const a=s.attack;
    a.used.push(a.model);
    s.attack={unit:a.unit,stage:'select',used:a.used,eligible:a.eligible};
    if(!attackOptions(s,all).length)finishAttack(s,all);
  }
  function combatRoll(s,all,d6) {
    const a=s.attack,w=profileOf(a.model).weapons[a.weapon],target=getProfile(members(all,a.target)[0]);
    const threshold=a.stage==='hit'?w.skill:a.stage==='wound'?woundThreshold(w.strength,target.toughness):
      Math.min(target.save-w.ap,target.invul||Infinity);
    const successes=dice(s,d6,a.count,a.unit,a.stage,threshold);
    if(a.stage==='save') {
      a.count-=successes;
      if(a.count){a.stage='allocate';return;}
    } else if(successes) {
      a.stage=a.stage==='hit'?'wound':'save';a.count=successes;return;
    }
    nextModel(s,all);
  }
  const actionKeys=['unit','mode','model','target','weapon','id','x','z'];
  if(shooting)actionKeys.push('visibility');
  if(scenario===4)actionKeys.push('direction');
  function normalize(a) {
    const out={type:a?.type};
    for(const key of actionKeys) if(a && key in a)out[key]=a[key];
    return out;
  }
  function apply(s,a,d6) {
    req(!s.winner,'종료된 훈련입니다.');
    const all=forces(s),p=s.plan;
    if(s.phase==='command'){
      const board=pieces(s);
      req(command.view(s,board).options.some(o=>same(normalize(o),a)),'현재 선택할 수 없는 지휘 행동입니다.');
      const result=command.apply(s,board,a,d6);
      s.mission=result.mission;s.rolls.push(...result.rolls);
      if(result.finished)s.phase='movement';
      return;
    }
    if(s.phase==='shooting'){
      const boardPieces=pieces(s);
      req(shooting.view(s,boardPieces).options.some(o=>same(normalize(o),a)),'현재 단계에서 선택할 수 없는 사격 행동입니다.');
      const result=shooting.apply(s,boardPieces,a,d6);
      s.shooting=result.shooting;s.hp=result.hp;s.rolls.push(...result.rolls);
      if(!models.some(m=>m.faction!==s.active&&s.hp[m.id]>0))endGame(s,command?command.outcome(s,pieces(s)):s.active);
      else if(result.finished){s.shooting=null;s.phase='charge';}
      return;
    }
    if(a.type==='path'||a.type==='pivot'&&scenario===4) {
      const rotate=a.type==='pivot';
      req(p&&(p.mode!=='charge'||p.target)&&p.ids.includes(a.id),'진행 중인 분대의 모델을 선택하세요.');
      const route=p.paths[a.id]??=[];
      req(route.length<512,'모델 경로는 최대 512점입니다. 경로를 확정하거나 되돌리세요.');
      const previous=route.at(-1)??s.poses[a.id];
      if(rotate){
        req(Object.keys(a).length===3&&(a.direction===1||a.direction===-1),'회전 방향은 오른쪽 또는 왼쪽을 선택하세요.');
        const yaw=handbookFacing(field.pieces.find(m=>m.id===a.id).yaw,(previous.yaw??s.poses[a.id].yaw)+a.direction*handbookTurn);
        route.push({x:previous.x,z:previous.z,yaw});
      }else{
        req(!shooting||Object.keys(a).length===4,'이동할 모델과 목적지만 지정하세요.');
        req(Number.isFinite(a.x)&&Number.isFinite(a.z),'유효한 이동 목적지를 지정하세요.');
        const waypoint={x:a.x,z:a.z};
        // Earlier saves contain only x/z before the first rotation.
        if(scenario===4&&route.at(-1)?.yaw!==undefined)waypoint.yaw=previous.yaw;
        route.push(waypoint);
      }
      checkPath(s,all,false);return;
    }
    const options=view(s).options;
    req(options.some(o=>shooting?same(normalize(o),a):Object.keys(o).every(k=>k==='label'||a[k]===o[k])),'현재 단계에서 선택할 수 없는 행동입니다.');
    switch(a.type) {
      case 'move': {
        const limit=getProfile(members(all,a.unit)[0]).move+(a.mode==='advance'?dice(s,d6,1,a.unit,'advance'):0);
        makePlan(s,all,a.unit,a.mode,limit);return;
      }
      case 'charge': {
        const limit=dice(s,d6,2,a.unit,'charge'),targets=foes(all,a.unit,limit);
        s.charged[a.unit]=false;
        if(targets.length) {
          makePlan(s,all,a.unit,'charge',limit,{targets,target:null});
          s.plan.checkBlocked=!straightChargeExists(s,all,s.plan);
        }
        return;
      }
      case 'target': p.target=a.unit;return;
      case 'retarget': p.target=null;p.paths={};return;
      case 'blocked': s.plan=null;return;
      case 'rewind': p.paths={};return;
      case 'finish': finishPlan(s,all);return;
      case 'pile': case 'consolidate': makePlan(s,all,a.unit,a.type,3,{target:a.target});return;
      case 'fight': {
        const eligible=Object.fromEntries(members(all,a.unit).map(m=>[m.id,
          keys.filter(t=>factions[t]!==factions[a.unit] && distanceTo(m,members(all,t))<=2+eps)]));
        s.attack={unit:a.unit,stage:'select',used:[],eligible};return;
      }
      case 'strike':
        Object.assign(s.attack,{stage:'hit',model:a.model,target:a.target,weapon:a.weapon,count:profileOf(a.model).weapons[a.weapon].attacks});return;
      case 'roll':combatRoll(s,all,d6);return;
      case 'allocate': {
        const attack=s.attack,w=profileOf(attack.model).weapons[attack.weapon];
        s.hp[a.model]=Math.max(0,s.hp[a.model]-w.damage);attack.count--;
        const alive=forces(s);
        if(!alive.some(m=>m.faction===factions[attack.target])){endGame(s,command?command.outcome(s,pieces(s)):factions[attack.unit]);return;}
        if(!attack.count||!members(alive,attack.target).length)nextModel(s,alive);
        return;
      }
      case 'next':
        if(s.phase==='movement'){
          s.phase=shooting?'shooting':'charge';
          if(shooting)s.shooting=shooting.create();
          return;
        }
        if(s.phase==='charge'){
          s.phase='fight';s.fight={stage:'pile',actor:s.active,piled:[],fought:[],consolidated:[]};return;
        }
        advanceFight(s,all,true);return;
    }
  }
  function act(state,action,d6=()=>1+Math.floor(Math.random()*6)) {
    req(state?.scenario===scenario,'훈련 시나리오를 확인하세요.');
    req(!shooting||state.first==='orks','훈련 '+scenario+'은 오크가 선공합니다.');
    const a=normalize(action),next=structuredClone({...state,history:[]}),draws=[];
    apply(next,a,()=>{const n=d6();req(isDie(n),'D6 결과가 잘못되었습니다.');draws.push(n);return n;});
    next.history=[...state.history,{action:a,dice:draws}];
    return next;
  }
  function same(a,b) {
    if(a===b)return true;
    if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
    const keys=Object.keys(a);
    return keys.length===Object.keys(b).length && keys.every(k=>Object.hasOwn(b,k)&&same(a[k],b[k]));
  }
  function validate(state) {
    try {
      if(state?.version!==1||state.scenario!==scenario||!Array.isArray(state.history))return false;
      const table={...field,pieces:field.pieces.map(p=>p.faction==='terrain'?p:{...p,...state.initial[p.id]})};
      const replay=create(table);
      if(!same(replay.initial,state.initial))return false;
      for(const record of state.history) {
        if(!Array.isArray(record?.dice)||!same(normalize(record.action),record.action))return false;
        if(shooting?Object.keys(record).length!==2:record.dice.length>6)return false;
        let n=0;apply(replay,record.action,()=>record.dice[n++]);
        if(n!==record.dice.length)return false;
      }
      return same(replay,{...state,history:[]});
    } catch {return false;}
  }
  return {create,act,view,pieces,validate};
}

const lessonTwo=handbookBattleEngine({
  scenario:2,field:createTrainingTwoTable(),validateLayout:validateTrainingTwoLayout,wallSegments:trainingTwoWallSegments,
  names:{warboss:'워보스','boy-0':'보이',captain:'캡틴',intercessor:'인터세서'},
});
export function createTrainingTwo(table){
  return lessonTwo.create(table);
}
export const {
  act:actTrainingTwo,view:trainingTwoView,pieces:trainingTwoPieces,validate:validateTrainingTwo,
}=lessonTwo;
