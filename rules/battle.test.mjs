import test from 'node:test';
import assert from 'node:assert/strict';
import {getProfile,profiles,unitId} from './profiles.mjs';
import {newBattle,startBattle,advance,roll,diceValue,woundThreshold,changeUnit,unitMembers,
  needsShock,shockTest,resolveCommandShock,currentHP,adjustHP,resolveAttack,engaged,weaponSlot,controlObjective,
  queueHazard,hazardCandidates,resolveHazard} from './battle.mjs';

const piece=(kind,variant=0,faction='marines')=>({id:kind+'-'+variant,kind,variant,faction});
const marine=piece('intercessor',2),boy=piece('boy',1,'orks');
const sequence=(...values)=>{
  let at=0;
  return ()=>{assert.ok(at<values.length,'unexpected die');return (values[at++]-.5)/6;};
};
const weapon={name:'test',range:24,attacks:1,skill:3,strength:5,ap:0,damage:1};
const attack=(args)=>resolveAttack({weapon,targets:[boy],state:newBattle(),distance:12,...args});

test('ten unit kinds with both Nobz, commanders, and variant loadouts',()=>{
  assert.equal(Object.keys(profiles).length,10);
  assert.equal(getProfile(boy).wounds,1);
  assert.equal(getProfile(piece('boy',10)).wounds,2);
  assert.equal(unitId(piece('boy',19)),'boy-1');
  assert.equal(getProfile(piece('vanguard',0)).weapons[0].name,'헤비 볼트 피스톨');
  assert.equal(getProfile(piece('vanguard',3)).weapons[1].hazardous,true);
  assert.equal(getProfile(piece('intercessor',1)).weapons.length,5);
  assert.equal(weaponSlot(getProfile(piece('librarian')).weapons[1]),weaponSlot(getProfile(piece('librarian')).weapons[2]));
});
test('a one-round game gives both players one full turn and stops',()=>{
  let state=startBattle(newBattle(),'orks',1);
  assert.deepEqual(state.cp,{marines:1,orks:1});
  state=changeUnit(state,boy,{movement:'advance',shocked:true});
  assert.equal(advance(state),state);
  state=resolveCommandShock(state,[boy],'boy-0',sequence(1,1)).state;
  for(let i=0;i<6;i++) state=advance(state);
  assert.equal(state.step,0);
  assert.equal(state.active,'marines');
  assert.equal(state.round,1);
  assert.deepEqual(state.units['boy-0'],{shocked:true});
  assert.deepEqual(state.cp,{marines:2,orks:2});
  for(let i=0;i<6;i++) state=advance(state);
  assert.equal(state.status,'finished');
  assert.deepEqual(advance(state),state);
});
test('turns wrap to round two only after both players',()=>{
  let state=startBattle(newBattle(),'marines',5);
  for(let i=0;i<12;i++) state=advance(state);
  assert.equal(state.round,2);
  assert.equal(state.active,'marines');
  assert.equal(state.cp.marines,3);
});
test('battle-shock at exactly half, wounded single models and attached leadership',()=>{
  const state=newBattle(),nob=piece('boy',0,'orks'),boss=piece('warboss',0,'orks');
  const mob=[boy,{...nob,removed:true}];
  assert.equal(needsShock(state,mob),true);
  assert.equal(needsShock(state,[marine]),false);
  assert.equal(needsShock(adjustHP(state,marine,-1),[marine]),true);
  state.attachments[boss.id]=unitId(boy);
  const group=unitMembers(state,[...mob,boss,marine],boy);
  assert.equal(group.length,3);
  assert.deepEqual(shockTest(state,group,sequence(3,3)),{dice:[3,3],target:6,passed:true});
});
test('strength table, random expressions and engagement cylinder',()=>{
  assert.deepEqual([2,3,4,5,8].map(s=>woundThreshold(s,4)),[6,5,4,3,2]);
  assert.equal(diceValue('D3+3',()=>.99999),6);
  assert.equal(roll(6,()=>0),1);
  assert.equal(engaged({elevation:0},{elevation:5},Math.hypot(2,5)),true);
  assert.equal(engaged({elevation:0},{elevation:5.1},5.1),false);
  assert.equal(engaged({}, {},2.01),false);
});
test('cover worsens BS and does not change Sv',()=>{
  assert.equal(attack({cover:true,random:sequence(3)}).hits,0);
  assert.equal(attack({random:sequence(3,4,4)}).hp[boy.id],0);
  assert.equal(attack({cover:true,random:sequence(4,4,5)}).hp[boy.id],1);
});
test('unmodified 1s fail, 6s always hit and wound, 6 save is not automatic',()=>{
  assert.equal(attack({hitMod:1,random:sequence(1)}).hits,0);
  const g=piece('gretchin');
  assert.equal(attack({targets:[g],hitMod:-1,woundMod:-1,random:sequence(6,6,6)}).hp[g.id],0);
});
test('normal damage cannot spill and wounded bodyguard takes priority',()=>{
  const second=piece('intercessor',3),captain=piece('captain');
  const state=adjustHP(newBattle(),second,-1);
  const result=attack({weapon:{...weapon,damage:4},targets:[captain,marine,second],preferred:captain.id,state,
    random:sequence(4,6,1)});
  assert.equal(result.hp[second.id],0);
  assert.equal(result.hp[marine.id],2);
  assert.equal(result.hp[captain.id],6);
  assert.equal(result.damage[0].lost,1);
});
test('lowest save is resolved first across distinct groups and invulnerable saves ignore AP',()=>{
  const captain=piece('captain');
  const result=attack({weapon:{...weapon,attacks:2,damage:5,ap:-5},targets:[marine,captain],
    random:sequence(6,6,5,6,6,1)});
  assert.deepEqual(result.saves,[1,5]);
  assert.equal(result.hp[marine.id],0);
  assert.equal(result.hp[captain.id],6);
});
test('critical effects, fixed hit count and half-range rapid fire',()=>{
  const lethal=attack({lethal:true,random:sequence(6,1)});
  assert.deepEqual(lethal.woundDice,[]);
  const devastating=attack({weapon:{...weapon,torrent:true,devastating:true},random:sequence(6)});
  assert.deepEqual(devastating.saves,[]);
  assert.equal(devastating.devastating,1);
  const rapid=attack({weapon:{...weapon,rapid:2},random:sequence(1,2,1)});
  assert.equal(rapid.count,3);
  assert.throws(()=>attack({distance:24.1}),/사거리/);
});
test('wounds clamp to model capacity; ties keep only a secured objective',()=>{
  const state=adjustHP(newBattle(),marine,-40);
  assert.equal(currentHP(state,marine),0);
  assert.equal(currentHP(adjustHP(state,marine,40),marine),2);
  assert.equal(controlObjective(2,2),null);
  assert.equal(controlObjective(2,2,'orks'),'orks');
  assert.equal(controlObjective(3,2,'orks'),'marines');
});
test('a volley rolls random attacks and rapid-fire bonus separately for each weapon',()=>{
  const result=attack({weapon:{...weapon,attacks:'D3',rapid:1},copies:2,random:sequence(1,6,1,1,1,1,1,1)});
  assert.equal(result.count,6);
  assert.deepEqual(result.hitDice,[1,1,1,1,1,1]);
  assert.throws(()=>attack({copies:0}),/무기 개수/);
});

