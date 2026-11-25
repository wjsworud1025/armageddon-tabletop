import {getProfile} from './profiles.mjs';
import {newBattle,startBattle,advance,opposite,steps,teams,roll,currentHP,unitMembers,
  groupId,changeUnit,needsShock,shockTest,adjustHP,resolveAttack,controlObjective,engaged,weaponSlot,modelProfile,
  queueHazard,hazardCandidates,resolveHazard} from './battle.mjs';
import {doctrines,enhancements,tactics,selectOrder,useTactic,inDoctrine,hasWaaagh,effectWeapon,tacticActive} from './patrol.mjs';
import {patrolMissions,recordLosses,objectiveSnapshot,missionAward} from './missions.mjs';

const sourcePatrol='https://www.warhammer-community.com/en-gb/articles/2akzkx92/combat-patrol-is-now-live-in-your-app/';
const sourceCore='https://assets.warhammer-community.com/eng_01-06_warhammer40k_new40k_core_rules-was6fbu1ix-hfewhmxyiy.pdf';
const prompts=[
  '반절 이하인 분대와 전장 충격 상태인 분대를 검사하세요. 양쪽에 지휘 포인트가 1씩 지급됐습니다.',
  '분대를 선택해 이동 방식을 선언하고 모델을 옮기세요. 이동할 때 편대와 교전 거리를 확인하세요.',
  '공격할 모델과 무기를 선택하세요. 상대 분대가 보이는지 확인한 뒤 공격을 굴리세요.',
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
  function commit(state,message,changes={}) {
    writing=true;
    try {
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
    if (!currentHP(state,actor)) return '제거된 모델';
    const order=findKey(state,actor);
    if (state.hazard && (state.hazard.dice || state.hazard.unit!==groupId(state,actor))) return '대기 중인 위험 판정을 먼저 마치세요';
    if (order.finishedAttack===state.step) return '이번 페이즈의 분대 공격을 마쳤습니다';
    const past=order.attacks?.[actor.id] || [];
    const slot=weaponSlot(weapon);
    if (past.some(a=>a.slot===slot)) return '이미 사용한 무기';
    const inContact=(a,b)=>engaged(a,b,api.getDistance(a.id,b.id));
    if (!weapon.range) return targets.some(t=>inContact(actor,t))?'':'교전 거리 밖';
    if (dist>weapon.range) return '사거리 밖';
    if (order.movement==='fallback' && !inDoctrine(state,actor,'tactical')) return '후퇴한 분대';
    if (order.movement==='advance' && !weapon.assault && !inDoctrine(state,actor,'devastator') && !hasWaaagh(state,actor)) return '전력 이동 후 사용 불가';
    if (actor.kind!=='landSpeeder' && past.some(a=>a.ranged && a.pistol!==weapon.pistol)) return '권총과 일반 무기는 함께 사용 불가';
    const current=living(state),own=unitMembers(state,current,actor);
    const contact=own.some(a=>targets.some(b=>inContact(a,b)));
    const tied=contact || own.some(a=>current.some(b=>b.faction!==actor.faction && inContact(a,b)));
    if (tied && order.movement==='advance') return '교전 중 전력 이동 사격 불가';
    if (tied && actor.kind!=='landSpeeder' && (!weapon.pistol || !contact)) return '교전 중에는 해당 적에게 근접 사격만 가능';
    if (contact && weapon.blast) return '교전 중인 표적에 폭발 무기 사용 불가';
    const targetTied=contact || targets.some(b=>current.some(a=>a.faction===actor.faction && inContact(a,b)));
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
    const {options,selected,candidates,target,members,dist}=attackContext(state,actor);
    if (!target || !selected) return '<p>전장에 공격할 적이 없습니다.</p>';
    const weapon=selected.w;
    const range=weapon.range ? weapon.range+'″' : '근접';
    const blocked=attackRestriction(state,actor,weapon,members,dist);
    const matching=blocked?[]:matchingShooters(state,actor,weapon,members,dist);
    return chunk('무기 공격',select('weapon','선택한 모델의 무기',options.map(({w,i})=>opt(String(i),w.name,choices.weapon)).join(''))+
      select('target','표적 분대 · 우선 피해 배정 모델',candidates.map(p=>opt(p.id,pieceLabel(p),choices.target)).join(''))+
      '<p class="br-sub">거리 '+dist.toFixed(1)+'″ · 사거리 '+range+' · A '+weapon.attacks+' · S '+weapon.strength+
      ' · AP '+weapon.ap+' · D '+weapon.damage+'</p>'+
      (weapon.range ? '<label><input data-field="cover" type="checkbox"'+(choices.cover?' checked':'')+'> 표적 분대에 엄폐 적용</label>' : '')+
      detail('mods','무기 및 분대 보정',row(number('hitMod','명중 보정',-1,1,choices.hitMod)+number('woundMod','상처 보정',-1,1,choices.woundMod)+number('extra','추가 공격',0,30,choices.extra))+
        '<label><input type="checkbox" data-field="lethal"'+(choices.lethal?' checked':'')+'>치명적 명중 (Lethal Hits)</label>')+
      row(btn('attack',blocked || '이 무기 공격 굴리기',Boolean(blocked))+
        (matching.length>1?btn('volley','동일 무기 '+matching.length+'개 함께 굴리기'):''))+
      '<p class="br-sub">가시선과 특수 능력을 확인하세요. 일괄 공격은 선택 분대에서 같은 무기·사거리 효과를 가진 모델 전체에 적용합니다.</p>');
  }
  function renderActor(state,actor) {
    const p=modelProfile(state,actor),members=unitMembers(state,contents(),actor);
    const unit=findKey(state,actor);
    const alive=members.filter(m=>currentHP(state,m)>0);
    const mine=state.active===actor.faction;
    const reserve=state.reserves[groupId(state,actor)];
    const enemy=living(state).filter(p=>p.faction!==actor.faction);
    let engagedEnemy=false,enemyInTwelve=false;
    if (state.status==='playing' && (state.step===1 || state.step===3)) {
      for (const a of alive) for (const b of enemy) {
        const inches=api.getDistance(a.id,b.id);
        engagedEnemy ||= engaged(a,b,inches);
        enemyInTwelve ||= inches<=12;
      }
    }
    const stats='M '+p.move+'″ · T '+p.toughness+' · Sv '+p.save+'+ · W '+currentHP(state,actor)+'/'+p.wounds+' · Ld '+p.leadership+'+ · OC '+(unit.shocked?'–':p.oc);
    let action='';
    if (reserve) {
      const eligible=state.status==='setup' || (state.status==='playing' && mine && state.round>=2 && state.step===1);
      return chunk(esc(actor.name)+' · 전략 예비대','<p>예비대에 '+reserve.length+'명 대기 중</p>'+
        btn('ingress',state.status==='setup'?'배치로 복귀':'전장에 증원 배치',!eligible)+
        '<p class="br-sub">전장에 놓을 때 허용된 가장자리, 적과의 거리 및 편대를 확인하세요.</p>');
    }
    if (state.status==='setup') action=btn('reserve','분대를 전략 예비대로');
    if (state.status==='playing' && actor.kind==='gretchin' && !alive.length && !state.patrol.grotReturned)
      action+=btn('grot-reserve','그레친 증식 · 전원을 예비대로 복귀');
    if (state.status==='playing' && currentHP(state,actor)>0 && (mine || state.step===4)) {
      if (state.step===0) action=btn('shock',unit.shockChecked?'검사 완료':'전장 충격 2D6',unit.shockChecked || !needsShock(state,members));
      if (state.step===1) action=row(btn('normal','일반 이동',!!unit.movement || engagedEnemy)+btn('advance','전력 이동 D6',!!unit.movement || engagedEnemy)+btn('fallback','후퇴',!!unit.movement || !engagedEnemy)+btn('remain','정지',!!unit.movement)+
        (actor.faction==='orks' && unit.movement==='advance'?btn('reroll','전력 이동 재굴림',!!unit.rerolled):''));
      if (state.step===3) {
        const canCharge=unit.movement==='advance' ? inDoctrine(state,actor,'assault') || hasWaaagh(state,actor)
          : unit.movement!=='fallback' || inDoctrine(state,actor,'tactical');
        action=btn('charge','돌격 거리 2D6',Boolean(unit.charge || !canCharge || engagedEnemy || !enemyInTwelve));
        if (unit.charge) action+=btn('charged',unit.charged?'돌격 이동 완료':'돌격 이동 완료 표시',!!unit.charged);
      }
    }
    const flags=[unit.shocked?'전장 충격':'',unit.order||'',unit.charge?'돌격 굴림 '+unit.charge+'″':'',
      state.patrol.suppressed===groupId(state,actor)?'제압됨':''].filter(Boolean);
    const leaders=['librarian','warboss','weirdboy'];
    let attachment='';
    if (leaders.includes(actor.kind) && state.status==='setup') {
      const eligible=actor.faction==='marines'?['intercessor']:['boy-0','boy-1'];
      const current=state.attachments[actor.id]||'';
      attachment=select('attach','합류할 분대',opt('','단독',current)+eligible.map(id=>opt(id,{intercessor:'인터세서 분대','boy-0':'보이즈 1분대','boy-1':'보이즈 2분대'}[id],current)).join(''));
    }
    let attack='';
    if (state.status==='playing' && ((state.step===2 && mine) || state.step===4)) attack=renderAttack(state,actor);
    const available=Object.entries(tactics).filter(([key,t])=>useTactic(state,key,groupId(state,actor),actor.faction,unit.shocked));
    const tacticsMenu=available.length ? detail('tactics','분대 전술 · 각 1 CP',available.map(([key,t])=>'<p>'+esc(t.rule)+'</p>'+btn('tactic-'+key,t.name)).join('')):'';
    if (state.status==='playing' && state.step===0 && mine && actor.kind==='warboss' && state.patrol.enhanced.warcry &&
      !state.patrol.warcryUsed && members.some(p=>p.kind==='boy' && !currentHP(state,p)) && alive.some(p=>p.kind==='boy')) {
      action+=btn('warcry','전투 함성 · D3+2명 복귀');
    }
    if (state.status==='playing' && state.step===4 && members.some(p=>p.kind==='warboss' && currentHP(state,p))) {
      action+=select('bossStyle','워보스 분대 근접 효과',opt('lethal','치명적 명중',choices.bossStyle||'lethal')+opt('sustained','추가 명중 1',choices.bossStyle));
    }
    if (state.status==='playing' && !mine && state.step===3 && actor.kind==='captain' && !engagedEnemy &&
      enemy.some(b=>api.getDistance(actor.id,b.id)<=6) && !unit.counterCharge)
      action+=btn('countercharge','전쟁의 달인 · 반격 돌격 (최대 6″)');
    if (state.status==='playing' && !mine && state.step===2 && actor.kind==='vanguard' && unit.shotAt && !unit.reaction)
      action+=btn('react','신속 대응 · D6+1″ 이동');
    if (state.status==='playing' && mine && state.step===2 && actor.kind==='wartrakk' && unit.hitTargets?.length && !unit.suppressedEnemy) {
      const hit=unit.hitTargets.map(id=>living(state).find(p=>groupId(state,p)===id)).filter(Boolean);
      if (hit.length) action+=select('suppressTarget','명중한 적 분대',hit.map(p=>opt(groupId(state,p),unitLabel(p),choices.suppressTarget)).join(''))+btn('suppress','사격 완료 · 적 분대 제압');
    }
    return chunk(esc(actor.name),'<p class="br-stats">'+esc(stats)+'</p><p class="br-sub">분대 생존 '+alive.length+'/'+members.length+
      (needsShock(state,members)?' · 지휘 시 검사 필요':'')+(flags.length?' · '+esc(flags.join(' · ')):'')+'</p>'+
      attachment+action+tacticsMenu+
      detail('model','모델 상태 수동 조정',row(btn('hurt','상처 −1',currentHP(state,actor)<=0)+btn('heal','상처 +1',currentHP(state,actor)>=p.wounds)+btn('status',unit.shocked?'충격 해제':'전장 충격 표시'))))+attack;
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
    const selector=select('fighter','현재 모델',opt('','미니어처 선택',actor?.id||'')+all.map(p=>opt(p.id,pieceLabel(p)+(p.removed?' (제거됨)':''),actor?.id||'')).join(''));
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
        setup+=btn('deploy',outside?'분대를 배치 구역 안에 놓으세요':'선택 분대 배치 완료',!actor || actor.faction!==deployTeam || d.placed.includes(groupId(state,actor)) || outside);
      }
      top+=detail('deployment','교대 배치',setup);
    } else if (state.status==='finished') {
      const winner=controlObjective(state.vp.marines,state.vp.orks);
      top=chunk('대전 종료','<b class="br-phase">'+(winner?teams[winner]+' 승리':'무승부')+'</b><p>'+state.vp.marines+' 대 '+state.vp.orks+'</p>');
    } else {
      top=chunk(esc(state.mission || (state.rounds===5 ? patrolMissions[state.active] : '로컬 대전'))+' · '+state.round+'/'+state.rounds+' 라운드',
        '<b class="br-phase">'+teams[state.active]+' · '+steps[state.step]+'</b><p>'+prompts[state.step]+'</p>'+
        btn('next',state.step<5?'다음 · '+steps[state.step+1]:(state.active!==state.first && state.round===state.rounds?'대전 마치기':'다음 플레이어'),!!state.hazard));
    }
    if (state.hazard) {
      const hazard=state.hazard;
      const unit=all.find(p=>groupId(state,p)===hazard.unit);
      const title=(unit?unitLabel(unit):hazard.unit)+' · 위험 무기 '+hazard.count+'개';
      if (!hazard.dice) {
        top+=chunk(esc(title),'<p>이 분대의 다른 무기 공격을 모두 마친 뒤 굴리세요.</p>'+
          btn('hazard-roll','분대 공격 종료 · 위험 판정'));
      } else {
        const eligible=hazardCandidates(state,all);
        top+=chunk(esc(title),'<p>D6 ['+diceText(hazard.dice)+'] · 배정할 모탈 운드 '+hazard.remaining+'점</p>'+
          (eligible.length?row(eligible.map(p=>btn('hazard-wound-'+p.id,pieceLabel(p)+'에 1점 배정')).join('')):
            btn('hazard-end','분대 전멸 · 판정 종료')));
      }
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
    root.innerHTML=top+army+selector+(actor?renderActor(state,actor):'')+
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
    const val=id=>field(id)?.value??choices[id];
    const integer=(id,min,max)=>Math.max(min,Math.min(max,Math.trunc(Number(val(id)))||0));
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
      if (state.hazard) return;
      let resolved=recordLosses(state,contents());
      const areas=api.getObjectiveAreas?.()||[];
      if (areas.length) resolved.objectives=objectiveSnapshot(resolved,contents(),areas,api.getDistance);
      const score=state.rounds===5 && areas.length && !state.mission ? missionAward(resolved,Object.values(resolved.objectives)) : 0;
      resolved.vp={...resolved.vp,[state.active]:resolved.vp[state.active]+score};
      const next=advance(resolved);
      return commit(next,(score?teams[state.active]+' 임무 +'+score+' VP · ':'')+(next.status==='finished'?'대전 종료':next.round+' 라운드 · '+teams[next.active]+' · '+steps[next.step]));
    }
    if (action==='hazard-roll' || action==='hazard-end' || action.startsWith('hazard-wound-')) {
      if (!state.hazard || (action==='hazard-roll')===!!state.hazard.dice) return;
      const id=action.startsWith('hazard-wound-')?action.slice('hazard-wound-'.length):null;
      const result=resolveHazard(state,contents(),id);
      if (!result) return;
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
        const groups=new Set(contents().filter(p=>p.faction===actor.faction).map(p=>groupId(state,p)));
        const already=[...groups].filter(g=>reserves[g]).length;
        if (!revive && already>=Math.floor(groups.size/2)) {feedback='예비대는 해당 군대 분대 수의 절반까지입니다.';return refresh();}
        const reserveMembers=members.filter(p=>revive || currentHP(state,p)>0);
        reserves[key]=reserveMembers.map(p=>p.id);
        for (const p of reserveMembers) {changes[p.id]=true;if(revive)hp[p.id]=getProfile(p).wounds;}
        if (revive) patrol={...patrol,grotReturned:true};
      }
      return commit({...state,reserves,hp,patrol},unitLabel(actor)+(action==='ingress'?' · 전장에 배치':' · 전략 예비대로 이동'),changes);
    }
    if (!currentHP(state,actor)) {feedback='제거된 모델입니다.';return refresh();}
    if (action==='countercharge' || action==='react') {
      const charge=action==='countercharge';
      const distance=charge?Math.min(6,roll()+roll()):roll()+1;
      const order=(charge?'반격 돌격 ':'신속 대응 이동 ')+distance+'″';
      return commit(changeUnit(state,actor,charge?{order,counterCharge:true,charge:distance}:{order,reaction:true}),actor.name+' · '+order);
    }
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
      const key=action.slice(7),next=useTactic(state,key,groupId(state,actor),actor.faction,unit.shocked);
      if (next) return commit(next,unitLabel(actor)+' · '+tactics[key].name+' (1 CP) · '+tactics[key].rule);
      return;
    }
    if (action==='status') return commit(changeUnit(state,actor,{shocked:!unit.shocked}),unitLabel(actor)+(unit.shocked?' · 충격 해제':' · 전장 충격'));
    if (action==='shock') {
      const test=shockTest(state,members);
      return commit(changeUnit(state,actor,{shocked:!test.passed,shockChecked:true}),
        unitLabel(actor)+' · '+diceText(test.dice)+' / Ld '+test.target+'+ · '+(test.passed?'통과':'전장 충격'));
    }
    if (action==='reroll') {
      if (unit.rerolled || unit.movement!=='advance' || actor.faction!=='orks') return;
      const order='전력 이동 '+(profile.move+roll())+'″';
      return commit(changeUnit(state,actor,{order,rerolled:true}),unitLabel(actor)+' · 재굴림 · '+order);
    }
    if (['normal','advance','fallback','remain'].includes(action)) {
      const distance=action==='advance'?profile.move+roll():action==='remain'?0:profile.move;
      const order={normal:'일반 이동',advance:'전력 이동',fallback:'후퇴',remain:'정지'}[action]+' '+distance+'″';
      if (unit.movement) {feedback='이 분대는 이미 이동을 선언했습니다. 변경하려면 되돌리기를 사용하세요.';return refresh();}
      return commit(changeUnit(state,actor,{movement:action,order}),unitLabel(actor)+' · '+order);
    }
    if (action==='charge') {
      const dice=[roll(),roll()],distance=dice[0]+dice[1];
      return commit(changeUnit(state,actor,{charge:distance}),unitLabel(actor)+' · 돌격 '+diceText(dice)+' = '+distance+'″');
    }
    if (action==='charged') return commit(changeUnit(state,actor,{charged:true}),unitLabel(actor)+' · 돌격 이동 완료');
    if (action==='attack' || action==='volley') {
      const {selected,target,members:targets,dist}=attackContext(state,actor);
      if (!selected||!target) return;
      const restriction=attackRestriction(state,actor,selected.w,targets,dist);
      if (restriction) {feedback=restriction;return refresh();}
      const shooters=action==='volley'?matchingShooters(state,actor,selected.w,targets,dist):[actor];
      const blades=state.patrol.enhanced.blades && targets.some(t=>t.kind==='vanguard') && unit.charged && !selected.w.range;
      const withWarboss=!selected.w.range && members.some(p=>p.kind==='warboss' && currentHP(state,p)>0);
      const withLibrarian=!!selected.w.range && members.some(p=>p.kind==='librarian' && currentHP(state,p)>0);
      const areas=api.getObjectiveAreas?.()||[];
      const onObjective=areas.length && targets.some(t=>t.kind==='intercessor') && targets.every(t=>areas.some(a=>a.members.includes(t.id)));
      const usedWeapon=onObjective?{...selected.w,ap:Math.min(0,selected.w.ap+1)}:selected.w;
      const result=resolveAttack({weapon:usedWeapon,targets,state,preferred:target.id,distance:dist,copies:shooters.length,
        cover:choices.cover,lethal:choices.lethal || (withWarboss && choices.bossStyle!=='sustained'),
        sustained:withWarboss && choices.bossStyle==='sustained',ignorePenalties:withLibrarian,
        hitMod:integer('hitMod',-1,1)-Number(state.patrol.suppressed===groupId(state,actor)),woundMod:integer('woundMod',-1,1)-Number(Boolean(blades)),
        extraAttacks:integer('extra',0,30)});
      const removed={};
      for (const [id,hp] of Object.entries(result.hp)) {
        if (!hp) removed[id]=true;
      }
      const lost=result.damage.reduce((sum,h)=>sum+h.lost,0);
      const trace=' · 명중 ['+diceText(result.hitDice)+'] · 상처 ['+diceText(result.woundDice)+'] · 방어 ['+diceText(result.saves)+']';
      const attacks={...unit.attacks};
      for(const p of shooters) attacks[p.id]=[...(attacks[p.id]||[]),{slot:weaponSlot(selected.w),ranged:!!selected.w.range,pistol:selected.w.pistol}];
      const hitTargets=[...new Set([...(unit.hitTargets||[]),...(result.hits?[groupId(state,target)]:[])])];
      let next=changeUnit({...state,hp:{...state.hp,...result.hp}},actor,{attacks,hitTargets});
      if (selected.w.hazardous) next=queueHazard(next,actor,shooters.length);
      if (selected.w.range) next=changeUnit(next,target,{shotAt:true});
      return commit(next,actor.name+' → '+target.name+' · '+selected.w.name+(shooters.length>1?' × '+shooters.length:'')+' · '+result.hits+'/'+result.count+
        ' 명중 · 상처 '+result.wounds+' · 피해 '+lost+' · 제거 '+Object.keys(removed).length+trace+
        (next.hazard?' · 분대 공격 종료 후 위험 D6 × '+next.hazard.count:''),removed);
    }
  }
  function change(event) {
    const el=event.target,key=el.dataset.field;
    if (!key) return;
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
      if (el.value && Object.entries(state.attachments).some(([id,unit])=>id!==actor.id && unit===el.value)) {
        feedback='그 분대에는 이미 지휘관이 합류했습니다.';return refresh();
      }
      if (el.value) state.attachments[actor.id]=el.value;
      else delete state.attachments[actor.id];
      return commit(state,actor.name+(el.value?' · 분대 합류':' · 단독 분대'));
    }
    choices[key]=el.type==='checkbox'?el.checked:el.value;
    if (key==='fighter') {
      if (choices.fighter) api.selectPiece(choices.fighter);
      choices.weapon='0'; choices.extra='0'; choices.hitMod='0'; choices.woundMod='0'; choices.lethal=false;
    }
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
