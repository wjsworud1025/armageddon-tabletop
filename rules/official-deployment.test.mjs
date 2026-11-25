import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {layoutGeometry,objectiveAreas,objectiveFootprints,validDeployment} from '../layouts.mjs';
import {restore,snapshot} from '../state.mjs';
import {groupId,newBattle} from './battle.mjs';
import {advanceOfficialSetup,officialPreparing,patrolPlacementError,remainingPatrolUnits,visiblePatrolPiece} from './official-deployment.mjs';
import {newPatrolSetup,patrolSetupView} from './patrol-setup.mjs';

const fresh=()=>({...createTable(),logs:[],layout:null,surface:'front',rules:{...newBattle(),officialSetup:newPatrolSetup()}});
const stage=game=>patrolSetupView(game.rules.officialSetup).stage;
const checkpoint=game=>restore(createTable(),JSON.parse(JSON.stringify(snapshot(game))));
const piece=(g,id)=>g.pieces.find(p=>p.id===id);
function step(game,act,args={},dice=[]){
  const throws=[...dice],before=snapshot(game);
  const next=advanceOfficialSetup(game,{act,...args},()=>{
    assert.ok(throws.length,'unexpected D6 for '+act);
    return throws.shift();
  });
  assert.deepEqual(snapshot(game),before,'action mutated previous table');
  assert.deepEqual(throws,[],'unused D6 for '+act);
  return next;
}

// Cache costly automatic layouts. Transitions and reloads operate on detached tables.
const deployments=new Map();
function reveal(map){
  if(deployments.has(map))return structuredClone(deployments.get(map));
  let game=step(fresh(),'official-roll-layout',{},[{A:2,B:4,C:6}[map]]);
  assert.equal(stage(game),'role-roll');
  assert.equal(game.layout,null);
  game=checkpoint(step(game,'official-roll-role',{},[5,5]));
  assert.equal(stage(game),'role-roll');
  assert.throws(()=>step(game,'official-defend'));
  game=step(game,'official-roll-role',{},[6,2]);
  game=step(game,map==='B'?'official-attack':'official-defend');
  const defender=map==='B'?'orks':'marines';
  assert.deepEqual(game.layout,{map,blue:defender});
  game=step(game,'form-attach',{team:'marines',leader:'librarian-1',unit:'intercessor'});
  game=step(game,'form-reserve',{team:'marines',unit:'intercessor'});
  game=step(game,'form-enhance',{team:'marines',enhancement:'veterans'});
  game=checkpoint(step(game,'form-lock',{team:'marines'}));
  assert.deepEqual(game.rules.attachments,{});
  assert.equal(game.pieces.filter(p=>p.removed).length,0);
  game=step(game,'form-open',{team:'orks'});
  game=step(game,'form-enhance',{team:'orks',enhancement:'armour'});
  game=checkpoint(step(game,'form-lock',{team:'orks'}));
  assert.equal(stage(game),'deployment');
  assert.equal(game.rules.deployment.next,defender);
  assert.equal(game.rules.reserves.intercessor.length,6);
  assert.ok(game.rules.reserves.intercessor.every(id=>piece(game,id).removed));
  assert.deepEqual(game.pieces.filter(p=>visiblePatrolPiece(game.rules,p)).map(p=>p.faction),Array(15).fill('terrain'));
  deployments.set(map,game);
  return structuredClone(game);
}

