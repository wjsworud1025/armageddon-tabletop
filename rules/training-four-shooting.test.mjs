import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrainingFourTable} from '../data/training-four-layout.mjs';
import {getProfile} from './profiles.mjs';
import {newTrainingShooting,trainingShootingView,applyTrainingShooting} from './training-three-shooting.mjs';
import {trainingFourDeployment,trainingFourBattle} from './training-four-battle.mjs';

function game(active,poses,scenario=4){
  const pieces=createTrainingFourTable().pieces.filter(p=>Object.hasOwn(poses,p.id)).map(p=>{
    const [x,z]=poses[p.id];return {...p,x,z,yaw:0};
  });
  const hp=Object.fromEntries(pieces.map(p=>[p.id,getProfile(p).wounds]));
  const g={pieces,state:{active,scenario,phase:'shooting',hp,shooting:newTrainingShooting()},rolls:[]};
  g.view=()=>trainingShootingView(g.state,pieces);
  g.act=(type,data={},dice=[])=>{
    const original=structuredClone(g.state);let n=0;
    const out=applyTrainingShooting(g.state,pieces,{type,...data},()=>dice[n++]);
    assert.deepEqual(g.state,original);assert.equal(n,dice.length);
    g.state={...g.state,hp:out.hp,shooting:out.shooting};
    g.rolls.push(...out.rolls);
  };
  g.aim=(unit,weapon,target,visibility='full')=>{
    const model=unit+'-1';
    g.act('shoot-unit',{unit});g.act('shoot-weapon',{model,weapon});g.act('shoot-target',{target});
    for(const {id} of g.view().visibility)g.act('shoot-sight',{model,id,visibility});
    g.act('shoot-confirm');
  };
  g.roll=(...dice)=>g.act('shoot-roll',{},dice);
  return g;
}

test('wartrakk rolls a real D6 for D3+3 rokkits and half-range adds two shoota attacks',()=>{
  for(const [die,expected] of [[1,4],[2,4],[3,5],[4,5],[5,6],[6,6]]){
    const g=game('orks',{'wartrakk-1':[0,0],'intercessor-1':[8,0]});
    g.aim('wartrakk',0,'intercessor');
    assert.equal(g.view().stage,'attacks');
    assert.throws(()=>g.roll(0),/D6/);g.roll(die);
    assert.deepEqual(g.rolls[0],{unit:'wartrakk',actor:'orks',step:'attacks',dice:[die],formula:'D3+3',bonus:0,result:expected});
    assert.deepEqual([g.view().stage,g.view().shot.count],['hit',expected]);
  }
  for(const [distance,expected] of [[10,6],[12,4]]){
    const g=game('orks',{'wartrakk-1':[0,0],'captain-1':[distance,0]});
    g.aim('wartrakk',1,'captain');
    assert.deepEqual([g.view().stage,g.view().shot.count],['hit',expected]);
    assert.deepEqual(g.rolls,[]);
  }
});

test('covered targets of a heavy flamer get D6 automatic hits with no Ballistic Skill roll',()=>{
  const g=game('marines',{'landSpeeder-1':[0,0],'warboss-1':[8,0]});
  g.aim('landSpeeder',2,'warboss','partial');g.roll(4);
  assert.equal(g.view().shot.cover,true);
  assert.deepEqual([g.view().stage,g.view().shot.count],['wound',4]);
  g.roll(1,2,5,6);g.roll(6,6);
  assert.deepEqual(g.rolls.map(r=>r.step),['attacks','wound','save']);
  assert.equal(g.view().stage,'weapon');
});

test('melta damage is rolled only after allocation, fixed at declaration range even after a casualty, with no spill',()=>{
  const g=game('marines',{'landSpeeder-1':[0,0],'boy-2':[8,0],'boy-1':[13,0]});
  g.aim('landSpeeder',0,'boy-0');g.roll(4,6);g.roll(6,6);g.roll(1,1);
  assert.equal(g.view().actor,'orks');
  g.act('shoot-allocate',{model:'boy-2'});
  assert.deepEqual([g.view().stage,g.view().actor],['damage','marines']);
  assert.equal(g.state.hp['boy-2'],1);
  g.roll(1);assert.equal(g.state.hp['boy-2'],0);assert.equal(g.state.hp['boy-1'],2);
  g.act('shoot-allocate',{model:'boy-1'});g.roll(4);
  assert.equal(g.view().stage,'weapon');
  assert.deepEqual(g.rolls.filter(r=>r.step==='damage').map(r=>[r.dice,r.formula,r.bonus,r.result]),[[[1],'D6',2,3],[[4],'D6',2,6]]);
  const far=game('marines',{'landSpeeder-1':[0,0],'wartrakk-1':[14,0]});
  far.aim('landSpeeder',0,'wartrakk');far.roll(1,6);far.roll(6);far.roll(1);
  far.act('shoot-allocate',{model:'wartrakk-1'});far.roll(2);
  assert.equal(far.state.hp['wartrakk-1'],5);assert.equal(far.rolls.at(-1).bonus,0);
});

