import {measureFootprints} from '../ruler.mjs';
import {getProfile,unitId} from './profiles.mjs';
import {diceValue,engaged,opposite,roll,weaponSlot,woundThreshold} from './battle.mjs';

const names={captain:'캡틴',intercessor:'인터세서',warboss:'워보스','boy-0':'보이','gretchin':'그레친'};
const fourNames={...names,landSpeeder:'랜드 스피더',wartrakk:'워트랙'};
const unitNames=s=>s.scenario===4?fourNames:names;
const descriptions={full:'완전히 보임',partial:'일부 보임',none:'안 보임'};
const pools={hit:'명중',wound:'상처',save:'방어'};
const option=(type,label,details={})=>({type,...details,label});
const requireRule=(ok,message)=>{if(!ok)throw new Error(message);};
const members=(all,unit)=>all.filter(p=>unitId(p)===unit);
const gap=(p,q)=>Math.hypot(measureFootprints(p,q).horizontal,(p.elevation||0)-(q.elevation||0));
const inRange=(p,q,w)=>gap(p,q)<=w.range+1e-6;
const inCombat=(a,b)=>engaged(a,b,gap(a,b));
const living=(s,pieces)=>pieces.filter(p=>!p.removed&&Object.hasOwn(unitNames(s),unitId(p))&&s.hp[p.id]>0);
const closeWeapon=w=>!!w.pistol;

export function newTrainingShooting(){
  return {stage:'unit',used:[],unit:null,contacts:[],fired:{},visibility:{},shot:null};
}

function targetsFor(all,shooting,p,w){
  // Handbook pp. 64–66 teach the Close-quarters exception. The later lesson
  // retains it without adding the core game's engaged VEHICLE shooting rules.
  if(!w.range||shooting.contacts.length&&!closeWeapon(w))return [];
  const friendly=all.filter(q=>q.faction===p.faction);
  const units=[...new Set(all.filter(q=>q.faction!==p.faction).map(unitId))];
  return units.filter(u=>{
    const models=members(all,u);
    const eligible=shooting.contacts.length?shooting.contacts.includes(u):!models.some(q=>friendly.some(f=>inCombat(f,q)));
    return eligible&&models.some(q=>inRange(p,q,w));
  });
}
function arms(all,shooting){
  const options=[];
  for(const model of members(all,shooting.unit)){
    for(const [i,w] of getProfile(model).weapons.entries()){
      if(!w.range||shooting.fired[model.id]?.includes(weaponSlot(w))||!targetsFor(all,shooting,model,w).length)continue;
      options.push(option('shoot-weapon',model.id+' · '+w.name,{model:model.id,weapon:i}));
    }
  }
  return options;
}
function contacts(all,u){
  const unit=members(all,u);
  return [...new Set(all.filter(q=>q.faction!==unit[0].faction&&unit.some(p=>inCombat(p,q))).map(unitId))];
}
function visibilityFor(all,shooting){
  const shot=shooting.shot,model=all.find(p=>p.id===shot.model),w=getProfile(model).weapons[shot.weapon];
  return members(all,shot.target).map(q=>({id:q.id,range:inRange(model,q,w),visibility:shooting.visibility[model.id]?.[q.id]??null}));
}
function allocationOptions(s,all,target){
  const defenders=members(all,target),injured=defenders.filter(p=>s.hp[p.id]<getProfile(p).wounds);
  return (injured.length?injured:defenders).map(p=>option('shoot-allocate',p.id+'에 피해 배정',{model:p.id}));
}

