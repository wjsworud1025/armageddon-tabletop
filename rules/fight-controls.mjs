import {beginFightSequence,fightOptions,fightMoveOptions,transitionFight,resolveCounteroffensive} from '../fight-sequence.mjs';
import {teams,groupId,opposite} from './battle.mjs';

const stages={pile:'밀착 이동',first:'선제 공격',remaining:'일반 근접전',consolidate:'재정비',done:'근접전 완료'};
const modes={'pile-in':'밀착 이동',ongoing:'교전 유지 재정비',engaging:'교전 진입 재정비',objective:'거점 재정비'};
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(act,label,disabled=false)=>'<button type="button" data-act="fight-'+act+'"'+(disabled?' disabled':'')+'>'+escape(label)+'</button>';

// All authoritative choices live in rules.fightSequence. Only local input
// (the highlighted unit and unchecked optional targets) lives here. The host
// owns undo, persistence, draft routes and attack declarations.
export function createFightControls({getGame,getObjectives=()=>[],commit,startMove,selectUnit,refresh}){
  let chosenUnit='',targetKey='',chosenTargets=[];
  function view(){
    const game=getGame();
    if(game?.rules?.status!=='playing'||game.rules.step!==4)return {sequence:null,options:null,attackUnit:null,done:false};
    const objectives=getObjectives()??[];
    const sequence=game.rules.fightSequence??beginFightSequence(game,objectives);
    const options=fightOptions(game,sequence,objectives);
    return {game,objectives,sequence:options.sequence,options,attackUnit:options.canAttack?options.active.unit:null,done:options.stage==='done'};
  }
  function input(v){
    const {game,objectives,sequence,options}=v;
    const unit=options.active?.unit??(options.units.includes(chosenUnit)?chosenUnit:options.units[0]);
    const move=unit?fightMoveOptions(game,sequence,unit,objectives):null;
    if(move){
      const key=[game.rules.round,game.rules.active,options.stage,options.team,unit,move.mode,...move.targets].join('/');
      if(key!==targetKey){
        targetKey=key;
        chosenTargets=move.requiredAll?[...move.targets]:move.targets.slice(0,1);
      }
    }else{targetKey='';chosenTargets=[];}
    return {unit,move};
  }
  function label(game,key){
    const p=game.pieces.find(p=>p.kind===key)??game.pieces.find(p=>groupId(game.rules,p)===key);
    if(key?.startsWith('boy-'))return '보이즈 '+(Number(key.slice(4))+1)+'분대';
    return p?.name??key;
  }
  function render(){
    const v=view();if(!v.options)return '';
    const {game,objectives,options}=v,{unit,move}=input(v);
    if(v.sequence.counterAfter&&!game.rules.hazard){
      const defender=teams[opposite(game.rules.active)];
      const choices=options.counters.map(key=>button('counter-'+key,label(game,key)+' · 2 CP')).join('');
      return '<section class="br-card"><h3>'+defender+' · 반격 전술</h3><p>'+
        escape(label(game,v.sequence.counterAfter))+' 분대의 공격이 끝났습니다. 아군 분대 하나에 선제 공격을 부여하면 그 분대를 다음으로 선택합니다.</p>'+
        choices+button('counter-decline','반격 전술 생략')+'</section>';
    }
    const busy=!!(game.rules.declaration||game.rules.hazard||game.rules.fightPlan);
    const title=options.stage==='done'?stages.done:teams[options.team]+' · '+(options.reactions.length?'재정비 반격':stages[options.stage]);
    let body='';
    if(!v.done){
      if(options.active){
        body+='<p>'+escape(label(game,unit))+' · '+(options.active.kind==='overrun'?'돌파 전투':'일반 전투')+'</p>';
      }else{
        body+='<label>분대<select data-field="fight-unit">'+options.units.map(k=>'<option value="'+escape(k)+'"'+(unit===k?' selected':'')+'>'+escape(label(game,k))+'</option>').join('')+'</select></label>';
      }
      if(move){
        body+='<p>'+modes[move.mode]+' · 최대 '+move.limit+'″</p>';
        body+=move.targets.map(key=>{
          const name=move.mode==='objective'?(objectives.find(o=>o.id===key)?.name??key):label(game,key);
          return '<label><input type="checkbox" data-field="fight-target" value="'+escape(key)+'"'+
            (chosenTargets.includes(key)?' checked':'')+(move.requiredAll||busy?' disabled':'')+'>'+escape(name)+'</label>';
        }).join('');
        body+=button('move','이동 경로 지정',busy||!chosenTargets.length);
      }
      if(options.active?.extraPile)body+=button('skip','추가 밀착 생략',busy);
      else if(options.active){
        if(v.attackUnit)body+='<p>아래에서 이 분대의 근접 무기와 표적을 선언하세요.</p>';
        body+=button('finish','이 분대 전투 마침',!options.canFinish||busy);
      }else{
        if(options.kinds[unit]?.includes('normal'))body+=button('normal','일반 전투 선택',busy);
        if(options.kinds[unit]?.includes('overrun'))body+=button('overrun','돌파 전투 선택',busy);
        if(options.canPass)body+=button('pass',options.stage==='pile'?'이 진영 밀착 마침':options.stage==='consolidate'?'이 진영 재정비 마침':'이번 선택 넘기기',busy);
      }
    }
    return '<section class="br-card"><h3>'+escape(title)+'</h3>'+body+'</section>';
  }
  function change(field,value,checked){
    if(!['fight-unit','fight-target'].includes(field))return false;
    const v=view();if(!v.options)return true;
    const {move}=input(v);
    if(field==='fight-unit'&&v.options.units.includes(value)){
      chosenUnit=value;selectUnit?.(value);
    }
    if(field==='fight-target'&&move&&!move.requiredAll&&move.targets.includes(value)){
      if(checked)chosenTargets=move.maxTargets===1?[value]:[...new Set([...chosenTargets,value])];
      else chosenTargets=chosenTargets.filter(t=>t!==value);
    }
    refresh?.();return true;
  }
  function dispatch(action){
    if(action.startsWith('fight-counter-')){
      const game=getGame(),key=action.slice('fight-counter-'.length);
      const next=resolveCounteroffensive(game,key==='decline'?null:key);
      if(!next)throw Error('이번 전투에서는 그 분대에 반격 전술을 사용할 수 없습니다.');
      commit(next,key==='decline'?'반격 전술 생략':label(game,key)+' · 반격 전술 (2 CP) · 다음 전투 선택');
      return true;
    }
    if(!['fight-normal','fight-overrun','fight-finish','fight-skip','fight-pass','fight-move'].includes(action))return false;
    const v=view();if(!v.options)throw Error('근접전 페이즈에서 선택하세요.');
    const {game,objectives,sequence}=v,{unit,move}=input(v);
    if(game.rules.fightPlan)throw Error('현재 이동 경로를 먼저 마치세요.');
    if(action==='fight-move'){
      if(!move||!chosenTargets.length||game.rules.declaration||game.rules.hazard)throw Error('이동할 분대와 대상을 확인하세요.');
      startMove({unit,targets:[...chosenTargets],type:move.mode==='pile-in'?'pile-in':'consolidate',mode:move.mode,limit:move.limit},sequence);
      selectUnit?.(unit);return true;
    }
    const kind=action==='fight-normal'?'normal':'overrun';
    const event=action==='fight-pass'?{type:'pass'}:action==='fight-skip'?{type:'skip-overrun'}:
      action==='fight-finish'?{type:'finish'}:{type:'select',unit,kind};
    const next=transitionFight(game,sequence,event,objectives);
    const message=event.type==='pass'?teams[v.options.team]+' · '+stages[v.options.stage]+' 선택 마침':
      label(game,unit)+' · '+({select:kind==='normal'?'일반 전투 선택':'돌파 전투 선택',finish:'근접전 마침','skip-overrun':'추가 밀착 생략'}[event.type]);
    commit({...game.rules,fightSequence:next},message);
    if(event.type==='select')selectUnit?.(unit);
    return true;
  }
  return {view,render,change,dispatch};
}
