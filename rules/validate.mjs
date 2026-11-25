import {profiles,getProfile,unitId} from './profiles.mjs';
import {validFightSequence} from '../fight-sequence.mjs';
import {doctrines,enhancements,tactics} from './patrol.mjs';

const boolean = value => typeof value === 'boolean';
const string = value => typeof value === 'string';
const int = (min,max=Number.MAX_SAFE_INTEGER) => value => Number.isSafeInteger(value) && value>=min && value<=max;
const oneOf = values => value => values.includes(value);
const team = oneOf(['marines','orks']);
const nullable = check => value => value===null || check(value);
const list = (check,max) => value => Array.isArray(value) && value.length<=max && value.every(check);
const plain = value => value!==null && typeof value==='object' && [Object.prototype,null].includes(Object.getPrototypeOf(value));
const map = (keyCheck,itemCheck) => value => plain(value) && Object.entries(value).every(([key,item])=>keyCheck(key) && itemCheck(item,key));
const fields = (schema,required=[]) => value => plain(value) && required.every(k=>Object.hasOwn(value,k)) &&
  Object.entries(value).every(([key,item])=>Object.hasOwn(schema,key) && schema[key](item));
const count = {intercessor:5,vanguard:5,boy:20,gretchin:10};
const models=new Map(),groups=new Set();
for (const kind of Object.keys(profiles)) for(let i=0;i<(count[kind]||1);i++) {
  const piece={kind,variant:i};
  models.set(kind+'-'+(i+1),piece);
  groups.add(unitId(piece));
}
const model = value => models.has(value);
const group = value => groups.has(value);
const faction=id=>['captain','librarian','intercessor','vanguard','landSpeeder'].includes(models.get(id).kind)?'marines':'orks';
const identifier = value => string(value) && /^[a-zA-Z][a-zA-Z0-9-]{0,59}$/.test(value) && !['constructor','prototype'].includes(value);
const hp = map(model,(n,id)=>int(0,getProfile(models.get(id)).wounds)(n));
const totals = fields({marines:int(0),orks:int(0)},['marines','orks']);
const attacks = map(model,list(fields({slot:string,ranged:boolean,pistol:boolean},['slot','ranged']),6));
const attackStep=oneOf([2,4]);
const hazardFields=fields({unit:group,reason:oneOf(['escape']),count:int(1,276),dice:list(int(1,6),276),remaining:int(1,828)},['unit','count']);
const hazard=value=>hazardFields(value) && (value.dice===undefined
  ? value.remaining===undefined
  : value.dice.length===value.count && int(1,value.dice.filter(d=>d<=2).length*3)(value.remaining));
const rowFields={
  actor:model,weapon:int(0,8),target:group,preferred:model,distance:n=>Number.isFinite(n)&&n>=0&&n<=200,
  size:int(1,46),assigned:int(0,45),hit:int(-2,1),wound:int(-2,1),extra:int(0,30),
  cover:boolean,lethal:boolean,sustained:boolean,ignore:boolean,guard:boolean,done:boolean
};
const validRow=fields({...rowFields,vehiclePenalty:int(0,2)},Object.keys(rowFields));
const declaration=fields({unit:group,locked:boolean,focus:nullable(group),rows:list(validRow,276)},['unit','locked','focus','rows']);
const unit = fields({
  shocked:boolean,shockChecked:boolean,reinforcing:boolean,movementTracked:boolean,movement:oneOf(['normal','advance','fallback','remain']),
  order:string,charge:int(0,12),chargeTracked:boolean,charged:boolean,rerolled:boolean,attacks,finishedAttack:attackStep,
  counterCharge:boolean,reaction:boolean,fightsFirst:boolean,shotAt:boolean,suppressedEnemy:boolean,hitTargets:list(group,12)
});
const doctrine=oneOf(Object.keys(doctrines)),tactic=oneOf(Object.keys(tactics));
const patrol=fields({
  doctrine:nullable(doctrine),usedDoctrines:list(doctrine,3),waaagh:int(0,2),waaaghUsed:boolean,
  enhanced:map(oneOf(Object.keys(enhancements)),boolean),tactics:map(oneOf([...Object.keys(tactics),'heroicIntervention']),string),spent:map(oneOf([...Object.keys(tactics),'heroicIntervention']),string),
  suppressed:nullable(group),warcryUsed:boolean,grotReturned:boolean
});
const objective=fields({name:string,home:nullable(team),owner:nullable(team),secured:nullable(team),
  marineOC:int(0),orkOC:int(0)},['owner','marineOC','orkOC']);
