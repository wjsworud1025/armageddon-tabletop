import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {newBattle,startBattle} from '../rules/battle.mjs';
import {snapshot} from '../state.mjs';

function lastTurn(){
  const game={...createTable(),surface:'reverse',logs:[]};
  game.rules={...startBattle(newBattle(),'marines',5,game.pieces),round:5,active:'orks',step:5,vp:{marines:9,orks:6}};
  for(const p of game.pieces){
    if(p.faction==='terrain'||['captain-1','warboss-1'].includes(p.id))continue;
    p.removed=true;
    game.rules.hp[p.id]=0;
  }
  return snapshot(game);
}

export async function checkMatchRestart({save,upload,click,js,state,reload,send},{expectOld=false}={}){
  const battle='[data-tab=battle]',history='[data-tab=history]',resultButton='[data-act=match-restart]';
  const previousTab=await js('document.querySelector("[data-tab][aria-selected=true]")?.dataset.tab');
  async function open(selector){
    await click(selector);
    assert.equal(await js('document.querySelector("#question").open'),true);
    await js('window.__matchRestartClose=new Promise(r=>document.querySelector("#question").addEventListener("close",()=>r(true),{once:true}));true');
  }
  async function close(value){
    if(value==='Escape'){
      const key={key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27};
      await send('Input.dispatchKeyEvent',{type:'rawKeyDown',...key});
      await send('Input.dispatchKeyEvent',{type:'keyUp',...key});
    }else{
      await click('#question button[value='+value+']');
    }
    await js('window.__matchRestartClose');
    assert.equal(await js('document.querySelector("#question").open'),false);
  }
  try{
    await upload(lastTurn());await click(battle);await click('[data-act=next]');
    const finished=await state();
    assert.equal(finished.rules.status,'finished');
    assert.equal(finished.surface,'reverse');
    assert.deepEqual(finished.rules.vp,{marines:9,orks:6});
    assert.equal(await js('document.querySelector("#rules .br-phase").textContent'),'스페이스 마린 승리');
    if(expectOld){
      await click(history);await open('#reset');
    }else{
      await open(resultButton);await close('cancel');
      assert.deepEqual(await state(),finished);
      await open(resultButton);
    }
    await close('yes');
    const fresh=await state();
    assert.equal(fresh.rules,null);
    assert.equal(fresh.layout,null);
    assert.equal(fresh.surface,'front');
    assert.deepEqual(fresh.pieces,snapshot({...createTable(),logs:[],rules:null}).pieces);
    if(!expectOld){
      await click('#undo');assert.deepEqual(await state(),finished);
      await click('#redo');assert.deepEqual(await state(),fresh);
    }
    await click(battle);await click('[data-act=start]');await click('[data-act=next]');
    const playing=await state();
    assert.equal(playing.rules.status,'playing');
    assert.equal(playing.rules.step,1);
    await click(history);await open('#reset');await close('Escape');
    if(expectOld){
      const after=await state();
      if(after.rules)assert.deepEqual(after,playing);
      else assert.deepEqual(after,fresh);
      return {preserved:!!after.rules,returnValue:await js('document.querySelector("#question").returnValue')};
    }
    assert.deepEqual(await state(),playing,'Escape preserves the second match');
    await reload();assert.deepEqual(await state(),playing,'autosave still contains the second match');
  }finally{
    await js('delete window.__matchRestartClose');
    await upload(save);
    if(previousTab)await click('[data-tab='+previousTab+']');
  }
}
