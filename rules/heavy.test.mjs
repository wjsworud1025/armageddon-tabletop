import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {restore,snapshot} from '../state.mjs';
import {beginMove,proposeMove,finishMove,rewindMove} from '../move-session.mjs';
import {advance,newBattle,startBattle} from './battle.mjs';
import {appendSightedDeclaration,lockSightedDeclaration,attackPackets,resolvePacket} from './declarations.mjs';
import {stepAttackRoll} from './attack-rolls.mjs';
import {getProfile} from './profiles.mjs';
import {beginOverwatch,declineOverwatch} from './overwatch.mjs';
import {setPatrolSight} from './patrol-sight.mjs';
import {heavyStatus} from './heavy.mjs';
import {beginReinforcement,finishReinforcement} from './reinforcement-session.mjs';

const by=(g,id)=>g.pieces.find(p=>p.id===id);
const two=()=>.2;
function table(active='marines'){
  const g={...createTable(),logs:[],rules:startBattle(newBattle(),active,5)};
  for(const p of g.pieces){
    p.removed=!['intercessor','gretchin'].includes(p.kind);
    if(!p.removed){
      p.x=p.kind==='intercessor'?-6:3+2*Math.floor(p.variant/5);
      p.z=2*(p.variant%5-2);p.yaw=0;
    }
  }
  g.rules=advance(g.rules,g.pieces);
  return g;
}
function commit(g,result){
  g.rules=result.rules;
  for(const [id,pose] of Object.entries(result.poses??{}))Object.assign(by(g,id),pose);
}
function shooting(g){
  g.rules=advance(g.rules,g.pieces);
  if(g.rules.overwatch)g.rules=advance(declineOverwatch(g.rules),g.pieces);
  assert.equal(g.rules.step,2);
}
function lockRifle(g,hit=0,ignore=false){
  const actor='intercessor-1',preferred='gretchin-1';
  g.rules=setPatrolSight(g.rules,g.pieces,actor,preferred,'visible');
  const row={actor,preferred,weapon:0,target:'gretchin',assigned:0,distance:0,size:10,
    hit,wound:0,extra:0,cover:false,lethal:false,sustained:false,ignore,guard:false};
  g.rules=appendSightedDeclaration(g.rules,g.pieces,[row]);
  g.rules=lockSightedDeclaration(g.rules,g.pieces,[]);
  return attackPackets(g.rules,g.pieces)[0];
}
const checkpoint=g=>restore(createTable(),JSON.parse(JSON.stringify(snapshot(g))));
const status=g=>{
  const p=by(g,'intercessor-1');
  return heavyStatus(g.rules,g.pieces,p,getProfile(p).weapons[0]);
};

test('a stationary or skipped unit hits on an unmodified 2 with its bolt rifles in both attack procedures',()=>{
  for(const remain of [false,true]){
    const g=table();
    if(remain)commit(g,beginMove(g,'intercessor-1','remain'));
    shooting(g);
    assert.deepEqual(status(g),{status:'active',reason:'eligible'});
    const packet=lockRifle(g);
    assert.equal(packet.hitMod,1);
    assert.equal(g.rules.declaration.rows[0].hit,0);
    assert.equal(packet.skill,3,'Heavy modifies the die, not the characteristic');
    const fast=resolvePacket(g.rules,g.pieces,0,null,two);
    assert.deepEqual(fast.result.hitDice,[2,2]);
    assert.deepEqual(Object.keys(fast.removed),['gretchin-1','gretchin-2']);
    const first=stepAttackRoll(g.rules,g.pieces,0,{type:'begin'},two);
    assert.equal(first.event.kind,'hit');g.rules=first.state;
    const loaded=checkpoint(g);
    let result=stepAttackRoll(loaded.rules,loaded.pieces,0,{type:'keep'},two);
    assert.equal(result.event.kind,'wound');assert.deepEqual(result.event.raw,[2,2]);
    while(result.event){
      const action=result.event.sizes?{type:'keep'}:{type:'select',choice:result.event.choices[0]};
      result=stepAttackRoll(result.state,loaded.pieces,0,action,two);
    }
    assert.deepEqual(result.removed,fast.removed);
  }
});

test('the distance limit measures each model’s travelled path, including its attached leader, across saves',()=>{
  for(const length of [3,3.02]){
    let g=table(),p=by(g,'librarian-1');
    Object.assign(p,{removed:false,x:-6,z:-6,yaw:0});
    g.rules.attachments={'librarian-1':'intercessor'};
    commit(g,beginMove(g,p,'normal'));
    const route={[p.id]:[{x:p.x-length/2},{x:p.x}]};
    commit(g,proposeMove(g,p,route));
    g=checkpoint(g);commit(g,finishMove(g));g=checkpoint(g);
    assert.ok(Math.abs(g.rules.units.intercessor.heavyTravel[p.id]-length)<1e-7);
    shooting(g);
    assert.equal(status(g).status,length===3?'active':'inactive');
    assert.equal(lockRifle(g).heavy,length===3);
  }
  const g=table();
  commit(g,beginMove(g,'intercessor-1','advance',{advanceRoll:3}));
  commit(g,proposeMove(g,'intercessor-1',{'intercessor-1':[{x:-8},{x:-6}]}));
  commit(g,rewindMove(g));
  commit(g,finishMove(g));shooting(g);
  assert.equal(status(g).status,'active','a discarded path and Advance roll do not count as distance moved');
});

