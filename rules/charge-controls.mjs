import {chargeOptions} from '../charge.mjs';
import {groupId} from './battle.mjs';

const button=(action,label,disabled=false)=>'<button type="button" data-act="charge-'+action+'"'+(disabled?' disabled':'')+'>'+label+'</button>';
const modes={normal:'돌격 선언 · 2D6',masterOfBattle:'전쟁의 달인 · 반격 돌격',leapToDefend:'영웅적 개입 · 1 CP',intoTheFray:'영웅적 개입 · 추가 비용 포함 2 CP'};
const esc=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function chargeActions(game,actor){
  const state=game.rules;
  if(!actor||state?.step!==3||state.status!=='playing'||state.chargePlan)return '';
  const own=actor.faction===state.active;
  const unit=state.units[groupId(state,actor)];
  if(unit?.charge&&!unit.chargeTracked&&!unit.charged)return button('legacy','이전 저장의 돌격 이동 완료');
  const available=own?(state.chargeWindow?[]:['normal']):(state.chargeWindow?Object.keys(modes).slice(1):[]);
  return available.map(mode=>{
    const options=chargeOptions(game,actor,{mode,endOfPhase:!!state.chargeWindow});
    if(mode==='masterOfBattle'&&actor.kind!=='captain')return '';
    const canChoose=options.targets.some(t=>t.eligible);
    return button(mode,modes[mode]+(options.ok&&!canChoose?' · 현재 표적 없음':''),!options.ok);
  }).join('');
}

export function chargeControls(game){
  const s=game.rules;
  if(s?.status!=='playing'||s.step!==3)return '';
  const p=s.chargePlan;
  if(!p)return '<section class="br-card">'+(s.chargeWindow?
    '<p>상대의 반응 돌격 차례입니다. 반응을 마치면 근접전으로 진행하세요.</p>':
    '<p>아군의 돌격 선언이 끝나면 상대에게 반응 기회를 넘기세요.</p>'+button('window','돌격 선언 종료 · 상대 반응'))+'</section>';
  const actor=game.pieces.find(m=>m.id===p.actor);
  if(!actor)return '';
  const options=chargeOptions(game,actor,{mode:p.mode,roll:p.roll,takeToSkies:p.takeToSkies,origins:p.origins,declared:true,endOfPhase:!!s.chargeWindow});
  const units=options.targets.filter(t=>t.eligible);
  const targets=units.map(t=>{
    const leader=t.members[0];
    const name=leader.kind==='boy'?'보이즈 '+(Math.floor(leader.variant/10)+1)+'분대':leader.name;
    return '<label><input type="checkbox" data-charge-target="'+esc(t.unit)+'"'+(p.targets.includes(t.unit)?' checked':'')+'>'+esc(name)+' · '+t.distance.toFixed(2)+'″</label>';
  }).join('');
  const fly=game.pieces.some(m=>!m.removed&&m.faction===actor.faction&&groupId(s,m)===p.unit&&['vanguard','landSpeeder'].includes(m.kind));
  return '<section class="br-card"><h3>'+esc(actor.name)+' · 돌격</h3><p>2D6 ['+p.dice.join(' + ')+'] · 이동 한도 '+options.limit+'″</p>'+
    (targets||'<p>굴림 거리 안에 선언할 수 있는 표적이 없습니다.</p>')+
    (fly?'<label><input type="checkbox" data-charge-fly'+(p.takeToSkies?' checked':'')+'> 비행 이동 (−2″)</label>':'')+
    '<div class="br-row">'+button('targets','표적 확정',!units.length)+button('finish','돌격 이동 완료',!p.targets.length)+
    button('rewind','경로 다시 그리기',!Object.keys(p.paths).length)+button('cancel','돌격 포기 · 원위치')+'</div></section>';
}
