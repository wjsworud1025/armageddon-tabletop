import {createTable} from './catalog.mjs';

// Map inches start at the upper left of the handbook diagram. World inches
// share its +X (right) and +Z (down) axes, with the origin at the mat centre.
export const trainingTwoPlan={
  width:30,depth:22,
  panel:{side:'right',surface:'reverse',counterclockwiseTurns:1},
  zones:{
    marines:{left:.95,right:7.0,top:13.0,bottom:17.0},
    orks:{left:16.0,right:27.6,top:3.0,bottom:10.0},
  },
  // The two named leaders can be identified. The order of the individual
  // infantry sculpts within each photographed cluster is a reconstruction.
  modelCenters:[
    ['captain-1',5.64,15.30],
    ['intercessor-1',2.04,14.62],['intercessor-2',3.46,14.16],
    ['intercessor-3',4.85,14.02],['intercessor-4',2.64,15.85],['intercessor-5',3.99,15.37],
    ['warboss-1',17.66,8.29],
    ['boy-2',19.18,6.68],['boy-3',20.19,5.78],['boy-4',21.59,6.23],
    ['boy-5',22.87,5.39],['boy-6',23.31,6.70],['boy-7',21.93,7.47],
    ['boy-8',20.33,7.49],['boy-9',19.68,8.65],['boy-10',21.18,8.83],
    ['boy-1',23.03,8.54], // 40 mm Nob fits without displacing any neighbour.
  ],
  // outer end, elbow, other end. The first leg is the long wall. Studio cast
  // numbers are unknown. Two corner variants stand in for the small Ls.
  walls:[
    {id:'largeRuin-2',points:[[21.7,3.2],[27.2,3.2],[27.2,6.0]],center:[24.930,4.965],yaw:Math.PI},
    {id:'smallRuin-2',points:[[5.0,16.9],[1.2,16.9],[1.2,15.7]],center:[1.95,15.74],yaw:Math.PI/2},
    {id:'smallRuin-3',points:[[18.8,17.8],[18.8,21.6],[17.5,21.6]],center:[17.70,20.59],yaw:Math.PI},
  ],
};

export function trainingTwoWorldPoint({x,z}){
  return {x:x-trainingTwoPlan.width/2,z:z-trainingTwoPlan.depth/2};
}

export function trainingTwoMapPoint({x,z}){
  return {x:x+trainingTwoPlan.width/2,z:z+trainingTwoPlan.depth/2};
}

// Coordinates within the existing full 44 x 30 back-face image. Both UV axes
// start at the top left in image space. A Three texture may invert image V.
export function trainingTwoSurfaceUV({x,z}){
  return {u:(44-z)/44,v:x/30};
}

export function createTrainingTwoTable(){
  const {width,depth,modelCenters,walls}=trainingTwoPlan;
  const catalog=new Map(createTable().pieces.map(p=>[p.id,p]));
  const pieces=modelCenters.map(([id,x,z])=>{
    const model=catalog.get(id);
    // The diagram does not specify model facing. Face both groups inward.
    const yaw=model.faction==='marines'?2.0:2.0-Math.PI;
    return {...model,...trainingTwoWorldPoint({x,z}),yaw,elevation:0,removed:false};
  });
  for(const {id,center:[x,z],yaw} of walls){
    const model=catalog.get(id);
    pieces.push({...model,...trainingTwoWorldPoint({x,z}),yaw,elevation:0,removed:false});
  }
  return {width,depth,surface:'reverse',pieces};
}

export function trainingTwoWallSegments(wall){
  const hw=wall.baseWidth/2,hd=wall.baseDepth/2;
  const co=Math.cos(wall.yaw),si=Math.sin(wall.yaw);
  let line=[[hw,-hd],[-hw,-hd],[-hw,hd]];
  if(wall.id==='largeRuin-2'&&!wall.previousSecondRuin)
    line=[[2.59,1.765],[-2.27,1.765],[-2.27,-2.11]];
  if(wall.id==='smallRuin-1'&&!wall.previousSmallRuin)
    line=[[-1.045,.599],[.526,-.340],[1.079,.529]];
  return line.map(([x,z])=>({
    x:wall.x+co*x+si*z,z:wall.z-si*x+co*z,
  }));
}

