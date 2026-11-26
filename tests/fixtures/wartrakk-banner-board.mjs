import {createTable} from '../../data/catalog.mjs';
import {applyLayout} from '../../layouts.mjs';
import {newBattle,startBattle,advance} from '../../rules/battle.mjs';
import {beginMove,proposeMove} from '../../move-session.mjs';
import {relative} from './vehicle-board.mjs';

// The entire printed B table is in play. No infantry, terrain, attack
// profile or movement limit is removed to isolate the flag.
export function wartrakkBannerDraft(){
  const game={...createTable(),logs:[],rules:startBattle(newBattle(),'orks',5)};
  applyLayout(game,'B','orks');game.rules=advance(game.rules,game.pieces);
  const trakk=game.pieces.find(p=>p.id==='wartrakk-1'),wall=game.pieces.find(p=>p.id==='largeRuin-1');
  Object.assign(trakk,relative(wall,-1.8,4.7,0));
  game.rules=beginMove(game,trakk,'normal').rules;
  const step=proposeMove(game,trakk,{[trakk.id]:[relative(wall,-1.8,4.1,0)]});
  Object.assign(trakk,step.poses[trakk.id]);game.rules=step.rules;
  return game;
}
