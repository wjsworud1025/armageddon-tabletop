import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {newBattle,startBattle,advance} from '../rules/battle.mjs';
import {appendDeclaration,appendSightedDeclaration,lockDeclaration,lockSightedDeclaration,resolvePacket} from '../rules/declarations.mjs';
import {stepAttackRoll} from '../rules/attack-rolls.mjs';
import {beginOverwatch,declineOverwatch} from '../rules/overwatch.mjs';
import {captureSightBoard,setPatrolSight} from '../rules/patrol-sight.mjs';
import {rangedAttackHistory,playerTurnNumber} from '../rules/ranged-history.mjs';
import {getProfile,unitId} from '../rules/profiles.mjs';
import {snapshot,restore} from '../state.mjs';
import {layoutGeometry} from '../layouts.mjs';

const board={...createTable(),logs:[]},p=board.pieces;
const model=id=>p.find(m=>m.id===id);
const start=(first='marines')=>startBattle(newBattle(),first,5);
const roundTrip=s=>restore(board,JSON.parse(JSON.stringify(snapshot({...board,rules:s})))).rules;
const nextTurn=s=>advance({...s,step:5});
function declare(state,id,weapon,preferred){
  const actor=model(id),target=model(preferred),w=getProfile(actor).weapons[weapon];
  const row={actor:id,weapon,preferred,target:state.attachments[preferred]??unitId(target),distance:6,size:1,
    assigned:w.range?0:w.attacks,hit:0,wound:0,extra:0,cover:false,lethal:false,sustained:false,ignore:false,guard:false};
  return lockDeclaration(appendDeclaration(state,p,[row]),p);
}

test('first shot, including a miss by an attached leader, reveals the unit through the following player turn',()=>{
  const state={...start('orks'),step:2,attachments:{'warboss-1':'boy-0'}};
  const lock=declare(state,'warboss-1',0,'captain-1');
  assert.equal(rangedAttackHistory(lock,'boy-0'),'clear');
  const staged=stepAttackRoll(lock,p,0,{type:'begin'},()=>0).state;
  assert.equal(staged.declaration.attackRoll.records.at(-1).kind,'hit');
  assert.equal(rangedAttackHistory(roundTrip(staged),'boy-0'),'fired');
  assert.equal(rangedAttackHistory(staged,'warboss'),'clear');
  assert.equal(rangedAttackHistory(roundTrip(lock),'boy-0'),'clear');
  const done=stepAttackRoll(staged,p,0,{type:'keep'},()=>0);
  assert.equal(done.result.hits,0);
  let next=nextTurn(done.state);
  assert.equal(next.active,'marines');assert.equal(playerTurnNumber(next),2);
  assert.equal(rangedAttackHistory(roundTrip(next),'boy-0'),'fired');
  next=nextTurn(next);assert.equal(next.round,2);assert.equal(next.active,'orks');
  assert.equal(rangedAttackHistory(roundTrip(next),'boy-0'),'clear');
});

test('changing a random attack count is prior to the shot, while Torrent auto-hits immediately begin wounding',()=>{
  const lock=declare({...start(),step:2},'landSpeeder-1',2,'warboss-1');
  const count=stepAttackRoll(lock,p,0,{type:'begin'},()=>0);
  assert.equal(count.event.kind,'attacks');assert.equal(rangedAttackHistory(roundTrip(count.state),'landSpeeder'),'clear');
  const wound=stepAttackRoll(count.state,p,0,{type:'keep'},()=>0);
  assert.equal(wound.event.kind,'wound');assert.equal(rangedAttackHistory(roundTrip(wound.state),'landSpeeder'),'fired');
});

test('no surviving target and melee packets do not reveal a unit; Precision already fired before allocation',()=>{
  const base={...start(),step:2};
  const lock=declare(base,'intercessor-3',0,'warboss-1');
  const empty=resolvePacket({...lock,hp:{'warboss-1':0}},p,0);
  assert.equal(empty.result,null);assert.equal(rangedAttackHistory(empty.state,'intercessor'),'clear');
  const charge=declare({...base,step:4},'captain-1',1,'warboss-1');
  const melee=resolvePacket(charge,p,0,null,()=>0);
  assert.ok(melee.result.count);assert.equal(rangedAttackHistory(roundTrip(melee.state),'captain'),'clear');
  const psyker=declare({...start('orks'),step:2,attachments:{'captain-1':'intercessor'}},'weirdboy-1',0,'intercessor-3');
  const precision=resolvePacket(psyker,p,0,null,()=>.99);
  assert.ok(precision.precisionRoll);assert.equal(rangedAttackHistory(roundTrip(precision.state),'weirdboy'),'fired');
});

