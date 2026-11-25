import {createTable} from './data/catalog.mjs';
import {drawDeploymentDiagram} from './data/deployment-diagram.mjs';
import {createTrainingOne,rollTrainingOne,trainingOneView} from './rules/training-one.mjs';
import {actTrainingTwo,createTrainingTwo,trainingTwoPieces,trainingTwoView} from './rules/training-two.mjs';
import {createTrainingThreeDeployment,moveTrainingThreeDeployment,trainingThreeDeploymentPieces} from './rules/training-three-deployment.mjs';
import {createTrainingThreeBattle,actTrainingThreeBattle,trainingThreeBattlePieces,trainingThreeBattleView} from './rules/training-three-battle.mjs';
import {trainingFourBattle,trainingFourDeployment,trainingFourObjectivesView} from './rules/training-four-battle.mjs';
import {trainingFourDeploymentArea} from './data/training-four-layout.mjs';
import {mountRules} from './rules/panel.mjs';
import {baseDistance,place,restore,snapshot,translateFormation} from './state.mjs';
import {buildScene} from './scene.mjs';
import {photoFit} from './photo-camera.mjs';
import {getProfile} from './rules/profiles.mjs';
import {newBattle,unitMembers,groupId,roll,shockTest,changeUnit} from './rules/battle.mjs';
import {beginMove,proposeMove,finishMove,rewindMove,rerollMove,abandonInvalidMove} from './move-session.mjs';
import {beginCharge,selectChargeTargets,proposeCharge,finishCharge,rewindCharge,cancelCharge} from './charge-session.mjs';
import {beginFightMove,proposeFightMove,finishFightMove,cancelFightMove} from './fight-session.mjs';
import {beginReinforcement,placeReinforcement,finishReinforcement} from './rules/reinforcement-session.mjs';
import {beginShootingReaction,proposeShootingReaction,finishShootingReaction,declineShootingReaction} from './rules/shooting-reaction.mjs';
import {tacticActive} from './rules/patrol.mjs';
import {applyLayout,objectiveAreas,validDeployment,objectiveFootprints} from './layouts.mjs';
import {studioGroupFor,openStudioViewer} from './assets/turntable.mjs';
import {loadPortraitMap,portraitUrl} from './painted.mjs';
import {findLocalArt} from './media.mjs';

const $=id=>document.getElementById(id);
const storageKey='armageddon-table-2026-v1';
const template=createTable(), subscribers=new Set();
const factionNames={marines:'스페이스 마린',orks:'오크',terrain:'지형'};
function fresh(){return {...structuredClone(template),rules:null,logs:['스타터 세트 전장을 펼쳤습니다.'],surface:'front'}}
let game=fresh(),active=null,scene,mode='pick',toastTimer;
// The tutorial has a separate display table. A player's deployment, casualties
// and in-progress Combat Patrol turn survive entering, saving and leaving it.
const duelTable=structuredClone(template);
Object.assign(duelTable,{width:template.depth,depth:template.width/2,surface:'front'});
const duelists={orks:duelTable.pieces.find(p=>p.kind==='warboss'),marines:duelTable.pieces.find(p=>p.kind==='captain')};
for(const p of duelTable.pieces)p.removed=true;
for(const [team,p] of Object.entries(duelists)){
  const sign=team==='orks'?-1:1;
  Object.assign(p,{x:sign*p.baseWidth/2,z:0,yaw:-sign*Math.PI/2,elevation:0});
}
const trainingField={width:30,depth:22,surface:'reverse',pieces:structuredClone(template.pieces)};
function shownTable(){
  if(!game.training)return game;
  if(game.training.scenario>=2){
    if(trainingField.training!==game.training){
      const deploying=game.training.phase==='deployment';
      const project={2:trainingTwoPieces,3:deploying?trainingThreeDeploymentPieces:trainingThreeBattlePieces,
        4:deploying?trainingFourDeployment.pieces:trainingFourBattle.pieces}[game.training.scenario];
      const poses=new Map(project(game.training).map(p=>[p.id,p]));
      for(const p of trainingField.pieces){
        const pose=poses.get(p.id);
        if(pose)Object.assign(p,pose);else p.removed=true;
      }
      trainingField.training=game.training;
    }
    return trainingField;
  }
  duelTable.training=game.training;
  for(const [team,p] of Object.entries(duelists))p.removed=game.training.wounds[team]===0;
  return duelTable;
}
const past=[],future=[];
let original=null;
function paintReference(){
  if($('reference').hidden||!original?.naturalWidth)return;
  const c=$('photo'),w=c.clientWidth,h=c.clientHeight,r=Math.min(devicePixelRatio||1,2);
  c.width=Math.round(w*r);c.height=Math.round(h*r);const ctx=c.getContext('2d');ctx.scale(r,r);
  const {px,uMid,vMid}=photoFit(w,h);
  // Show the published battlefield portion at the exact scale of the 3D camera.
  const y=567;ctx.drawImage(original,0,y,1920,1212-y,w/2-uMid*px,h/2+(y-vMid)*px,1920*px,(1212-y)*px);
}
new ResizeObserver(paintReference).observe($('stage'));
function reference(show){$('reference').hidden=!show;$('reference-toggle').setAttribute('aria-pressed',String(show));
  if(show){scene?.home();$('camera').textContent='탑뷰';paintReference()}}