const pose=fields({x:Number.isFinite,z:Number.isFinite,elevation:n=>Number.isFinite(n)&&n>=0&&n<=20,yaw:Number.isFinite},['x','z','elevation','yaw']);
const chargeFields={unit:group,actor:model,mode:oneOf(['normal','masterOfBattle','leapToDefend','intoTheFray']),
  roll:int(2,12),dice:list(int(1,6),2),targets:list(group,12),origins:map(model,pose),paths:map(model,list(pose,512)),takeToSkies:boolean};
const chargePlan=fields(chargeFields,Object.keys(chargeFields));
const fightFields={unit:group,type:oneOf(['pile-in','consolidate']),mode:oneOf(['pile-in','ongoing','engaging','objective']),
  targets:list(identifier,16),origins:map(model,pose),paths:map(model,list(pose,512))};
const fightPlan=fields(fightFields,Object.keys(fightFields));
const movePlan=fields({unit:group,type:oneOf(['advance','normal','fallback']),advanceRoll:int(0,6),
  origins:map(model,pose),paths:map(model,list(pose,512)),takeToSkies:boolean,fallbackMode:oneOf(['ordered','desperate']),
  desperateEscapeResolved:boolean,rerollClosed:boolean},['unit','type','advanceRoll','origins','paths','takeToSkies','fallbackMode','desperateEscapeResolved']);
const battle=fields({
  version:oneOf([1]),status:oneOf(['setup','playing','finished']),first:team,active:team,
  round:int(1,20),rounds:int(1,20),step:int(0,5),cp:totals,vp:totals,hp,
  units:map(group,unit),attachments:map(model,group),objectives:map(identifier,objective),hazard:nullable(hazard),declaration:nullable(declaration),movePlan:nullable(movePlan),chargePlan:nullable(chargePlan),chargeWindow:boolean,
  fightSequence:validFightSequence,fightPlan:nullable(fightPlan),
  reinforcePlan:nullable(fields({unit:group,mode:oneOf(['edge','deep-strike']),origins:map(model,pose)},['unit','mode','origins'])),
  reserves:map(group,list(model,46)),patrol,notes:string,mission:string,last:string,
  deployment:fields({defender:team,next:team,placed:list(group,12)},['defender','next','placed']),
  destroyedUnits:map(group,boolean),lossEvents:list(fields({id:group,faction:team,turn:int(1,40)},['id','faction','turn']),20000)
},['version','status','first','active','round','rounds','step']);

