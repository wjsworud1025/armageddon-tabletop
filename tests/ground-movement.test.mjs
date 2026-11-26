import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {applyLayout} from '../layouts.mjs';
import {beginMove,proposeMove,finishMove} from '../move-session.mjs';
import {advance,newBattle,startBattle} from '../rules/battle.mjs';
import {snapshot,restore} from '../state.mjs';
import {assessMove} from '../movement.mjs';

function at(terrain,x,z){
  const c=Math.cos(terrain.yaw),s=Math.sin(terrain.yaw);
  return {x:terrain.x+c*x+s*z,z:terrain.z-s*x+c*z,elevation:0};
}
function setup(map,id,start){
  const game={...createTable(),logs:[],rules:startBattle(newBattle(),'marines',5)};
  applyLayout(game,map,'marines');
  game.rules=advance(game.rules,game.pieces);
  const terrain=game.pieces.find(p=>p.id===id),actor=game.pieces.find(p=>p.id==='captain-1');
  Object.assign(actor,at(terrain,...start));
  return {game,actor,terrain};
}
function commit(game,result){
  game.rules=result.rules;
  for(const [id,pose] of Object.entries(result.poses??{}))Object.assign(game.pieces.find(p=>p.id===id),pose);
}

for(const map of ['A','B','C']){
  test('map '+map+': ground infantry may traverse a wall and enter open space, but cannot stop inside a wall or column',()=>{
    for(const [id,start,blocked,clear] of [
      ['largeRuin-1',[-3.6,0],[-2.3,0],[-1.1,0]],
      ['pylon-1',[0,-1.7],[1.2,0],[0,0]],
    ]){
      const {game,actor,terrain}=setup(map,id,start);
      commit(game,beginMove(game,actor,'normal'));
      commit(game,proposeMove(game,actor,{[actor.id]:[at(terrain,...blocked)]}));
      const saved=snapshot(game),continued=restore(createTable(),saved);
      assert.throws(()=>finishMove(continued),/벽이나 구조물/);
      const marine=continued.pieces.find(p=>p.id===actor.id);
      commit(continued,proposeMove(continued,marine,{[actor.id]:[at(terrain,...clear)]}));
      commit(continued,finishMove(continued));
      assert.equal(continued.rules.movePlan,null);
      assert.equal(marine.x,at(terrain,...clear).x);
      // A game saved after the old client accepted the blocked position remains loadable.
      saved.rules.movePlan=null;
      const oldGame=restore(createTable(),saved),oldMarine=oldGame.pieces.find(p=>p.id===actor.id);
      const oldPosition=at(terrain,...blocked);
      assert.deepEqual([oldMarine.x,oldMarine.z],[oldPosition.x,oldPosition.z]);
      const leave=assessMove({game:oldGame,pieces:[oldMarine],type:'normal',
        paths:{[oldMarine.id]:[at(terrain,...clear)]}});
      assert.ok(leave.ok);
    }
  });
}

test('charge, pile-in and consolidation use the same separate transit and endpoint checks',()=>{
  const {game,actor,terrain}=setup('A','largeRuin-1',[-3.6,0]);
  const common={game,pieces:[actor],paths:{[actor.id]:[at(terrain,-2.3,0)]}};
  for(const options of [{type:'charge',chargeDistance:3},{type:'pile-in',maxDistance:3},{type:'consolidate',maxDistance:3}]){
    assert.ok(assessMove({...common,...options,phase:'path'}).ok);
    assert.ok(assessMove({...common,...options}).errors.some(e=>e.code==='terrain-base'));
  }
});
