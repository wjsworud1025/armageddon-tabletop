import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {objectiveAreas} from '../layouts.mjs';
import {measureFootprints} from '../ruler.mjs';
import {missionAward,objectiveSnapshot} from '../rules/missions.mjs';
import {mountRules} from '../rules/panel.mjs';
import {restore,snapshot} from '../state.mjs';
import {orkObjectiveBoard} from './fixtures/ork-objective-board.mjs';

const mat='blue-home';
const piece=(game,id)=>game.pieces.find(p=>p.id===id);
const gap=(game,a,b)=>measureFootprints(piece(game,a),piece(game,b)).distance;

// Click the same Command-phase Next button that takes the board snapshot
// and credits the mission. Only the host DOM and commit transport are stubbed.
function endCommand(game){
  let click;
  const root={addEventListener(name,fn){if(name==='click')click=fn;},querySelector:()=>null,remove(){}};
  const previous=globalThis.document;
  globalThis.document={createElement:()=>root,querySelector:()=>true};
  let view;
  try{
    view=mountRules({replaceChildren(){}},{
      getSelection:()=>null,getRulesState:()=>game.rules,getTable:()=>game,getPieces:()=>game.pieces,
      getObjectiveAreas:()=>objectiveAreas(game),getDistance:(a,b)=>gap(game,a,b),onChange:()=>()=>{},
      commitRules(rules,changes,message){
        game.rules=rules;
        for(const [id,removed] of Object.entries(changes))piece(game,id).removed=removed;
        game.logs.push(message);
      }
    });
    const button=root.innerHTML.match(/<button[^>]*data-act="next"[^>]*>/)?.[0];
    assert.ok(button&&!button.includes('disabled'),'the pending Command step can finish');
    click({target:{closest:()=>({dataset:{act:'next'}})}});
  }finally{
    view?.destroy();
    if(previous===undefined)delete globalThis.document;
    else globalThis.document=previous;
  }
}

test('Grab Dat Scrap: an attached Warboss outside the mat engages for a Boy on the Marine home objective',()=>{
  const game=restore(createTable(),snapshot(orkObjectiveBoard()));
  const members=objectiveAreas(game).find(a=>a.id===mat).members;
  assert.deepEqual([...members].sort(),['boy-2','captain-1']);
  assert.equal(gap(game,'warboss-1','captain-1').toFixed(2),'0.78');
  assert.equal(gap(game,'boy-2','captain-1').toFixed(2),'2.49');
  assert.ok(gap(game,'warboss-1','boy-2')<2,'the two Orks are coherent');
  const before=game.rules.vp.orks;
  endCommand(game);
  assert.equal(game.rules.step,1);
  const {orkOC,marineOC,owner}=game.rules.objectives[mat];
  assert.deepEqual({orkOC,marineOC,owner},{orkOC:3,marineOC:2,owner:'orks'});
  assert.equal(game.rules.vp.orks-before,10);
  const loaded=restore(createTable(),snapshot(game));
  assert.deepEqual(loaded.rules.objectives[mat],game.rules.objectives[mat]);
  assert.equal(loaded.rules.vp.orks,10);
});

for(const [label,change,orkOC,owner] of [
  ['a separate Warboss gives the Boy no bonus',g=>{g.rules.attachments={};},2,null],
  ['a battle-shocked attached unit contributes no OC',g=>{g.rules.units['boy-0'].shocked=true;},0,'marines'],
  ['a dead Warboss cannot engage from his previous location',g=>{piece(g,'warboss-1').removed=true;},2,null],
  ['a dead Boy cannot score from his previous location',g=>{piece(g,'boy-2').removed=true;},0,'marines'],
  ['a Warboss contesting the mat alone loses the Boyz ability when the last Boy dies',g=>{
    piece(g,'boy-2').removed=true;
    piece(g,'warboss-1').z=-1.4;
    assert.ok(objectiveAreas(g).find(a=>a.id===mat).members.includes('warboss-1'));
    assert.equal(gap(g,'warboss-1','captain-1').toFixed(2),'0.89');
  },1,'marines'],
]){
  test('Grab Dat Scrap: '+label,()=>{
    const game=orkObjectiveBoard();
    change(game);
    const areas=objectiveSnapshot(game.rules,game.pieces,objectiveAreas(game),(a,b)=>gap(game,a,b));
    assert.equal(areas[mat].orkOC,orkOC);
    assert.equal(areas[mat].marineOC,2);
    assert.equal(areas[mat].owner,owner);
    assert.equal(missionAward(game.rules,Object.values(areas)),0);
  });
}
