import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import {createPiece} from '../assets/pieces.mjs';
import {createTable} from '../data/catalog.mjs';
import {getProfile} from '../rules/profiles.mjs';

const leaders={
  captain:{mm:40,height:[2.2,2.5],weapons:['마스터 크래프티드 파워 웨폰','헤비 볼트 피스톨']},
  librarian:{mm:40,height:[2.0,2.35],weapons:['포스 웨폰','풀미네이션 · 펄스']},
  warboss:{mm:50,height:[3.35,3.75],weapons:['커스텀 초파','커스텀 슈타']},
  weirdboy:{mm:50,height:[2.5,2.9],weapons:['와아! 지팡이 · 강타','헤드뱅어']},
};
const characters=createTable().pieces.filter(p=>Object.hasOwn(leaders,p.kind));

test('Four character miniatures preserve their round bases, loadouts and individual cached single draws',()=>{
  assert.equal(characters.length,4);
  const materials=new Set(),geometries=new Set();
  for(const p of characters){
    const expected=leaders[p.kind],group=createPiece(T,p),mesh=group.children[0],g=mesh.geometry;
    assert.ok(Math.abs(p.baseWidth*25.4-expected.mm)<1e-8&&Math.abs(p.baseDepth*25.4-expected.mm)<1e-8);
    assert.equal(group.children.length,1);
    assert.ok(mesh.isMesh&&g.index);
    assert.equal(createPiece(T,p).children[0].geometry,g);
    materials.add(mesh.material);geometries.add(g);
    for(const k of ['position','color','normal'])assert.ok(g.attributes[k].array.every(Number.isFinite),p.id);
    assert.ok(g.index.count/3<12000);
    assert.ok(Math.abs(g.boundingBox.min.y)<1e-5);
    assert.ok(g.boundingBox.max.y>expected.height[0]&&g.boundingBox.max.y<expected.height[1]);
    assert.ok(new T.Raycaster(new T.Vector3(0,7,0),new T.Vector3(0,-1,0)).intersectObject(mesh).length);
    for(const name of expected.weapons)assert.ok(getProfile(p).weapons.some(w=>w.name===name));
  }
  assert.equal(materials.size,1);assert.equal(geometries.size,4);
});

test('Front-camera weapon reach, backpack conductors and tall standards distinguish the four silhouettes',()=>{
  const above=(kind,height)=>{
    const attr=createPiece(T,characters.find(p=>p.kind===kind)).children[0].geometry.attributes.position;
    let left=Infinity,right=-Infinity;
    for(let i=0;i<attr.count;i++)if(attr.getY(i)>height){
      left=Math.min(left,attr.getX(i));right=Math.max(right,attr.getX(i));
    }
    return {left,right};
  };
  assert.ok(above('captain',1.57).left < -1.45); // sword held to viewer's left
  assert.ok(above('librarian',1.15).right > 1.22); // gear head of long staff
  const crown=above('weirdboy',1.86);
  assert.ok(crown.left < -.79&&crown.right>.65);
  const standard=above('warboss',2.75);
  assert.ok(standard.left<-.51&&standard.right>.17);
});
