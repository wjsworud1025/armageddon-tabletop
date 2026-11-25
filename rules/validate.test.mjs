import test from 'node:test';
import assert from 'node:assert/strict';
import {newBattle,startBattle} from './battle.mjs';
import {validateRulesState} from './validate.mjs';

test('empty tables, legacy wound ledgers and v1 battles survive import',()=>{
  for (const valid of [null,undefined,{hp:{'captain-1':6}},newBattle(),startBattle(newBattle(),'orks',20)])
    assert.equal(validateRulesState(valid),true);
});
test('rejects corrupt nested battle data before it can reach controls',()=>{
  const badChanges=[
    {round:'<b>1</b>'},{step:6},{vp:{marines:'2',orks:2}},{hp:{'captain-1':7}},
    {units:{boy:{charge:4}}},{units:{captain:{charge:'4'}}},{patrol:{usedDoctrines:'assault'}},
    {deployment:{defender:'orks',next:'orks',placed:'captain'}},
    {objectives:{'neutral-1':{marineOC:'5',orkOC:1,owner:'orks'}}},
    {patrol:{enhanced:JSON.parse('{"__proto__":true}')}},
    {units:{captain:{attacks:{'captain-1':{slot:'plasma'}}}}}
  ];
  for (const changes of badChanges) assert.equal(validateRulesState({...newBattle(),...changes}),false);
  for (const value of [true,'',[],{},42]) assert.equal(validateRulesState(value),false);
});
test('persists unrolled and partially allocated hazardous pools; rejects invalid phase, dice and remaining wounds',()=>{
  const active={...startBattle(newBattle(),'orks',5),step:2};
  const group={unit:'gretchin',count:3};
  for(const hazard of [group,{...group,dice:[1,2,6],remaining:2},null])
    assert.ok(validateRulesState({...active,hazard}));
  for(const hazard of [{...group,count:0},{...group,dice:[1,2],remaining:1},
    {...group,dice:[0,2,6],remaining:1},{...group,dice:[3,4,6],remaining:1},{...group,remaining:2}])
    assert.equal(validateRulesState({...active,hazard}),false);
  assert.equal(validateRulesState({...active,hazard:group,step:3}),false);
});
