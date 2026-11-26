import {createTable} from '../../data/catalog.mjs';
import {newBattle,startBattle,advance} from '../../rules/battle.mjs';
import {beginMove,proposeMove,finishMove} from '../../move-session.mjs';

export const heavyShooter='intercessor-3',heavyTarget='gretchin-1';

// One surviving rifle and one visible target remain on a flat, uncovered table.
// Start from Command so that new games record even the models which stand still.
export function heavyRifleBoard(mode){
  const game={...createTable(),layout:null,logs:[]};
  for(const p of game.pieces){
    p.removed=p.id!==heavyShooter&&p.id!==heavyTarget;
    if(!p.removed)Object.assign(p,{x:p.id===heavyShooter?-8:6,z:0,elevation:0,yaw:0});
  }
  const rules=startBattle(newBattle(),'marines',5);
  rules.cp.orks=0;
  rules.units.intercessor={shockChecked:true};
  game.rules=advance(rules,game.pieces);
  if(mode==='remain')return game;
  game.rules=beginMove(game,heavyShooter,'normal').rules;
  const mover=game.pieces.find(p=>p.id===heavyShooter);
  const move=proposeMove(game,mover,{[mover.id]:[{x:mode==='short'?-5:-4,z:0}]});
  game.rules=move.rules;
  Object.assign(mover,move.poses[mover.id]);
  if(mode==='short'||mode==='moving')return game;
  if(mode!=='legacy')throw new Error('Unknown Heavy fixture '+mode);
  game.rules=finishMove(game).rules;
  game.rules=advance(game.rules,game.pieces);
  // Earlier saves retain the normal-move order, but not each model's path length.
  delete game.rules.units.intercessor.heavyTravel;
  return game;
}
