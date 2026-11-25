import test from 'node:test';
import assert from 'node:assert/strict';
import {beginFightSequence,fightOptions,fightMoveOptions,assessFightMove,transitionFight,validFightSequence} from '../fight-sequence.mjs';
import {createFightControls} from '../rules/fight-controls.mjs';
import {beginFightMove,proposeFightMove,finishFightMove,cancelFightMove} from '../fight-session.mjs';
import {newBattle} from '../rules/battle.mjs';
import {validateRulesState} from '../rules/validate.mjs';

const model=(kind,x,z=0,variant=0)=>({id:kind+'-'+(variant+1),kind,variant,name:kind,
  faction:['warboss','weirdboy','boy','gretchin'].includes(kind)?'orks':'marines',
  baseWidth:1,baseDepth:1,elevation:0,yaw:0,x,z});
const table=(pieces,units={})=>({width:44,depth:30,pieces,rules:{...newBattle(),status:'playing',step:4,units}});
const pass=(g,s,o)=>transitionFight(g,s,{type:'pass'},o);
const pick=(g,s,unit,kind='normal')=>transitionFight(g,s,{type:'select',unit,kind});
const markFinished=(g,unit)=>{g.rules.units[unit]={...g.rules.units[unit],finishedAttack:4};};
const finish=(g,s)=>transitionFight(g,s,{type:'finish'});
const battle=g=>pass(g,pass(g,beginFightSequence(g)));
const check=(g,s,unit,targets,paths,extra={})=>assessFightMove({game:g,sequence:s,unit,targets,paths,...extra});
const codes=a=>a.errors.map(s=>s.code);
const cons=(g,eligible)=>({...beginFightSequence(g),stage:'consolidate',team:g.rules.active,fought:[...eligible],eligibleDuringFight:[...eligible],active:null});
const obj={id:'home',name:'본진',polygon:[[0,2],[2,2],[2,4],[0,4]]};

test('empty battle skips every optional and mandatory step; both players may decline all pile-ins',()=>{
  const empty=table([]);assert.equal(beginFightSequence(empty).stage,'done');
  const g=table([model('captain',0),model('warboss',2)]);
  let s=beginFightSequence(g);
  assert.deepEqual(fightOptions(g,s).units,['captain']);
  assert.throws(()=>pick(g,s,'captain'));
  s=pass(g,s);assert.equal(s.team,'orks');assert.equal(s.stage,'pile');
  s=pass(g,s);assert.equal(s.stage,'remaining');assert.equal(s.team,'marines');
  assert.deepEqual(s.engagedAtFightStart,['captain','warboss']);
  assert.equal(fightOptions(g,s).canPass,false);assert.throws(()=>pass(g,s));
});

test('charged and Fights First units alternate; the next player carries into remaining fights',()=>{
  const g=table([model('captain',0),model('warboss',2),model('librarian',10),model('weirdboy',12)],
    {captain:{charged:true},warboss:{fightsFirst:true}});
  let s=battle(g);
  for(const [unit,team,stage] of [['captain','marines','first'],['warboss','orks','first'],['librarian','marines','remaining'],['weirdboy','orks','remaining']]){
    assert.equal(s.team,team);assert.equal(s.stage,stage);
    assert.deepEqual(fightOptions(g,s).units,[unit]);
    s=pick(g,s,unit);assert.throws(()=>finish(g,s));markFinished(g,unit);s=finish(g,s);
  }
  assert.equal(s.stage,'consolidate');assert.equal(s.team,'marines');
  assert.equal(pass(g,pass(g,s)).stage,'done');
});

test('start-of-Fight-step record survives target destruction, permitting optional one-time overrun',()=>{
  const g=table([model('captain',0),model('warboss',2),model('weirdboy',6)]);
  let s=battle(g);g.pieces[1].removed=true;
  assert.deepEqual(fightOptions(g,s).kinds.captain,['overrun']);
  s=pick(g,s,'captain','overrun');assert.deepEqual(fightMoveOptions(g,s,'captain').targets,['weirdboy']);
  const action={type:'move',unit:'captain',targets:['weirdboy'],paths:{'captain-1':[{x:3}]}};
  const next=transitionFight(g,s,action);assert.equal(next.active.extraPile,false);
  g.pieces[0].x=3;assert.throws(()=>transitionFight(g,next,action));
  markFinished(g,'captain');s=finish(g,next);
  assert.deepEqual(fightOptions(g,s).kinds.weirdboy,['normal','overrun']);
  s=pick(g,s,'weirdboy','overrun');s=transitionFight(g,s,{type:'skip-overrun'});
  assert.throws(()=>transitionFight(g,s,{type:'skip-overrun'}));
});

