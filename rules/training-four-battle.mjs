import {createTrainingFourTable,validateTrainingFourLayout,trainingFourWallSegments,trainingFourAreas,trainingFourVehicleError} from '../data/training-four-layout.mjs';
import {handbookDeployment} from './handbook-deployment.mjs';
import {handbookBattleEngine} from './training-two.mjs';
import {newTrainingShooting,trainingShootingView,applyTrainingShooting} from './training-three-shooting.mjs';
import {newTrainingFourObjectives,trainingFourCommandView,applyTrainingFourCommand,trainingFourOutcome} from './training-four-objectives.mjs';

const field=createTrainingFourTable();
export const trainingFourDeployment=handbookDeployment(4,field,validateTrainingFourLayout);

export const trainingFourObjectivesView=(s,pieces)=>trainingFourCommandView(s,pieces,trainingFourAreas);
const engine=handbookBattleEngine({
  scenario:4,field,validateLayout:validateTrainingFourLayout,wallSegments:trainingFourWallSegments,endpointError:trainingFourVehicleError,
  names:{warboss:'워보스','boy-0':'보이',gretchin:'그레친',wartrakk:'워트랙',captain:'캡틴',intercessor:'인터세서',landSpeeder:'랜드 스피더'},
  shooting:{create:newTrainingShooting,view:trainingShootingView,apply:applyTrainingShooting},
  command:{create:newTrainingFourObjectives,view:trainingFourObjectivesView,outcome:trainingFourOutcome,
    apply:(s,pieces,a,d6)=>applyTrainingFourCommand(s,pieces,trainingFourAreas,a,d6)},
});

export const trainingFourBattle={
  ...engine,create:deployment=>engine.create({...field,handbookRevision:deployment.version,pieces:trainingFourDeployment.pieces(deployment)}),
};
