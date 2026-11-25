import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import {sightHiddenPieces} from '../assets/sight-units.mjs';
import {createPiece} from '../assets/pieces.mjs';
import {createTable} from '../data/catalog.mjs';

const table=()=>({...createTable(),rules:{attachments:{'librarian-1':'intercessor','warboss-1':'boy-0'}}});
const ids=(prefix,n)=>Array.from({length:n},(_,i)=>prefix+'-'+(i+1));

test('inspection excludes only the live endpoint-unit members, including attached leaders on both sides',()=>{
  const g=table(),snapshot=structuredClone(g);
  const masked=sightHiddenPieces(g,['librarian-1','boy-2']);
  const expected=['librarian-1',...ids('intercessor',5),'warboss-1',...ids('boy',10).filter(id=>id!=='boy-2')];
  assert.deepEqual([...masked].sort(),expected.sort());
  const reverse=sightHiddenPieces(g,['boy-2','librarian-1']);
  assert.equal(reverse.has('librarian-1'),false);
  assert.equal(reverse.has('boy-2'),true);
  for(const id of ['boy-11','captain-1','largeRuin-1'])assert.equal(reverse.has(id),false);
  assert.deepEqual(sightHiddenPieces(g,null),new Set());
  assert.deepEqual(g,snapshot);
});

test('training 3/4 use handbook units, even if Combat Patrol leaders have been attached on the saved table',()=>{
  for(const scenario of [3,4]){
    const g=table();g.training={scenario};
    const masked=sightHiddenPieces(g,['intercessor-2','boy-1']);
    assert.equal(masked.has('librarian-1'),false);
    assert.equal(masked.has('warboss-1'),false);
    assert.equal(masked.has('intercessor-4'),true);
    assert.equal(masked.has('boy-10'),true);
    assert.equal(masked.has('boy-11'),false);
    assert.equal(masked.has('boy-1'),false);
  }
});

test('removed targets, terrain inspection and an absent saved battle retain normal inspection behavior',()=>{
  const g=table();delete g.rules;
  const observer='intercessor-1',target='boy-1';
  assert.deepEqual(sightHiddenPieces(g,[observer,'largeRuin-1']),new Set([observer]));
  assert.ok(sightHiddenPieces(g,[observer,target]).has('intercessor-2'));
  g.pieces.find(p=>p.id==='boy-2').removed=true;
  assert.equal(sightHiddenPieces(g,[observer,target]).has('boy-2'),false);
  g.pieces.find(p=>p.id===target).removed=true;
  for(const pair of [[observer,target],[observer,'unknown'],[observer,observer],null])
    assert.deepEqual(sightHiddenPieces(g,pair),new Set());
});

test('a base-height ray on real figure meshes still intersects a third unit between both filtered units',()=>{
  const g=table(),pair=['intercessor-1','boy-1'];
  const line=[['intercessor-1',-8],['librarian-1',-5],['boy-2',-2],['captain-1',2],['boy-1',6]];
  const objects=line.map(([id,x])=>{
    const obj=createPiece(T,g.pieces.find(p=>p.id===id));
    obj.userData.pieceId=id;obj.position.x=x;obj.updateMatrixWorld(true);
    return obj;
  });
  const ray=new T.Raycaster(new T.Vector3(-11,.08,0),new T.Vector3(1,0,0),0,25);
  function crossed(pair){
    const hidden=sightHiddenPieces(g,pair);
    const meshes=objects.filter(obj=>!hidden.has(obj.userData.pieceId));
    return [...new Set(ray.intersectObjects(meshes,true).map(hit=>{
      let root=hit.object;while(root.parent)root=root.parent;return root.userData.pieceId;
    }))];
  }
  assert.deepEqual(crossed(pair),['captain-1','boy-1']);
  assert.deepEqual(crossed(null),line.map(([id])=>id));
});
