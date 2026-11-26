import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {applyLayout,layoutGeometry,layoutScenery} from '../layouts.mjs';
import {advance,newBattle,startBattle} from '../rules/battle.mjs';
import {assessMove} from '../movement.mjs';
import {beginMove,proposeMove,finishMove,rewindMove} from '../move-session.mjs';
import {snapshot,restore} from '../state.mjs';

const all=createTable().pieces;
const figure=(id,x=0,z=0)=>({...all.find(p=>p.id===id),x,z,yaw:0,elevation:0});
function commit(g,r){
  g.rules=r.rules;
  for(const [id,pose] of Object.entries(r.poses??{}))Object.assign(g.pieces.find(p=>p.id===id),pose);
}
function assess(p,terrain,route,options={}){
  return assessMove({game:{width:44,depth:30,pieces:[p,...terrain]},pieces:[p],
    paths:{[p.id]:route},type:'normal',...options});
}

test('map A captain cannot finish a 5.5″ climb in open air, including when resuming an older draft',()=>{
  const g={...createTable(),logs:[],rules:startBattle(newBattle(),'marines',5)};
  applyLayout(g,'A','marines');g.rules=advance(g.rules,g.pieces);
  const p=g.pieces.find(m=>m.id==='captain-1');
  commit(g,beginMove(g,p,'normal'));
  commit(g,proposeMove(g,p,{[p.id]:[{elevation:5.5}]}));
  const save=snapshot(g);
  for(const game of [g,restore(createTable(),save)]){
    assert.throws(()=>finishMove(game),/지지|상판/);
    assert.equal(game.rules.movePlan.unit,'captain');
    commit(game,rewindMove(game));commit(game,finishMove(game));
    assert.equal(game.pieces.find(m=>m.id===p.id).elevation,0);
  }
  // Previous releases could commit this exact draft. A completed move stays at its saved pose.
  save.rules.movePlan=null;
  assert.equal(restore(createTable(),save).pieces.find(m=>m.id===p.id).elevation,5.5);
});

test('the actual balcony supports the entire base at its cast height; missing, removed, and overhanging floors fail',()=>{
  const ruin=figure('largeRuin-1');
  const marine=figure('intercessor-1',-.9,-.55);
  const move=(p,terrain,height)=>assess(p,terrain,[{elevation:height}]);
  const supported=move(marine,[ruin],3.37);
  assert.ok(supported.ok);
  assert.ok(supported.manual.some(e=>e.code==='supported-floor'));
  for(const r of [move(marine,[ruin],3),move(marine,[{...ruin,removed:true}],3.37),
    move({...marine,x:.10},[ruin],3.37)])assert.ok(r.errors.some(e=>e.code==='unsupported-floor'));
  const grot=figure('gretchin-1',-1.4,-.5),second=figure('largeRuin-2');
  assert.ok(move(grot,[{...second,previousSecondRuin:true,baseDepth:4.1}],2.35).ok);
  assert.ok(move(grot,[second],2.35).errors.some(e=>e.code==='unsupported-floor'));
});

test('flight may pass through an airborne waypoint and land; charge and both fight motions share the landing check',()=>{
  const flyer=figure('vanguard-1');
  const high=[{elevation:2},{x:1}];
  for(const options of [{takeToSkies:true},{type:'charge',chargeDistance:7,takeToSkies:true},
    {type:'pile-in',maxDistance:3},{type:'consolidate',maxDistance:3}]){
    assert.ok(assess(flyer,[],high,{...options,phase:'path'}).ok);
    assert.ok(assess(flyer,[],high,options).errors.some(e=>e.code==='unsupported-floor'));
  }
  const landed=assess(flyer,[],[...high,{elevation:0}],{takeToSkies:true});
  assert.ok(landed.ok);assert.equal(landed.models[flyer.id].distance,1);
});

test('each map uses the floor at its actual registered position in both the previous and current layout',()=>{
  for(const map of ['A','B','C'])for(const version of [2,undefined]){
    const table=createTable();
    for(const [piece,pose] of layoutScenery(table,layoutGeometry(map,version)))Object.assign(piece,pose);
    const terrain=table.pieces.filter(p=>p.faction==='terrain'),ruin=terrain.find(p=>p.id==='largeRuin-1');
    const c=Math.cos(ruin.yaw),s=Math.sin(ruin.yaw);
    const marine=figure('intercessor-1',ruin.x-.9*c-.55*s,ruin.z+.9*s-.55*c);
    assert.ok(assess(marine,terrain,[{elevation:3.37}]).ok,map+' '+version);
    assert.ok(assess(marine,terrain,[{elevation:3.55}]).errors.some(e=>e.code==='unsupported-floor'));
  }
});