$('reference-toggle').onclick=()=>reference($('reference').hidden);
$('appearance').onclick=()=>{reference(false);scene?.togglePaint()};
try {const data=localStorage.getItem(storageKey);if(data)game=restore(template,JSON.parse(data))}
catch(e){toast('자동 저장을 읽을 수 없어 초기 배치를 열었습니다.')}
function toast(message){const n=$('notice');n.textContent=message;n.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.hidden=true,3800)}
function log(message){if(message){game.logs.push(String(message));if(game.logs.length>100)game.logs.shift()}}
function checkpoint(){past.push(snapshot(game));if(past.length>100)past.shift();future.length=0}
function piece(id){return game.pieces.find(p=>p.id===id)}
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(snapshot(game)));$('save-status').textContent='자동 저장됨'}catch{$('save-status').textContent='파일 저장 필요'}}
function notify(){for(const fn of subscribers)fn()}
function redraw(){scene?.sync();roster();selection();history();$('undo').disabled=!past.length;$('redo').disabled=!future.length;
  renderTraining();
  for(const side of ['left','right'])$('flip-'+side).setAttribute('aria-pressed',String(game.surface===side||game.surface==='reverse'));
  $('apply-map').disabled=game.rules?.status==='playing';$('map-status').textContent=game.layout?'배치 '+game.layout.map+' · 청색 '+factionNames[game.layout.blue]:'제품 사진 배치';notify()}
function changed(){persist();redraw()}
function mutate(fn,message){checkpoint();fn();log(message);changed()}
function select(id){active=piece(id)?.id??null;scene?.select(active);roster();selection();
  if(game.training?.scenario===2)renderFieldBattle(game.training);
  if(game.training?.scenario>=3)renderFieldMission(game.training);
  notify()}
