import {inspectAttackRoll} from './attack-rolls.mjs';
import {profiles,getProfile,unitId} from './profiles.mjs';
import {validFightSequence} from '../fight-sequence.mjs';
import {doctrines,enhancements,tactics,effectWeapon} from './patrol.mjs';
import {canCommandReroll} from './command-reroll.mjs';
import {validatePatrolSetup,patrolSetupView,patrolTerrainPiece} from './patrol-setup.mjs';
import {validPatrolFormations} from './patrol-formations.mjs';
import {createTable} from '../data/catalog.mjs';
import {patrolSightTarget,sightBoardMatches,sightHP} from './patrol-sight.mjs';
import {plungingFireAtDeclaration} from './declarations.mjs';
import {patrolAreaCover} from './patrol-area-cover.mjs';
import {overwatchUnits,overwatchUnitReady,overwatchTargetEligible} from './overwatch.mjs';
import {weaponSlot} from './battle.mjs';
import {playerTurnNumber} from './ranged-history.mjs';

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
const catalog=new Map(createTable().pieces.map(p=>[p.id,p]));
const sightPose=value=>Array.isArray(value)&&value.length===6&&value.slice(0,4).every(Number.isFinite)&&
  value[2]>=0&&value[2]<=20&&boolean(value[4])&&(value[5]===null||int(0,100)(value[5]));
const sightPairs=map(model,map(model,oneOf(['visible','blocked'])));
const sightBoard=map(id=>catalog.has(id),sightPose);
const shootingSight=fields({round:int(1,20),active:team,board:sightBoard,pairs:sightPairs},
  ['round','active','board','pairs']);
const groupTeam=key=>['captain','librarian','intercessor','vanguard','landSpeeder'].includes(key)?'marines':'orks';
const faction=id=>groupTeam(models.get(id).kind);
const identifier = value => string(value) && /^[a-zA-Z][a-zA-Z0-9-]{0,59}$/.test(value) && !['constructor','prototype'].includes(value);
const hp = map(model,(n,id)=>int(0,getProfile(models.get(id)).wounds)(n));
const totals = fields({marines:int(0),orks:int(0)},['marines','orks']);
const attacks = map(model,list(fields({slot:string,ranged:boolean,pistol:boolean},['slot','ranged']),6));
const attackStep=oneOf([2,4]);
const hazardDice=list(int(1,6),276);
const hazardFields=fields({unit:group,reason:oneOf(['escape']),count:int(1,276),dice:hazardDice,commandDice:hazardDice,remaining:int(1,828)},['unit','count']);
const hazard=value=>hazardFields(value) && (value.dice===undefined
  ? value.remaining===undefined&&(!value.commandDice||value.commandDice.length===value.count)
  : !value.commandDice&&value.dice.length===value.count && int(1,value.dice.filter(d=>d<=2).length*3)(value.remaining));
const rowFields={
  actor:model,weapon:int(0,8),target:group,preferred:model,distance:n=>Number.isFinite(n)&&n>=0&&n<=200,
  size:int(1,46),assigned:int(0,45),hit:int(-2,1),wound:int(-2,1),extra:int(0,30),
  cover:boolean,lethal:boolean,sustained:boolean,ignore:boolean,guard:boolean,done:boolean
};
const validRow=fields({...rowFields,vehiclePenalty:int(0,2),plunging:boolean,plungingVisible:list(model,46),
  manualCover:boolean,areaCover:boolean,coverReview:oneOf([true])},Object.keys(rowFields));
const diceArray=list(int(1,6),40000);
const precisionRoll=fields({index:int(0,275),count:int(1,20000),hits:int(1,40000),wounds:int(1,40000),
  hitDice:diceArray,woundDice:diceArray,devastating:int(0,40000)},['index','count','hits','wounds','hitDice','woundDice','devastating']);
