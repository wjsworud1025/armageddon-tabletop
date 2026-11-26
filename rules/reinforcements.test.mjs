import test from 'node:test';
import assert from 'node:assert/strict';
import {newBattle} from './battle.mjs';
import {assessReinforcement,reinforcementOptions,expiringReserves,reserveCapacity} from './reinforcements.mjs';

const model=(kind,i=1,props={})=>({id:kind+'-'+i,kind,variant:i-1,
  faction:['gretchin','warboss','boy','wartrakk'].includes(kind)?'orks':'marines',
  x:0,z:0,yaw:0,elevation:0,baseWidth:1,baseDepth:1,removed:false,...props});
const table=(pieces,reserves,rules={})=>({pieces,width:44,depth:30,layout:{map:'A',blue:'marines'},
  rules:{...newBattle(),status:'playing',step:1,round:2,reserves,...rules}});
const errors=a=>a.errors.map(x=>x.code);
const unit=(kind,x,z)=>({[kind+'-1']:{x,z}});
const army=(kind='captain',props={})=>table([model(kind,1,{removed:true,...props})],{[kind]:[kind+'-1']});
const place=(g,key,x,z,mode='edge')=>assessReinforcement(g,key,unit(key,x,z),{mode});

test('verified 20.04 timing and roster authority work with hidden and visible draft models',()=>{
  const g=army(),id=g.pieces[0].id;
  assert.deepEqual(reinforcementOptions(g,'captain').modes,['edge']);
  assert.ok(place(g,'captain',-19,0).ok);
  g.pieces[0].removed=false;g.rules.reinforcePlan={unit:'captain'};assert.ok(place(g,'captain',-19,0).ok);
  g.rules.reinforcePlan.unit='vanguard';assert.ok(errors(place(g,'captain',-19,0)).includes('unit-busy'));
  delete g.rules.reinforcePlan;
  for(const [key,value] of [['active','orks'],['step',0],['status','setup']]){
    const h=structuredClone(g);h.rules[key]=value;
    assert.ok(errors(reinforcementOptions(h,'captain')).includes('ingress-timing'));
  }
  g.rules.round=1;assert.ok(errors(reinforcementOptions(g,'captain')).includes('first-round'));
  g.rules.round=4;assert.ok(errors(reinforcementOptions(g,'captain')).includes('expired-reserves'));
  g.rules.round=3;g.rules.hp[id]=0;assert.ok(errors(reinforcementOptions(g,'captain')).includes('not-reserved'));
  delete g.rules.reserves.captain;assert.equal(reinforcementOptions(g,'captain').ok,false);
});

test('a base must be on the table and entirely within the union of edge bands',()=>{
  const g=army();g.rules.round=3;
  assert.ok(place(g,'captain',-16.5,0).ok); // Right side of 1-inch base is exactly 6 inches from edge.
  assert.ok(errors(place(g,'captain',-16.49,0)).includes('edge-band'));
  assert.ok(place(g,'captain',-21.5,0).ok);assert.ok(errors(place(g,'captain',-21.51,0)).includes('board-edge'));
  // Radius one at the inner strip corner. Neither single strip encloses the base.
  Object.assign(g.pieces[0],{baseWidth:2,baseDepth:2});
  assert.ok(place(g,'captain',-16.8,-9.8).ok);assert.ok(errors(place(g,'captain',-16.6,-9.6)).includes('edge-band'));
  Object.assign(g.pieces[0],{baseWidth:4,baseDepth:1});
  assert.ok(errors(place(g,'captain',-17,0)).includes('edge-band'));
  g.pieces[0].yaw=Math.PI/2;assert.ok(place(g,'captain',-17,0).ok);
});

test('horizontal exclusion measures strictly over 8 inches, disregarding enemy elevation and other reserves',()=>{
  const g=army();g.pieces.push(model('warboss',1,{x:-9.5,z:0,elevation:15}));
  assert.ok(errors(place(g,'captain',-18.5,0)).includes('enemy-distance'));
  assert.ok(place(g,'captain',-18.501,0).ok);g.rules.reserves.warboss=['warboss-1'];
  assert.ok(place(g,'captain',-18,0).ok);
});

test('round two excludes any base overlap with opponent deployment on A/B/C; round three opens it',()=>{
  const g=army();
  for(const map of ['A','B','C'])for(const blue of ['marines','orks']){
    g.layout={map,blue};g.rules.round=2;
    const x=blue==='marines'?20:-20,z=blue==='marines'?10:-10;
    assert.ok(errors(place(g,'captain',x,z)).includes('enemy-zone'),map+blue);
    g.rules.round=3;assert.ok(place(g,'captain',x,z).ok);
  }
  g.layout=null;g.rules.round=2;
  const custom=place(g,'captain',-19,0);
  assert.ok(custom.ok);assert.deepEqual(custom.manual.map(i=>i.code),['deployment-map']);
});

