import assert from 'node:assert/strict';
import test from 'node:test';
import {createTable} from '../data/catalog.mjs';
import {snapshot,restore} from '../state.mjs';
import {beginFightSequence,transitionFight,chooseLegacyBossStyle} from '../fight-sequence.mjs';
import {newBattle,startBattle} from './battle.mjs';
import {appendDeclaration,lockDeclaration,resolvePacket,attackPackets} from './declarations.mjs';
import {validateRulesState} from './validate.mjs';

function fixture(style){
  const game=createTable(),poses={'warboss-1':[0,0],'boy-2':[0,2],'captain-1':[2,1],'librarian-1':[-2,0]};
  for(const p of game.pieces){
    p.removed=!poses[p.id];
    if(!p.removed)Object.assign(p,{x:poses[p.id][0],z:poses[p.id][1],yaw:0});
  }
  game.logs=[];
  game.rules={...startBattle(newBattle(),'orks',5),step:4,units:{'boy-0':{charged:true}},
    attachments:{'warboss-1':'boy-0'}};
  let s=beginFightSequence(game);
  for(let i=0;i<2;i++)s=transitionFight(game,s,{type:'pass'});
  game.rules.fightSequence=transitionFight(game,s,{type:'select',unit:'boy-0',bossStyle:style});
  return game;
}
function row(actor,weapon,target,assigned){
  return {actor,weapon,target,assigned,preferred:target+'-1',distance:1,size:1,hit:0,wound:0,extra:0,
    cover:false,lethal:true,sustained:true,ignore:false,guard:false};
}
const rows=[row('warboss-1',1,'captain',3),row('warboss-1',1,'librarian',3),row('boy-2',2,'captain',1)];
const eligible=g=>g.pieces.filter(p=>['warboss-1','boy-2'].includes(p.id));
for(const style of ['lethal','sustained']){
  test('Smash ’Em Up '+style+' applies once to a split weapon and to the attached Boy, even after deleting a draft',()=>{
    const g=fixture(style),s=g.rules;
    assert.equal(s.fightSequence.active.bossStyle,style);
    const draft=appendDeclaration(s,g.pieces,rows.slice(0,1));
    const resumed=restore(createTable(),snapshot({...g,rules:{...draft,declaration:null}}));
    assert.equal(chooseLegacyBossStyle(resumed,'lethal'),null);
    const plan=appendDeclaration(resumed.rules,resumed.pieces,rows);
    const locked=lockDeclaration(plan,resumed.pieces,eligible(g));
    assert.ok(locked.declaration.rows.every(r=>r.lethal===(style==='lethal')&&r.sustained===(style==='sustained')));
    assert.ok(validateRulesState(locked));
    const edited=structuredClone(locked);
    edited.declaration.rows[2].sustained=!edited.declaration.rows[2].sustained;
    assert.equal(validateRulesState(edited),false);
    const malformed=structuredClone(locked);malformed.fightSequence.active.bossStyle={toString:0};
    assert.equal(validateRulesState(malformed),false);
    assert.equal(validateRulesState({...locked,attachments:{}}),false);
  });
}
test('legacy drafts require a unit-wide choice, while locked rows keep their actual critical-hit rules',()=>{
  const g=fixture('sustained');
  const old=appendDeclaration(g.rules,g.pieces,rows);
  delete old.fightSequence.active.bossStyle;
  Object.assign(old.declaration.rows[0],{lethal:true,sustained:false});
  assert.equal(lockDeclaration(old,g.pieces,eligible(g)),null);
  const restored=restore(createTable(),snapshot({...g,rules:old}));
  const repaired=chooseLegacyBossStyle(restored,'lethal');
  assert.ok(lockDeclaration(repaired,g.pieces,eligible(g)).declaration.rows.every(r=>r.lethal&&!r.sustained));
  const earliest=structuredClone(restored);delete earliest.rules.fightSequence;
  assert.equal(chooseLegacyBossStyle(earliest,'sustained').fightSequence.active.bossStyle,'sustained');
  const archived={...old,declaration:{...old.declaration,locked:true}};
  const saved=restore(createTable(),snapshot({...g,rules:archived}));
  assert.equal(chooseLegacyBossStyle(saved,'sustained'),null);
  assert.deepEqual(saved.rules.declaration.rows.map(r=>r.lethal),[true,false,false]);
  assert.ok(resolvePacket(saved.rules,saved.pieces,0,null,()=>0));
});
test('an independent fighter in the same Fight phase receives no Warboss effect',()=>{
  const g=fixture('sustained');
  g.rules=lockDeclaration(appendDeclaration(g.rules,g.pieces,rows),g.pieces,eligible(g));
  while(g.rules.declaration){
    const packet=attackPackets(g.rules,g.pieces)[0];
    g.rules=resolvePacket(g.rules,g.pieces,packet.index,null,()=>0).state;
  }
  const next=transitionFight(g,g.rules.fightSequence,{type:'finish'});
  assert.throws(()=>transitionFight(g,next,{type:'select',unit:'captain',bossStyle:'sustained'}));
  g.rules.fightSequence=transitionFight(g,next,{type:'select',unit:'captain'});
  assert.equal(g.rules.fightSequence.active.bossStyle,undefined);
  const attack={...row('captain-1',1,'boy-0',6),preferred:'boy-2',lethal:false,sustained:false};
  const independent=appendDeclaration(g.rules,g.pieces,[attack]).declaration.rows[0];
  assert.equal(independent.lethal,false);assert.equal(independent.sustained,false);
});
