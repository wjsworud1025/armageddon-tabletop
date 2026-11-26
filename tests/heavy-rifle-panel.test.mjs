import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {restore,snapshot,baseDistance} from '../state.mjs';
import {beginMove,finishMove} from '../move-session.mjs';
import {mountRules} from '../rules/panel.mjs';
import {heavyRifleBoard,heavyShooter,heavyTarget} from './fixtures/heavy-rifle-board.mjs';

function mount(t,mode){
  let game=restore(createTable(),snapshot(heavyRifleBoard(mode)));
  const fields={},listeners={};
  const host={addEventListener(type,fn){listeners[type]=fn;},remove(){},
    querySelector(query){return fields[/^\[data-field="([^"]+)"\]$/.exec(query)?.[1]]??null;}};
  const doc=globalThis.document;
  globalThis.document={createElement:()=>host,querySelector:()=>true};
  t.after(()=>{if(doc===undefined)delete globalThis.document;else globalThis.document=doc;});
  const by=id=>game.pieces.find(p=>p.id===id);
  const panel=mountRules({replaceChildren(){}},{
    getTable:()=>game,getRulesState:()=>game.rules,getPieces:()=>game.pieces,
    getSelection:()=>by(heavyShooter),selectPiece(){},getObjectiveAreas:()=>[],onChange:()=>()=>{},
    getDistance:(a,b)=>baseDistance(by(a),by(b)),
    moveCommand(action,p){
      const move=action==='finish'?finishMove(game):beginMove(game,p,action);
      game.rules=move.rules;
      for(const [id,pose] of Object.entries(move.poses??{}))Object.assign(by(id),pose);
      return move.message;
    },
    commitRules(rules,changes,msg){
      game.rules=rules;game.logs.push(msg);
      for(const [id,removed] of Object.entries(changes))by(id).removed=removed;
    }
  });
  t.after(()=>panel.destroy());
  function click(act,extra={}){
    const button=new RegExp('<button[^>]*data-act="'+act+'"[^>]*>').exec(host.innerHTML)?.[0];
    assert.ok(button&&!button.includes('disabled'),act+' available');
    listeners.click({target:{closest:()=>({dataset:{act,...extra}})}});
  }
  function choose(field,value){
    assert.ok(host.innerHTML.includes('data-field="'+field+'"'),field+' available');
    fields[field]={dataset:{field},value:String(value)};
    listeners.change({target:fields[field]});
  }
  function dice(action,values){
    const prev=Math.random;
    try{
      Math.random=()=>{assert.ok(values.length,'Unexpected roll');return (values.shift()-.5)/6;};
      click(action);assert.deepEqual(values,[]);
    }finally{Math.random=prev;}
  }
  function reload(){
    const saved=snapshot(game);game=restore(createTable(),saved);panel.refresh();
    assert.deepEqual(snapshot(game),saved);
  }
  return {click,choose,dice,reload,state:()=>game.rules,html:()=>host.innerHTML};
}

for(const [mode,manual,status,reason,bonus,hits] of [
  ['remain',0,'active','eligible',true,1],['short',0,'active','eligible',true,1],
  ['moving',0,'inactive','distance',false,0],
  ['remain',-1,'active','eligible',true,0],['legacy',1,'unknown','unknown',undefined,1]
]){
  test('Heavy on the battle panel: '+mode+', other roll modifier '+manual,t=>{
    const ui=mount(t,mode);
    if(mode!=='legacy'){
      ui.click(mode==='remain'?'remain':'move-finish');ui.click('next');
    }
    assert.equal(ui.state().step,2);
    ui.choose('weapon',0);ui.choose('target',heavyTarget);
    assert.match(ui.html(),new RegExp('data-heavy-status="'+status+'" data-heavy-reason="'+reason+'"'));
    assert.match(ui.html(),/data-ballistic-skill="3">BS 3\+/);
    if(mode==='legacy')assert.match(ui.html(),/직접 입력/);
    ui.choose('weapon',1);assert.doesNotMatch(ui.html(),/data-heavy-status/);ui.choose('weapon',0);
    ui.click('shot-sight',{shooter:heavyShooter,target:heavyTarget,status:'visible'});
    ui.choose('hitMod',manual);ui.click('attack');ui.click('lock');
    assert.ok(ui.state().declaration.locked);
    const row=ui.state().declaration.rows[0];
    assert.equal(row.hit,manual);assert.equal(row.heavy,bonus);
    ui.reload();assert.match(ui.html(),new RegExp('data-heavy-applied="'+(bonus===undefined?'legacy':bonus)+'"'));
    if(mode==='remain'&&!manual){
      ui.dice('staged-0',[2,1]);ui.dice('packet-keep',[1]);ui.click('packet-keep');
    }else ui.dice('resolve-0',hits?[2,1,1]:[2,1]);
    assert.match(ui.state().last,new RegExp(hits+'/2 명중'));
  });
}
