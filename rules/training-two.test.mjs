import test from 'node:test';
import assert from 'node:assert/strict';
import {actTrainingTwo, createTrainingTwo, trainingTwoPieces, trainingTwoView, validateTrainingTwo} from './training-two.mjs';

const act = (s, type, extra = {}, d6 = () => 6) => actTrainingTwo(s, {type, ...extra}, d6);
const lookup = (s, id) => trainingTwoPieces(s).find(p => p.id === id);

test('the Orks start and both sides receive five complete turns when both armies survive', () => {
  let s = createTrainingTwo();
  assert.equal(trainingTwoPieces(s).filter(p => p.faction !== 'terrain').length, 17);
  for (let i = 0; i < 10; i++) {
    assert.equal(s.round, Math.floor(i / 2) + 1);
    assert.equal(s.active, i % 2 ? 'marines' : 'orks');
    assert.equal(s.phase, 'movement');
    s = act(s, 'next');
    assert.equal(s.phase, 'charge');
    s = act(s, 'next');
    assert.equal(s.phase, 'fight');
    s = act(s, 'next');
  }
  assert.equal(s.winner, 'draw');
  assert.equal(s.phase, 'ended');
  assert.ok(validateTrainingTwo(JSON.parse(JSON.stringify(s))));
  assert.throws(() => act(s, 'next'));
});

test('advance roll is shared and persistent, paths respect accumulated distances and remain editable', () => {
  let s = createTrainingTwo();
  const old = lookup(s, 'warboss-1');
  assert.throws(() => act(s, 'move', {unit: 'captain', mode: 'normal'}));
  s = act(s, 'move', {unit: 'warboss', mode: 'advance'}, () => 2);
  assert.equal(s.plan.limit, 8);
  assert.throws(() => act(s, 'next'));
  assert.throws(() => act(s, 'path', {id:'warboss-1', x:old.x-9, z:old.z}));
  s = act(s, 'path', {id:'warboss-1', x:old.x-5, z:old.z});
  assert.equal(lookup(s, 'warboss-1').x, old.x - 5);
  assert.throws(() => act(s, 'path', {id:'warboss-1', x:old.x, z:old.z}));
  assert.ok(validateTrainingTwo(JSON.parse(JSON.stringify(s))));
  s = act(s, 'rewind');
  assert.equal(lookup(s, 'warboss-1').x, old.x);
  assert.equal(s.plan.limit, 8);
  s = act(s, 'finish');
  s = act(s, 'next');
  assert.throws(() => act(s, 'charge', {unit:'warboss'}));
});

test('a charge roll precedes target choice and insufficient distance spends the attempt', () => {
  let s = createTrainingTwo();
  const start=lookup(s,'warboss-1');
  s=act(s,'move',{unit:'warboss',mode:'normal'});
  s=act(s,'path',{id:start.id,x:start.x-2,z:start.z});
  s=act(act(s,'finish'),'next');
  s = act(s, 'charge', {unit:'warboss'}, () => 1);
  assert.equal(s.plan, null);
  assert.throws(() => act(s, 'charge', {unit:'warboss'}));
  assert.deepEqual(s.rolls.at(-1).dice, [1,1]);
  assert.ok(validateTrainingTwo(s));
  assert.equal(validateTrainingTwo({...s,round:4}), false);
});

function chargeWarboss() {
  let s=createTrainingTwo();
  const w=lookup(s,'warboss-1'), c=lookup(s,'captain-1');
  const d=Math.hypot(c.x-w.x,c.z-w.z), ux=(c.x-w.x)/d, uz=(c.z-w.z)/d;
  s=act(s,'move',{unit:'warboss',mode:'normal'});
  s=act(s,'path',{id:w.id,x:w.x+5*ux,z:w.z+5*uz});
  s=act(act(s,'finish'),'next');
  s=act(s,'charge',{unit:'warboss'});
  assert.equal(s.plan.target,null);
  s=act(s,'target',{unit:'captain'});
  assert.throws(()=>act(s,'finish'));
  const sep=(c.baseWidth+w.baseWidth)/2+.05;
  s=act(s,'path',{id:w.id,x:c.x-ux*sep,z:c.z-uz*sep});
  return act(act(s,'finish'),'next');
}