export function validateRulesState(value) {
  if (value==null) return true;
  if (fields({hp},['hp'])(value)) return true;
  if(!battle(value) || value.round>value.rounds)return false;
  if(value.reinforcePlan){
    const p=value.reinforcePlan,ids=Object.keys(p.origins),waiting=value.reserves?.[p.unit];
    return value.status==='playing'&&value.step===1&&value.round>=2&&!value.movePlan&&!value.chargePlan&&!value.fightPlan&&!value.fightSequence&&!value.declaration&&!value.hazard&&
      !!waiting?.length&&waiting.length===ids.length&&ids.every(id=>waiting.includes(id)&&faction(id)===value.active&&
        (value.hp?.[id]??1)>0&&(value.attachments?.[id]||unitId(models.get(id)))===p.unit)&&
      (p.mode==='edge'||p.unit==='gretchin'&&value.patrol?.grotReturned===true);
  }
  if(value.fightSequence&&(value.status!=='playing'||value.step!==4))return false;
  if(value.fightPlan){
    const p=value.fightPlan,ids=Object.keys(p.origins),seq=value.fightSequence;
    if(!seq||seq.reactions.length&&!seq.active?.extraPile)return false;
    const correctStage=seq.active?seq.active.extraPile&&seq.active.unit===p.unit&&p.type==='pile-in':
      seq.stage===(p.type==='pile-in'?'pile':'consolidate');
    const validTargets=p.mode==='objective'?p.targets.length===1&&['blue-home','red-home','neutral-1','neutral-2'].includes(p.targets[0]):
      p.targets.every(id=>group(id)&&id!==p.unit);
    return correctStage&&validTargets&&!value.chargePlan&&!value.movePlan&&!value.hazard&&!value.declaration&&
      ids.length>0&&p.targets.length>0&&new Set(p.targets).size===p.targets.length&&
      (p.mode==='pile-in')===(p.type==='pile-in')&&ids.every(id=>(value.attachments?.[id]||unitId(models.get(id)))===p.unit)&&
      Object.keys(p.paths).every(id=>ids.includes(id));
  }
  if(value.chargePlan){
    const p=value.chargePlan,ids=Object.keys(p.origins),sum=p.dice.reduce((a,b)=>a+b,0);
    const expected=['masterOfBattle','intoTheFray'].includes(p.mode)?Math.min(sum,6):sum;
    return value.step===3&&value.status==='playing'&&!value.declaration&&!value.hazard&&!value.movePlan&&
      ids.includes(p.actor)&&ids.every(id=>(value.attachments?.[id]||unitId(models.get(id)))===p.unit)&&
      p.dice.length===2&&p.roll===expected&&value.units?.[p.unit]?.charge===p.roll&&
      new Set(p.targets).size===p.targets.length&&!p.targets.includes(p.unit)&&Object.keys(p.paths).every(id=>ids.includes(id));
  }
  if(value.movePlan){
    const m=value.movePlan,ids=Object.keys(m.origins);
    if(value.step!==1||value.status!=='playing'||value.declaration||!ids.length||value.units?.[m.unit]?.movement!==m.type||
      !ids.every(id=>(value.attachments?.[id]||unitId(models.get(id)))===m.unit)||
      !Object.keys(m.paths).every(id=>ids.includes(id))||(m.type==='advance'?m.advanceRoll<1:m.advanceRoll!==0))return false;
    const escaping=m.type==='fallback'&&m.fallbackMode==='desperate'&&!m.desperateEscapeResolved;
    if(escaping)return value.hazard?.reason==='escape'&&value.hazard.unit===m.unit&&value.hazard.count===ids.length;
    return !value.hazard;
  }
  if(value.hazard?.reason==='escape')return false;
  if(!value.hazard && !value.declaration)return true;
  if(value.status!=='playing'||!attackStep(value.step))return false;
  const plan=value.declaration;
  if(!plan)return true;
  if(value.hazard||!plan.rows.length||!plan.rows.some(r=>!r.done)||(!plan.locked&&plan.rows.some(r=>r.done)))return false;
  const modelGroup=id=>value.attachments?.[id]||unitId(models.get(id));
  if(plan.focus && (!plan.locked||!plan.rows.some(r=>r.target===plan.focus&&!r.done)))return false;
  return plan.rows.every(r=>{
    const weapon=getProfile(models.get(r.actor)).weapons[r.weapon];
    return weapon && !!weapon.range===(value.step===2) && modelGroup(r.actor)===plan.unit && modelGroup(r.preferred)===r.target &&
      faction(r.actor)!==faction(r.preferred) && (value.step!==2 || faction(r.actor)===value.active) &&
      (weapon.range?r.assigned===0:r.assigned>=1&&r.assigned<=weapon.attacks+r.extra);
  });
}
