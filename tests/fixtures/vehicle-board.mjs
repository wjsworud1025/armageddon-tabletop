import {createTable} from '../../data/catalog.mjs';
import {applyLayout} from '../../layouts.mjs';
import {newBattle,startBattle,advance} from '../../rules/battle.mjs';
import {beginMove,proposeMove} from '../../move-session.mjs';

export function relative(t,x,z,yaw=Math.PI){
  const c=Math.cos(t.yaw),s=Math.sin(t.yaw);
  return {x:t.x+c*x+s*z,z:t.z-s*x+c*z,yaw:(t.yaw+yaw)%(2*Math.PI),elevation:0};
}
export function vehicleMapA(){
  const g={...createTable(),logs:[],rules:startBattle(newBattle(),'marines',5)};
  applyLayout(g,'A','marines');g.rules=advance(g.rules,g.pieces);
  return g;
}
export function speederPivotDraft(){
  const game=vehicleMapA(),p=game.pieces.find(m=>m.id==='landSpeeder-1'),t=game.pieces.find(m=>m.id==='largeRuin-1');
  // Set the heading relative to the rotated map-A ruin: world 165°.
  Object.assign(p,relative(t,-4.75,-1.35,-Math.PI/12));
  game.rules=beginMove(game,p,'normal').rules;
  const result=proposeMove(game,p,{[p.id]:[relative(t,-4.05,0,-Math.PI/12)]});
  Object.assign(p,result.poses[p.id]);game.rules=result.rules;
  return game;
}
