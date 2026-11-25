import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {patrolTerrainPlacement as check,patrolTerrainLevels as levels,patrolHighGround,patrolGroundLevel} from './patrol-terrain-placement.mjs';
import {applyLayout} from '../layouts.mjs';

const catalog=createTable().pieces;
const piece=(id,x=0,z=0,elevation=0)=>({...catalog.find(p=>p.id===id),x,z,elevation,yaw:0});
const small=(x,z,h=0)=>piece('gretchin-1',x,z,h);
const turn=(p,angle,dx,dz)=>({...p,x:dx+Math.cos(angle)*p.x+Math.sin(angle)*p.z,
  z:dz-Math.sin(angle)*p.x+Math.cos(angle)*p.z,yaw:p.yaw+angle});

test('ground and open courtyard remain deployable; air and enclosed walls do not',()=>{
  const ruin=piece('largeRuin-1');
  assert.deepEqual(check(small(8,1),[ruin]),{error:'',manual:''});
  assert.match(check(small(8,1,.01),[ruin]).error,/지지/);
  assert.match(check(small(-2.35,-1.6),[ruin]).error,/벽/);
  assert.equal(check(small(.65,.9),[ruin]).error,'');
  assert.ok(check(small(.65,.9),[ruin]).manual);
  assert.deepEqual(levels(small(.65,.9),[ruin]),[0]);
  assert.ok(check(small(.65,.9,3.37),[ruin]).error);
  assert.ok(check(small(-.9,-.55,3),[ruin]).error);
});

test('the raised shrine landing and other balconies use their actual cast elevations',()=>{
  for(const [id,height,x,z] of [['largeRuin-1',3.37,-1.4,-.5],['largeRuin-2',2.30,-1.3,.65],
    ['largeRuin-3',2.35,-1.4,-.5],['largeRuin-4',2.35,-1.4,-.5]]){
    const terrain=piece(id),model=small(x,z,height);
    const options=levels(model,[terrain]);
    assert.equal(options[0],0);
    assert.ok(options.some(h=>Math.abs(h-height)<.02),id+' '+options);
    for(const h of options)assert.equal(check({...model,elevation:h},[terrain]).error,'');
    assert.equal(check(model,[terrain]).error,'',id);
    assert.match(check(model,[terrain]).manual,/베이스 전체/);
    assert.ok(check({...model,elevation:height+.2},[terrain]).error);
    const rotated=turn(terrain,1.13,7,11),rotatedModel=turn(model,1.13,7,11);
    assert.deepEqual(levels(rotatedModel,[rotated]),options);
    assert.deepEqual(check(rotatedModel,[rotated]),check(model,[terrain]));
    assert.ok(check(model,[{...terrain,removed:true}]).error);
  }
});

test('MOUNTED cannot occupy an upper floor, while FLY and INFANTRY require their whole base to fit',()=>{
  const ruins=[piece('largeRuin-1')];
  const trakk=piece('wartrakk-1',-.9,-.55,3.37);
  assert.match(check(trakk,ruins).error,/키워드/);
  assert.deepEqual(levels(trakk,ruins),[0]);
  const flyer=piece('landSpeeder-1',-.9,-.55,3.37);
  for(const yaw of [0,Math.PI/2,1.23]){
    const result=check({...flyer,yaw},ruins);
    assert.ok(result.error);
    assert.doesNotMatch(result.error,/키워드/);
  }
  // Isolate the FLY eligibility rule from the small size of the four kit balconies.
  const wideBalcony={...ruins[0],baseWidth:12,baseDepth:11};
  const supportedFlyer={...flyer,x:-2.5,z:-1.4};
  assert.ok(levels(supportedFlyer,[wideBalcony]).includes(3.37));
  assert.equal(check(supportedFlyer,[wideBalcony]).error,'');
  assert.match(check({...trakk,x:-2.5,z:-1.4},[wideBalcony]).error,/키워드/);
  assert.equal(check(piece('intercessor-1',-.9,-.55,3.37),ruins).error,'');
  assert.ok(check(small(.45,-.5,3.37),ruins).error,'base extends beyond the balcony');
  const floating=piece('largeRuin-1',0,0,1);
  assert.equal(check(small(-1.4,-.5,4.37),[floating]).error,'');
});

