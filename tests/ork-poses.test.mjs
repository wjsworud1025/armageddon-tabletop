import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import * as T from '../vendor/three.module.min.js';
import {createTable} from '../data/catalog.mjs';
import {createPiece} from '../assets/pieces.mjs';
import {orkPose} from '../assets/ork-poses.mjs';
import {getProfile,unitId} from '../rules/profiles.mjs';

const troops=createTable().pieces.filter(p=>['boy','gretchin'].includes(p.kind));
const mapping=JSON.parse(readFileSync(new URL('../data/portrait-map.json',import.meta.url),'utf8'));

test('Each public Boy and Gretchin pose matches its referenced portrait and patrol roster slot',()=>{
  assert.equal(troops.length,30);
  const ids=new Set();
  for(const piece of troops){
    const pose=orkPose(piece.kind,piece.variant);
    const source=piece.kind+'-'+pose.portrait;
    assert.equal(mapping.portraits[piece.id],source,piece.id);
    ids.add(source);
    assert.equal(pose.joints.length,12);
    assert.equal(pose.joints.every(Number.isFinite),true);
    assert.ok(pose.baseWidth>100&&pose.baseWidth<190,piece.id);
    assert.equal(pose.tools.length,2);
    assert.notDeepEqual(pose.tools,['support','support']);
    for(const [i,tool] of pose.tools.entries()){
      if(tool!=='support')assert.notDeepEqual(pose.targets[i],pose.hands[i]);
    }
    assert.equal(unitId(piece),piece.kind==='boy'?'boy-'+Math.floor(piece.variant/10):'gretchin');
  }
  assert.equal(ids.size,30);
  for(const [id,modelled,profile] of [['boy-1','rokkit','콤비 로킷'],['boy-11','kustom','커스텀 슈타']]){
    const piece=troops.find(p=>p.id===id);
    assert.equal(orkPose('boy',piece.variant).tools[0],modelled);
    assert.equal(getProfile(piece).weapons[0].name,profile);
    assert.ok(Math.abs(piece.baseWidth*25.4-40)<1e-8);
  }
});

test('All 30 troops draw and pick as distinct cached solid meshes without product photography',()=>{
  const hashes=new Set(),materials=new Set();let triangles=0;
  for(const piece of troops){
    const result=createPiece(T,piece);
    assert.equal(result.children.length,1,piece.id);
    const model=result.children[0],geometry=model.geometry;
    assert.equal(model.isMesh,true);
    assert.equal(createPiece(T,piece).children[0].geometry,geometry);
    materials.add(model.material);
    assert.ok(Math.abs(geometry.boundingBox.min.y)<1e-6);
    assert.ok(geometry.boundingBox.max.y>.55 && geometry.boundingBox.max.y<2.5);
    for(const key of ['position','normal','color']){
      assert.equal(geometry.attributes[key].array.every(Number.isFinite),true,piece.id);
    }
    hashes.add(createHash('sha256').update(Buffer.from(geometry.attributes.position.array.buffer)).digest('hex'));
    triangles+=geometry.index.count/3;
    const head=orkPose(piece.kind,piece.variant).head;
    assert.equal(head.every(Number.isFinite),true);
    // Real scene interaction uses a Three raycaster. The centre of each base
    // must be selectable looking down, looking from the front and from behind.
    for(const direction of [[0,-1,0],[0,0,-1],[0,0,1]]){
      const dir=new T.Vector3(...direction),start=new T.Vector3(0,.065,0).addScaledVector(dir,-4);
      const ray=new T.Raycaster(start,dir);
      model.updateMatrixWorld();
      assert.ok(ray.intersectObject(model,false).length,piece.id+'/'+direction);
    }
  }
  assert.equal(hashes.size,30);
  assert.equal(materials.size,1);
  assert.ok(triangles<181268,'triangle count should fit the previous public troop budget');
});