for(const map of ['A','B','C']){
  test(map+' completes deployment, independent tied first-turn roll, and a five-round game start across reloads',()=>{
    let game=reveal(map);
    const remaining={marines:['captain','vanguard','landSpeeder'],orks:['warboss','weirdboy','boy-0','boy-1','gretchin','wartrakk']};
    const defender=game.rules.deployment.defender,opposite=side=>side==='marines'?'orks':'marines';
    let side=defender;
    assert.throws(()=>step(game,'official-select',{unit:remaining[opposite(side)][0]}));
    assert.throws(()=>step(game,'official-select',{unit:'intercessor'}));
    assert.throws(()=>step(game,'official-roll-first'));
    while(remaining.marines.length||remaining.orks.length){
      assert.equal(game.rules.deployment.next,side);
      const key=remaining[side].shift();
      game=checkpoint(step(game,'official-select',{unit:key}));
      assert.equal(patrolPlacementError(game),'');
      const shown=game.pieces.filter(p=>p.faction!=='terrain'&&visiblePatrolPiece(game.rules,p));
      assert.ok(shown.every(p=>!p.removed&&(groupId(game.rules,p)===key||game.rules.deployment.placed.includes(groupId(game.rules,p)))));
      assert.ok(shown.some(p=>groupId(game.rules,p)===key));
      game=checkpoint(step(game,'official-place'));
      assert.equal(game.rules.deployment.placed.at(-1),key);
      if(remaining[opposite(side)].length)side=opposite(side);
    }
    assert.deepEqual(remainingPatrolUnits(game),[]);
    assert.equal(stage(game),'first-roll');
    assert.throws(()=>step(game,'official-start'));
    game=checkpoint(step(game,'official-roll-first',{},[2,2]));
    assert.equal(stage(game),'first-roll');
    game=checkpoint(step(game,'official-roll-first',{},[1,4]));
    assert.equal(stage(game),'ready');
    game=checkpoint(step(game,'official-start'));
    assert.equal(officialPreparing(game.rules),false);
    assert.equal(game.rules.active,'orks');
    assert.equal(game.rules.rounds,5);
    assert.deepEqual(game.rules.cp,{marines:1,orks:1});
    assert.deepEqual(game.rules.officialSetup.firstRolls,[[2,2],[1,4]]);
    assert.deepEqual(game.rules.officialSetup.roleRolls,[[5,5],[6,2]]);
    assert.ok(game.rules.reserves.intercessor.every(id=>piece(game,id).removed));
  });
}

test('saved map, defender, turn, terrain and revealed reserve records agree with decisions',()=>{
  const original=reveal('B');
  const deployed=step(step(original,'official-select',{unit:'warboss'}),'official-place');
  const corrupt=[
    s=>s.layout.blue='marines',s=>s.layout.map='A',
    s=>s.rules.deployment.defender='marines',s=>s.rules.deployment.next='orks',
    s=>s.rules.deployment.placed=['captain'],s=>s.rules.deployment.placed.push('warboss'),
    s=>s.rules.deployment.pending='intercessor',s=>s.rules.deployment.pending='wartrakk',
    s=>s.rules.patrol.enhanced.blades=true,s=>s.rules.reserves.intercessor.pop(),
    s=>piece(s,'librarian-1').removed=false,s=>piece(s,'largeRuin-1').x+=.05,
    s=>s.rules.officialSetup.deploymentComplete=true
  ];
  for(const edit of corrupt){
    const bad=snapshot(deployed);edit(bad);
    assert.throws(()=>restore(original,bad),String(edit));
  }
  assert.equal(stage(checkpoint(deployed)),'deployment');
  assert.deepEqual(original.rules.deployment.placed,[]);
});

test('official preparation cannot carry a forged battle round or phase into the first turn',()=>{
  const awaiting=reveal('C');
  for(const mutate of [s=>s.rules.round=4,s=>s.rules.step=4]){
    const bad=snapshot(awaiting);mutate(bad);
    assert.throws(()=>restore(createTable(),bad),String(mutate));
  }
});

test('committed bases must remain wholly in-zone, coherent, on a supporting surface and clear of committed units on restore',()=>{
  let game=reveal('A');
  for(const unit of ['captain','warboss','vanguard','weirdboy'])
    game=step(step(game,'official-select',{unit}),'official-place');
  const corrupt=[
    s=>Object.assign(piece(s,'captain-1'),{x:0,z:0}),
    s=>piece(s,'captain-1').x=-1000,
    s=>piece(s,'captain-1').elevation=11,
    s=>Object.assign(piece(s,'weirdboy-1'),{x:piece(s,'warboss-1').x,z:piece(s,'warboss-1').z}),
    s=>Object.assign(piece(s,'vanguard-1'),{x:piece(s,'vanguard-2').x,z:piece(s,'vanguard-2').z})
  ];
  // Isolate a Veteran within its own zone, retaining separation from all
  // other bases. This tests coherency rather than a coincident/outside base.
  const veteran=piece(game,'vanguard-1');
  const farFrom=game.pieces.filter(p=>p.faction==='marines'&&!p.removed&&p.id!==veteran.id);
  let isolated;
  for(let x=-21;x<=-11&&!isolated;x+=.5)for(let z=-14;z<=-1&&!isolated;z+=.5){
    const posed={...veteran,x,z};
    if(validDeployment(game,posed)&&farFrom.every(p=>Math.hypot(p.x-x,p.z-z)>5))isolated={x,z};
  }
  assert.ok(isolated,'an isolated position exists inside the deployment zone');
  const bad=snapshot(game);
  Object.assign(piece(bad,veteran.id),isolated);
  assert.throws(()=>restore(createTable(),bad));
  const wronglyAccepted=corrupt.filter(edit=>{
    const save=snapshot(game);edit(save);
    try{restore(createTable(),save);return true;}catch{return false;}
  }).map(String);
  assert.deepEqual(wronglyAccepted,[]);
});

