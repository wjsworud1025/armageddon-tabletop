import {createTable} from '../../data/catalog.mjs';
import {newBattle,startBattle} from '../../rules/battle.mjs';
import {beginCharge,selectChargeTargets,proposeCharge} from '../../charge-session.mjs';

export function terrifyingChargeBoard(readyToFinish=false){
  const game={...createTable(),logs:[],rules:startBattle(newBattle(),'marines',5)};
  const positions={'captain-1':[0,0],'warboss-1':[6,1],'boy-2':[6.8,2.8],'weirdboy-1':[6,-1],'wartrakk-1':[13,-8]};
  game.rules.step=3;game.rules.cp.marines=2;game.rules.attachments={'warboss-1':'boy-0'};
  for(const p of game.pieces){
    const pos=positions[p.id];
    p.removed=!pos;
    if(pos)Object.assign(p,{x:pos[0],z:pos[1],yaw:0,elevation:0});
    else if(p.faction!=='terrain')game.rules.hp[p.id]=0;
  }
  if(readyToFinish){
    const captain=game.pieces.find(p=>p.id==='captain-1');
    game.rules=beginCharge(game,captain,{dice:[3,3]}).rules;
    game.rules=selectChargeTargets(game,['boy-0','weirdboy']).rules;
    const result=proposeCharge(game,captain,{[captain.id]:[{x:4.4,z:0}]});
    game.rules=result.rules;Object.assign(captain,result.poses[captain.id]);
  }
  return game;
}
