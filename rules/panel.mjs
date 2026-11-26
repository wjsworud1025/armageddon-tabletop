import {getProfile,unitId} from './profiles.mjs';
import {brokenFormations,removeForCoherency} from './end-turn.mjs';
import {chargeActions,chargeControls} from './charge-controls.mjs';
import {createFightControls} from './fight-controls.mjs';
import {needsLegacyBossStyle} from '../fight-sequence.mjs';
import {reinforcementOptions,expiringReserves,reserveCapacity} from './reinforcements.mjs';
import {attachForDeployment} from './reinforcement-session.mjs';
import {assessRally,rallyOptions} from './rally-placement.mjs';
import {terrifyingChargeTargets,resolveTerrifyingCharge,declineTerrifyingCharge} from './terrifying-charge.mjs';
import {openShootingReaction,shootingReactionOptions} from './shooting-reaction.mjs';
import {useInsaneBravery,useEpicChallenge} from './core-stratagems.mjs';
import {acceptMovementRoll} from './command-reroll.mjs';
import {attackRollNames,inspectAttackRoll,stepAttackRoll} from './attack-rolls.mjs';
import {rollHazardPool,finishHazardPool} from './hazard-reroll.mjs';
import {rerollMove} from '../move-session.mjs';
import {rerollCharge} from '../charge-session.mjs';
import {coherency,travelCost,moveLimit} from '../movement.mjs';
import {newBattle,startBattle,advance,opposite,steps,teams,roll,currentHP,unitMembers,
  groupId,changeUnit,pendingCommandShock,resolveCommandShock,adjustHP,controlObjective,engaged,modelProfile,
  character,hazardCandidates,resolveHazard,attackSkill} from './battle.mjs';
import {draftRestriction,appendSightedDeclaration,lockSightedDeclaration,attackPackets,resolvePacket,chooseSuppression,
  plungingFireAtDeclaration,plungingSightCandidates,confirmPlungingSight,pendingManualCover,confirmDraftCover,precisionCandidates} from './declarations.mjs';
import {canSetPatrolSight,captureSightBoard,patrolSightStatus,setPatrolSight,sightBoardMatches,visibleInRange} from './patrol-sight.mjs';
import {patrolAreaCover} from './patrol-area-cover.mjs';
import {heavyStatus} from './heavy.mjs';
import {patrolDetection} from './patrol-detection.mjs';
import {doctrines,enhancements,tactics,selectOrder,useTactic,inDoctrine,hasWaaagh,effectWeapon} from './patrol.mjs';
import {patrolMissions,recordLosses,objectiveSnapshot,missionAward} from './missions.mjs';
import {officialPreparing,remainingPatrolUnits,patrolPlacementError} from './official-deployment.mjs';
import {patrolSetupView} from './patrol-setup.mjs';
import {patrolFormationPanel} from './patrol-formations-ui.mjs';
import {patrolTerrainLevels} from './patrol-terrain-placement.mjs';
import {overwatchUnits,beginOverwatch,declineOverwatch,overwatchTargetEligible} from './overwatch.mjs';

const sourcePatrol='https://www.warhammer-community.com/en-gb/articles/2akzkx92/combat-patrol-is-now-live-in-your-app/';
const sourceCore='https://assets.warhammer-community.com/eng_01-06_warhammer40k_new40k_core_rules-was6fbu1ix-hfewhmxyiy.pdf';
const prompts=[
  '반절 이하인 분대와 전장 충격 상태인 분대를 검사하세요. 양쪽에 지휘 포인트가 1씩 지급됐습니다.',
  '분대를 선택해 이동 방식을 선언하고 모델을 옮기세요. 이동할 때 편대와 교전 거리를 확인하세요.',
  '한 분대의 사격 무기와 표적을 모두 지정하세요. 사선을 확인하고 선언을 확정한 뒤 공격을 판정하세요.',
  '돌격을 선언하고 2D6을 굴리세요. 굴림 거리 안의 적을 정하고 돌격 경로를 확인하세요.',
  '양쪽의 밀착 이동을 마친 뒤 선제 공격 분대부터 교대로 싸우세요. 마지막에 재정비하세요.',
  '임무의 턴 종료 조건을 확인하고 승점을 기록한 뒤 턴을 넘기세요.'
];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const btn=(action,label,disabled=false)=>'<button type="button" data-act="'+action+'"'+(disabled?' disabled':'')+'>'+esc(label)+'</button>';
const opt=(value,label,selected)=>'<option value="'+esc(value)+'"'+(value===selected?' selected':'')+'>'+esc(label)+'</option>';
const row=html=>'<div class="br-row">'+html+'</div>';
const textField=(id,label,value,max=80)=>'<label>'+label+'<input data-field="'+id+'" maxlength="'+max+'" value="'+esc(value)+'"></label>';
const select=(id,label,options)=>'<label>'+label+'<select data-field="'+id+'">'+options+'</select></label>';
const number=(id,label,min,max,value)=>'<label>'+label+'<input type="number" data-field="'+id+'" min="'+min+'" max="'+max+'" step="1" value="'+value+'"></label>';
const diceText=dice=>dice.join(' · ');
const findKey=(state,p)=>state.units[groupId(state,p)]||{};
const unitLabel=(p)=>p.kind==='boy' ? '보이즈 '+(Math.floor(p.variant/10)+1)+'분대' : p.name;
const pieceLabel=p=>p.name+' · '+p.id;
const chunk=(title,body)=>'<section class="br-card"><h3>'+title+'</h3>'+body+'</section>';
const sightLabels={unknown:'미확인',visible:'보임',blocked:'가림'};
export function detectionLabel(result){
  const distance=Number.isFinite(result.distance)?'표적 모델까지 '+result.distance.toFixed(2)+'″ · ':'';
  const range='탐지거리 '+result.range+'″';
  if(result.status==='hidden')return distance+range+' 밖 · 표적은 지형 구역에 있고 분대가 이번 턴과 직전 턴에 사격하지 않아 은폐 중입니다.';
  if(result.status==='detected')return distance+range+' 이내 · 사수 시점에서 실제 시야를 확인하세요.';
  if(result.status==='manual'){
    if(result.reason==='gone-to-ground')return distance+'밀집 지형 기물이 이 사수의 시야에서 표적 일부를 가리면 탐지거리가 12″로 줄어듭니다. 이 경우 가림으로 기록하세요.';
    if(result.reason==='terrain')return distance+'지형 구역 경계와 기물 종류를 확인하세요. 경량·밀집 기물이 있는 구역에서는 은폐와 탐지거리를 확인해 시야를 기록하세요.';
    return distance+range+' · 이 분대의 사격 기록이 부족합니다. 이번 턴과 직전 턴에 사격했는지 확인해 시야를 기록하세요.';
  }
  if(result.history==='fired'&&result.areas.length)return '이 분대가 이번 턴 또는 직전 턴에 사격해 은폐가 해제됐습니다.';
  return '';
}
const snapWindow=state=>state.overwatch?.stage==='offer'||state.overwatch?.stage==='shoot';
function shootingSkillLabel(weapon,skill,plunging,cover,snap=false){
  if(!weapon.range)return '';
  if(weapon.torrent)return '자동 명중';
  if(snap)return '수정 전 6만 명중'+(cover?' · 표적 엄폐':'');
  return 'BS '+skill+'+'+(plunging?' · 고지 사격':'')+(cover?' · 표적 엄폐':'');
}
const heavyReasons={
  eligible:'이번 턴에 배치된 모델이 없고 전원이 3″ 이내로 이동한 미교전 분대입니다.',
  phase:'자신의 사격 페이즈에서만 적용됩니다.',
  engaged:'분대가 적과 교전 중입니다.',
  setup:'이번 턴에 전장에 배치된 모델이 있습니다.',
  distance:'이번 턴에 3″를 넘게 이동한 분대원이 있습니다.',
  unknown:'이동 기록이 부족합니다. 분대 전원이 조건을 충족했는지 확인하고, 충족했다면 다른 명중 보정과 합쳐 직접 입력하세요.'
};
function heavyNote(result){
  if(result.status==='none')return '';
  const label=result.status==='active'?'Heavy · 명중 굴림 +1 자동 적용':result.status==='unknown'?'Heavy · 수동 확인':'Heavy · 미적용';
  return '<p class="br-sub" data-heavy-status="'+esc(result.status)+'" data-heavy-reason="'+esc(result.reason)+'">'+
    label+' · '+esc(heavyReasons[result.reason])+'</p>';
}
function recordedHeavy(weapon,r,packet,snap){
  if(!weapon.heavy)return '';
  if(snap)return '<p class="br-sub" data-heavy-applied="false">Heavy · 경계 사격에서는 미적용</p>';
  const label=r.heavy===true?'Heavy · 명중 굴림 +1':r.heavy===false?'Heavy · 자동 보정 없음':'Heavy · 적용 기록 없음, 이 공격에 기록된 명중 보정 사용';
  const total=packet.effectiveHitMod;
  return '<p class="br-sub" data-heavy-applied="'+(r.heavy===undefined?'legacy':r.heavy)+'">'+label+
    ' · 최종 명중 굴림 보정 '+(total>0?'+':'')+total+'</p>';
}