test('a pending group can be saved while being adjusted but cannot be committed in midair',()=>{
  let game=step(reveal('C'),'official-select',{unit:'captain'});
  piece(game,'captain-1').elevation=11;
  assert.ok(patrolPlacementError(game));
  assert.throws(()=>step(game,'official-place'));
  game=checkpoint(game);
  piece(game,'captain-1').elevation=0;
  assert.equal(patrolPlacementError(game),'');
  assert.equal(step(game,'official-place').rules.deployment.placed[0],'captain');
});

test('objective polygons stay within the two boards, use the chosen home faction and measure partial bases',()=>{
  for(const map of ['A','B','C']){
    const g=reveal(map),areas=objectiveFootprints(g);
    assert.equal(areas.length,4);
    assert.equal(new Set(areas.map(a=>a.id)).size,4);
    for(const area of areas){
      assert.ok(area.polygon.every(([x,z])=>Math.abs(x)<=22&&Math.abs(z)<=15));
      const [[x,z],[x2,z2]]=area.polygon;
      Object.assign(piece(g,'captain-1'),{x:(x+x2)/2,z:(z+z2)/2});
      const scored=objectiveAreas(g).find(a=>a.id===area.id);
      assert.ok(scored.members.includes('captain-1'));
      assert.ok(!scored.members.includes('librarian-1'));
      assert.equal(scored.home,area.side==='blue'?g.layout.blue:area.side==='red'?(g.layout.blue==='marines'?'orks':'marines'):null);
    }
  }
});

test('ellipse tangent to a deployment perimeter is wholly within, while a base protruding one thousandth of an inch is outside',()=>{
  for(const map of ['A','B','C']){
    const g=reveal(map),zone=layoutGeometry(map).blue;
    const vehicle={...piece(g,'landSpeeder-1'),faction:g.layout.blue,yaw:.43};
    const center=zone.reduce(([a,b],[x,z])=>[a+x/zone.length,b+z/zone.length],[0,0]);
    for(const [[a,b],[c,d]] of zone.map((p,i)=>[p,zone[(i+1)%zone.length]])){
      const x=(a+c)/2,z=(b+d)/2,length=Math.hypot(c-a,d-b);
      let nx=(d-b)/length,nz=(a-c)/length;
      if((center[0]-x)*nx+(center[1]-z)*nz<0){nx=-nx;nz=-nz;}
      const cos=Math.cos(vehicle.yaw),sin=Math.sin(vehicle.yaw);
      const radius=Math.hypot(vehicle.baseWidth/2*(nx*cos-nz*sin),vehicle.baseDepth/2*(nx*sin+nz*cos));
      Object.assign(vehicle,{x:x+radius*nx,z:z+radius*nz});
      assert.equal(validDeployment(g,vehicle),true,map+' edge '+[a,b,c,d]);
      vehicle.x-=.001*nx;vehicle.z-=.001*nz;
      assert.equal(validDeployment(g,vehicle),false);
    }
  }
});

test('older manual and HP-only saves continue restoring without official formation or deployment assumptions',()=>{
  const table={...createTable(),logs:['이전 전장'],rules:newBattle(),layout:{map:'B',blue:'orks'}};
  table.rules.deployment={defender:'orks',next:'marines',placed:['warboss']};
  Object.assign(piece(table,'warboss-1'),{x:0,z:0,elevation:2});
  assert.deepEqual(checkpoint(table).rules,table.rules);
  table.rules={hp:{'warboss-1':2}};
  assert.deepEqual(checkpoint(table).rules,table.rules);
});
