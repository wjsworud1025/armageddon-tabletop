import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {layoutGeometry} from '../layouts.mjs';
import * as T from '../vendor/three.module.min.js';
import {pieceGeometry} from '../assets/pieces.mjs';
import {patrolTerrainPiece} from '../rules/patrol-setup.mjs';
import {patrolTerrainPlacement} from '../rules/patrol-terrain-placement.mjs';
import {vehicleTerrainContacts} from '../assets/vehicle-clearance.mjs';

const template=createTable().pieces;
const model=(id,pose={})=>({...template.find(p=>p.id===id),x:0,z:0,yaw:0,elevation:0,...pose});
test('a speeder in the printed A ruin clips the wall above its oval base',()=>{
  const id='largeRuin-1';
  const ruin=model(id,layoutGeometry('A').terrain.find(p=>p.id===id));
  const speeder=model('landSpeeder-1',{x:ruin.x+4.05,z:ruin.z});
  assert.deepEqual(vehicleTerrainContacts(speeder,[ruin]),[id]);
  assert.deepEqual(vehicleTerrainContacts({...speeder,x:ruin.x+4.75},[ruin]),[]);
  assert.deepEqual(vehicleTerrainContacts({...speeder,elevation:6},[ruin]),[]);
  assert.deepEqual(vehicleTerrainContacts(speeder,[{...ruin,removed:true},model('wartrakk-1')]),[]);
  assert.deepEqual(vehicleTerrainContacts({...speeder,removed:true},[ruin]),[]);
  assert.deepEqual(vehicleTerrainContacts(model('captain-1'),[ruin]),[]);
});

test('a tracked vehicle can clear the ground and still hit the underside of a landing',()=>{
  const ruin=model('largeRuin-1'),trakk=model('wartrakk-1',{x:-.8,z:1.4});
  assert.equal(patrolTerrainPlacement(trakk,[ruin],{checkVehicleBody:false}).error,'');
  assert.deepEqual(vehicleTerrainContacts(trakk,[ruin]),[ruin.id]);
  const courtyard={...trakk,x:1.5,z:1.2};
  const box=p=>pieceGeometry(T,p).boundingBox.clone().translate(new T.Vector3(p.x,p.elevation,p.z));
  assert.ok(box(courtyard).intersectsBox(box(ruin)));
  assert.deepEqual(vehicleTerrainContacts(courtyard,[ruin]),[]);
  const baseOnly={...trakk,x:-3.8,z:-1.6};
  assert.ok(patrolTerrainPlacement(baseOnly,[ruin],{checkVehicleBody:false}).error);
  assert.deepEqual(vehicleTerrainContacts(baseOnly,[ruin]),[]);
});

test('contact permits a tangency and uses the version of the screen actually on the table',()=>{
  const wall=model('barricade-1'),trakk=model('wartrakk-1',{x:1.8528473054,z:-1.3292996784});
  // A flat face on the tyre meets the highest edge of an outside post.
  trakk.elevation=2.5599851608276367-.1469999998807907;
  assert.deepEqual(vehicleTerrainContacts(trakk,[wall]),[]);
  assert.deepEqual(vehicleTerrainContacts({...trakk,elevation:trakk.elevation-.025},[wall]),[wall.id]);
  const nose=model('wartrakk-1',{z:-2.55});
  const previous=patrolTerrainPiece(wall,5);
  assert.deepEqual(vehicleTerrainContacts(nose,[wall]),[wall.id]);
  assert.deepEqual(vehicleTerrainContacts(nose,[previous]),[]);
});

test('rigid translation, rotation and terrain elevation preserve which actual parts intersect',()=>{
  const yaw=.87,c=Math.cos(yaw),s=Math.sin(yaw);
  const transform=p=>({...p,x:4+c*p.x+s*p.z,z:-2-s*p.x+c*p.z,elevation:p.elevation+1.23,yaw:p.yaw+yaw});
  const wall=model('barricade-1'),second={...wall,id:'barricade-2'},trakk=model('wartrakk-1',{z:-2.55});
  const moved=transform(trakk),terrain=[transform(second),transform(wall)];
  const original=structuredClone([moved,terrain]);
  assert.deepEqual(vehicleTerrainContacts(moved,terrain),[second.id,wall.id]);
  assert.deepEqual(vehicleTerrainContacts({...moved,elevation:6},terrain),[]);
  assert.deepEqual([moved,terrain],original);
  // Editor drags can update the same object in place between checks.
  terrain[0].z+=8;
  assert.deepEqual(vehicleTerrainContacts(moved,terrain),[wall.id]);
  terrain[0].z=original[1][0].z;
  assert.deepEqual(vehicleTerrainContacts(moved,terrain),[second.id,wall.id]);
});
