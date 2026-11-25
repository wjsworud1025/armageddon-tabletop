import {createTable} from './data/catalog.mjs';
import {drawDeploymentDiagram} from './data/deployment-diagram.mjs';
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
  for(const side of ['left','right'])$('flip-'+side).setAttribute('aria-pressed',String(game.surface===side||game.surface==='reverse'));
  $('apply-map').disabled=game.rules?.status==='playing';$('map-status').textContent=game.layout?'배치 '+game.layout.map+' · 청색 '+factionNames[game.layout.blue]:'제품 사진 배치';notify()}
function changed(){persist();redraw()}
function mutate(fn,message){checkpoint();fn();log(message);changed()}
function select(id){active=piece(id)?.id??null;scene?.select(active);roster();selection();notify()}
function history(){const list=$('log');list.replaceChildren();for(const entry of [...game.logs].reverse()){const li=document.createElement('li');li.textContent=entry;list.append(li)}}
function selection(){
  const p=piece(active);$('selection').hidden=!p;$('sight-tools').hidden=!p||p.removed||p.faction==='terrain';
  $('studio-tools').hidden=!original||!p||!studioGroupFor(p);if(!p)return;
  $('piece-name').textContent=p.name;
  $('piece-spec').textContent=factionNames[p.faction]+' · '+(p.faction==='terrain'?'지면 점유 폭':'베이스')+' '+Math.round(p.baseWidth*25.4)+' × '+Math.round(p.baseDepth*25.4)+' mm';
  const inReserve=Object.values(game.rules?.reserves??{}).some(ids=>ids.includes(p.id));
  $('elevation').value=p.elevation||0;
  $('remove').disabled=inReserve||!!(game.rules?.reinforcePlan||game.rules?.shootingReaction||game.rules?.reactionPlan);
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
  if(movingByRules(p)){
    try{applyMovement(proposeTableMotion(p,{[p.id]:[delta]}))}catch(e){toast(e.message);selection()}
  }else mutate(()=>{Object.assign(p,delta);place(p,p.x,p.z,game)},message);
}
function rotate(){const p=piece(active);if(p)editPose(p,{yaw:(p.yaw+Math.PI/12)%(2*Math.PI)},p.name+' 15° 회전')}
function remove(id,removed){const p=piece(id);
  if(game.rules?.shootingReaction||game.rules?.reactionPlan){toast('현재 사격 반응을 먼저 마치세요.');return}
  if(game.rules?.reinforcePlan || p&&game.rules?.reserves?.[groupId(game.rules,p)]?.includes(id)){
    toast('예비대는 대전 탭에서 배치하거나 복귀시키세요.');return;
  }
  if(p&&!!p.removed!==!!removed)mutate(()=>{
  p.removed=!!removed;
  if(!removed && game.rules?.hp?.[id]===0)game.rules.hp[id]=getProfile(p)?.wounds??1;
},p.name+(removed?' 제거':' 복귀'))}
function switchTab(name){document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===name)));for(const id of ['roster','battle','history'])$(id).hidden=id!==name}
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
  scene=await buildScene($('view'),{game:()=>game,template,localArt:!!original,select,checkpoint,zones:()=>$('zones').checked,
    sightInfo:text=>{$('hint').textContent=text},
    appearance:(on,photo)=>{$('appearance').setAttribute('aria-pressed',String(on));$('appearance').textContent=on?(photo?'사진 기물':'회전 사진'):'3D 조형'},
    progress:(i,n)=>$('stage-load').textContent='미니어처 준비 중 · '+i+' / '+n,
    moving:movingGroup,
    route(p,points,drag=false){
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
  window.tabletopView={stats:()=>scene.stats(),screen:id=>scene.screen(id),state:()=>snapshot(game)};
}
function movingGroup(p){return !$('squad').checked||p.faction==='terrain'?[p]:unitMembers(game.rules??newBattle(),game.pieces,p).filter(m=>!m.removed)}
start().catch(err=>{$('stage-load').textContent='전장을 열지 못했습니다. '+err.message;console.error(err)});
