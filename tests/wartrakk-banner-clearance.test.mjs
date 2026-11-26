import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import {createPiece} from '../assets/pieces.mjs';
import {sightObstructions} from '../assets/sight-line.mjs';
import {vehicleTerrainContacts} from '../assets/vehicle-clearance.mjs';
import {createTable} from '../data/catalog.mjs';
import {snapshot,restore} from '../state.mjs';
import {proposeMove,finishMove} from '../move-session.mjs';
import {relative} from './fixtures/vehicle-board.mjs';
import {wartrakkBannerDraft} from './fixtures/wartrakk-banner-board.mjs';

test('printed map B: the trailing cloth catches the ruin and a 15-degree pivot frees it',()=>{
  const game=wartrakkBannerDraft(),old=structuredClone(game);
  const trakk=g=>g.pieces.find(p=>p.id==='wartrakk-1'),p=trakk(game);
  const wall=game.pieces.find(t=>t.id==='largeRuin-1');
  trakk(old).previousWartrakkBanner=true;
  assert.deepEqual(vehicleTerrainContacts(trakk(old),old.pieces),[]);
  assert.equal(finishMove(old).rules.units.wartrakk.movement,'normal');
  assert.deepEqual(vehicleTerrainContacts(p,game.pieces),[wall.id]);
  const saved=snapshot(game);
  assert.throws(()=>finishMove(game),/wartrakk-1, largeRuin-1.*관통/);
  assert.deepEqual(snapshot(game),saved);
  const resumed=restore(createTable(),saved),v=trakk(resumed);
  const turn=proposeMove(resumed,v,{[v.id]:[relative(wall,-1.8,4.1,Math.PI/12)]});
  resumed.rules=turn.rules;Object.assign(v,turn.poses[v.id]);
  assert.deepEqual([v.x,v.z,v.elevation],[p.x,p.z,p.elevation]);
  assert.deepEqual(vehicleTerrainContacts(v,resumed.pieces),[]);
  assert.equal(finishMove(resumed).rules.units.wartrakk.movement,'normal');
});

test('the bent rear cloth blocks a 1 mm line in both directions, with open space above and below',()=>{
  const p=wartrakkBannerDraft().pieces.find(p=>p.id==='wartrakk-1');
  for(const previousWartrakkBanner of [false,true]){
    const root=createPiece(T,{...p,previousWartrakkBanner});
    root.userData.pieceId=p.id;root.rotation.y=p.yaw;root.position.set(p.x,p.elevation,p.z);
    root.updateMatrixWorld(true);
    for(const [y,z,cloth] of [[2.72,-2.146,true],[2.52,-2.146,false],[2.95,-2.146,false]]){
      const from=root.localToWorld(new T.Vector3(-1.12,y,z)),to=root.localToWorld(new T.Vector3(-.12,y,z));
      const expected=cloth&&!previousWartrakkBanner?[p.id]:[];
      for(const [a,b] of [[from,to],[to,from]])assert.deepEqual(sightObstructions(a,b,[root]),expected);
    }
  }
});