const attackRecord=fields({kind:oneOf(['attacks','hit','wound','save','damage','model','order','precision']),
  raw:diceArray,closed:oneOf([true]),choice:nullable(model),
  change:fields({index:int(0,39999),value:int(1,6)},['index','value'])},['kind']);
const attackRoll=fields({index:int(0,275),preferred:model,records:list(attackRecord,500)},['index','preferred','records']);
const declaration=fields({unit:group,mode:oneOf(['overwatch']),locked:boolean,didShoot:boolean,didFight:boolean,focus:nullable(group),rows:list(validRow,276),precisionRoll,attackRoll,
  detectionMap:oneOf(['A','B','C']),
  coverBoard:v=>sightBoard(v)&&Object.keys(v).length===catalog.size},['unit','locked','focus','rows']);
const characterId=oneOf(['captain-1','librarian-1','warboss-1','weirdboy-1']);
const unit = fields({
  shocked:boolean,shockChecked:boolean,epicChallengeModel:characterId,reinforcing:boolean,movementTracked:boolean,movement:oneOf(['normal','advance','fallback','remain']),
  order:string,charge:int(0,12),chargeTracked:boolean,charged:boolean,rerolled:boolean,attacks,finishedAttack:attackStep,
  counterCharge:boolean,reaction:boolean,reactionTracked:boolean,fightsFirst:boolean,shotAt:boolean,suppressedEnemy:boolean,hitTargets:list(group,12),suppressionTargets:list(group,12)
});
const doctrine=oneOf(Object.keys(doctrines)),tactic=oneOf(Object.keys(tactics));
const coreKeys=['marines','orks'].flatMap(team=>['insaneBravery-'+team,'epicChallenge-'+team,'commandReroll-'+team,'overwatch-'+team]);
const tacticKey=oneOf([...Object.keys(tactics),'heroicIntervention','counteroffensive',...coreKeys]);
const patrol=fields({
  doctrine:nullable(doctrine),usedDoctrines:list(doctrine,3),waaagh:int(0,2),waaaghUsed:boolean,
  enhanced:map(oneOf(Object.keys(enhancements)),boolean),tactics:map(tacticKey,string),spent:map(tacticKey,string),
  suppressed:nullable(group),warcryUsed:boolean,grotReturned:boolean
});
const objective=fields({name:string,home:nullable(team),owner:nullable(team),secured:nullable(team),
  marineOC:int(0),orkOC:int(0)},['owner','marineOC','orkOC']);
const pose=fields({x:Number.isFinite,z:Number.isFinite,elevation:n=>Number.isFinite(n)&&n>=0&&n<=20,yaw:Number.isFinite},['x','z','elevation','yaw']);
const chargeFields={unit:group,actor:model,mode:oneOf(['normal','masterOfBattle','leapToDefend','intoTheFray']),
  roll:int(2,12),dice:list(int(1,6),2),targets:list(group,12),origins:map(model,pose),paths:map(model,list(pose,512)),takeToSkies:boolean};
const chargePlan=fields({...chargeFields,commandRerollOpen:boolean},Object.keys(chargeFields));
const fightFields={unit:group,type:oneOf(['pile-in','consolidate']),mode:oneOf(['pile-in','ongoing','engaging','objective']),
  targets:list(identifier,16),origins:map(model,pose),paths:map(model,list(pose,512))};
const fightPlan=fields(fightFields,Object.keys(fightFields));
const reactionWindow=fields({round:int(1,20),active:team,shooter:group,targets:list(group,12)},['round','active','shooter','targets']);
const reactionFields={unit:group,mode:oneOf(['rapid','surge']),shooter:group,target:nullable(group),die:int(1,6),takeToSkies:boolean,
  origins:map(model,pose),paths:map(model,list(pose,512))};