export function mountRules(container,api) {
  const root=document.createElement('div');
  root.className='battle-rules';
  container.replaceChildren(root);
  if (!document.querySelector('style[data-battle-rules]')) {
    const style=document.createElement('style');
    style.dataset.battleRules='';
    style.textContent='.battle-rules{display:grid;gap:12px;font-size:13px}.battle-rules *{box-sizing:border-box}.battle-rules h2,.battle-rules h3,.battle-rules p{margin:0}.battle-rules h3{font-size:14px}.battle-rules p{line-height:1.6}.battle-rules .br-card{border-top:1px solid #4c4437;padding-top:12px;display:grid;gap:9px}.battle-rules .br-row{display:flex;flex-wrap:wrap;gap:6px;align-items:end}.battle-rules label{display:grid;gap:5px;font-size:12px;color:#d1c8b8;min-width:0}.battle-rules button,.battle-rules input,.battle-rules select{font:inherit}.battle-rules select,.battle-rules input{border:1px solid #554d40;background:#252522;color:#f4f0df;padding:6px;border-radius:3px;max-width:100%;min-width:0}.battle-rules input[type=number]{width:65px}.battle-rules label:has(input[type=checkbox]){display:flex;align-items:center}.battle-rules .br-phase{color:#e7b678;font-size:17px}.battle-rules .br-sub{font-size:12px;color:#b6b2a8}.battle-rules .br-latest{border-left:2px solid #c29e62;padding-left:9px;overflow-wrap:anywhere}.battle-rules details>summary{cursor:pointer}.battle-rules details[open]>summary{margin-bottom:8px}.battle-rules a{color:#e8c78b}.battle-rules .br-stats{display:flex;flex-wrap:wrap;gap:8px;font-variant-numeric:tabular-nums}.battle-rules .br-score{display:grid;grid-template-columns:1fr auto;gap:5px;align-items:center}.battle-rules .br-card button:disabled{opacity:.45}.battle-rules .br-ref{padding:8px 0;line-height:1.5}';
    document.head.append(style);
  }
  const defaultChoices={first:'roll',rounds:'5',fighter:'',weapon:'0',target:'',
    hitMod:'0',woundMod:'0',extra:'0',lethal:false,rollCount:'1',objective:'',marineOC:'0',orkOC:'0',secured:'',attach:''};
  let choices={...defaultChoices};
  let coverObservation=null;
  let movementSelection=null;
  let selectedId='', feedback='', opened=new Set(),writing=false;
  const field=id=>root.querySelector('[data-field="'+id+'"]');
  const read=()=> {
    const saved=api.getRulesState();
    const initial=newBattle();
    if (!saved) return initial;
    if (saved.version!==1) return {...initial,hp:{...saved.hp}};
    const state={...initial,...saved,patrol:{...initial.patrol,...saved.patrol}};
    for (const key of ['hp','cp','vp','objectives','attachments','units','reserves']) {
      state[key]={...initial[key],...(saved[key] && typeof saved[key]==='object' ? saved[key] : {})};
    }
    return state;
  };
  const contents=()=>api.getPieces().filter(p=>!!getProfile(p));
  const living=(state)=>contents().filter(p=>currentHP(state,p)>0);
  const getPiece=id=>api.getPieces().find(p=>p.id===id);
  const fights=createFightControls({getGame:api.getTable,getObjectives:api.fightObjectives,commit,
    startMove:choice=>api.beginFightPath(choice),selectUnit:key=>{
      const member=contents().find(p=>!p.removed&&groupId(read(),p)===key);
      if(member)api.selectPiece(member.id);
    },refresh});
  let fightView=null;
  function commit(state,message,changes={}) {
    writing=true;
    try {
      const previous=api.getRulesState();
      if((previous?.movePlan?.commandRerollOpen&&state.movePlan?.commandRerollOpen)||
        (previous?.chargePlan?.commandRerollOpen&&state.chargePlan?.commandRerollOpen))state=acceptMovementRoll(state);
      if (state.status==='playing') state=recordLosses(state,contents().map(p=>Object.hasOwn(changes,p.id)?{...p,removed:changes[p.id]}:p));
      state.last=message;
      if (api.commitRules) api.commitRules(state,changes,message);
      else {
        api.setRulesState(state);
        for (const [id,removed] of Object.entries(changes)) api.setRemoved(id,removed);
        api.log(message);
      }
    } finally {writing=false;}
    feedback='';
    refresh();
  }
  function detail(id,title,body) {
    return '<details data-detail="'+id+'"'+(opened.has(id)?' open':'')+'><summary>'+title+'</summary>'+body+'</details>';
  }
  function attackContext(state,actor) {
    const options=getProfile(actor).weapons.map((w,i)=>({w:effectWeapon(state,actor,w,groupId(state,actor)),i})).filter(({w})=>state.step===4 ? w.range===0 : w.range>0);
    const selected=options.find(({i})=>i===Number(choices.weapon)) || options[0];
    if (selected) choices.weapon=String(selected.i);
    const targetUnit=snapWindow(state)?state.declaration?.rows[0]?.target:null;
    const candidates=living(state).filter(p=>p.faction!==actor.faction&&(!targetUnit||groupId(state,p)===targetUnit));
    if (!candidates.some(p=>p.id===choices.target)) {
      const nearest=candidates.sort((a,b)=>api.getDistance(actor.id,a.id)-api.getDistance(actor.id,b.id))[0];
      choices.target=nearest?.id||'';
    }
    const target=getPiece(choices.target);
    if(coverObservation&&(coverObservation.game!==api.getTable()||!target||
      coverObservation.target!==groupId(state,target)||coverObservation.unit!==groupId(state,actor)||
      coverObservation.round!==state.round||coverObservation.active!==state.active||coverObservation.step!==state.step||
      !sightBoardMatches(state,api.getPieces(),coverObservation.board)))coverObservation=null;
    const members=target ? unitMembers(state,candidates,target) : [];
    const dist=members.length ? Math.min(...members.map(p=>api.getDistance(actor.id,p.id))) : Infinity;
    return {options,selected,candidates,target,members,dist};
  }
  function attackRestriction(state,actor,weapon,targets,dist,visible) {
    if(state.step===4&&(state.fightPlan||fightView?.attackUnit!==groupId(state,actor)))return '근접전 순서에서 전투할 분대를 먼저 선택하세요';
    if (!currentHP(state,actor)) return '제거된 모델';
    const order=findKey(state,actor);
    if(!targets.length)return '선택할 표적이 없습니다';
    const idx=getProfile(actor).weapons.findIndex(w=>w.name===weapon.name);
    const snap=snapWindow(state);
    const draft=state.overwatch?.stage==='offer'?'':draftRestriction(state,contents(),actor,idx,groupId(state,targets[0]));
    if(draft)return draft;
    if (!snap&&order.finishedAttack===state.step) return '이번 페이즈의 분대 공격을 마쳤습니다';
    const inContact=(a,b)=>engaged(a,b,api.getDistance(a.id,b.id));
    if (!weapon.range) return targets.some(t=>inContact(actor,t))?'':'교전 거리 밖';
    if (dist>weapon.range+1e-7) return '사거리 밖';
    if(snap&&!overwatchTargetEligible(state,api.getPieces(),actor,targets[0],weapon))return '교전하지 않은 24″ 이내 적 분대를 선택하세요';
    const pieces=api.getPieces(),layout=api.getTable().layout;
    if (!(visible??visibleInRange(state,pieces,actor.id,targets.map(t=>t.id),weapon.range,api.getDistance,layout)).length){
      if(targets.every(t=>patrolDetection(state,pieces,actor.id,t.id,layout,api.getDistance).status==='hidden'))
        return '표적 분대 전원이 이 사수의 탐지거리 밖에서 은폐 중입니다';
      if(targets.some(t=>patrolSightStatus(state,pieces,actor.id,t.id)==='visible'&&
        patrolDetection(state,pieces,actor.id,t.id,layout,api.getDistance).status==='hidden'))
        return '보임으로 기록한 모델이 은폐 중입니다. 다른 분대원의 시야를 확인하세요';
      return '이 사수에게 보이는 표적 모델을 기록하세요';
    }
    if(snap)return '';
    if (order.movement==='fallback' && !inDoctrine(state,actor,'tactical')) return '후퇴한 분대';
    if (order.movement==='advance' && !weapon.assault && !inDoctrine(state,actor,'devastator') && !hasWaaagh(state,actor)) return '전력 이동 후 사용 불가';
    const current=living(state),own=unitMembers(state,current,actor);
    const contact=own.some(a=>targets.some(b=>inContact(a,b)));
    const tied=contact || own.some(a=>current.some(b=>b.faction!==actor.faction && inContact(a,b)));
    if (tied && order.movement==='advance') return '교전 중 전력 이동 사격 불가';
    if (tied && actor.kind!=='landSpeeder' && (!weapon.pistol || !contact)) return '교전 중에는 해당 적에게 근접 사격만 가능';
    const targetTied=contact || targets.some(b=>current.some(a=>a.faction===actor.faction && inContact(a,b)));
    if (targetTied && weapon.blast) return '교전 중인 표적에 폭발 무기 사용 불가';
    if (targetTied && !contact && !targets.some(t=>t.kind==='landSpeeder')) return '다른 분대와 교전 중인 표적';
    return '';
  }
  function shooterOptions(state,actor,weapon,targets,areaCover){
    const signature=JSON.stringify(weapon);
    const friends=unitMembers(state,living(state),actor);
    const targetIds=targets.map(t=>t.id),pieces=api.getPieces();
    const ignorePenalties=friends.some(p=>p.kind==='librarian');
    return [actor,...friends.filter(p=>p.id!==actor.id)].filter(p=>getProfile(p).weapons
      .some(w=>JSON.stringify(effectWeapon(state,p,w,groupId(state,p)))===signature)).map(p=>{
      const distance=Math.min(...targets.map(t=>api.getDistance(p.id,t.id)));
      const visible=weapon.range?visibleInRange(state,pieces,p.id,targetIds,weapon.range,api.getDistance,api.getTable().layout):[];
      const plunging=!snapWindow(state)&&plungingFireAtDeclaration(state,pieces,p,weapon,targets,visible.length>0);
      const manualCover=!!coverObservation?.shooters.has(p.id);
      const cover=!!weapon.range&&(areaCover.automatic||manualCover);
      const skill=snapWindow(state)?(weapon.torrent?0:6):attackSkill(weapon,{cover,plunging,ignorePenalties});
      return {p,distance,visible,skill,plunging,cover,manualCover,heavy:heavyStatus(state,pieces,p,weapon),
        problem:attackRestriction(state,p,weapon,targets,distance,visible)};
    });
  }
  function renderShooterSight(state,shooters,target,weapon,areaCover){
    const pieces=api.getPieces();
    const rows=shooters.map(({p,distance,visible,skill,plunging,cover,heavy,problem},i)=>{
      const attrs=' data-shooter="'+esc(p.id)+'" data-target="'+esc(target.id)+'"';
      const status=patrolSightStatus(state,pieces,p.id,target.id);
      const detection=patrolDetection(state,pieces,p.id,target.id,api.getTable().layout,api.getDistance);
      const explanation=detectionLabel(detection);
      const enabled=canSetPatrolSight(state,pieces,p.id,target.id);
      const choices=Object.entries(sightLabels).map(([value,label])=>
        '<button type="button" data-act="shot-sight"'+attrs+' data-status="'+value+'" aria-pressed="'+
        (status===value)+'"'+(enabled?'':' disabled')+'>'+label+'</button>').join('');
      const view=api.inspectSight?'<button type="button" data-act="inspect-sight"'+attrs+'>사수 시점</button>':'';
      const witness=visible.length&&!visible.includes(target.id)?' · '+getPiece(visible[0]).name+' 보임':'';
      return '<div class="br-sight-pair" data-sight-row="'+esc(p.id)+'"><strong>'+esc(p.name)+'</strong>'+view+
        '<p class="br-sub">분대까지 '+distance.toFixed(1)+'″ · <span data-ballistic-skill="'+(weapon.torrent?'':skill)+'">'+
        shootingSkillLabel(weapon,skill,plunging,cover,snapWindow(state))+'</span> · '+esc((problem||'선언 가능')+witness)+'</p>'+heavyNote(heavy)+
        '<p class="br-sub" data-detection="'+detection.status+'" data-detection-target="'+esc(target.id)+'"'+(detection.reason?' data-detection-reason="'+esc(detection.reason)+'"':'')+(explanation?'':' hidden')+'>'+esc(explanation)+'</p>'+
        '<div class="br-row" role="group" aria-label="'+esc(p.name+' → '+target.name+' 시야')+'">'+choices+'</div>'+
        '<label><input type="checkbox" data-field="'+(i?'other-cover':'cover')+'" data-cover-shooter="'+esc(p.id)+'"'+
        (cover?' checked':'')+(areaCover.automatic?' disabled':'')+'>'+
        (areaCover.automatic?'지형 구역 엄폐 적용':'이 사수에게 나머지 표적 모두 지형에 가림')+'</label></div>';
    }).join('');
    return '<section class="br-card br-sight"><h3>'+esc(target.name)+'의 시야</h3>'+
      '<p class="br-sub">사수마다 이 모델이 보이는지 기록하세요. 분대원 한 명이 보이고, 분대가 사거리 안에 있으면 사격할 수 있습니다.</p>'+rows+'</section>';
  }
  function coverStatus(areaCover){
    const models=areaCover.models;
    if(!models.length)return '<p id="area-cover-status" data-automatic="false" class="br-sub">패트롤 매트가 없는 전장입니다. 각 사수의 시점에서 표적의 엄폐를 확인하세요.</p>';
    const covered=models.filter(m=>m.eligible).length;
    const summary=areaCover.automatic?'표적 전원 지형 구역 엄폐':('지형 구역 엄폐 '+covered+'/'+models.length+'명');
    const report=models.map(m=>esc(pieceLabel(getPiece(m.id)))+' · '+
      esc(m.areas.map(a=>a.name).join(', ')||'구역 밖')+(m.eligible?' · 엄폐':' · 시야로 확인')).join('<br>');
    return '<div id="area-cover-status" data-automatic="'+areaCover.automatic+'"><strong>'+summary+'</strong>'+
      (areaCover.automatic?'':'<p class="br-sub">나머지 모델이 모두 중간 지형에 일부 또는 전부 가리면 해당 사수의 엄폐를 선택하세요.</p>')+
      detail('area-cover-models','모델별 엄폐 근거','<p>'+report+'</p>')+'</div>';
  }
  function renderAttack(state,actor) {
    if(state.declaration?.locked)return '';
    const {options,selected,candidates,target,members,dist}=attackContext(state,actor);
    if (!target || !selected) return '<p>전장에 공격할 적이 없습니다.</p>';
    const weapon=selected.w;
    const range=weapon.range ? weapon.range+'″' : '근접';
    const areaCover=weapon.range?patrolAreaCover(api.getTable(),members):{automatic:false};
    const shooters=shooterOptions(state,actor,weapon,members,areaCover);
    const blocked=shooters[0].problem;
    const matching=weapon.range||!blocked?shooters.filter(s=>!s.problem):[];
    const allocated=(state.declaration?.rows||[]).filter(r=>r.actor===actor.id).reduce((n,r)=>n+r.assigned,0);
    const availableAttacks=weapon.range?0:Math.max(1,weapon.attacks+Number(choices.extra)-allocated);
    const preview=state.overwatch?.stage==='offer';
    const controls=select('weapon','선택한 모델의 무기',options.map(({w,i})=>opt(String(i),w.name,choices.weapon)).join(''))+
      select('target','공격할 분대의 모델',candidates.map(p=>opt(p.id,pieceLabel(p),choices.target)).join(''))+
      '<p class="br-sub">분대까지 최단 거리 '+dist.toFixed(1)+'″ · 사거리 '+range+' · A '+weapon.attacks+' · S '+weapon.strength+
      ' · AP '+weapon.ap+' · D '+weapon.damage+'</p>'+
      (weapon.range?coverStatus(areaCover)+renderShooterSight(state,shooters,target,weapon,areaCover):'');
    if(preview)return chunk('사수와 표적 확인',controls);
    const modifiers=snapWindow(state)?'':detail('mods','무기 및 분대 보정',row(number('hitMod','그 밖의 명중 보정',-1,1,choices.hitMod)+number('woundMod','상처 보정',-1,1,choices.woundMod)+number('extra','추가 공격',0,30,choices.extra))+
      (shooters[0].heavy.status==='active'?'<p class="br-sub">Heavy +1은 이미 적용됩니다. 이 칸에는 다른 효과의 명중 보정만 입력하세요.</p>':'')+
      (fightView?.sequence.active?.bossStyle?'':'<label><input type="checkbox" data-field="lethal"'+(choices.lethal?' checked':'')+'>치명적 명중 (Lethal Hits)</label>'));
    return chunk('무기 공격',controls+modifiers+
      (!weapon.range?number('allocation','이 표적에 배정할 근접 공격',1,availableAttacks,choices.allocation||availableAttacks):'')+
      row(btn('attack',blocked || (weapon.range?'이 사수의 무기 선언':'이 근접 무기 선언'),Boolean(blocked))+
        (weapon.range&&shooters.length>1?btn('volley','사격 가능한 '+matching.length+'명 일제사격 선언',!matching.length):
          matching.length>1?btn('volley','동일 무기 '+matching.length+'개 선언'):'')));
  }
  function renderDeclaration(state,all) {
    const plan=state.declaration;
    if(!plan)return '';
    const actor=all.find(p=>groupId(state,p)===plan.unit);
    if(!actor)return '';
    const header=esc(unitLabel(actor))+' · '+(plan.locked?'공격 판정':'분대 공격 선언');
    if(!plan.locked){
      const stale=new Set(pendingManualCover(state,api.getPieces()));
      let cannotLock=stale.size>0;
      const list=plan.rows.map((r,i)=>{
        const shooter=getPiece(r.actor),weapon=getProfile(shooter).weapons[r.weapon];
        let problem='';
        if(weapon.range){
          const targets=living(state).filter(t=>groupId(state,t)===r.target);
          const distance=Math.min(...targets.map(t=>api.getDistance(shooter.id,t.id)));
          problem=attackRestriction({...state,declaration:null},shooter,effectWeapon(state,shooter,weapon,plan.unit),targets,distance);
          if(problem)cannotLock=true;
        }
        return '<div>'+esc(pieceLabel(shooter))+' · '+esc(weapon.name)+' → '+esc(unitLabel(getPiece(r.preferred)))+
          (r.assigned?' × '+r.assigned:'')+' '+btn('drop-'+i,'삭제')+
          (problem?'<p class="br-sub">'+esc(problem)+'</p>':'')+
          (stale.has(i)?'<p>현재 배치에서 이 사수의 엄폐를 다시 확인하세요.</p>'+
            row(btn('cover-yes-'+i,'지형 가림 확인')+btn('cover-no-'+i,'수동 엄폐 없음')):'')+'</div>';
      }).join('');
      return chunk(header,list+'<p>같은 분대에서 다른 모델·무기를 더 지정할 수 있습니다. 확정하면 미지정 사격 무기는 이번에 발사하지 않습니다.</p>'+
        row(btn('lock','분대 전체 선언 확정',cannotLock)+btn('cancel-plan','선언 취소')));
    }
    if(plan.attackRoll){
      const event=inspectAttackRoll(state,api.getPieces());
      if(!event)return chunk(header,'진행 중인 공격 기록을 확인하세요.');
      const who=esc(teams[event.team])+' · '+esc(unitLabel(all.find(p=>groupId(state,p)===event.unit)));
      const names=ids=>ids.map(id=>pieceLabel(getPiece(id))).join(', ');
      let body='';
      if(event.raw){
        const options=event.raw.map((die,i)=>opt(String(i),(i+1)+'번 D'+event.sizes[i]+' · '+die+
          (event.models?' · '+pieceLabel(getPiece(event.models[i])):''),'0')).join('');
        body='<p>'+esc(attackRollNames[event.kind])+' 굴림 ['+diceText(event.raw)+']</p>'+
          (event.model?'<p>피해를 받을 모델 '+esc(names([event.model]))+' · 남은 상처 '+event.remaining+
            (event.bonus?' · 피해 보정 +'+event.bonus:'')+'</p>':'')+
          select('attack-die','재굴림할 주사위',options)+row(btn('packet-keep','원래 결과 사용')+btn('packet-reroll','지휘 재굴림 · 1 CP'));
      }else{
        const precision=event.kind==='precision';
        const title=precision?'공격 모델에서 보이는 캐릭터':event.kind==='order'?'먼저 방어할 모델 그룹':'피해를 받을 모델';
        const attackers=[...new Set(event.packet.indices.map(i=>plan.rows[i].actor))].filter(id=>currentHP(state,getPiece(id)));
        body=(precision?'<p>정밀 · 시야를 확인할 공격 모델 '+esc(names(attackers))+'</p>':'')+
          (event.wounds?'<p>명중 '+event.hits+' · 상처 '+event.wounds+'</p>':'')+
          (event.kind==='model'?'<p>'+(event.save===null?'치명적 상처':'방어 굴림 '+event.save)+'</p>':'')+
          select('attack-model',title,event.choices.map((id,i)=>opt(id??'',id?pieceLabel(getPiece(id)):'정밀 배정 생략',event.choices[0]??'')).join(''))+
          btn('packet-select','배정 확정');
      }
      const r=plan.rows[event.packet.index],w=getProfile(getPiece(r.actor)).weapons[r.weapon];
      const skillLabel=shootingSkillLabel(w,event.packet.skill,event.packet.plunging,event.packet.cover,plan.mode==='overwatch');
      const snapHits=plan.mode==='overwatch'&&plan.attackRoll.records.find(e=>e.kind==='hit'&&e.closed)?.raw;
      const hitHistory=snapHits?'<p class="br-sub" data-overwatch-hit>경계 사격 명중 ['+diceText(snapHits)+'] → '+
        snapHits.filter(d=>d===6).length+'명중</p>':'';
      return chunk(header,'<p>'+who+(skillLabel?' · '+skillLabel:'')+'</p>'+recordedHeavy(w,r,event.packet,plan.mode==='overwatch')+hitHistory+body+(state.last?'<p class="br-latest">'+esc(state.last)+'</p>':''));
    }
    const groups=attackPackets(state,api.getPieces());
    const rolled=plan.precisionRoll;
    const rechecks=plan.rows.map((r,i)=>{
      const targets=plungingSightCandidates(state,api.getPieces(),i,api.getTable().layout);
      if(!targets.length)return '';
      const fieldName='plunge-target-'+i;
      return '<p>'+esc(getPiece(r.actor).name)+'에게 보이던 적이 제거됐습니다. 같은 분대의 다른 모델이 보이면 고지 사격을 다시 적용할 수 있습니다.</p>'+
        select(fieldName,'시야를 확인할 생존 모델',targets.map(p=>opt(p.id,pieceLabel(p),choices[fieldName])).join(''))+
        row(btn('plunge-view-'+i,'사수 시점')+btn('plunge-confirm-'+i,'보임 · 고지 사격 적용'));
    }).join('');
    return chunk(header,rechecks+'<p>동일 판정은 함께 굴립니다. 한 표적을 골랐다면 그 표적의 남은 공격부터 해결하세요.</p>'+
      groups.map(p=>{
        const r=plan.rows[p.index],defenders=living(state).filter(t=>groupId(state,t)===p.target);
        const w=getProfile(getPiece(r.actor)).weapons[r.weapon];
        const skillLabel=shootingSkillLabel(w,p.skill,p.plunging,p.cover,plan.mode==='overwatch');
        const label=unitLabel(getPiece(r.preferred))+' · '+[...p.names].join(' / ')+' × '+p.indices.length+(skillLabel?' · '+skillLabel:'');
        const pref=defenders.some(t=>t.id===choices['allocate-'+p.index])?choices['allocate-'+p.index]:r.preferred;
        let precision='';
        if(rolled){
          const attackers=[...new Set(p.indices.map(i=>plan.rows[i].actor))].map(getPiece).filter(m=>currentHP(state,m)>0);
          precision='<p>명중 '+rolled.hits+' · 상처 '+rolled.wounds+' · 방어 굴림 전 정밀 공격 배정</p>'+
            '<p>공격 측이 다음 모델 중 하나의 시야를 확인하세요. '+esc(attackers.map(pieceLabel).join(', '))+'</p>'+
            select('precision-target','그 모델에서 보이는 적 캐릭터',opt('','정밀 배정 생략','')+
              precisionCandidates(state,api.getPieces(),p).map(t=>opt(t.id,pieceLabel(t)+' · 시야 확인','')).join(''));
        }
        return precision+recordedHeavy(w,r,p,plan.mode==='overwatch')+(defenders.length?select('allocate-'+p.index,'방어 측 일반 배정 우선순위',defenders.map(t=>opt(t.id,pieceLabel(t),pref)).join('')):'')+
          (!rolled&&defenders.length?btn('staged-'+p.index,label+' · 단계별 판정'):'')+
          btn('resolve-'+p.index,rolled?'배정 확정 · 방어 및 피해 판정':label+(defenders.length?' · 양측 지휘 재굴림 생략':' · 전멸한 표적 공격 종료'));
      }).join('')+(!rolled&&!plan.rows.some(r=>r.done)?detail('target-exception','표적 적격성 변경',
        '<p>상대 반응 이동 등으로 기존 표적을 선택할 수 없게 되면 양측 확인 후 선언을 수정하세요.</p>'+btn('reopen','적격성 변경 · 선언 다시 열기')):''));
  }
  function selectedTactic(state,key,actor){
    const unit=groupId(state,actor);
    if(key==='surge'||key==='shockCharge')return null;
    if(key==='med'){
      const plan=state.declaration;
      if(!plan?.locked||plan.rows.some(r=>r.done)||!plan.rows.some(r=>r.target===unit))return null;
    }
    return useTactic(state,key,unit,actor.faction,state.units[unit]?.shocked);
  }
  function renderActor(state,actor,pending) {
    const p=modelProfile(state,actor),members=unitMembers(state,contents(),actor);
    const unit=findKey(state,actor);
    const alive=members.filter(m=>currentHP(state,m)>0);
    const mine=state.active===actor.faction;
    const reserve=state.reserves[groupId(state,actor)];
    let shockButtons='';
    if(state.status==='playing'&&state.step===0&&mine){
      const required=pending.some(p=>p.unit===groupId(state,actor));
      shockButtons=btn('shock',unit.shockChecked?'검사 완료':'전장 충격 2D6',!required);
      if(required&&useInsaneBravery(state,contents(),groupId(state,actor)))
        shockButtons+=btn('insane-bravery','불굴의 용기 · 1 CP · 전장 충격 자동 통과');
    }
    const engagedEnemy=state.status==='playing' && state.step===1 && living(state).some(b=>
      b.faction!==actor.faction && alive.some(a=>engaged(a,b,api.getDistance(a.id,b.id))));
    const stats='M '+p.move+'″ · T '+p.toughness+' · Sv '+p.save+'+ · W '+currentHP(state,actor)+'/'+p.wounds+' · Ld '+p.leadership+'+ · OC '+(unit.shocked?'–':p.oc);
    let action='';
    let attachment='';
    let rallyButton='';
    if(state.status==='playing'&&state.step===0&&mine&&actor.kind==='warboss'&&state.patrol.enhanced.warcry&&!state.patrol.warcryUsed){
      const options=rallyOptions(api.getTable(),actor.id);
      if(options.fallen.length)rallyButton=btn('warcry','전투 함성 · 복귀 수 굴림',!options.ok);
    }
    if (['librarian','warboss','weirdboy'].includes(actor.kind) && state.status==='setup') {
      const eligible=actor.faction==='marines'?['intercessor']:['boy-0','boy-1'];
      const current=state.attachments[actor.id]||'';
      attachment=select('attach','합류할 분대',opt('','단독',current)+eligible.map(id=>opt(id,{intercessor:'인터세서 분대','boy-0':'보이즈 1분대','boy-1':'보이즈 2분대'}[id],current)).join(''));
    }
    if (reserve) {
      const setup=state.status==='setup', options=setup?null:reinforcementOptions(api.getTable(),groupId(state,actor));
      return chunk(esc(actor.name)+' · 전략 예비대',attachment+'<p>예비대에 '+reserve.length+'명 대기 중</p>'+shockButtons+rallyButton+
        btn('ingress',setup?'배치로 복귀':'가장자리에서 증원 배치',!setup&&!options.ok)+
        (options?.modes.includes('deep-strike')?btn('ingress-deep','딥 스트라이크로 배치',!options.ok):'')+
        (!setup&&!options.ok?'<p>'+esc(options.errors[0]?.message)+'</p>':''));
    }
    if (state.status==='setup') action=btn('reserve','분대를 전략 예비대로');
    if (state.status==='playing' && actor.kind==='gretchin' && !alive.length && !state.patrol.grotReturned)
      action+=btn('grot-reserve','그레친 증식 · 전원을 예비대로 복귀');
    if (state.status==='playing' && currentHP(state,actor)>0 && (mine || state.step===4)) {
      if (state.step===0) action=shockButtons;
      if (state.step===1){
        const busy=!!(state.movePlan||unit.movement||unit.reinforcing);
        action=row(btn('normal','일반 이동',busy||engagedEnemy)+btn('advance','전력 이동 D6',busy||engagedEnemy)+
          btn('fallback','질서 있는 후퇴',busy||!engagedEnemy||unit.shocked)+btn('desperate','필사적 탈출',busy||!engagedEnemy)+btn('remain','정지',busy));
        if(!unit.reinforcing&&unit.movement&&unit.movement!=='remain'&&!unit.movementTracked&&!state.movePlan)
          action+='<p>이전 저장 파일의 이동입니다. 이번 분대의 남은 거리를 직접 재고 기물을 배치하세요.</p>';
        if(!busy&&members.some(m=>!m.removed&&['vanguard','landSpeeder'].includes(m.kind)))
          action+='<label><input data-field="takeToSkies" type="checkbox"> 비행 이동 (최대 거리 −2″)</label>';
        if(actor.faction==='orks'&&state.movePlan?.unit===groupId(state,actor)&&unit.movement==='advance')
          action+=btn('reroll','전력 이동 재굴림',!!(unit.rerolled||state.movePlan.rerollClosed||Object.keys(state.movePlan.paths).length));
      }
    }
    const flags=[unit.shocked?'전장 충격':'',unit.order||'',unit.charge?'돌격 굴림 '+unit.charge+'″':'',
      unit.epicChallengeModel===actor.id&&state.step===4?'영웅적 도전 · 근접 정밀':'',
      state.patrol.suppressed===groupId(state,actor)?'제압됨':''].filter(Boolean);
    let attack='';
    if (state.status==='playing' && currentHP(state,actor)>0 && ((state.step===2 && mine) || state.step===4)) attack=renderAttack(state,actor);
    const available=Object.entries(tactics).filter(([key])=>selectedTactic(state,key,actor));
    if(state.step===4)for(const model of alive.filter(character)){
      if(useEpicChallenge(state,contents(),model.id))
        action+=btn('epic-'+model.id,'영웅적 도전 · 1 CP · '+model.name+'의 근접 무기에 정밀');
    }
    const tacticsMenu=available.length ? detail('tactics','분대 전술 · 각 1 CP',available.map(([key,t])=>'<p>'+esc(t.rule)+'</p>'+btn('tactic-'+key,t.name)).join('')):'';
    action+=rallyButton;
    if(state.step===3&&currentHP(state,actor)>0)action+=chargeActions(api.getTable(),actor);
    if (state.status==='playing' && mine && state.step===2 && actor.kind==='wartrakk' && unit.finishedAttack===2 && !unit.suppressionTargets && unit.hitTargets?.length && !unit.suppressedEnemy) {
      const hit=unit.hitTargets.map(id=>living(state).find(p=>groupId(state,p)===id)).filter(Boolean);
      if (hit.length) action+=select('suppressTarget','명중한 적 분대',hit.map(p=>opt(groupId(state,p),unitLabel(p),choices.suppressTarget)).join(''))+btn('suppress','사격 완료 · 적 분대 제압');
    }
    return chunk(esc(actor.name),'<p class="br-stats">'+esc(stats)+'</p><p class="br-sub">분대 생존 '+alive.length+'/'+members.length+
      (pending.some(p=>p.unit===groupId(state,actor))?' · 지휘 시 검사 필요':'')+(flags.length?' · '+esc(flags.join(' · ')):'')+'</p>'+
      attachment+action+tacticsMenu+
      detail('model','모델 상태 수동 조정',row(btn('hurt','상처 −1',currentHP(state,actor)<=0)+btn('heal','상처 +1',currentHP(state,actor)>=p.wounds)+btn('status',unit.shocked?'충격 해제':'전장 충격 표시'))))+attack;
  }
  function renderReaction(state,all){
    const plan=state.reactionPlan;
    const name=key=>{
      const p=all.find(p=>p.kind===key)||all.find(p=>groupId(state,p)===key);
      return p?unitLabel(p):key;
    };
    if(plan){
      const limit=Math.max(0,plan.die+1-(plan.takeToSkies?2:0));
      return chunk(esc(name(plan.unit))+' · '+(plan.mode==='surge'?'서지 이동':'신속 대응'),
        '<p>D6 결과 '+plan.die+' · 모델당 최대 '+limit+'″</p>'+
        (plan.target?'<p>접근할 적 분대 · '+esc(name(plan.target))+'</p>':'')+
        '<p>전장에서 분대원을 끌거나 경로 이동으로 경유점을 지정하세요.</p>'+
        row(btn('reaction-finish','반응 이동 완료')+btn('reaction-cancel','원위치 · 이동 포기')));
    }
    const opts=shootingReactionOptions(api.getTable(),state.shootingReaction);
    const selected=opts.find(o=>o.unit===choices['reaction-unit'])??opts[0];
    let controls='';
    if(selected){
      controls=select('reaction-unit','반응할 분대',opts.map(o=>opt(o.unit,name(o.unit),selected.unit)).join(''));
      if(selected.mode==='surge')controls+=select('reaction-target','가장 가까운 적 분대',
        selected.targets.map(id=>opt(id,name(id),choices['reaction-target'])).join(''));
      if(selected.canFly)controls+='<label><input type="checkbox" data-field="reaction-fly"'+(choices['reaction-fly']?' checked':'')+'>비행 이동 (최대 거리 −2″)</label>';
      controls+=btn('reaction-start',selected.mode==='surge'?'한복판으로! · 1 CP · D6+1″':'신속 대응 · D6+1″');
    }
    return chunk('사격 직후 · '+esc(teams[opposite(state.active)])+' 반응',
      '<p>'+esc(name(state.shootingReaction.shooter))+' 분대의 사격이 끝났습니다.</p>'+controls+btn('reaction-decline','반응 없이 계속'));
  }
  function renderObjectives(state) {
    const terrain=api.getPieces().filter(p=>p.faction==='terrain' && !p.removed);
    if (!terrain.some(p=>p.id===choices.objective)) choices.objective=terrain[0]?.id||'';
    const record=state.objectives[choices.objective];
    const scores=Object.keys(teams).map(t=>'<div class="br-score"><b>'+teams[t]+' · '+state.vp[t]+' VP / '+state.cp[t]+' CP</b>'+
      row(btn('vp-'+t+'-up','+VP')+btn('vp-'+t+'-down','−VP',state.vp[t]<=0)+btn('cp-'+t+'-up','+CP')+btn('cp-'+t+'-down','−CP',state.cp[t]<=0))+'</div>').join('');
    const geometry=api.getObjectiveAreas?.() || [];
    const mapControls=geometry.length?'<p>'+Object.values(state.objectives).filter(o=>o.name).map(o=>
      esc(o.name)+' · '+esc(teams[o.owner]||'중립')+' ('+o.marineOC+'/'+o.orkOC+')').join('<br>')+'</p>':'';
    return chunk('승점과 지휘 포인트',scores+mapControls+detail('objective','지형 목표 수동 판정',
      select('objective','목표 구역의 대표 지형',terrain.map(p=>opt(p.id,pieceLabel(p),choices.objective)).join(''))+
      '<p>구역에 걸친 각 모델의 OC를 합산해 입력하세요. 충격 상태인 분대의 기여도는 0입니다.</p>'+
      row(number('marineOC','마린 OC',0,300,choices.marineOC)+number('orkOC','오크 OC',0,300,choices.orkOC))+
      select('secured','현재 확보 효과',opt('','없음',choices.secured)+Object.entries(teams).map(([k,v])=>opt(k,v,choices.secured)).join(''))+
      btn('objective','점유 기록',!choices.objective)+(record?'<p>최근 판정 · '+esc(teams[record.owner]||'중립')+'</p>':'')));
  }
  function restoreMovementSelection(state){
    const eligible=p=>getProfile(p)&&p.faction===state.active&&currentHP(state,p)>0;
    const board=api.getTable();
    if(state.overwatch){
      if(movementSelection?.board!==board||movementSelection.round!==state.round||movementSelection.team!==state.active){
        const prior=[api.getSelection(),getPiece(choices.fighter)].find(eligible);
        movementSelection={board,round:state.round,team:state.active,id:prior?.id};
      }
      return;
    }
    if(!movementSelection)return;
    const prior=movementSelection;
    movementSelection=null;
    if(state.status!=='playing'||state.active!==prior.team||state.round!==prior.round||![1,2].includes(state.step))return;
    const saved=prior.board===board&&getPiece(prior.id);
    const actor=[saved,api.getSelection()].find(eligible)??contents().find(eligible);
    choices.fighter=actor?.id||'';
    if((api.getSelection()?.id||'')===choices.fighter)return;
    writing=true;
    try{api.selectPiece(actor?.id??null)}finally{writing=false}
  }
  function refresh() {
    if (writing) return;
    const control=document.activeElement;
    const restore=control?.matches('[data-act],[data-field]')&&root.contains(control);
    renderPanel();
    if(!restore||control.isConnected||document.activeElement!==document.body||!container.checkVisibility())return;
    const selector=Object.entries(control.dataset).map(([key,value])=>
      '[data-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+'="'+CSS.escape(value)+'"]').join('');
    const replacement=root.querySelector(selector);
    if(replacement&&!replacement.disabled)replacement.focus({preventScroll:true});
    if(document.activeElement===document.body){
      container.focus({preventScroll:true});
      if(container.parentElement.firstElementChild===container)container.parentElement.scrollTop=0;
    }
  }
  function renderRally(plan){
    const game=api.getTable(),fallen=rallyOptions(game,plan.leader).fallen;
    const chosen=Object.keys(plan.selected),limit=plan.die+2;
    const editing=api.getSelection()?.id,pose=plan.selected[editing];
    const verdict=assessRally(game);
    const buttons=fallen.map(id=>{
      const on=chosen.includes(id),p=getPiece(id);
      const toggle='<button type="button" data-act="rally-toggle" data-model="'+esc(id)+'" aria-pressed="'+on+'"'+
        (!on&&chosen.length>=limit?' disabled':'')+'>'+esc(p.name)+' · '+esc(id)+'</button>';
      const focus=on&&!plan.reserve?'<button type="button" data-act="rally-focus" data-model="'+esc(id)+'" aria-pressed="'+(id===editing)+'">'+(id===editing?'위치 편집 중':'위치 편집')+'</button>':'';
      return row(toggle+focus);
    }).join('');
    const coords=pose?'<fieldset class="rally-coordinates"><legend>'+esc(editing)+' 위치</legend>'+[
      ['x','X (인치)',pose.x],['z','Z (인치)',pose.z],['elevation','높이 (인치)',pose.elevation],['yaw','방향 (도)',pose.yaw*180/Math.PI],
    ].map(([key,label,value])=>'<label>'+label+'<input type="number" step="any" data-field="rally-'+key+'" value="'+Number(value||0).toFixed(2)+'"></label>').join('')+
      btn('rally-pose','입력 위치 미리보기')+'</fieldset>':'';
    return '<section class="br-card" data-rally-placement><h3>전투 함성 · '+(plan.reserve?'예비대 복귀':'복귀 배치')+'</h3>'+
      '<p role="status">D3 '+plan.die+' + 2 · 최대 '+limit+'명 · 선택 '+chosen.length+'명 · 더 고를 수 있는 보이 '+Math.min(limit-chosen.length,fallen.length-chosen.length)+'명</p>'+
      '<p>'+(plan.reserve?'예비대로 복귀할 보이를 선택하세요.':'복귀할 보이를 선택한 뒤 전장을 클릭하거나 모델을 끌어 배치하세요. 파란 테두리는 배치 미리보기입니다.')+'</p>'+
      (plan.reserve?'':btn('rally-anchors','기존 분대원 위치 보기'))+
      buttons+coords+'<div data-rally-errors aria-live="polite">'+verdict.errors.map(e=>'<p>'+esc(e.modelIds.join(', '))+' '+esc(e.message)+'</p>').join('')+'</div>'+
      verdict.manual.map(e=>'<p>'+esc(e.modelIds.join(', '))+' '+esc(e.message)+'</p>').join('')+
      (feedback?'<p role="status">'+esc(feedback)+'</p>':'')+
      btn('rally-finish',chosen.length?chosen.length+'명 복귀 확정':'복귀 없이 전투 함성 종료',!verdict.ok)+'</section>';
  }
  function renderPanel() {
    const state=read();
    const unitName=key=>{
      const members=contents().filter(p=>groupId(state,p)===key);
      const bodyguard=members.find(p=>unitId(p)===key);
      return bodyguard?unitLabel(bodyguard):members.length?unitLabel(members[0]):key;
    };
    if(state.terrifyingCharge){
      const targets=terrifyingChargeTargets(api.getTable()),unit=state.terrifyingCharge.unit;
      const selected=targets.includes(choices['terrifying-target'])?choices['terrifying-target']:targets.length===1?targets[0]:'';
      const options=(targets.length===1?'':opt('','표적 분대 선택',selected))+targets.map(k=>opt(k,unitName(k),selected)).join('');
      root.innerHTML='<section class="br-card" data-terrifying-charge><h3>공포의 돌격</h3>'+
        '<p>'+esc(unitName(unit))+'의 돌격 이동이 끝났습니다. 교전 중인 적 한 분대가 2D6 − 1로 전장 충격을 검사합니다. 합계가 리더십 이상이면 통과합니다.</p><p>마린 보유 CP '+state.cp.marines+'</p>'+
        (targets.length?select('terrifying-target','전장 충격을 검사할 적 분대',options):'<p>검사할 수 있는 표적이 없습니다.</p>')+
        row(btn('terrifying-use','1 CP 사용 · 2D6 굴리기',!selected)+btn('terrifying-pass','공포의 돌격 건너뛰기'))+
        (feedback?'<p role="status">'+esc(feedback)+'</p>':'')+'</section>';
      return;
    }
    if(state.rallyPlan){root.innerHTML=renderRally(state.rallyPlan);return;}
    restoreMovementSelection(state);
    if(officialPreparing(state)){
      root.innerHTML=renderOfficialSetup(state)+(feedback?'<p aria-live="polite" class="br-latest">'+esc(feedback)+'</p>':'');
      return;
    }
    const selected=api.getSelection();
    if ((selected?.id||'')!==selectedId) {
      selectedId=selected?.id||'';
      if (selected && getProfile(selected)){
        choices.fighter=selected.id;
        if(state.overwatch?.stage==='offer'&&selected.faction===state.overwatch.team)
          choices['overwatch-unit']=groupId(state,selected);
      }
    }
    let actor=getPiece(choices.fighter);
    if (!getProfile(actor)) actor=null;
    const all=contents();
    const dispersed=brokenFormations(state,all);
    const pending=pendingCommandShock(state,all);
    fightView=state.step===4&&state.status==='playing'?fights.view():null;
    if(fightView&&needsLegacyBossStyle(state,all,fightView.sequence.active)){
      root.innerHTML=fights.render();return;
    }
    const reservedIds=new Set(Object.values(state.reserves).flat());
    const selector=select('fighter','현재 모델',opt('','미니어처 선택',actor?.id||'')+all.map(p=>opt(p.id,pieceLabel(p)+(reservedIds.has(p.id)?' (예비대)':p.removed?' (제거됨)':''),actor?.id||'')).join(''));
    let top='';
    if (state.status==='setup') {
      top=chunk('정식 컴뱃 패트롤','<p>44 × 30인치 전장에서 배치도와 공수를 굴리고, 양측 편성을 공개한 뒤 5라운드를 진행합니다.</p>'+btn('official-new','정식 패트롤 준비 시작'))+
        chunk('맞춤 대전','<p>선공과 라운드 수를 직접 정합니다.</p>'+
        row(select('first','선공',opt('marines',teams.marines,choices.first)+opt('orks',teams.orks,choices.first)+opt('roll','주사위 대결',choices.first))+
          number('rounds','라운드 수',1,20,choices.rounds))+textField('mission','자유 임무 이름 (공란은 패트롤)',state.mission)+btn('start','대전 시작'));
      const d=state.deployment;
      const deployTeam=d?.next||'marines';
      const remaining=d?all.filter(p=>!p.removed && !d.placed.includes(groupId(state,p))):all;
      let setup=d?'<p>수비 · '+teams[d.defender]+' / '+(remaining.length?'다음 배치 · '+teams[deployTeam]:'양쪽 배치 완료')+'</p>':'<p>양측 주사위 대결 승자가 공격 또는 수비를 정합니다.</p>';
      if (!d) setup+=row(btn('defender-marines','마린 수비')+btn('defender-orks','오크 수비'));
      if (d && remaining.length) {
        const outside=actor && api.getLayout?.() && api.isInDeploymentZone && unitMembers(state,all,actor).some(p=>!p.removed && !api.isInDeploymentZone(p.id));
        const coherent=!actor||coherency(unitMembers(state,all,actor)).ok;
        setup+=btn('deploy',outside?'분대를 배치 구역 안에 놓으세요':!coherent?'분대 간격을 조정하세요':'선택 분대 배치 완료',!actor || actor.faction!==deployTeam || d.placed.includes(groupId(state,actor)) || outside || !coherent);
      }
      top+=detail('deployment','교대 배치',setup);
    } else if (state.status==='finished') {
      const winner=controlObjective(state.vp.marines,state.vp.orks);
      top=chunk('대전 종료','<b class="br-phase">'+(winner?teams[winner]+' 승리':'무승부')+'</b><p>'+state.vp.marines+' 대 '+state.vp.orks+'</p>');
    } else {
      const endingMove=state.step===1&&!state.overwatch;
      const reaction=state.overwatch;
      const nextLabel=endingMove?'이동 단계 종료 · 경계 사격 확인':state.step<5?'다음 · '+steps[state.step+1]:(state.active!==state.first && state.round===state.rounds?'대전 마치기':'다음 플레이어');
      top=chunk(esc(state.mission || (state.rounds===5 ? patrolMissions[state.active] : '로컬 대전'))+' · '+state.round+'/'+state.rounds+' 라운드',
        '<b class="br-phase">'+teams[state.active]+' · '+steps[state.step]+(reaction?' 종료':'')+'</b><p>'+
        (reaction?(reaction.stage==='done'?'경계 사격 판정이 끝났습니다.':teams[reaction.team]+' 플레이어의 경계 사격 기회입니다.'):prompts[state.step])+'</p>'+
        (pending.length?'<div data-command-shock-list>전장 충격 검사가 남은 분대'+row(pending.map(({model})=>
          btn('select-shock-'+model.id,unitLabel(model))).join(''))+'</div>':'')+
        (snapWindow(state)?'':btn('next',nextLabel,!!(pending.length||state.hazard||state.declaration||state.movePlan||state.reinforcePlan||state.chargePlan||state.shootingReaction||state.reactionPlan||state.units.wartrakk?.suppressionTargets?.length||dispersed.length||fightView&&!fightView.done))));
    }
    if(state.reinforcePlan){
      const deep=state.reinforcePlan.mode==='deep-strike';
      const arriving=all.filter(p=>Object.hasOwn(state.reinforcePlan.origins,p.id));
      const pickMember=select('fighter','배치할 모델',arriving.map(p=>opt(p.id,pieceLabel(p),actor?.id)).join(''));
      root.innerHTML=top+chunk(deep?'딥 스트라이크 배치':'가장자리 증원 배치',
        '<p>전장에서 분대원을 끌어 배치하세요. 모든 모델은 적 베이스와 수평으로 8″를 초과해 떨어져 있어야 합니다.</p>'+
        (deep?'':'<p>각 베이스 전체를 전장 가장자리 6″ 안에 두세요.'+(state.round===2?' 적 배치 구역에 닿지 않게 하세요.':'')+'</p>')+
        pickMember+row(btn('reinforce-finish','증원 배치 완료')+btn('reinforce-cancel','배치 취소 · 예비대 복귀')))+
        (feedback?'<p aria-live="polite">'+esc(feedback)+'</p>':'');
      return;
    }
    if(state.terrifyingResult){
      const {target,dice,leadership}=state.terrifyingResult,total=dice[0]+dice[1]-1;
      top+='<p class="br-latest" data-terrifying-result role="status">'+esc(unitName(target))+' · 공포의 돌격 2D6 ['+
        dice.join(' + ')+'] − 1 = '+total+' · 리더십 '+leadership+'+ · '+(total>=leadership?'통과':'실패 · 전장 충격')+'</p>';
    }
    if(state.step===3)top+=chargeControls(api.getTable());
    if(state.movePlan?.commandRerollOpen||state.chargePlan?.commandRerollOpen){
      const moving=!!state.movePlan,plan=state.movePlan??state.chargePlan;
      const dice=moving?'D6 ['+plan.advanceRoll+']':'2D6 ['+plan.dice.join(' + ')+']';
      top+=chunk('지휘 재굴림 · '+(moving?'전력 이동':'돌격'),
        '<p>'+dice+' · '+(moving?'경로를 지정하기 전에 이 주사위를':'표적을 확정하기 전에 두 주사위를 모두')+' 다시 굴릴 수 있습니다.</p>'+
        row(btn('command-reroll','1 CP · '+(moving?'D6':'2D6')+' 다시 굴리기')+btn('command-keep','현재 굴림 유지')));
    }
    if(fightView){
      if(state.fightPlan){
        const title=state.fightPlan.type==='pile-in'?'밀착 이동':'재정비 이동';
        top+=chunk(title+' 경로 편집','<p>분대원을 끌거나 경유점을 지정한 뒤 이동을 마치세요.</p>'+
          row(btn('combat-path-finish',title+' 완료')+btn('combat-path-cancel','원점으로 · 경로 취소')));
      }else top+=fights.render();
    }
    for(const formation of dispersed){
      top+=chunk(esc(teams[formation[0].faction]+' · '+unitLabel(formation[0]))+' · 응집도 회복',
        '<p>이 분대의 플레이어가 제거할 모델을 하나 고르세요. 제거할 때마다 남은 모델의 간격을 다시 검사합니다.</p>'+
        row(formation.map(p=>btn('coherency-'+p.id,pieceLabel(p)+' 제거')).join('')));
    }
    if(state.movePlan){
      const plan=state.movePlan;
      const mover=all.find(p=>groupId(state,p)===plan.unit);
      let budget='';
      if(actor&&plan.origins[actor.id]&&!actor.removed){
        const path=[plan.origins[actor.id],...(plan.paths[actor.id]||[])];
        const spent=path.slice(1).reduce((sum,end,i)=>sum+travelCost(actor,path[i],end,plan.takeToSkies),0);
        const limit=moveLimit(actor,plan.type,plan.advanceRoll,plan.takeToSkies);
        budget='<p>'+esc(actor.name)+' · 이동 '+spent.toFixed(2)+'″ / '+limit+'″ · 남은 거리 '+Math.max(0,limit-spent).toFixed(2)+'″</p>';
      }
      top+=chunk(esc(mover?unitLabel(mover):state.movePlan.unit)+' · 이동 중',
        budget+'<p>분대원을 드래그하거나 경로를 지정하세요. 이동 완료 시 전체 분대의 응집도와 최종 위치를 검사합니다.</p>'+
        row(btn('move-finish','분대 이동 완료',!!state.hazard)+btn('move-rewind','경로 다시 그리기',!!state.hazard)+btn('move-abandon','불가능한 이동 취소',!!state.hazard)));
    }
    if (state.hazard) {
      const hazard=state.hazard;
      const unit=all.find(p=>groupId(state,p)===hazard.unit);
      const title=(unit?unitLabel(unit):hazard.unit)+(hazard.reason==='escape'?' · 필사적 탈출 모델 ':' · 위험 무기 ')+hazard.count+'개';
      if(hazard.commandDice){
        const firstFailure=Math.max(0,hazard.commandDice.findIndex(n=>n<=2));
        root.innerHTML=chunk(esc(title),' <p>위험 D6 ['+diceText(hazard.commandDice)+'] · 1과 2는 실패입니다.</p>'+
          select('hazard-die','다시 굴릴 주사위',hazard.commandDice.map((n,i)=>
            opt(String(i),(i+1)+'번 · '+n,String(firstFailure))).join(''))+
          row(btn('hazard-command','지휘 재굴림 · 1 CP')+btn('hazard-keep','현재 위험 굴림 확정')));
        return;
      }
      if (!hazard.dice) {
        top+=chunk(esc(title),(hazard.reason==='escape'?'<p>모델을 옮기기 전에 분대 전원의 위험 주사위를 굴리세요.</p>':'<p>이 분대의 다른 무기 공격을 모두 마친 뒤 굴리세요.</p>')+
          btn('hazard-roll',hazard.reason==='escape'?'이동 전 위험 판정':'분대 공격 종료 · 위험 판정'));
      } else {
        const eligible=hazardCandidates(state,all);
        top+=chunk(esc(title),'<p>D6 ['+diceText(hazard.dice)+'] · 배정할 모탈 운드 '+hazard.remaining+'점</p>'+
          (eligible.length?row(eligible.map(p=>btn('hazard-wound-'+p.id,pieceLabel(p)+'에 1점 배정')).join('')):
            btn('hazard-end','분대 전멸 · 판정 종료')));
      }
    }
    if(state.fightSequence?.counterAfter){root.innerHTML=state.hazard?top:fights.render();return;}
    const suppressible=state.units.wartrakk?.suppressionTargets;
    if(suppressible?.length){
      const options=suppressible.map(k=>opt(k,unitLabel(all.find(p=>groupId(state,p)===k)),choices.suppressTarget)).join('');
      root.innerHTML=top+chunk('워트랙 · 제압 사격',select('suppressTarget','명중한 적 분대',options)+btn('suppress-shot','분대 제압'));
      return;
    }
    if(state.shootingReaction||state.reactionPlan){
      if(!state.hazard)top+=renderReaction(state,all);
      root.innerHTML=top+(feedback?'<p aria-live="polite" class="br-latest">'+esc(feedback)+'</p>':'');
      return;
    }
    let army='';
    if (state.status==='setup') {
      army=detail('upgrades','패트롤 업그레이드 선택',Object.entries(enhancements).map(([id,[team,label]])=>
        '<label><input data-field="enhance-'+id+'" type="checkbox"'+(state.patrol.enhanced[id]?' checked':'')+'>'+teams[team]+' · '+label+'</label>').join(''));
    } else if (state.status==='playing') {
      const p=state.patrol;
      const flags=[p.doctrine?doctrines[p.doctrine]:'',p.waaagh?'와아! 활성':''].filter(Boolean).join(' · ');
      let orders='';
      if (state.step===0 && state.active==='marines') orders=row(Object.entries(doctrines).map(([id,name])=>btn('order-'+id,name,!!pending.length || !!p.doctrine || p.usedDoctrines.includes(id))).join(''));
      if (state.step===0 && state.active==='orks') orders=btn('order-waaagh','와아! 선포',!selectOrder(state,'waaagh'));
      if (flags || orders) army=chunk('패트롤 명령',orders+(flags?'<p>'+esc(flags)+'</p>':''));
    }
    if(state.declaration?.precisionRoll||state.declaration?.attackRoll){
      root.innerHTML=renderDeclaration(state,all);
      return;
    }
    if(state.overwatch){
      const {team,stage}=state.overwatch,offer=stage==='offer';
      const recent=(feedback||state.last)?'<p aria-live="polite" class="br-latest">'+esc(feedback||state.last)+'</p>':'';
      if(stage==='done'||state.hazard){root.innerHTML=top+recent;return;}
      const units=offer?overwatchUnits(state,api.getPieces()):[state.overwatch.unit];
      const unit=units.includes(choices['overwatch-unit'])?choices['overwatch-unit']:units[0];
      const live=living(state),members=live.filter(p=>groupId(state,p)===unit);
      if(!members.some(p=>p.id===actor?.id))actor=members[0];
      choices.fighter=actor?.id||'';
      const unitName=key=>unitLabel(all.find(p=>groupId(state,p)===key));
      let body='<p>'+esc(teams[team])+' · 남은 '+state.cp[team]+' CP'+(offer?'':' · 경계 사격 1 CP 지불')+'</p>'+
        '<p>분대 사이 거리가 24″ 이내인 적 한 분대를 선택하세요. 각 사수는 무기 사거리와 은폐 표적의 탐지거리를 따로 확인합니다.</p>'+
        '<p>수정 전 6은 일반 명중이며 토렌트 무기는 자동 명중합니다.</p>';
      if(offer){
        body+=select('overwatch-unit','경계 사격할 분대',units.map(k=>opt(k,unitName(k),unit)).join(''))+
          row(btn('overwatch-begin','1 CP · 경계 사격 선언',!unit)+btn('overwatch-decline','경계 사격 포기 · 사격 단계로'));
      }else if(unit){
        body+='<p>'+esc(unitName(unit))+' · 생존 '+members.length+'명</p>'+
          (!state.declaration?btn('overwatch-decline','사격 없이 마침 · 1 CP 소비'): '');
      }
      if(actor&&!state.declaration?.locked)
        body+=select('fighter','사수',members.map(p=>opt(p.id,pieceLabel(p),actor.id)).join(''));
      root.innerHTML=top+chunk('경계 사격',body)+renderDeclaration(state,all)+(actor?renderAttack(state,actor):'')+recent;
      return;
    }
    root.innerHTML=top+army+renderDeclaration(state,all)+selector+(actor?renderActor(state,actor,pending):'')+
      (state.status!=='setup'?renderObjectives(state):'')+
      chunk('주사위',row(number('rollCount','D6 개수',1,60,choices.rollCount)+btn('dice','굴리기')))+
      ((feedback||state.last)?'<p aria-live="polite" class="br-latest">'+esc(feedback||state.last)+'</p>':'')+
      detail('refs','규칙 출처와 수동 판정','<p class="br-ref">패트롤 명령과 전술은 박스 동봉 참조표, 전용 수치와 임무는 공식 앱 데이터카드 공개 전사본 기준입니다. 5라운드와 A/B/C 배치도를 사용하면 각 진영의 임무를 자동 채점합니다. 시야, 특수 이동과 예외는 두 플레이어가 확인하세요.</p>'+
        '<a target="_blank" rel="noopener" href="'+sourceCore+'">11판 기본 규칙</a> · <a target="_blank" rel="noopener" href="'+sourcePatrol+'">컴뱃 패트롤 공식 앱 안내</a>');
  }
  function rollOff() {
    let a,b;
    do {a=roll();b=roll();} while(a===b);
    return {first:a>b?'marines':'orks',text:' · 선공 굴림 '+a+' 대 '+b};
  }
  function renderOfficialSetup(state){
    const s=state.officialSetup,v=patrolSetupView(s);
    const rollList=pairs=>pairs.map(([m,o])=>'마린 '+m+' · 오크 '+o+(m===o?' (동률)':'')).join('<br>');
    const record=[
      s.layoutDie!=null?'배치도 '+v.map+' · D6 '+s.layoutDie:'',
      s.roleRolls.length?'공수 대결<br>'+rollList(s.roleRolls):'',
      v.defender?'수비 '+teams[v.defender]+' · 공격 '+teams[v.attacker]:'',
      s.firstRolls.length?'선공 대결<br>'+rollList(s.firstRolls):'',
    ].filter(Boolean).join('<br>');
    let body='';
    switch(v.stage){
      case 'layout':body=btn('official-roll-layout','배치도 결정 · D6');break;
      case 'role-roll':body='<p>청색 방패가 수비 구역입니다. 양측이 각자 D6을 굴립니다.</p>'+btn('official-roll-role',s.roleRolls.length?'공수 동률 · 다시 굴리기':'공수 주사위 대결');break;
      case 'role-choice':body='<p>'+teams[v.roleWinner]+' 플레이어가 맡을 역할을 고르세요.</p>'+row(btn('official-attack','공격 선택')+btn('official-defend','수비 선택'));break;
      case 'formations':body=patrolFormationPanel(state,contents());break;
      case 'deployment':{
        const d=state.deployment,all=contents(),rest=remainingPatrolUnits(api.getTable());
        const choices=rest.filter(key=>all.some(p=>groupId(state,p)===key&&p.faction===d.next));
        const buttons=choices.map(key=>{
          const member=all.find(p=>unitId(p)===key)||all.find(p=>groupId(state,p)===key);
          return '<button type="button" data-act="official-select" data-unit="'+esc(key)+'" aria-pressed="'+(key===d.pending)+'">'+esc(unitLabel(member))+'</button>';
        });
        body=detail('revealed','공개한 양측 편성',patrolFormationPanel(state,all))+
          '<p>'+teams[d.next]+' 배치 · 남은 분대 '+rest.length+'개</p>'+row(buttons.join(''));
        if(d.pending){
          const error=patrolPlacementError(api.getTable());
          const p=api.getSelection();
          if(p&&!p.removed&&p.faction!=='terrain'&&groupId(state,p)===d.pending){
            const floors=patrolTerrainLevels(p,api.getPieces().filter(q=>q.faction==='terrain'));
            body+='<p>'+esc(p.name)+' · 높이 '+(p.elevation||0).toFixed(2)+'″</p>'+row(
              btn('official-left','왼쪽 15°')+btn('official-right','오른쪽 15°')+floors.map(h=>
                '<button type="button" data-act="official-height" data-height="'+h+'"'+(Math.abs((p.elevation||0)-h)<.001?' disabled':'')+'>'+esc(h?h.toFixed(2)+'″ 층으로':'지면으로')+'</button>').join(''));
          }
          body+='<p>'+esc(error||'모델을 끌어 배치하세요. 난간과 돌출부에 실제 조형이 걸리지 않는지 확인하세요.')+'</p>'+btn('official-place','이 분대 배치 확정',!!error);
        }
        break;
      }
      case 'first-roll':body='<p>양측의 배치가 끝났습니다. 높은 눈이 나온 진영이 첫 턴을 진행합니다.</p>'+btn('official-roll-first',s.firstRolls.length?'선공 동률 · 다시 굴리기':'선공 주사위 대결');break;
      case 'ready':body=btn('official-start',teams[v.first]+' 선공 · 5라운드 시작');break;
    }
    return chunk('정식 컴뱃 패트롤 준비',(record?'<p class="br-sub">'+record+'</p>':'')+body);
  }
  function click(event) {
    const button=event.target.closest('button'),action=button?.dataset.act;
    if (!action) return;
    const state=read();
    if(state.terrifyingCharge){
      if(!['terrifying-use','terrifying-pass'].includes(action))return;
      try{
        const result=action==='terrifying-pass'?declineTerrifyingCharge(api.getTable()):
          resolveTerrifyingCharge(api.getTable(),field('terrifying-target')?.value);
        delete choices['terrifying-target'];feedback='';
        return commit(result.rules,result.message);
      }catch(error){feedback=error.message;refresh();return}
    }
    if(state.rallyPlan||action==='warcry'){
      if(action!=='warcry'&&!action.startsWith('rally-'))return;
      feedback='';
      try{
        const id=action==='warcry'?choices.fighter:button.dataset.model||api.getSelection()?.id;
        if(action==='rally-focus'){api.selectPiece(id);return;}
        let pose;
        if(action==='rally-pose'){
          pose={};
          for(const k of ['x','z','elevation','yaw']){
            const input=field('rally-'+k),value=input.valueAsNumber;
            if(!Number.isFinite(value))throw Error('위치는 숫자로 입력하세요.');
            if(input.value!==input.defaultValue)pose[k]=k==='yaw'?value*Math.PI/180:value;
          }
          if(!Object.keys(pose).length)return;
        }
        api.rallyCommand(action==='warcry'?'begin':action.slice(6),id,pose);
      }catch(error){feedback=error.message;refresh()}
      return;
    }
    if(state.step===4&&fightView&&needsLegacyBossStyle(state,contents(),fightView.sequence.active)&&!action.startsWith('fight-style-'))return;
    if(action==='official-new'||officialPreparing(state)){
      if(action==='official-new'||action.startsWith('official-')||action.startsWith('form-')){
        feedback='';
        try{api.officialCommand({...event.target.closest('button').dataset})}
        catch(error){feedback=error.message;refresh()}
      }
      return;
    }
    const actor=getPiece(choices.fighter);
    if(action.startsWith('select-shock-')){
      const id=action.slice('select-shock-'.length);
      if(!pendingCommandShock(state,contents()).some(p=>p.model.id===id))return;
      choices.fighter=id;api.selectPiece(id);refresh();return;
    }
    if(action.startsWith('plunge-view-')||action.startsWith('plunge-confirm-')){
      const index=Number(action.split('-').at(-1)),target=field('plunge-target-'+index)?.value;
      const pieces=api.getPieces();
      if(!plungingSightCandidates(state,pieces,index,api.getTable().layout).some(p=>p.id===target))return;
      const shooter=state.declaration.rows[index].actor;
      if(action.startsWith('plunge-view-'))return api.inspectSight?.(shooter,target);
      const next=confirmPlungingSight(state,pieces,index,target,api.getTable().layout);
      if(next)return commit(next,getPiece(shooter).name+' → '+getPiece(target).name+' · 고지 사격 시야 재확인');
      return;
    }
    if(action==='inspect-sight'||action==='shot-sight'){
      if((state.step!==2&&!snapWindow(state))||state.status!=='playing'||!actor||state.declaration?.locked)return;
      const {shooter,target,status}=button.dataset,from=getPiece(shooter),to=getPiece(target);
      if(!from||!to||!canSetPatrolSight(state,api.getPieces(),shooter,target)||
        groupId(state,from)!==groupId(state,actor)||target!==choices.target)return;
      if(action==='inspect-sight'){api.inspectSight?.(shooter,target);return;}
      if(!Object.hasOwn(sightLabels,status)||patrolSightStatus(state,api.getPieces(),shooter,target)===status)return;
      const next=setPatrolSight(state,api.getPieces(),shooter,target,status);
      if(next)return commit(next,from.name+' → '+to.name+' · '+sightLabels[status]);
      feedback='지금은 이 사수의 시야를 기록할 수 없습니다.';refresh();
      return;
    }
    if(state.declaration?.attackRoll&&!action.startsWith('packet-'))return;
    if(state.declaration?.precisionRoll&&action!=='resolve-'+state.declaration.precisionRoll.index)return;
    if(state.fightSequence?.counterAfter&&!(state.hazard?action.startsWith('hazard-'):action.startsWith('fight-counter-')))return;
    if(state.hazard?.commandDice&&!['hazard-command','hazard-keep'].includes(action))return;
    const val=id=>field(id)?.value??choices[id];
    const integer=(id,min,max)=>Math.max(min,Math.min(max,Math.trunc(Number(val(id)))||0));
    if(action==='overwatch-begin'){
      const next=beginOverwatch(state,api.getPieces(),val('overwatch-unit'));
      if(next)return commit(next,teams[next.overwatch.team]+' · 경계 사격 선언 · 1 CP');
      feedback='현재 경계 사격을 선언할 수 있는 분대를 선택하세요.';return refresh();
    }
    if(action==='overwatch-decline'){
      const next=declineOverwatch(state);
      if(next)return commit(advance(next,api.getPieces()),
        (state.overwatch.stage==='offer'?'경계 사격 포기':'경계 사격 종료 · 1 CP 소비')+' · '+teams[state.active]+' 사격 단계');
      return;
    }
    if(action==='command-reroll'||action==='command-keep'){
      if(!state.movePlan?.commandRerollOpen&&!state.chargePlan?.commandRerollOpen)return;
      if(action==='command-keep')return commit(acceptMovementRoll(state),'지휘 재굴림 생략 · 현재 결과 유지');
      const game={...api.getTable(),rules:state};
      try{
        const member=state.movePlan&&living(state).find(p=>Object.hasOwn(state.movePlan.origins,p.id));
        const result=state.movePlan?rerollMove(game,member,undefined,{command:true}):rerollCharge(game);
        return commit(result.rules,result.message);
      }catch(error){feedback=error.message;return refresh()}
    }
    if(state.units.wartrakk?.suppressionTargets?.length){
      if(action==='suppress-shot'){
        const target=val('suppressTarget'),next=chooseSuppression(state,target);
        if(next)return commit(next,'워트랙 제압 사격 · '+unitLabel(contents().find(p=>groupId(state,p)===target)));
      }
      return;
    }
    if((state.shootingReaction||state.reactionPlan)&&!action.startsWith('hazard-')){
      if(state.hazard||!action.startsWith('reaction-'))return;
      const command=action.slice('reaction-'.length);
      try{
        feedback='';
        const choice={unit:field('reaction-unit')?.value,target:field('reaction-target')?.value??null,takeToSkies:!!field('reaction-fly')?.checked};
        api.reactionCommand(command,choice);
        if(command==='start'){
          const member=contents().find(p=>groupId(state,p)===choice.unit&&currentHP(state,p)>0);
          if(member)api.selectPiece(member.id);
        }
      }catch(error){feedback=error.message;refresh()}
      return;
    }
    if(state.reinforcePlan||((action==='ingress'||action==='ingress-deep')&&state.status==='playing')){
      try{
        feedback='';
        if(state.reinforcePlan){
          if(action==='reinforce-finish'||action==='reinforce-cancel')api.reinforceCommand(action.slice(10));
        }else if(actor)api.reinforceCommand('begin',groupId(state,actor),action==='ingress-deep'?'deep-strike':'edge');
      }catch(error){feedback=error.message;refresh()}
      return;
    }
    if (action==='start') {
      let first=choices.first,report='';
      if (first==='roll') { const result=rollOff();first=result.first;report=result.text; }
      const next=startBattle(state,first,integer('rounds',1,20),api.getPieces());
      next.mission=(val('mission')||'').slice(0,80);
      return commit(next,teams[first]+' 선공 · 대전 시작'+report);
    }
    if (action.startsWith('defender-') && state.status==='setup') {
      const defender=action.slice(9);
      if (!(defender in teams)) return;
      return commit({...state,deployment:{defender,next:defender,placed:[]}},teams[defender]+' 수비 · 첫 분대 배치');
    }
    if (action==='deploy' && state.status==='setup' && state.deployment && actor) {
      const d=state.deployment,key=groupId(state,actor);
      if (d.next!==actor.faction || d.placed.includes(key)) return;
      const placed=[...d.placed,key],other=opposite(d.next);
      const left=contents().filter(p=>!p.removed && !placed.includes(groupId(state,p)));
      const next=left.some(p=>p.faction===other)?other:d.next;
      return commit({...state,deployment:{...d,placed,next}},unitLabel(actor)+' 배치 완료');
    }
    if (action==='next') {
      if(pendingCommandShock(state,contents()).length)return;
      if (state.hazard || state.declaration || state.movePlan || state.chargePlan || brokenFormations(state,contents()).length || state.step===4&&!fights.view().done) return;
      let resolved=recordLosses(state,contents());
      const areas=api.getObjectiveAreas?.()||[];
      if (areas.length) resolved.objectives=objectiveSnapshot(resolved,contents(),areas,api.getDistance);
      const score=state.rounds===5 && areas.length && !state.mission ? missionAward(resolved,Object.values(resolved.objectives)) : 0;
      resolved.vp={...resolved.vp,[state.active]:resolved.vp[state.active]+score};
      const expired=expiringReserves(api.getTable());
      if(expired.ids.length){
        const reserves={...resolved.reserves},hp={...resolved.hp};
        for(const key of expired.units)delete reserves[key];
        for(const id of expired.ids)hp[id]=0;
        resolved={...resolved,reserves,hp};
        if(!expired.final)resolved=recordLosses(resolved,contents());
      }
      const next=advance(resolved,api.getPieces());
      if(next.overwatch?.stage==='offer')return commit(next,teams[state.active]+' 이동 단계 종료 · '+teams[next.overwatch.team]+' 경계 사격 선택');
      return commit(next,(expired.ids.length?'미도착 예비대 '+expired.ids.length+'명 제거 · ':'')+(score?teams[state.active]+' 임무 +'+score+' VP · ':'')+(next.status==='finished'?'대전 종료':next.round+' 라운드 · '+teams[next.active]+' · '+steps[next.step]));
    }
    if(action.startsWith('coherency-')){
      const result=removeForCoherency(state,contents(),action.slice(10));
      if(result)return commit(result.rules,result.message,result.removed);
      return;
    }
    if(action.startsWith('charge-')){
      const command=action.slice(7);
      const targets=[...root.querySelectorAll('[data-charge-target]:checked')].map(el=>el.dataset.chargeTarget);
      feedback=api.chargeCommand(command,actor,targets,!!root.querySelector('[data-charge-fly]:checked'));return refresh();
    }
    if(action.startsWith('fight-')||action.startsWith('combat-path-')){
      try{
        if(action.startsWith('fight-'))fights.dispatch(action);
        else api.finishFightPath(action==='combat-path-cancel');
      }catch(e){feedback=e.message;refresh()}
      return;
    }
    if(action.startsWith('cover-yes-')||action.startsWith('cover-no-')){
      const index=Number(action.split('-')[2]),manual=action.startsWith('cover-yes-');
      const next=confirmDraftCover(state,api.getPieces(),index,manual);
      if(next)return commit(next,'현재 배치에서 사수의 수동 엄폐 '+(manual?'확인':'해제'));
      return;
    }
    if (action==='cancel-plan' || action.startsWith('drop-') || action==='reopen') {
      const plan=state.declaration;
      if(!plan)return;
      if(action==='reopen'){
        if(!plan.locked||plan.rows.some(r=>r.done))return;
        const draft={...plan,locked:false};
        delete draft.detectionMap;
        return commit({...state,declaration:draft},'표적 적격성 변경 · 공격 선언 수정');
      }
      if(plan.locked)return;
      const rows=action==='cancel-plan'?[]:plan.rows.filter((_,i)=>String(i)!==action.slice(5));
      return commit({...state,declaration:rows.length?{...plan,rows}:null},'공격 선언 수정');
    }
    if(action==='lock'){
      const plan=state.declaration;
      if(!plan || plan.locked)return;
      const all=contents(),live=living(state);
      const eligible=state.step===4?live.filter(p=>groupId(state,p)===plan.unit &&
        live.some(t=>t.faction!==p.faction&&engaged(p,t,api.getDistance(p.id,t.id)))):[];
      const clear={...state,declaration:null};
      const rows=[];
      for(const r of plan.rows){
        const p=getPiece(r.actor),weapon=effectWeapon(state,p,getProfile(p).weapons[r.weapon],groupId(state,p));
        const targets=live.filter(t=>groupId(state,t)===r.target);
        const distance=Math.min(...targets.map(t=>api.getDistance(p.id,t.id)));
        const problem=attackRestriction(clear,p,weapon,targets,distance);
        if(problem){feedback=p.name+' · '+problem;return refresh();}
        const areas=api.getObjectiveAreas?.()||[];
        const guard=targets.some(t=>t.kind==='intercessor')&&targets.every(t=>areas.some(a=>a.members.includes(t.id)));
        const friends=live.filter(t=>groupId(state,t)===plan.unit),opponents=live.filter(t=>t.faction!==p.faction);
        const touches=(friendly,hostile)=>friendly.some(a=>hostile.some(b=>engaged(a,b,api.getDistance(a.id,b.id))));
        let vehiclePenalty=0;
        if(weapon.range && !(weapon.pistol&&touches(friends,targets))){
          if(p.kind==='landSpeeder'&&touches(friends,opponents))vehiclePenalty++;
          if(targets.some(t=>t.kind==='landSpeeder')&&touches(live.filter(f=>f.faction===p.faction),targets))vehiclePenalty++;
        }
        rows.push({...r,distance,size:targets.length,guard,vehiclePenalty});
      }
      const next=lockSightedDeclaration({...state,declaration:{...plan,rows}},api.getPieces(),eligible,api.getDistance,api.getTable().layout);
      if(!next){feedback=state.step===2||snapWindow(state)?'사수별 시야와 표적 분대까지의 사거리를 다시 확인하세요.':'교전 중인 각 모델의 근접 공격을 모두 배정하세요.';return refresh();}
      return commit(next,'분대 공격 선언 확정 · 무기·표적 배정 '+rows.length+'건');
    }
    if(action.startsWith('resolve-')||action.startsWith('staged-')||action.startsWith('packet-')){
      const index=state.declaration?.attackRoll?.index??Number(action.split('-')[1]);
      const precisionTarget=state.declaration?.precisionRoll?(field('precision-target')?.value||null):undefined;
      const preferred=val('allocate-'+index)||null;
      const choice=action==='packet-select'?{type:'select',choice:field('attack-model').value||null}:
        action==='packet-reroll'?{type:'reroll',index:Number(field('attack-die').value)}:
        action==='packet-keep'?{type:'keep'}:{type:'begin',preferred};
      const resolved=action.startsWith('resolve-')?resolvePacket(state,api.getPieces(),index,preferred,Math.random,precisionTarget):
        stepAttackRoll(state,api.getPieces(),index,choice);
      if(!resolved)return;
      if(resolved.event){
        const e=resolved.event,label=attackRollNames[e.kind];
        const message=label?teams[e.team]+' · '+label+' ['+diceText(e.raw)+']':teams[e.team]+' · 공격 배정 선택';
        return commit(resolved.state,[resolved.note,message].filter(Boolean).join(' · '));
      }
      const {result,packet,actor,target}=resolved;
      if(resolved.precisionRoll)return commit(resolved.state,unitLabel(actor)+' · 정밀 공격 배정 대기 · 상처 '+resolved.precisionRoll.wounds);
      if(resolved.shootingEvent){
        const game={...api.getTable(),rules:resolved.state};
        resolved.state.shootingReaction=openShootingReaction(game,resolved.shootingEvent);
        delete choices['reaction-unit'];delete choices['reaction-target'];delete choices['reaction-fly'];
      }
      const trace=result?' · '+result.hits+'/'+result.count+' 명중 · 상처 '+result.wounds+' · 피해 '+
        result.damage.reduce((sum,h)=>sum+h.lost,0)+' · 명중 ['+diceText(result.hitDice)+'] · 상처 ['+diceText(result.woundDice)+
        '] · 방어 ['+diceText(result.saves)+']':' · 해결할 공격 없음';
      return commit(resolved.state,(resolved.note?resolved.note+' · ':'')+unitLabel(actor)+' → '+unitLabel(target)+' · '+[...packet.names].join(' / ')+trace+
        (resolved.finished?' · 분대 공격 완료':'')+(resolved.finished&&actor.kind==='wartrakk'&&resolved.state.units.wartrakk.suppressedEnemy?
          ' · '+unitLabel(contents().find(p=>groupId(state,p)===resolved.state.patrol.suppressed))+' 제압':'')+
        (resolved.state.hazard?' · 위험 D6 × '+resolved.state.hazard.count:''),resolved.removed);
    }
    if (action.startsWith('hazard-')) {
      if (!state.hazard)return;
      const id=action.startsWith('hazard-wound-')?action.slice('hazard-wound-'.length):null;
      let result,reroll='';
      if(action==='hazard-roll')result=rollHazardPool(state,contents());
      else if(action==='hazard-command'||action==='hazard-keep'){
        const index=action==='hazard-command'?Number(field('hazard-die')?.value):null;
        result=finishHazardPool(state,contents(),index);
        if(result&&index!==null)reroll=' · 지휘 재굴림 (1 CP) · '+(index+1)+'번 '+state.hazard.commandDice[index]+' → '+result.dice[index];
      }else if(state.hazard.dice&&(id||action==='hazard-end'))result=resolveHazard(state,contents(),id);
      if (!result) return;
      if(result.awaitingChoice)return commit(result.state,'위험 굴림 D6 ['+diceText(result.dice)+'] · 재굴림 선택');
      if(!result.state.hazard&&result.state.shootingReaction&&
        !shootingReactionOptions({...api.getTable(),rules:result.state},result.state.shootingReaction).length)
        result.state.shootingReaction=null;
      const member=contents().find(p=>groupId(state,p)===state.hazard.unit);
      const label=member?unitLabel(member):state.hazard.unit;
      const hits=result.dice.filter(n=>n<=2).length;
      const message=!id&&action!=='hazard-end'?reroll+' · 위험 D6 ['+diceText(result.dice)+'] · 실패 '+hits+' · 모탈 운드 '+result.total:
        (id?' · '+getPiece(id).name+'에 위험 피해 배정':' · 위험 판정 종료');
      return commit(result.state,label+message+' · 남은 배정 '+result.remaining+
        (Object.keys(result.removed).length?' · 제거 '+Object.keys(result.removed).length:''),result.removed);
    }
    if (action==='dice') {
      const dice=Array.from({length:integer('rollCount',1,60)},()=>roll());
      return commit(state,'D6 × '+dice.length+' = '+diceText(dice)+' (합 '+dice.reduce((a,b)=>a+b,0)+')');
    }
    if (action.startsWith('order-')) {
      const key=action.slice(6);
      if(key!=='waaagh'&&pendingCommandShock(state,contents()).length)return;
      const next=selectOrder(state,key);
      if (next) return commit(next,teams[state.active]+' · '+(doctrines[key]||'와아! 선포'));
      return;
    }
    if (/^(cp|vp)-/.test(action)) {
      const [key,team,dir]=action.split('-');
      state[key][team]=Math.max(0,state[key][team]+(dir==='up'?1:-1));
      return commit(state,teams[team]+' '+key.toUpperCase()+' '+state[key][team]);
    }
    if (action==='objective') {
      const a=integer('marineOC',0,300),b=integer('orkOC',0,300);
      const owner=controlObjective(a,b,val('secured')||null);
      state.objectives[choices.objective]={owner,marineOC:a,orkOC:b};
      return commit(state,(getPiece(choices.objective)?.name||'목표')+' · '+(teams[owner]||'중립')+' ('+a+' / '+b+')');
    }
    if (['move-finish','move-rewind','move-abandon'].includes(action)){
      if(!state.movePlan||state.hazard)return;
      feedback=api.moveCommand(action.slice(5));return refresh();
    }
    if (!actor || !getProfile(actor)) return;
    const unit=findKey(state,actor);
    const profile=getProfile(actor);
    const members=unitMembers(state,contents(),actor);
    if(action==='shock'){
      const test=resolveCommandShock(state,contents(),groupId(state,actor));
      if(test)return commit(test.state,unitLabel(actor)+' · '+diceText(test.dice)+' / Ld '+test.target+'+ · '+(test.passed?'통과':'전장 충격'));
      return;
    }
    if(action==='insane-bravery'){
      const next=useInsaneBravery(state,contents(),groupId(state,actor));
      if(next)commit(next,unitLabel(actor)+' · 불굴의 용기 (1 CP) · 전장 충격 자동 통과');
      return;
    }
    if (action==='hurt' || action==='heal') {
      const next=adjustHP(state,actor,action==='heal'?1:-1),hp=next.hp[actor.id];
      return commit(next,actor.name+' · 남은 상처 '+hp,{[actor.id]:hp===0});
    }
    if (action==='reserve' || action==='grot-reserve' || action==='ingress') {
      const key=groupId(state,actor);
      const reserves={...state.reserves},hp={...state.hp},changes={};
      let patrol=state.patrol;
      if (action==='ingress') {
        if (!reserves[key]) return;
        for (const id of reserves[key]) changes[id]=false;
        delete reserves[key];
      } else {
        const revive=action==='grot-reserve';
        if (!revive && state.status!=='setup') return;
        if (revive && (state.patrol.grotReturned || actor.kind!=='gretchin' || members.some(p=>currentHP(state,p)>0))) return;
        if (!revive && !reserveCapacity({rules:state,pieces:contents()},actor.faction).remaining) {feedback='예비대는 해당 군대 분대 수의 절반까지입니다.';return refresh();}
        const reserveMembers=members.filter(p=>revive || currentHP(state,p)>0);
        if(!reserveMembers.length)return;
        reserves[key]=reserveMembers.map(p=>p.id);
        for (const p of reserveMembers) {changes[p.id]=true;if(revive)hp[p.id]=getProfile(p).wounds;}
        if (revive) patrol={...patrol,grotReturned:true};
      }
      const next={...state,reserves,hp,patrol};
      return commit(next,unitLabel(actor)+(action==='ingress'?' · 전장에 배치':' · 전략 예비대로 이동'),changes);
    }
    if (!currentHP(state,actor)) {feedback='제거된 모델입니다.';return refresh();}
    if (action==='suppress') {
      const target=val('suppressTarget');
      if (!unit.hitTargets?.includes(target) || unit.suppressedEnemy) return;
      const next=changeUnit(state,actor,{suppressedEnemy:true});
      return commit({...next,patrol:{...next.patrol,suppressed:target}},'워트랙이 '+target+' 분대를 제압했습니다.');
    }
    if (action.startsWith('tactic-')) {
      const key=action.slice(7),next=selectedTactic(state,key,actor);
      if (next) return commit(next,unitLabel(actor)+' · '+tactics[key].name+' (1 CP) · '+tactics[key].rule);
      return;
    }
    if (action==='status') return commit(changeUnit(state,actor,{shocked:!unit.shocked}),unitLabel(actor)+(unit.shocked?' · 충격 해제':' · 전장 충격'));
    if(action.startsWith('epic-')){
      const model=getPiece(action.slice(5));
      if(!model||groupId(state,model)!==groupId(state,actor))return;
      const next=useEpicChallenge(state,contents(),model.id);
      if(next)commit(next,model.name+' · 영웅적 도전 (1 CP) · 이번 근접전 단계에 정밀');
      return;
    }
    if (['normal','advance','fallback','desperate','remain','reroll'].includes(action)) {
      feedback=api.moveCommand(action==='desperate'?'fallback':action,actor,{fallbackMode:action==='desperate'?'desperate':'ordered',takeToSkies:action!=='remain'&&!!field('takeToSkies')?.checked});return refresh();
    }
    if (action==='attack' || action==='volley') {
      const {selected,target,members:targets}=attackContext(state,actor);
      if (!selected||!target) return;
      const areaCover=selected.w.range?patrolAreaCover(api.getTable(),targets):{automatic:false};
      const candidates=shooterOptions(state,actor,selected.w,targets,areaCover);
      if(!selected.w.range&&candidates[0].problem){feedback=candidates[0].problem;return refresh();}
      const shooters=(action==='volley'?candidates:candidates.slice(0,1)).filter(s=>!s.problem);
      if(!shooters.length){feedback=candidates[0].problem;return refresh();}
      const blades=state.patrol.enhanced.blades && targets.some(t=>t.kind==='vanguard') && unit.charged && !selected.w.range;
      const withLibrarian=!!selected.w.range && members.some(p=>p.kind==='librarian' && currentHP(state,p)>0);
      const snap=snapWindow(state);
      const rows=shooters.map(({p,distance,manualCover})=>({actor:p.id,weapon:getProfile(p).weapons.findIndex(w=>w.name===selected.w.name),
        target:groupId(state,target),preferred:target.id,distance,size:targets.length,
        assigned:selected.w.range?0:integer('allocation',1,selected.w.attacks+integer('extra',0,30)),
        hit:snap?0:integer('hitMod',-1,1)-Number(state.patrol.suppressed===groupId(state,actor)),wound:snap?0:integer('woundMod',-1,1)-Number(Boolean(blades)),
        extra:snap?0:integer('extra',0,30),cover:!!(selected.w.range&&manualCover),lethal:!snap&&!!choices.lethal,
        sustained:false,ignore:withLibrarian,guard:false}));
      const next=appendSightedDeclaration(state,api.getPieces(),rows,api.getDistance,api.getTable().layout);
      if(!next){feedback='선언할 수 없는 배정입니다. 모델별 근접 공격 수와 이미 선택한 무기를 확인하세요.';return refresh();}
      return commit(next,unitLabel(actor)+' · '+selected.w.name+' × '+rows.length+' → '+unitLabel(target)+' 선언');
    }
  }
  function change(event) {
    const el=event.target,key=el.dataset.field;
    if (!key) return;
    if(api.getRulesState()?.terrifyingCharge){
      if(key==='terrifying-target'){choices[key]=el.value;refresh()}
      return;
    }
    if(api.getRulesState()?.rallyPlan)return;
    if(key.startsWith('reaction-')){
      choices[key]=el.type==='checkbox'?el.checked:el.value;
      if(key==='reaction-unit'){delete choices['reaction-target'];delete choices['reaction-fly']}
      refresh();return;
    }
    if(key.startsWith('fight-')){fights.change(key,el.value,el.checked);return}
    const state=read();
    if(el.dataset.coverShooter){
      const actor=getPiece(choices.fighter),target=getPiece(choices.target);
      if(el.disabled||!actor||!target||state.declaration?.locked||(state.step!==2&&!snapWindow(state)))return;
      if(!coverObservation)coverObservation={game:api.getTable(),target:groupId(state,target),unit:groupId(state,actor),
        round:state.round,active:state.active,step:state.step,board:captureSightBoard(state,api.getPieces()),shooters:new Set()};
      if(el.checked)coverObservation.shooters.add(el.dataset.coverShooter);
      else coverObservation.shooters.delete(el.dataset.coverShooter);
      return refresh();
    }
    if (key==='mission') {
      state.mission=el.value.slice(0,80);
      return commit(state,'임무 지정 · '+state.mission);
    }
    if (key.startsWith('enhance-') && state.status==='setup') {
      const id=key.slice(8);
      const enhanced={...state.patrol.enhanced};
      for (const [key,[team]] of Object.entries(enhancements)) if (team===enhancements[id][0]) delete enhanced[key];
      enhanced[id]=el.checked;
      state.patrol={...state.patrol,enhanced};
      return commit(state,enhancements[id][1]+(el.checked?' 적용':' 해제'));
    }
    if (key==='attach') {
      if (state.status!=='setup') return;
      const actor=getPiece(choices.fighter);
      if (!actor) return;
      try{
        const result=attachForDeployment({rules:state,pieces:contents()},actor,el.value);
        return commit(result.rules,actor.name+(el.value?' · 분대 합류':' · 단독 분대'),result.removed);
      }catch(error){feedback=error.message;return refresh()}
    }
    choices[key]=el.type==='checkbox'?el.checked:el.value;
    if(key==='overwatch-unit'){
      const p=living(state).find(p=>groupId(state,p)===el.value);
      choices.fighter=p?.id||'';choices.weapon='0';coverObservation=null;
      if(p)api.selectPiece(p.id);
      return refresh();
    }
    if (key==='fighter') {
      if (choices.fighter) api.selectPiece(choices.fighter);
      choices.weapon='0'; choices.extra='0'; choices.hitMod='0'; choices.woundMod='0'; choices.lethal=false;
    }
    if(['fighter','weapon','target'].includes(key))choices.allocation='';
    if (['fighter','target'].includes(key))api.exitSight?.();
    if (['fighter','weapon','target','objective'].includes(key)) refresh();
  }
  function toggle(event) {
    const id=event.target.dataset.detail;
    if (!id || !root.contains(event.target)) return;
    if (event.target.open) opened.add(id); else opened.delete(id);
  }
  root.addEventListener('click',click);
  root.addEventListener('change',change);
  root.addEventListener('keydown',event=>{
    if(event.key==='Enter'&&event.target.dataset.field?.startsWith('rally-')){
      event.preventDefault();root.querySelector('[data-act="rally-pose"]')?.click();
    }
  });
  root.addEventListener('toggle',toggle,true);
  const unsubscribe=api.onChange(refresh);
  refresh();
  return {refresh,destroy(){if(typeof unsubscribe==='function')unsubscribe(); root.remove();}};
}
