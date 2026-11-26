import assert from 'node:assert/strict';
import {layoutGeometry} from '../layouts.mjs';
import {newBattle,startBattle} from '../rules/battle.mjs';
import {sightButton} from './browser-shooter-sight.mjs';

// Keep only the two combatants and the printed terrain on Patrol A.
// These coordinates place the target's base on the blue home ruin mat.
function homeRuin(save,side,overwatch,shooterX){
  const game=structuredClone(save),marine='intercessor-3',ork='boy-2';
  const [shooter,target]=side==='marines'?[marine,ork]:[ork,marine];
  const defending=side==='marines'?'orks':'marines';
  delete game.training;
  game.layout={map:'A',blue:defending};
  game.rules={...startBattle(newBattle(),overwatch?defending:side,5),step:overwatch?1:2,cp:{marines:2,orks:2}};
  const poses=new Map(layoutGeometry('A').terrain.map(p=>[p.id,p]));
  poses.set(shooter,{x:shooterX,z:-6.18,yaw:0});
  poses.set(target,{x:-15.46,z:-6.18,yaw:0});
  for(const piece of game.pieces){
    piece.removed=!poses.has(piece.id);
    if(!piece.removed)Object.assign(piece,poses.get(piece.id),{elevation:0});
  }
  return {game,shooter,target};
}

export async function checkDetection({save,upload,click,js,state,reload,screenshot}){
  const act=name=>'[data-act="'+name+'"]';
  async function choose(key,value){
    const selector=JSON.stringify('[data-field="'+key+'"]');
    const selected=await js(`(()=>{const el=document.querySelector(${selector});el.value=${JSON.stringify(value)};
      const val=el.value;el.dispatchEvent(new Event('change',{bubbles:true}));return val})()`);
    assert.equal(selected,value);
  }
  for(const [side,overwatch] of [['marines',false],['orks',true]]){
    for(const [x,expected] of [[3,'hidden'],[0,'manual'],[-3,'detected']]){
      const {game,shooter,target}=homeRuin(save,side,overwatch,x);
      await upload(game);await click('[data-tab=battle]');
      if(overwatch){
        await click(act('next'));await choose('overwatch-unit','boy-0');await click(act('overwatch-begin'));
      }
      await choose('fighter',shooter);await choose('weapon','0');await choose('target',target);
      const badge=JSON.stringify('[data-sight-row="'+shooter+'"] [data-detection-target="'+target+'"]');
      const decision=()=>js('document.querySelector('+badge+')?.dataset.detection');
      const canShoot=()=>js('!document.querySelector(\'[data-act="attack"]\').disabled');
      await click(sightButton(shooter,target,'blocked'));assert.equal(await canShoot(),false);
      await click(sightButton(shooter,target));
      assert.equal(await decision(),expected);
      if(expected==='manual')assert.equal(await js('document.querySelector('+badge+').dataset.detectionReason'),'gone-to-ground');
      assert.equal(await canShoot(),expected!=='hidden');
      if(expected!=='hidden'){
        await click(act('attack'));await click(act('lock'));
        assert.equal((await state()).rules.declaration.locked,true);
      }else{
        if(screenshot&&!overwatch){
          await js('document.querySelector('+badge+').scrollIntoView({block:"center"})');
          await screenshot('06-hidden-detection.png');
        }
        const saved=await state();
        await reload();await choose('fighter',shooter);await choose('weapon','0');await choose('target',target);
        assert.deepEqual(await state(),saved);
        assert.equal(await decision(),'hidden');
      }
    }
  }
  await upload(save);await click('[data-tab=roster]');
}
