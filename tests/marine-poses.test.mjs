import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import * as T from '../vendor/three.module.min.js';
import {createTable} from '../data/catalog.mjs';
import {createPiece} from '../assets/pieces.mjs';
import {marinePose} from '../assets/marine-poses.mjs';
import {getProfile} from '../rules/profiles.mjs';

const marines=createTable().pieces.filter(p=>['intercessor','vanguard'].includes(p.kind));
const {portraits}=JSON.parse(readFileSync(new URL('../data/portrait-map.json',import.meta.url)));
const poseOf=piece=>marinePose(piece.kind,piece.variant);

test('Ten distinct Marine poses match portrait IDs and the fixed patrol equipment',()=>{
  assert.equal(marines.length,10);
  const portraitsSeen=new Set(),depthCalibrated=[];
  for(const piece of marines){
    const pose=poseOf(piece);
    const portraitId=piece.kind+'-'+pose.portrait;
    assert.equal(portraitId,portraits[piece.id]);
    portraitsSeen.add(portraitId);
    if(pose.sideDepth)depthCalibrated.push(piece.id);
    assert.equal(Boolean(pose.nozzles),piece.kind==='vanguard');
    for(const key of ['shoulders','hands','elbows','knees','feet','pack','tips']){
      assert.equal(pose[key].length,2,piece.id);
      assert.equal(pose[key].flat().every(Number.isFinite),true);
    }
    assert.ok(Math.abs(piece.baseWidth*25.4-32)<1e-6);
  }
  assert.equal(portraitsSeen.size,10);
  assert.deepEqual(depthCalibrated,['intercessor-1','vanguard-4']);
  for(const [id,visual,rule] of [
    ['intercessor-1','chainsword','체인소드'],['intercessor-2','launcher','수류탄 발사기'],['vanguard-4','plasma','플라즈마']
  ]){
    const piece=marines.find(p=>p.id===id);
    assert.ok(poseOf(piece).tools.includes(visual),id);
    assert.ok(getProfile(piece).weapons.some(w=>w.name.includes(rule)),id);
  }
});

test('Ten public Marine sculpts are individually selectable and fit the previous geometry budget',()=>{
  const hashes=new Set(),materials=new Set();let triangles=0;
  for(const piece of marines){
    const group=createPiece(T,piece);assert.equal(group.children.length,1);
    const mesh=group.children[0],geometry=mesh.geometry;
    assert.equal(mesh.isMesh,true);materials.add(mesh.material);
    assert.equal(geometry,createPiece(T,piece).children[0].geometry);
    for(const attribute of ['position','normal','color'])assert.ok(geometry.attributes[attribute].array.every(Number.isFinite),piece.id);
    assert.ok(Math.abs(geometry.boundingBox.min.y)<1e-5,piece.id);
    assert.ok(geometry.boundingBox.max.y>1.25&&geometry.boundingBox.max.y<3.8,piece.id);
    hashes.add(createHash('sha256').update(Buffer.from(geometry.attributes.position.array.buffer)).digest('hex'));
    triangles+=geometry.index.count/3;
    mesh.updateMatrixWorld();
    for(const direction of [[0,-1,0],[0,0,-1],[0,0,1]]){
      const dir=new T.Vector3(...direction),origin=new T.Vector3(0,.066,0).addScaledVector(dir,-4);
      assert.ok(new T.Raycaster(origin,dir).intersectObject(mesh,false).length,piece.id);
    }
  }
  assert.equal(hashes.size,10);
  assert.equal(materials.size,1);
  assert.ok(triangles<69876);
});
