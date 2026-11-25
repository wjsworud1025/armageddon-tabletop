import {profiles,getProfile,unitId} from './profiles.mjs';
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
const identifier = value => string(value) && /^[a-zA-Z][a-zA-Z0-9-]{0,59}$/.test(value) && !['constructor','prototype'].includes(value);
const hp = map(model,(n,id)=>int(0,getProfile(models.get(id)).wounds)(n));
const totals = fields({marines:int(0),orks:int(0)},['marines','orks']);
const attacks = map(model,list(fields({slot:string,ranged:boolean,pistol:boolean},['slot','ranged']),6));
const attackStep=oneOf([2,4]);
const hazardFields=fields({unit:group,count:int(1,276),dice:list(int(1,6),276),remaining:int(1,828)},['unit','count']);
const hazard=value=>hazardFields(value) && (value.dice===undefined
  ? value.remaining===undefined
  : value.dice.length===value.count && int(1,value.dice.filter(d=>d<=2).length*3)(value.remaining));
const unit = fields({
  shocked:boolean,shockChecked:boolean,movement:oneOf(['normal','advance','fallback','remain']),
  order:string,charge:int(0,12),charged:boolean,rerolled:boolean,attacks,finishedAttack:attackStep,
  counterCharge:boolean,reaction:boolean,shotAt:boolean,suppressedEnemy:boolean,hitTargets:list(group,12)
});
const doctrine=oneOf(Object.keys(doctrines)),tactic=oneOf(Object.keys(tactics));
const patrol=fields({
  doctrine:nullable(doctrine),usedDoctrines:list(doctrine,3),waaagh:int(0,2),waaaghUsed:boolean,
  enhanced:map(oneOf(Object.keys(enhancements)),boolean),tactics:map(tactic,string),spent:map(tactic,string),
  suppressed:nullable(group),warcryUsed:boolean,grotReturned:boolean
});
const objective=fields({name:string,home:nullable(team),owner:nullable(team),secured:nullable(team),
  marineOC:int(0),orkOC:int(0)},['owner','marineOC','orkOC']);
const battle=fields({
  version:oneOf([1]),status:oneOf(['setup','playing','finished']),first:team,active:team,
  round:int(1,20),rounds:int(1,20),step:int(0,5),cp:totals,vp:totals,hp,
  units:map(group,unit),attachments:map(model,group),objectives:map(identifier,objective),hazard:nullable(hazard),
  reserves:map(group,list(model,46)),patrol,notes:string,mission:string,last:string,
  deployment:fields({defender:team,next:team,placed:list(group,12)},['defender','next','placed']),
  destroyedUnits:map(group,boolean),lossEvents:list(fields({id:group,faction:team,turn:int(1,40)},['id','faction','turn']),20000)
},['version','status','first','active','round','rounds','step']);

export function validateRulesState(value) {
  if (value==null) return true;
  if (fields({hp},['hp'])(value)) return true;
  return battle(value) && value.round<=value.rounds && (!value.hazard ||
    (value.status==='playing' && attackStep(value.step)));
}