function history(){
  const list=$('log');list.replaceChildren();
  const entries=game.training?.phase==='deployment'?Object.keys(game.training.positions).map(id=>piece(id).name+' 배치 조정'):
    game.training?.scenario>=2?game.training.rolls.map(describeSecondRoll):
    game.training?game.training.rolls.map(describeTrainingRoll):game.logs;
  for(const entry of [...entries].reverse()){const li=document.createElement('li');li.textContent=entry;list.append(li)}
}
function selection(){
  const p=piece(active);$('selection').hidden=!p;$('sight-tools').hidden=!p||p.removed||p.faction==='terrain';
  $('studio-tools').hidden=!original||!p||!studioGroupFor(p);if(!p)return;
  $('piece-name').textContent=p.name;
  $('piece-spec').textContent=factionNames[p.faction]+' · '+(p.faction==='terrain'?'지면 점유 폭':'베이스')+' '+Math.round(p.baseWidth*25.4)+' × '+Math.round(p.baseDepth*25.4)+' mm';
  const inReserve=Object.values(game.rules?.reserves??{}).some(ids=>ids.includes(p.id));
  $('elevation').value=p.elevation||0;
  $('remove').disabled=inReserve||!!(game.rules?.reinforcePlan||game.rules?.shootingReaction||game.rules?.reactionPlan||pendingAttack());
  $('remove').textContent=inReserve?(p.removed?'예비대 대기 중':'예비대 배치 중'):p.removed?'전장 복귀':'전장에서 제거';
  $('focus').disabled=!!p.removed;
}
function roster(){
  const list=$('army-list'),initialized=list.children.length>0,opened=new Set([...list.querySelectorAll('details[open]')].map(d=>d.dataset.key));
  const search=$('search').value.trim().toLocaleLowerCase();list.replaceChildren();
  $('total').textContent=game.pieces.filter(p=>!p.removed).length+' / '+game.pieces.length;
  function detail(key,label,count,cls,isOpen){const d=document.createElement('details');d.className=cls;d.dataset.key=key;d.open=isOpen;
    const s=document.createElement('summary');s.append(document.createTextNode(label));const n=document.createElement('span');n.textContent=count;s.append(n);d.append(s);return d}
  for(const [faction,label] of Object.entries(factionNames)){
    const pieces=game.pieces.filter(p=>p.faction===faction);
    const matched=pieces.filter(p=>([p.name,p.kind,p.id,label,p.displayName].join(' ')).toLowerCase().includes(search));
    if(!matched.length)continue;
    const d=detail(faction,label,pieces.filter(p=>!p.removed).length+' / '+pieces.length,'army',!!search||opened.has(faction)||!initialized&&faction==='marines');
    const icon=document.createElement('i');icon.className='dot '+faction;d.firstChild.prepend(icon);
    const groups=new Map();for(const p of matched){if(!groups.has(p.kind))groups.set(p.kind,[]);groups.get(p.kind).push(p)}
    for(const [kind,group] of groups){
      const title=kind==='boy'?'오크 보이즈':group[0].name.replace(/\s*[#\d]+$/u,'');
      const item=detail(kind,title,'× '+group.length,'unit',!!search||opened.has(kind));
      if(original){const thumbnail=document.createElement('img');thumbnail.src=portraitUrl(group[0].id);thumbnail.alt='';thumbnail.className='roster-photo';item.firstChild.prepend(thumbnail)}
      const buttons=document.createElement('div');buttons.className='models';
      group.forEach((p,i)=>{const b=document.createElement('button');
        if(original){const image=document.createElement('img');image.src=portraitUrl(p.id);image.alt='';image.loading='lazy';b.append(image)}
        b.append(document.createTextNode(String((p.variant??i)+1).padStart(2,'0')));b.title=p.name+' · '+p.id;b.setAttribute('aria-label',b.title);
        b.className=[p.id===active?'selected':'',p.removed?'gone':''].join(' ');b.addEventListener('click',()=>select(p.id));buttons.append(b)});
      item.append(buttons);d.append(item);
    }
    list.append(d);
  }
  if(!list.children.length)list.textContent='일치하는 기물이 없습니다.';
}
function undo(redo=false){const from=redo?future:past,to=redo?past:future;if(!from.length)return;to.push(snapshot(game));game=restore(template,from.pop());changed()}
function setMode(value){mode=value;scene?.setMode(mode);
  for(const id of ['pick','ruler','path'])$(id).setAttribute('aria-pressed',String(id===mode));
  $('route-bar').hidden=mode!=='path';
  $('hint').textContent=mode==='ruler'?'미니어처 두 개 또는 전장의 두 지점을 클릭하세요.':mode==='path'?'기물을 고른 뒤 경유할 지면을 차례로 클릭하세요.':'드래그 이동 · 우클릭 회전 · 휠 확대 · Shift 드래그 시점 이동'}
function movingByRules(p){
  const r=game.rules;
  if(r?.status!=='playing')return false;
  if(r.step===4)return true;
  const unit=r.units?.[groupId(r,p)];
  if(r.step===2){
    if(r.shootingReaction||r.reactionPlan||unit?.reactionTracked)return true;
    // Previous saves held the rolled order but no path or starting positions.
    return !(unit?.reaction||tacticActive(r,'surge',groupId(r,p)));
  }
  if(r.step===3)return !!r.chargePlan||!(unit?.charge&&!unit.chargeTracked&&!unit.charged);
  if(r.step!==1)return false;
  if(r.reinforcePlan)return true;
  // Older saves stored the order but no starting position or distance travelled.
  // Continue that open turn with its original table controls.
  if(!r.movePlan&&p.faction===r.active&&!unit?.movementTracked&&(unit?.reinforcing||unit?.movement&&unit.movement!=='remain'))return false;
  return true;
}
function proposeTableMotion(p,paths){
  if(game.rules.step===2){
    if(game.rules.reactionPlan)return proposeShootingReaction(game,p,paths);
    throw Error('사격 페이즈에는 반응 이동을 선택한 분대만 옮길 수 있습니다.');
  }
  if(game.rules.reinforcePlan)return placeReinforcement(game,p,paths);
  if(game.rules.step===4)return proposeFightMove(game,p,paths,fightObjectives());
  return game.rules.step===3?proposeCharge(game,p,paths):proposeMove(game,p,paths);
}
function fightObjectives(){
  return objectiveFootprints(game);
}
function applyMovement(result){
  const manual=[...new Set((result.manual||[]).map(m=>m.message))];
  mutate(()=>{
    game.rules=result.rules;
    for(const [id,pose] of Object.entries(result.poses||{}))Object.assign(piece(id),pose);
  },result.message+(manual.length?' · '+manual.join(' '):''));
  if(manual.length)toast(manual.join(' '));
}
function editPose(p,delta,message){
  if(game.training)return;
  if(movingByRules(p)){
    try{applyMovement(proposeTableMotion(p,{[p.id]:[delta]}))}catch(e){toast(e.message);selection()}
  }else mutate(()=>{Object.assign(p,delta);place(p,p.x,p.z,game)},message);
}
function rotate(){
  if(game.training?.scenario===4){pivotFourth(1);return}
  const p=piece(active);if(p)editPose(p,{yaw:(p.yaw+Math.PI/12)%(2*Math.PI)},p.name+' 15° 회전');
}
function pendingAttack(){return game.rules?.declaration?.attackRoll||game.rules?.declaration?.precisionRoll}
function remove(id,removed){const p=piece(id);
  if(game.training)return;
  if(pendingAttack()){toast('진행 중인 공격의 피해 배정을 먼저 마치세요.');return}
  if(game.rules?.shootingReaction||game.rules?.reactionPlan){toast('현재 사격 반응을 먼저 마치세요.');return}
  if(game.rules?.reinforcePlan || p&&game.rules?.reserves?.[groupId(game.rules,p)]?.includes(id)){
    toast('예비대는 대전 탭에서 배치하거나 복귀시키세요.');return;
  }
  if(p&&!!p.removed!==!!removed)mutate(()=>{
  p.removed=!!removed;
  if(!removed && game.rules?.hp?.[id]===0)game.rules.hp[id]=getProfile(p)?.wounds??1;
},p.name+(removed?' 제거':' 복귀'))}
function switchTab(name){document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===name)));for(const id of ['roster','battle','history'])$(id).hidden=id!==name}
const trainingNames={orks:'워보스',marines:'캡틴'};
const trainingSteps={hit:'명중',wound:'상처',save:'방어'};
function describeTrainingRoll(record){
  return trainingNames[record.actor]+' '+trainingSteps[record.step]+'　'+record.dice.join(' · ')+
    '　성공 '+record.successes+'개'+(record.damage?' · 피해 '+record.damage:'');
}
function renderTraining(){
  const state=game.training,enabled=!!state;
  const scenario=String(state?.scenario??0),previous=document.body.dataset.training;
  document.body.dataset.training=scenario;
  document.body.classList.toggle('training-active',enabled);
  $('training').hidden=enabled&&scenario!=='1';$('training-two').hidden=enabled&&scenario!=='2';
  for(const [id,n] of [['three','3'],['four','4']]){
    $('training-'+id).hidden=enabled&&scenario!==n;
    $('training-'+id+'-play').hidden=scenario!==n;$('training-'+id+'-intro').hidden=enabled;
  }
  $('training-two-play').hidden=scenario!=='2';$('training-two-intro').hidden=enabled;
  $('training-play').hidden=scenario!=='1';$('training-start').hidden=enabled;
  $('training-intro').hidden=enabled;
  if(previous!==scenario&&(previous!==undefined||enabled)){
    active=null;scene?.select(null);setMode('pick');reference(false);switchTab('battle');
    scene?.home();$('camera').textContent='탑뷰';
    if(scenario==='1')$('hint').textContent='두 베이스가 맞닿은 상태에서 싸웁니다. 드래그로 시점 회전 · 휠로 확대';
    if(scenario==='2')$('hint').textContent='분대의 행동을 선택한 뒤 미니어처를 드래그하세요. 경유지가 필요하면 경로 도구를 사용하세요.';
    if(scenario==='3')$('hint').textContent='미니어처를 드래그해 같은 구역 안에 놓으세요. 상대 모델까지의 거리는 거리 측정으로 확인하세요.';
    if(scenario==='4')$('hint').textContent='금색 테두리는 득점 거점입니다. 파란 환기구에서 인터세서가 출발합니다.';
  }
  if(!state)return;
  if(state.scenario>=3){renderFieldMission(state);return}
  if(state.scenario===2){renderFieldBattle(state);return}
  const view=trainingOneView(state);
  $('training-wounds').textContent='캡틴 '+state.wounds.marines+' / 6 W　·　워보스 '+state.wounds.orks+' / 6 W';
  $('training-status').textContent=state.winner?trainingNames[state.winner]+' 승리':
    trainingNames[view.actor]+' · '+trainingSteps[view.step]+' 굴림 · 주사위 '+view.count+'개 · '+view.threshold+'+';
  $('training-roll').hidden=!!state.winner;
  if(!state.winner)$('training-roll').textContent=trainingSteps[view.step]+' 주사위 굴리기';
  const last=state.rolls.at(-1);
  const result=$('training-dice');
  result.replaceChildren();
  if(!last){result.textContent='워보스가 먼저 공격합니다.';return}
  const label=document.createElement('p');
  label.textContent=trainingNames[last.actor]+'의 '+trainingSteps[last.step]+' · 성공 '+last.successes+' / '+last.dice.length+
    (last.damage?' · 피해 '+last.damage:'');
  result.append(label);
  for(const face of last.dice){
    const die=document.createElement('span'),success=face>=last.threshold;
    die.className=success?'die success':'die';die.textContent=face;
    die.setAttribute('aria-label',face+(success?' 성공':' 실패'));result.append(die);
  }
}
$('training-start').onclick=()=>{if(!game.training)mutate(()=>{game.training=createTrainingOne()})};
$('training-roll').onclick=()=>{
  if(!game.training||game.training.winner)return;
  mutate(()=>{game.training=rollTrainingOne(game.training)});
};
$('training-exit').onclick=()=>{if(game.training)mutate(()=>{delete game.training})};
$('training-two-start').onclick=()=>{if(!game.training)mutate(()=>{game.training=createTrainingTwo()})};
$('training-two-exit').onclick=$('training-exit').onclick;
const fieldMissions={
  2:{id:'two',act:actTrainingTwo,view:trainingTwoView},
  3:{id:'three',deploy:createTrainingThreeDeployment,begin:createTrainingThreeBattle,move:moveTrainingThreeDeployment,act:actTrainingThreeBattle,view:trainingThreeBattleView},
  4:{id:'four',deploy:trainingFourDeployment.create,begin:trainingFourBattle.create,move:trainingFourDeployment.move,act:trainingFourBattle.act,view:trainingFourBattle.view},
};
for(const mission of [fieldMissions[3],fieldMissions[4]]){
  const el=key=>$('training-'+mission.id+'-'+key);
  el('start').onclick=()=>{if(!game.training)mutate(()=>{game.training=mission.deploy()})};
  el('exit').onclick=$('training-exit').onclick;
  el('begin').onclick=()=>{
    try{
      const next=mission.begin(game.training);
      mutate(()=>{game.training=next});setMode('pick');scene?.home();
    }catch(error){toast(error.message)}
  };
  el('zones').onchange=()=>scene?.sync();
  el('sight').onclick=()=>{if(!active)return;setMode('sight');$('hint').textContent='시선을 확인할 다른 모델을 클릭하세요. 전체 보기로 돌아올 수 있습니다.'};
}
function renderFieldMission(state){
  const deployment=state.phase==='deployment',el=k=>$('training-'+fieldMissions[state.scenario].id+'-'+k);
  document.body.classList.toggle('training-deployment',deployment);
  el('setup').hidden=!deployment;el('battle').hidden=deployment;
  const p=shownTable().pieces.find(m=>m.id===active&&!m.removed&&m.faction!=='terrain');
  el('sight').disabled=!p;
  if(state.scenario===4)el('pivots').hidden=!p||(!deployment&&(!state.plan?.ids.includes(p.id)||(state.plan.mode==='charge'&&!state.plan.target)));
  if(!deployment){renderFieldBattle(state);return}
  if(state.scenario===4){
    el('status').textContent=p?p.name+' · '+trainingFourDeploymentArea(p).name:'마린 7기 · 오크 17기 · 득점 거점 3곳';
    return;
  }
  el('status').textContent=p?p.name+' · '+(p.kind==='gretchin'?'그레친':factionNames[p.faction])+' 배치 구역':
    '마린 6명 · 워보스와 보이 11명 · 그레친 5명 · 폐허 4개';
}
function pivotFourth(direction){
  const state=game.training,p=shownTable().pieces.find(m=>m.id===active&&!m.removed&&m.faction!=='terrain');
  if(state?.scenario!==4||!p)return;
  if(state.phase!=='deployment'){
    if(state.plan?.ids.includes(p.id))applyTrainingActions([{type:'pivot',id:p.id,direction}]);
    return;
  }
  try{
    const next=trainingFourDeployment.move(state,p.id,p.x,p.z,(p.yaw+direction*Math.PI/12)%(2*Math.PI));
    mutate(()=>{game.training=next});
  }catch(error){toast(error.message)}
}
$('training-four-left').onclick=()=>pivotFourth(-1);
$('training-four-right').onclick=()=>pivotFourth(1);
function applyTrainingActions(actions){
  try{
    let next=game.training;
    const apply=fieldMissions[next.scenario].act;
    for(const action of actions)next=apply(next,action);
    mutate(()=>{game.training=next});return true;
  }catch(error){toast(error.message);return false}
}
function describeSecondRoll(record){
  const step={...trainingSteps,advance:'전력 이동',charge:'돌격',attacks:'공격 횟수',damage:'피해량',shock:'전장 충격'}[record.step]??record.step;
  if(record.step==='shock')return factionNames[record.actor]+' · '+step+'　'+record.dice.join(' + ')+' / '+record.threshold+'+ · '+(record.successes?'통과':'실패');
  if(record.formula)return factionNames[record.actor]+' '+step+'　'+record.formula+' · 주사위 '+record.dice.join(' · ')+' → '+record.result;
  const result=record.threshold==null?'합계 '+record.dice.reduce((a,b)=>a+b,0)+'″':
    record.threshold+'+ · 성공 '+record.successes+'개';
  return factionNames[record.actor]+' '+step+'　'+record.dice.join(' · ')+'　'+result;
}
function renderFieldBattle(state){
  const mission=fieldMissions[state.scenario],el=name=>$('training-'+mission.id+'-'+name);
  const view=mission.view(state),models=shownTable().pieces;
  const phases={command:'지휘',movement:'이동',shooting:'사격',charge:'돌격',fight:'근접전',ended:'종료'};
  const fightStage={pile:'접근 이동',first:'선제 공격',other:'일반 공격',consolidate:'재정비'};
  el('status').textContent=view.winner?(view.winner==='draw'?'무승부':factionNames[view.winner]+' 승리'):
    view.round+' / 5 라운드 · '+factionNames[view.active]+' 턴 · '+phases[view.phase]+
    (view.fight?' · '+fightStage[view.fight.stage]+' · '+factionNames[view.actor]+' 차례':
      view.phase==='shooting'?' · '+factionNames[view.actor]+' 차례':'');
  const count=f=>models.filter(p=>p.faction===f&&!p.removed).length;
  const totals={2:[6,11],3:[6,16],4:[7,17]}[state.scenario];
  el('forces').textContent='생존　마린 '+count('marines')+' / '+totals[0]+'　·　오크 '+count('orks')+' / '+totals[1];
  let instruction='';
  if(state.scenario===4){
    const control=trainingFourObjectivesView(state,models),box=el('objectives');
    const score=document.createElement('strong');
    score.textContent='승점　오크 '+control.vp.orks+' · 스페이스 마린 '+control.vp.marines;
    const list=document.createElement('ul');
    for(const area of control.areas){
      const row=document.createElement('li');
      row.dataset.area=area.id;row.dataset.marines=area.marines;row.dataset.orks=area.orks;
      const owner=area.controller?factionNames[area.controller]+' 점령':'미점령';
      row.textContent=area.name+' · '+owner+' (OC '+area.orks+' 대 '+area.marines+')';list.append(row);
    }
    box.replaceChildren(score,list);
    if(view.phase==='command')instruction=control.award?
      '한 곳 점령, 두 곳 이상 점령, 상대보다 많이 점령하면 각각 5점입니다. 이번 지휘 단계에 '+control.award.points+'점을 얻습니다.':
      '거점 점수를 계산하기 전에 해당 분대의 전장 충격을 검사하세요.';
  }
  if(view.plan){
    const p=view.plan;
    instruction=p.mode==='charge'&&!p.target?'돌격할 상대 분대를 선택하세요.':
      '기물마다 최대 '+p.limit+'″ 이동할 수 있습니다. 드래그하거나 경로를 지정한 뒤 확정하세요.';
    if(p.ids.includes(active)){
      let distance=0,from=state.poses[active];
      for(const to of p.paths[active]??[]){distance+=Math.hypot(to.x-from.x,to.z-from.z);from=to}
      instruction+=' '+piece(active).name+' · 남은 거리 '+Math.max(0,p.limit-distance).toFixed(2)+'″';
    }
  }else if(view.attack?.stage==='allocate')instruction='방어에 실패했습니다. 피해를 받을 모델을 선택하세요.';
  else if(view.attack?.stage==='select')instruction='공격할 모델의 무기와 상대 분대를 선택하세요.';
  const selected=models.find(p=>p.id===active&&!p.removed&&p.faction!=='terrain');
  if(selected)instruction+=(instruction?'　':'')+selected.name+' · 잔여 '+state.hp[active]+' W';
  const sightings=view.options.filter(a=>a.type==='shoot-sight');
  if(sightings.length)instruction='사수의 시점에서 표적 모델마다 가시성을 선택하세요.';
  el('plan').textContent=instruction;
  const options=el('options');options.replaceChildren();
  function actionButton(action,label=action.label){
    const button=document.createElement('button');button.type='button';button.textContent=label;
    button.dataset.action=action.type;
    for(const key of ['unit','mode','model','target','weapon','id','visibility'])if(action[key]!=null)button.dataset[key]=action[key];
    button.onclick=()=>applyTrainingActions([action]);return button;
  }
  const labels={full:'전체 보임',partial:'일부 보임',none:'안 보임'};
  for(const id of new Set(sightings.map(a=>a.id))){
    const choices=sightings.filter(a=>a.id===id),shooter=choices[0].model;
    const from=models.find(p=>p.id===shooter),target=models.find(p=>p.id===id);
    const row=document.createElement('fieldset'),legend=document.createElement('legend');
    const inRange=view.shooting.visibility.find(v=>v.id===id).range;
    legend.textContent=target.name+' · '+baseDistance(from,target).toFixed(1)+'″ · '+(inRange?'사거리 안':'사거리 밖');row.append(legend);
    const inspect=document.createElement('button');inspect.type='button';inspect.textContent='사수 시점';
    inspect.onclick=()=>{scene?.lookFrom(shooter,id)};row.append(inspect);
    for(const [value,label] of Object.entries(labels)){
      const choice=choices.find(a=>a.visibility===value);
      const button=choice?actionButton(choice,label):document.createElement('button');
      if(!choice){button.type='button';button.disabled=true;button.textContent=label}
      button.setAttribute('aria-pressed',String(!choice));row.append(button);
    }
    options.append(row);
  }
  for(const action of view.options)if(action.type!=='shoot-sight')options.append(actionButton(action));
  el('last').textContent=state.rolls.length?describeSecondRoll(state.rolls.at(-1)):'';
}
function configureLayout(map,blue){
  if(game.rules?.status==='playing'){toast('대전 시작 전 배치 단계에서 지도를 적용하세요.');return false}
  const next=structuredClone(game);
  try{applyLayout(next,map,blue)}catch(error){toast(error.message);return false}
  mutate(()=>game=next,'컴뱃 패트롤 배치 '+map+' · 청색 '+factionNames[blue]);
  reference(false);scene?.home(true);$('camera').textContent='전시 시점';return true;
}
$('apply-map').onclick=()=>configureLayout($('map').value,$('blue').value);
$('roll-map').onclick=()=>{const d=1+Math.floor(Math.random()*6),map='ABC'[Math.floor((d-1)/2)];$('map').value=map;toast('D6 결과 '+d+' · 지도 '+map)};
for(const side of ['left','right'])$('flip-'+side).onclick=async()=>{
  if(!scene)return;
  try{await scene.loadReverse()}catch{toast('뒷면 보드 도안을 열 수 없습니다.');return}
  const other=side==='left'?'right':'left';
  const value=game.surface==='reverse'?other:game.surface===side?'front':game.surface===other?'reverse':side;
  mutate(()=>game.surface=value,(side==='left'?'왼쪽':'오른쪽')+' 보드 뒤집기');
};
$('zones').onchange=()=>scene?.sync();
$('show-map').onclick=()=>{
  const code=$('map').value,image=$('map-image'),diagram=$('map-diagram');
  $('map-title').textContent='컴뱃 패트롤 배치도 '+code;
  function showDiagram(){
    image.hidden=true;diagram.hidden=false;
    drawDeploymentDiagram(diagram,code,$('blue').value,template);
  }
  if(original){
    diagram.hidden=true;image.hidden=false;image.onerror=showDiagram;
    image.src='./reference/maps/'+code+'.webp';
  }else showDiagram();
  $('map-dialog').showModal();
};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
$('search').oninput=roster;$('pick').onclick=()=>setMode('pick');$('ruler').onclick=()=>setMode('ruler');
$('path').onclick=()=>setMode('path');$('back-point').onclick=()=>scene?.backPoint();$('walk').onclick=()=>scene?.walk();
$('undo').onclick=()=>undo();$('redo').onclick=()=>undo(true);$('grid').onclick=()=>{if(scene)$('grid').setAttribute('aria-pressed',scene.toggleGrid())};
$('camera').onclick=()=>{reference(false);if(mode==='sight')setMode('pick');if(scene)$('camera').textContent=scene.top()?'전시 시점':'탑뷰'};
$('home').onclick=()=>{reference(false);if(mode==='sight')setMode('pick');scene?.home();$('camera').textContent='탑뷰'};$('focus').onclick=()=>{reference(false);if(mode==='sight')setMode('pick');scene?.focus(active)};
$('rotate').onclick=rotate;$('remove').onclick=()=>{const p=piece(active);if(p)remove(p.id,!p.removed)};
$('sight').onclick=()=>{reference(false);setMode('sight');$('hint').textContent='시선을 확인할 상대 기물을 클릭하세요.'};
$('studio-view').onclick=()=>{const p=piece(active);if(p)openStudioViewer(p)};
$('elevation').onchange=()=>{const p=piece(active),n=$('elevation').valueAsNumber;if(!p||!Number.isFinite(n))return selection();
  editPose(p,{elevation:Math.min(20,Math.max(0,n))},p.name+' 높이 조정')};
