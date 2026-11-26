import test from 'node:test';
import assert from 'node:assert/strict';
import {startBattle,newBattle,advance,modelProfile,resolveAttack} from './battle.mjs';
import {selectOrder,useTactic,effectWeapon} from './patrol.mjs';
import {recordLosses,objectiveSnapshot,missionAward} from './missions.mjs';
import {getProfile} from './profiles.mjs';

const start=first=>startBattle(newBattle(),first,5);
const p=(kind,variant,faction)=>({id:kind+variant,kind,variant,faction});
const marine=p('intercessor',3,'marines'), weird=p('weirdboy',0,'orks'), grot=p('gretchin',0,'orks');
const turn=s=>{for(let i=0;i<6;i++)s=advance(s);return s;};
test('patrol doctrines last through the opposing turn, each once per battle',()=>{
  let s=selectOrder(start('marines'),'tactical');
  assert.equal(s.patrol.doctrine,'tactical');
  assert.equal(selectOrder(s,'assault'),null);
  s=turn(s);
  assert.equal(s.patrol.doctrine,'tactical');
  s=turn(s);
  assert.equal(s.patrol.doctrine,null);
  assert.equal(selectOrder(s,'tactical'),null);
  assert.ok(selectOrder(s,'assault'));
});
test('Waaagh lasts two player turns, its wound penalty only applies if S > T',()=>{
  const s=selectOrder(start('orks'),'waaagh');
  assert.equal(s.patrol.waaagh,2);
  assert.equal(turn(s).patrol.waaagh,1);
  assert.equal(turn(turn(s)).patrol.waaagh,0);
  const weapon={...getProfile(marine).weapons[0],attacks:1,torrent:true,strength:6};
  const hit=resolveAttack({weapon,targets:[weird],state:s,distance:3,random:()=>.4});
  assert.equal(hit.wounds,0);
});
test('printed Waaagh! starts before checks or Rallying War Cry, including a successful automatic test',()=>{
  const orks=start('orks');
  assert.ok(selectOrder({...orks,units:{warboss:{shocked:true}}},'waaagh'));
  for(const order of [{shockChecked:true,shocked:true},{shockChecked:true,shocked:false},{rallied:true}]){
    assert.equal(selectOrder({...orks,units:{warboss:order}},'waaagh'),null);
  }
  assert.equal(selectOrder(start('marines'),'waaagh'),null);
  const oldWarCry={...orks,patrol:{...orks.patrol,warcryUsed:true}};
  assert.ok(selectOrder(oldWarCry,'waaagh'),'a prior battle-wide use does not establish which turn it occurred in');
});
test('stratagem spends 1 CP once in phase and expires; enhancements change actual stats',()=>{
  const s=start('marines');s.step=2;
  const marked=useTactic(s,'med','gretchin','orks',false);
  assert.equal(marked.cp.orks,0);
  assert.equal(modelProfile(marked,grot).invul,5);
  assert.equal(modelProfile(advance(marked),grot).invul,0);
  assert.equal(useTactic(marked,'med','boy-0','orks',false),null);
  assert.equal(useTactic(s,'crush','boy-0','orks',false),null);
  s.patrol.enhanced.veterans=true;
  assert.equal(effectWeapon(s,marine,getProfile(marine).weapons[0],'intercessor').rapid,1);
  assert.equal(modelProfile(s,marine).oc,4);
});
test('objective control and Weirdboy secure survive ties and clear on enemy superiority',()=>{
  let s=start('orks');
  const areas=[{id:'A',name:'A',members:[weird.id],home:null}];
  s.objectives=objectiveSnapshot(s,[weird,marine],areas);
  assert.equal(s.objectives.A.secured,'orks');
  s.step=1;
  areas[0].members=[];
  s.objectives=objectiveSnapshot(s,[weird,marine],areas);
  assert.equal(s.objectives.A.owner,'orks');
  areas[0].members=[marine.id];
  s.objectives=objectiveSnapshot(s,[weird,marine],areas);
  assert.equal(s.objectives.A.owner,'marines');
  assert.equal(s.objectives.A.secured,null);
});
test('mission windows and both objectives stack, fifth round scores at turn end',()=>{
  let s=start('marines');
  const objectives=[{owner:'marines',home:null},{owner:'marines',home:'orks'},{owner:'orks',home:'marines'}];
  assert.equal(missionAward(s,objectives),0);
  s.round=2;
  assert.equal(missionAward(s,objectives),15);
  s.active='orks';
  assert.equal(missionAward(s,objectives),10);
  s.round=5;
  assert.equal(missionAward(s,objectives),0);
  s.step=5;
  assert.equal(missionAward(s,objectives),10);
});
test('a destroyed unit triggers Ork end scoring only this or last turn, once per check',()=>{
  let s=start('marines');
  let roster=[marine,{...marine,id:'other',variant:4},grot];
  s=recordLosses(s,roster);
  roster[0]={...roster[0],removed:true};
  assert.equal(recordLosses(s,roster).lossEvents.length,0);
  roster[1]={...roster[1],removed:true};
  s=recordLosses(s,roster);
  assert.equal(recordLosses(s,roster).lossEvents.length,1);
  s=turn(s);s.step=5;
  assert.equal(missionAward(s,[]),5);
  s.round=2;
  assert.equal(missionAward(s,[]),0);
});
