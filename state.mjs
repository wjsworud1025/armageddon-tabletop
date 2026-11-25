import {validateRulesState} from './rules/validate.mjs';
import {measureFootprints} from './ruler.mjs';
import {validateTrainingOne} from './rules/training-one.mjs';
import {validateTrainingTwo} from './rules/training-two.mjs';
import {validateTrainingThreeDeployment} from './rules/training-three-deployment.mjs';
import {validateTrainingThreeBattle} from './rules/training-three-battle.mjs';
import {trainingFourBattle,trainingFourDeployment} from './rules/training-four-battle.mjs';

const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const finite = Number.isFinite;

// Radius of the base projected onto a horizontal axis.
function support(piece, nx, nz) {
  const yaw = piece.yaw || 0;
  const u = (nx * Math.cos(yaw) - nz * Math.sin(yaw)) * piece.baseWidth / 2;
  const v = (nx * Math.sin(yaw) + nz * Math.cos(yaw)) * piece.baseDepth / 2;
  return piece.faction === 'terrain' ? Math.abs(u) + Math.abs(v) : Math.hypot(u, v);
}

export function baseDistance(a, b) {
  return measureFootprints(a,b).horizontal;
}

export function place(piece, x, z, board) {
  const rx = support(piece,1,0), rz = support(piece,0,1);
  piece.x = clamp(x, -board.width/2+rx, board.width/2-rx);
  piece.z = clamp(z, -board.depth/2+rz, board.depth/2-rz);
}

// Clamp one common translation against all bases to keep a formation rigid.
export function translateFormation(records, dx, dz, board) {
  let minX=-Infinity,maxX=Infinity,minZ=-Infinity,maxZ=Infinity;
  for(const {piece,x,z} of records){
    const rx=support(piece,1,0),rz=support(piece,0,1);
    minX=Math.max(minX,-board.width/2+rx-x);maxX=Math.min(maxX,board.width/2-rx-x);
    minZ=Math.max(minZ,-board.depth/2+rz-z);maxZ=Math.min(maxZ,board.depth/2-rz-z);
  }
  dx=clamp(dx,minX,maxX);dz=clamp(dz,minZ,maxZ);
  for(const item of records){item.piece.x=item.x+dx;item.piece.z=item.z+dz}
  return Math.hypot(dx,dz);
}

export function snapshot(game) {
  return {version:1, pieces:game.pieces.map(({id,x,z,yaw,removed,elevation}) =>
    ({id,x,z,yaw,removed:!!removed,elevation:elevation||0})), rules:structuredClone(game.rules),
    logs:[...game.logs], layout:game.layout?{...game.layout}:null,surface:game.surface||'front',
    ...(game.training?{training:structuredClone(game.training)}:{})};
}

export function restore(template, save) {
  if (save?.version !== 1 || !Array.isArray(save.pieces) || save.pieces.length !== template.pieces.length)
    throw new Error('이 스타터 세트의 저장 파일이 아닙니다.');
  if(!validateRulesState(save.rules,save.pieces))throw new Error('저장 파일의 대전 규칙 데이터가 올바르지 않습니다.');
  if(save.training!=null){
    const validators={1:validateTrainingOne,2:validateTrainingTwo,
      3:save.training.phase==='deployment'?validateTrainingThreeDeployment:validateTrainingThreeBattle,
      4:save.training.phase==='deployment'?trainingFourDeployment.validate:trainingFourBattle.validate};
    const titles={1:'첫',2:'두 번째',3:'세 번째',4:'네 번째'};
    const scenario=save.training.scenario;
    if(!Number.isInteger(scenario)||!validators[scenario]?.(save.training))
      throw new Error((titles[scenario]??'선택한')+' 훈련 임무의 저장 기록이 올바르지 않습니다.');
  }
  const records = new Map(save.pieces.map(p => [p.id,p]));
  const game = structuredClone(template);
  for (const piece of game.pieces) {
    const record = records.get(piece.id);
    if (!record || ![record.x,record.z,record.yaw,record.elevation??0].every(finite))
      throw new Error('미니어처 배치 데이터가 손상되었습니다.');
    piece.yaw = record.yaw % (Math.PI*2);
    piece.removed = !!record.removed;
    if(piece.removed&&Object.hasOwn(save.rules?.reinforcePlan?.origins??{},piece.id))
      throw new Error('배치 중인 예비대 모델이 저장된 전장에 없습니다.');
    piece.elevation = clamp(record.elevation??0,0,20);
    place(piece,record.x,record.z,game);
  }
  game.rules = save.rules && typeof save.rules === 'object' ? structuredClone(save.rules) : null;
  if(save.training)game.training=structuredClone(save.training);
  game.logs = Array.isArray(save.logs) ? save.logs.filter(s=>typeof s==='string').slice(-100) : [];
  game.surface = ['left','right','reverse'].includes(save.surface) ? save.surface : 'front';
  game.layout = ['A','B','C'].includes(save.layout?.map)&&['marines','orks'].includes(save.layout?.blue)?{map:save.layout.map,blue:save.layout.blue}:null;
  return game;
}
