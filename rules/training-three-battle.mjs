import {createTrainingThreeTable,trainingThreeWallSegments,validateTrainingThreeLayout} from '../data/training-three-layout.mjs';
import {trainingThreeDeploymentPieces} from './training-three-deployment.mjs';
import {newTrainingShooting,trainingShootingView,applyTrainingShooting} from './training-three-shooting.mjs';
import {handbookBattleEngine} from './training-two.mjs';

const field=createTrainingThreeTable();
const engine=handbookBattleEngine({
  scenario:3,field,validateLayout:validateTrainingThreeLayout,wallSegments:trainingThreeWallSegments,
  names:{warboss:'워보스','boy-0':'보이',gretchin:'그레친',captain:'캡틴',intercessor:'인터세서'},
  shooting:{create:newTrainingShooting,view:trainingShootingView,apply:applyTrainingShooting},
});

export function createTrainingThreeBattle(deployment){
  return engine.create({...field,handbookRevision:deployment.version,pieces:trainingThreeDeploymentPieces(deployment)});
}

export const {
  act:actTrainingThreeBattle,view:trainingThreeBattleView,pieces:trainingThreeBattlePieces,
  validate:validateTrainingThreeBattle,
}=engine;
