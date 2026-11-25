import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrainingThreeTable} from '../data/training-three-layout.mjs';
import {getProfile} from './profiles.mjs';
import {newTrainingShooting,trainingShootingView,applyTrainingShooting} from './training-three-shooting.mjs';

const table=createTrainingThreeTable();
function fixture(poses,team='marines',moved={}){
  const pieces=table.pieces.map(p=>({...p,removed:!Object.hasOwn(poses,p.id),x:poses[p.id]?.[0]??p.x,z:poses[p.id]?.[1]??p.z}));
  const hp=Object.fromEntries(pieces.filter(p=>getProfile(p)).map(p=>[p.id,p.removed?0:getProfile(p).wounds]));
  return {pieces,state:{scenario:3,active:team,phase:'shooting',moved,hp,shooting:newTrainingShooting()},log:[],history:[]};
}
const view=g=>trainingShootingView(g.state,g.pieces);
const has=(g,type,params={})=>view(g).options.some(o=>o.type===type&&Object.keys(params).every(k=>o[k]===params[k]));
function act(g,type,data={},dice=[]){
  const action={type,...data},start=structuredClone(g.state);
  let i=0;
  const out=applyTrainingShooting(g.state,g.pieces,action,()=>{assert.ok(i<dice.length);return dice[i++];});
  assert.equal(i,dice.length);assert.deepEqual(g.state,start);
  return {...g,state:{...g.state,hp:out.hp,shooting:out.shooting},log:[...g.log,...out.rolls],history:[...g.history,{action,dice}],finished:out.finished};
}
function aim(g,unit,model,weapon,target){
  return act(act(act(g,'shoot-unit',{unit}),'shoot-weapon',{model,weapon}),'shoot-target',{target});
}
const sight=(g,id,visibility)=>act(g,'shoot-sight',{model:g.state.shooting.shot.model,id,visibility});
const roll=(g,...dice)=>act(g,'shoot-roll',{},dice);