const movePlan=fields({unit:group,type:oneOf(['advance','normal','fallback']),advanceRoll:int(0,6),
  origins:map(model,pose),paths:map(model,list(pose,512)),takeToSkies:boolean,fallbackMode:oneOf(['ordered','desperate']),
  desperateEscapeResolved:boolean,rerollClosed:boolean,commandRerollOpen:boolean},['unit','type','advanceRoll','origins','paths','takeToSkies','fallbackMode','desperateEscapeResolved']);
const battle=fields({
  version:oneOf([1]),status:oneOf(['setup','playing','finished']),first:team,active:team,
  round:int(1,20),rounds:int(1,20),step:int(0,5),cp:totals,vp:totals,hp,
  units:map(group,unit),attachments:map(model,group),objectives:map(identifier,objective),hazard:nullable(hazard),declaration:nullable(declaration),movePlan:nullable(movePlan),chargePlan:nullable(chargePlan),chargeWindow:boolean,
  fightSequence:validFightSequence,fightPlan:nullable(fightPlan),shootingSight,
  overwatch:fields({stage:oneOf(['offer','shoot','done']),team,unit:nullable(group)},['stage','team','unit']),
  shootingReaction:nullable(reactionWindow),reactionPlan:nullable(fields(reactionFields,Object.keys(reactionFields))),
  reinforcePlan:nullable(fields({unit:group,mode:oneOf(['edge','deep-strike']),origins:map(model,pose)},['unit','mode','origins'])),
  reserves:map(group,list(model,46)),patrol,notes:string,mission:string,last:string,
  rangedHistory:fields({since:int(1,41),last:map(group,int(1,40))},['since','last']),
  officialSetup:validatePatrolSetup,formations:validPatrolFormations,
  deployment:fields({defender:team,next:team,placed:list(group,12),pending:group},['defender','next','placed']),
  destroyedUnits:map(group,boolean),lossEvents:list(fields({id:group,faction:team,turn:int(1,40)},['id','faction','turn']),20000)
},['version','status','first','active','round','rounds','step']);

function officialStateOK(r,records){
  const f=r.formations,d=r.deployment,s=r.officialSetup;
  if(!s)return !f&&!d?.pending;
  const v=patrolSetupView(s),setup=r.status==='setup';
  if(r.rounds!==5||r.mission!==''||!setup&&(v.stage!=='ready'||r.first!==v.first))return false;
  if(setup&&(r.round!==1||r.step!==0||r.active!=='marines'||r.first!=='marines'||
    Object.keys(r.hp??{}).length||Object.keys(r.units??{}).length||
    !r.cp||!r.vp||r.cp.orks||r.cp.marines||r.vp.orks||r.vp.marines))return false;
  if(!!f!==!!v.defender||!!d!==s.formationsRevealed||(f?.stage==='revealed')!==s.formationsRevealed)return false;
  const drafts=s.formationsRevealed?Object.values(f.drafts):[];
  const attachments=Object.assign({},...drafts.map(x=>x.attachments));
  const reserved=new Set(drafts.flatMap(x=>x.reserves));
  const initialGroups=new Map();
  for(const [id,p] of models){
    const key=attachments[id]??unitId(p);
    if(!initialGroups.has(key))initialGroups.set(key,[]);
    initialGroups.get(key).push(id);
  }
  if(setup){
    if(!r.attachments||!r.reserves||!r.patrol||Object.keys(attachments).length!==Object.keys(r.attachments).length||
      Object.entries(attachments).some(([k,val])=>r.attachments[k]!==val))return false;
    if(reserved.size!==Object.keys(r.reserves).length)return false;
    for(const key of reserved){
      const expected=initialGroups.get(key),actual=r.reserves[key];
      if(!expected||!actual||expected.length!==actual.length||!expected.every(id=>actual.includes(id)))return false;
    }
    const enhanced=r.patrol.enhanced??{};
    if(Object.keys(enhanced).length!==drafts.length||drafts.some(x=>enhanced[x.enhancement]!==true))return false;
    if(records?.some(p=>{
      const omitted=models.has(p.id)?reserved.has(attachments[p.id]??unitId(models.get(p.id))):
        p.id==='shockArray-1'&&s.version>=2&&s.layoutDie!==null;
      return Boolean(p.removed)!==omitted;
    }))return false;
  }
  if(!d)return true;
  if(d.defender!==v.defender)return false;
  const left=new Set([...initialGroups.keys()].filter(key=>!reserved.has(key)));
  let next=d.defender;
  for(const key of d.placed){
    if(!left.delete(key)||groupTeam(key)!==next)return false;
    const other=next==='orks'?'marines':'orks';
    if([...left].some(k=>groupTeam(k)===other))next=other;
  }
  return d.next===next&&s.deploymentComplete===(left.size===0)&&
    (!d.pending||left.has(d.pending)&&groupTeam(d.pending)===next);
}

