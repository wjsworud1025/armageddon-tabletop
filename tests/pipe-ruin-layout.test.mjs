import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import {createPiece} from '../assets/pieces.mjs';
import {createTable} from '../data/catalog.mjs';
import {layoutGeometry,layoutScenery} from '../layouts.mjs';
import {patrolTerrainPlacement} from '../rules/patrol-terrain-placement.mjs';

const find=(pieces,id)=>pieces.find(p=>p.id===id);
const world=([u,v])=>({x:(v-154)*44/1654-22,z:15-(u-203)*30/1129});

test('the printed pipes and return intersect the cast on all maps, and a Gretchin fits in the courtyard',()=>{
  // Three samples per icon: main wall, return and empty courtyard on the printed diagram.
  const samples=[
    ['A','smallRuin-4',[365,1454],[325,1482],[361,1490]],
    ['B','smallRuin-4',[759,1412],[719,1440],[755,1448]],
    ['C','smallRuin-4',[473,1706],[512,1678],[476,1670]],
    ['A','smallRuin-3',[322,1637],[345,1669],[353,1641]],
    ['B','smallRuin-3',[711,1603],[734,1635],[742,1607]],
  ];
  const stock=createTable().pieces,grot=find(stock,'gretchin-1');
  for(const [map,id,long,short,court] of samples){
    const layout=layoutGeometry(map),terrain={...find(stock,id),...find(layout.terrain,id)};
    const group=createPiece(T,terrain);
    group.position.set(terrain.x,0,terrain.z);group.rotation.y=terrain.yaw;group.updateMatrixWorld(true);
    for(const [coord,occupied] of [[long,true],[short,true],[court,false]]){
      const {x,z}=world(coord);
      const hit=new T.Raycaster(new T.Vector3(x,8,z),new T.Vector3(0,-1,0)).intersectObject(group,true)[0];
      assert.equal(!!hit,occupied,map+' '+id+' surface at '+coord);
      const result=patrolTerrainPlacement({...grot,x,z,elevation:0},[terrain]);
      assert.equal(!!result.error,occupied,map+' '+id+' base clearance at '+coord);
    }
  }
});

test('version 5 changes two red-home slots on A/B and one on C, preserving mats, scoring and previous casts',()=>{
  for(const map of ['A','B','C']){
    const previous=layoutGeometry(map,4),current=layoutGeometry(map,5);
    assert.deepEqual(previous.areas,current.areas);
    assert.deepEqual(previous.terrainAreas,current.terrainAreas);
    assert.deepEqual(current.terrainAreas.find(a=>a.id==='red-home').terrainIds,
      ['largeRuin-2','smallRuin-3','smallRuin-4']);
    const changed=current.terrain.filter(p=>{
      const old=find(previous.terrain,p.id);return old.x!==p.x||old.z!==p.z||old.yaw!==p.yaw;
    });
    assert.deepEqual(changed.map(p=>p.id),map==='C'?['smallRuin-4']:['smallRuin-3','smallRuin-4']);
    const table=createTable();
    for(const version of [5,1,2,3,4,5]){
      for(const [item,pose] of layoutScenery(table,layoutGeometry(map,version)))Object.assign(item,pose);
      const pipe=find(table.pieces,'smallRuin-4');
      assert.equal(pipe.previousPipeRuin,version<5);
      assert.deepEqual([pipe.baseWidth,pipe.baseDepth],[2.5,1.4]);
    }
  }
});
