import {createTable} from '../../data/catalog.mjs';
import {layoutGeometry,layoutScenery} from '../../layouts.mjs';
import {newBattle,startBattle} from '../../rules/battle.mjs';

// At the edge of the blue home mat, the Warboss alone engages the Captain.
// The surviving Boy and the Captain contest it. The Warboss stands outside.
export function orkObjectiveBoard(){
  const game={...createTable(),layout:{map:'A',blue:'marines'},logs:[]};
  game.rules={...startBattle(newBattle(),'orks',5),round:4,
    attachments:{'warboss-1':'boy-0'},units:{'boy-0':{shockChecked:true,shocked:false}}};
  for(const [terrain,pose] of layoutScenery(game,layoutGeometry('A')))Object.assign(terrain,pose);
  const positions={'warboss-1':[-19,0],'boy-2':[-19,-3.5],'captain-1':[-16.5,-.5]};
  for(const p of game.pieces){
    if(p.faction==='terrain')continue;
    const at=positions[p.id];
    p.removed=!at;
    if(at)Object.assign(p,{x:at[0],z:at[1],elevation:0,yaw:0});
  }
  return game;
}