// Ranges use the attacking and defending bases. A visible model outside the
// selected weapon's range cannot qualify a hidden, closer member of its unit.
export function trainingShootingView(s,pieces){
  if(s.winner||s.phase&&s.phase!=='shooting'||s.scenario&&![3,4].includes(s.scenario))
    return {stage:'inactive',unit:null,actor:null,options:[],visibility:[],shot:null};
  const shooting=s.shooting,all=living(s,pieces),stage=shooting.stage,shot=shooting.shot;
  const labels=unitNames(s);
  const actor=['save','allocate'].includes(stage)?opposite(s.active):s.active;
  let options=[],visibility=[];
  if(stage==='unit'){
    for(const u of Object.keys(labels)){
      const unit=members(all,u);
      if(!unit.length||unit[0].faction!==s.active||shooting.used.includes(u)||['advance','fallback'].includes(s.moved?.[u]))continue;
      if(arms(all,{...shooting,unit:u,contacts:contacts(all,u)}).length)
        options.push(option('shoot-unit',labels[u]+' 사격',{unit:u}));
    }
    options.push(option('shoot-next','사격 페이즈 종료'));
  }else if(stage==='weapon'){
    options=arms(all,shooting);
    options.push(option('shoot-finish',labels[shooting.unit]+' 사격 종료'));
  }else if(stage==='target'){
    const p=all.find(q=>q.id===shot.model),w=getProfile(p).weapons[shot.weapon];
    options=targetsFor(all,shooting,p,w).map(target=>option('shoot-target',labels[target]+'을 표적으로 선택',{target}));
    options.push(option('shoot-back','무기 선택으로'));
  }else if(stage==='sight'){
    visibility=visibilityFor(all,shooting);
    for(const v of visibility)for(const [key,label] of Object.entries(descriptions)){
      if(v.visibility!==key)options.push(option('shoot-sight',v.id+' · '+label,{model:shot.model,id:v.id,visibility:key}));
    }
    if(visibility.every(v=>v.visibility)&&visibility.some(v=>v.range&&v.visibility!=='none'))
      options.push(option('shoot-confirm','표적 확정'));
    options.push(option('shoot-back','다른 표적 선택'));
  }else if(stage==='allocate'){
    options=allocationOptions(s,all,shot.target);
  }else if(stage==='attacks'||stage==='damage'){
    const w=getProfile(all.find(p=>p.id===shot.model)).weapons[shot.weapon];
    const formula=stage==='attacks'?w.attacks:w.damage;
    options=[option('shoot-roll',(stage==='attacks'?'공격 횟수 ':'피해량 ')+formula+' 굴림')];
  }else if(Object.hasOwn(pools,stage)){
    options=[option('shoot-roll',pools[stage]+' D6 × '+shot.count)];
  }
  return {stage,unit:shooting.unit,actor,options,visibility,shot};
}

function finishWeapon(s){
  const sh=s.shooting;
  sh.shot=null;sh.stage='weapon';
}
function applyDamage(s,all,id,value){
  const sh=s.shooting,shot=sh.shot;
  s.hp[id]=Math.max(0,s.hp[id]-value);
  delete shot.allocated;
  if(!--shot.count||!members(all,shot.target).some(p=>s.hp[p.id]>0))finishWeapon(s);
  else sh.stage='allocate';
}
function readDie(d6){
  const value=d6();requireRule(Number.isInteger(value)&&value>=1&&value<=6,'사격 D6 범위를 확인하세요.');
  return value;
}
function rollPool(s,all,d6,rolls){
  const sh=s.shooting,a=sh.shot,stage=sh.stage,p=all.find(q=>q.id===a.model);
  const w=getProfile(p).weapons[a.weapon],defenders=members(all,a.target);
  const t=getProfile(defenders[0]);
  if(stage==='attacks'||stage==='damage'){
    const formula=stage==='attacks'?w.attacks:w.damage;
    const bonus=stage==='attacks'?a.extraAttacks||0:a.halfRange?w.melta||0:0;
    // A physical D3 uses D6 faces 1–2, 3–4 and 5–6. Preserve that raw D6
    // in the replay while letting the shared parser evaluate the expression.
    const die=readDie(d6),result=diceValue(formula,()=>(die-.5)/6)+bonus;
    rolls.push({unit:sh.unit,actor:s.active,step:stage,dice:[die],formula,bonus,result});
    if(stage==='attacks'){
      a.count=result;sh.stage=w.torrent?'wound':'hit';
    }else applyDamage(s,all,a.allocated,result);
    return;
  }
  let threshold=stage==='hit'?Math.min(6,w.skill+Number(a.cover)):stage==='wound'?
    woundThreshold(w.strength,Math.max(...defenders.map(q=>getProfile(q).toughness))):Math.min(t.save-w.ap,t.invul||Infinity);
  if(s.scenario===4&&stage==='wound'&&w.antiVehicle&&defenders.some(q=>q.kind==='landSpeeder'))
    threshold=Math.min(threshold,w.antiVehicle);
  const dice=Array.from({length:a.count},()=>readDie(d6));
  const successes=dice.filter(d=>d!==1&&d>=threshold).length;
  rolls.push({unit:sh.unit,actor:stage==='save'?opposite(s.active):s.active,step:stage,dice,threshold,successes});
  a.count=stage==='save'?a.count-successes:successes;
  if(!a.count)finishWeapon(s);else sh.stage=stage==='hit'?'wound':stage==='wound'?'save':'allocate';
}

