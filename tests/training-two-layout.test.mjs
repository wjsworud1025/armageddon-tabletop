import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {
  createTrainingTwoTable,trainingTwoMapPoint,trainingTwoPlan,trainingTwoSurfaceUV,
  trainingTwoWorldPoint,validateTrainingTwoLayout,
} from '../data/training-two-layout.mjs';

const close=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,a+' differs from '+b);

test('one rotated reverse panel maps 30 x 22 inches into the right half of the original texture',()=>{
  const {width,depth,panel}=trainingTwoPlan;
  assert.deepEqual([width,depth,panel.side,panel.surface,panel.counterclockwiseTurns],[30,22,'right','reverse',1]);
  const cases=[
    [{x:0,z:0},{x:-15,z:-11},{u:1,v:0}],
    [{x:30,z:0},{x:15,z:-11},{u:1,v:1}],
    [{x:0,z:22},{x:-15,z:11},{u:.5,v:0}],
    [{x:30,z:22},{x:15,z:11},{u:.5,v:1}],
    [{x:15,z:11},{x:0,z:0},{u:.75,v:.5}],
  ];
  for(const [map,world,uv] of cases){
    assert.deepEqual(trainingTwoMapPoint(world),map);
    assert.deepEqual(trainingTwoWorldPoint(map),world);
    assert.deepEqual(trainingTwoSurfaceUV(map),uv);
  }
});

test('the exact measured centers admit all 17 physical bases, including the optional identification of the Nob',()=>{
  const t=createTrainingTwoTable(),source=createTable();
  const counts={};
  for(const p of t.pieces)counts[p.kind]=(counts[p.kind]??0)+1;
  assert.deepEqual(counts,{captain:1,intercessor:5,warboss:1,boy:10,largeRuin:1,smallRuin:2});
  assert.equal(t.surface,'reverse');
  assert.deepEqual(validateTrainingTwoLayout(t),[]);
  const fighters=t.pieces.filter(p=>p.faction!=='terrain');
  let displacement=0,minGap=Infinity;
  for(const [id,x,z] of trainingTwoPlan.modelCenters){
    const p=fighters.find(p=>p.id===id),q=trainingTwoMapPoint(p);
    displacement+=Math.hypot(q.x-x,q.z-z)**2;
    const zone=trainingTwoPlan.zones[p.faction],r=p.baseWidth/2;
    assert.ok(q.x-r>=zone.left&&q.x+r<=zone.right&&q.z-r>=zone.top&&q.z+r<=zone.bottom);
    for(const other of fighters.filter(o=>o.id<id)){
      minGap=Math.min(minGap,Math.hypot(p.x-other.x,p.z-other.z)-(p.baseWidth+other.baseWidth)/2);
    }
  }
  close(displacement,0);
  assert.ok(minGap>.025&&minGap<.027);
  for(const p of t.pieces){
    const original=source.pieces.find(o=>o.id===p.id);
    assert.deepEqual([p.baseWidth,p.baseDepth],[original.baseWidth,original.baseDepth]);
    assert.ok(!Object.hasOwn(p,'displayScale')&&!Object.hasOwn(p,'scale'));
  }
  const boyz=fighters.filter(p=>p.kind==='boy');
  assert.equal(boyz.filter(p=>Math.abs(p.baseWidth*25.4-40)<1e-8).length,1);
  assert.equal(boyz.filter(p=>Math.abs(p.baseWidth*25.4-32)<1e-8).length,9);
  t.pieces[0].x=100;
  assert.deepEqual(validateTrainingTwoLayout(createTrainingTwoTable()),[]);
});

test('validation detects duplicate participants, off-mat ground, zone spill, base and wall overlap',()=>{
  const table=createTrainingTwoTable();
  assert.deepEqual(validateTrainingTwoLayout({...table,surface:'front'}),['board']);
  const set=(id,x,z)=>Object.assign(table.pieces.find(p=>p.id===id),trainingTwoWorldPoint({x,z}));
  set('captain-1',2.04,14.62);
  assert.ok(validateTrainingTwoLayout(table).some(e=>e.startsWith('overlap ')));
  set('captain-1',.96,13.5);
  assert.ok(validateTrainingTwoLayout(table).includes('zone captain-1'));
  set('captain-1',1.85,15.1);
  assert.ok(validateTrainingTwoLayout(table).includes('wall overlap captain-1'));
  set('largeRuin-2',29.95,4);
  assert.ok(validateTrainingTwoLayout(table).includes('boundary largeRuin-2'));
  set('captain-1',-1,2);
  assert.ok(validateTrainingTwoLayout(table).includes('boundary captain-1'));
  table.pieces[0].id=table.pieces[1].id;
  assert.deepEqual(validateTrainingTwoLayout(table),['roster']);
});
