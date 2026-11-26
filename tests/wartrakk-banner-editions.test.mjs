import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {applyLayout} from '../layouts.mjs';
import {newBattle} from '../rules/battle.mjs';
import {newPatrolSetup} from '../rules/patrol-setup.mjs';
import {advanceOfficialSetup} from '../rules/official-deployment.mjs';
import {patrolTerrainPlacement} from '../rules/patrol-terrain-placement.mjs';
import {trainingFourDeployment as deploy,trainingFourBattle as battle} from '../rules/training-four-battle.mjs';
import {snapshot,restore} from '../state.mjs';

const id='wartrakk-1';
const trakk=pieces=>pieces.find(p=>p.id===id);
const fresh=()=>({...createTable(),rules:newBattle(),logs:[]});
const roundtrip=game=>restore(createTable(),snapshot(game));

test('only the Wartrakk in a saved official game carries the banner belonging to that edition',()=>{
  const game=fresh(),current=newPatrolSetup();
  assert.equal(current.version,8);
  for(const version of [1,6,7,8]){
    game.rules={...newBattle(),officialSetup:{...current,version}};
    const saved=snapshot(game);
    assert.ok(saved.pieces.every(p=>!Object.hasOwn(p,'previousWartrakkBanner')));
    const loaded=restore(createTable(),saved);
    assert.deepEqual(loaded.pieces.filter(p=>p.previousWartrakkBanner).map(p=>p.id),version<8?[id]:[]);
    assert.deepEqual(snapshot(loaded),saved);
  }
  game.rules.officialSetup={...current,version:7};
  applyLayout(game,'A','orks');assert.equal(trakk(game.pieces).previousWartrakkBanner,true);
  game.rules=newBattle();applyLayout(game,'A','orks');
  assert.ok(!trakk(game.pieces).previousWartrakkBanner);
  assert.ok(!trakk(roundtrip(game).pieces).previousWartrakkBanner);
});

test('the fourth handbook edition keeps the same Wartrakk in deployment, visible poses and replay',()=>{
  assert.equal(deploy.create().version,5);
  for(const version of [1,2,3,4,5]){
    const d={...deploy.create(),version},field=deploy.pieces(d);
    assert.deepEqual(field.filter(p=>p.previousWartrakkBanner).map(p=>p.id),version<5?[id]:[]);
    let s=battle.act(battle.create(d),{type:'four-score'});
    s=battle.act(s,{type:'move',unit:'wartrakk',mode:'normal'});
    const resumed=roundtrip({...fresh(),training:s}).training;
    assert.deepEqual(resumed,s);
    assert.equal(!!trakk(battle.pieces(resumed)).previousWartrakkBanner,version<5);
  }
});

function deployOrks(version){
  let g=fresh();g.rules.officialSetup={...newPatrolSetup(),version};
  const act=(action,args={},dice=[])=>{g=advanceOfficialSetup(g,{act:action,...args},()=>dice.shift());};
  act('official-roll-layout',{},[1]);act('official-roll-role',{},[1,6]);act('official-defend');
  act('form-enhance',{team:'marines',enhancement:'veterans'});act('form-lock',{team:'marines'});
  act('form-open',{team:'orks'});act('form-enhance',{team:'orks',enhancement:'warcry'});
  act('form-lock',{team:'orks'});act('official-select',{unit:'wartrakk'});
  const ruin=g.pieces.find(p=>p.id==='largeRuin-1'),c=Math.cos(ruin.yaw),s=Math.sin(ruin.yaw);
  Object.assign(trakk(g.pieces),{x:ruin.x-.4*c+2.7*s,z:ruin.z+.4*s+2.7*c,yaw:ruin.yaw+Math.PI/4,elevation:0});
  return g;
}

test('a previously accepted Wartrakk beside map A ruin 1 resumes in place; the corrected banner clips the same wall',()=>{
  const old=advanceOfficialSetup(deployOrks(7),{act:'official-place'}),resumed=roundtrip(old);
  assert.deepEqual(resumed.rules.deployment.placed,['wartrakk']);
  assert.equal(resumed.rules.deployment.next,'marines');
  assert.deepEqual(snapshot(resumed),snapshot(old));
  const fresh=deployOrks(8),p=trakk(fresh.pieces);
  assert.equal(patrolTerrainPlacement(p,fresh.pieces,{checkVehicleBody:false}).error,'');
  assert.deepEqual(patrolTerrainPlacement(p,fresh.pieces).contacts,['largeRuin-1']);
  assert.throws(()=>advanceOfficialSetup(fresh,{act:'official-place'}),/차체|장비/);
  const incompatible=snapshot(resumed);
  incompatible.rules.officialSetup.version=8;
  assert.throws(()=>restore(createTable(),incompatible),/이미 배치한/);
});

test('training four replays a half-inch move under the old banner, while the new banner intersects ruin 2',()=>{
  const x=-.68,z=-3.77,yaw=-.10-8*Math.PI/12;
  for(const version of [4,5]){
    const deployment={...deploy.create(),version};
    if(version===4){
      const accepted=deploy.move(deployment,id,x,z,yaw);
      assert.deepEqual(roundtrip({...fresh(),training:accepted}).training,accepted);
    }else assert.throws(()=>deploy.move(deployment,id,x,z,yaw),/폐허 2/);
    const clear=deploy.move(deployment,id,x,z-.5,yaw);
    let s=battle.create(clear);
    for(const action of [{type:'four-score'},{type:'move',unit:'wartrakk',mode:'normal'},{type:'path',id,x,z}]){
      s=battle.act(s,action);
    }
    assert.deepEqual(roundtrip({...fresh(),training:s}).training,s);
    if(version===4){
      const done=battle.act(s,{type:'finish'});
      assert.deepEqual(roundtrip({...fresh(),training:done}).training,done);
      assert.equal(battle.validate({...done,version:5}),false);
    }else assert.throws(()=>battle.act(s,{type:'finish'}),/폐허 2/);
  }
});