test('a charged unit can pile into a previously unengaged Fights First unit before snapshot',()=>{
  const g=table([model('captain',0),model('warboss',6)],{captain:{charged:true},warboss:{fightsFirst:true}});
  let s=beginFightSequence(g);
  const move={type:'move',unit:'captain',targets:['warboss'],origins:{'captain-1':{x:0,z:0}},paths:{'captain-1':[{x:3}]}};
  g.pieces[0].x=3; // The real table already displays its uncommitted drag.
  s=transitionFight(g,s,move);assert.deepEqual(s.piled,['captain']);assert.equal(s.team,'orks');
  s=pass(g,s);assert.deepEqual(s.engagedAtFightStart,['captain','warboss']);assert.deepEqual(fightOptions(g,s).kinds.captain,['normal']);
});

test('a far first-fighter can pass to a remaining enemy and two successive passes end combat',()=>{
  const g=table([model('captain',0),model('warboss',2)],{captain:{charged:true}});
  let s=battle(g);g.pieces[1].x=12;
  assert.equal(fightOptions(g,s).canPass,true);s=pass(g,s);
  assert.equal(s.team,'orks');assert.deepEqual(fightOptions(g,s).units,['warboss']);
  s=pass(g,s);assert.equal(s.stage,'done');
  const h=table([model('captain',0)],{captain:{charged:true}});
  assert.equal(pass(h,beginFightSequence(h)).stage,'done');
});

test('moving models must preserve all previous engagements; base contact even bars pivot',()=>{
  const g=table([model('captain',0),model('warboss',1),model('weirdboy',-2.9)]);
  let s=beginFightSequence(g);
  assert.deepEqual(fightMoveOptions(g,s,'captain').targets,['warboss','weirdboy']);
  assert.deepEqual(codes(check(g,s,'captain',['warboss'],{})),['fight-target']);
  assert.ok(codes(check(g,s,'captain',['warboss','weirdboy'],{'captain-1':[{yaw:1}]})).includes('base-contact'));
  g.pieces[1].x=1.5;
  const loss=check(g,s,'captain',['warboss','weirdboy'],{'captain-1':[{x:.4}]});
  assert.ok(codes(loss).includes('lost-engagement'));
  assert.ok(check(g,s,'captain',['warboss','weirdboy'],{}).ok);
});

test('movement validates the reachable nearest selected unit, supported bases, and vertical engagement',()=>{
  const g=table([model('intercessor',0),model('intercessor',2.4,-1.1,1),model('warboss',5)],{intercessor:{charged:true}});
  const s=beginFightSequence(g);
  assert.ok(codes(check(g,s,'intercessor',['warboss'],{'intercessor-1':[{x:.4}]})).includes('engage-if-possible'));
  assert.ok(check(g,s,'intercessor',['warboss'],{'intercessor-1':[{x:2,z:1.01},{x:2.3,z:1.01}]}).ok);
  assert.ok(codes(check(g,s,'intercessor',['warboss'],{'intercessor-1':[{x:5}]})).includes('distance'));
  const h=table([model('captain',0),{...model('warboss',2.99),elevation:5}]);
  assert.equal(beginFightSequence(h).stage,'pile');h.pieces[1].elevation=5.01;assert.equal(beginFightSequence(h).stage,'done');
});

test('ongoing and engaging consolidations trigger required unselected enemy fights',()=>{
  for(const offset of [2,3.8]){
    const g=table([model('captain',0),model('warboss',offset)]);let s=cons(g,['captain']);
    const move=fightMoveOptions(g,s,'captain',[obj]);
    assert.equal(move.mode,offset===2?'ongoing':'engaging');
    const paths={'captain-1':[{x:.9}]};
    s=transitionFight(g,s,{type:'move',unit:'captain',targets:['warboss'],paths},[obj]);
    g.pieces[0].x=.9;assert.deepEqual(s.reactions,['warboss']);assert.equal(s.team,'marines');
    const options=fightOptions(g,s,[obj]);assert.equal(options.team,'orks');assert.equal(options.canPass,false);
    s=pick(g,s,'warboss');assert.ok(validFightSequence(s));markFinished(g,'warboss');
    s=finish(g,s);assert.equal(s.stage,'consolidate');assert.equal(s.team,'orks');
    assert.equal(pass(g,s).stage,'done');
  }
});

