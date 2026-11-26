import {baseDistance} from './state.mjs';
import {assessMove} from './movement.mjs';
import {currentHP,groupId} from './rules/battle.mjs';
import {getProfile} from './rules/profiles.mjs';
import {inDoctrine,hasWaaagh,unitTargetedByStratagem} from './rules/patrol.mjs';

// Core 01.04, 03, 11.01–04, 15.11 and 21.03, plus the Starter Set patrols:
// https://www.warhammer-community.com/en-gb/articles/2akzkx92/combat-patrol-is-now-live-in-your-app/
// https://wahapedia.ru/wh40k11ed_cp/factions/assault-force/ (Master of War and doctrines)
// https://wahapedia.ru/wh40k11ed_cp/factions/ardmob/ (Waaagh)
const EPS=1e-6;
const costs={normal:0,masterOfBattle:0,leapToDefend:1,intoTheFray:2};
const issue=(code,modelIds,message)=>({code,modelIds,message});
const altitude=p=>p.elevation??0;
const gapY=(a,b)=>Math.abs(altitude(a)-altitude(b));
const distance=(a,b)=>Math.hypot(baseDistance(a,b),gapY(a,b));
const engages=(a,b)=>gapY(a,b)<=5+EPS && baseDistance(a,b)<=2+EPS;
const nearest=(p,others)=>Math.min(...others.map(b=>distance(p,b)));
const flying=p=>p.kind==='vanguard' || p.kind==='landSpeeder';
const phaseKey=s=>[s.round,s.active,s.step].join('-');

// Before the roll, eligible on a target means it is in declaration range.
// After the roll, both the 12" cap and the actual movement limit apply.
export function chargeOptions(game,actor,{mode='normal',roll,takeToSkies=false,origins={},declared=false,endOfPhase}={}) {
  const errors=[],targets=[],members=[];
  const result={ok:false,errors,targets,members,unit:null,limit:null,cost:costs[mode]??0};
  const fail=(code,message)=>errors.push(issue(code,[],message));
  const state=game?.rules;
  if(!Array.isArray(game?.pieces) || state?.status!=='playing' || state.step!==3) {
    fail('wrong-phase','대전의 돌격 페이즈에서 선언하세요.');return result;
  }
  if(state.terrifyingCharge){fail('terrifying-charge','공포의 돌격을 먼저 사용하거나 생략하세요.');return result;}
  if(!Object.hasOwn(costs,mode)) {fail('invalid-mode','돌격 선언 종류를 확인하세요.');return result;}
  const onTable=game.pieces.filter(p=>getProfile(p) && currentHP(state,p)>0 && !state.reserves?.[groupId(state,p)]);
  const member=onTable.find(p=>p.id===(typeof actor==='string'?actor:actor?.id));
  if(!member) {fail('no-unit','전장에 있는 생존 모델을 선택하세요.');return result;}
  const unit=groupId(state,member),flags=state.units?.[unit]||{};
  result.unit=unit;
  members.push(...onTable.filter(p=>p.faction===member.faction && groupId(state,p)===unit).map(p=>({...p,...origins[p.id]})));
  const heroic=mode==='leapToDefend'||mode==='intoTheFray';
  if((mode==='normal')!==(state.active===member.faction)) fail('wrong-side','현재 턴과 돌격을 선언할 진영을 확인하세요.');
  if(mode!=='normal' && endOfPhase===false) fail('reaction-timing','반응 돌격은 상대 돌격 페이즈 종료 시에 선언합니다.');
  if(mode==='masterOfBattle' && !members.some(p=>p.kind==='captain')) fail('master-unit','전쟁의 달인은 캡틴 분대가 사용합니다.');
  if(heroic && (members.some(p=>p.kind==='landSpeeder')||flags.shocked))
    fail('heroic-unit','전장 충격 상태의 분대와 랜드 스피더는 영웅적 개입을 사용할 수 없습니다.');
  if(!declared) {
    if(flags.charge!=null || flags.charged || flags.counterCharge) fail('already-declared','이번 페이즈에 이 분대는 이미 돌격을 선언했습니다.');
    if(heroic && (state.cp?.[member.faction]??0)<costs[mode]) fail('reaction-cp','영웅적 개입에 필요한 지휘 포인트가 부족합니다.');
    if(heroic && state.patrol?.spent?.heroicIntervention===phaseKey(state)) fail('reaction-spent','이번 페이즈에 영웅적 개입을 이미 사용했습니다.');
    if(heroic && unitTargetedByStratagem(state,unit)) fail('unit-stratagem','이 분대는 이번 페이즈에 이미 다른 전술의 표적이었습니다.');
    if(flags.movement==='advance' && !inDoctrine(state,member,'assault') && !hasWaaagh(state,member) ||
       flags.movement==='fallback' && !inDoctrine(state,member,'tactical')) fail('movement-order','이 분대의 이번 턴 이동 명령으로는 돌격할 수 없습니다.');
  }
  if(takeToSkies && !members.some(flying)) fail('cannot-fly','비행 모델이 있는 분대만 비행 돌격할 수 있습니다.');
  if(roll!=null) {
    if(!Number.isInteger(roll)||roll<2||roll>12) fail('invalid-roll','돌격 굴림은 2D6의 합이어야 합니다.');
    else result.limit=Math.max(0,(mode==='masterOfBattle'||mode==='intoTheFray'?Math.min(roll,6):roll)-(takeToSkies?2:0));
  }
  const enemies=onTable.filter(p=>p.faction!==member.faction);
  const groups=Map.groupBy(enemies,p=>groupId(state,p));
  for(const [key,opponents] of groups) {
    const closest=Math.min(...members.map(p=>nearest(p,opponents)));
    // 15.11 targets a friendly unit, pays CP, chooses a mode, then resolves 11.02.
    // A legal declaration may consequently have no enemy charge targets after rolling.
    const eligible=closest<=Math.min(12,result.limit??12)+EPS &&
      (mode!=='leapToDefend' || !!state.units?.[key]?.charged) &&
      (mode!=='intoTheFray' || closest<=6+EPS);
    targets.push({unit:key,distance:closest,eligible,members:opponents});
  }
  if(members.some(p=>enemies.some(b=>engages(p,b)))) fail('start-engaged','교전 중인 분대는 돌격을 선언할 수 없습니다.');
  if(!targets.some(t=>t.distance<=(mode==='masterOfBattle'?6:12)+EPS)) fail('no-enemy','돌격을 선언할 범위 안에 적 분대가 없습니다.');
  result.ok=errors.length===0;
  return result;
}

