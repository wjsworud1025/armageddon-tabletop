import assert from 'node:assert/strict';
import test from 'node:test';
import {createTable} from '../data/catalog.mjs';
import {layoutGeometry,layoutScenery} from '../layouts.mjs';
import {previousHandbookField} from '../data/training-two-layout.mjs';
import {createTrainingThreeTable,trainingThreeMapPoint,trainingThreeWorldPoint,trainingThreeWallSegments,validateTrainingThreeLayout} from '../data/training-three-layout.mjs';
import {createTrainingFourTable,validateTrainingFourLayout} from '../data/training-four-layout.mjs';

const shrine=pieces=>pieces.find(p=>p.id==='smallRuin-1');
const toUV=p=>({x:203+(15-p.z)*1129/30,z:154+(22+p.x)*1654/44});

function segmentDistance(p,a,b){
  const dx=b.x-a.x,dz=b.z-a.z;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));
  return Math.hypot(a.x+t*dx-p.x,a.z+t*dz-p.z);
}

test('the two sides of the blue-home corner follow both printed wall bands and leave the courtyard open',()=>{
  // Independent samples on and between the yellow walls in the 1535 × 1961 maps.
  const samples=[
    ['A',[1216,285],[1190,285],[1216,307],[1197,307]],
    ['B',[820,326],[794,326],[820,348],[801,348]],
    ['C',[1021,252],[1021,292],[1042,252],[1042,288]],
  ];
  for(const [map,corner,long,short,court] of samples){
    const geo=layoutGeometry(map,4),wall=shrine(geo.terrain);
    const [a,b,c]=trainingThreeWallSegments(wall).map(toUV);
    const point=([x,z])=>({x,z});
    assert.ok(Math.hypot(b.x-corner[0],b.z-corner[1])<1,map);
    assert.ok(segmentDistance(point(long),a,b)<4,map+' long wall');
    assert.ok(segmentDistance(point(short),b,c)<4,map+' short wall');
    assert.ok(Math.min(segmentDistance(point(court),a,b),segmentDistance(point(court),b,c))>15,map+' open court');
    const prior=layoutGeometry(map,3);
    assert.deepEqual(geo.terrain.filter(p=>p.id!==wall.id),prior.terrain.filter(p=>p.id!==wall.id));
    const table=createTable(),piece=shrine(table.pieces);
    for(const v of [1,2,3,4]){
      for(const [p,pose] of layoutScenery(table,layoutGeometry(map,v)))Object.assign(p,pose);
      assert.equal(piece.previousSmallRuin,v<4);
      assert.equal(piece.baseDepth,v<4?1.4:1.25);
    }
  }
});

test('pages 67 and 73 align the two new wall arms on the white elbow and retain the earlier casting for old deployments',()=>{
  for(const [scenario,create,validate] of [[3,createTrainingThreeTable,validateTrainingThreeLayout],[4,createTrainingFourTable,validateTrainingFourLayout]]){
    const table=create(),wall=shrine(table.pieces);
    const [a,b,c]=trainingThreeWallSegments(wall).map(trainingThreeMapPoint);
    assert.ok(Math.hypot(b.x-15.35,b.z-16.25)<.001);
    assert.ok(Math.abs(a.x-b.x)<.04&&a.z-b.z>1.8);
    assert.ok(Math.abs(c.z-b.z)<.02&&c.x-b.x>1);
    const place=(field,x,z)=>Object.assign(field.pieces.find(p=>p.id==='gretchin-1'),trainingThreeWorldPoint({x,z}));
    place(table,16,17.10);
    assert.deepEqual(validate(table),[]);
    place(table,16,16.56);
    assert.ok(validate(table).some(e=>e.startsWith('wall overlap gretchin-1')));
    for(const revision of [1,2]){
      const old=previousHandbookField(scenario,create(),revision),p=shrine(old.pieces);
      assert.equal(p.baseDepth,1.4);
      assert.deepEqual(trainingThreeMapPoint(p),{x:16.05,z:18.25});
      assert.equal(p.yaw,Math.PI/2);
      assert.equal(trainingThreeWallSegments(p).length,2);
      place(old,16,16.56);
      assert.deepEqual(validate(old),[]);
    }
  }
});
