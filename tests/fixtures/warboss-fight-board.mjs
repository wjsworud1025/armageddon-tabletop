import {createTable} from '../../data/catalog.mjs';
import {newBattle,startBattle} from '../../rules/battle.mjs';

export function warbossFightBoard(){
  const game={...createTable(),logs:[],rules:startBattle(newBattle(),'orks',5)};
  Object.assign(game.rules,{step:4,attachments:{'warboss-1':'boy-0'},
    units:{'boy-0':{charged:true},'boy-1':{charged:true}}});
  const positions={'warboss-1':[0,0],'boy-2':[0,2],'boy-12':[0,-2],'captain-1':[2,0],'librarian-1':[-2,0]};
  for(const piece of game.pieces){
    const at=positions[piece.id];
    piece.removed=!at;
    if(at)Object.assign(piece,{x:at[0],z:at[1],yaw:0,elevation:0});
  }
  return game;
}