const closer=(p,start,targets)=>targets.some(t=>nearest(p,t.members)<nearest(start,t.members)-EPS);
const oneInch=(p,opponent)=>distance(p,opponent)<=1+EPS;
const meets=(p,targets,within)=>targets.some(t=>t.members.some(b=>within(p,b)));
const allEngaged=(ends,targets)=>targets.every(t=>ends.some(p=>t.members.some(b=>engages(p,b))));

// A proven legal alternative, with the rest of the unit in its proposed final
// positions, is sufficient to require the better endpoint. A failed search
// never proves impossibility (walls, other routes, placement order and free
// pivots can matter). Surface unresolved cases for an explicit table ruling.
function reachability(start,ends,selected,unselected,options,within,limit) {
  let plausible=false;
  for(const {members} of selected) for(const b of members) {
    const dx=b.x-start.x,dz=b.z-start.z,len=Math.hypot(dx,dz);
    const outer=p=>Math.max(p.baseWidth,p.baseDepth)/2;
    const horizontal=Math.max(0,len-outer(start)-outer(b)),vertical=gapY(start,b);
    const canFly=options.takeToSkies && flying(start);
    const lowerBound=within===oneInch?Math.max(0,Math.hypot(horizontal,canFly?0:vertical)-1):
      Math.max(0,horizontal-2)+(canFly?0:Math.max(0,vertical-5));
    if(lowerBound>limit+EPS) continue;
    plausible=true;
    // Ground-level witnesses avoid assumptions about floors and wall height.
    if(vertical>EPS || altitude(start)>EPS || !len) continue;
    const straight={x:dx/len,z:dz/len};
    let lo=0,hi=Math.min(len,limit);
    const at=t=>({...start,x:start.x+straight.x*t,z:start.z+straight.z*t});
    if(!within(at(hi),b)) continue;
    for(let i=0;i<26;i++) {const mid=(lo+hi)/2;if(within(at(mid),b)) hi=mid;else lo=mid;}
    const destination=at(hi);
    if(!closer(destination,start,selected)) continue;
    const peers=ends.map(p=>p.id===start.id?destination:p);
    if(!allEngaged(peers,selected) || meets(destination,unselected,engages)) continue;
    const alt=assessMove({...options,paths:{...options.paths,[start.id]:[{x:destination.x,z:destination.z}]}});
    if(alt.ok && !alt.manual.length) return 'proven';
  }
  return plausible?'review':'impossible';
}

