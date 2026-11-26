import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapTable,createTable} from '../data/catalog.mjs';
import {mapReliquarySize,reliquarySize} from '../data/reliquary-dimensions.mjs';
import {applyLayout,layoutGeometry,layoutScenery} from '../layouts.mjs';
import {newBattle} from '../rules/battle.mjs';
import {newPatrolSetup,patrolTerrainPiece,validatePatrolSetup} from '../rules/patrol-setup.mjs';
import {snapshot,restore} from '../state.mjs';

const ruin=g=>g.pieces.find(p=>p.id==='largeRuin-2');
const base=(g)=>({...g,logs:[],rules:newBattle()});
const size=p=>({baseWidth:p.baseWidth,baseDepth:p.baseDepth});
test('CD belongs to new formal and quick tables only; neutral training base table and product display keep their own assemblies',()=>{
  assert.equal(newPatrolSetup().version,9);
  assert.equal(validatePatrolSetup({...newPatrolSetup(),version:10}),false);
  assert.equal(ruin(createMapTable({patrolCD:true})).patrolCD,true);
  assert.notEqual(ruin(createMapTable()).patrolCD,true);
  const product=base(createTable()),initial=snapshot(product);
  assert.deepEqual(size(ruin(product)),reliquarySize);
  for(const map of ['A','B','C']){
    const g=base(createTable());applyLayout(g,map,'marines');
    assert.equal(ruin(g).patrolCD,true);
    assert.equal(g.pieces.filter(p=>p.patrolCD).length,1);
    const save=snapshot(g);assert.equal(save.reliquaryRevision,3);
    const loaded=restore(createTable(),save);
    assert.deepEqual(snapshot(loaded),save);assert.equal(ruin(loaded).patrolCD,true);
    assert.deepEqual(ruin(loaded),ruin(restore(createMapTable({patrolCD:true}),save)));
  }
  const back=restore(createMapTable({patrolCD:true}),initial);assert.deepEqual(size(ruin(back)),reliquarySize);assert.notEqual(ruin(back).patrolCD,true);
});
test('old quick-map saves preserve their original loose positions and the 5.20-inch cast on reload',()=>{
  for(const version of [1,2,3,6,8]){
    const g=base(createTable()),geo=layoutGeometry('B',version);
    for(const [p,q] of layoutScenery(g,geo))Object.assign(p,q);
    g.layout={map:'B',blue:'orks'};ruin(g).x+=.2;
    const saved=snapshot(g);assert.equal(saved.reliquaryRevision,undefined);
    const loaded=restore(createTable(),saved);
    assert.equal(ruin(loaded).x,ruin(g).x);assert.deepEqual(size(ruin(loaded)),mapReliquarySize);
    assert.notEqual(ruin(loaded).patrolCD,true);assert.deepEqual(snapshot(loaded),saved);
    assert.notEqual(patrolTerrainPiece(ruin(createMapTable({patrolCD:true})),version).patrolCD,true);
    applyLayout(loaded,'A','orks');assert.equal(ruin(loaded).patrolCD,true);
  }
});
test('the quick-map cast revision needs a valid map and cannot override a formal edition',()=>{
  const g=base(createTable());applyLayout(g,'A','orks');
  const current=snapshot(g);
  for(const layout of [null,{map:'D',blue:'orks'},{map:'A',blue:'both'}]){
    assert.throws(()=>restore(createTable(),{...current,layout}),/폐허 판본/);
  }
  for(const revision of [1,'3',4]){
    assert.throws(()=>restore(createTable(),{...current,reliquaryRevision:revision}),/폐허 판본/);
  }
  const official={...current,rules:{...g.rules,officialSetup:newPatrolSetup()}};
  assert.throws(()=>restore(createTable(),official),/폐허 판본/);
  const oldQuick={...current,reliquaryRevision:2};
  assert.deepEqual(size(ruin(restore(createTable(),oldQuick))),mapReliquarySize);
});
