import assert from 'node:assert/strict';
import test from 'node:test';
import {createTable} from '../data/catalog.mjs';
import {restore,snapshot} from '../state.mjs';
import {newBattle} from '../rules/battle.mjs';
import {advanceOfficialSetup,patrolPlacementError} from '../rules/official-deployment.mjs';
import {newPatrolSetup} from '../rules/patrol-setup.mjs';
import {patrolTerrainLevels} from '../rules/patrol-terrain-placement.mjs';

const piece=(game,id)=>game.pieces.find(p=>p.id===id);
function onRuin(ruin,x,z,elevation){
  const c=Math.cos(ruin.yaw),s=Math.sin(ruin.yaw);
  return {x:ruin.x+c*x+s*z,z:ruin.z-s*x+c*z,elevation};
}

function pendingGretchin(version=8){
  let game={...createTable(),logs:[],rules:{...newBattle(),officialSetup:{...newPatrolSetup(),version}}};
  function act(act,args={},dice=[]){
    game=advanceOfficialSetup(game,{act,...args},()=>dice.shift());
  }
  act('official-roll-layout',{},[2]); // Map A, with the second ruin in the Ork deployment zone.
  act('official-roll-role',{},[6,2]);
  act('official-defend');
  act('form-enhance',{team:'marines',enhancement:'veterans'});
  act('form-lock',{team:'marines'});
  act('form-open',{team:'orks'});
  act('form-enhance',{team:'orks',enhancement:'armour'});
  act('form-lock',{team:'orks'});
  act('official-select',{unit:'captain'});
  act('official-place');
  act('official-select',{unit:'gretchin'});
  const ruin=piece(game,'largeRuin-2');
  const unit=game.pieces.filter(p=>p.kind==='gretchin');
  // The other nine 25 mm bases form three ranks in the courtyard.
  for(const [i,model] of unit.slice(1).entries()){
    Object.assign(model,onRuin(ruin,(i%3-1)*1.2,-Math.floor(i/3)*1.2,0));
  }
  return game;
}

test('a Gretchin squad can deploy beside the fracture and reload, while its base cannot hang over the broken edge',()=>{
  const game=pendingGretchin(),ruin=piece(game,'largeRuin-2'),model=piece(game,'gretchin-1');
  Object.assign(model,onRuin(ruin,-.14,1.04,0));
  const height=patrolTerrainLevels(model,[ruin]).find(h=>h>0);
  assert.ok(height,'there is a supported upper floor near the fracture');
  model.elevation=height;
  assert.equal(patrolPlacementError(game),'');
  const saved=snapshot(advanceOfficialSetup(game,{act:'official-place'}));
  assert.deepEqual(snapshot(restore(createTable(),saved)),saved);
  model.elevation=height+.25;
  assert.ok(patrolPlacementError(game),'the same base would be unsupported a quarter inch above the floor');
  assert.throws(()=>advanceOfficialSetup(game,{act:'official-place'}));

  // The optical slit sits beside a torn outside edge. A 25 mm base centred
  // on it would overhang the landing even if the slit alone were filled.
  Object.assign(model,onRuin(ruin,.336,.756,height));
  assert.ok(patrolPlacementError(game));
  assert.throws(()=>advanceOfficialSetup(game,{act:'official-place'}));
  Object.assign(piece(saved,model.id),onRuin(ruin,.336,.756,height));
  assert.throws(()=>restore(createTable(),saved));
});

test('a previously completed deployment next to the fracture can resume',()=>{
  const game=pendingGretchin(5),ruin=piece(game,'largeRuin-2'),model=piece(game,'gretchin-1');
  Object.assign(model,onRuin(ruin,-1.3,.65,2.31));
  const previous=snapshot(advanceOfficialSetup(game,{act:'official-place'}));
  // This exact 25 mm placement was offered by the earlier mesh's floor
  // picker, accepted by official-place and restored in terrain revision 2.
  previous.terrainRevision=2;
  Object.assign(piece(previous,model.id),onRuin(ruin,-.12,.94,2.31));
  const resumed=restore(createTable(),previous);
  assert.deepEqual(resumed.layout,game.layout);
  assert.deepEqual(resumed.rules.deployment,previous.rules.deployment);
  const resumedSave=snapshot(resumed);
  assert.deepEqual(piece(resumedSave,model.id),piece(previous,model.id));
  assert.deepEqual(snapshot(restore(createTable(),resumedSave)),resumedSave);
});
