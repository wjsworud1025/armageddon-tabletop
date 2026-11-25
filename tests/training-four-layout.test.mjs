import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrainingFourTable,trainingFourAreas,trainingFourPlan,trainingFourDeploymentArea,trainingFourWorldPoint,
  trainingFourSurfaceUV,validateTrainingFourLayout} from '../data/training-four-layout.mjs';
import {measureFootprints} from '../ruler.mjs';

test('page 73 deploys 24 models from seven units on the reverse of the crosswise right-hand panel',()=>{
  const table=createTrainingFourTable();
  assert.deepEqual([table.width,table.depth,table.surface],[30,22,'reverse']);
  assert.deepEqual(trainingFourPlan.panel,{side:'right',surface:'reverse',counterclockwiseTurns:1});
  assert.deepEqual(trainingFourSurfaceUV({x:0,z:0}),{u:1,v:0});
  assert.deepEqual(trainingFourSurfaceUV({x:30,z:22}),{u:.5,v:1});
  const fighters=table.pieces.filter(p=>p.faction!=='terrain');
  const tally=fighters.reduce((counts,p)=>({...counts,[p.kind]:(counts[p.kind]??0)+1}),{});
  assert.deepEqual(tally,{captain:1,intercessor:5,landSpeeder:1,warboss:1,boy:10,gretchin:5,wartrakk:1});
  assert.equal(fighters.length,24);
  assert.equal(fighters.filter(p=>p.kind==='boy'&&Math.abs(p.baseWidth*25.4-40)<1e-8).length,1);
  assert.deepEqual(validateTrainingFourLayout(table),[]);
  for(const [i,a] of fighters.entries())for(const b of fighters.slice(0,i))
    assert.ok(measureFootprints(a,b).horizontal>.001,`${a.id} vs ${b.id}`);
});

test('each print landmark has a world polygon, with four occupied and a free western vent',()=>{
  assert.equal(trainingFourAreas.length,5);
  const table=createTrainingFourTable();
  const counts=Object.fromEntries(trainingFourAreas.map(({id,polygon,terrainIds})=>{
    const [[left,top],,[right,bottom]]=polygon;
    assert.deepEqual(polygon,[[left,top],[right,top],[right,bottom],[left,bottom]]);
    const inside=table.pieces.filter(p=>p.x>=left&&p.x<=right&&p.z>=top&&p.z<=bottom);
    assert.deepEqual(inside.filter(p=>p.faction==='terrain').map(p=>p.id).sort(),[...terrainIds].sort());
    return [id,inside.filter(p=>p.faction!=='terrain').length];
  }));
  assert.deepEqual(counts,{'ork-foundation':12,'western-vent':0,'marine-foundation':2,'grot-foundation':5,'eastern-vent':5});
  assert.deepEqual(trainingFourAreas.filter(area=>area.terrainIds.length>0).map(area=>area.id),
    ['ork-foundation','marine-foundation','grot-foundation']);
  for(const p of table.pieces)assert.ok(trainingFourDeploymentArea(p),p.id);
});

test('a rotated oval may straddle its printed deployment area and must still touch it',()=>{
  const table=createTrainingFourTable(),speeder=table.pieces.find(p=>p.kind==='landSpeeder');
  Object.assign(speeder,trainingFourWorldPoint({x:3.4,z:18.8}),{yaw:0});
  assert.deepEqual(validateTrainingFourLayout(table),[]);
  speeder.yaw=Math.PI/2;
  assert.deepEqual(validateTrainingFourLayout(table),['zone '+speeder.id]);
});

test('touching infantry rims are a legal deployment; crossing rims is rejected',()=>{
  const table=createTrainingFourTable();
  const first=table.pieces.find(p=>p.id==='intercessor-1'),second=table.pieces.find(p=>p.id==='intercessor-2');
  Object.assign(first,{x:second.x-first.baseWidth,z:second.z});
  assert.deepEqual(validateTrainingFourLayout(table),[]);
  first.x+=.001;
  assert.ok(validateTrainingFourLayout(table).some(e=>e.startsWith('overlap ')));
});

test('rotation changes how far the oval extends at an edge; fresh tables have independent poses',()=>{
  const table=createTrainingFourTable(),speeder=table.pieces.find(p=>p.kind==='landSpeeder');
  Object.assign(speeder,{x:-13.3,z:8,yaw:0});
  assert.ok(!validateTrainingFourLayout(table).includes('boundary '+speeder.id));
  speeder.yaw=Math.PI/2;
  assert.ok(validateTrainingFourLayout(table).includes('boundary '+speeder.id));
  assert.deepEqual(validateTrainingFourLayout(createTrainingFourTable()),[]);
});

test('rejects coincident vehicle and infantry bases, an obstructing wall, wrong area and roster',()=>{
  const table=createTrainingFourTable(),find=id=>table.pieces.find(p=>p.id===id);
  const speeder=find('landSpeeder-1'),captain=find('captain-1');
  Object.assign(speeder,{x:captain.x,z:captain.z});
  assert.ok(validateTrainingFourLayout(table).some(e=>e.startsWith('overlap ')&&e.includes('landSpeeder-1')&&e.includes('captain-1')));
  Object.assign(speeder,trainingFourWorldPoint({x:5.7,z:13.2}));
  assert.ok(validateTrainingFourLayout(table).some(e=>e.includes('wall overlap landSpeeder-1 smallRuin-3')));
  Object.assign(find('intercessor-1'),trainingFourWorldPoint({x:10,z:8}));
  assert.ok(validateTrainingFourLayout(table).includes('zone intercessor-1'));
  table.pieces.pop();
  assert.deepEqual(validateTrainingFourLayout(table),['roster']);
});
