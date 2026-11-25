import assert from 'node:assert/strict';
import test from 'node:test';
import {createTable} from '../data/catalog.mjs';
import {newBattle} from './battle.mjs';
import {actPatrolFormation,newPatrolFormations,validPatrolFormations} from './patrol-formations.mjs';
import {patrolFormationPanel} from './patrol-formations-ui.mjs';

const pieces=createTable().pieces;
const fresh=()=>({...newBattle(),formations:newPatrolFormations(),officialSetup:{stage:'formations'}});
const act=(rules,act,team,params={})=>actPatrolFormation(rules,pieces,{act:'form-'+act,team,...params});
const apply=(...args)=>act(...args).rules;
const save=state=>JSON.parse(JSON.stringify(state));
const render=state=>patrolFormationPanel(state,pieces);

test('Marine choices stay private across save, handoff and the second patrol’s preparations',()=>{
  const initial=fresh();
  assert.throws(()=>apply(initial,'lock','marines'),/강화/);
  assert.throws(()=>apply(initial,'attach','marines',{leader:'captain-1',unit:'intercessor'}),/합류/);
  let state=apply(initial,'attach','marines',{leader:'librarian-1',unit:'intercessor'});
  state=apply(state,'reserve','marines',{unit:'intercessor'});
  state=apply(state,'enhance','marines',{enhancement:'veterans'});
  state=apply(state,'enhance','marines',{enhancement:'blades'});
  assert.deepEqual(state.patrol,initial.patrol);
  assert.deepEqual(state.attachments,{});
  assert.deepEqual(state.reserves,{});
  assert.match(render(state),/예비대 · 1 \/ 2분대/);
  const handoff=act(state,'lock','marines');
  assert.equal(handoff.complete,false);
  assert.deepEqual(handoff.removed,{});
  state=save(handoff.rules);
  assert.equal(validPatrolFormations(state.formations),true);
  assert.doesNotMatch(render(state),/blades|인터세서|라이브러리안|워보스|form-reserve/);
  assert.throws(()=>apply(state,'reserve','marines',{unit:'landSpeeder'}),/넘겨/);
  state=apply(state,'open','orks');
  assert.doesNotMatch(render(state),/blades|인터세서|라이브러리안|marines/);
  assert.throws(()=>apply(state,'enhance','marines',{enhancement:'veterans'}),/진영/);
  assert.throws(()=>apply(state,'lock','orks'),/강화/);
  state=apply(state,'reserve','orks',{unit:'wartrakk'});
  state=apply(state,'enhance','orks',{enhancement:'armour'});
  assert.deepEqual(state.reserves,{});
  const result=act(save(state),'lock','orks');
  assert.equal(result.complete,true);
  assert.equal(validPatrolFormations(result.rules.formations),true);
  assert.deepEqual(result.rules.attachments,{'librarian-1':'intercessor'});
  assert.deepEqual(new Set(result.rules.reserves.intercessor),new Set(['librarian-1',...Array.from({length:5},(_,i)=>'intercessor-'+(i+1))]));
  assert.deepEqual(result.rules.reserves.wartrakk,['wartrakk-1']);
  assert.deepEqual(Object.keys(result.removed).sort(),Object.values(result.rules.reserves).flat().sort());
  assert.ok(Object.values(result.removed).every(v=>v===true));
  assert.deepEqual(result.rules.patrol.enhanced,{blades:true,armour:true});
  assert.match(render(save(result.rules)),/라이브러리안 → 인터세서/);
  assert.throws(()=>apply(result.rules,'lock','orks'),/편집/);
});

test('join and split use the same final unit count and full-model reserve groups as deployment',()=>{
  let s=apply(fresh(),'enhance','marines',{enhancement:'blades'});
  s=apply(apply(s,'lock','marines'),'open','orks');
  for(const unit of ['boy-0','boy-1','wartrakk'])s=apply(s,'reserve','orks',{unit});
  assert.match(render(s),/3 \/ 3분대/);
  assert.throws(()=>apply(s,'attach','orks',{leader:'warboss-1',unit:'boy-0'}),/한도/);
  s=apply(s,'reserve','orks',{unit:'wartrakk'});
  s=apply(s,'attach','orks',{leader:'warboss-1',unit:'boy-0'});
  assert.match(render(s),/2 \/ 2분대/);
  assert.throws(()=>apply(s,'attach','orks',{leader:'weirdboy-1',unit:'boy-0'}),/이미/);
  assert.throws(()=>apply(s,'reserve','orks',{unit:'warboss'}),/분대/);
  s=apply(s,'attach','orks',{leader:'warboss-1',unit:''});
  assert.deepEqual(new Set(s.formations.drafts.orks.reserves),new Set(['boy-0','boy-1','warboss']));
  s=apply(s,'attach','orks',{leader:'warboss-1',unit:'boy-0'});
  s=apply(s,'attach','orks',{leader:'weirdboy-1',unit:'boy-1'});
  s=apply(s,'enhance','orks',{enhancement:'warcry'});
  const result=act(s,'lock','orks');
  assert.equal(result.rules.reserves['boy-0'].length,11);
  assert.equal(result.rules.reserves['boy-1'].length,11);
  assert.equal(result.removed['warboss-1'],true);
  assert.equal(result.removed['weirdboy-1'],true);
  assert.equal(pieces.some(p=>p.removed),false);
});

test('private save validator rejects cross-side, impossible-order and corrupt declarations',()=>{
  const valid=newPatrolFormations();
  assert.equal(validPatrolFormations(save(valid)),true);
  const invalid=[
    f=>f.stage='revealed',f=>f.drafts.orks.enhancement='armour',
    f=>f.drafts.marines.enhancement='armour',f=>f.drafts.marines.enhancement='toString',
    f=>f.drafts.marines.attachments={'weirdboy-1':'boy-0'},f=>f.drafts.marines.reserves=['wartrakk'],
    f=>f.drafts.marines.reserves=['captain','captain'],f=>f.drafts.marines.reserves=['captain','librarian','vanguard'],
    f=>f.drafts.marines.attachments={'captain-1':'intercessor'},f=>f.drafts.marines.extra='oops',
    f=>f.drafts.marines.attachments=JSON.parse('{"__proto__":"intercessor"}'),
    f=>{f.stage='orks';f.drafts.marines.enhancement='veterans';f.drafts.orks.attachments={'warboss-1':'boy-0','weirdboy-1':'boy-0'};}
  ];
  for(const mutate of invalid){
    const f=save(valid);mutate(f);
    assert.equal(validPatrolFormations(f),false,JSON.stringify(f));
  }
  assert.throws(()=>apply({...fresh(),status:'playing'},'reserve','marines',{unit:'vanguard'}),/편집/);
});
