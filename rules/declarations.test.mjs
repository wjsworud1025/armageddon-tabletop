import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {newBattle,startBattle,advance} from './battle.mjs';
import {appendDeclaration,lockDeclaration,attackPackets,resolvePacket,chooseSuppression} from './declarations.mjs';
import {validateRulesState} from './validate.mjs';

const pieces=createTable().pieces.filter(p=>p.faction!=='terrain');
const by=id=>pieces.find(p=>p.id===id);
const battle=(step=2,team='marines')=>({...startBattle(newBattle(),team,5),step});
const row=(actor,weapon,target,preferred,changes={})=>({actor,weapon,target,preferred,distance:9,size:5,assigned:0,
  hit:0,wound:0,extra:0,cover:false,lethal:false,sustained:false,ignore:false,guard:false,...changes});
const rifle=id=>row(id,0,'gretchin','gretchin-1');
const miss=()=>0;

test('draft, locked targets and current resolving target persist without rolling or changing HP',()=>{
  const initial=battle();
  const draft=appendDeclaration(initial,pieces,[rifle('intercessor-1'),rifle('intercessor-2'),
    row('intercessor-2',3,'boy-0','boy-1'),{...rifle('intercessor-3'),cover:true}]);
  assert.deepEqual(draft.hp,{});
  assert.equal(advance(draft),draft);
  assert.equal(validateRulesState(JSON.parse(JSON.stringify(draft))),true);
  const locked=lockDeclaration(draft,pieces);
  assert.equal(validateRulesState(locked),true);
  assert.equal(appendDeclaration(locked,pieces,[rifle('intercessor-4')]),null);
  assert.deepEqual(attackPackets(locked,pieces).map(p=>p.indices),[[0,1],[2],[3]]);
  const first=resolvePacket(locked,pieces,0,null,miss);
  assert.equal(first.shootingEvent,null);
  assert.equal(first.state.declaration.didShoot,true);
  assert.equal(first.result.count,4);
  assert.equal(first.state.declaration.focus,'gretchin');
  assert.equal(resolvePacket(first.state,pieces,2,null,miss),null);
  assert.equal(validateRulesState(first.state),true);
  const second=resolvePacket(first.state,pieces,3,null,miss);
  assert.equal(second.state.declaration.focus,null);
  const last=resolvePacket(second.state,pieces,2,null,miss);
  assert.deepEqual(last.shootingEvent,{shooter:'intercessor',targets:['gretchin','boy-0'],didShoot:true});
  assert.equal(last.finished,true);
  assert.equal(last.state.units.intercessor.finishedAttack,2);
  assert.equal(last.state.units.gretchin.shotAt,true);
  assert.equal(last.state.units['boy-0'].shotAt,true);
  assert.equal(last.state.declaration,null);
  assert.equal(appendDeclaration(last.state,pieces,[rifle('intercessor-4')]),null);
});
test('a volley with no surviving shooters does not offer the declared targets a reaction',()=>{
  const plan=lockDeclaration(appendDeclaration(battle(),pieces,[rifle('intercessor-1')]),pieces);
  const result=resolvePacket({...plan,hp:{'intercessor-1':0}},pieces,0,null,miss);
  assert.equal(result.finished,true);
  assert.equal(result.shootingEvent,null);
});
test('Wartrakk suppression applies to its sole hit target or prompts for a single surviving hit unit',()=>{
  const unit='wartrakk-1',hit=()=>.99;
  const rocket=row(unit,0,'intercessor','intercessor-1'),shoota=row(unit,1,'vanguard','vanguard-1');
  const start=rows=>lockDeclaration(appendDeclaration(battle(2,'orks'),pieces,rows),pieces);
  const one=resolvePacket(start([shoota]),pieces,0,null,hit);
  assert.equal(one.state.patrol.suppressed,'vanguard');
  const first=resolvePacket(start([rocket,shoota]),pieces,0,null,hit);
  assert.equal(first.state.patrol.suppressed,null);
  const last=resolvePacket(first.state,pieces,1,null,hit).state;
  assert.deepEqual(last.units.wartrakk.suppressionTargets,['intercessor','vanguard']);
  assert.ok(validateRulesState(last));
  assert.equal(advance(last),last);
  assert.equal(chooseSuppression(last,'captain'),null);
  const selected=chooseSuppression(last,'intercessor');
  assert.equal(selected.patrol.suppressed,'intercessor');
  assert.deepEqual(selected.units.wartrakk.suppressionTargets,[]);
  assert.equal(chooseSuppression(selected,'vanguard'),null);
});
test('an individual cannot double declare, combine sidearm with rifle, or mix grenade profiles',()=>{
  const draft=appendDeclaration(battle(),pieces,[rifle('intercessor-2')]);
  assert.equal(appendDeclaration(draft,pieces,[rifle('intercessor-2')]),null);
  assert.equal(appendDeclaration(draft,pieces,[{...rifle('intercessor-2'),weapon:1}]),null);
  assert.equal(appendDeclaration(draft,pieces,[row('captain-1',0,'gretchin','gretchin-1')]),null);
  const frag=appendDeclaration(draft,pieces,[{...rifle('intercessor-2'),weapon:3}]);
  assert.equal(appendDeclaration(frag,pieces,[{...rifle('intercessor-2'),weapon:4}]),null);
});
test('blast and half-range effects use declaration-time target size and range after casualties',()=>{
  const shot=row('intercessor-2',3,'gretchin','gretchin-1',{size:10,distance:6});
  const locked=lockDeclaration(appendDeclaration(battle(),pieces,[shot]),pieces);
  const fewer=pieces.map(p=>({...p,removed:p.kind==='gretchin'&&p.variant!==9,x:p.x+30}));
  assert.equal(resolvePacket(locked,fewer,0,null,miss).result.count,4);
});
test('melee can split base attacks, must allocate all attacks and only unsplit weapons get Cleave',()=>{
  const one=row('warboss-1',1,'intercessor','intercessor-1',{size:10,assigned:2,distance:1});
  const two=row('warboss-1',1,'vanguard','vanguard-1',{assigned:4,distance:1});
  const draft=appendDeclaration(battle(4,'orks'),pieces,[one]);
  assert.equal(lockDeclaration(draft,pieces,[by('warboss-1')]),null);
  assert.equal(appendDeclaration(draft,pieces,[{...two,assigned:5}]),null);
  const split=lockDeclaration(appendDeclaration(draft,pieces,[two]),pieces,[by('warboss-1')]);
  assert.equal(validateRulesState(split),true);
  assert.equal(resolvePacket(split,pieces,0,null,miss).result.count,2);
  const full=lockDeclaration(appendDeclaration(battle(4,'orks'),pieces,[{...one,assigned:6}]),pieces,[by('warboss-1')]);
  assert.equal(resolvePacket(full,pieces,0,null,miss).result.count,8);
});
test('a destroyed target cannot redirect attacks or cancel the hazard on a selected weapon',()=>{
  const bomb=row('gretchin-1',1,'captain','captain-1',{size:1,distance:5});
  const draft=appendDeclaration(battle(2,'orks'),pieces,[bomb,{...bomb,actor:'gretchin-2'}]);
  const locked=lockDeclaration(draft,pieces);
  const dead=pieces.map(p=>p.id==='captain-1'?{...p,removed:true}:p);
  const complete=resolvePacket(locked,dead,0,null,()=>{throw Error('Dead target should not roll');});
  assert.equal(complete.result,null);assert.equal(complete.state.declaration,null);
  assert.deepEqual(complete.state.hazard,{unit:'gretchin',count:2});
  assert.equal(validateRulesState(complete.state),true);
});
test('rejects corrupt saved declarations and a phase change while rolls remain',()=>{
  const locked=lockDeclaration(appendDeclaration(battle(),pieces,[rifle('intercessor-2')]),pieces);
  for(const changes of [{actor:'unknown'},{target:'warboss'},{distance:'12'},{weapon:8},{actor:'gretchin-1'}]){
    const damaged=structuredClone(locked);Object.assign(damaged.declaration.rows[0],changes);
    assert.equal(validateRulesState(damaged),false);
  }
  assert.equal(validateRulesState({...locked,step:5}),false);
  assert.equal(advance(locked),locked);
});
