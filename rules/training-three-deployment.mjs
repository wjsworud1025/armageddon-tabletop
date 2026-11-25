import {
  createTrainingThreeTable,validateTrainingThreeLayout,
} from '../data/training-three-layout.mjs';

import {handbookDeployment} from './handbook-deployment.mjs';

export const {create:createTrainingThreeDeployment,validate:validateTrainingThreeDeployment,
  pieces:trainingThreeDeploymentPieces,move:moveTrainingThreeDeployment}=
  handbookDeployment(3,createTrainingThreeTable(),validateTrainingThreeLayout);
