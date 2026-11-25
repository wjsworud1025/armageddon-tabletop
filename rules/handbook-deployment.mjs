export const handbookTurn=Math.PI/12;

// Keep the printed facing as the reference so that 24 clicks return exactly
// to the original pose (and the default position need not be saved).
export function handbookFacing(origin,yaw){
  if(!Number.isFinite(origin)||!Number.isFinite(yaw))return null;
  const turns=(yaw-origin)/handbookTurn,n=Math.round(turns);
  if(!Number.isSafeInteger(n)||Math.abs(n-turns)>1e-7)return null;
  return origin+(((n%24+36)%24)-12)*handbookTurn;
}

export function handbookDeployment(scenario,table,validateLayout){
  const models=new Map(table.pieces.filter(p=>p.faction!=='terrain').map(p=>[p.id,p]));
  const invalidState='훈련 '+scenario+'의 배치 기록을 확인하세요.';

  function create(){
    return {version:1,scenario,phase:'deployment',positions:{}};
  }

  function record(value){
    if(value===null||typeof value!=='object')return false;
    const proto=Object.getPrototypeOf(value);
    return proto===Object.prototype||proto===null;
  }

  function validFormat(state){
    if(!record(state)||state.version!==1||state.scenario!==scenario||state.phase!=='deployment'||!record(state.positions))return false;
    return Object.entries(state.positions).every(([id,p])=>{
      if(!models.has(id)||!record(p)||!Object.hasOwn(p,'x')||!Object.hasOwn(p,'z')||
         !Number.isFinite(p.x)||!Number.isFinite(p.z))return false;
      if(!Object.hasOwn(p,'yaw'))return Object.keys(p).length===2;
      return scenario===4&&Object.keys(p).length===3&&handbookFacing(models.get(id).yaw,p.yaw)!==null;
    });
  }

  function piecesAt(positions){
    return table.pieces.map(base=>{
      const p={...base};
      if(Object.hasOwn(positions,p.id)){
        p.x=positions[p.id].x;
        p.z=positions[p.id].z;
        if(Object.hasOwn(positions[p.id],'yaw'))p.yaw=handbookFacing(base.yaw,positions[p.id].yaw);
      }
      return p;
    });
  }

  function layoutError(pieces){
    const [error]=validateLayout({...table,pieces});
    if(!error)return '';
    if(error.startsWith('boundary '))return '베이스 전체를 전장 안에 놓으세요.';
    if(error.startsWith('zone '))return '이 부대의 인쇄된 배치 구역 안에 놓으세요.';
    if(error.startsWith('overlap '))return '다른 모델의 베이스와 겹칩니다.';
    if(error.startsWith('wall overlap '))return '폐허의 벽과 겹칩니다.';
    return invalidState;
  }

  function validate(state){
    return validFormat(state)&&!layoutError(piecesAt(state.positions));
  }

  // Produces a detached roster suitable for drawing or as the first battle
  // position. Coordinates match the rest of the game: centre origin, inches.
  function pieces(state){
    if(!validFormat(state))throw new Error(invalidState);
    const pieces=piecesAt(state.positions),error=layoutError(pieces);
    if(error)throw new Error(error);
    return pieces;
  }

  // Deployment places a base at a destination. There is no movement path or
  // turn budget. The caller can checkpoint the returned state for undo/redo.
  function move(state,id,x,z,yaw){
    if(!validate(state))throw new Error(invalidState);
    const base=models.get(id);
    if(!base)throw new Error('배치할 미니어처를 선택하세요. 지형은 고정되어 있습니다.');
    if(!Number.isFinite(x)||!Number.isFinite(z))throw new Error('유효한 전장 좌표를 지정하세요.');
    const old=state.positions[id]??base;
    if(yaw!==undefined&&scenario!==4)throw new Error('이 훈련에서는 인쇄된 배치 방향을 사용합니다.');
    const oldYaw=old.yaw??base.yaw;
    const facing=handbookFacing(base.yaw,yaw===undefined?oldYaw:yaw);
    if(facing===null)throw new Error('15° 단위의 유효한 배치 방향을 선택하세요.');
    if(old.x===x&&old.z===z&&oldYaw===facing)return state;
    const positions={...state.positions};
    if(x===base.x&&z===base.z&&facing===base.yaw)delete positions[id];
    else positions[id]=facing===base.yaw?{x,z}:{x,z,yaw:facing};
    const error=layoutError(piecesAt(positions));
    if(error)throw new Error(error);
    return {...state,positions};
  }
  return {create,validate,pieces,move};
}
