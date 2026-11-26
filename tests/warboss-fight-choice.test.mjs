import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {warbossFightBoard} from './fixtures/warboss-fight-board.mjs';
import {getProfile} from '../rules/profiles.mjs';
import {mountRules} from '../rules/panel.mjs';
import {measureFootprints} from '../ruler.mjs';
import {restore,snapshot} from '../state.mjs';

const boss='warboss-1',boy='boy-2',otherBoy='boy-12',captain='captain-1',librarian='librarian-1';

function controls(t,game){
  const listeners={};
  const host={addEventListener(name,fn){listeners[name]=fn;},querySelector:()=>null,remove(){}};
  const previous=globalThis.document;
  globalThis.document={createElement:()=>host,querySelector:()=>true};
  t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
  const get=id=>game.pieces.find(p=>p.id===id);
  let selected=boss;
  const view=mountRules({replaceChildren(){}},{
    getTable:()=>game,getSelection:()=>get(selected),selectPiece:id=>{selected=id;},
    getRulesState:()=>game.rules,getPieces:()=>game.pieces,getObjectiveAreas:()=>[],fightObjectives:()=>[],
    getDistance:(a,b)=>measureFootprints(get(a),get(b)).distance,onChange:()=>()=>{},
    commitRules(rules,changes,message){
      game.rules=rules;
      for(const [id,removed] of Object.entries(changes))get(id).removed=removed;
      game.logs.push(message);
    }
  });
  t.after(()=>view.destroy());
  const tag=act=>host.innerHTML.match(new RegExp('<button[^>]*data-act="'+act+'"[^>]*>'))?.[0];
  function click(act){
    assert.ok(tag(act)&&!tag(act).includes('disabled'),act+' is available');
    listeners.click({target:{closest:()=>({dataset:{act}})}});
  }
  function choose(key,value){
    assert.ok(host.innerHTML.includes('data-field="'+key+'"'),key+' exists');
    listeners.change({target:{dataset:{field:key},value:String(value)}});
  }
  function allocate(actor,target,count){
    choose('fighter',actor);choose('target',target);choose('allocation',count);click('attack');
  }
  function load(saved){
    Object.assign(game,restore(createTable(),structuredClone(saved)));
    view.refresh();
  }
  return {click,choose,allocate,load,tag};
}

function checkRows(game,style,assignments){
  assert.deepEqual(game.rules.declaration.rows.map(r=>[r.actor,r.target,r.assigned,r.lethal,r.sustained]),
    assignments.map(([actor,target,n])=>[actor,target,n,style==='lethal',style==='sustained']));
}
function chooseUnit(ui){
  ui.click('fight-pass');ui.click('fight-pass');ui.choose('fight-unit','boy-0');
}
const first=[boss,'captain',3],second=[boss,'librarian',3];
const boyAttacks=getProfile(createTable().pieces.find(p=>p.id===boy)).weapons.find(w=>!w.range).attacks;
const third=[boy,'librarian',boyAttacks];

test('Smash ’Em Up belongs to the whole fight across split targets, cancellation, load and the next unit',t=>{
  const game=warbossFightBoard(),ui=controls(t,game);
  chooseUnit(ui);
  const beforeSelection=snapshot(game);
  ui.click('fight-normal-sustained');
  assert.equal(game.rules.fightSequence.active.bossStyle,'sustained');
  ui.allocate(boss,captain,3);
  checkRows(game,'sustained',[first]);
  ui.click('cancel-plan');
  assert.equal(game.rules.declaration,null);
  assert.equal(game.rules.fightSequence.active.bossStyle,'sustained');
  assert.ok(!ui.tag('fight-normal'),'cancelling target assignments does not repeat the fight selection');
  ui.allocate(boss,captain,3);
  ui.load(snapshot(game));
  ui.allocate(boss,librarian,3);ui.allocate(boy,librarian,boyAttacks);
  checkRows(game,'sustained',[first,second,third]);
  ui.click('lock');ui.load(snapshot(game));
  assert.ok(game.rules.declaration.locked);
  checkRows(game,'sustained',[first,second,third]);

  // Restore the exact snapshot used for an undo back before the fight was chosen.
  ui.load(beforeSelection);ui.choose('fight-unit','boy-0');ui.click('fight-normal');
  assert.equal(game.rules.fightSequence.active.bossStyle,'lethal');
  ui.allocate(boss,captain,3);ui.allocate(boss,librarian,3);ui.allocate(boy,librarian,boyAttacks);
  ui.click('lock');checkRows(game,'lethal',[first,second,third]);
  t.mock.method(Math,'random',()=>0); // Every hit fails. Both targets survive to the next activation.
  for(const i of [0,1,2])ui.click('resolve-'+i);
  ui.click('fight-finish');
  if(ui.tag('fight-counter-decline'))ui.click('fight-counter-decline');
  ui.choose('fight-unit','boy-1');
  assert.ok(!ui.tag('fight-normal-sustained'));
  ui.click('fight-normal');
  assert.equal(game.rules.fightSequence.active.unit,'boy-1');
  assert.equal(game.rules.fightSequence.active.bossStyle,undefined);
  ui.allocate(otherBoy,captain,boyAttacks);
  const row=game.rules.declaration.rows[0];
  assert.ok(!row.lethal&&!row.sustained,'the separate Boyz unit inherits neither effect');
});

test('an older draft asks once and updates every target, while already locked legacy attacks retain their rolls',t=>{
  const game=warbossFightBoard(),ui=controls(t,game);
  chooseUnit(ui);ui.click('fight-normal');
  ui.allocate(boss,captain,3);ui.allocate(boss,librarian,3);ui.allocate(boy,librarian,boyAttacks);
  const draft=snapshot(game);
  ui.click('lock');
  const locked=snapshot(game);
  for(const save of [draft,locked]){
    delete save.rules.fightSequence.active.bossStyle;
    Object.assign(save.rules.declaration.rows[1],{lethal:false,sustained:true});
  }
  ui.load(draft);
  assert.ok(ui.tag('fight-style-lethal')&&ui.tag('fight-style-sustained'));
  assert.ok(!ui.tag('lock')&&!ui.tag('attack'));
  ui.click('fight-style-sustained');
  checkRows(game,'sustained',[first,second,third]);
  ui.load(snapshot(game));
  assert.ok(!ui.tag('fight-style-sustained'));
  ui.click('lock');
  checkRows(game,'sustained',[first,second,third]);

  ui.load(locked);
  assert.ok(!ui.tag('fight-style-lethal'));
  assert.deepEqual(game.rules.declaration.rows,locked.rules.declaration.rows);
  t.mock.method(Math,'random',()=>0);
  ui.click('resolve-0');
  assert.ok(game.rules.declaration.rows[0].done);
  assert.ok(game.rules.declaration.rows[1].sustained&&!game.rules.declaration.rows[1].lethal);
  ui.load(snapshot(game));
  assert.ok(!ui.tag('fight-style-sustained'));
  ui.click('resolve-1');ui.click('resolve-2');
  assert.equal(game.rules.units['boy-0'].finishedAttack,4);
});
