import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as T from '../vendor/three.module.min.js';
import {createPiece} from '../assets/pieces.mjs';
import {createTable} from '../data/catalog.mjs';
import {loadWallSurvey} from '../assets/wall-relief.mjs';
import {sightObstructions} from '../assets/sight-line.mjs';
import {loadReconstruction} from '../reconstruction/mesh.mjs';

const path=fileURLToPath(import.meta.url);
if(process.argv[1]===path&&process.argv[2]==='--check-ruin-windows'){
  const mode=process.argv[3];
  assert.ok(mode==='public'||mode==='local');
  if(mode==='local')await loadWallSurvey();
  const piece=createTable().pieces.find(p=>p.id==='largeRuin-2');
  const mesh=(mode==='local'?await loadReconstruction(T,piece):null)??createPiece(T,piece);
  mesh.updateMatrixWorld(true);
  const ray=new T.Raycaster();
  function blocked(face,u,y,side){
    const origin=face==='door'?new T.Vector3(u,y,side*5):new T.Vector3(side*5,y,u);
    const direction=face==='door'?new T.Vector3(0,0,-side):new T.Vector3(-side,0,0);
    ray.set(origin.multiplyScalar(3/2.30),direction);
    return ray.intersectObject(mesh,true).length>0;
  }
  for(const side of [-1,1]){
    test(mode+' door wall from side '+side+' preserves four lights, three glazing bars and a solid ground floor',()=>{
      for(const x of [-1.48,-1.42,-1.37]){
        for(const y of [2.58,2.84,3.08,3.30])assert.equal(blocked('door',x,y,side),false,'opening at '+[x,y]);
        for(const y of [2.72,2.96,3.20])assert.ok(blocked('door',x,y,side),'glazing bar at '+[x,y]);
        assert.ok(blocked('door',x,1.25,side),'closed panel below');
      }
      assert.ok(blocked('door',-1.23,3.35,side),'junction between the two bays');
      assert.equal(blocked('door',-1.07,3.35,side),false,'broken window head');
      assert.equal(blocked('door',-1.02,2.96,side),false,'break in the middle bar of the ruined bay');
      assert.ok(blocked('door',-1.12,2.96,side)&&blocked('door',-.90,2.96,side),'both ends of the broken bar');
    });
    test(mode+' reliquary wall from side '+side+' preserves both lancet lights and the thin central mullion',()=>{
      for(const z of [1,1.16]){
        for(const y of [3.04,3.13,3.24,3.35])assert.equal(blocked('reliquary',z,y,side),false,'lancet at '+[z,y]);
        for(const y of [3.075,3.18,3.305])assert.ok(blocked('reliquary',z,y,side),'glazing bar at '+[z,y]);
        assert.ok(blocked('reliquary',z,1.15,side),'ground-level reliquary');
      }
      for(const y of [3.04,3.13,3.24,3.35])assert.ok(blocked('reliquary',1.08,y,side),'central mullion at '+y);
    });
  }
  function checkPaths(samples){
    // The scene tags and poses the piece root. Apply the same transform to the
    // endpoints, which are local inches inferred from the photographed views.
    const wall=mesh.clone();
    wall.userData.pieceId=piece.id;
    wall.position.set(piece.x,piece.elevation??0,piece.z);
    wall.rotation.y=piece.yaw;
    wall.updateMatrixWorld(true);
    for(const [name,start,end,centreBlocked,cylinderBlocked] of samples){
      const from=wall.localToWorld(new T.Vector3(...start).multiplyScalar(3/2.30)),to=wall.localToWorld(new T.Vector3(...end).multiplyScalar(3/2.30));
      for(const [a,b] of [[from,to],[to,from]]){
        const delta=b.clone().sub(a),length=delta.length();
        const centre=new T.Raycaster(a,delta.normalize(),0,length);
        assert.equal(centre.intersectObject(wall,true).length>0,centreBlocked,name+' centre line');
        if(cylinderBlocked!==null)
          assert.deepEqual(sightObstructions(a,b,[wall]),cylinderBlocked?[piece.id]:[],name+' 1 mm line');
      }
    }
  }
  test(mode+' lower corner lattice preserves its braces and passes a finite 1 mm sight line in both directions',()=>{
    checkPaths([
      // Both ends reproject to white pixels in the registered 480 px study.
      ['01-01 (238,204), held out',[-2.65,1.661910,1.853008],[-1.85,1.758049,1.303559],false,false],
      ['01-06 (301,224)',[-2.65,1.801749,1.643054],[-1.85,1.710852,1.616966],false,false],
      ['02-06 (295,264)',[-2.65,2.107056,1.513156],[-1.85,1.604327,1.495466],false,false],
      // The small white patch in 02-07 clears a centre ray but clips its 1 mm cylinder.
      ['02-07 (239,280), held out',[-2.65,2.0399,1.8666],[-1.85,1.4178,1.3278],false,true],
      ['horizontal lower light',[-3.5,1.672,1.583],[1,1.672,1.583],false,false],
      ['horizontal X intersection',[-3.5,1.950,1.675],[1,1.950,1.675],true,true],
      ['descending strap',[-3.5,1.82,1.59],[1,1.82,1.59],true,true],
      ['ascending strap',[-3.5,1.82,1.76],[1,1.82,1.76],true,true],
    ]);
  });
  test(mode+' the damaged landing opens to the side of an intact edge beam and deck',()=>{
    // Opposite ends of each short diagonal reproject to the same source pixel
    // in the 480 px registered views. 03-11 is the original diagnostic view.
    checkPaths([
      // The projected 1 mm disc also touches dark photo pixels at this location.
      // The source supports a clear centre line without establishing full 1 mm clearance.
      ['03-11 (248,255) white gap',[.42895,2.48,.83804],[.23332,2.06,.73387],false,null],
      ['03-10 (277,243) white gap from a second angle',[.383844,2.48,.849911],[.272496,2.06,.652185],false,null],
      ['03-11 (248,259) dark outer beam',[.49498,2.48,.87170],[.30077,2.06,.76825],true,true],
      ['03-11 (248,251) intact deck',[.36271,2.48,.80428],[.16566,2.06,.69938],true,true],
    ]);
  });
}else{
  const modes=['public'];
  if(existsSync(new URL('../assets/wall-survey.mjs',import.meta.url)))modes.push('local');
  for(const mode of modes)test(mode+' ruin windows in an independent game process',()=>{
    // Loading the private wall survey changes the sculpt module for its whole lifetime.
    // A fresh runtime also ensures the public cast cannot inherit an earlier test's survey.
    const env={...process.env};
    delete env.NODE_TEST_CONTEXT;
    const result=spawnSync(process.execPath,[path,'--check-ruin-windows',mode],{env,encoding:'utf8',windowsHide:true});
    if(result.error)throw result.error;
    assert.equal(result.status,0,result.stdout+result.stderr);
  });
}