test('Overwatch records the opponent’s actual turn, including a miss; spending CP without shooting stays silent',()=>{
  const game=createTable(),pieces=game.pieces,shooter='intercessor-3',victim='warboss-1';
  for(const m of pieces){
    if(m.faction==='terrain')continue;
    m.removed=![shooter,victim].includes(m.id);m.x=m.id===shooter?-4:4;m.z=0;
  }
  const turn2=nextTurn(start()),offer=advance(advance(turn2),pieces),paid=beginOverwatch(offer,pieces,'intercessor');
  assert.equal(playerTurnNumber(paid),2);assert.equal(rangedAttackHistory(declineOverwatch(paid),'intercessor'),'clear');
  const oldOffer={...offer,first:'orks'},oldPaid=beginOverwatch(oldOffer,pieces,'intercessor');
  delete oldPaid.rangedHistory;
  assert.equal(playerTurnNumber(oldPaid),1);assert.equal(rangedAttackHistory(oldPaid,'intercessor'),'clear');
  assert.equal(rangedAttackHistory(declineOverwatch(oldPaid),'intercessor'),'unknown');
  const seen=setPatrolSight(paid,pieces,shooter,victim,'visible');
  const row={actor:shooter,weapon:0,preferred:victim,target:'warboss',distance:7,size:1,assigned:0,hit:0,
    wound:0,extra:0,cover:false,lethal:false,sustained:false,ignore:false,guard:false};
  const lock=lockDeclaration(appendDeclaration(seen,pieces,[row]),pieces);
  const done=resolvePacket(lock,pieces,0,null,()=>0);
  assert.equal(done.result.hits,0);assert.equal(done.state.rangedHistory.last.intercessor,2);
  const restored=restore(game,snapshot({...game,logs:[],rules:done.state})).rules;
  const turn3=nextTurn(advance(restored));assert.equal(turn3.round,2);
  assert.equal(rangedAttackHistory(turn3,'intercessor'),'fired');
  assert.equal(rangedAttackHistory(nextTurn(turn3),'intercessor'),'clear');
});

test('legacy saves distinguish missing history, confirmed fire, and fully observed quiet turns',()=>{
  const old={...start('orks'),active:'marines',round:2,step:3};
  delete old.rangedHistory;
  old.units.intercessor={hitTargets:['warboss']};
  old.units.vanguard={finishedAttack:2,attacks:{'vanguard-1':[{slot:'pistol',ranged:true}]}};
  const r=roundTrip(old),turn=playerTurnNumber(r);
  assert.deepEqual(r.rangedHistory,{since:turn+1,last:{intercessor:turn}});
  assert.equal(rangedAttackHistory(r,'intercessor'),'fired');
  assert.equal(rangedAttackHistory(r,'vanguard'),'unknown');
  const following=nextTurn(r);
  assert.equal(rangedAttackHistory(roundTrip(following),'vanguard'),'unknown');
  assert.equal(rangedAttackHistory(roundTrip(nextTurn(following)),'vanguard'),'clear');
  const opening={...start('orks')};delete opening.rangedHistory;
  assert.equal(rangedAttackHistory(roundTrip(opening),'gretchin'),'clear');
});

test('invalid unit IDs, future player turns and contradictory mid-roll ledgers fail import',()=>{
  const lock=declare({...start(),step:2},'intercessor-3',0,'warboss-1');
  const shot=stepAttackRoll(lock,p,0,{type:'begin'},()=>0).state;
  for(const ledger of [{since:1,last:{}},{since:1,last:{intercessor:2}},{since:1,last:{invented:1}},
    {since:3,last:{intercessor:1}},{since:1,last:{intercessor:1,warboss:1}}]){
    assert.throws(()=>roundTrip({...shot,rangedHistory:ledger}),/규칙/);
  }
});

test('only a locked ranged declaration can bind a detection map, and restoring requires the same map',()=>{
  const lock=declare({...start(),step:2},'intercessor-3',0,'warboss-1');
  const save=snapshot({...board,rules:lock,layout:{map:'A',blue:'marines'}});
  save.rules.declaration.detectionMap='A';
  assert.equal(restore(board,save).rules.declaration.detectionMap,'A');
  for(const code of ['B','D']){
    const bad=structuredClone(save);bad.rules.declaration.detectionMap=code;
    assert.throws(()=>restore(board,bad),/규칙/);
  }
  const draft=structuredClone(save);draft.rules.declaration.locked=false;
  assert.throws(()=>restore(board,draft),/규칙/);
  delete save.rules.declaration.detectionMap;
  assert.equal(restore(board,save).rules.declaration.locked,true);
});

test('an initial mapped lock cannot import an edited board with only an undetectable sight target',()=>{
  const g={...createTable(),logs:[],layout:{map:'A',blue:'orks'}};
  const poses=new Map(layoutGeometry('A').terrain.map(m=>[m.id,m]));
  const shooter='intercessor-3',victim='boy-2';
  for(const m of g.pieces){
    if(poses.has(m.id))Object.assign(m,poses.get(m.id));
    else if(m.id===shooter||m.id===victim)Object.assign(m,{x:m.id===shooter?-4.5:-15.46,z:-6.18,yaw:0});
    else m.removed=true;
  }
  const seen=setPatrolSight({...start(),step:2},g.pieces,shooter,victim,'visible');
  const row={actor:shooter,weapon:0,preferred:victim,target:'boy-0',size:1,assigned:0,hit:0,
    wound:0,extra:0,cover:false,lethal:false,sustained:false,ignore:false,guard:false};
  const draft=appendSightedDeclaration(seen,g.pieces,[row],undefined,g.layout);
  const lock=lockSightedDeclaration(draft,g.pieces,[],undefined,g.layout);
  const save=snapshot({...g,rules:lock});assert.equal(save.rules.declaration.detectionMap,'A');
  assert.ok(restore(board,save).rules.declaration.locked);
  save.pieces.find(m=>m.id===shooter).x=3;
  save.rules.shootingSight.board=captureSightBoard(lock,save.pieces);
  assert.throws(()=>restore(board,save),/규칙/);
  delete save.rules.declaration.detectionMap;
  assert.ok(restore(board,save).rules.declaration.locked);
});