test('range and line of sight must meet on one target; all target models participate in cover',()=>{
  const f=fixture({'intercessor-1':[0,0],'boy-2':[6,0],'boy-3':[18,0]});
  let g=aim(f,'intercessor','intercessor-1',1,'boy-0');
  g=sight(sight(g,'boy-2','none'),'boy-3','full');
  assert.equal(has(g,'shoot-confirm'),false);
  assert.deepEqual(view(g).visibility.map(v=>[v.range,v.visibility]),[[true,'none'],[false,'full']]);
  assert.throws(()=>act(g,'shoot-confirm'));
  g=sight(g,'boy-2','partial');
  const open=act(g,'shoot-confirm');assert.equal(open.state.shooting.shot.cover,false);
  assert.equal(roll(open,3).log.at(-1).successes,1);
  g=act(sight(g,'boy-3','none'),'shoot-confirm');
  assert.equal(g.state.shooting.shot.cover,true);
  g=roll(g,3);assert.equal(view(g).stage,'weapon');assert.equal(g.log.at(-1).threshold,4);
});
test('advancing or falling back prohibits even Assault, and engaged units use only close-quarters against contacts',()=>{
  const coords={'captain-1':[0,0],'intercessor-1':[0,8],'warboss-1':[2.7,0],'gretchin-1':[8,0]};
  for(const mode of ['advance','fallback']){
    const f=fixture(coords,'marines',{intercessor:mode,captain:mode});
    assert.deepEqual(view(f).options.map(o=>o.type),['shoot-next']);
  }
  let g=act(fixture(coords),'shoot-unit',{unit:'captain'});g=act(g,'shoot-weapon',{model:'captain-1',weapon:0});
  assert.deepEqual(view(g).options.filter(o=>o.type==='shoot-target').map(o=>o.target),['warboss']);
  g=act(fixture(coords),'shoot-unit',{unit:'intercessor'});g=act(g,'shoot-weapon',{model:'intercessor-1',weapon:0});
  assert.deepEqual(view(g).options.filter(o=>o.type==='shoot-target').map(o=>o.target),['gretchin']);
  const tied=fixture({'intercessor-1':[0,0],'warboss-1':[2,0]});
  assert.deepEqual(view(act(tied,'shoot-unit',{unit:'intercessor'})).options.filter(o=>o.type==='shoot-weapon').map(o=>o.weapon),[1]);
});
test('shot rolls are sequential, defender assigns each failure, wounds stay on an injured body and excess is lost',()=>{
  let g=fixture({'intercessor-2':[0,0],'boy-1':[8,0],'boy-2':[8,2]});
  g.state.hp['boy-1']=1;
  g=aim(g,'intercessor','intercessor-2',4,'boy-0');
  g=act(sight(sight(g,'boy-1','full'),'boy-2','none'),'shoot-confirm');
  g=roll(g,5,6);assert.equal(view(g).actor,'marines');
  g=roll(g,4,6);assert.equal(view(g).actor,'orks');
  g=roll(g,1,1);assert.deepEqual(view(g).options.map(o=>o.model),['boy-1']);
  assert.deepEqual(g.log.map(r=>[r.step,r.actor,r.threshold]),[['hit','marines',3],['wound','marines',4],['save','orks',7]]);
  g=act(g,'shoot-allocate',{model:'boy-1'});
  assert.equal(g.state.hp['boy-1'],0);assert.equal(g.state.hp['boy-2'],1);
  g=act(g,'shoot-allocate',{model:'boy-2'});assert.equal(g.state.hp['boy-2'],0);assert.equal(view(g).stage,'weapon');
});
test('visibility belongs to the shooter; one weapon cannot use two profiles; a unit shoots only once',()=>{
  let g=fixture({'intercessor-1':[0,0],'intercessor-2':[0,2],'warboss-1':[8,0]});
  g=aim(g,'intercessor','intercessor-2',3,'warboss');
  g=roll(act(sight(g,'warboss-1','partial'),'shoot-confirm'),1,1);
  assert.equal(has(g,'shoot-weapon',{model:'intercessor-2',weapon:4}),false);
  g=act(act(g,'shoot-weapon',{model:'intercessor-1',weapon:0}),'shoot-target',{target:'warboss'});
  assert.equal(view(g).visibility[0].visibility,null);
  g=act(g,'shoot-back');g=act(g,'shoot-back');g=act(g,'shoot-finish');
  assert.equal(has(g,'shoot-unit',{unit:'intercessor'}),false);
  assert.equal(act(g,'shoot-next').finished,true);
});
test('the action and dice history replays every sight decision, allocation, and partial roll exactly after JSON reload',()=>{
  const start=fixture({'gretchin-1':[0,0],'intercessor-1':[5,0]},'orks');
  let g=aim(start,'gretchin','gretchin-1',0,'intercessor');
  g=act(sight(g,'intercessor-1','full'),'shoot-confirm');
  g=roll(g,5);g=roll(g,6);g=roll(g,1);g=act(g,'shoot-allocate',{model:'intercessor-1'});
  g=act(g,'shoot-finish');g=act(g,'shoot-next');
  let replay=start;
  for(const {action:{type,...data},dice} of JSON.parse(JSON.stringify(g.history)))replay=act(replay,type,data,dice);
  assert.deepEqual(replay.state,g.state);assert.deepEqual(replay.log,g.log);
  assert.equal(replay.state.hp['intercessor-1'],1);
});

test('phase and scenario boundaries keep ordinary patrols and training two out of this module',()=>{
  const f=fixture({'captain-1':[0,0],'warboss-1':[8,0]});
  for(const change of [{scenario:2},{phase:'charge'},{winner:'marines'}]){
    const g={...f,state:{...f.state,...change}};
    assert.deepEqual(view(g).options,[]);assert.throws(()=>act(g,'shoot-next'));
  }
});
