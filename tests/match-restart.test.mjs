import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {mountRules} from '../rules/panel.mjs';
import {advance,newBattle,startBattle} from '../rules/battle.mjs';
import {snapshot,restore,baseDistance} from '../state.mjs';

test('the final result offers a confirmed rematch and survives requesting one',t=>{
  const game={...createTable(),logs:[]};
  const handlers={},el={addEventListener:(name,fn)=>{handlers[name]=fn;},querySelector:()=>null,remove(){}};
  const previous=globalThis.document;
  globalThis.document={createElement:()=>el,querySelector:()=>true};
  t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
  const piece=id=>game.pieces.find(p=>p.id===id);
  let requests=0;
  const panel=mountRules({replaceChildren(){}},{
    getSelection:()=>null,getRulesState:()=>game.rules,getTable:()=>game,getPieces:()=>game.pieces,
    getDistance:(a,b)=>baseDistance(piece(a),piece(b)),onChange:()=>()=>{},requestNewGame:()=>{requests++;},
  });
  t.after(()=>panel.destroy());
  const ask=()=>handlers.click({target:{closest:()=>({dataset:{act:'match-restart'}})}});
  ask();
  assert.equal(requests,0);
  for(const [i,[marines,orks,label]] of [[8,2,'스페이스 마린 승리'],[2,8,'오크 승리'],[2,2,'무승부']].entries()){
    const last={...startBattle(newBattle(),'marines',5,game.pieces),round:5,step:5,active:'orks',vp:{marines,orks}};
    game.rules=advance(last,game.pieces);
    Object.assign(game,restore(createTable(),snapshot(game)));
    panel.refresh();
    assert.ok(el.innerHTML.includes(label)&&el.innerHTML.includes(marines+' 대 '+orks));
    assert.match(el.innerHTML,/data-act="match-restart"/);
    assert.doesNotMatch(el.innerHTML,/data-act="next"/);
    const before=snapshot(game);
    ask();
    assert.equal(requests,i+1);
    assert.deepEqual(snapshot(game),before);
  }
});