test('objective and unit consolidation priorities, within 3 to qualify and 6 to move with tactic',()=>{
  const g=table([model('intercessor',-1.5,2),model('intercessor',1,3,1),model('warboss',-5.3,2)]);
  const s=cons(g,['intercessor']);g.rules.patrol.tactics.consolidate='1-marines-4/intercessor';
  assert.deepEqual(fightMoveOptions(g,s,'intercessor',[obj]),{mode:'engaging',targets:['warboss'],requiredAll:false,maxTargets:1,limit:6});
  g.pieces[2].x=-10;
  const choices=fightMoveOptions(g,s,'intercessor',[obj]);assert.equal(choices.mode,'objective');assert.equal(choices.maxTargets,1);
  assert.ok(codes(check(g,s,'intercessor',['home'],{'intercessor-1':[{x:-1.1}]},{objectives:[obj]})).includes('objective-if-possible'));
  assert.ok(check(g,s,'intercessor',['home'],{'intercessor-1':[{x:-.4}]},{objectives:[obj]}).ok);
  g.pieces[0].x=-7;g.pieces[1].x=-8;g.pieces[2].removed=true;
  assert.equal(fightMoveOptions(g,s,'intercessor',[obj]),null);
  const h=table([model('captain',0),model('warboss',0,5)]),hs=cons(h,['captain']);
  assert.ok(codes(check(h,hs,'captain',['home'],{'captain-1':[{z:2.3}]},{objectives:[obj]})).includes('objective-engaged'));
  assert.ok(check(h,hs,'captain',['home'],{'captain-1':[{z:1.6}]},{objectives:[obj]}).ok);
});

test('legacy combat saves retain prior attacks and safely recover an open declaration/hazard',()=>{
  const g=table([model('captain',0),model('warboss',2)],{warboss:{finishedAttack:4}});
  let s=beginFightSequence(g);assert.equal(s.stage,'remaining');assert.ok(s.fought.includes('warboss'));assert.ok(validFightSequence(s));
  const activeAlreadyFought=table([model('captain',0),model('warboss',2),model('librarian',-1)],{captain:{finishedAttack:4}});
  assert.equal(beginFightSequence(activeAlreadyFought).team,'orks');
  g.rules.declaration={unit:'captain'};s=beginFightSequence(g);
  assert.equal(s.active.unit,'captain');assert.ok(validFightSequence(s));assert.throws(()=>finish(g,s));
  delete g.rules.declaration;g.rules.hazard={unit:'captain',count:1};assert.ok(validFightSequence(beginFightSequence(g)));
  for(const bad of [{stage:'<b>'},{reactions:['captain']},{fought:['__proto__']},{passes:true},{active:{...s.active,unit:'toString'}},{unknown:1}])
    assert.equal(validFightSequence({...s,...bad}),false);
});

test('injected controls drive the rendered unit, target, optional move and attack handoffs',()=>{
  const g=table([model('captain',0),model('warboss',5),model('weirdboy',-5)],{captain:{charged:true}});
  let draft=null,selected=null,refreshes=0;
  const ui=createFightControls({getGame:()=>g,commit:s=>{g.rules=s;},refresh:()=>refreshes++,
    startMove:(d,s)=>{draft={d,s};},selectUnit:k=>{selected=k;}});
  assert.match(ui.render(),/밀착 이동/);
  ui.change('fight-target','weirdboy',true);ui.change('fight-target','warboss',false);ui.dispatch('fight-move');
  assert.deepEqual(draft.d,{unit:'captain',targets:['weirdboy'],type:'pile-in',mode:'pile-in',limit:3});
  assert.equal(selected,'captain');assert.equal(refreshes,2);assert.equal(g.rules.fightSequence,undefined);
  ui.dispatch('fight-pass');assert.equal(ui.view().options.stage,'first');
  assert.equal(ui.view().attackUnit,null);assert.match(ui.render(),/돌파 전투 선택/);
  ui.dispatch('fight-overrun');ui.dispatch('fight-skip');assert.equal(ui.view().options.canFinish,true);
  ui.dispatch('fight-finish');assert.ok(ui.view().done);assert.match(ui.render(),/근접전 완료/);
  assert.equal(ui.dispatch('dice'),false);assert.equal(ui.change('objective','home',true),false);
  g.rules.step=5;assert.equal(ui.render(),'');
});

