import {createTable} from './catalog.mjs';
import {
  trainingThreeMapPoint as toMap,trainingThreeWorldPoint as toWorld,
  trainingThreeSurfaceUV as surfaceUV,trainingThreePlan,trainingThreeWallSegments as wallVertices,
} from './training-three-layout.mjs';
import {measureFootprints} from '../ruler.mjs';
import {overlapsArea} from '../layouts.mjs';

export {toMap as trainingFourMapPoint,toWorld as trainingFourWorldPoint,
  surfaceUV as trainingFourSurfaceUV,wallVertices as trainingFourWallSegments};

// Page 73 uses the same physical print as page 67. These rectangles follow
// the outside edges of its five printed areas. They are measured in inches.
const landmarks=[
  ['ork-foundation','오크 대형 설비 받침',16.05,2.9,27.65,9.9,['largeRuin-2','smallRuin-2']],
  ['western-vent','왼쪽 환기구',6.975,7.025,13.025,8.975,[]],
  ['marine-foundation','마린 소형 설비 받침',.85,12.975,6.95,17.025,['smallRuin-3']],
  ['grot-foundation','그레친 소형 설비 받침',15.025,15.9,19.075,22,['smallRuin-1']],
  ['eastern-vent','오른쪽 환기구',22.1,14.975,28.1,16.925,[]],
];

export const trainingFourAreas=landmarks.map(([id,name,left,top,right,bottom,terrainIds])=>({
  id,name,terrainIds,
  polygon:[[left,top],[right,top],[right,bottom],[left,bottom]].map(([x,z])=>{
    const world=toWorld({x,z});
    return [world.x,world.z];
  }),
}));

const lowerLeft=[
  ['landSpeeder-1',3.1,15.18,-.85],['captain-1',5.59,15.95,2],
];
const intercessors=[
  ['intercessor-1',22.8,15.47],['intercessor-2',23.98,16.12],
  ['intercessor-3',25.14,15.48],['intercessor-4',26.26,16.27],['intercessor-5',27.48,15.77],
];
// Refit the page 67 infantry cluster to leave space for the right-hand trakk.
const orks=[
  ['warboss-1',18.45,7.78],
  ['boy-1',22.74,4.35],['boy-2',19.11,5.78],['boy-3',20.22,4.98],
  ['boy-4',21.34,5.81],['boy-5',23.02,5.90],['boy-6',22.30,7.06],
  ['boy-7',20.08,6.61],['boy-8',20.17,8.04],['boy-9',21.60,8.23],['boy-10',23.45,7.93],
  ['wartrakk-1',25.97,7.40,-.10],
];
const grots=trainingThreePlan.modelCenters.filter(([id])=>id.startsWith('gretchin-')).map(row=>[...row]);

export const trainingFourPlan={
  width:30,depth:22,panel:{...trainingThreePlan.panel},areas:trainingFourAreas,
  modelCenters:[...lowerLeft,...intercessors,...orks,...grots].map(([id,x,z])=>[id,x,z]),
  walls:trainingThreePlan.walls.map(w=>({...w,center:[...w.center],points:w.points.map(p=>[...p])})),
};

const vehicleHeadings=new Map([lowerLeft[0],orks.at(-1)].map(([id,,,yaw])=>[id,yaw]));
export function createTrainingFourTable(){
  const {width,depth,modelCenters,walls}=trainingFourPlan;
  const catalog=new Map(createTable().pieces.map(p=>[p.id,p]));
  const poses=modelCenters.map(([id,x,z])=>{
    const yaw=vehicleHeadings.get(id)??(catalog.get(id).faction==='marines'?2:2-Math.PI);
    return [id,x,z,yaw];
  });
  for(const {id,center:[x,z],yaw} of walls)poses.push([id,x,z,yaw]);
  const pieces=poses.map(([id,x,z,yaw])=>({
    ...catalog.get(id),...toWorld({x,z}),yaw,elevation:0,removed:false,
  }));
  return {width,depth,surface:'reverse',pieces};
}

const areaByKind={
  landSpeeder:'marine-foundation',captain:'marine-foundation',intercessor:'eastern-vent',
  warboss:'ork-foundation',boy:'ork-foundation',wartrakk:'ork-foundation',gretchin:'grot-foundation',
};

export function trainingFourDeploymentArea(piece){
  return trainingFourAreas.find(a=>piece?.faction==='terrain'?a.terrainIds.includes(piece.id):a.id===areaByKind[piece?.kind]);
}

function wallRibbons(wall){
  const points=wallVertices(wall);
  return points.slice(1).map((b,i)=>{
    const a=points[i],dx=b.x-a.x,dz=b.z-a.z;
    return {id:wall.id,faction:'terrain',x:(a.x+b.x)/2,z:(a.z+b.z)/2,
      yaw:-Math.atan2(dz,dx),baseWidth:Math.hypot(dx,dz),baseDepth:.2};
  });
}

// The shortest distance is zero both for touching rims and for intersecting
// interiors. Inset one footprint by a microscopic tolerance to distinguish them.
function overlapInterior(a,b){
  return measureFootprints({...a,baseWidth:a.baseWidth-.00001,baseDepth:a.baseDepth-.00001},b).horizontal<1e-7;
}

export function validateTrainingFourLayout(table){
  const {width,depth,modelCenters,walls}=trainingFourPlan;
  if(table?.width!==width||table.depth!==depth||table.surface!=='reverse'||!Array.isArray(table.pieces))return ['board'];
  const ids=new Set(table.pieces.map(p=>p?.id));
  const expected=[...modelCenters.map(([id])=>id),...walls.map(w=>w.id)];
  if(table.pieces.length!==expected.length||expected.some(id=>!ids.has(id)))return ['roster'];
  const stock=new Map(createTable().pieces.map(p=>[p.id,p])),issues=[],fighters=[],ribbons=[];
  const epsilon=1e-6;
  for(const p of table.pieces){
    const original=stock.get(p.id);
    if(p.kind!==original.kind||p.faction!==original.faction||p.baseWidth!==original.baseWidth||
      p.baseDepth!==original.baseDepth||p.elevation!==0||p.removed||![p.x,p.z,p.yaw].every(Number.isFinite)){
      issues.push('piece '+p.id);continue;
    }
    const c=Math.cos(p.yaw),s=Math.sin(p.yaw),w=p.baseWidth/2,d=p.baseDepth/2;
    const span=p.faction==='terrain'?(a,b)=>Math.abs(a)+Math.abs(b):Math.hypot;
    if(Math.abs(p.x)+span(c*w,s*d)>width/2+epsilon||Math.abs(p.z)+span(s*w,c*d)>depth/2+epsilon)
      issues.push('boundary '+p.id);
    const area=trainingFourDeploymentArea(p);
    if(!overlapsArea(p,area.polygon))issues.push('zone '+p.id);
    if(p.faction==='terrain')ribbons.push(...wallRibbons(p));
    else fighters.push(p);
  }
  // Check the solid wall arms only. The floor between arms is playable.
  for(const [i,p] of fighters.entries()){
    for(const other of fighters.slice(0,i))if(overlapInterior(p,other))
      issues.push('overlap '+p.id+' '+other.id);
    for(const wall of ribbons)if(overlapInterior(p,wall))
      issues.push('wall overlap '+p.id+' '+wall.id);
  }
  for(const [i,a] of ribbons.entries())for(const b of ribbons.slice(0,i))
    if(a.id!==b.id&&overlapInterior(a,b))issues.push('wall clash '+a.id+' '+b.id);
  return issues;
}
