import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTrainingThreeDeployment,moveTrainingThreeDeployment,trainingThreeDeploymentPieces,
} from './training-three-deployment.mjs';
import {
  createTrainingThreeBattle,actTrainingThreeBattle,trainingThreeBattleView,
  trainingThreeBattlePieces,validateTrainingThreeBattle,
} from './training-three-battle.mjs';
import {createTrainingTwo,validateTrainingTwo} from './training-two.mjs';

const initial=()=>createTrainingThreeBattle(createTrainingThreeDeployment());
const act=(s,type,details={},die=6)=>actTrainingThreeBattle(s,{type,...details},()=>die);
const read=id=>s=>trainingThreeBattlePieces(s).find(p=>p.id===id);
const saved=s=>JSON.parse(JSON.stringify(s));

function afterFirstOrkTurn(){
  let s=initial();
  for(const action of ['next','shoot-next','next','next'])s=act(s,action);
  assert.deepEqual([s.round,s.active,s.phase],[1,'marines','movement']);
  return s;
}

test('page 68 opens with the Orks even when Marines will move next in a resumed battle',()=>{
  const deployment=createTrainingThreeDeployment();
  const placement=moveTrainingThreeDeployment(deployment,'gretchin-1',2.05,5.65);
  const s=createTrainingThreeBattle(placement);
  assert.deepEqual([s.scenario,s.first,s.active,s.phase,s.round],[3,'orks','orks','movement',1]);
  assert.deepEqual(trainingThreeBattlePieces(s),trainingThreeDeploymentPieces(placement));
  assert.equal(Object.keys(s.hp).length,22);
  assert.deepEqual(trainingThreeBattleView(s).options.filter(o=>o.mode==='normal').map(o=>o.unit),
    ['warboss','boy-0','gretchin']);
  assert.ok(validateTrainingThreeBattle(saved(s)));
  assert.ok(validateTrainingThreeBattle(saved(afterFirstOrkTurn())));
  assert.throws(()=>createTrainingThreeBattle({...deployment,positions:{'gretchin-1':{x:-10,z:5}}}));
  assert.equal(validateTrainingThreeBattle(createTrainingTwo()),false);
  assert.equal(validateTrainingTwo(s),false);

  const forged=saved(s);
  forged.first='marines';forged.active='marines';
  assert.equal(validateTrainingThreeBattle(forged),false);
  assert.throws(()=>act(forged,'next'));
  assert.equal(validateTrainingThreeBattle({...afterFirstOrkTurn(),first:'marines'}),false);
});

test('Orks then Marines take all four phases of each of five rounds before a draw',()=>{
  let s=initial();
  for(let i=0;i<10;i++){
    assert.deepEqual([s.round,s.active,s.phase],[1+Math.floor(i/2),i%2?'marines':'orks','movement']);
    s=act(s,'next');assert.equal(s.phase,'shooting');assert.equal(s.shooting.stage,'unit');
    assert.throws(()=>act(s,'next'));
    s=act(s,'shoot-next');assert.equal(s.phase,'charge');assert.equal(s.shooting,null);
    s=act(s,'next');assert.equal(s.phase,'fight');
    s=act(s,'next');
  }
  assert.deepEqual([s.phase,s.winner,s.round],['ended','draw',5]);
  assert.deepEqual(trainingThreeBattleView(s).options,[]);
  assert.throws(()=>act(s,'next'));
  assert.ok(validateTrainingThreeBattle(saved(s)));
});

test('Gretchin cannot cross the straight ruin, and a pending advance excludes their unit from shooting or charging',()=>{
  let s=initial();
  const g=read('gretchin-1')(s);
  s=act(s,'move',{unit:'gretchin',mode:'advance'},3);
  assert.deepEqual(s.history.at(-1).dice,[3]);
  assert.throws(()=>act(s,'path',{id:g.id,x:g.x-1.9,z:g.z}),/벽/);
  s=act(s,'path',{id:g.id,x:g.x+.10,z:g.z+.03});
  assert.ok(validateTrainingThreeBattle(saved(s)));
  const forged=saved(s);forged.plan.paths[g.id][0].x+=.1;
  assert.equal(validateTrainingThreeBattle(forged),false);
  s=act(act(s,'finish'),'next');
  assert.equal(trainingThreeBattleView(s).options.some(o=>o.unit==='gretchin'),false);
  s=act(s,'shoot-next');
  assert.equal(trainingThreeBattleView(s).options.some(o=>o.unit==='gretchin'),false);
});