export function previousHandbookField(scenario,field,revision=1){
  const second=scenario===2;
  const center=second?{x:25.05,z:5.64}:{x:18.55,z:7.19};
  return {...field,handbookRevision:revision,pieces:field.pieces.map(p=>{
    if(scenario===4&&revision<=4&&p.id==='wartrakk-1')return {...p,previousWartrakkBanner:true};
    if(p.id==='largeRuin-2'&&revision===1)
      return {...p,...trainingTwoWorldPoint(center),yaw:second?-Math.PI/2:Math.PI/2,baseDepth:4.1,previousSecondRuin:true};
    if(p.id==='smallRuin-1'&&revision<=2)
      return {...p,...trainingTwoWorldPoint({x:16.05,z:18.25}),yaw:Math.PI/2,baseDepth:1.4,previousSmallRuin:true};
    return p;
  })};
}

export function handbookBaseDepth(table,piece){
  if(table.handbookRevision<=2&&piece.id==='smallRuin-1')return 1.4;
  return table.handbookRevision===1&&piece.id==='largeRuin-2'?4.1:piece.baseDepth;
}

function gapToSegment(p,a,b){
  const dx=b.x-a.x,dz=b.z-a.z;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));
  return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
}

// Validate an initial deployment, before any movement or casualties. Model
// bases must fit wholly in their printed areas. Wall ribbons alone obstruct
// placement; the rectangular floor between the two wall arms is playable.
export function validateTrainingTwoLayout(table){
  const {width,depth,zones,modelCenters,walls}=trainingTwoPlan;
  const faults=[];
  if(table?.width!==width||table.depth!==depth||table.surface!==trainingTwoPlan.panel.surface||!Array.isArray(table.pieces))return ['board'];
  const expected=[...modelCenters.map(([id])=>id),...walls.map(w=>w.id)];
  const catalog=new Map(createTable().pieces.map(p=>[p.id,p]));
  const ids=new Set(table.pieces.map(p=>p.id));
  if(ids.size!==expected.length||table.pieces.length!==expected.length||expected.some(id=>!ids.has(id)))return ['roster'];
  const fighters=[],segments=[];
  const epsilon=1e-7;
  for(const p of table.pieces){
    const model=catalog.get(p.id);
    if(p.removed||p.elevation!==0||p.faction!==model.faction||p.kind!==model.kind||
      p.baseWidth!==model.baseWidth||p.baseDepth!==handbookBaseDepth(table,model)||![p.x,p.z,p.yaw].every(Number.isFinite)){
      faults.push('piece '+p.id);continue;
    }
    if(p.faction==='terrain'){
      const [a,b,c]=trainingTwoWallSegments(p);
      const fourth={x:a.x+c.x-b.x,z:a.z+c.z-b.z};
      if([a,b,c,fourth].some(q=>Math.abs(q.x)>width/2+epsilon||Math.abs(q.z)>depth/2+epsilon))faults.push('boundary '+p.id);
      segments.push([a,b],[b,c]);
      continue;
    }
    const r=p.baseWidth/2,q=trainingTwoMapPoint(p),zone=zones[p.faction];
    if(q.x-r < -epsilon||q.x+r > width+epsilon||q.z-r < -epsilon||q.z+r > depth+epsilon)faults.push('boundary '+p.id);
    if(q.x-r < zone.left-epsilon||q.x+r > zone.right+epsilon||q.z-r < zone.top-epsilon||q.z+r > zone.bottom+epsilon)faults.push('zone '+p.id);
    for(const other of fighters){
      if(Math.hypot(p.x-other.x,p.z-other.z)<r+other.baseWidth/2-epsilon)faults.push('overlap '+p.id+' '+other.id);
    }
    fighters.push(p);
  }
  // A 0.2-inch wall ribbon represents the cast walls at ground level. Thickness is a
  // modelling allowance, independent of the photographed floor decoration.
  for(const p of fighters)if(segments.some(([a,b])=>gapToSegment(p,a,b)<p.baseWidth/2+.1-epsilon)){
    faults.push('wall overlap '+p.id);
  }
  return faults;
}