test('both armies pile before attacks, chargers strike first, the defending player saves and allocates damage', () => {
  let s=chargeWarboss();
  assert.equal(trainingTwoView(s).actor,'orks');
  s=act(s,'next');
  assert.equal(trainingTwoView(s).actor,'marines');
  s=act(s,'next');
  assert.deepEqual(trainingTwoView(s).options.map(o=>o.unit),['warboss']);
  s=act(s,'fight',{unit:'warboss'});
  const strike=trainingTwoView(s).options.find(o=>o.target==='captain');
  s=actTrainingTwo(s,strike);
  assert.equal(s.attack.count,6);
  s=act(s,'roll');
  s=act(s,'roll');
  assert.equal(trainingTwoView(s).actor,'marines');
  s=act(s,'roll',{},()=>1);
  assert.equal(s.rolls.at(-1).threshold,4);
  s=act(s,'allocate',{model:'captain-1'});
  assert.equal(s.hp['captain-1'],4);
  assert.throws(()=>act(s,'allocate',{model:'intercessor-1'}));
  assert.ok(validateTrainingTwo(JSON.parse(JSON.stringify(s))));
  s=act(s,'allocate',{model:'captain-1'});
  s=act(s,'allocate',{model:'captain-1'});
  assert.equal(lookup(s,'captain-1').removed,true);
  assert.equal(s.winner,null);
  // No further wounds from the attack carry into the neighbouring unit.
  assert.equal(s.hp['intercessor-1'],2);
  let guard=0;
  while(!s.winner && guard++<150) {
    const {options}=trainingTwoView(s);
    const choice=options.find(o=>o.type==='next')??options[0];
    assert.ok(choice);
    const forceMiss=s.attack?.stage==='hit' && s.attack.unit==='intercessor';
    const failedSave=s.attack?.stage==='save';
    s=actTrainingTwo(s,choice,()=>forceMiss||failedSave?1:6);
  }
  assert.equal(s.winner,'orks');
  assert.equal(s.round,1);
  assert.equal(s.phase,'ended');
  assert.ok(validateTrainingTwo(s));
  assert.equal(validateTrainingTwo({...s,hp:{...s.hp,'captain-1':1}}),false);
});

test('an injured Nob takes the next wound in his unit before an untouched Boy can be chosen', () => {
  let s=createTrainingTwo();
  function translate(unit,dx,dz) {
    const p=trainingTwoPieces(s).filter(m=>s.plan.ids.includes(m.id));
    assert.equal(s.plan.unit,unit);
    for(const m of p)s=act(s,'path',{id:m.id,x:m.x+dx,z:m.z+dz});
    s=act(s,'finish');
  }
  s=act(s,'move',{unit:'warboss',mode:'normal'});
  translate('warboss',-5.5,-1);
  s=act(s,'move',{unit:'boy-0',mode:'normal'});
  translate('boy-0',-4.8,3.3);
  s=act(s,'next');
  s=act(s,'charge',{unit:'boy-0'});
  assert.throws(()=>act(s,'blocked'));
  s=act(s,'target',{unit:'intercessor'});
  translate('boy-0',-6.7,3.5);
  s=act(act(act(s,'next'),'next'),'next');
  s=act(s,'fight',{unit:'boy-0'});
  while(s.attack) {
    const move=trainingTwoView(s).options[0];
    s=actTrainingTwo(s,move,()=>1);
  }
  s=act(s,'fight',{unit:'intercessor'});
  const strike=trainingTwoView(s).options.find(o=>o.target==='boy-0');
  s=actTrainingTwo(s,strike);
  s=act(act(s,'roll'),'roll');
  s=act(s,'roll',{},()=>1);
  assert.equal(trainingTwoView(s).options.length,10);
  s=act(s,'allocate',{model:'boy-1'});
  assert.equal(s.hp['boy-1'],1);
  assert.deepEqual(trainingTwoView(s).options.map(o=>o.model),['boy-1']);
  assert.throws(()=>act(s,'allocate',{model:'boy-2'}));
  s=act(s,'allocate',{model:'boy-1'});
  assert.equal(lookup(s,'boy-1').removed,true);
  assert.ok(validateTrainingTwo(JSON.parse(JSON.stringify(s))));
});

test('the displayed thin wall blocks a crossing, and the space between its two arms stays playable', () => {
  let s=act(createTrainingTwo(),'move',{unit:'boy-0',mode:'normal'});
  const boy=lookup(s,'boy-5');
  assert.throws(()=>act(s,'path',{id:boy.id,x:boy.x,z:boy.z-3.4}),/벽/);
  s=act(s,'path',{id:boy.id,x:boy.x-.1,z:boy.z-.1});
  assert.ok(validateTrainingTwo(s));
});

test('engaged troops can stay or fall back, and a retreat consumes a charge opportunity', () => {
  let s=chargeWarboss();
  for(let n=0;s.active!=='marines' && n<100;n++){
    const choices=trainingTwoView(s).options;
    const choice=choices.find(o=>o.type==='next')??choices[0];
    s=actTrainingTwo(s,choice,()=>1);
  }
  assert.equal(s.phase,'movement');
  assert.deepEqual(trainingTwoView(s).options.filter(o=>o.unit==='captain').map(o=>o.mode),['fallback']);
  s=act(s,'move',{unit:'captain',mode:'fallback'});
  assert.throws(()=>act(s,'finish'));
  const p=lookup(s,'captain-1');
  s=act(s,'path',{id:p.id,x:p.x+2.6,z:p.z+4.4});
  s=act(act(s,'finish'),'next');
  assert.throws(()=>act(s,'charge',{unit:'captain'}));
  assert.ok(validateTrainingTwo(s));
});