test('engagement, recent setup, other weapons and Snap Shooting do not gain the Heavy bonus',()=>{
  const g=table();shooting(g);
  const member=by(g,'intercessor-5'),enemy=by(g,'gretchin-1');
  Object.assign(enemy,{x:member.x+3,z:member.z});
  assert.equal(status(g).reason,'engaged','a different squad member is within 2 inches');
  enemy.x=6;
  g.rules.units.intercessor.reinforcing=true;
  assert.equal(status(g).reason,'setup');
  assert.equal(lockRifle(g).heavy,false);
  const rifleman=by(g,'intercessor-1');
  assert.equal(heavyStatus(g.rules,g.pieces,rifleman,getProfile(rifleman).weapons[1]).status,'none');

  const ow=table('orks');
  ow.rules=advance(ow.rules,ow.pieces);
  ow.rules=beginOverwatch(ow.rules,ow.pieces,'intercessor');
  const packet=lockRifle(ow);
  assert.equal(packet.heavy,false);
  assert.equal(ow.rules.declaration.rows[0].heavy,undefined);
  const result=resolvePacket(ow.rules,ow.pieces,0,null,()=>.8);
  assert.deepEqual(result.result.hitDice,[5,5]);assert.equal(result.result.hits,0);
});

test('unknown movement and previously locked manual bonuses survive import without inventing another +1',()=>{
  const g=table();shooting(g);
  g.rules.units.intercessor={movement:'normal',movementTracked:true};
  assert.equal(status(checkpoint(g)).status,'unknown');
  assert.equal(lockRifle(g,1).hitMod,1);
  assert.equal(g.rules.declaration.rows[0].heavy,undefined);
  const old=snapshot(g);
  old.rules.units.intercessor.movement='remain';
  const loaded=restore(createTable(),old);
  assert.equal(status(loaded).status,'active','the old explicit Remain order is known');
  assert.equal(attackPackets(loaded.rules,loaded.pieces)[0].hitMod,1,'the old locked manual modifier is preserved');
  const bad=structuredClone(old);
  bad.rules.declaration.rows[0].weapon=1;bad.rules.declaration.rows[0].heavy=true;
  assert.throws(()=>restore(createTable(),bad));
});

test('Heavy offsets suppression, survives ignoring negative modifiers and shares the hit modifier cap',()=>{
  for(const [manual,ignore,expected] of [[-1,false,0],[-1,true,1],[1,false,1]]){
    const g=table();shooting(g);
    const packet=lockRifle(g,manual,ignore);
    assert.equal(packet.effectiveHitMod,expected);
    assert.equal(resolvePacket(g.rules,g.pieces,0,null,two).result.hits,expected?2:0);
  }
});

test('a Command Re-roll uses Heavy on the replacement die without modifying the raw result',()=>{
  const g=table();shooting(g);lockRifle(g);
  const faces=[0,.2];
  const before=stepAttackRoll(g.rules,g.pieces,0,{type:'begin'},()=>faces.shift());
  assert.deepEqual(before.event.raw,[1,2]);g.rules=before.state;
  const loaded=checkpoint(g);
  const after=stepAttackRoll(loaded.rules,loaded.pieces,0,{type:'reroll',index:0},two);
  assert.equal(after.state.cp.marines,0);
  const rolls=after.state.declaration.attackRoll.records;
  assert.deepEqual(rolls.find(r=>r.kind==='hit').raw,[1,2]);
  assert.deepEqual(rolls.find(r=>r.kind==='hit').change,{index:0,value:2});
  assert.deepEqual(rolls.find(r=>r.kind==='wound').raw,[2,2]);
});

test('arriving from reserves forfeits Heavy until a fresh turn and a forged qualifying row is rejected',()=>{
  let g=table();g.rules.round=2;
  const members=g.pieces.filter(p=>p.kind==='intercessor');
  g.rules.reserves.intercessor=members.map(p=>p.id);
  for(const p of members){p.removed=true;p.x=-19;}
  commit(g,beginReinforcement(g,'intercessor'));
  commit(g,finishReinforcement(g));
  g=checkpoint(g);shooting(g);
  assert.equal(status(g).reason,'setup');
  assert.equal(lockRifle(g).heavy,false);
  const saved=snapshot(g);
  saved.rules.declaration.rows[0].heavy=true;
  assert.throws(()=>restore(createTable(),saved));
  g.rules=resolvePacket(g.rules,g.pieces,0,null,()=>0).state;
  for(let i=0;i<12&&(g.rules.round===2||g.rules.step===0);i++){
    const next=advance(g.rules);
    assert.notEqual(next,g.rules,'phase advancement blocked at '+g.rules.active+'/'+g.rules.step);
    g.rules=next;
  }
  assert.equal(g.rules.active,'marines');assert.equal(g.rules.step,1);
  shooting(g);
  assert.equal(status(g).status,'active');
});

test('old movement with no measured path, missing entries and corrupt distances cannot grant an automatic bonus',()=>{
  const g=table();shooting(g);
  delete g.rules.units.intercessor.heavyTravel;
  assert.equal(status(checkpoint(g)).status,'unknown');
  g.rules.units.intercessor={movement:'normal',movementTracked:true,heavyTravel:{'intercessor-1':.5}};
  assert.equal(status(checkpoint(g)).status,'unknown');
  const saved=snapshot(g);
  for(const change of [v=>v['gretchin-1']=1,v=>v['intercessor-1']=-10,v=>v['intercessor-1']='0']){
    const bad=structuredClone(saved);change(bad.rules.units.intercessor.heavyTravel);
    assert.throws(()=>restore(createTable(),bad));
  }
});
