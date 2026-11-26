import test from 'node:test';
import assert from 'node:assert/strict';
import {newBattle} from './battle.mjs';
import {openShootingReaction,shootingReactionOptions,beginShootingReaction,assessShootingReaction,
  proposeShootingReaction,finishShootingReaction,declineShootingReaction} from './shooting-reaction.mjs';

const model=(kind,x,z=0,i=1,extra={})=>({id:kind+'-'+i,kind,variant:i-1,name:kind,x,z,yaw:0,elevation:0,baseWidth:1,baseDepth:1,
  faction:['boy','warboss','gretchin','wartrakk'].includes(kind)?'orks':'marines',...extra});
function table(pieces,shooter){
  const gun=pieces.find(p=>p.kind===shooter);
  return {width:44,depth:30,pieces,rules:{...newBattle(),status:'playing',active:gun.faction,round:2,step:2,
    units:{[shooter]:{finishedAttack:2}},cp:{marines:3,orks:3}}};
}
const rapid=()=>table([model('warboss',10),model('vanguard',0)],'warboss');
const surge=()=>table([model('captain',12),model('librarian',6),model('boy',0)],'captain');
const apply=(g,r)=>({...g,rules:r.rules,pieces:g.pieces.map(p=>({...p,...r.poses?.[p.id]}))});
const opened=(g,shooter,targets)=>({...g,rules:{...g.rules,shootingReaction:openShootingReaction(g,{shooter,targets,didShoot:true})}});
const start=(g,unit,options={})=>apply(g,beginShootingReaction(g,g.rules.shootingReaction,{unit,d6:3,...options}));
const move=(g,id,paths)=>apply(g,proposeShootingReaction(g,id,{[id]:paths}));
const codes=result=>result.errors.map(i=>i.code);

test('only a fresh completed enemy shooting event opens: misses count, shooting without attacks does not',()=>{
  const g=rapid(),event={shooter:'warboss',targets:['vanguard'],didShoot:true};
  assert.ok(openShootingReaction(g,event));assert.equal(openShootingReaction(g,{...event,didShoot:false}),null);
  g.rules.units.vanguard={shotAt:true};
  assert.equal(openShootingReaction(g,{...event,targets:['captain']}),null);
  g.rules.declaration={locked:true};assert.equal(openShootingReaction(g,event),null);delete g.rules.declaration;
  delete g.rules.units.warboss.finishedAttack;assert.equal(openShootingReaction(g,event),null);
  g.rules.units.warboss.finishedAttack=2;g.rules.step=4;assert.equal(openShootingReaction(g,event),null);
  g.rules.step=2;g.rules.active='marines';assert.equal(openShootingReaction(g,event),null);
});

test('all legitimate split targets are snapshotted, only one may claim a stratagem; hazard can change closest enemy',()=>{
  const g=surge();g.pieces.push(model('gretchin',0,3));g.rules.hazard={unit:'captain',count:1};
  let h=opened(g,'captain',['boy-0','gretchin','boy-0']);
  assert.deepEqual(h.rules.shootingReaction.targets,['boy-0','gretchin']);
  assert.deepEqual(shootingReactionOptions(h),[]);
  assert.throws(()=>beginShootingReaction(h,h.rules.shootingReaction,{unit:'boy-0',d6:5}));
  delete h.rules.hazard;assert.deepEqual(shootingReactionOptions(h).map(o=>o.unit),['boy-0','gretchin']);
  h=start(h,'boy-0');assert.equal(h.rules.reactionPlan.target,'librarian');assert.equal(h.rules.cp.orks,2);
  assert.equal(h.rules.shootingReaction,null);assert.deepEqual(shootingReactionOptions(h),[]);
});

test('declining before selection spends nothing; after rolling, cancellation restores poses but consumes the resource',()=>{
  const g=opened(surge(),'captain',['boy-0']),w=g.rules.shootingReaction;
  const declined=apply(g,declineShootingReaction(g));assert.equal(declined.rules.cp.orks,3);
  assert.throws(()=>beginShootingReaction(declined,w,{unit:'boy-0',d6:5}));
  let h=start(g,'boy-0');h=move(h,'boy-1',[{x:2}]);assert.equal(h.pieces[2].x,2);
  const undo=apply(h,declineShootingReaction(h));assert.equal(undo.pieces[2].x,0);assert.equal(undo.rules.cp.orks,2);
  assert.equal(undo.rules.reactionPlan,null);assert.ok(undo.rules.units['boy-0'].reactionTracked);
  assert.equal(openShootingReaction(undo,{shooter:'captain',targets:['boy-0'],didShoot:true}),null);
});

test('Ork surge eligibility excludes shock, engagement, prior moves, insufficient CP and 15.01 stratagem conflicts',()=>{
  const base=surge();const event={shooter:'captain',targets:['boy-0'],didShoot:true};
  for(const mutate of [
    g=>{g.rules.cp.orks=0;},g=>{g.rules.units['boy-0']={shocked:true};},g=>{g.rules.units['boy-0']={reaction:true};},
    g=>{g.rules.patrol.spent.surge='2-marines-2';},g=>{g.rules.patrol.tactics.med='2-marines-2/boy-0';},
    g=>{g.pieces[1].x=2;},g=>{g.pieces[2].removed=true;}
  ]){const g=structuredClone(base);mutate(g);assert.equal(openShootingReaction(g,event),null);}
  base.rules.units['boy-0']={movement:'normal'};assert.ok(openShootingReaction(base,event));
  const marines=rapid();marines.rules.units.vanguard={shocked:true};marines.rules.cp.marines=0;
  assert.ok(openShootingReaction(marines,{shooter:'warboss',targets:['vanguard'],didShoot:true}));
});

