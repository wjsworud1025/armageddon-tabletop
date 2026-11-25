import {currentHP,groupId,resolveHazard,roll} from './battle.mjs';
import {getProfile} from './profiles.mjs';
import {canCommandReroll,useCommandReroll} from './command-reroll.mjs';

function owner(state,pieces){
  return pieces.find(p=>getProfile(p)&&groupId(state,p)===state.hazard.unit&&currentHP(state,p)>0)?.faction;
}

// One hazard pool can include multiple weapons or every model making a
// desperate escape. No wounds or casualties are committed while it is open.
export function rollHazardPool(state,pieces,random=Math.random){
  const pending=state.hazard;
  if(!pending||pending.dice||pending.commandDice)return null;
  const team=owner(state,pieces);
  if(!canCommandReroll(state,pending.unit,team))return resolveHazard(state,pieces,null,random);
  const dice=Array.from({length:pending.count},()=>roll(6,random));
  return {state:{...state,hazard:{...pending,commandDice:dice}},dice,awaitingChoice:true,removed:{}};
}

export function finishHazardPool(state,pieces,index=null,random=Math.random){
  const pending=state.hazard;
  if(!pending?.commandDice)return null;
  const {commandDice,...hazard}=pending;
  let next=state,dice=commandDice;
  if(index!==null){
    const event={kind:'hazard',team:owner(state,pieces),unit:pending.unit,sides:6,dice};
    const paid=useCommandReroll(state,event,index,random);
    if(!paid)return null;
    next=paid.rules;dice=paid.dice;
  }
  return resolveHazard({...next,hazard},pieces,null,random,dice);
}