export function assessCharge({game,actor,origins={},paths={},targets=[],roll,takeToSkies=false,
    mode='normal',phase='finish',declared=false,endOfPhase}) {
  const options=chargeOptions(game,actor,{mode,roll,takeToSkies,origins,declared,endOfPhase});
  const errors=[...options.errors],manual=[];
  const result={ok:false,errors,manual,models:{},coherency:null,limit:options.limit,fightsFirst:false};
  if(options.limit==null && !errors.length) errors.push(issue('invalid-roll',[],'표적을 선택하기 전에 돌격 거리를 굴리세요.'));
  if(!Array.isArray(targets)||!targets.length) errors.push(issue('no-target',[],'돌격할 적 분대를 하나 이상 선택하세요.'));
  if(errors.length) return result;
  const selected=options.targets.filter(t=>targets.includes(t.unit)),unselected=options.targets.filter(t=>!targets.includes(t.unit));
  if(selected.length!==targets.length || selected.some(t=>!t.eligible)) {
    errors.push(issue('ineligible-target',[],'각 표적은 선언 시점의 굴림 거리 및 해당 반응의 표적 조건을 충족해야 합니다.'));return result;
  }
  const geometry={game,pieces:options.members,origins,paths,type:'charge',takeToSkies,phase,
    chargeDistance:options.limit+(takeToSkies?2:0),checkEligibility:false};
  const move=assessMove(geometry);
  Object.assign(result,{models:move.models,coherency:move.coherency});
  errors.push(...move.errors);manual.push(...move.manual);
  if(phase==='finish' && options.members.every(p=>result.models[p.id])) {
    const ends=options.members.map(p=>({...p,...result.models[p.id].end}));
    for(const target of selected) if(!allEngaged(ends,[target]))
      errors.push(issue('target-unengaged',target.members.map(p=>p.id),'선택한 모든 표적 분대와 교전해야 합니다.'));
    for(const p of ends) {
      const start=options.members.find(m=>m.id===p.id);
      if(!closer(p,start,selected)) errors.push(issue('not-closer',[p.id],'각 모델은 적 표적 분대 하나 이상에 가까워져야 합니다.'));
      if(meets(p,unselected,engages)) errors.push(issue('non-target-engaged',[p.id],'선택하지 않은 적 분대와 교전한 채로 끝낼 수 없습니다.'));
    }
    for(const p of ends) {
      const start=options.members.find(m=>m.id===p.id);
      for(const [within,code,label] of [[oneInch,'within-one','1″ 이내'],[engages,'must-engage','교전 거리']]) {
        if(meets(p,selected,within)) continue;
        const status=reachability(start,ends,selected,unselected,geometry,within,options.limit);
        if(status==='proven') errors.push(issue(code,[p.id],'해당 모델은 표적의 '+label+'에 도달할 수 있으므로 그곳에서 이동을 마쳐야 합니다.'));
        else if(status==='review') manual.push(issue('review-'+code,[p.id],'우회·지형·분대 배치를 고려해 이 모델이 표적의 '+label+'에 도달할 수 있는지 확인하세요. 가능하면 경로를 수정하세요.'));
      }
    }
  }
  result.ok=!errors.length;
  result.fightsFirst=result.ok && phase==='finish';
  return result;
}
