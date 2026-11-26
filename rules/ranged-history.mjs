// Player turns, starting at 1 for the player who actually went first.
export const playerTurnNumber=s=>(s.round-1)*2+Number(s.active!==s.first)+1;

// A legacy save cannot establish that nobody fired earlier. A paid Overwatch
// receipt or a weapon slot marked used can also belong to a zero-attack packet.
export function recoverRangedHistory(state){
  if(!state||state.rangedHistory||!['playing','finished'].includes(state.status))return state;
  const turn=playerTurnNumber(state),w=state.overwatch,plan=state.declaration;
  // In Movement only the one Overwatch unit could have fired. An old paid
  // 'done' window no longer distinguishes a volley from a voluntary pass.
  const movementKnown=state.step===1&&(!w||w.unit===null||
    w.stage==='shoot'&&(!plan?.rows.some(r=>r.done)||typeof plan.didShoot==='boolean'));
  const last={};
  if(state.step===2||w?.stage==='shoot'){
    if(plan&&(plan.didShoot||plan.precisionRoll||plan.attackRoll?.records.some(r=>r.kind!=='attacks')))last[plan.unit]=turn;
  }
  const reaction=state.shootingReaction??state.reactionPlan;
  if(reaction)last[reaction.shooter]=turn;
  if(state.step===2||state.step===3){
    for(const [unit,order] of Object.entries(state.units??{})){
      if(order.hitTargets?.length)last[unit]=turn;
    }
  }
  return {...state,rangedHistory:{since:state.step===0||movementKnown?turn:turn+1,last}};
}

export function recordRangedAttack(state,unit){
  const restored=recoverRangedHistory(state),history=restored.rangedHistory;
  const turn=playerTurnNumber(state);
  if(history.last[unit]===turn)return restored;
  return {...restored,rangedHistory:{since:history.since,last:{...history.last,[unit]:turn}}};
}

// §13.09 checks the current and the preceding player turn, including the
// opponent’s turn when the firing unit used Overwatch.
export function rangedAttackHistory(state,unit){
  if(!state||!['playing','finished'].includes(state.status))return 'unknown';
  const {since,last}=recoverRangedHistory(state).rangedHistory;
  const oldest=Math.max(1,playerTurnNumber(state)-1);
  if((last[unit]??0)>=oldest)return 'fired';
  return since<=oldest?'clear':'unknown';
}
