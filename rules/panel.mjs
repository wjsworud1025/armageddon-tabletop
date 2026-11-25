import {getProfile} from './profiles.mjs';
import {brokenFormations,removeForCoherency} from './end-turn.mjs';
import {chargeActions,chargeControls} from './charge-controls.mjs';
import {createFightControls} from './fight-controls.mjs';
import {reinforcementOptions,expiringReserves,reserveCapacity} from './reinforcements.mjs';
import {attachForDeployment} from './reinforcement-session.mjs';
import {openShootingReaction,shootingReactionOptions} from './shooting-reaction.mjs';
import {useInsaneBravery,useEpicChallenge} from './core-stratagems.mjs';
import {acceptMovementRoll} from './command-reroll.mjs';
import {rerollMove} from '../move-session.mjs';
import {rerollCharge} from '../charge-session.mjs';
import {coherency,travelCost,moveLimit} from '../movement.mjs';
import {newBattle,startBattle,advance,opposite,steps,teams,roll,currentHP,unitMembers,
  groupId,changeUnit,needsShock,shockTest,adjustHP,controlObjective,engaged,modelProfile,
  character,hazardCandidates,resolveHazard} from './battle.mjs';
import {draftRestriction,appendDeclaration,lockDeclaration,attackPackets,resolvePacket,chooseSuppression} from './declarations.mjs';
import {doctrines,enhancements,tactics,selectOrder,useTactic,inDoctrine,hasWaaagh,effectWeapon} from './patrol.mjs';
import {patrolMissions,recordLosses,objectiveSnapshot,missionAward} from './missions.mjs';

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
  const defaultChoices={first:'roll',rounds:'5',fighter:'',weapon:'0',target:'',cover:false,
    hitMod:'0',woundMod:'0',extra:'0',lethal:false,rollCount:'1',objective:'',marineOC:'0',orkOC:'0',secured:'',attach:''};
  let choices={...defaultChoices};
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
    const candidates=living(state).filter(p=>p.faction!==actor.faction);
    if (!candidates.some(p=>p.id===choices.target)) {
      const nearest=candidates.sort((a,b)=>api.getDistance(actor.id,a.id)-api.getDistance(actor.id,b.id))[0];
      choices.target=nearest?.id||'';
    }
    const target=getPiece(choices.target);
    const members=target ? unitMembers(state,candidates,target) : [];
    const dist=members.length ? Math.min(...members.map(p=>api.getDistance(actor.id,p.id))) : Infinity;
    return {options,selected,candidates,target,members,dist};
  }
  function attackRestriction(state,actor,weapon,targets,dist) {
    if(state.step===4&&(state.fightPlan||fightView?.attackUnit!==groupId(state,actor)))return '근접전 순서에서 전투할 분대를 먼저 선택하세요';
    if (!currentHP(state,actor)) return '제거된 모델';
    const order=findKey(state,actor);
    if(!targets.length)return '선택할 표적이 없습니다';
    const idx=getProfile(actor).weapons.findIndex(w=>w.name===weapon.name);
    const draft=draftRestriction(state,contents(),actor,idx,groupId(state,targets[0]));
    if(draft)return draft;
    if (order.finishedAttack===state.step) return '이번 페이즈의 분대 공격을 마쳤습니다';
    const inContact=(a,b)=>engaged(a,b,api.getDistance(a.id,b.id));
    if (!weapon.range) return targets.some(t=>inContact(actor,t))?'':'교전 거리 밖';
    if (dist>weapon.range) return '사거리 밖';
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
  function matchingShooters(state,actor,weapon,targets,dist) {
    const signature=JSON.stringify(weapon),short=dist<=weapon.range/2;
    return unitMembers(state,living(state),actor).filter(p=>{
      const same=getProfile(p).weapons.map(w=>effectWeapon(state,p,w,groupId(state,p))).find(w=>JSON.stringify(w)===signature);
      if (!same) return false;
      const d=Math.min(...targets.map(t=>api.getDistance(p.id,t.id)));
      if ((weapon.rapid || weapon.melta) && short!==(d<=weapon.range/2)) return false;
      return !attackRestriction(state,p,weapon,targets,d);
    });
  }
  function renderAttack(state,actor) {
    if(state.declaration?.locked)return '';
    const {options,selected,candidates,target,members,dist}=attackContext(state,actor);
    if (!target || !selected) return '<p>전장에 공격할 적이 없습니다.</p>';
    const weapon=selected.w;
    const range=weapon.range ? weapon.range+'″' : '근접';
    const blocked=attackRestriction(state,actor,weapon,members,dist);
    const matching=blocked?[]:matchingShooters(state,actor,weapon,members,dist);
    const allocated=(state.declaration?.rows||[]).filter(r=>r.actor===actor.id).reduce((n,r)=>n+r.assigned,0);
    const availableAttacks=weapon.range?0:Math.max(1,weapon.attacks+Number(choices.extra)-allocated);
    return chunk('무기 공격',select('weapon','선택한 모델의 무기',options.map(({w,i})=>opt(String(i),w.name,choices.weapon)).join(''))+
      select('target','공격할 분대의 모델',candidates.map(p=>opt(p.id,pieceLabel(p),choices.target)).join(''))+
      '<p class="br-sub">거리 '+dist.toFixed(1)+'″ · 사거리 '+range+' · A '+weapon.attacks+' · S '+weapon.strength+
      ' · AP '+weapon.ap+' · D '+weapon.damage+'</p>'+
      (weapon.range ? '<label><input data-field="cover" type="checkbox"'+(choices.cover?' checked':'')+'> 표적 분대에 엄폐 적용</label>' : '')+
      detail('mods','무기 및 분대 보정',row(number('hitMod','명중 보정',-1,1,choices.hitMod)+number('woundMod','상처 보정',-1,1,choices.woundMod)+number('extra','추가 공격',0,30,choices.extra))+
        '<label><input type="checkbox" data-field="lethal"'+(choices.lethal?' checked':'')+'>치명적 명중 (Lethal Hits)</label>')+
      (!weapon.range?number('allocation','이 표적에 배정할 근접 공격',1,availableAttacks,choices.allocation||availableAttacks):'')+
      row(btn('attack',blocked || (weapon.range?'사선 확인 · 이 무기 선언':'이 근접 무기 선언'),Boolean(blocked))+
        (matching.length>1?btn('volley',(weapon.range?'사선 확인 · ':'')+'동일 무기 '+matching.length+'개 선언'):''))+
      '<p class="br-sub">각 사수에서 적 분대가 보이는지 확인하세요. 일부 모델만 보이면 해당 모델의 무기를 개별 지정하세요.</p>');
  }
  function renderDeclaration(state,all) {
    const plan=state.declaration;
    if(!plan)return '';
    const actor=all.find(p=>groupId(state,p)===plan.unit);
    if(!actor)return '';
    const header=esc(unitLabel(actor))+' · '+(plan.locked?'공격 판정':'분대 공격 선언');
    if(!plan.locked){
      const list=plan.rows.map((r,i)=>'<div>'+esc(pieceLabel(getPiece(r.actor)))+' · '+esc(getProfile(getPiece(r.actor)).weapons[r.weapon].name)+
        ' → '+esc(unitLabel(getPiece(r.preferred)))+(r.assigned?' × '+r.assigned:'')+' '+btn('drop-'+i,'삭제')+'</div>').join('');
      return chunk(header,list+'<p>같은 분대에서 다른 모델·무기를 더 지정할 수 있습니다. 확정하면 미지정 사격 무기는 이번에 발사하지 않습니다.</p>'+
        row(btn('lock','분대 전체 선언 확정')+btn('cancel-plan','선언 취소')));
    }
    const groups=attackPackets(state,all);
    const rolled=plan.precisionRoll;
    return chunk(header,'<p>동일 판정은 함께 굴립니다. 한 표적을 골랐다면 그 표적의 남은 공격부터 해결하세요.</p>'+
      groups.map(p=>{
        const r=plan.rows[p.index],defenders=living(state).filter(t=>groupId(state,t)===p.target);
        const label=unitLabel(getPiece(r.preferred))+' · '+[...p.names].join(' / ')+' × '+p.indices.length;
        const pref=defenders.some(t=>t.id===choices['allocate-'+p.index])?choices['allocate-'+p.index]:r.preferred;
        let precision='';
        if(rolled){
          const attackers=[...new Set(p.indices.map(i=>plan.rows[i].actor))].map(getPiece).filter(m=>currentHP(state,m)>0);
          precision='<p>명중 '+rolled.hits+' · 상처 '+rolled.wounds+' · 방어 굴림 전 정밀 공격 배정</p>'+
            '<p>공격 측이 다음 모델 중 하나의 시야를 확인하세요. '+esc(attackers.map(pieceLabel).join(', '))+'</p>'+
            select('precision-target','그 모델에서 보이는 적 캐릭터',opt('','정밀 배정 생략','')+
              defenders.filter(character).map(t=>opt(t.id,pieceLabel(t)+' · 시야 확인','')).join(''));
        }
        return precision+(defenders.length?select('allocate-'+p.index,'방어 측 일반 배정 우선순위',defenders.map(t=>opt(t.id,pieceLabel(t),pref)).join('')):'')+
          btn('resolve-'+p.index,rolled?'배정 확정 · 방어 및 피해 판정':label+(defenders.length?' 판정':' · 전멸한 표적 공격 종료'));
      }).join('')+(!rolled&&!plan.rows.some(r=>r.done)?detail('target-exception','표적 적격성 변경',
        '<p>상대 반응 이동 등으로 기존 표적을 선택할 수 없게 되면 양측 확인 후 선언을 수정하세요.</p>'+btn('reopen','적격성 변경 · 선언 다시 열기')):''));
  }
  function selectedTactic(state,key,actor){
    const unit=groupId(state,actor);
    if(key==='surge')return null;
    if(key==='med'){
      const plan=state.declaration;
      if(!plan?.locked||plan.rows.some(r=>r.done)||!plan.rows.some(r=>r.target===unit))return null;
    }
    return useTactic(state,key,unit,actor.faction,state.units[unit]?.shocked);
  }
  function renderActor(state,actor) {
    const p=modelProfile(state,actor),members=unitMembers(state,contents(),actor);
    const unit=findKey(state,actor);
    const alive=members.filter(m=>currentHP(state,m)>0);
    const mine=state.active===actor.faction;
    const reserve=state.reserves[groupId(state,actor)];
    const engagedEnemy=state.status==='playing' && state.step===1 && living(state).some(b=>
      b.faction!==actor.faction && alive.some(a=>engaged(a,b,api.getDistance(a.id,b.id))));
    const stats='M '+p.move+'″ · T '+p.toughness+' · Sv '+p.save+'+ · W '+currentHP(state,actor)+'/'+p.wounds+' · Ld '+p.leadership+'+ · OC '+(unit.shocked?'–':p.oc);
    let action='';
    let attachment='';
    if (['librarian','warboss','weirdboy'].includes(actor.kind) && state.status==='setup') {
      const eligible=actor.faction==='marines'?['intercessor']:['boy-0','boy-1'];
      const current=state.attachments[actor.id]||'';
      attachment=select('attach','합류할 분대',opt('','단독',current)+eligible.map(id=>opt(id,{intercessor:'인터세서 분대','boy-0':'보이즈 1분대','boy-1':'보이즈 2분대'}[id],current)).join(''));
    }
    if (reserve) {
      const setup=state.status==='setup', options=setup?null:reinforcementOptions(api.getTable(),groupId(state,actor));
      return chunk(esc(actor.name)+' · 전략 예비대',attachment+'<p>예비대에 '+reserve.length+'명 대기 중</p>'+
        btn('ingress',setup?'배치로 복귀':'가장자리에서 증원 배치',!setup&&!options.ok)+
        (options?.modes.includes('deep-strike')?btn('ingress-deep','딥 스트라이크로 배치',!options.ok):'')+
        (!setup&&!options.ok?'<p>'+esc(options.errors[0]?.message)+'</p>':''));
    }
    if (state.status==='setup') action=btn('reserve','분대를 전략 예비대로');
    if (state.status==='playing' && actor.kind==='gretchin' && !alive.length && !state.patrol.grotReturned)
      action+=btn('grot-reserve','그레친 증식 · 전원을 예비대로 복귀');
    if (state.status==='playing' && currentHP(state,actor)>0 && (mine || state.step===4)) {
      if (state.step===0) action=btn('shock',unit.shockChecked?'검사 완료':'전장 충격 2D6',unit.shockChecked || !needsShock(state,members));
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
    if (state.status==='playing' && ((state.step===2 && mine) || state.step===4)) attack=renderAttack(state,actor);
    const available=Object.entries(tactics).filter(([key])=>selectedTactic(state,key,actor));
    if(state.step===0&&mine&&useInsaneBravery(state,contents(),groupId(state,actor)))
      action+=btn('insane-bravery','불굴의 용기 · 1 CP · 전장 충격 자동 통과');
    if(state.step===4)for(const model of alive.filter(character)){
      if(useEpicChallenge(state,contents(),model.id))
        action+=btn('epic-'+model.id,'영웅적 도전 · 1 CP · '+model.name+'의 근접 무기에 정밀');
    }
    const tacticsMenu=available.length ? detail('tactics','분대 전술 · 각 1 CP',available.map(([key,t])=>'<p>'+esc(t.rule)+'</p>'+btn('tactic-'+key,t.name)).join('')):'';
    if (state.status==='playing' && state.step===0 && mine && actor.kind==='warboss' && state.patrol.enhanced.warcry &&
      !state.patrol.warcryUsed && members.some(p=>p.kind==='boy' && !currentHP(state,p)) && alive.some(p=>p.kind==='boy')) {
      action+=btn('warcry','전투 함성 · D3+2명 복귀');
    }
    if (state.status==='playing' && state.step===4 && members.some(p=>p.kind==='warboss' && currentHP(state,p))) {
      action+=select('bossStyle','워보스 분대 근접 효과',opt('lethal','치명적 명중',choices.bossStyle||'lethal')+opt('sustained','추가 명중 1',choices.bossStyle));
    }
    if(state.step===3&&currentHP(state,actor)>0)action+=chargeActions(api.getTable(),actor);
    if (state.status==='playing' && mine && state.step===2 && actor.kind==='wartrakk' && unit.finishedAttack===2 && !unit.suppressionTargets && unit.hitTargets?.length && !unit.suppressedEnemy) {
      const hit=unit.hitTargets.map(id=>living(state).find(p=>groupId(state,p)===id)).filter(Boolean);
      if (hit.length) action+=select('suppressTarget','명중한 적 분대',hit.map(p=>opt(groupId(state,p),unitLabel(p),choices.suppressTarget)).join(''))+btn('suppress','사격 완료 · 적 분대 제압');
    }
    return chunk(esc(actor.name),'<p class="br-stats">'+esc(stats)+'</p><p class="br-sub">분대 생존 '+alive.length+'/'+members.length+
      (needsShock(state,members)?' · 지휘 시 검사 필요':'')+(flags.length?' · '+esc(flags.join(' · ')):'')+'</p>'+
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
  function refresh() {
    if (writing) return;
    const state=read();
    const selected=api.getSelection();
    if ((selected?.id||'')!==selectedId) {
      selectedId=selected?.id||'';
      if (selected && getProfile(selected)) choices.fighter=selected.id;
    }
    let actor=getPiece(choices.fighter);
    if (!getProfile(actor)) actor=null;
    const all=contents();
    const dispersed=brokenFormations(state,all);
    fightView=state.step===4&&state.status==='playing'?fights.view():null;
    const reservedIds=new Set(Object.values(state.reserves).flat());
    const selector=select('fighter','현재 모델',opt('','미니어처 선택',actor?.id||'')+all.map(p=>opt(p.id,pieceLabel(p)+(reservedIds.has(p.id)?' (예비대)':p.removed?' (제거됨)':''),actor?.id||'')).join(''));
    let top='';
    if (state.status==='setup') {
      top=chunk('로컬 2인 대전','<p>컴뱃 패트롤은 5라운드입니다. 전장 배치도를 고르고 수비 측부터 분대를 번갈아 배치하세요.</p>'+
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
      top=chunk(esc(state.mission || (state.rounds===5 ? patrolMissions[state.active] : '로컬 대전'))+' · '+state.round+'/'+state.rounds+' 라운드',
        '<b class="br-phase">'+teams[state.active]+' · '+steps[state.step]+'</b><p>'+prompts[state.step]+'</p>'+
        btn('next',state.step<5?'다음 · '+steps[state.step+1]:(state.active!==state.first && state.round===state.rounds?'대전 마치기':'다음 플레이어'),!!(state.hazard||state.declaration||state.movePlan||state.reinforcePlan||state.chargePlan||state.shootingReaction||state.reactionPlan||state.units.wartrakk?.suppressionTargets?.length||dispersed.length||fightView&&!fightView.done)));
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
      if (state.step===0 && state.active==='marines') orders=row(Object.entries(doctrines).map(([id,name])=>btn('order-'+id,name,!!p.doctrine || p.usedDoctrines.includes(id))).join(''));
      if (state.step===0 && state.active==='orks') orders=btn('order-waaagh','와아! 선포',p.waaaghUsed);
      if (flags || orders) army=chunk('패트롤 명령',orders+(flags?'<p>'+esc(flags)+'</p>':''));
    }
    if(state.declaration?.precisionRoll){
      root.innerHTML=renderDeclaration(state,all);
      return;
    }
    root.innerHTML=top+army+renderDeclaration(state,all)+selector+(actor?renderActor(state,actor):'')+
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
  function click(event) {
    const action=event.target.closest('button')?.dataset.act;
    if (!action) return;
    const state=read();
    const actor=getPiece(choices.fighter);
    if(state.declaration?.precisionRoll&&action!=='resolve-'+state.declaration.precisionRoll.index)return;
    if(state.fightSequence?.counterAfter&&!(state.hazard?action.startsWith('hazard-'):action.startsWith('fight-counter-')))return;
    const val=id=>field(id)?.value??choices[id];
    const integer=(id,min,max)=>Math.max(min,Math.min(max,Math.trunc(Number(val(id)))||0));
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
      const next=startBattle(state,first,integer('rounds',1,20));
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
      const next=advance(resolved);
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
    if (action==='cancel-plan' || action.startsWith('drop-') || action==='reopen') {
      const plan=state.declaration;
      if(!plan)return;
      if(action==='reopen'){
        if(!plan.locked||plan.rows.some(r=>r.done))return;
        return commit({...state,declaration:{...plan,locked:false}},'표적 적격성 변경 · 공격 선언 수정');
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
        const p=getPiece(r.actor),weapon=getProfile(p).weapons[r.weapon];
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
      const next=lockDeclaration({...state,declaration:{...plan,rows}},all,eligible);
      if(!next){feedback='교전 중인 각 모델의 근접 공격을 모두 배정하세요.';return refresh();}
      return commit(next,'분대 공격 선언 확정 · 무기·표적 배정 '+rows.length+'건');
    }
    if(action.startsWith('resolve-')){
      const index=Number(action.slice(8));
      const precisionTarget=state.declaration?.precisionRoll?(field('precision-target')?.value||null):undefined;
      const resolved=resolvePacket(state,contents(),index,val('allocate-'+index)||null,Math.random,precisionTarget);
      if(!resolved)return;
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
      return commit(resolved.state,unitLabel(actor)+' → '+unitLabel(target)+' · '+[...packet.names].join(' / ')+trace+
        (resolved.finished?' · 분대 공격 완료':'')+(resolved.finished&&actor.kind==='wartrakk'&&resolved.state.units.wartrakk.suppressedEnemy?
          ' · '+unitLabel(contents().find(p=>groupId(state,p)===resolved.state.patrol.suppressed))+' 제압':'')+
        (resolved.state.hazard?' · 위험 D6 × '+resolved.state.hazard.count:''),resolved.removed);
    }
    if (action==='hazard-roll' || action==='hazard-end' || action.startsWith('hazard-wound-')) {
      if (!state.hazard || (action==='hazard-roll')===!!state.hazard.dice) return;
      const id=action.startsWith('hazard-wound-')?action.slice('hazard-wound-'.length):null;
      const result=resolveHazard(state,contents(),id);
      if (!result) return;
      if(!result.state.hazard&&result.state.shootingReaction&&
        !shootingReactionOptions({...api.getTable(),rules:result.state},result.state.shootingReaction).length)
        result.state.shootingReaction=null;
      const member=contents().find(p=>groupId(state,p)===state.hazard.unit);
      const label=member?unitLabel(member):state.hazard.unit;
      const hits=result.dice.filter(n=>n<=2).length;
      const message=action==='hazard-roll'?' · 위험 D6 ['+diceText(result.dice)+'] · 실패 '+hits+' · 모탈 운드 '+result.total:
        (id?' · '+getPiece(id).name+'에 위험 피해 배정':' · 위험 판정 종료');
      return commit(result.state,label+message+' · 남은 배정 '+result.remaining+
        (Object.keys(result.removed).length?' · 제거 '+Object.keys(result.removed).length:''),result.removed);
    }
    if (action==='dice') {
      const dice=Array.from({length:integer('rollCount',1,60)},()=>roll());
      return commit(state,'D6 × '+dice.length+' = '+diceText(dice)+' (합 '+dice.reduce((a,b)=>a+b,0)+')');
    }
    if (action.startsWith('order-')) {
      const key=action.slice(6),next=selectOrder(state,key);
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
    if (action==='warcry') {
      const fallen=members.filter(p=>p.kind==='boy' && !currentHP(state,p));
      const number=roll(3)+2;
      const revived=fallen.slice(0,number);
      if (!revived.length || state.patrol.warcryUsed) return;
      const hp={...state.hp},changes={};
      for (const p of revived) {hp[p.id]=getProfile(p).wounds;changes[p.id]=false;}
      return commit({...state,hp,patrol:{...state.patrol,warcryUsed:true}},actor.name+' · 전투 함성 '+number+' · '+revived.length+'명 복귀. 편대 안으로 배치하세요.',changes);
    }
    if (action.startsWith('tactic-')) {
      const key=action.slice(7),next=selectedTactic(state,key,actor);
      if (next) return commit(next,unitLabel(actor)+' · '+tactics[key].name+' (1 CP) · '+tactics[key].rule);
      return;
    }
    if (action==='status') return commit(changeUnit(state,actor,{shocked:!unit.shocked}),unitLabel(actor)+(unit.shocked?' · 충격 해제':' · 전장 충격'));
    if(action==='insane-bravery'){
      const next=useInsaneBravery(state,contents(),groupId(state,actor));
      if(next)commit(next,unitLabel(actor)+' · 불굴의 용기 (1 CP) · 전장 충격 자동 통과');
      return;
    }
    if(action.startsWith('epic-')){
      const model=getPiece(action.slice(5));
      if(!model||groupId(state,model)!==groupId(state,actor))return;
      const next=useEpicChallenge(state,contents(),model.id);
      if(next)commit(next,model.name+' · 영웅적 도전 (1 CP) · 이번 근접전 단계에 정밀');
      return;
    }
    if (action==='shock') {
      if(state.status!=='playing'||state.step!==0||actor.faction!==state.active||unit.shockChecked||!needsShock(state,members))return;
      const test=shockTest(state,members);
      return commit(changeUnit(state,actor,{shocked:!test.passed,shockChecked:true}),
        unitLabel(actor)+' · '+diceText(test.dice)+' / Ld '+test.target+'+ · '+(test.passed?'통과':'전장 충격'));
    }
    if (['normal','advance','fallback','desperate','remain','reroll'].includes(action)) {
      feedback=api.moveCommand(action==='desperate'?'fallback':action,actor,{fallbackMode:action==='desperate'?'desperate':'ordered',takeToSkies:action!=='remain'&&!!field('takeToSkies')?.checked});return refresh();
    }
    if (action==='attack' || action==='volley') {
      const {selected,target,members:targets,dist}=attackContext(state,actor);
      if (!selected||!target) return;
      const restriction=attackRestriction(state,actor,selected.w,targets,dist);
      if (restriction) {feedback=restriction;return refresh();}
      const shooters=action==='volley'?matchingShooters(state,actor,selected.w,targets,dist):[actor];
      const blades=state.patrol.enhanced.blades && targets.some(t=>t.kind==='vanguard') && unit.charged && !selected.w.range;
      const withWarboss=!selected.w.range && members.some(p=>p.kind==='warboss' && currentHP(state,p)>0);
      const withLibrarian=!!selected.w.range && members.some(p=>p.kind==='librarian' && currentHP(state,p)>0);
      const rows=shooters.map(p=>({actor:p.id,weapon:getProfile(p).weapons.findIndex(w=>w.name===selected.w.name),
        target:groupId(state,target),preferred:target.id,distance:Math.min(...targets.map(t=>api.getDistance(p.id,t.id))),size:targets.length,
        assigned:selected.w.range?0:integer('allocation',1,selected.w.attacks+integer('extra',0,30)),
        hit:integer('hitMod',-1,1)-Number(state.patrol.suppressed===groupId(state,actor)),wound:integer('woundMod',-1,1)-Number(Boolean(blades)),
        extra:integer('extra',0,30),cover:!!(selected.w.range&&choices.cover),lethal:!!(choices.lethal || (withWarboss&&choices.bossStyle!=='sustained')),
        sustained:!!(withWarboss&&choices.bossStyle==='sustained'),ignore:withLibrarian,guard:false}));
      const next=appendDeclaration(state,contents(),rows);
      if(!next){feedback='선언할 수 없는 배정입니다. 모델별 근접 공격 수와 이미 선택한 무기를 확인하세요.';return refresh();}
      return commit(next,unitLabel(actor)+' · '+selected.w.name+' × '+rows.length+' → '+unitLabel(target)+' 선언');
    }
  }
  function change(event) {
    const el=event.target,key=el.dataset.field;
    if (!key) return;
    if(key.startsWith('reaction-')){
      choices[key]=el.type==='checkbox'?el.checked:el.value;
      if(key==='reaction-unit'){delete choices['reaction-target'];delete choices['reaction-fly']}
      refresh();return;
    }
    if(key.startsWith('fight-')){fights.change(key,el.value,el.checked);return}
    const state=read();
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
    if (key==='fighter') {
      if (choices.fighter) api.selectPiece(choices.fighter);
      choices.weapon='0'; choices.extra='0'; choices.hitMod='0'; choices.woundMod='0'; choices.lethal=false;
    }
    if(['fighter','weapon','target'].includes(key))choices.allocation='';
    if (['fighter','weapon','target','objective'].includes(key)) refresh();
  }
  function toggle(event) {
    const id=event.target.dataset.detail;
    if (!id || !root.contains(event.target)) return;
    if (event.target.open) opened.add(id); else opened.delete(id);
  }
  root.addEventListener('click',click);
  root.addEventListener('change',change);
  root.addEventListener('toggle',toggle,true);
  const unsubscribe=api.onChange(refresh);
  refresh();
  return {refresh,destroy(){if(typeof unsubscribe==='function')unsubscribe(); root.remove();}};
}
