import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutGeometry,overlapsArea} from '../layouts.mjs';
import {patrolTerrainAreas} from '../data/patrol-terrain-areas.mjs';

const world=([u,v])=>[(v-154)*44/1654-22,15-(u-203)*30/1129];
function contains(area,[x,z]) {
  return overlapsArea({x,z,yaw:0,baseWidth:.0001,baseDepth:.0001},area.polygon);
}

for(const map of ['A','B','C']) {
  test(map+' has ten printed mats, four objectives and fourteen assigned terrain features',()=>{
    const layout=layoutGeometry(map);
    const areas=patrolTerrainAreas(map,layout.areas,world);
    assert.equal(areas.length,10);
    assert.equal(new Set(areas.map(area=>area.id)).size,10);
    const objectives=areas.filter(area=>area.objective);
    assert.deepEqual(objectives.map(area=>area.id),['blue-home','red-home','neutral-1','neutral-2']);
    for(let i=0;i<4;i++)assert.equal(objectives[i].polygon,layout.areas[i].polygon);
    assert.equal(areas.filter(area=>!area.objective && area.side===null).length,6);
    assert.deepEqual(areas.flatMap(area=>area.terrainIds).sort(),layout.terrain.map(p=>p.id).sort());
    const colors=areas.flatMap(area=>Object.values(area.featureColors));
    assert.equal(colors.filter(color=>color==='green').length,8);
    assert.equal(colors.filter(color=>color==='yellow').length,6);
    for(const home of objectives.slice(0,2)){
      assert.deepEqual(Object.values(home.featureColors).sort(),['green','yellow','yellow']);
    }
    for(const area of areas) {
      assert.ok(area.polygon.every(([x,z])=>Math.abs(x)<22 && Math.abs(z)<15));
      for(const id of area.terrainIds){
        const piece=layout.terrain.find(t=>t.id===id);
        assert.ok(contains(area,[piece.x,piece.z]),map+' '+id+' must be on its printed mat');
      }
    }
  });
}

test('the crossed-eye markings separate A’s two industrial mats and C’s two pylon mats at their common corner',()=>{
  const corner=world([768,979]);
  for(const [map,first,second] of [['A','generatorShrine-1-pad','capacitorStack-1-pad'],['C','pylon-1-pad','pylon-2-pad']]) {
    const areas=patrolTerrainAreas(map,layoutGeometry(map).areas,world);
    const pair=[first,second].map(id=>areas.find(a=>a.id===id));
    for(const area of pair)assert.ok(area.polygon.some(([x,z])=>x===corner[0] && z===corner[1]));
    const shared=pair[0].polygon.filter(([x,z])=>pair[1].polygon.some(([a,b])=>a===x&&b===z));
    assert.deepEqual(shared,[corner]);
  }
  const b=patrolTerrainAreas('B',layoutGeometry('B').areas,world);
  assert.deepEqual(b.filter(a=>a.id.startsWith('neutral-')).flatMap(a=>a.terrainIds),['generatorShrine-1','capacitorStack-1']);
});

test('the narrow mat includes its irregular projection and excludes the paper alongside it',()=>{
  const a=patrolTerrainAreas('A',layoutGeometry('A').areas,world);
  const pylon=a.find(area=>area.id==='pylon-1-pad');
  assert.ok(contains(pylon,world([521,405])));
  assert.equal(contains(pylon,world([484,405])),false);
  assert.deepEqual(patrolTerrainAreas('custom',[],world),[]);
});
