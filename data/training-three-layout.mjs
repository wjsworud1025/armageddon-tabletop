import {createMapTable} from './catalog.mjs';
import {
  trainingTwoMapPoint as toMap,trainingTwoWorldPoint as toWorld,
  trainingTwoSurfaceUV as surfaceUV,trainingTwoWallSegments as cornerVertices,handbookBaseDepth,
} from './training-two-layout.mjs';

// Both handbook diagrams use the same physical panel and coordinate frames.
export {toMap as trainingThreeMapPoint,toWorld as trainingThreeWorldPoint,surfaceUV as trainingThreeSurfaceUV};

export const trainingThreePlan={
  width:30,depth:22,
  panel:{side:'right',surface:'reverse',counterclockwiseTurns:1},
  zones:{
    marines:{left:.95,right:7,top:13,bottom:17},
    orks:{left:16,right:27.6,top:3,bottom:10},
    gretchin:{left:15,right:19,top:16,bottom:22},
  },
  // Independent measurements from page 67, in inches from its upper left.
  modelCenters:[
    ['captain-1',5.64,15.52],
    ['intercessor-1',1.78,14.81],['intercessor-2',3.18,14.17],
    ['intercessor-3',4.65,14.07],['intercessor-4',2.41,16.19],['intercessor-5',3.78,15.64],
    ['warboss-1',18.82,7.52],
    ['boy-2',20.45,5.91],['boy-3',21.45,4.96],['boy-4',22.98,5.49],
    ['boy-1',24.18,4.46],['boy-5',24.58,5.98],['boy-6',23.38,6.71],
    ['boy-7',21.80,6.58],['boy-8',21.07,7.72],['boy-9',22.66,7.92],['boy-10',24.29,7.78],
    ['gretchin-1',16.61,17.24],['gretchin-2',17.59,17.98],['gretchin-3',16.68,18.49],
    ['gretchin-4',17.86,19.20],['gretchin-5',16.80,19.56],
  ],
  // points trace the diagram; center/yaw place an unscaled, rigid catalog cast.
  walls:[
    {id:'largeRuin-2',zone:'orks',points:[[22.10,9.55],[16.40,9.55],[16.40,6.80]],center:[18.670,7.785],yaw:0},
    {id:'smallRuin-2',zone:'orks',points:[[23.20,3.20],[27.15,3.20],[27.15,4.50]],center:[26.10,4.29],yaw:-Math.PI/2},
    {id:'smallRuin-3',zone:'marines',points:[[2.50,13.15],[6.70,13.15],[6.70,14.40]],center:[5.85,14.29],yaw:-Math.PI/2},
    {id:'smallRuin-1',zone:'gretchin',points:[[15.35,20.25],[15.35,16.25],[16.50,16.25]],center:[15.3633,16.8762],yaw:58.34*Math.PI/180},
  ],
};

export function createTrainingThreeTable(){
  const {width,depth,modelCenters,walls}=trainingThreePlan;
  const catalog=new Map(createMapTable().pieces.map(p=>[p.id,p]));
  const poses=modelCenters.map(([id,x,z])=>{
    const side=catalog.get(id).faction;
    return [id,x,z,side==='marines'?2:2-Math.PI];
  });
  for(const {id,center:[x,z],yaw} of walls)poses.push([id,x,z,yaw]);
  const pieces=poses.map(([id,x,z,yaw])=>({
    ...catalog.get(id),...toWorld({x,z}),yaw,elevation:0,removed:false,
  }));
  return {width,depth,surface:'reverse',handbookRevision:3,pieces};
}

// Consecutive vertices form the occupied wall segments in game coordinates.
// Earlier saves used the straight casting for the Gretchin's shrine.
export function trainingThreeWallSegments(wall){
  const vertices=cornerVertices(wall);
  return wall.id==='smallRuin-1'&&wall.previousSmallRuin?vertices.slice(0,2):vertices;
}

function distanceToSegment(p,a,b){
  const dx=b.x-a.x,dz=b.z-a.z;
  const t=Math.min(1,Math.max(0,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));
  return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
}

function wallGap(a,b,c,d){
  const side=(p,q,r)=>(q.x-p.x)*(r.z-p.z)-(q.z-p.z)*(r.x-p.x);
  if(side(a,b,c)*side(a,b,d)<0&&side(c,d,a)*side(c,d,b)<0)return 0;
  return Math.min(distanceToSegment(a,c,d),distanceToSegment(b,c,d),
    distanceToSegment(c,a,b),distanceToSegment(d,a,b));
}

const epsilon=1e-7;
function contains(zone,p,r=0){
  return p.x-r>=zone.left-epsilon&&p.x+r<=zone.right+epsilon&&
    p.z-r>=zone.top-epsilon&&p.z+r<=zone.bottom+epsilon;
}

export function validateTrainingThreeLayout(table){
  const {width,depth,zones,walls,modelCenters}=trainingThreePlan;
  if(table?.width!==width||table.depth!==depth||table.surface!=='reverse'||!Array.isArray(table.pieces))return ['board'];
  const wallZones=new Map(walls.map(w=>[w.id,zones[w.zone]]));
  const expected=[...modelCenters.map(([id])=>id),...wallZones.keys()];
  const ids=new Set(table.pieces.map(p=>p?.id));
  if(table.pieces.length!==expected.length||expected.some(id=>!ids.has(id)))return ['roster'];
  const stock=new Map(createMapTable().pieces.map(p=>[p.id,p]));
  const fighters=[],segments=[],errors=[];
  const board={left:0,right:width,top:0,bottom:depth};
  for(const p of table.pieces){
    const original=stock.get(p.id);
    if(p.removed||p.elevation!==0||p.kind!==original.kind||p.faction!==original.faction||
      p.baseWidth!==original.baseWidth||p.baseDepth!==handbookBaseDepth(table,original)||![p.x,p.z,p.yaw].every(Number.isFinite)){
      errors.push('piece '+p.id);continue;
    }
    if(wallZones.has(p.id)){
      const [a,b,c]=cornerVertices(p);
      const corners=[a,b,c,{x:a.x+c.x-b.x,z:a.z+c.z-b.z}].map(toMap);
      if(corners.some(q=>!contains(board,q)))errors.push('boundary '+p.id);
      if(corners.some(q=>!contains(wallZones.get(p.id),q)))errors.push('zone '+p.id);
      const edges=trainingThreeWallSegments(p);
      for(let i=1;i<edges.length;i++){
        const from=edges[i-1],to=edges[i];
        for(const previous of segments){
          if(previous.id!==p.id&&wallGap(from,to,previous.from,previous.to)<.2-epsilon)
            errors.push('wall clash '+p.id+' '+previous.id);
        }
        segments.push({id:p.id,from,to});
      }
    }else{
      const r=p.baseWidth/2,point=toMap(p);
      const zone=p.kind==='gretchin'?zones.gretchin:zones[p.faction];
      if(!contains(board,point,r))errors.push('boundary '+p.id);
      if(!contains(zone,point,r))errors.push('zone '+p.id);
      for(const other of fighters){
        if(Math.hypot(p.x-other.x,p.z-other.z)<r+other.baseWidth/2-epsilon)errors.push('overlap '+p.id+' '+other.id);
      }
      fighters.push(p);
    }
  }
  for(const p of fighters)if(segments.some(({from,to})=>distanceToSegment(p,from,to)<p.baseWidth/2+.1-epsilon)){
    errors.push('wall overlap '+p.id);
  }
  return errors;
}
