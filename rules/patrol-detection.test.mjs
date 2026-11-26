import assert from 'node:assert/strict';
import test from 'node:test';
import {createTable} from '../data/catalog.mjs';
import {layoutGeometry,layoutScenery} from '../layouts.mjs';
import {groupId,newBattle,startBattle} from './battle.mjs';
import {patrolDetection} from './patrol-detection.mjs';
import {patrolSightStatus,patrolSightTarget,setPatrolSight} from './patrol-sight.mjs';
import {appendDeclaration,appendSightedDeclaration,lockSightedDeclaration,attackPackets,precisionCandidates,resolvePacket,plungingSightCandidates,confirmPlungingSight} from './declarations.mjs';
import {stepAttackRoll} from './attack-rolls.mjs';
import {beginOverwatch,openOverwatch} from './overwatch.mjs';
import {recordRangedAttack} from './ranged-history.mjs';

const table=createTable(),layout={map:'A',blue:'orks'};
const terrain=layoutScenery(table,layoutGeometry('A')).map(([p,pose])=>({...p,...pose}));
const at=(id,x,z)=>({...table.pieces.find(p=>p.id===id),x,z,yaw:0,removed:false});
const target=at('boy-2',-15.46,-6.18);
function away(id,model,gap) {
  const p=at(id,model.x,model.z);
  p.x+=gap+(p.baseWidth+model.baseWidth)/2;
  return p;
}
const battle=team=>({...startBattle(newBattle(),team,5),step:2});
const observe=(s,pieces,actor,p)=>setPatrolSight(s,pieces,actor.id,p.id,'visible');
const check=(s,pieces,actor,p)=>patrolDetection(s,pieces,actor.id,p.id,layout);
const row=(s,p,target)=>({actor:p.id,weapon:0,target:groupId(s,target),preferred:target.id,distance:0,size:1,
  assigned:0,hit:0,wound:0,extra:0,cover:false,lethal:false,sustained:false,ignore:false,guard:false});
const six=()=>.99;

for(const snap of [false,true]){
  test('13.09 '+(snap?'Overwatch':'normal shooting')+' measures each hidden model at 15 inches and still needs actual sight',()=>{
    for(const [gap,allowed] of [[11.99,true],[12,true],[14.99,true],[15,true],[15.01,false],[17.20,false]]){
      const shooter=away('intercessor-3',target,gap),pieces=[shooter,target,...terrain];
      let s=battle(snap?'orks':'marines');
      if(snap)s=beginOverwatch(openOverwatch({...s,step:1},pieces),pieces,'intercessor');
      const result=check(s,pieces,shooter,target);
      assert.deepEqual(result.areas.map(a=>a.id),['blue-home']);
      assert.equal(result.history,'clear');
      assert.ok(Math.abs(result.distance-gap)<1e-7);
      assert.equal(result.status,gap<=12?'detected':allowed?'manual':'hidden');
      assert.equal(result.reason,gap>12&&allowed?'gone-to-ground':null);
      assert.equal(appendSightedDeclaration(s,pieces,[row(s,shooter,target)],undefined,layout),null);
      const seen=observe(s,pieces,shooter,target);
      assert.equal(patrolSightStatus(seen,pieces,shooter.id,target.id),'visible');
      const draft=appendSightedDeclaration(seen,pieces,[row(s,shooter,target)],undefined,layout);
      assert.equal(!!draft,allowed);
      assert.equal(!!appendDeclaration({...seen,officialSetup:{layoutDie:1,version:5}},pieces,[row(s,shooter,target)]),allowed);
      if(draft){
        const locked=lockSightedDeclaration(draft,pieces,[],undefined,layout);
        assert.equal(locked.declaration.detectionMap,'A');
        assert.equal(locked.declaration.rows[0].areaCover,true);
      }
    }
  });
}

test('range belongs to the unit, while detection belongs to a particular shooter and particular target model',()=>{
  const far=away('intercessor-3',target,16),near=away('intercessor-2',target,14);
  const body=at('boy-3',-4,target.z),pieces=[far,near,target,body,...terrain];
  const s=battle('marines'),ids=[target.id,body.id];
  let seen=observe(observe(s,pieces,far,target),pieces,near,target);
  const visible=(shooter,range)=>patrolSightTarget(seen,pieces,shooter.id,ids,range,undefined,layout);
  assert.deepEqual(visible(far,8).visible,[]);
  assert.deepEqual(visible(near,8).visible,[target.id],'nearer unseen body supplies weapon range only');
  seen=observe(seen,pieces,far,body);
  assert.deepEqual(visible(far,8).visible,[body.id]);
  assert.ok(appendSightedDeclaration(seen,pieces,[row(s,far,target),row(s,near,target)],undefined,layout));
  const directlyAbove={...near,x:target.x,elevation:15.1};
  assert.equal(check(s,[directlyAbove,target,...terrain],directlyAbove,target).status,'hidden','vertical distance counts');
});

