import {teams} from './battle.mjs';
import {enhancements} from './patrol.mjs';
import {patrolFormationOptions} from './patrol-formations.mjs';
import {unitId} from './profiles.mjs';

const escape=text=>String(text).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function button(act,team,label,fields={},pressed=null,disabled=false){
  const args=Object.entries(fields).map(([key,value])=>' data-'+key+'="'+escape(value)+'"').join('');
  return '<button type="button" data-act="form-'+act+'" data-team="'+team+'"'+args+
    (pressed===null?'':' aria-pressed="'+pressed+'"')+(disabled?' disabled':'')+'>'+
    (pressed?'✓ ':'')+escape(label)+'</button>';
}
function unitName(groups,key){
  if(key==='boy-0')return '보이즈 1분대';
  if(key==='boy-1')return '보이즈 2분대';
  const base=groups[key].find(p=>unitId(p)===key);
  return base.name.replace(/ \d+$/,'');
}
const card=(title,body)=>'<section class="br-card"><h3>'+title+'</h3>'+body+'</section>';
const row=items=>'<div class="br-row">'+items.join('')+'</div>';

export function patrolFormationPanel(state,pieces){
  const f=state.formations;
  if(!f)return '';
  if(f.stage==='handoff')return card('기기 인계','<p>오크 플레이어에게 기기를 넘겨 주세요.</p>'+
    button('open','orks','오크 비공개 편성 열기'));
  if(f.stage==='revealed'){
    return card('공개된 전투 편성',['marines','orks'].map(team=>{
      const {draft,groups,leaders}=patrolFormationOptions(f,pieces,team);
      const joined=leaders.filter(p=>draft.attachments[p.id]).map(p=>p.name+' → '+unitName(groups,draft.attachments[p.id]));
      return '<h4>'+teams[team]+'</h4><p>지휘관 합류 · '+escape(joined.join(', ')||'없음')+
        '<br>예비대 · '+escape(draft.reserves.map(k=>unitName(groups,k)).join(', ')||'없음')+
        '<br>강화 · '+escape(enhancements[draft.enhancement][1])+'</p>';
    }).join(''));
  }
  const team=f.stage;
  const {draft,groups,capacity,leaders}=patrolFormationOptions(f,pieces,team);
  const join=leaders.map(leader=>'<div>'+escape(leader.name)+'</div>'+row(leader.eligible.map(unit=>
    button('attach',team,unit?unitName(groups,unit):'독립 편성',{leader:leader.id,unit},(draft.attachments[leader.id]??'')===unit)))).join('');
  const reserve=row(Object.keys(groups).map(unit=>{
    const selected=draft.reserves.includes(unit);
    return button('reserve',team,unitName(groups,unit)+' ('+groups[unit].length+'기)',{unit},selected,!selected&&!capacity.remaining);
  }));
  const enhance=row(Object.entries(enhancements).filter(([,v])=>v[0]===team).map(([key,v])=>
    button('enhance',team,v[1],{enhancement:key},key===draft.enhancement)));
  return card(teams[team]+' 비공개 편성','<p>양측이 확정하면 편성을 함께 공개합니다.</p>')+
    card('지휘관 합류',join)+card('예비대 · '+capacity.reserved+' / '+capacity.maximum+'분대',reserve)+
    card('패트롤 강화 · 하나 선택',enhance)+row([button('lock',team,team==='marines'?'편성 확정 · 기기 인계':'편성 확정 · 양측 공개',{},null,!draft.enhancement)]);
}
