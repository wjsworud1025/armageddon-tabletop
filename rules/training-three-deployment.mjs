import {
  createTrainingThreeTable,validateTrainingThreeLayout,
} from '../data/training-three-layout.mjs';

const table=createTrainingThreeTable();
const models=new Map(table.pieces.filter(p=>p.faction!=='terrain').map(p=>[p.id,p]));
const invalidState='훈련 3의 배치 기록을 확인하세요.';

export function createTrainingThreeDeployment(){
  return {version:1,scenario:3,phase:'deployment',positions:{}};
}

function record(value){
  if(value===null||typeof value!=='object')return false;
  const proto=Object.getPrototypeOf(value);
  return proto===Object.prototype||proto===null;
}

function validFormat(state){
  if(!record(state)||state.version!==1||state.scenario!==3||state.phase!=='deployment'||!record(state.positions))return false;
  return Object.entries(state.positions).every(([id,p])=>
    models.has(id)&&record(p)&&Object.keys(p).length===2&&
    Object.hasOwn(p,'x')&&Object.hasOwn(p,'z')&&Number.isFinite(p.x)&&Number.isFinite(p.z));
}

function piecesAt(positions){
  return table.pieces.map(base=>{
    const p={...base};
    if(Object.hasOwn(positions,p.id)){
      p.x=positions[p.id].x;
      p.z=positions[p.id].z;
    }
    return p;
  });
}

function layoutError(pieces){
  const [error]=validateTrainingThreeLayout({...table,pieces});
  if(!error)return '';
  if(error.startsWith('boundary '))return '베이스 전체를 전장 안에 놓으세요.';
  if(error.startsWith('zone '))return '베이스 전체를 이 부대의 인쇄된 배치 구역 안에 놓으세요.';
  if(error.startsWith('overlap '))return '다른 모델의 베이스와 겹칩니다.';
  if(error.startsWith('wall overlap '))return '폐허의 벽과 겹칩니다.';
  return invalidState;
}

export function validateTrainingThreeDeployment(state){
  return validFormat(state)&&!layoutError(piecesAt(state.positions));
}

// Produces a detached roster suitable for drawing or as the first battle
// position. Coordinates match the rest of the game: centre origin, inches.
export function trainingThreeDeploymentPieces(state){
  if(!validFormat(state))throw new Error(invalidState);
  const pieces=piecesAt(state.positions),error=layoutError(pieces);
  if(error)throw new Error(error);
  return pieces;
}

// Deployment places a base at a destination. There is no movement path or
// turn budget. The caller can checkpoint the returned state for undo/redo.
export function moveTrainingThreeDeployment(state,id,x,z){
  if(!validateTrainingThreeDeployment(state))throw new Error(invalidState);
  const base=models.get(id);
  if(!base)throw new Error('배치할 미니어처를 선택하세요. 지형은 고정되어 있습니다.');
  if(!Number.isFinite(x)||!Number.isFinite(z))throw new Error('유효한 전장 좌표를 지정하세요.');
  const old=state.positions[id]??base;
  if(old.x===x&&old.z===z)return state;
  const positions={...state.positions};
  if(x===base.x&&z===base.z)delete positions[id];
  else positions[id]={x,z};
  const error=layoutError(piecesAt(positions));
  if(error)throw new Error(error);
  return {...state,positions};
}