const fields=['type','unit','model','weapon','target','id','visibility'];
function selected(options,action){
  return options.find(o=>fields.every(k=>o[k]===action[k]));
}
export function applyTrainingShooting(state,pieces,action,d6=()=>roll(6)){
  const view=trainingShootingView(state,pieces);
  requireRule(selected(view.options,action),'지금 선택할 수 없는 사격 행동입니다.');
  const s={...state,hp:{...state.hp},shooting:structuredClone(state.shooting)};
  const sh=s.shooting,all=living(s,pieces),shot=sh.shot,rolls=[];
  switch(action.type){
    case 'shoot-unit':
      sh.unit=action.unit;sh.contacts=contacts(all,sh.unit);sh.stage='weapon';break;
    case 'shoot-weapon':
      sh.shot={model:action.model,weapon:action.weapon};sh.stage='target';break;
    case 'shoot-target':
      shot.target=action.target;sh.stage='sight';break;
    case 'shoot-sight':
      sh.visibility[shot.model]={...sh.visibility[shot.model],[action.id]:action.visibility};break;
    case 'shoot-back':
      if(sh.stage==='sight'){delete shot.target;sh.stage='target';}else finishWeapon(s);
      break;
    case 'shoot-confirm': {
      const p=all.find(q=>q.id===shot.model),w=getProfile(p).weapons[shot.weapon];
      shot.cover=view.visibility.every(v=>v.visibility!=='full');
      let extra=0;
      if(s.scenario===4){
        // Measure the unit at target selection, before casualties can change its distance.
        const target=members(all,shot.target);
        if(w.rapid||w.melta)shot.halfRange=target.some(q=>gap(p,q)<=w.range/2+1e-6);
        extra=(shot.halfRange?w.rapid||0:0)+Math.floor(target.length/5)*(w.blast||0);
      }
      sh.fired[shot.model]=[...(sh.fired[shot.model]??[]),weaponSlot(w)];
      if(Number.isInteger(w.attacks)){
        shot.count=w.attacks+extra;sh.stage=w.torrent?'wound':'hit';
      }else{
        if(extra)shot.extraAttacks=extra;
        sh.stage='attacks';
      }
      break;
    }
    case 'shoot-roll':
      rollPool(s,all,d6,rolls);break;
    case 'shoot-allocate': {
      const w=getProfile(all.find(p=>p.id===shot.model)).weapons[shot.weapon];
      if(Number.isInteger(w.damage))applyDamage(s,all,action.model,w.damage+(shot.halfRange?w.melta||0:0));
      else {shot.allocated=action.model;sh.stage='damage';}
      break;
    }
    case 'shoot-finish': {
      const used=[...sh.used,sh.unit];
      s.shooting={...newTrainingShooting(),used};break;
    }
    case 'shoot-next':
      sh.stage='done';break;
  }
  return {shooting:s.shooting,hp:s.hp,rolls,finished:s.shooting.stage==='done'};
}
