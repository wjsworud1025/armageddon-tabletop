import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {getProfile} from './profiles.mjs';
import {newTrainingFourObjectives,trainingFourRosterIds,trainingFourCommandView,applyTrainingFourCommand,
  trainingFourControl,trainingFourVP,trainingFourShocked,trainingFourOutcome,trainingFourNextTurn,validTrainingFourObjectives} from './training-four-objectives.mjs';

const stock=createTable().pieces;
const footprint=(id,x,idTerrain)=>({id,name:id,polygon:[[x-1,-1],[x+1,-1],[x+1,1],[x-1,1]],terrainIds:[idTerrain]});
const areas=[footprint('left',0,'largeRuin-1'),footprint('center',7,'smallRuin-1'),footprint('right',14,'smallRuin-2')];
function game(positions={}){
  const pieces=stock.map(p=>({...p,x:positions[p.id]?.[0]??30,z:positions[p.id]?.[1]??15,
    yaw:positions[p.id]?.[2]??0,removed:p.faction==='terrain'?false:!trainingFourRosterIds.includes(p.id)}));
  for(const [i,a] of areas.entries())Object.assign(pieces.find(p=>p.id===a.terrainIds[0]),{x:7*i,z:0});
  const hp=Object.fromEntries(pieces.filter(p=>getProfile(p)).map(p=>[p.id,getProfile(p).wounds]));
  return {s:{scenario:4,active:'orks',round:1,phase:'command',hp,mission:newTrainingFourObjectives()},pieces};
}
const view=g=>trainingFourCommandView(g.s,g.pieces,areas);
const score={type:'four-score'},shock=unit=>({type:'four-shock',unit});
function act(g,action,dice=[]){
  let i=0;
  const before=structuredClone(g.s);
  const out=applyTrainingFourCommand(g.s,g.pieces,areas,action,()=>{assert.ok(i<dice.length);return dice[i++];});
  assert.deepEqual(g.s,before);assert.equal(i,dice.length);
  assert.equal(validTrainingFourObjectives(JSON.parse(JSON.stringify(out.mission))),true);
  return {...g,s:{...g.s,mission:out.mission},out};
}
function next(g){
  const clock=trainingFourNextTurn(g.s.round,g.s.active);
  assert.ok(clock);return {...g,s:{...g.s,...clock}};
}
test('the roster has the seven handbook units and starts with the Orks, alternating through the fifth Marine turn',()=>{
  assert.equal(trainingFourRosterIds.length,24);assert.equal(trainingFourRosterIds.includes('wartrakk-1'),true);
  assert.equal(trainingFourRosterIds.includes('landSpeeder-1'),true);assert.equal(trainingFourRosterIds.includes('boy-11'),false);
  let g=game(),sides=[];
  for(let i=0;i<10;i++){
    sides.push([g.s.round,g.s.active]);g=act(g,score);assert.equal(g.out.finished,true);
    if(i<9){assert.equal(trainingFourOutcome(g.s,g.pieces,{endOfTurn:true}),null);g=next(g);}
  }
  assert.deepEqual(sides,Array.from({length:10},(_,i)=>[1+Math.floor(i/2),i%2?'marines':'orks']));
  assert.equal(trainingFourOutcome(g.s,g.pieces),null);
  assert.equal(trainingFourOutcome(g.s,g.pieces,{endOfTurn:true}),'draw');
  assert.equal(trainingFourNextTurn(5,'marines'),null);
});
test('each of the three printed scoring rows awards 5 VP; the command cannot score again after restoration',()=>{
  for(const [positions,expected,conditions] of [
    [{},0,[false,false,false]],
    [{'boy-2':[0,0],'captain-1':[7,0]},5,[true,false,false]],
    [{'boy-2':[0,0]},10,[true,false,true]],
    [{'boy-2':[0,0],'gretchin-1':[7,0],'captain-1':[14,0]},15,[true,true,true]]
  ]){
    let g=game(positions);assert.deepEqual(view(g).award.conditions,conditions);
    g=act(g,score);assert.equal(g.out.award.points,expected);
    const restored={...g,s:JSON.parse(JSON.stringify(g.s))};
    assert.equal(view(restored).finished,true);assert.deepEqual(view(restored).options,[]);
    assert.throws(()=>act(restored,score));assert.deepEqual(trainingFourVP(g.s.mission),{orks:expected,marines:0});
  }
});
test('OC sums per model, partial oval overlap counts, an equal total has no controller, empty pads never score',()=>{
  const g=game({'captain-1':[0,0],'gretchin-1':[0,0],'boy-2':[7,0],'boy-3':[7.7,0]});
  const vehicle=g.pieces.find(p=>p.kind==='landSpeeder');
  Object.assign(vehicle,{x:14+1+vehicle.baseWidth/2-.01,z:0});
  let c=trainingFourControl(g.s,g.pieces,areas);
  assert.deepEqual(c.map(p=>[p.marines,p.orks,p.controller]),[[1,1,null],[0,4,'orks'],[2,0,'marines']]);
  vehicle.x+=.03;assert.equal(trainingFourControl(g.s,g.pieces,areas)[2].marines,0);
  g.pieces.find(p=>p.id==='smallRuin-1').removed=true;c=trainingFourControl(g.s,g.pieces,areas);
  assert.deepEqual(c.map(p=>p.id),['left','right']);
  assert.throws(()=>trainingFourControl(g.s,g.pieces,[areas[0],areas[0]]));
});
test('half-size units and half-wounded solo models test before scoring; the opponent’s half-strength unit waits',()=>{
  let g=game({'warboss-1':[0,0],'boy-2':[7,0]});
  for(let i=6;i<=10;i++)g.s.hp['boy-'+i]=0;
  g.s.hp['warboss-1']=3;g.s.hp['captain-1']=2;g.s.hp['wartrakk-1']=4;
  assert.deepEqual(new Set(view(g).options.map(o=>o.unit)),new Set(['warboss','boy-0']));
  assert.throws(()=>act(g,score));assert.throws(()=>act(g,shock('captain'),[6,6]));
  const a=act(g,shock('warboss'),[1,1]);assert.equal(a.out.rolls[0].successes,0);
  assert.throws(()=>act(a,shock('warboss'),[6,6]));assert.equal(view(a).control[0].orks,0);
  g=act(a,shock('boy-0'),[4,3]);assert.equal(g.out.rolls[0].successes,1);
  g=act(g,score);assert.equal(g.out.award.points,10);
  g=next(g);g=act(g,shock('captain'),[6,6]);g=act(g,score);
  assert.equal(trainingFourShocked(g.s.mission).warboss,true);
  g=next(g);g.s.hp['warboss-1']=6;
  assert.ok(view(g).options.some(o=>o.unit==='warboss'));
  g=act(g,shock('warboss'),[4,2]);assert.equal(trainingFourShocked(g.s.mission).warboss,undefined);
  assert.equal(view(g).control[0].orks,1);
});
test('wipeout ends immediately by current VP; even an eliminated army can win, and zero-zero is a draw',()=>{
  let g=game({'warboss-1':[0,0]});
  assert.equal(trainingFourOutcome(g.s,g.pieces),null);
  g=act(g,score);const saved=structuredClone(g.s.mission);
  for(const p of g.pieces.filter(p=>p.faction==='orks'))g.s.hp[p.id]=0;
  assert.equal(trainingFourOutcome(g.s,g.pieces),'orks');
  assert.deepEqual(g.s.mission,saved);
  g.s.mission=newTrainingFourObjectives();assert.equal(trainingFourOutcome(g.s,g.pieces),'draw');
  assert.equal(view(g).options.length,0);
});
test('a previous command’s score is fixed as models leave, and corrupt or out-of-order ledgers are rejected',()=>{
  let g=game({'warboss-1':[0,0]});g.s.hp['warboss-1']=3;
  g=act(act(g,shock('warboss'),[6,6]),score);g.pieces.find(p=>p.id==='warboss-1').x=22;
  assert.equal(view(g).control[0].orks,1);assert.equal(view(g).areas[0].orks,0);
  assert.deepEqual(view({...g,s:{...g.s,phase:'shooting'}}).areas[0],{id:'left',name:'left',marines:0,orks:0,controller:null});
  assert.equal(trainingFourVP(g.s.mission).orks,10);
  for(const mutate of [
    m=>m.turns.push(m.turns[0]),m=>m.turns[0].checks[0].dice=[7,1],m=>m.turns[0].checks[0].unit='captain',
    m=>m.turns[0].areas.push(m.turns[0].areas[0]),m=>m.turns[0].areas[0].orks='<script>',
    m=>m.turns[0].areas[0].marines=999,m=>m.turns[0].checks[0].target=2
  ]){
    const bad=structuredClone(g.s.mission);mutate(bad);assert.equal(validTrainingFourObjectives(bad),false);
  }
  const invalidPhase={...g,s:{...g.s,phase:'shooting'}};assert.throws(()=>act(invalidPhase,score));
  const skipped={...g,s:{...g.s,round:2}};assert.throws(()=>act(skipped,score));
});