test('training three ignores vehicle units, and training four keeps the printed shooting restrictions',()=>{
  const pieces={'landSpeeder-1':[0,0],'wartrakk-1':[9,0]};
  const g=game('marines',pieces,3);
  assert.deepEqual(g.view().options.map(o=>o.type),['shoot-next']);
  const engaged=game('marines',{...pieces,'wartrakk-1':[3,0]});
  assert.deepEqual(engaged.view().options.map(o=>o.type),['shoot-next']);
  for(const moved of ['advance','fallback']){
    const x=game('orks',pieces);x.state.moved={wartrakk:moved};
    assert.deepEqual(x.view().options.map(o=>o.type),['shoot-next']);
  }
});

test('Wartrakk is Mounted for krak grenades; frag grenades count five living models for Blast',()=>{
  const orks=Object.fromEntries(Array.from({length:5},(_,i)=>['boy-'+(i+2),[8,i]]));
  const deploy=(poses,weapon,target)=>{
    const g=game('marines',{'intercessor-2':[0,0],...poses});
    g.act('shoot-unit',{unit:'intercessor'});g.act('shoot-weapon',{model:'intercessor-2',weapon});
    g.act('shoot-target',{target});
    for(const {id} of g.view().visibility)g.act('shoot-sight',{model:'intercessor-2',id,visibility:'full'});
    g.act('shoot-confirm');return g;
  };
  const frag=deploy(orks,3,'boy-0');assert.equal(frag.view().shot.count,3);
  const krak=deploy({'wartrakk-1':[8,0]},4,'wartrakk');
  krak.roll(1,6);krak.roll(4);
  assert.deepEqual([krak.rolls.at(-1).threshold,krak.view().stage],[5,'weapon']);
});

test('real scenario-four save strictly replays variable characteristics and rejects forged dice, result and pending count',()=>{
  const engine=trainingFourBattle;
  let s=engine.create(trainingFourDeployment.create());
  const act=(type,data={},die=4)=>{s=engine.act(s,{type,...data},()=>die);};
  act('four-score');act('next');act('shoot-unit',{unit:'wartrakk'});
  act('shoot-weapon',{model:'wartrakk-1',weapon:0});act('shoot-target',{target:'intercessor'});
  for(const v of engine.view(s).shooting.visibility)act('shoot-sight',{model:'wartrakk-1',id:v.id,visibility:'full'});
  act('shoot-confirm');assert.equal(s.shooting.stage,'attacks');
  assert.equal(engine.validate(JSON.parse(JSON.stringify(s))),true);
  act('shoot-roll');assert.equal(s.shooting.shot.count,5);assert.deepEqual(s.history.at(-1).dice,[4]);
  assert.equal(engine.validate(JSON.parse(JSON.stringify(s))),true);
  for(const mutate of [x=>x.history.at(-1).dice.push(4),x=>x.history.at(-1).dice.pop(),x=>x.history.at(-1).dice[0]=3,
    x=>x.history.at(-1).dice[0]=9,x=>x.rolls.at(-1).result++,x=>x.shooting.shot.count++]){
    const forged=structuredClone(s);mutate(forged);assert.equal(engine.validate(forged),false);
  }
});

test('a save waiting on the attacking player to roll damage retains the defender’s allocation and exact D6 history',()=>{
  const engine=trainingFourBattle;
  let s=engine.create(trainingFourDeployment.create());
  const act=(type,data={},die=6)=>{s=engine.act(s,{type,...data},()=>die);};
  for(const type of ['four-score','next','shoot-next','next','next','four-score','next'])act(type);
  assert.deepEqual([s.active,s.phase],['marines','shooting']);
  act('shoot-unit',{unit:'landSpeeder'});act('shoot-weapon',{model:'landSpeeder-1',weapon:0});
  act('shoot-target',{target:'warboss'});act('shoot-sight',{model:'landSpeeder-1',id:'warboss-1',visibility:'full'});
  act('shoot-confirm');act('shoot-roll');act('shoot-roll');act('shoot-roll',{},1);
  act('shoot-allocate',{model:'warboss-1'});assert.equal(s.shooting.stage,'damage');
  assert.equal(engine.validate(JSON.parse(JSON.stringify(s))),true);
  const badTarget=structuredClone(s);badTarget.shooting.shot.allocated='gretchin-1';
  assert.equal(engine.validate(badTarget),false);
  act('shoot-roll',{},2);
  assert.deepEqual(s.history.at(-1).dice,[2]);assert.equal(s.hp['warboss-1'],4);
  assert.equal(engine.validate(JSON.parse(JSON.stringify(s))),true);
  for(const mutate of [x=>x.history.at(-1).dice.push(5),x=>x.rolls.at(-1).bonus=2,x=>x.hp['warboss-1']--]){
    const bad=structuredClone(s);mutate(bad);assert.equal(engine.validate(bad),false);
  }
});
