import {baseDistance} from './state.mjs';
import {assessMove} from './movement.mjs';
import {overlapsArea} from './layouts.mjs';
import {currentHP,groupId,opposite} from './rules/battle.mjs';
import {getProfile,profiles} from './rules/profiles.mjs';
import {payFightSelectionTactic,tacticActive,unitTargetedByStratagem} from './rules/patrol.mjs';

// 11th ed. Core Rules 03, 12.01–12.09 and Appendix 12.04.01.
// https://assets.warhammer-community.com/eng_01-06_warhammer40k_new40k_core_rules-was6fbu1ix-hfewhmxyiy.pdf
// The launch PDF predates two 12.08 amendments. The ongoing-consolidation
// reaction is recorded in the public transcription of the app's FAQ/Errata
// (the official app screen was unavailable for independent comparison).
// https://wahapedia.ru/wh40k11ed/the-rules/core-rules/#Fight-Phase
// The objective move must finish unengaged; Games Workshop also printed
// this change in the Tacoma Event FAQ, “Rules Updates”, page 1.
const EPS=1e-6;
const phases=['pile','first','remaining','consolidate','done'];
const ids=Object.keys(profiles).filter(k=>k!=='boy').concat(['boy-0','boy-1']);
const unique=a=>[...new Set(a)];
const elevation=p=>p.elevation??0;
export const bossStyles={lethal:'치명적 명중',sustained:'추가 명중 1'};
export function hasFightingWarboss(state,pieces,unit){
  return state.step===4&&pieces.some(p=>p.kind==='warboss'&&groupId(state,p)===unit&&currentHP(state,p)>0);
}
// A previous version saved the effect on attack rows instead of the
// activation. Unresolved drafts must choose once; locked dice replay as saved.
export function needsLegacyBossStyle(state,pieces,active){
  return !!active&&!active.bossStyle&&!state.declaration?.locked&&!state.hazard&&
    state.units?.[active.unit]?.finishedAttack!==4&&hasFightingWarboss(state,pieces,active.unit);
}
export function chooseLegacyBossStyle(game,style){
  const {rules,pieces}=game;
  if(rules.status!=='playing'||rules.step!==4||!rules.fightSequence&&!rules.declaration)return null;
  const sequence=rules.fightSequence??beginFightSequence(game),active=sequence.active;
  if(typeof style!=='string'||!Object.hasOwn(bossStyles,style)||!needsLegacyBossStyle(rules,pieces,active))return null;
  const next={...rules,fightSequence:{...sequence,active:{...active,bossStyle:style}}};
  if(rules.declaration){
    if(rules.declaration.unit!==active.unit)return null;
    next.declaration={...rules.declaration,rows:rules.declaration.rows.map(r=>
      ({...r,lethal:style==='lethal',sustained:style==='sustained'}))};
  }
  return next;
}
function gap(a,b){
  if(a.baseWidth===a.baseDepth&&b.baseWidth===b.baseDepth)
    return Math.max(0,Math.hypot(a.x-b.x,a.z-b.z)-(a.baseWidth+b.baseWidth)/2);
  return baseDistance(a,b);
}
const distance=(a,b)=>Math.hypot(gap(a,b),elevation(a)-elevation(b));
const engaged=(a,b)=>Math.abs(elevation(a)-elevation(b))<=5+EPS&&gap(a,b)<=2+EPS;
const touching=(a,b)=>Math.abs(elevation(a)-elevation(b))<=EPS&&gap(a,b)<=EPS;
const closest=(p,army)=>Math.min(...army.map(t=>distance(p,t)));
const near=(army,enemies,n)=>army.some(p=>closest(p,enemies)<=n+EPS);
const engagedWith=(unit,other)=>unit.some(p=>other.some(t=>engaged(p,t)));
function forces(game){
  const result=new Map();
  for(const p of game.pieces){
    if(!getProfile(p)||currentHP(game.rules,p)<=0)continue;
    const key=groupId(game.rules,p);
    if(!result.has(key))result.set(key,[]);
    result.get(key).push(p);
  }
  return result;
}
const enemies=(all,key)=>[...all].filter(([,u])=>u[0].faction!==all.get(key)[0].faction);
const contacts=(all,key)=>enemies(all,key).filter(([,other])=>engagedWith(all.get(key),other)).map(([id])=>id);
const charged=(game,key)=>!!game.rules.units?.[key]?.charged;
const priority=(game,key)=>charged(game,key)||!!game.rules.units?.[key]?.fightsFirst;
const eligible=(game,seq,all,key)=>!seq.fought.includes(key)&&(seq.engagedAtFightStart.includes(key)||charged(game,key)||contacts(all,key).length>0);
function inCombat(game,seq,all){
  return [...all.keys()].filter(key=>eligible(game,seq,all,key));
}