test('selecting a normal fight exposes only that unit and waits for its declarations and hazards',()=>{
  const g=table([model('captain',0),model('warboss',2)]);g.rules.fightSequence=battle(g);
  g.pieces[0].name='</h3><script>&';
  const ui=createFightControls({getGame:()=>g,commit:s=>{g.rules=s;}});
  assert.ok(!ui.render().includes('<script>'));ui.dispatch('fight-normal');assert.equal(ui.view().attackUnit,'captain');
  g.rules.declaration={unit:'captain'};assert.throws(()=>ui.dispatch('fight-finish'));delete g.rules.declaration;
  markFinished(g,'captain');g.rules.hazard={unit:'captain',count:1};assert.match(ui.render(),/data-act="fight-finish" disabled/);
  delete g.rules.hazard;ui.dispatch('fight-finish');assert.deepEqual(ui.view().options.units,['warboss']);
});

const apply=(game,edit)=>({...game,rules:edit.rules,pieces:game.pieces.map(p=>({...p,...edit.poses?.[p.id]}))});
const pile={unit:'captain',mode:'pile-in',type:'pile-in',limit:3,targets:['warboss']};
test('fight drafts persist original poses, append routes, reject invalid edits, and commit atomically',()=>{
  const g=table([model('captain',0),model('warboss',5)],{captain:{charged:true}});
  assert.throws(()=>beginFightMove(g,{...pile,targets:['weirdboy']}));
  assert.throws(()=>beginFightMove(g,{...pile,limit:6}));
  let moving=apply(g,beginFightMove(g,pile));
  assert.ok(validateRulesState(moving.rules));
  assert.equal(validateRulesState({...moving.rules,fightSequence:{...moving.rules.fightSequence,stage:'done'}}),false);
  assert.equal(validateRulesState({...moving.rules,fightPlan:{...moving.rules.fightPlan,targets:['neutral-1']}}),false);
  assert.throws(()=>beginFightMove(moving,pile));assert.throws(()=>pass(moving,moving.rules.fightSequence));
  assert.throws(()=>proposeFightMove(moving,'warboss-1',{'warboss-1':[{x:4}]}));
  const midway=apply(moving,proposeFightMove(moving,'captain-1',{'captain-1':[{x:1.5}]}));
  assert.equal(g.pieces[0].x,0);
  assert.throws(()=>finishFightMove(midway),e=>codes(e.assessment).includes('must-engage'));
  moving=JSON.parse(JSON.stringify(midway));
  assert.deepEqual(moving.rules.fightPlan.origins['captain-1'],{x:0,z:0,yaw:0,elevation:0});
  assert.throws(()=>proposeFightMove(moving,'captain-1',{'captain-1':[{x:-1}]}),e=>codes(e.assessment).includes('distance'));
  const canceled=apply(moving,cancelFightMove(moving));assert.equal(canceled.pieces[0].x,0);assert.equal(canceled.rules.fightPlan,null);
  assert.deepEqual(canceled.rules.fightSequence,moving.rules.fightSequence);
  moving=apply(moving,proposeFightMove(moving,'captain-1',{'captain-1':[{x:2.5}]}));
  assert.equal(moving.rules.fightPlan.paths['captain-1'].length,2);
  const end=apply(moving,finishFightMove(moving));assert.equal(end.rules.fightPlan,null);assert.equal(end.pieces[0].x,2.5);
  assert.equal(end.rules.fightSequence.team,'orks');assert.deepEqual(end.rules.fightSequence.piled,['captain']);
  assert.ok(validFightSequence(end.rules.fightSequence));
});

test('draft includes attached leader/bodyguards and rejects drag or pivot of a model in base-contact',()=>{
  const g=table([model('captain',0),model('intercessor',-2),model('warboss',1)]);
  g.rules.attachments['captain-1']='intercessor';
  const moving=apply(g,beginFightMove(g,{...pile,unit:'intercessor'}));
  assert.deepEqual(Object.keys(moving.rules.fightPlan.origins),['captain-1','intercessor-1']);
  assert.throws(()=>proposeFightMove(moving,'captain-1',{'captain-1':[{yaw:.5}]}),e=>codes(e.assessment).includes('base-contact'));
  assert.equal(finishFightMove(moving).rules.fightSequence.team,'orks');
});
