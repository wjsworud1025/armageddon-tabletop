import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {
  createTrainingThreeTable,trainingThreeMapPoint,trainingThreePlan,trainingThreeSurfaceUV,
  trainingThreeWallSegments,trainingThreeWorldPoint,validateTrainingThreeLayout,
} from '../data/training-three-layout.mjs';

test('page 67 uses one crosswise 30 x 22 reverse board and separate areas for the two Ork groups',()=>{
  assert.deepEqual(trainingThreePlan.panel,{side:'right',surface:'reverse',counterclockwiseTurns:1});
  const t=createTrainingThreeTable();
  assert.deepEqual([t.width,t.depth,t.surface],[30,22,'reverse']);
  for(const [map,world,uv] of [
    [{x:0,z:0},{x:-15,z:-11},{u:1,v:0}],[{x:30,z:22},{x:15,z:11},{u:.5,v:1}],
    [{x:15,z:11},{x:0,z:0},{u:.75,v:.5}],
  ]){
    assert.deepEqual(trainingThreeWorldPoint(map),world);
    assert.deepEqual(trainingThreeMapPoint(world),map);
    assert.deepEqual(trainingThreeSurfaceUV(map),uv);
  }
  const tally={};
  for(const p of t.pieces)tally[p.kind]=(tally[p.kind]??0)+1;
  assert.deepEqual(tally,{captain:1,intercessor:5,warboss:1,boy:10,gretchin:5,largeRuin:1,smallRuin:3});
  assert.deepEqual(trainingThreePlan.walls.map(w=>w.zone),['orks','orks','marines','gretchin']);
  assert.deepEqual(validateTrainingThreeLayout(t),[]);
});

test('all 22 decoded base centres are legal simultaneously and the four terrain pieces retain their catalog dimensions',()=>{
  const t=createTrainingThreeTable(),stock=new Map(createTable().pieces.map(p=>[p.id,p]));
  const people=t.pieces.filter(p=>p.faction!=='terrain');
  let minGap=Infinity;
  for(const [id,x,z] of trainingThreePlan.modelCenters){
    const p=people.find(p=>p.id===id),q=trainingThreeMapPoint(p);
    assert.ok(Math.hypot(q.x-x,q.z-z)<1e-8,id);
    for(const other of people.filter(q=>q.id<id)){
      const gap=Math.hypot(p.x-other.x,p.z-other.z)-(p.baseWidth+other.baseWidth)/2;
      minGap=Math.min(minGap,gap);
    }
  }
  assert.ok(minGap>.023&&minGap<.025,minGap);
  assert.equal(people.filter(p=>p.kind==='boy'&&Math.abs(p.baseWidth*25.4-40)<1e-8).length,1);
  for(const p of t.pieces.filter(p=>p.faction==='terrain')){
    assert.deepEqual([p.baseWidth,p.baseDepth],[stock.get(p.id).baseWidth,stock.get(p.id).baseDepth]);
    assert.equal(trainingThreeWallSegments(p).length,3);
    assert.ok(!Object.hasOwn(p,'scale')&&!Object.hasOwn(p,'displayScale'));
  }
  t.pieces[0].removed=true;
  assert.deepEqual(validateTrainingThreeLayout(createTrainingThreeTable()),[]);
});

test('a grot cannot deploy with Boyz, through a wall, over another base or over the edge',()=>{
  const t=createTrainingThreeTable(),g=t.pieces.find(p=>p.id==='gretchin-1');
  const move=(x,z)=>Object.assign(g,trainingThreeWorldPoint({x,z}));
  move(20,8);assert.ok(validateTrainingThreeLayout(t).includes('zone '+g.id));
  move(15.6,18.3);assert.ok(validateTrainingThreeLayout(t).includes('wall overlap '+g.id));
  move(17.59,17.98);assert.ok(validateTrainingThreeLayout(t).some(issue=>issue.startsWith('overlap ')));
  move(-1,2);assert.ok(validateTrainingThreeLayout(t).includes('boundary '+g.id));
});

test('the two Ork ruins cannot occupy the same wall line and every catalog piece must appear once',()=>{
  const t=createTrainingThreeTable(),wall=t.pieces.find(p=>p.id==='smallRuin-2');
  Object.assign(wall,trainingThreeWorldPoint({x:17.20,z:7.30}),{yaw:Math.PI/2});
  assert.ok(validateTrainingThreeLayout(t).some(issue=>issue.startsWith('wall clash ')));
  Object.assign(wall,trainingThreeWorldPoint({x:29.9,z:11}));
  assert.ok(validateTrainingThreeLayout(t).includes('boundary '+wall.id));
  t.pieces[0].id=t.pieces[1].id;
  assert.deepEqual(validateTrainingThreeLayout(t),['roster']);
});
