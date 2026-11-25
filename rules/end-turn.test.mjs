import test from 'node:test';
import assert from 'node:assert/strict';
import {startBattle,newBattle} from './battle.mjs';
import {brokenFormations,removeForCoherency} from './end-turn.mjs';

test('both controllers can remove one model at a time before end-of-turn scoring',()=>{
  const rules={...startBattle(newBattle(),'marines',5),step:5,attachments:{'librarian-1':'intercessor'}};
  const model=(kind,n,x,faction)=>({id:kind+'-'+n,name:kind,kind,variant:n-1,faction,x,z:0,baseWidth:1,baseDepth:1,elevation:0});
  const pieces=[model('intercessor',1,0,'marines'),model('librarian',1,12,'marines'),model('boy',1,3,'orks'),model('boy',2,7,'orks')];
  assert.equal(brokenFormations(rules,pieces).length,2);
  assert.equal(brokenFormations({...rules,step:4},pieces).length,0);
  const first=removeForCoherency(rules,pieces,'boy-1');
  assert.deepEqual(first.removed,{'boy-1':true});
  assert.equal(removeForCoherency(first.rules,pieces,'boy-2'),null);
  const second=removeForCoherency(first.rules,pieces,'librarian-1');
  assert.equal(brokenFormations(second.rules,pieces).length,0);
  assert.deepEqual(rules.hp,{});
});