test('only Grot Infestation grants deep strike, including round-two enemy deployment zones',()=>{
  const g=army('gretchin');g.rules.active='orks';
  assert.deepEqual(reinforcementOptions(g,'gretchin').modes,['edge']);
  g.rules.patrol.grotReturned=true;
  assert.deepEqual(reinforcementOptions(g,'gretchin').modes,['edge','deep-strike']);
  assert.ok(place(g,'gretchin',0,0,'deep-strike').ok);
  assert.ok(place(g,'gretchin',-19,-10,'deep-strike').ok);
  assert.ok(errors(place(g,'gretchin',-19,-10,'edge')).includes('enemy-zone'));
  g.pieces.push(model('captain',1,{x:9}));
  assert.ok(errors(place(g,'gretchin',0,0,'deep-strike')).includes('enemy-distance'));
  g.rules.round=4;assert.ok(reinforcementOptions(g,'gretchin').ok);
  const h=army('vanguard');assert.ok(errors(place(h,'vanguard',0,0,'deep-strike')).includes('ingress-mode'));
});

test('all reserved models including attached characters need poses, legal spacing and supported surfaces',()=>{
  const cap=model('captain',1,{removed:true}),vet=model('vanguard',1,{removed:true}),other=model('librarian',1,{x:-19});
  const g=table([cap,vet,other],{vanguard:[cap.id,vet.id]},{attachments:{[cap.id]:'vanguard'}});
  const poses={[cap.id]:{x:-19,z:2},[vet.id]:{x:-19,z:3}};
  assert.ok(assessReinforcement(g,'vanguard',poses).ok);
  assert.ok(errors(assessReinforcement(g,'vanguard',{[cap.id]:poses[cap.id]})).includes('ingress-members'));
  assert.ok(errors(assessReinforcement(g,'vanguard',{...poses,[vet.id]:{x:NaN,z:4}})).includes('ingress-pose'));
  assert.ok(errors(assessReinforcement(g,'vanguard',{...poses,[vet.id]:{x:-19,z:7}})).includes('coherency-neighbour'));
  assert.ok(errors(assessReinforcement(g,'vanguard',{...poses,[vet.id]:{x:-19,z:.3}})).includes('base-overlap'));
  const g2=army('wartrakk');g2.rules.active='orks';g2.rules.round=3;
  const up={'wartrakk-1':{x:0,z:12,elevation:3}};
  let tested=assessReinforcement(g2,'wartrakk',up);
  assert.ok(errors(tested).includes('upper-floor'));assert.ok(errors(tested).includes('unsupported-base'));
  g.pieces.push(model('largeRuin',1,{faction:'terrain',x:-18.1,z:2.55,baseWidth:5.2,baseDepth:4.1}));
  tested=assessReinforcement(g,'vanguard',{...poses,[cap.id]:{...poses[cap.id],elevation:3}});
  assert.ok(errors(tested).includes('unsupported-floor'));
  tested=assessReinforcement(g,'vanguard',{...poses,[cap.id]:{...poses[cap.id],elevation:3.37}});
  assert.ok(tested.ok);assert.ok(tested.manual.some(m=>m.code==='supported-floor'));
  assert.deepEqual(g.rules.attachments,{[cap.id]:'vanguard'});assert.equal(cap.removed,true);
});

test('patrol reserve limit counts friendly units and round-three expiry distinguishes returned grots',()=>{
  const g=table([model('captain'),model('librarian'),model('intercessor'),model('vanguard'),model('gretchin')],
    {librarian:['librarian-1'],gretchin:['gretchin-1']},{attachments:{'captain-1':'vanguard'}});
  assert.deepEqual(reserveCapacity(g,'marines'),{total:3,maximum:1,reserved:1,remaining:0});
  Object.assign(g.rules,{round:3,step:5,active:'marines',first:'marines'});g.rules.patrol.grotReturned=true;
  assert.deepEqual(expiringReserves(g),{units:[],ids:[],final:false});
  g.rules.active='orks';assert.deepEqual(expiringReserves(g),{units:['librarian'],ids:['librarian-1'],final:false});
  g.rules.round=4;assert.equal(expiringReserves(g).ids.length,0);
  g.rules.round=5;assert.deepEqual(expiringReserves(g),{units:['librarian','gretchin'],ids:['librarian-1','gretchin-1'],final:true});
});