test('a Captain can negotiate the ruin, charge the Gretchin and resolve his melee attacks',()=>{
  let s=afterFirstOrkTurn();
  const c=read('captain-1')(s);
  s=act(s,'move',{unit:'captain',mode:'normal'});
  s=act(s,'path',{id:c.id,x:c.x,z:6});
  s=act(s,'path',{id:c.id,x:-5.56,z:6});
  s=act(act(act(s,'finish'),'next'),'shoot-next');
  assert.equal(s.phase,'charge');
  const failed=act(s,'charge',{unit:'captain'},1);
  assert.equal(failed.plan,null);assert.equal(failed.charged.captain,false);
  s=act(s,'charge',{unit:'captain'});
  assert.ok(s.plan.targets.includes('gretchin'));
  s=act(s,'target',{unit:'gretchin'});
  s=act(s,'path',{id:c.id,x:-1.34,z:6});
  s=act(act(s,'finish'),'next');
  s=act(act(s,'next'),'next');
  assert.deepEqual(trainingThreeBattleView(s).options.map(o=>o.unit),['captain']);
  s=act(s,'fight',{unit:'captain'});
  s=actTrainingThreeBattle(s,trainingThreeBattleView(s).options.find(o=>o.target==='gretchin'));
  s=act(act(s,'roll'),'roll');
  assert.equal(trainingThreeBattleView(s).actor,'orks');
  s=act(s,'roll',{},1);
  assert.ok(validateTrainingThreeBattle(saved(s)));
  const grot='gretchin-1';
  s=act(s,'allocate',{model:grot});
  assert.equal(read(grot)(s).removed,true);
  assert.equal(s.winner,null);
  assert.ok(validateTrainingThreeBattle(saved(s)));
});

test('visible ranged attacks can eliminate an army and replay all weapon, sight, dice and casualty choices',()=>{
  let s=afterFirstOrkTurn(),checkpoint=null;
  for(let actions=0;!s.winner&&actions<1500;actions++){
    const v=trainingThreeBattleView(s);
    let choice;
    if(s.phase!=='shooting')choice=v.options.find(o=>o.type==='next');
    else if(s.active==='orks')choice=v.options.find(o=>o.type==='shoot-next');
    else if(v.shooting.stage==='sight'){
      const missing=v.shooting.visibility.find(row=>!row.visibility);
      choice=missing?v.options.find(o=>o.type==='shoot-sight'&&o.id===missing.id&&o.visibility==='full'):
        v.options.find(o=>o.type==='shoot-confirm');
    }else choice=v.options[0];
    assert.ok(choice,'A legal next choice is available');
    const die=v.shooting?.stage==='save'?1:6;
    s=actTrainingThreeBattle(s,choice,()=>die);
    if(!checkpoint&&s.shooting?.stage==='allocate')checkpoint=saved(s);
  }
  assert.ok(checkpoint);
  assert.ok(validateTrainingThreeBattle(checkpoint));
  assert.deepEqual([s.phase,s.winner],['ended','marines']);
  assert.equal(trainingThreeBattlePieces(s).filter(p=>p.faction==='orks'&&!p.removed).length,0);
  assert.ok(validateTrainingThreeBattle(saved(s)));
  const sight=checkpoint.history.findIndex(r=>r.action.type==='shoot-sight');
  const roll=checkpoint.history.findIndex(r=>r.action.type==='shoot-roll');
  for(const tamper of [
    q=>{q.history[sight].action.visibility='none';},q=>{q.history[roll].dice[0]=7;},
    q=>{q.history[roll].dice.push(1);},q=>{q.shooting.stage='hit';},
    q=>{q.hp['warboss-1']=2;},q=>{q.initial['captain-1'].yaw+=.01;},
  ]){
    const forged=saved(checkpoint);tamper(forged);
    assert.equal(validateTrainingThreeBattle(forged),false);
  }
});
