import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import {createTable} from '../data/catalog.mjs';
import {createPiece} from '../assets/pieces.mjs';
import {sightObstructions} from '../assets/sight-line.mjs';
import {patrolTerrainPlacement} from '../rules/patrol-terrain-placement.mjs';
import {patrolTerrainPiece} from '../rules/patrol-setup.mjs';
import {assessMove} from '../movement.mjs';
import {restore,snapshot} from '../state.mjs';

const piece=(game,id)=>game.pieces.find(p=>p.id===id);
const barricades=createTable().pieces.filter(p=>p.kind==='barricade');
const grot=piece(createTable(),'gretchin-1');

test('both lockcrete screens use the registered footprint and twin openings in their actual world poses',()=>{
  assert.equal(barricades.length,2);
  for(const p of barricades){
    const root=createPiece(T,p),size=new T.Box3().setFromObject(root).getSize(new T.Vector3());
    for(const [actual,expected] of [[size.x,3.8],[size.y,2.56],[size.z,1.25]])assert.ok(Math.abs(actual-expected)<.001);
    root.position.set(p.x,.75,p.z);root.rotation.y=p.yaw;root.userData.pieceId=p.id;root.updateMatrixWorld(true);
    function sight(x,y,blocked){
      const from=root.localToWorld(new T.Vector3(x,y,-2)),to=root.localToWorld(new T.Vector3(x,y,2));
      for(const [a,b] of [[from,to],[to,from]]){
        assert.deepEqual(sightObstructions(a,b,[root]),blocked?[p.id]:[],p.id+' local '+[x,y]);
      }
    }
    for(const dir of [-1,1]){
      sight(dir*.97,1.70,false);  // Broad slit in each bay
      sight(dir*.16,1.70,true);   // Centre posts between the bays
      sight(dir*.97,.55,true);    // Solid chest-height wall
      for(const y of [1.49,1.94,2.37])sight(dir*.97,y,true);
      sight(dir*.97,2.15,true);   // Narrow openings and the metal between them
      sight(dir*1.035,2.15,true);
    }
    sight(0,.35,false);sight(0,.57,true); // Central seam and its connecting pin
  }
});

test('each upper strip has three rows of actual apertures with less than 1 mm of clear width',()=>{
  const p=barricades[0],root=createPiece(T,p);
  root.userData.pieceId=p.id;root.updateMatrixWorld(true);
  for(const [middle,yMiddle] of [[-.918,2.142],[1.001,2.164]]){
    for(const [offset,y] of [[.056,yMiddle-.053],[0,yMiddle],[.056,yMiddle+.053]]){
      for(const x of [middle+offset,middle+offset+.112]){
        const a=new T.Vector3(x,y,-1),b=new T.Vector3(x,y,1);
        for(const [from,to] of [[a,b],[b,a]]){
          const ray=new T.Raycaster(from,to.clone().sub(from).normalize(),0,from.distanceTo(to));
          assert.equal(ray.intersectObject(root,true).length,0,'visible aperture at '+[x,y]);
          assert.deepEqual(sightObstructions(from,to,[root]),[p.id],'1 mm cylinder contacts rim at '+[x,y]);
          const web=new T.Raycaster(from.clone().add(new T.Vector3(.056,0,0)),ray.ray.direction,0,2);
          assert.ok(web.intersectObject(root,true).length,'metal between adjacent holes');
        }
      }
    }
  }
  // Local witnesses with white centres in four separate photographic views.
  for(const [x,y] of [[1.054,2.118],[-.862,2.190]]){
    for(const z of [-1,1]){
      const from=new T.Vector3(x,y,z),to=new T.Vector3(x,y,-z);
      const thin=new T.Raycaster(from,new T.Vector3(0,0,-z),0,2);
      assert.equal(thin.intersectObject(root,true).length,0);
      assert.deepEqual(sightObstructions(from,to,[root]),[p.id]);
    }
  }
  // At the former 1 mm pass, the corresponding four photographs show metal.
  const formerPass=new T.Raycaster(new T.Vector3(1.035,2.15,-1),new T.Vector3(0,0,1),0,2);
  assert.ok(formerPass.intersectObject(root,true).length);
});

test('rear feet obstruct a 25 mm base while the central ground behind the panels remains available',()=>{
  for(const p of barricades){
    const wall={...p,elevation:0};
    function at(x,z){return {...grot,elevation:0,x:p.x+x*Math.cos(p.yaw)+z*Math.sin(p.yaw),
      z:p.z-x*Math.sin(p.yaw)+z*Math.cos(p.yaw)};}
    assert.equal(patrolTerrainPlacement(at(0,.52),[wall]).error,'');
    assert.ok(patrolTerrainPlacement(at(.98,-.70),[wall]).error);
    for(const side of [-1,1])assert.ok(patrolTerrainPlacement(at(side*1.77,.83),[wall]).error);
    const walker=at(1.77,2.3),target=at(1.77,.95);
    function movement(terrain){
      return assessMove({game:{width:44,depth:30,pieces:[walker,terrain]},pieces:[walker],type:'normal',
        paths:{[walker.id]:[{x:target.x,z:target.z}]}});
    }
    assert.ok(movement(wall).manual.some(e=>e.code==='terrain-path'));
    const previous=patrolTerrainPiece(wall,5);
    assert.ok(!movement(previous).manual.some(e=>e.code==='terrain-path'));
  }
});

test('old custom saves retain their narrower cast, legal edge pose and original sight after re-saving',()=>{
  const game={...createTable(),logs:[],rules:null};
  const current=snapshot(game),old=structuredClone(current);delete old.barricadeRevision;
  Object.assign(piece(old,'barricade-1'),{x:0,z:14.675,yaw:0});
  const resumed=restore(createTable(),old);
  assert.deepEqual(snapshot(resumed),old);
  for(const p of resumed.pieces.filter(p=>p.kind==='barricade')){
    assert.equal(p.previousBarricade,true);assert.equal(p.baseDepth,.65);
    const mesh=createPiece(T,p);
    assert.ok(Math.abs(new T.Box3().setFromObject(mesh).max.y-1.45)<.001);
    mesh.userData.pieceId=p.id;mesh.updateMatrixWorld(true);
    assert.deepEqual(sightObstructions(new T.Vector3(.97,1.94,-2),new T.Vector3(.97,1.94,2),[mesh]),[]);
  }
  const fresh=restore(resumed,current);
  assert.deepEqual(snapshot(fresh),current);
  assert.ok(fresh.pieces.filter(p=>p.kind==='barricade').every(p=>!p.previousBarricade&&p.baseDepth===1.25));
  assert.throws(()=>restore(createTable(),{...current,barricadeRevision:3}));
});