// 15.12 is available to the non-turn player during the Fight step only.
function counterTargets(game,seq,source){
  const {rules}=game,team=opposite(rules.active);
  const stamp=[rules.round,rules.active,4].join('-');
  if(rules.status!=='playing'||rules.step!==4||rules.units?.[source]?.finishedAttack!==4||rules.declaration||!['first','remaining'].includes(seq?.stage)||
    seq.active?.unit!==source||seq.active.extraPile||seq.active.reaction||(rules.cp?.[team]??0)<2||
    rules.patrol?.spent?.counteroffensive===stamp)return [];
  const attacker=game.pieces.find(p=>getProfile(p)&&groupId(rules,p)===source);
  if(attacker?.faction!==rules.active)return [];
  const all=forces(game);
  return inCombat(game,seq,all).filter(key=>all.get(key)[0].faction===team&&
    !rules.units?.[key]?.shocked&&!unitTargetedByStratagem(rules,key));
}
export function openCounteroffensive(game,source){
  const seq=game.rules.fightSequence;
  return counterTargets(game,seq,source).length?{...seq,counterAfter:source}:seq;
}
export function resolveCounteroffensive(game,unit){
  const {rules}=game,seq=rules.fightSequence;
  if(!seq?.counterAfter||rules.hazard||rules.declaration||rules.fightPlan)return null;
  const {counterAfter,...fightSequence}=seq;
  if(unit===null)return {...rules,fightSequence};
  if(!counterTargets(game,seq,counterAfter).includes(unit))return null;
  const team=opposite(rules.active),stamp=[rules.round,rules.active,4].join('-'),patrol=rules.patrol;
  return {...rules,fightSequence,cp:{...rules.cp,[team]:rules.cp[team]-2},
    units:{...rules.units,[unit]:{...rules.units[unit],fightsFirst:true}},
    patrol:{...patrol,spent:{...patrol.spent,counteroffensive:stamp},
      tactics:{...patrol.tactics,counteroffensive:stamp+'/'+unit}}};
}
function kinds(seq,all,key){
  const tied=contacts(all,key).length>0;
  return [tied?'normal':null,(!tied||!seq.engagedAtFightStart.includes(key))?'overrun':null].filter(Boolean);
}
function objectiveDistance(p,area){
  if(typeof area.distance==='function')return area.distance(p);
  const poly=area.polygon;
  if(!Array.isArray(poly)||poly.length<3)return Infinity;
  if(overlapsArea(p,poly))return 0;
  return Math.min(...poly.map(([x,z],i)=>{
    const [bx,bz]=poly[(i+1)%poly.length],dx=bx-x,dz=bz-z;
    if(p.baseWidth===p.baseDepth){
      const t=Math.max(0,Math.min(1,((p.x-x)*dx+(p.z-z)*dz)/(dx*dx+dz*dz||1)));
      return Math.max(0,Math.hypot(p.x-x-t*dx,p.z-z-t*dz)-p.baseWidth/2);
    }
    return baseDistance(p,{x:(x+bx)/2,z:(z+bz)/2,yaw:-Math.atan2(dz,dx),faction:'terrain',baseWidth:Math.hypot(dx,dz),baseDepth:0});
  }));
}
function canReachObjective(model,area,args,limit,foes){
  // Test a direct legal move towards each boundary edge. An inconclusive
  // result leaves terrain and coordinated multi-model routes to the players.
  const poly=area.polygon;
  if(!Array.isArray(poly))return false;
  for(const [i,[x,z]] of poly.entries()){
    const [endX,endZ]=poly[(i+1)%poly.length],dx=endX-x,dz=endZ-z;
    const t=Math.max(0,Math.min(1,((model.x-x)*dx+(model.z-z)*dz)/(dx*dx+dz*dz||1)));
    const vx=x+t*dx-model.x,vz=z+t*dz-model.z,length=Math.hypot(vx,vz);
    const amount=Math.min(length,limit),scale=length?amount/length:0;
    const along=f=>({...model,x:model.x+vx*scale*f,z:model.z+vz*scale*f});
    if(objectiveDistance(along(1),area)>EPS)continue;
    let lo=0,hi=1;
    for(let j=0;j<24;j++){
      const mid=(lo+hi)/2;
      if(objectiveDistance(along(mid),area)>EPS)lo=mid;else hi=mid;
    }
    const at=along(hi);
    if(foes.some(([,u])=>u.some(enemy=>engaged(at,enemy))))continue;
    const trial=assessMove({...args,paths:{...args.paths,[model.id]:[pos(at)]}});
    if(trial.ok&&!trial.manual.length)return true;
  }
  return false;
}
function moveChoices(game,seq,all,key,objectives){
  const unit=all.get(key);if(!unit)return null;
  const overrun=seq.active?.unit===key&&seq.active.extraPile;
  const team=overrun?unit[0].faction:seq.team;
  if(unit[0].faction!==team||(!overrun&&(seq.active||seq.reactions.length)))return null;
  let mode,targetList,allRequired=false;
  const ties=contacts(all,key),foes=enemies(all,key);
  if(overrun||seq.stage==='pile'){
    if(!overrun&&(seq.piled.includes(key)||(!ties.length&&!charged(game,key))))return null;
    mode='pile-in';allRequired=ties.length>0;
    targetList=ties.length?ties:foes.filter(([,u])=>near(unit,u,5)).map(([id])=>id);
  }else if(seq.stage==='consolidate'){
    if(!seq.eligibleDuringFight.includes(key)||seq.consolidated.includes(key))return null;
    const nearby=foes.filter(([,u])=>near(unit,u,3)).map(([id])=>id);
    if(ties.length){mode='ongoing';allRequired=true;targetList=ties;}
    else if(nearby.length){mode='engaging';targetList=nearby;}
    else{mode='objective';targetList=objectives.filter(a=>unit.some(p=>objectiveDistance(p,a)<=3+EPS)).map(a=>a.id);}
  }else return null;
  if(!targetList.length)return null;
  const limit=mode!=='pile-in'&&tacticActive(game.rules,'consolidate',key)?6:3;
  return {mode,targets:targetList,requiredAll:allRequired,maxTargets:mode==='objective'?1:targetList.length,limit};
}
export function fightMoveOptions(game,seq,unit,objectives=[]){
  const all=forces(game);
  return moveChoices(game,normalize(game,seq,all,objectives),all,unit,objectives);
}
function enterCombat(game,seq,all){
  const engagedAtFightStart=[...all.keys()].filter(k=>contacts(all,k).length);
  return {...seq,stage:'first',team:game.rules.active,passes:0,engagedAtFightStart,
    eligibleDuringFight:unique([...seq.eligibleDuringFight,...engagedAtFightStart,...[...all.keys()].filter(k=>charged(game,k))])};
}
function enterConsolidation(game,seq){
  return {...seq,stage:'consolidate',team:game.rules.active,passes:0};
}
function passMovementSide(game,seq,all){
  if(seq.team===game.rules.active)return {...seq,team:opposite(seq.team)};
  return seq.stage==='pile'?enterCombat(game,seq,all):{...seq,stage:'done'};
}
function normalize(game,state,all,objectives){
  let seq=state;
  for(let i=0;i<10;i++){
    if(seq.stage==='done')return seq;
    if(seq.active){
      if(seq.stage==='first'||seq.stage==='remaining')return {...seq,eligibleDuringFight:unique([...seq.eligibleDuringFight,...inCombat(game,seq,all)])};
      return seq;
    }
    if(seq.reactions.length){
      const live=seq.reactions.filter(k=>all.has(k)&&!seq.fought.includes(k));
      seq={...seq,reactions:live};
      if(live.length)return seq;
    }
    if(seq.stage==='pile'||seq.stage==='consolidate'){
      if([...all.keys()].some(key=>moveChoices(game,seq,all,key,objectives)))return seq;
      seq=passMovementSide(game,seq,all);continue;
    }
    const eligible=inCombat(game,seq,all);
    seq={...seq,eligibleDuringFight:unique([...seq.eligibleDuringFight,...eligible])};
    let first=eligible.filter(k=>priority(game,k));
    // The appendix sends play to the opponent after a voluntary pass, even
    // when the passed unit was the only remaining Fights First unit.
    if(seq.passes && !first.some(k=>all.get(k)[0].faction===seq.team))first=[];
    if(!first.length&&seq.stage==='first'){seq={...seq,stage:'remaining'};continue;}
    if(first.length&&seq.stage==='remaining'){seq={...seq,stage:'first'};continue;}
    if(!eligible.length){seq=enterConsolidation(game,seq);continue;}
    const pool=seq.stage==='first'?first:eligible;
    if(!pool.some(k=>all.get(k)[0].faction===seq.team))seq={...seq,team:opposite(seq.team)};
    return seq;
  }
  throw Error('근접전 순서를 결정할 수 없습니다.');
}
export function beginFightSequence(game,objectives=[]){
  if(game.rules?.status!=='playing'||game.rules.step!==4)throw Error('근접전 페이즈에서 시작하세요.');
  const all=forces(game);
  // Prior v1 snapshots may already contain a resolved or partially declared fight.
  const fought=ids.filter(k=>game.rules.units?.[k]?.finishedAttack===4);
  const source={stage:'pile',team:game.rules.active,piled:[],fought,consolidated:[],engagedAtFightStart:[],
    eligibleDuringFight:[...fought],active:null,reactions:[],passes:0};
  if(game.rules.declaration || (game.rules.hazard?.unit && game.rules.hazard.reason!=='escape')){
    const key=game.rules.declaration?.unit??game.rules.hazard.unit;
    const started=enterCombat(game,source,all);
    return {...started,fought:unique([...fought,key]),eligibleDuringFight:unique([...started.eligibleDuringFight,key]),
      team:all.get(key)?.[0].faction??started.team,active:{unit:key,kind:'normal',extraPile:false,reaction:false}};
  }
  if(!fought.length)return normalize(game,source,all,objectives);
  const resumed=enterCombat(game,source,all);
  // Old saves lack activation order. When all recorded attacks belong to one
  // side its opponent is next; otherwise use the active player's priority.
  const factions=new Set(game.pieces.filter(p=>getProfile(p)&&fought.includes(groupId(game.rules,p))).map(p=>p.faction));
  if(factions.size===1)resumed.team=opposite([...factions][0]);
  return normalize(game,resumed,all,objectives);
}
export function fightOptions(game,sequence,objectives=[]){
  const all=forces(game),seq=normalize(game,sequence,all,objectives);
  let units=[],team=seq.team,canPass=false;
  if(seq.active){
    team=all.get(seq.active.unit)?.[0].faction??seq.team;
  }else if(seq.reactions.length){
    units=seq.reactions;team=all.get(units[0])[0].faction;
  }else if(['pile','consolidate'].includes(seq.stage)){
    units=[...all.keys()].filter(k=>moveChoices(game,seq,all,k,objectives));canPass=true;
  }else if(seq.stage!=='done'){
    const pool=inCombat(game,seq,all);
    units=pool.filter(k=>all.get(k)[0].faction===team&&(seq.stage!=='first'||priority(game,k)));
    // Appendix 12.04.01 allows a pass only when ALL of this player's eligible units are >5" away.
    canPass=pool.filter(k=>all.get(k)[0].faction===team).every(k=>enemies(all,k).every(([,u])=>!near(all.get(k),u,5)));
  }
  // 15.12 constrains this player's next selection, including when another
  // friendly unit already has Fights First. A legal 12.04.01 pass selects no unit.
  const forced=units.find(k=>tacticActive(game.rules,'counteroffensive',k));
  if(forced&&(seq.reactions.length||['first','remaining'].includes(seq.stage)))units=[forced];
  const choices=seq.reactions.length||['first','remaining'].includes(seq.stage)?
    Object.fromEntries(units.map(k=>[k,kinds(seq,all,k)])):{};
  const canAttack=!!seq.active&&!seq.active.extraPile&&all.has(seq.active.unit)&&
    contacts(all,seq.active.unit).length>0&&game.rules.units?.[seq.active.unit]?.finishedAttack!==4;
  const canFinish=!!seq.active&&!seq.active.extraPile&&!canAttack&&!seq.counterAfter&&!game.rules.declaration&&!game.rules.hazard;
  const counters=seq.counterAfter&&!game.rules.hazard?counterTargets(game,seq,seq.counterAfter):[];
  return {sequence:seq,stage:seq.stage,team,units,kinds:choices,canPass,canAttack,canFinish,active:seq.active,reactions:seq.reactions,counters};
}
const issue=(code,modelIds,message)=>({code,modelIds,message});
const pos=p=>({x:p.x,z:p.z,elevation:elevation(p),yaw:p.yaw??0});
function startBoard(game,origins){
  return {...game,pieces:game.pieces.map(p=>origins?.[p.id]?{...p,...origins[p.id]}:p)};
}
export function assessFightMove({game,sequence,unit,targets=[],origins={},paths={},objectives=[],phase='finish'}){
  const board=startBoard(game,origins),all=forces(board),members=all.get(unit)||[];
  const options=moveChoices(board,sequence,all,unit,objectives);
  const failed=message=>({ok:false,errors:[issue('fight-target',[],message)],manual:[],poses:{}});
  if(!options||!Array.isArray(targets)||!targets.length||targets.length!==new Set(targets).size||
    targets.some(k=>!options.targets.includes(k))||targets.length>options.maxTargets||
    (options.requiredAll&&targets.length!==options.targets.length))return failed('이 이동의 교전·거점 대상 조건을 확인하세요.');
  const type=options.mode==='pile-in'?'pile-in':'consolidate';
  const args={game:board,pieces:members,type,maxDistance:options.limit,origins,paths,phase,checkEligibility:false};
  const geometry=assessMove(args);
  const errors=[...geometry.errors],manual=[...geometry.manual];
  const poses=Object.fromEntries(Object.entries(geometry.models).map(([id,m])=>[id,m.end]));
  const ends=members.map(p=>({...p,...poses[p.id]}));
  if(!geometry.ok)return {ok:false,errors,manual,poses};
  const foes=enemies(all,unit),objective=options.mode==='objective'?objectives.find(o=>o.id===targets[0]):null;
  for(const [i,p] of members.entries()){
    const end=ends[i],route=paths[p.id]||[];
    const changed=route.some(w=>Object.keys(w).some(k=>k in pos(p)&&Math.abs(w[k]-pos(p)[k])>EPS));
    if(changed && (type==='pile-in'||options.mode==='ongoing')&&foes.some(([,u])=>u.some(t=>touching(p,t))))
      errors.push(issue('base-contact',[p.id],'적과 받침대가 닿은 모델은 움직이거나 회전할 수 없습니다.'));
    if(phase!=='finish')continue;
    if(type==='pile-in'||options.mode==='ongoing'){
      for(const [k,u] of foes)if(u.some(t=>engaged(p,t))&&!u.some(t=>engaged(end,t)))
        errors.push(issue('lost-engagement',[p.id,k],'처음 교전 중이던 적 분대와 계속 교전해야 합니다.'));
    }
    if(!changed)continue;
    if(objective){
      const before=objectiveDistance(p,objective),after=objectiveDistance(end,objective);
      if(after>EPS && after>=before-EPS)errors.push(issue('objective-closer',[p.id],'선택 거점에 들어가거나 더 가까워져야 합니다.'));
      else if(after>EPS && before<=options.limit+EPS){
        if(canReachObjective(p,objective,args,options.limit,foes))errors.push(issue('objective-if-possible',[p.id],'이동 가능한 거점 범위 안에서 끝내야 합니다.'));
        else manual.push(issue('objective-if-possible',[p.id],'지형과 편대를 고려해 이 모델이 거점에 들어갈 수 있었는지 확인하세요.'));
      }
      continue;
    }
    const initial=targets.map(k=>({key:k,range:closest(p,all.get(k))}));
    const minimum=Math.min(...initial.map(t=>t.range));
    const tied=initial.filter(t=>t.range<=minimum+EPS);
    const closer=tied.filter(t=>closest(end,all.get(t.key))<minimum-EPS);
    if(!closer.length){errors.push(issue('closest-target',[p.id],'이동을 시작할 때 가장 가까운 선택 적 분대에 더 가까워져야 합니다.'));continue;}
    if(closer.some(t=>all.get(t.key).some(e=>engaged(end,e))))continue;
    const nearest=closer.flatMap(t=>all.get(t.key));
    // A clear alternative straight path is a witness that engagement is possible.
    // More complex terrain, pivoting and formation routes remain a table judgement.
    let possible=false,needsReview=false;
    for(const enemy of nearest){
      const horizontal=gap(p,enemy),vertical=Math.abs(elevation(p)-elevation(enemy));
      if(Math.max(0,horizontal-2)+Math.max(0,vertical-5)>options.limit+EPS)continue;
      needsReview=true;
      const dx=enemy.x-p.x,dz=enemy.z-p.z,len=Math.hypot(dx,dz);
      const move=Math.min(options.limit,Math.max(0,horizontal-2+.0001)),ratio=len?move/len:0;
      const candidate={...pos(p),x:p.x+dx*ratio,z:p.z+dz*ratio};
      const at={...p,...candidate};
      if(!engaged(at,enemy)||!closer.some(t=>closest(at,all.get(t.key))<minimum-EPS))continue;
      if(foes.some(([,u])=>u.some(t=>engaged(p,t))&&!u.some(t=>engaged(at,t))))continue;
      if(options.mode==='engaging'&&targets.some(k=>!engagedWith(ends.map(q=>q.id===p.id?at:q),all.get(k))))continue;
      const witness=assessMove({...args,paths:{...paths,[p.id]:[candidate]}});
      if(witness.ok&&!witness.manual.length){possible=true;break;}
    }
    if(possible)errors.push(issue('engage-if-possible',[p.id],'교전 거리 안에 도달할 수 있으므로 그 안에서 이동을 마쳐야 합니다.'));
    else if(needsReview)manual.push(issue('engage-if-possible',[p.id],'편대와 지형을 고려해 가장 가까운 선택 적과 교전할 수 있었는지 확인하세요.'));
  }
  if(phase!=='finish')return {ok:!errors.length,errors,manual,poses};
  if(type==='pile-in'&&!foes.some(([,u])=>engagedWith(ends,u)))errors.push(issue('must-engage',[unit],'밀착 후 분대가 적과 교전해야 합니다.'));
  if(options.mode==='engaging'&&targets.some(k=>!engagedWith(ends,all.get(k))))errors.push(issue('all-targets',[unit],'선택한 모든 적 분대와 교전해야 합니다.'));
  if(objective&&!ends.some(p=>objectiveDistance(p,objective)<=EPS))errors.push(issue('within-objective',[unit],'분대가 선택 거점 범위 안에서 끝내야 합니다.'));
  if(objective&&foes.some(([,u])=>engagedWith(ends,u)))errors.push(issue('objective-engaged',[unit],'거점 재정비 후 분대는 비교전 상태여야 합니다.'));
  return {ok:!errors.length,errors,manual,poses};
}
export function selectPatrolFight(game,action,objectives=[],tactic=null){
  if(action?.type!=='select')throw Error('근접 공격할 분대를 선택하세요.');
  const sequence=game.rules.fightSequence??beginFightSequence(game,objectives);
  const next=transitionFight(game,sequence,action,objectives);
  let rules=game.rules;
  if(tactic!==null){
    // Reaction fights can belong to the other player. The unit owns the CP.
    const team=forces(game).get(action.unit)[0].faction;
    rules=payFightSelectionTactic(rules,next,team,tactic);
    if(!rules)throw Error('이 분대를 선택할 때 해당 전술을 사용할 수 없습니다.');
  }
  return {...rules,fightSequence:next};
}
export function transitionFight(game,sequence,action,objectives=[]){
  if(action?.type==='move')game=startBoard(game,action.origins);
  const all=forces(game);
  let seq=normalize(game,sequence,all,objectives);
  const options=fightOptions(game,seq,objectives);
  const invalid=()=>{throw Error('현재 근접전 순서에서 사용할 수 없는 행동입니다.');};
  if(game.rules.step!==4||game.rules.status!=='playing'||!action||seq.counterAfter||game.rules.declaration||game.rules.hazard||
    (game.rules.fightPlan&&action.type!=='move'))return invalid();
  if(action.type==='pass'){
    if(!options.canPass)return invalid();
    if(['pile','consolidate'].includes(seq.stage))seq=passMovementSide(game,seq,all);
    else {
      const other=opposite(seq.team),otherEligible=inCombat(game,seq,all).some(k=>all.get(k)[0].faction===other);
      seq=seq.passes||!otherEligible?enterConsolidation(game,seq):{...seq,passes:1,team:other};
    }
  }else if(action.type==='select'){
    const kind=action.kind||'normal';
    if(!options.kinds[action.unit]?.includes(kind))return invalid();
    const hasBoss=hasFightingWarboss(game.rules,game.pieces,action.unit);
    const style=action.bossStyle??'lethal';
    if(typeof style!=='string'||!Object.hasOwn(bossStyles,style)||!hasBoss&&action.bossStyle!==undefined)return invalid();
    seq={...seq,fought:unique([...seq.fought,action.unit]),eligibleDuringFight:unique([...seq.eligibleDuringFight,action.unit]),
      active:{unit:action.unit,kind,extraPile:kind==='overrun',reaction:seq.reactions.includes(action.unit),
        ...(hasBoss?{bossStyle:style}:{})},passes:0};
  }else if(action.type==='skip-overrun'){
    if(!seq.active?.extraPile)return invalid();
    seq={...seq,active:{...seq.active,extraPile:false}};
  }else if(action.type==='finish'){
    if(!seq.active||seq.active.extraPile)return invalid();
    const key=seq.active.unit;
    if(all.has(key)&&contacts(all,key).length&&game.rules.units?.[key]?.finishedAttack!==4)throw Error('선택 분대의 근접 공격을 먼저 마치세요.');
    seq={...seq,active:null,reactions:seq.reactions.filter(k=>k!==key),team:seq.active.reaction?seq.team:opposite(seq.team)};
  }else if(action.type==='move'){
    const input={game,sequence:seq,unit:action.unit,targets:action.targets,origins:action.origins,paths:action.paths,objectives};
    const assessed=assessFightMove(input);
    if(!assessed.ok){const e=Error(assessed.errors.map(x=>x.message).join('\n'));e.assessment=assessed;throw e;}
    const after={...game,pieces:game.pieces.map(p=>({...p,...assessed.poses[p.id]}))};
    const updated=forces(after);
    if(seq.active?.extraPile)seq={...seq,active:{...seq.active,extraPile:false}};
    else if(seq.stage==='pile')seq={...seq,piled:[...seq.piled,action.unit]};
    else {
      const mode=moveChoices(game,seq,all,action.unit,objectives).mode;
      const reactions=mode==='objective'?[]:contacts(updated,action.unit).filter(k=>!seq.fought.includes(k));
      seq={...seq,consolidated:[...seq.consolidated,action.unit],reactions,eligibleDuringFight:unique([...seq.eligibleDuringFight,...reactions])};
    }
    return normalize(after,seq,updated,objectives);
  }else return invalid();
  return normalize(game,seq,all,objectives);
}
export function validFightSequence(value){
  if(value==null)return true;
  const team=t=>t==='marines'||t==='orks';
  const unit=k=>ids.includes(k);
  const list=a=>Array.isArray(a)&&a.length<=ids.length&&a.every(unit)&&new Set(a).size===a.length;
  const lists=['piled','fought','consolidated','engagedAtFightStart','eligibleDuringFight','reactions'];
  if(typeof value!=='object'||Array.isArray(value)||!phases.includes(value.stage)||!team(value.team)||![0,1].includes(value.passes))return false;
  if(Object.keys(value).some(k=>!['stage','team','passes','active','counterAfter',...lists].includes(k))||!lists.every(k=>list(value[k])))return false;
  const combat=['first','remaining'].includes(value.stage);
  if(Object.hasOwn(value,'counterAfter')&&(!unit(value.counterAfter)||!combat||value.active?.unit!==value.counterAfter||
    value.active.extraPile||value.active.reaction))return false;
  if(value.passes&&(!combat||value.active))return false;
  if(value.stage!=='consolidate'&&value.reactions.length)return false;
  if(value.fought.some(k=>!value.eligibleDuringFight.includes(k))||value.consolidated.some(k=>!value.eligibleDuringFight.includes(k)))return false;
  const a=value.active;
  if(a===null)return true;
  return !!a&&typeof a==='object'&&Object.keys(a).every(k=>['unit','kind','extraPile','reaction','bossStyle'].includes(k))&&
    (!Object.hasOwn(a,'bossStyle')||typeof a.bossStyle==='string'&&Object.hasOwn(bossStyles,a.bossStyle))&&
    (a.reaction?value.stage==='consolidate'&&value.reactions.includes(a.unit):combat)&&
    unit(a.unit)&&['normal','overrun'].includes(a.kind)&&typeof a.extraPile==='boolean'&&typeof a.reaction==='boolean'&&
    (!a.extraPile||a.kind==='overrun')&&value.fought.includes(a.unit);
}
