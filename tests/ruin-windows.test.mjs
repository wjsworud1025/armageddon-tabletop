import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as T from '../vendor/three.module.min.js';
import {createPiece} from '../assets/pieces.mjs';
import {createTable} from '../data/catalog.mjs';
import {loadWallSurvey} from '../assets/wall-relief.mjs';

const path=fileURLToPath(import.meta.url);
if(process.argv[1]===path&&process.argv[2]==='--check-ruin-windows'){
  const mode=process.argv[3];
  assert.ok(mode==='public'||mode==='local');
  if(mode==='local')await loadWallSurvey();
  const mesh=createPiece(T,createTable().pieces.find(p=>p.id==='largeRuin-2'));
  mesh.updateMatrixWorld(true);
  const ray=new T.Raycaster();
  function blocked(face,u,y,side){
    const origin=face==='door'?new T.Vector3(u,y,side*5):new T.Vector3(side*5,y,u);
    const direction=face==='door'?new T.Vector3(0,0,-side):new T.Vector3(-side,0,0);
    ray.set(origin,direction);
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
