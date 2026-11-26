import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from '../vendor/three.module.min.js';
import {createPiece} from '../assets/pieces.mjs';
import {sightObstructions} from '../assets/sight-line.mjs';
import {createTable} from '../data/catalog.mjs';

test('front and side sight lines pass through gaps between the Gretchin’s raised arms and weapons',()=>{
  const piece=createTable().pieces.find(p=>p.id==='gretchin-5');
  const model=createPiece(T,piece);
  model.userData.pieceId=piece.id;
  model.position.set(piece.x,.7,piece.z);
  model.rotation.y=piece.yaw;
  model.updateMatrixWorld(true);

  // Group 10, 800 px frames registered to its 25 mm base. In 01-01 the
  // gap below the blade is at (450,191), and the hand is at (528,215).
  // Side view 01-04 shows the gap above the head between the barrel and
  // the knife hand at (345,253), and the forearm at (422,289).
  for(const [start,end,expected] of [
    [[.1405,1.1951,1.8594],[.1844,.9911,-2.1352],[]],
    [[.3091,1.1436,1.8660],[.4056,.9236,-2.1268],[piece.id]],
    [[1.8777,1.0622,.0849],[-2.1147,.8166,.1114],[]],
    [[1.8881,.9851,-.0815],[-2.1027,.7152,-.1070],[piece.id]],
  ]){
    const a=model.localToWorld(new T.Vector3(...start));
    const b=model.localToWorld(new T.Vector3(...end));
    assert.deepEqual(sightObstructions(a,b,[model]),expected);
    assert.deepEqual(sightObstructions(b,a,[model]),expected);
  }
});

test('the turned coat hem blocks a frontal ray and leaves clearance below it from both sides',()=>{
  const piece=createTable().pieces.find(p=>p.id==='gretchin-5');
  const model=createPiece(T,piece);
  model.userData.pieceId=piece.id;
  model.updateMatrixWorld(true);
  // The low front view shows leather at (476,372) and clear space at
  // (472,423). The reverse oblique view also shows space at (250,413).
  for(const [start,end,expected] of [
    [[.19707,.80486,1.88256],[.25771,.48390,-2.04516],[piece.id]],
    [[.18841,.69528,1.89639],[.24638,.34060,-2.02708],[]],
    [[-.69365,.71677,-1.78615],[1.34641,.36870,1.56741],[]],
  ]){
    const a=new T.Vector3(...start),b=new T.Vector3(...end);
    assert.deepEqual(sightObstructions(a,b,[model]),expected);
    assert.deepEqual(sightObstructions(b,a,[model]),expected);
  }
});
