import {createTable} from '../data/catalog.mjs';
import {groupId} from './battle.mjs';
import {enhancements} from './patrol.mjs';
import {getProfile,unitId} from './profiles.mjs';
import {attachForDeployment} from './reinforcement-session.mjs';
import {reserveCapacity} from './reinforcements.mjs';

// Combat Patrol Mission step 5, Warhammer 40,000: The App v2.7.1 (Oct 2026):
// https://wahapedia.ru/wh40k11ed_cp/the-rules/combat-patrol-mission/#Declare-Battle-Formations
// Neither starter patrol fields a Transport. The local
// handoff orders input only. Both patrols' choices take effect together.
const sides=['marines','orks'];
const stages=['marines','handoff','orks','revealed'];
const starterPieces=createTable().pieces;
const blankDraft=()=>({attachments:{},reserves:[],enhancement:null});

export function newPatrolFormations(){
  return {stage:'marines',drafts:{marines:blankDraft(),orks:blankDraft()}};
}

function plain(value){
  return value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
}
function fields(value,keys){
  return plain(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
}

function projectDraft(team,draft,pieces){
  let rules={status:'setup',attachments:{},reserves:{}};
  const members=pieces.filter(p=>p.faction===team&&getProfile(p));
  for(const [id,bodyguard] of Object.entries(draft.attachments)){
    const leader=members.find(p=>p.id===id);
    if(!leader||!bodyguard||!members.some(p=>unitId(p)===bodyguard))throw Error('합류 대상이 편성에 없습니다.');
    rules=attachForDeployment({rules,pieces},leader,bodyguard).rules;
  }
  const groups=Object.create(null);
  for(const p of members)(groups[groupId(rules,p)]??=[]).push(p);
  for(const key of draft.reserves){
    if(!Object.hasOwn(groups,key)||Object.hasOwn(rules.reserves,key))throw Error('예비대 분대를 확인하세요.');
    rules.reserves[key]=groups[key].map(p=>p.id);
  }
  const capacity=reserveCapacity({rules,pieces},team);
  if(capacity.reserved>capacity.maximum)throw Error('최종 편성 분대의 절반까지만 예비대로 지정할 수 있습니다.');
  return {rules,groups,capacity};
}

function validDraft(team,draft){
  if(!fields(draft,['attachments','reserves','enhancement'])||!plain(draft.attachments)||
    !Array.isArray(draft.reserves)||draft.reserves.length>3||!draft.reserves.every(key=>typeof key==='string')||
    !Object.values(draft.attachments).every(key=>typeof key==='string')||
    !(draft.enhancement===null||typeof draft.enhancement==='string'&&Object.hasOwn(enhancements,draft.enhancement)&&enhancements[draft.enhancement][0]===team))return false;
  try{projectDraft(team,draft,starterPieces);return true;}catch{return false;}
}

export function validPatrolFormations(f){
  if(!fields(f,['stage','drafts'])||!stages.includes(f.stage)||!fields(f.drafts,sides)||
    !sides.every(team=>validDraft(team,f.drafts[team])))return false;
  const {marines,orks}=f.drafts;
  if(f.stage!=='marines'&&!marines.enhancement)return false;
  if(['marines','handoff'].includes(f.stage)&&(orks.enhancement||Object.keys(orks.attachments).length||orks.reserves.length))return false;
  return f.stage!=='revealed'||!!orks.enhancement;
}

export function patrolFormationOptions(f,pieces,team){
  if(!sides.includes(team)||f.stage!==team&&f.stage!=='revealed')throw Error('현재 편성할 진영을 확인하세요.');
  const draft=f.drafts[team];
  const {rules,groups,capacity}=projectDraft(team,draft,pieces);
  const leaders=[];
  // Ask the deployment rule for eligible pairings and for reserve changes
  // caused by reassigning a leader. This also excludes a second leader.
  for(const leader of pieces.filter(p=>p.faction===team&&['librarian','warboss','weirdboy'].includes(p.kind))){
    const eligible=[];
    for(const unit of ['',...Object.keys(groups)]){
      try{attachForDeployment({rules,pieces},leader,unit);eligible.push(unit);}catch{}
    }
    leaders.push({id:leader.id,name:leader.name,eligible});
  }
  return {draft,groups,capacity,leaders};
}

function reveal(state,pieces,formations){
  const attachments={},reserves={},enhanced={};
  for(const team of sides){
    const draft=formations.drafts[team];
    const projection=projectDraft(team,draft,pieces).rules;
    Object.assign(attachments,projection.attachments);
    Object.assign(reserves,projection.reserves);
    enhanced[draft.enhancement]=true;
  }
  const removed=Object.fromEntries(Object.values(state.reserves??{}).flat().map(id=>[id,false]));
  for(const id of Object.values(reserves).flat())removed[id]=true;
  return {rules:{...state,formations,attachments,reserves,patrol:{...state.patrol,enhanced}},removed,complete:true,message:'두 진영의 전투 편성 공개'};
}

export function actPatrolFormation(state,pieces,action){
  const f=state.formations;
  if(state.status!=='setup'||!validPatrolFormations(f)||f.stage==='revealed')throw Error('편성을 편집할 수 없습니다.');
  const {act,team}=action;
  const next=formations=>({rules:{...state,formations},removed:{},complete:false,message:'비공개 편성 갱신'});
  if(f.stage==='handoff'){
    if(team!=='orks'||act!=='form-open')throw Error('오크 플레이어에게 기기를 넘겨 주세요.');
    return next({...f,stage:'orks'});
  }
  if(f.stage!==team)throw Error('현재 편성하는 진영을 확인하세요.');
  const draft=f.drafts[team];
  if(act==='form-lock'){
    if(!draft.enhancement)throw Error('패트롤 강화 하나를 선택하세요.');
    if(team==='marines')return next({...f,stage:'handoff'});
    return reveal(state,pieces,{...f,stage:'revealed'});
  }
  let edit;
  if(act==='form-enhance'){
    if(typeof action.enhancement!=='string'||!Object.hasOwn(enhancements,action.enhancement)||enhancements[action.enhancement][0]!==team)throw Error('이 패트롤의 강화를 선택하세요.');
    edit={...draft,enhancement:action.enhancement};
  }else if(act==='form-reserve'){
    const {groups}=projectDraft(team,draft,pieces);
    if(typeof action.unit!=='string'||!Object.hasOwn(groups,action.unit))throw Error('예비대를 지정할 분대를 선택하세요.');
    edit={...draft,reserves:draft.reserves.includes(action.unit)?draft.reserves.filter(key=>key!==action.unit):[...draft.reserves,action.unit]};
    projectDraft(team,edit,pieces);
  }else if(act==='form-attach'){
    const leader=pieces.find(p=>p.id===action.leader&&p.faction===team);
    const {rules,groups}=projectDraft(team,draft,pieces);
    if(!leader||typeof action.unit!=='string'||action.unit&&!Object.hasOwn(groups,action.unit))throw Error('합류할 분대를 선택하세요.');
    const result=attachForDeployment({rules,pieces},leader,action.unit);
    edit={...draft,attachments:result.rules.attachments,reserves:Object.keys(result.rules.reserves)};
  }else throw Error('편성 동작을 확인하세요.');
  return next({...f,drafts:{...f.drafts,[team]:edit}});
}