test('hazardous weapons accumulate across attacks and roll all tests before player allocations',()=>{
  const grots=[1,2,3].map(i=>piece('gretchin',i,'orks'));
  const state={...newBattle(),status:'playing',active:'orks',step:2};
  let pending=queueHazard(state,grots[0],1);
  pending=queueHazard(pending,grots[1],2);
  assert.deepEqual(pending.hazard,{unit:'gretchin',count:3});
  assert.equal(advance(pending),pending);
  assert.throws(()=>queueHazard(pending,boy,1));
  const roll=resolveHazard(pending,grots,null,sequence(1,2,3));
  assert.deepEqual(roll.dice,[1,2,3]);
  assert.equal(roll.remaining,2);
  assert.deepEqual(roll.state.hp,{});
  assert.equal(hazardCandidates(roll.state,grots).length,3);
  assert.throws(()=>queueHazard(roll.state,grots[0],1));
  assert.equal(resolveHazard(roll.state,grots,boy.id,sequence()),null);
  const first=resolveHazard(roll.state,grots,grots[2].id,sequence());
  assert.deepEqual(first.removed,{[grots[2].id]:true});
  const second=resolveHazard(first.state,grots,grots[0].id,sequence());
  assert.deepEqual(second.removed,{[grots[0].id]:true});
  assert.equal(second.state.hazard,null);
  assert.equal(second.state.units.gretchin.finishedAttack,2);
  assert.throws(()=>queueHazard(second.state,grots[0],1));
  assert.equal(advance(second.state).step,3);
  assert.deepEqual(pending.hp,{});
});

test('hazards allocate to wounded bodyguards before leaders and spill one mortal at a time',()=>{
  const boss=piece('weirdboy',1,'orks'),nob=piece('boy',0,'orks');
  const state={...newBattle(),status:'playing',step:4,attachments:{[boss.id]:'boy-0'},
    hp:{[boss.id]:2,[nob.id]:1}};
  const result=resolveHazard(queueHazard(state,boss,3),[boss,nob,boy],null,sequence(2,1,1));
  assert.equal(result.state.hp[nob.id],0);
  assert.equal(result.state.hp[boy.id],0);
  assert.equal(result.state.hp[boss.id],1);
  assert.equal(result.state.hazard,null);
  assert.deepEqual(result.removed,{[nob.id]:true,[boy.id]:true});
});

test('all-vehicle hazard is three wounds, mounted is one, all successes leave HP untouched',()=>{
  const state={...newBattle(),status:'playing',step:2};
  for (const [kind,damage] of [['landSpeeder',3],['wartrakk',1]]) {
    const model=piece(kind);
    const result=resolveHazard(queueHazard(state,model,2),[model],null,sequence(2,3));
    assert.equal(result.total,damage);
    assert.equal(getProfile(model).wounds-result.state.hp[model.id],damage);
    assert.equal(result.state.hazard,null);
    const safe=resolveHazard(queueHazard(state,model,2),[model],null,sequence(3,6));
    assert.deepEqual(safe.state.hp,{});
    assert.equal(safe.state.hazard,null);
  }
});