$('save').onclick=()=>{const data=new Blob([JSON.stringify(snapshot(game),null,2)],{type:'application/json'});
  const url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;a.download='armageddon-table.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('load').onclick=()=>$('file').click();
$('file').onchange=async()=>{const file=$('file').files[0];try{if(file){if(file.size>2_000_000)throw Error('저장 파일이 너무 큽니다.');const result=restore(template,JSON.parse(await file.text()));checkpoint();game=result;select(null);changed();toast('전장을 불러왔습니다.')}}catch(e){toast(e.message)}finally{$('file').value=''}};
$('reset').onclick=()=>$('question').showModal();$('question').onclose=()=>{if($('question').returnValue==='yes'){checkpoint();game=fresh();select(null);changed();scene?.home()}};
document.addEventListener('keydown',e=>{if(e.target.closest('input,select,textarea,dialog')||$('question').open)return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey)}
  else if(e.key==='Escape'){setMode('pick');select(null)}
  else if(e.key.toLowerCase()==='r')rotate()});
const api={
  getTable:()=>game,
  reactionCommand(command,choice){
    const result=command==='start'?beginShootingReaction(game,game.rules.shootingReaction,choice):
      command==='finish'?finishShootingReaction(game):declineShootingReaction(game);
    applyMovement(result);
  },
  reinforceCommand(command,unit,mode){
    const result=command==='begin'?beginReinforcement(game,unit,mode):finishReinforcement(game,command==='cancel');
    applyMovement(result);
  },
  fightObjectives,
  beginFightPath(choice){applyMovement(beginFightMove(game,choice,fightObjectives()))},
  finishFightPath(cancel){applyMovement(cancel?cancelFightMove(game):finishFightMove(game,fightObjectives()))},
  chargeCommand(command,actor,targets,takeToSkies){
    const r=game.rules;
    try{
      if(r?.status!=='playing'||r.step!==3)throw Error('돌격 페이즈에서 사용할 수 있습니다.');
      let result;
      if(command==='window'){
        if(r.chargePlan||r.chargeWindow)throw Error('진행 중인 돌격부터 마치세요.');
        result={rules:{...r,chargeWindow:true},message:'아군 돌격 선언 종료 · 상대 반응 기회'};
      }else if(command==='targets')result=selectChargeTargets(game,targets,{takeToSkies});
      else if(command==='rewind')result=rewindCharge(game);
      else if(command==='cancel')result=cancelCharge(game);
      else if(command==='finish')result=finishCharge(game);
      else if(command==='legacy'){
        const flags=actor&&r.units[groupId(r,actor)];
        if(!flags?.charge||flags.charged||flags.chargeTracked||r.chargePlan)throw Error('이전 저장 파일의 진행 중인 돌격이 없습니다.');
        result={rules:changeUnit(r,actor,{charged:true}),message:actor.name+' · 이전 저장의 돌격 이동 완료'};
      }else{
        if(r.chargeWindow&&command==='normal')throw Error('아군 돌격 선언이 끝났습니다.');
        result=beginCharge(game,actor,{mode:command,endOfPhase:!!r.chargeWindow});
      }
      applyMovement(result);return '';
    }catch(e){toast(e.message);return e.message}
  },
  moveCommand(command,actor,options={}){
    try{
      let result;
      if(command==='finish'){
        const plan=game.rules.movePlan;
        result=finishMove(game);
        if(plan?.fallbackMode==='desperate'){
          const members=game.pieces.filter(p=>p.faction!=='terrain'&&groupId(game.rules,p)===plan.unit);
          const test=members.length&&!game.rules.units[plan.unit]?.shocked&&shockTest(game.rules,members);
          if(test){result.rules=changeUnit(result.rules,members[0],{shocked:!test.passed});result.message+=' · 전장 충격 ['+test.dice.join(', ')+'] '+(test.passed?'통과':'실패')}
        }
      }else if(command==='rewind')result=rewindMove(game);
      else if(command==='abandon')result=abandonInvalidMove(game);
      else if(command==='reroll')result=rerollMove(game,actor,roll());
      else{
        result=beginMove(game,actor,command,{...options,advanceRoll:command==='advance'?roll():0});
        if(command==='fallback'&&options.fallbackMode==='desperate'){
          const members=unitMembers(game.rules,game.pieces,actor).filter(p=>!p.removed);
          result.rules={...result.rules,hazard:{reason:'escape',unit:groupId(result.rules,actor),count:members.length}};
        }
      }
      applyMovement(result);return '';
    }catch(error){toast(error.message);return error.message}
  },
  getPieces:()=>game.pieces,getSelection:()=>piece(active)??null,selectPiece:select,
  getObjectiveAreas:()=>objectiveAreas(game),getLayout:()=>game.layout??null,configureLayout,
  isInDeploymentZone:id=>piece(id)&&validDeployment(game,piece(id)),
  onChange(fn){subscribers.add(fn);return ()=>subscribers.delete(fn)},
  getDistance(a,b){const p=piece(a),q=piece(b);return p&&q?Math.hypot(baseDistance(p,q),(p.elevation||0)-(q.elevation||0)):Infinity},
  setRemoved:remove,log(message){log(message);persist();history()},getRulesState:()=>game.rules,
  setRulesState(next){mutate(()=>game.rules=structuredClone(next))},
  commitRules(next,removed={},message=''){mutate(()=>{game.rules=structuredClone(next);for(const [id,value] of Object.entries(removed)){const p=piece(id);if(p)p.removed=!!value}},message)}
};
async function start(){
  original=await findLocalArt();
  if(original)await loadPortraitMap();
  for(const id of ['reference-toggle','appearance'])$(id).hidden=!original;
  redraw();mountRules($('rules'),api);
  scene=await buildScene($('view'),{game:shownTable,template,localArt:!!original,select,checkpoint,zones:()=>game.training?.scenario>=3?$('training-'+fieldMissions[game.training.scenario].id+'-zones').checked:$('zones').checked,
    sightInfo:text=>{$('hint').textContent=text},
    appearance:(on,photo)=>{$('appearance').setAttribute('aria-pressed',String(on));$('appearance').textContent=on?(photo?'사진 기물':'회전 사진'):'3D 조형'},
    progress:(i,n)=>$('stage-load').textContent='미니어처 준비 중 · '+i+' / '+n,
    moving:movingGroup,
    trainingDrag:p=>{const plan=game.training?.plan;
      if(game.training?.phase==='deployment')return p.faction!=='terrain';
      return game.training?.scenario>=2&&plan?.ids.includes(p.id)&&(plan.mode!=='charge'||!!plan.target)},
    route(p,points,drag=false){
      if(game.training?.phase==='deployment'){
        const {x,z}=points.at(-1);
        try{
          const next=fieldMissions[game.training.scenario].move(game.training,p.id,x,z);
          if(next!==game.training)mutate(()=>{game.training=next});
          return true;
        }catch(error){toast(error.message);return false}
      }
      if(game.training?.scenario>=2)return applyTrainingActions(points.slice(1).map(({x,z})=>({type:'path',id:p.id,x,z})));
      if(game.training)return false;
      const group=movingGroup(p).map(m=>({piece:{...m},x:m.x,z:m.z}));let distance=0;
      const paths=Object.fromEntries(group.map(m=>[m.piece.id,[]]));
      for(let i=1;i<points.length;i++){
        const dx=points[i].x-points[i-1].x,dz=points[i].z-points[i-1].z;
        const step=translateFormation(group,dx,dz,game);
        if(Math.abs(Math.hypot(dx,dz)-step)>.015){toast('베이스가 보드 밖으로 나갑니다. 끝점을 조정하세요.');return false}
        for(const m of group){m.x=m.piece.x;m.z=m.piece.z;paths[m.piece.id].push({x:m.x,z:m.z})}distance+=step;
      }
      if(movingByRules(p)){
        try{applyMovement(proposeTableMotion(p,paths))}catch(e){toast(e.message);return false}
      }else mutate(()=>{for(const m of group)Object.assign(piece(m.piece.id),{x:m.x,z:m.z})},p.name+(drag?' 이동':' 경로 이동')+' · '+distance.toFixed(2)+'″ · '+(points.length-1)+'구간');
      return true;
    },
    measure:n=>{if(n===1)$('hint').textContent='두 번째 기물 또는 지점을 선택하세요.';else $('hint').textContent='새 측정의 시작점을 클릭하세요.'}});
  scene.select(active);$('stage-load').hidden=true;persist();
  // Read-only diagnostics for the packaged Windows acceptance check.
  window.tabletopView={stats:()=>scene.stats(),screen:id=>scene.screen(id),pose:id=>scene.pose(id),state:()=>snapshot(game)};
}
function movingGroup(p){return game.training||!$('squad').checked||p.faction==='terrain'?[p]:unitMembers(game.rules??newBattle(),game.pieces,p).filter(m=>!m.removed)}
start().catch(err=>{$('stage-load').textContent='전장을 열지 못했습니다. '+err.message;console.error(err)});