test('openings and separated feet are resolved from the actual cast',()=>{
  const arch=piece('pylon-1'),through=small(0,0),collides=small(1.2,0);
  assert.equal(check(through,[arch]).error,'');
  assert.ok(check(through,[arch]).manual);
  assert.ok(check(collides,[arch]).error);
  for(const id of ['shockArray-1','barricade-1','smallRuin-1','capacitorStack-1']){
    const object=piece(id);
    assert.ok(check(through,[object]).error,id);
    assert.equal(check(through,[{...object,removed:true}]).error,'');
  }
});

test('22.05 measures the supporting floor under the base, independent of where the ruin is placed',()=>{
  const tall=piece('largeRuin-1'),lower=piece('largeRuin-2');
  const shooter=piece('intercessor-1',-.9,-.55,3.37);
  const lowerShooter=piece('intercessor-1',-1.3,.65,2.30);
  assert.equal(check(lowerShooter,[lower]).error,'');
  assert.equal(patrolHighGround(lowerShooter,[lower]),false,'its nearby wall rises above 3 inches');
  for(const yaw of [0,.83,Math.PI]){
    const terrain=turn(tall,yaw,-4,2);
    const high=p=>patrolHighGround(turn(p,yaw,-4,2),[terrain]);
    assert.equal(high(shooter),true);
    assert.equal(high({...shooter,elevation:3.374}),true,'within the floor height displayed to 0.01 inch');
    assert.equal(high({...shooter,elevation:3.40}),false,'clear space above the floor');
    assert.equal(high({...shooter,elevation:3}),false,'clear space below the floor');
    assert.equal(high({...shooter,x:.1}),false,'rim overhangs the torn edge');
    assert.equal(high({...shooter,x:.65,z:.9}),false,'open L-shaped courtyard');
  }
  assert.equal(patrolHighGround({...shooter,removed:true},[tall]),false);
  assert.equal(patrolHighGround(shooter,[{...tall,removed:true}]),false);
  assert.equal(patrolHighGround(shooter,[]),false);
  assert.equal(patrolHighGround({...lowerShooter,elevation:3.37},[lower]),false,'editing only the height does not add a floor');
  assert.equal(patrolHighGround({...lowerShooter,elevation:3.30},[{...lower,elevation:1}]),false,'unsupported floating terrain');
  assert.equal(patrolHighGround({...shooter,kind:'wartrakk'},[tall]),false);
});

test('a second terrain piece may provide support or obstruct it, but separate edges cannot be combined',()=>{
  const first=piece('largeRuin-1');
  const atEdge=piece('intercessor-1',.1,-.55,3.37);
  const second=turn(first,Math.PI,.2,-1.1);
  assert.equal(patrolHighGround(atEdge,[first]),false);
  assert.equal(patrolHighGround(atEdge,[second]),false);
  assert.equal(patrolHighGround(atEdge,[first,second]),false);
  const actualSupport={...first,x:1};
  assert.equal(patrolHighGround(atEdge,[first,actualSupport]),true);
  // The other cast's high corner intrudes into the supported base.
  const obstacle={...first,x:atEdge.x+2.355,z:atEdge.z+1.614};
  assert.equal(patrolHighGround(atEdge,[actualSupport,obstacle]),false);
});

test('the ground-level target condition uses the model base, including terrain ground floors and flight stands',()=>{
  assert.equal(patrolGroundLevel(piece('intercessor-1',.65,.9)),true);
  assert.equal(patrolGroundLevel({...piece('landSpeeder-1'),elevation:undefined}),true);
  for(const elevation of [.01,2.30,3.37,-.1,NaN]){
    assert.equal(patrolGroundLevel(piece('boy-1',0,0,elevation)),false);
  }
  assert.equal(patrolGroundLevel({...piece('boy-1'),removed:true}),false);
  assert.equal(patrolGroundLevel(piece('largeRuin-1')),false);
  assert.equal(patrolGroundLevel(null),false);
});

test('recommended patrol placements avoid cast walls on every deployment map',()=>{
  for(const map of ['A','B','C']){
    for(const blue of ['marines','orks']){
      const game=createTable();
      applyLayout(game,map,blue);
      const terrain=game.pieces.filter(p=>p.faction==='terrain');
      for(const model of game.pieces.filter(p=>p.faction!=='terrain')){
        assert.equal(check(model,terrain).error,'',[map,blue,model.id].join(' '));
      }
    }
  }
});
