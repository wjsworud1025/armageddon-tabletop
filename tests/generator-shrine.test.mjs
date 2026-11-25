import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import {createPiece} from '../assets/pieces.mjs';
import {createTable} from '../data/catalog.mjs';

const shrine=createPiece(T,createTable().pieces.find(p=>p.id==='generatorShrine-1'));
shrine.updateMatrixWorld(true);
const ray=new T.Raycaster();
function blocked(x,y,side,axis='z'){
  const origin=new T.Vector3(x,y,side*6),direction=new T.Vector3(0,0,-side);
  if(axis==='x'){origin.set(side*6,y,x);direction.set(-side,0,0);}
  ray.set(origin,direction);
  return ray.intersectObject(shrine,true).length>0;
}

test('generator shrine proportions agree with opposite broad and end photographs',()=>{
  const size=new T.Box3().setFromObject(shrine).getSize(new T.Vector3());
  assert.ok(Math.abs(size.x-3.5)<.005,'table width used to scale the photographs');
  assert.ok(Math.abs(size.z/size.x-.763)<.025,'low end-view versus broad-view width');
  assert.ok(Math.abs(size.y/size.x-1.434)<.035,'height versus broad-view width');
});

for(const side of [-1,1]){
  test('generator shrine has a sight opening, housing and lower rail from Z side '+side,()=>{
    for(const x of [-.42,0,.42]){
      assert.equal(blocked(x,1.85,side),false,'clear opening above the low rack');
      assert.equal(blocked(x,2.62,side),true,'solid central generator housing');
    }
    const rail=[.34,.36,.38,.40,.42,.44,.46,.48].some(y=>
      [-.55,-.28,0,.28,.55].every(x=>blocked(x,y,side)));
    assert.ok(rail,'the lowest bar connects the supports across the gap');
    assert.equal(blocked(.42,.53,side),false,'open slot above the lowest bar');
  });
  test('the upper field contains conductors and sight holes from Z side '+side,()=>{
    let clear=0,hits=0;
    for(let i=0;i<17;i++)for(let j=0;j<11;j++){
      const x=-.52+i*.065,y=3.19+j*.058;
      if(blocked(x,y,side))hits++;
      else clear++;
    }
    const fraction=clear/(clear+hits);
    assert.ok(fraction>.40&&fraction<.86,'upper conductors need both metal and open sky, observed '+fraction);
    const towardsCamera=new T.Vector3(side*.035,.11,-side*.993).normalize();
    const inward=towardsCamera.clone().negate();
    let through=0;
    // Recheck the whole field at the roughly six-degree elevation of the low photo ring.
    for(let i=0;i<25;i++)for(let j=0;j<17;j++){
      const at=new T.Vector3(-.55+i*.046,3+j*.055,0);
      ray.set(at.addScaledVector(towardsCamera,6),inward);
      if(!ray.intersectObject(shrine,true).length)through++;
    }
    assert.ok(through/425>.57&&through/425<.80,'low-angle field openness: '+through/425);
  });
  test('eagle wings extend across the narrow end silhouette from X side '+side,()=>{
    for(const z of [-.55,.55]){
      assert.ok([4.68,4.73,4.78,4.83,4.88,4.93,4.98].some(y=>blocked(z,y,side,'x')));
    }
    assert.equal(blocked(.15,.73,side,'x'),false,'opening between the feet');
    assert.equal(blocked(.40,.54,side,'x'),true,'arch leg');
    assert.equal(blocked(0,1.36,side,'x'),true,'solid frame above the arch');
  });
}