export function validateRulesState(value,pieceRecords=null,layout=undefined) {
  if (value==null) return true;
  if (fields({hp},['hp'])(value)) return true;
  if(pieceRecords&&(!Array.isArray(pieceRecords)||pieceRecords.some(p=>!p||!catalog.has(p.id))))return false;
  if(!battle(value) || value.round>value.rounds||!officialStateOK(value,pieceRecords))return false;
  if(value.rangedHistory){
    const turn=playerTurnNumber(value),{since,last}=value.rangedHistory;
    if(value.status==='setup'||since>turn+1||Object.values(last).some(t=>t>turn||t<since-1))return false;
    for(const [unit,t] of Object.entries(last)){
      const faction=groupTeam(unit),ownTurn=(t%2===1)===(faction===value.first);
      if(ownTurn){
        if(t===turn&&value.step<2)return false;
        continue;
      }
      const key='overwatch-'+faction,stamp=value.patrol?.spent?.[key];
      if(!stamp)return false;
      const [round,active]=stamp.split('-');
      const receiptTurn=playerTurnNumber({round:Number(round),first:value.first,active});
      if(receiptTurn<t||receiptTurn===t&&value.patrol.tactics?.[key]!==stamp+'/'+unit)return false;
    }
    const d=value.declaration;
    if(d&&(value.step===2||d.mode==='overwatch')&&(d.precisionRoll||d.attackRoll?.records.some(r=>r.kind!=='attacks'))&&
      last[d.unit]!==turn)return false;
  }
  const window=value.overwatch,shootingOverwatch=window?.stage==='shoot';
  const ranged=value.step===2||shootingOverwatch,shootingTeam=window?.team??value.active;
  const savedPieces=()=>pieceRecords.map(({id,x,z,elevation,yaw,removed})=>patrolTerrainPiece(
    {...catalog.get(id),x,z,elevation,yaw,removed:!!removed},value.officialSetup?.version));
  if((value.declaration?.mode==='overwatch')!==!!(shootingOverwatch&&value.declaration))return false;
  if(window){
    if(value.status!=='playing'||value.step!==1||window.team===value.active||!value.cp||!value.patrol?.spent||!value.patrol.tactics||
      !value.hp||!value.attachments||!value.units||value.movePlan||value.reinforcePlan||value.chargePlan||value.fightPlan||
      value.fightSequence||value.reactionPlan||value.shootingReaction||value.units.wartrakk?.suppressionTargets?.length)return false;
    const key='overwatch-'+window.team,stamp=[value.round,value.active,1].join('-');
    if(window.unit===null){
      if(shootingOverwatch||value.patrol.spent?.[key]===stamp||value.hazard||value.declaration||
        window.stage==='done'&&value.shootingSight)return false;
      if(window.stage==='offer'&&(value.cp[window.team]<1||
        pieceRecords&&!overwatchUnits(value,savedPieces()).length))return false;
    }else{
      if(window.stage==='offer'||groupTeam(window.unit)!==window.team||value.patrol.spent?.[key]!==stamp||
        value.patrol.tactics?.[key]!==stamp+'/'+window.unit||value.units[window.unit]?.shocked||
        Object.entries(value.patrol.tactics).some(([other,target])=>other!==key&&target===stamp+'/'+window.unit))return false;
      if(value.declaration&&(!shootingOverwatch||value.declaration.unit!==window.unit)||
        value.hazard&&(window.stage!=='done'||value.hazard.unit!==window.unit||value.hazard.reason))return false;
      if(shootingOverwatch&&pieceRecords&&!overwatchUnitReady(value,savedPieces(),window.unit))return false;
      if(value.hazard){
        const sources=[...models].filter(([id,p])=>(value.attachments[id]||unitId(p))===window.unit&&
          getProfile(p).weapons.some(w=>w.range>0&&w.hazardous));
        if(value.hazard.count>sources.length)return false;
      }
    }
  }
  if(value.hazard?.commandDice&&!canCommandReroll(value,value.hazard.unit,groupTeam(value.hazard.unit)))return false;
  const modelGroup=id=>value.attachments?.[id]||unitId(models.get(id));
  if(value.shootingSight){
    const s=value.shootingSight,rows=Object.entries(s.pairs);
    if(value.status!=='playing'||!ranged&&window?.stage!=='offer'||value.round!==s.round||value.active!==s.active||
      Object.keys(s.board).length!==catalog.size||!rows.length||
      Object.entries(s.board).some(([id,p])=>p[5]!==sightHP(value,id))||
      pieceRecords&&!sightBoardMatches(value,pieceRecords,s.board))return false;
    const live=id=>!s.board[id][4]&&s.board[id][5]!==0;
    if(pieceRecords&&window?.stage==='offer'){
      const eligible=overwatchUnits(value,savedPieces());
      if(rows.some(([id])=>!eligible.includes(modelGroup(id))))return false;
    }
    if(rows.some(([id,targets])=>!live(id)||faction(id)!==shootingTeam||
      (window?shootingOverwatch&&modelGroup(id)!==window.unit:value.units?.[modelGroup(id)]?.finishedAttack===2)||!Object.keys(targets).length||
      Object.keys(targets).some(target=>!live(target)||faction(target)===shootingTeam)))return false;
  }
  const stamp=value.patrol?.spent?.counteroffensive,target=value.patrol?.tactics?.counteroffensive;
  if(stamp!==undefined||target!==undefined){
    const m=/^([1-9]\d*)-(marines|orks)-4$/.exec(stamp??''),key=target?.split('/')[1];
    if(!m||Number(m[1])>value.round||!group(key)||groupTeam(key)===m[2]||target!==stamp+'/'+key)return false;
    if(stamp===[value.round,value.active,value.step].join('-')&&!value.units?.[key]?.fightsFirst)return false;
  }
  if(value.fightSequence?.counterAfter){
    const source=value.fightSequence.counterAfter;
    const defender=value.active==='marines'?'orks':'marines';
    if(value.status!=='playing'||value.step!==4||groupTeam(source)!==value.active||(value.cp?.[defender]??0)<2||value.units?.[source]?.finishedAttack!==4||
      value.declaration||value.fightPlan||(value.hazard&&value.hazard.unit!==source)||
      stamp===[value.round,value.active,4].join('-'))return false;
  }
  for(const key of coreKeys){
    const stamp=value.patrol?.spent?.[key],target=value.patrol?.tactics?.[key];
    if(stamp===undefined&&target===undefined)continue;
    const [round,active,step]=(stamp??'').split('-'),[ability,team]=key.split('-');
    const unit=target?.split('/')[1];
    if(!group(unit)||groupTeam(unit)!==team||target!==stamp+'/'+unit||
      !int(1,value.round)(Number(round))||String(Number(round))!==round||!['marines','orks'].includes(active)||
      stamp!==[round,active,step].join('-')||!['0','1','2','3','4','5'].includes(step)||
      (ability==='insaneBravery'&&(active!==team||step!=='0'))||(ability==='epicChallenge'&&step!=='4'))return false;
    if(ability==='overwatch'){
      if(value.status==='setup'||active===team||step!=='1')return false;
      if(Number(round)===value.round&&(active===value.active
        ?value.step<1||value.step===1&&window?.unit!==unit
        :value.active===value.first))return false;
    }
  }
  for(const [unit,flags] of Object.entries(value.units??{})){
    const id=flags.epicChallengeModel;
    if(id&&(modelGroup(id)!==unit||!value.patrol?.tactics?.['epicChallenge-'+faction(id)]?.endsWith('/'+unit)))return false;
  }
  const wartrakk=value.units?.wartrakk;
  if(wartrakk?.suppressionTargets?.length&&
    (value.status!=='playing'||value.active!=='orks'||value.step!==2||wartrakk.finishedAttack!==2||value.declaration||value.reactionPlan||
    !wartrakk.suppressionTargets.every(k=>groupTeam(k)==='marines'&&wartrakk.hitTargets?.includes(k))))return false;
  if(value.shootingReaction||value.reactionPlan){
    const w=value.shootingReaction,p=value.reactionPlan,shooter=(w??p).shooter;
    if(value.status!=='playing'||value.step!==2||value.declaration||value.movePlan||value.reinforcePlan||value.chargePlan||
       value.fightPlan||value.fightSequence||groupTeam(shooter)!==value.active||value.units?.[shooter]?.finishedAttack!==2)return false;
    if(w)return !p&&w.round===value.round&&w.active===value.active&&w.targets.length>0&&
      new Set(w.targets).size===w.targets.length&&w.targets.every(k=>groupTeam(k)!==value.active)&&
      (!value.hazard||(value.hazard.unit===shooter&&!value.hazard.reason));
    const ids=Object.keys(p.origins);
    return !value.hazard&&groupTeam(p.unit)!==value.active&&value.units[p.unit]?.reaction===true&&value.units[p.unit]?.reactionTracked===true&&
      (p.mode==='rapid'?p.unit==='vanguard'&&p.target===null:groupTeam(p.unit)==='orks'&&!p.takeToSkies&&p.target!==null&&groupTeam(p.target)===value.active)&&
      ids.length>0&&ids.every(id=>(value.attachments?.[id]||unitId(models.get(id)))===p.unit)&&Object.keys(p.paths).every(id=>ids.includes(id));
  }
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
    if(p.commandRerollOpen&&(p.targets.length||Object.keys(p.paths).length||!['normal','masterOfBattle'].includes(p.mode)||
      !canCommandReroll(value,p.unit,groupTeam(p.unit))))return false;
    const expected=['masterOfBattle','intoTheFray'].includes(p.mode)?Math.min(sum,6):sum;
    return value.step===3&&value.status==='playing'&&!value.declaration&&!value.hazard&&!value.movePlan&&
      ids.includes(p.actor)&&ids.every(id=>(value.attachments?.[id]||unitId(models.get(id)))===p.unit)&&
      p.dice.length===2&&p.roll===expected&&value.units?.[p.unit]?.charge===p.roll&&
      new Set(p.targets).size===p.targets.length&&!p.targets.includes(p.unit)&&Object.keys(p.paths).every(id=>ids.includes(id));
  }
  if(value.movePlan){
    const m=value.movePlan,ids=Object.keys(m.origins);
    if(m.commandRerollOpen&&(m.type!=='advance'||m.rerollClosed||Object.keys(m.paths).length||value.units?.[m.unit]?.rerolled||
      value.active!==groupTeam(m.unit)||!canCommandReroll(value,m.unit,value.active)))return false;
    if(value.step!==1||value.status!=='playing'||value.declaration||!ids.length||value.units?.[m.unit]?.movement!==m.type||
      !ids.every(id=>(value.attachments?.[id]||unitId(models.get(id)))===m.unit)||
      !Object.keys(m.paths).every(id=>ids.includes(id))||(m.type==='advance'?m.advanceRoll<1:m.advanceRoll!==0))return false;
    const escaping=m.type==='fallback'&&m.fallbackMode==='desperate'&&!m.desperateEscapeResolved;
    if(escaping)return value.hazard?.reason==='escape'&&value.hazard.unit===m.unit&&value.hazard.count===ids.length;
    return !value.hazard;
  }
  if(value.hazard?.reason==='escape')return false;
  if(!value.hazard && !value.declaration)return true;
  if(value.status!=='playing'||!attackStep(value.step)&&!window)return false;
  const plan=value.declaration;
  if(!plan)return true;
  if(plan.detectionMap&&(!plan.locked||!ranged||layout!==undefined&&plan.detectionMap!==layout?.map))return false;
  if(shootingOverwatch){
    const selections=new Map();
    for(const r of plan.rows){
      const actor=models.get(r.actor),weapon=getProfile(actor).weapons[r.weapon];
      if(!weapon?.range||r.target!==plan.rows[0].target||r.plunging||r.distance>weapon.range+1e-7)return false;
      const weapons=selections.get(r.actor)??[],slot=weaponSlot(weapon);
      if(weapons.some(w=>weaponSlot(w)===slot||actor.kind!=='landSpeeder'&&!!w.pistol!==!!weapon.pistol))return false;
      weapons.push(weapon);selections.set(r.actor,weapons);
    }
    if(pieceRecords&&!plan.rows.some(r=>r.done)){
      const pieces=savedPieces(),byId=new Map(pieces.map(p=>[p.id,p]));
      if(plan.rows.some(r=>{
        const actor=byId.get(r.actor),target=byId.get(r.preferred);
        return !overwatchTargetEligible(value,pieces,actor,target,getProfile(actor)?.weapons[r.weapon]);
      }))return false;
      if(plan.locked&&plan.rows.some(r=>!Object.entries(value.shootingSight?.pairs[r.actor]??{})
        .some(([id,status])=>status==='visible'&&modelGroup(id)===r.target)))return false;
    }
  }
  if(plan.coverBoard&&!ranged)return false;
  if(plan.didFight!==undefined&&value.step!==4)return false;
  if(value.hazard||!plan.rows.length||!plan.rows.some(r=>!r.done)||(!plan.locked&&plan.rows.some(r=>r.done)))return false;
  if(plan.focus && (!plan.locked||!plan.rows.some(r=>r.target===plan.focus&&!r.done)))return false;
  if(plan.precisionRoll){
    const r=plan.precisionRoll,entry=plan.rows[r.index];
    if(!plan.locked||!entry||entry.done||entry.target!==plan.focus||r.hits>2*r.count||r.wounds>r.hits||
      r.devastating>r.wounds||r.hitDice.length>r.count||r.woundDice.length>r.hits)return false;
    const p={...models.get(entry.actor),id:entry.actor,faction:faction(entry.actor)};
    const weapon=getProfile(p).weapons[entry.weapon];
    if(!weapon||!effectWeapon(value,p,weapon,plan.unit).precision)return false;
  }
  const coverByTarget=new Map();
  if(!plan.rows.every(r=>{
    const weapon=getProfile(models.get(r.actor)).weapons[r.weapon];
    const visible=r.plungingVisible;
    if(r.coverReview&&(plan.locked||r.manualCover!==false||r.areaCover===undefined))return false;
    if(r.manualCover!==undefined||r.areaCover!==undefined){
      if(!weapon?.range||r.manualCover===undefined||r.areaCover===undefined||r.cover!==(r.manualCover||r.areaCover)||r.manualCover&&!plan.coverBoard)return false;
      if(plan.locked){
        if(coverByTarget.has(r.target)&&coverByTarget.get(r.target)!==r.areaCover)return false;
        coverByTarget.set(r.target,r.areaCover);
      }
    }
    return weapon && (r.plunging?weapon.range>0&&!weapon.torrent&&visible?.length&&
      new Set(visible).size===visible.length&&visible.every(id=>modelGroup(id)===r.target):visible===undefined) &&
      !!weapon.range===ranged && modelGroup(r.actor)===plan.unit && modelGroup(r.preferred)===r.target &&
      faction(r.actor)!==faction(r.preferred) && (!ranged || faction(r.actor)===shootingTeam) &&
      (weapon.range?r.assigned===0:r.assigned>=1&&r.assigned<=weapon.attacks+r.extra);
  }))return false;
  // An intact sight record refers to this exact board. Once casualties or
  // movement invalidate it, original row qualifiers remain historical.
  if(pieceRecords&&plan.detectionMap&&value.shootingSight&&!plan.attackRoll&&!plan.precisionRoll&&!plan.rows.some(r=>r.done)){
    const pieces=savedPieces(),map={map:plan.detectionMap};
    for(const row of plan.rows){
      const targets=pieces.filter(p=>model(p.id)&&modelGroup(p.id)===row.target).map(p=>p.id);
      const range=getProfile(models.get(row.actor)).weapons[row.weapon].range;
      if(!patrolSightTarget(value,pieces,row.actor,targets,range,undefined,map).visible.length)return false;
    }
  }
  if(pieceRecords&&plan.locked&&value.shootingSight&&plan.rows.some(r=>r.manualCover)&&
    !sightBoardMatches(value,pieceRecords,plan.coverBoard))return false;
  if(pieceRecords&&plan.locked&&value.shootingSight&&(plan.rows.some(r=>r.plunging)||layout!==undefined&&coverByTarget.size)){
    const pieces=savedPieces();
    if(layout!==undefined)for(const [target,expected] of coverByTarget){
      const members=pieces.filter(p=>model(p.id)&&modelGroup(p.id)===target);
      if(expected!==patrolAreaCover({rules:value,pieces,layout},members).automatic)return false;
    }
    for(const r of plan.rows.filter(r=>r.plunging)){
      const actor=pieces.find(p=>p.id===r.actor),weapon=getProfile(actor)?.weapons[r.weapon];
      const targets=pieces.filter(p=>model(p.id)&&modelGroup(p.id)===r.target);
      const visible=value.shootingSight.pairs[r.actor];
      if(!actor||!weapon||!r.plungingVisible.every(id=>visible?.[id]==='visible')||
        !plungingFireAtDeclaration(value,pieces,actor,weapon,targets,true))return false;
    }
  }
  if(plan.attackRoll){
    const progress=plan.attackRoll,entry=plan.rows[progress.index];
    if(!plan.locked||plan.precisionRoll||!entry||entry.done||entry.target!==plan.focus||
      modelGroup(progress.preferred)!==plan.focus||!progress.records.length)return false;
    const changes=new Set();
    for(const [i,r] of progress.records.entries()){
      const isDie=['attacks','hit','wound','save','damage'].includes(r.kind),last=i===progress.records.length-1;
      if(last===!!r.closed || (isDie?(!r.raw?.length||Object.hasOwn(r,'choice')):
        (r.raw||r.change||last===Object.hasOwn(r,'choice'))))return false;
      if(r.choice&&modelGroup(r.choice)!==plan.focus)return false;
      if(r.change){
        const team=groupTeam(r.kind==='save'?plan.focus:plan.unit);
        const unit=r.kind==='save'?plan.focus:plan.unit;
        if(last||shootingOverwatch&&r.kind==='hit'||r.change.index>=r.raw.length||changes.has(team)||
          value.patrol?.tactics?.['commandReroll-'+team]!==[value.round,value.active,value.step].join('-')+'/'+unit)return false;
        changes.add(team);
      }
    }
    if(pieceRecords){
      const event=inspectAttackRoll(value,savedPieces());
      if(!event||event.sizes&&!canCommandReroll(value,event.unit,event.team))return false;
    }
  }
  return true;
}
