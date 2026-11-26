import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {layoutGeometry,objectiveAreas,objectiveFootprints,validDeployment} from '../layouts.mjs';
import {restore,snapshot} from '../state.mjs';
import {groupId,newBattle} from './battle.mjs';
import {advanceOfficialSetup,officialPreparing,patrolPlacementError,remainingPatrolUnits,visiblePatrolPiece} from './official-deployment.mjs';
import {newPatrolSetup,patrolSetupView} from './patrol-setup.mjs';
import {patrolTerrainPlacement} from './patrol-terrain-placement.mjs';
import {createTrainingOne} from './training-one.mjs';

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
function reveal(map,defender=map==='B'?'orks':'marines'){
  const key=map+'-'+defender;
  if(deployments.has(key))return structuredClone(deployments.get(key));
  let game=step(fresh(),'official-roll-layout',{},[{A:2,B:4,C:6}[map]]);
  assert.equal(stage(game),'role-roll');
  assert.equal(game.layout,null);
  game=checkpoint(step(game,'official-roll-role',{},[5,5]));
  assert.equal(stage(game),'role-roll');
  assert.throws(()=>step(game,'official-defend'));
  game=step(game,'official-roll-role',{},[6,2]);
  game=step(game,defender==='orks'?'official-attack':'official-defend');
  assert.deepEqual(game.layout,{map,blue:defender});
  game=step(game,'form-attach',{team:'marines',leader:'librarian-1',unit:'intercessor'});
  game=step(game,'form-reserve',{team:'marines',unit:'intercessor'});
  game=step(game,'form-enhance',{team:'marines',enhancement:'veterans'});
  game=checkpoint(step(game,'form-lock',{team:'marines'}));
  assert.deepEqual(game.rules.attachments,{});
  assert.deepEqual(game.pieces.filter(p=>p.removed).map(p=>p.id),['shockArray-1']);
  game=step(game,'form-open',{team:'orks'});
  game=step(game,'form-enhance',{team:'orks',enhancement:'armour'});
  game=checkpoint(step(game,'form-lock',{team:'orks'}));
  assert.equal(stage(game),'deployment');
  assert.equal(game.rules.deployment.next,defender);
  assert.equal(game.rules.reserves.intercessor.length,6);
  assert.ok(game.rules.reserves.intercessor.every(id=>piece(game,id).removed));
  assert.deepEqual(game.pieces.filter(p=>visiblePatrolPiece(game.rules,p)).map(p=>p.faction),Array(14).fill('terrain'));
  deployments.set(key,game);
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
    const activeSave=snapshot(game);
    Object.assign(piece(activeSave,'captain-1'),{x:1.7,z:1.9,yaw:.27});
    Object.assign(piece(activeSave,'largeRuin-1'),{x:1.7,z:1.9,yaw:-.76});
    for(const version of [1,2,3,4,5,6,7,8]){
      activeSave.rules.officialSetup.version=version;
      piece(activeSave,'shockArray-1').removed=version!==1;
      const loaded=restore(createTable(),activeSave),small=piece(loaded,'smallRuin-1');
      assert.equal(!!small.previousSmallRuin,version<4);
      assert.equal(small.baseDepth,version<4?1.4:1.25);
      assert.equal(!!piece(loaded,'smallRuin-4').previousPipeRuin,version<5);
      assert.deepEqual(snapshot(loaded),activeSave,'Restore the ongoing battle in place, including overlapping pieces');
      const handbook={...activeSave,training:createTrainingOne()};
      assert.deepEqual(snapshot(restore(createTable(),handbook)),handbook,'Preserve the underlying patrol poses while a handbook mission is open');
    }
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

test('the box shows all 15 terrain pieces before the draw; each saved map version restores its own structures and resumes through placement',()=>{
  assert.equal(fresh().rules.officialSetup.version,8);
  for(const version of [1,2,3,4,5,6,7,8])for(const [map,die] of [['A',1],['B',3],['C',5]]){
    let game=fresh();game.rules.officialSetup.version=version;
    assert.equal(game.pieces.filter(p=>visiblePatrolPiece(game.rules,p)).length,15);
    const tooEarly=snapshot(game);piece(tooEarly,'shockArray-1').removed=true;
    assert.throws(()=>restore(createTable(),tooEarly));
    game=checkpoint(step(game,'official-roll-layout',{},[die]));
    assert.equal(!!piece(game,'smallRuin-1').previousSmallRuin,version<4);
    assert.equal(!!piece(game,'smallRuin-4').previousPipeRuin,version<5);
    for(const id of ['barricade-1','barricade-2']){
      assert.equal(!!piece(game,id).previousBarricade,version<6);
      assert.equal(piece(game,id).baseDepth,version<6?.65:1.25);
    }
    assert.equal(game.pieces.filter(p=>visiblePatrolPiece(game.rules,p)).length,version===1?15:14);
    const switched=snapshot(game);
    switched.rules.officialSetup.version=version===1?2:1;
    assert.throws(()=>restore(createTable(),switched));
    piece(switched,'shockArray-1').removed=version===1;
    assert.throws(()=>restore(createTable(),switched),'other layout poses also differ');
    if(version>=2){
      const wrongRuins=snapshot(game);
      wrongRuins.rules.officialSetup.version=version===2?3:2;
      assert.throws(()=>restore(createTable(),wrongRuins),'v2 and v3 share removal flags but place their ruins differently');
    }
    const tampered=snapshot(game);piece(tampered,'shockArray-1').removed=version===1;
    assert.throws(()=>restore(createTable(),tampered));
    if(version>=3){
      const wrongSmall=snapshot(game);wrongSmall.rules.officialSetup.version=version===3?4:3;
      assert.throws(()=>restore(createTable(),wrongSmall),'the two editions register a different small ruin');
    }
    if(version>=4){
      const wrongPipe=snapshot(game);wrongPipe.rules.officialSetup.version=version===4?5:4;
      assert.throws(()=>restore(createTable(),wrongPipe),'the registered pipe wall changes between v4 and v5');
    }
    const unsupported=snapshot(game);unsupported.rules.officialSetup.version=9;
    assert.throws(()=>restore(createTable(),unsupported));
    game=step(step(game,'official-roll-role',{},[1,4]),'official-defend');
    game=step(game,'form-enhance',{team:'marines',enhancement:'veterans'});
    game=step(step(game,'form-lock',{team:'marines'}),'form-open',{team:'orks'});
    game=step(game,'form-enhance',{team:'orks',enhancement:'warcry'});
    game=checkpoint(step(game,'form-lock',{team:'orks'}));
    game=step(game,'official-select',{unit:'warboss'});
    piece(game,'warboss-1').yaw=.27;
    game=checkpoint(step(game,'official-place'));
    assert.deepEqual(game.rules.deployment.placed,['warboss']);
    assert.equal(piece(game,'warboss-1').yaw,.27,'a committed player rotation survives reload');
    game=step(game,'official-select',{unit:'captain'});
    const pipe=piece(game,'smallRuin-4'),captain=piece(game,'captain-1');
    const localZ=version<5?1.1:-.7;
    const byWall={...captain,x:pipe.x+Math.sin(pipe.yaw)*localZ,z:pipe.z+Math.cos(pipe.yaw)*localZ};
    assert.equal(patrolTerrainPlacement(byWall,[pipe]).error,'');
    assert.ok(patrolTerrainPlacement(byWall,[{...pipe,previousPipeRuin:version>=5}]).error,'the opposite casting obstructs this same base');
    // On corrected map B this spot sits beyond the printed deployment diagonal.
    if(version>=5&&map==='B')assert.equal(validDeployment(game,byWall),false);
    else Object.assign(captain,byWall);
    assert.equal(patrolPlacementError(game),'');
    game=checkpoint(step(game,'official-place'));
    assert.deepEqual(game.rules.deployment.placed,['warboss','captain']);
    assert.equal(piece(game,'captain-1').x,captain.x);
    assert.equal(piece(game,'captain-1').z,captain.z);
    const obstructed=snapshot(game),wrongZ=version<5?-.7:1.1;
    Object.assign(piece(obstructed,'captain-1'),{x:pipe.x+Math.sin(pipe.yaw)*wrongZ,z:pipe.z+Math.cos(pipe.yaw)*wrongZ});
    assert.throws(()=>restore(createTable(),obstructed),'a committed base may not be forged inside its own wall');
    for(const at of layoutGeometry(map,version).terrain){
      const model=piece(game,at.id);
      assert.equal(model.removed,false);
      assert.ok(Math.hypot(model.x-at.x,model.z-at.z)<1e-7);
      assert.ok(Math.abs(Math.sin((model.yaw-at.yaw)/2))<1e-7);
    }
  }
});

test('pre-correction saves still use their eight recorded ruin positions and rotations on every map',()=>{
  // Older releases registered the centres in these coordinates on the
  // portrait diagram. Each row is [u, v, degrees], large 1–4 then small 1–4.
  const published={
    A:[[933,454,0],[600,1505,180],[348,776,180],[1130,1203,90],[1200,301,0],[1200,496,90],[341,1465,180],[342,1662,270]],
    B:[[539,496,0],[1010,1465,180],[473,1471,180],[1071,518,0],[798,347,0],[798,530,90],[738,1430,180],[739,1623,270]],
    C:[[1171,561,90],[339,1424,270],[1187,1260,180],[362,717,0],[1034,281,180],[1222,268,0],[314,1680,270],[491,1705,90]]
  };
  for(const version of [1,2])for(const [map,ruins] of Object.entries(published)){
    const terrain=layoutGeometry(map,version).terrain;
    for(const [index,[u,v,degrees]] of ruins.entries()){
      const id=(index<4?'large':'small')+'Ruin-'+(1+index%4);
      const pose=terrain.find(p=>p.id===id);
      assert.ok(Math.abs(pose.x-((v-154)*44/1654-22))<1e-9,map+' '+id+' v'+version+' x');
      assert.ok(Math.abs(pose.z-(15-(u-203)*30/1129))<1e-9,map+' '+id+' v'+version+' z');
      assert.ok(Math.abs(pose.yaw-degrees*Math.PI/180)<1e-9,map+' '+id+' v'+version+' yaw');
    }
  }
});

test('v3 and v4 keep the recorded pipe-wall centre, including the large offset on map C',()=>{
  for(const version of [3,4])for(const [map,[u,v]] of Object.entries({A:[359,1664],B:[747,1630],C:[475,1701]})){
    const pipe=layoutGeometry(map,version).terrain.find(p=>p.id==='smallRuin-4');
    assert.ok(Math.abs(pipe.x-((v-154)*44/1654-22))<1e-9);
    assert.ok(Math.abs(pipe.z-(15-(u-203)*30/1129))<1e-9);
    assert.equal(pipe.yaw,270*Math.PI/180);
  }
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
  assert.equal(piece(game,'captain-1').elevation,11,'an unfinished adjustment remains where the player saved it');
  piece(game,'captain-1').elevation=0;
  assert.equal(patrolPlacementError(game),'');
  assert.equal(step(game,'official-place').rules.deployment.placed[0],'captain');
});

test('two legal elevations on the same landing cannot conceal overlapping bases on commit or restore',()=>{
  let game=step(step(reveal('A','marines'),'official-select',{unit:'captain'}),'official-place');
  game=step(game,'official-select',{unit:'warboss'});
  const ruin=piece(game,'largeRuin-2');
  // Local (−1.12, +0.56) is inside the broken landing with clearance for
  // either 50 mm base, measured in the ruin's local axes.
  const c=Math.cos(ruin.yaw),s=Math.sin(ruin.yaw);
  const position={x:ruin.x-1.12*c+.56*s,z:ruin.z+1.12*s+.56*c};
  const first=piece(game,'warboss-1');
  Object.assign(first,position,{elevation:2.30});
  assert.equal(patrolTerrainPlacement(first,[ruin]).error,'','the landing independently supports the first base');
  game=step(game,'official-place');
  game=step(step(game,'official-select',{unit:'landSpeeder'}),'official-place');
  game=step(game,'official-select',{unit:'weirdboy'});
  const other=piece(game,'weirdboy-1');
  Object.assign(other,position,{elevation:2.31});
  assert.equal(patrolTerrainPlacement(other,[ruin]).error,'','upper floor independently supports the second base');
  assert.match(patrolPlacementError(game),/다른 모델의 베이스/);
  assert.throws(()=>step(game,'official-place'),/다른 모델의 베이스/);

  other.elevation=0;
  const separated=checkpoint(step(game,'official-place'));
  assert.equal(piece(separated,'warboss-1').elevation,2.30);
  assert.equal(piece(separated,'weirdboy-1').elevation,0);
  const forged=snapshot(separated);
  piece(forged,'weirdboy-1').elevation=2.31;
  assert.throws(()=>restore(createTable(),forged));
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
  Object.assign(piece(table,'shockArray-1'),{x:3.25,z:1.6,yaw:.15,removed:false});
  Object.assign(piece(table,'generatorShrine-1'),{x:7.5,z:9,removed:true});
  assert.deepEqual(snapshot(checkpoint(table)).pieces,snapshot(table).pieces);
  assert.deepEqual(checkpoint(table).rules,table.rules);
  table.rules={hp:{'warboss-1':2}};
  assert.deepEqual(checkpoint(table).rules,table.rules);
});

test('migrating the second ruin leaves an earlier v2 vehicle placement on the first ruin committed',()=>{
  let game=fresh();game.rules.officialSetup.version=2;
  game=step(game,'official-roll-layout',{},[1]);
  game=step(game,'official-roll-role',{},[2,6]);
  game=step(game,'official-defend');
  game=step(game,'form-enhance',{team:'marines',enhancement:'veterans'});
  game=step(step(game,'form-lock',{team:'marines'}),'form-open',{team:'orks'});
  game=step(game,'form-enhance',{team:'orks',enhancement:'warcry'});
  game=step(game,'form-lock',{team:'orks'});
  for(const unit of ['wartrakk','captain'])
    game=step(step(game,'official-select',{unit}),'official-place');
  const old=snapshot(game);delete old.terrainRevision;
  const first=piece(game,'largeRuin-1'),second=piece(game,'largeRuin-2');
  const vehicle=piece(old,'wartrakk-1'),captain=piece(old,'captain-1');
  // Map A v2 first ruin faces +Z. The old oval fits underneath the landing
  // while some of the tracked vehicle's upper equipment meets its underside.
  Object.assign(vehicle,{x:first.x-.8,z:first.z+1.4,yaw:0});
  const posed={...piece(game,vehicle.id),...vehicle};
  assert.ok(validDeployment(game,posed));
  assert.equal(patrolTerrainPlacement(posed,[first],{checkVehicleBody:false}).error,'');
  assert.deepEqual(patrolTerrainPlacement(posed,[first]).contacts,[first.id]);
  // The second ruin faces -Z. This captain was supported by its former shelf.
  Object.assign(captain,{x:second.x+1.4,z:second.z+.5,elevation:2.35});
  const loaded=restore(createTable(),old);
  assert.deepEqual(loaded.rules.deployment,game.rules.deployment);
  const resumed=snapshot(loaded);
  assert.deepEqual(piece(resumed,vehicle.id),vehicle);
  assert.notEqual(piece(resumed,captain.id).elevation,captain.elevation);
  assert.deepEqual(snapshot(restore(createTable(),resumed)),resumed);
});