test('unselected tied enemies cannot be engaged; ties use actual 3D closest base even when it is not the shooter',()=>{
  const g=surge();g.pieces[1].x=6;g.pieces.push(model('intercessor',-6));
  let h=opened(g,'captain',['boy-0']);
  assert.deepEqual(shootingReactionOptions(h)[0].targets,['librarian','intercessor']);
  assert.throws(()=>start(h,'boy-0'));assert.throws(()=>start(h,'boy-0',{target:'captain'}));
  h=start(h,'boy-0',{target:'librarian',d6:5});
  assert.ok(codes(assessShootingReaction(h,h.rules.reactionPlan,{'boy-1':[{x:-3.2}]})).includes('reaction-end-engaged'));
  const completed=finishShootingReaction(move(h,'boy-1',[{x:3.2}]));assert.equal(completed.poses['boy-1'].x,3.2);
  const elevated=surge();elevated.pieces[1].elevation=15;
  assert.deepEqual(shootingReactionOptions(opened(elevated,'captain',['boy-0']))[0].targets,['captain']);
});

test('every surging model approaches as far as possible, including an unmoved member; blocked alternatives request adjudication',()=>{
  let g=surge();g.pieces[1].x=10;g.pieces.push(model('boy',0,1.25,2));
  let h=start(opened(g,'captain',['boy-0']),'boy-0',{d6:1});
  let a=assessShootingReaction(h,h.rules.reactionPlan,{'boy-1':[{x:2}]});
  assert.ok(a.errors.some(e=>e.code==='surge-closer'&&e.modelIds.includes('boy-2')));
  g=surge();g.pieces[1].x=10;h=start(opened(g,'captain',['boy-0']),'boy-0',{d6:1});
  a=assessShootingReaction(h,h.rules.reactionPlan,{'boy-1':[{x:2}]});assert.ok(a.ok);assert.deepEqual(a.manual,[]);
  g=surge();g.pieces.push({...model('barricade',1.3),faction:'terrain',baseWidth:2,baseDepth:3});
  h=start(opened(g,'captain',['boy-0']),'boy-0',{d6:5});
  a=assessShootingReaction(h,h.rules.reactionPlan,{});assert.ok(a.manual.some(e=>e.code==='surge-route'));
  g=surge();h=start(opened(g,'captain',['boy-0']),'boy-0',{d6:5});
  a=assessShootingReaction(h,h.rules.reactionPlan,{'boy-1':[{x:1}]});assert.ok(codes(a).includes('surge-engage'));
});

test('Rapid Reactions permits optional flight, retreating direction, one shared die and per-model limits',()=>{
  const g=rapid();g.pieces.push(model('captain',0,1.1));g.rules.attachments['captain-1']='vanguard';
  const h=start(opened(g,'warboss',['vanguard']),'vanguard',{d6:5,takeToSkies:true});
  const airborne={'vanguard-1':[{x:-1,elevation:1}]};
  assert.ok(assessShootingReaction(h,h.rules.reactionPlan,airborne,'path').ok);
  assert.ok(codes(assessShootingReaction(h,h.rules.reactionPlan,airborne)).includes('unsupported-floor'));
  const args={'vanguard-1':[{x:-3,elevation:3}],'captain-1':[{x:-3,elevation:2}]};
  const a=assessShootingReaction(h,h.rules.reactionPlan,args,'path');
  assert.equal(a.limit,4);assert.equal(a.models['vanguard-1'].distance,3);assert.equal(a.models['captain-1'].distance,5);
  assert.ok(a.errors.some(e=>e.code==='distance'&&e.modelIds.includes('captain-1')));
  const ok=assessShootingReaction(h,h.rules.reactionPlan,{'vanguard-1':[{x:-3}],'captain-1':[{x:-3}]});
  assert.ok(ok.ok);assert.equal(h.rules.cp.marines,3);
  // Appendix 03.01.04: the stated D6+1 replaces the normal M cap even
  // for the M6 attached captain. Each model individually tracks its route.
  const seven=start(opened(g,'warboss',['vanguard']),'vanguard',{d6:6});
  const allSeven=assessShootingReaction(seven,seven.rules.reactionPlan,{'vanguard-1':[{x:-7}],'captain-1':[{x:-7}]});
  assert.ok(allSeven.ok);assert.equal(allSeven.models['captain-1'].limit,7);
  g.pieces[0].x=5;
  const free=start(opened(g,'warboss',['vanguard']),'vanguard',{d6:3});
  assert.ok(codes(assessShootingReaction(free,free.rules.reactionPlan,{'vanguard-1':[{x:2}]})).includes('reaction-end-engaged'));
});

test('live routes and original origins survive save/reload, over-budget edits fail atomically, and a finished defender cannot react twice',()=>{
  let h=start(opened(rapid(),'warboss',['vanguard']),'vanguard',{d6:3});
  h=move(h,'vanguard-1',[{x:-2}]);const snap=structuredClone(h);
  assert.throws(()=>move(h,'vanguard-1',[{x:4}]),e=>codes(e.assessment).includes('distance'));
  assert.deepEqual(h,snap);assert.throws(()=>move(h,'warboss-1',[{x:0}]));
  h=move(JSON.parse(JSON.stringify(h)),'vanguard-1',[{x:-4}]);
  const done=apply(h,finishShootingReaction(h));assert.equal(done.pieces[1].x,-4);assert.equal(done.rules.reactionPlan,null);
  assert.equal(done.rules.units.vanguard.reaction,true);assert.equal(done.rules.units.vanguard.reactionTracked,true);
  done.pieces.push(model('wartrakk',12));done.rules.units.wartrakk={finishedAttack:2};
  assert.equal(openShootingReaction(done,{shooter:'wartrakk',targets:['vanguard'],didShoot:true}),null);
});