test('light terrain, changed mats, profile keywords, and incomplete shooting history',()=>{
  const rightTerrain=terrain.find(p=>p.id==='barricade-1'),yellow=at(target.id,rightTerrain.x,rightTerrain.z);
  const shooter=away('intercessor-3',yellow,16);
  const s=battle('marines'),ps=[shooter,yellow,...terrain];
  assert.equal(check(s,ps,shooter,yellow).status,'hidden','a registered light feature is sufficient');
  assert.equal(check(s,ps.map(p=>p===rightTerrain?{...p,removed:true}:p),shooter,yellow).status,'none','empty mat');
  assert.equal(check(s,ps.map(p=>p===rightTerrain?{...p,x:p.x+.1}:p),shooter,yellow).reason,'terrain','custom cast position');
  assert.equal(check(recordRangedAttack(s,'boy-0'),ps,shooter,yellow).status,'none','an actual attack reveals its whole unit');
  const legacy={...s,round:3};delete legacy.rangedHistory;
  assert.equal(check(legacy,ps,shooter,yellow).reason,'history');
  const mounted=at('wartrakk-1',yellow.x,yellow.z);
  assert.equal(check(s,[shooter,mounted,...terrain],shooter,mounted).status,'none');
  const vehicle=at('landSpeeder-1',yellow.x,yellow.z),boy=away('boy-2',vehicle,18);
  assert.equal(check(s,[vehicle,boy,...terrain],boy,vehicle).status,'none');
  assert.equal(patrolDetection(s,ps,shooter.id,yellow.id,null).status,'none','no drawn area on a free table');
  for(const [code,die] of [['A',1],['B',4],['C',6]]){
    const geo=layoutGeometry(code),scenery=layoutScenery(table,geo).map(([p,pose])=>({...p,...pose}));
    const ruin=scenery.find(p=>p.id==='largeRuin-1'),member=at(target.id,ruin.x,ruin.z),attacker=away(shooter.id,member,16);
    assert.equal(patrolDetection({...s,officialSetup:{layoutDie:die,version:5}},[attacker,member,...scenery],attacker.id,member.id).status,'hidden');
  }
});

test('22.05 replacement visibility after a casualty must satisfy detection for the surviving model',()=>{
  const ruin=at('largeRuin-1',4,-6),attacker={...at('intercessor-3',3.1,-6.55),elevation:3.37};
  const witness=at('boy-3',0,-6),pieces=[attacker,target,witness,...terrain.map(p=>p.id===ruin.id?ruin:p)];
  const s=battle('marines'),seen=observe(s,pieces,attacker,witness);
  const draft=appendSightedDeclaration(seen,pieces,[row(s,attacker,witness)],undefined,layout);
  const locked=lockSightedDeclaration(draft,pieces,[],undefined,layout);
  assert.equal(locked.declaration.rows[0].plunging,true);
  const dead={...locked,hp:{[witness.id]:0}};
  assert.equal(check(dead,pieces,attacker,target).status,'hidden');
  assert.deepEqual(plungingSightCandidates(dead,pieces,0),[]);
  assert.equal(confirmPlungingSight(dead,pieces,0,target.id),null);
  const revealed=recordRangedAttack(dead,'boy-0');
  assert.ok(confirmPlungingSight(revealed,pieces,0,target.id));
});

test('24.28 a visible bodyguard opens the unit but cannot reveal its hidden attached character to a precision packet',()=>{
  const captain=at('captain-1',target.x,target.z),body=at('intercessor-3',-4,target.z);
  const psyker=away('weirdboy-1',captain,16),pieces=[psyker,body,captain,...terrain];
  const state={...battle('orks'),attachments:{[captain.id]:'intercessor'}};
  function declare(s){
    const draft=appendSightedDeclaration(observe(s,pieces,psyker,body),pieces,[row(s,psyker,body)],undefined,layout);
    return lockSightedDeclaration(draft,pieces,[],undefined,layout);
  }
  const locked=declare(state),packet=attackPackets(locked,pieces)[0];
  assert.deepEqual(precisionCandidates(locked,pieces,packet),[]);
  const immediate=resolvePacket(locked,pieces,0,null,six);
  assert.equal(immediate.finished,true);
  assert.equal(immediate.precisionRoll,undefined);
  const staged=(s,action)=>stepAttackRoll(s,pieces,0,action,six);
  const hits=staged(locked,{type:'begin'}),wounds=staged(hits.state,{type:'keep'});
  assert.equal(staged(wounds.state,{type:'keep'}).event.kind,'save');
  const revealed=declare(recordRangedAttack(state,'intercessor'));
  assert.deepEqual(precisionCandidates(revealed,pieces,attackPackets(revealed,pieces)[0]).map(p=>p.id),[captain.id]);
  assert.ok(resolvePacket(revealed,pieces,0,null,six).precisionRoll);
  const blocked=declare(setPatrolSight(recordRangedAttack(state,'intercessor'),pieces,psyker.id,captain.id,'blocked'));
  assert.deepEqual(precisionCandidates(blocked,pieces,attackPackets(blocked,pieces)[0]),[]);
  const rHits=staged(revealed,{type:'begin'}),rWounds=staged(rHits.state,{type:'keep'});
  assert.deepEqual(staged(rWounds.state,{type:'keep'}).event.choices,[null,captain.id]);
  const archived={...locked,declaration:{...locked.declaration}};delete archived.declaration.detectionMap;
  assert.ok(resolvePacket(archived,pieces,0,null,six).precisionRoll,'old mid-attack choices replay unchanged');
});
