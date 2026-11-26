import {createTable} from '../../data/catalog.mjs';
import {applyLayout} from '../../layouts.mjs';
import {newBattle,startBattle} from '../../rules/battle.mjs';

// The destroyed Boy was last on the Marine home objective. No surviving
// phase-start member is near that objective, so returning him there would
// incorrectly give the Ork player 10 VP.
export const rallyCasualty='boy-2';
export const rallyReturnPose={x:-7.5,z:-.6,elevation:0,yaw:0};
export function rallyBoard(){
  const game={...createTable(),logs:[],rules:startBattle(newBattle(),'orks',5)};
  game.rules.round=4;game.rules.attachments={'warboss-1':'boy-0'};game.rules.patrol.enhanced.warcry=true;
  applyLayout(game,'A','marines');
  for(const p of game.pieces){
    if(p.faction==='terrain')continue;
    const alive=p.kind==='warboss'||p.kind==='captain'||(p.kind==='boy'&&p.variant<10&&p.id!==rallyCasualty);
    p.removed=!alive;
    if(!alive)game.rules.hp[p.id]=0;
    if(p.kind==='captain')Object.assign(p,{x:19,z:-13});
    if(p.id===rallyCasualty)Object.assign(p,{x:-18.3,z:-5.61});
  }
  game.pieces.filter(p=>p.faction==='orks'&&!p.removed).forEach((p,i)=>{
    Object.assign(p,{x:-7.5+(i%4)*1.90,z:-6+Math.floor(i/4)*1.85});
  });
  return game;
}
