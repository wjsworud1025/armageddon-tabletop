import {groupId} from './rules/battle.mjs';
import {patrolTerrainAreas} from './data/patrol-terrain-areas.mjs';

// Board edges in the 1535 x 1961 reference diagrams. Rotate the portrait sheet
// onto the long horizontal axis of the digital table.
const world=([u,v])=>[(v-154)*44/(1808-154)-22,15-(u-203)*30/(1332-203)];
const points=s=>s.split(' ').map(pair=>world(pair.split(',').map(Number)));
const shape=(id,side,s)=>({id,side,polygon:points(s)});
const layouts={
  A:{
    zone:'768,154 1332,154 1332,568 768,568',
    areas:[
      shape('blue-home','blue','805,269 856,269 871,258 885,259 893,252 919,247 930,253 941,269 970,269 992,262 1024,267 1066,252 1092,258 1112,269 1238,269 1238,531 805,531'),
      shape('red-home','red','298,1431 730,1431 730,1694 680,1694 662,1706 647,1704 620,1715 604,1713 595,1695 563,1694 543,1703 508,1697 471,1710 451,1706 426,1694 298,1694'),
      shape('neutral-1',null,'242,680 468,680 468,720 480,734 488,750 482,766 484,777 468,795 468,829 372,829 354,836 341,833 325,842 308,839 289,837 285,829 242,829'),
      shape('neutral-2',null,'1067,1132 1158,1132 1179,1124 1194,1125 1211,1118 1237,1122 1247,1132 1292,1132 1292,1281 1067,1281 1067,1248 1051,1232 1047,1215 1053,1196 1050,1185 1067,1165')],
    positions:[[933,454,0],[600,1505,180],[348,776,180],[1130,1203,90],[1200,301,0],[1200,496,90],[341,1465,180],[342,1662,270],[850,861,0],[693.5,1099,0],[1137,754,90],[391,1208,90],[575,453,90],[966,1505,90]]
  },
  B:{
    zone:'203,154 1332,154 1332,757',
    areas:[
      shape('blue-home','blue','410,305 842,305 842,568 781,568 762,575 739,573 722,590 707,589 696,572 676,569 651,574 623,567 584,586 562,580 539,568 410,568'),
      shape('red-home','red','692,1394 736,1394 763,1381 784,1381 805,1371 823,1376 831,1394 861,1394 877,1387 904,1392 947,1377 977,1383 995,1394 1126,1394 1126,1656 692,1656'),
      shape('neutral-1',null,'242,1019 467,1019 467,1056 482,1072 486,1091 477,1112 466,1136 466,1168 374,1168 351,1176 339,1173 322,1182 306,1179 293,1176 286,1168 242,1168'),
      shape('neutral-2',null,'1067,794 1160,794 1180,786 1196,787 1212,780 1236,783 1246,794 1293,794 1293,943 1067,943 1067,903 1051,887 1047,870 1052,853 1050,843 1067,827')],
    positions:[[539,496,0],[1010,1465,180],[473,1471,180],[1071,518,0],[798,347,0],[798,530,90],[738,1430,180],[739,1623,270],[353,1090,90],[1187,871,90],[574,754,90],[959,1207,90],[652,1060,0],[880,907,0]]
  },
  C:{
    zone:'768,154 1332,154 1332,981 768,568',
    areas:[
      shape('blue-home','blue','993,232 1255,232 1255,665 993,665 993,617 981,600 982,589 973,573 980,553 973,547 993,532 993,502 985,480 993,448 977,407 980,390 993,361'),
      shape('red-home','red','279,1300 542,1300 542,1347 555,1368 548,1389 554,1401 543,1427 543,1456 550,1475 543,1509 560,1548 555,1573 543,1594 543,1733 279,1733'),
      shape('neutral-1',null,'279,567 429,567 429,793 391,793 374,804 355,810 341,805 324,806 306,793 279,793 279,698 273,681 273,664 265,648 271,622 279,611'),
      shape('neutral-2',null,'1108,1168 1150,1168 1166,1154 1186,1147 1202,1154 1214,1151 1233,1168 1257,1168 1257,1258 1266,1278 1264,1294 1273,1311 1267,1335 1257,1348 1257,1394 1108,1394')],
    positions:[[1171,561,90],[339,1424,270],[1187,1260,180],[362,717,0],[1034,281,180],[1222,268,0],[314,1680,270],[491,1705,90],[767,1319,90],[770,642,90],[545,377,90],[994,1582,90],[646,940,90],[908,1015,90]]
  }
};
const ids=['largeRuin-1','largeRuin-2','largeRuin-3','largeRuin-4', 'smallRuin-1','smallRuin-2','smallRuin-3','smallRuin-4','generatorShrine-1','capacitorStack-1','barricade-1','barricade-2','pylon-1','pylon-2'];
// Earlier official-setup saves recorded all three industrial pieces. Keep
// their original positions and headings when resuming those tables.
const originalPlants={
  A:{'shockArray-1':[845,860,0],'capacitorStack-1':[697,1097,0],'generatorShrine-1':[671,1097,0]},
  B:{'shockArray-1':[355,1092,90],'capacitorStack-1':[1177,854,90],'generatorShrine-1':[1177,905,90]},
  C:{'shockArray-1':[766,1323,90],'capacitorStack-1':[768,622,90],'generatorShrine-1':[769,679,90]}
};
const terrainAreas=Object.fromEntries(Object.entries(layouts).map(([code,data])=>[code,patrolTerrainAreas(code,data.areas,world)]));
export function layoutGeometry(code,version=2){
  const data=layouts[code];if(!data)return null;
  const blue=points(data.zone),red=blue.map(([x,z])=>[-x,-z]);
  const positions=Object.fromEntries(ids.map((id,i)=>[id,data.positions[i]]));
  if(version===1)Object.assign(positions,originalPlants[code]);
  return {blue,red,areas:data.areas,terrainAreas:terrainAreas[code],terrain:Object.entries(positions).map(([id,[u,v,deg]])=>{
    const [x,z]=world([u,v]);return {id,x,z,yaw:deg*Math.PI/180}
  })};
}
export function layoutScenery(game,geo){
  const poses=new Map(geo.terrain.map(at=>[at.id,at]));
  return game.pieces.filter(p=>p.faction==='terrain').map(p=>{
    const at=poses.get(p.id);
    return [p,at?{...at,elevation:0,removed:false}:{removed:true}];
  });
}
function inside(x,z,poly){
  let odd=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const [a,b]=poly[i],[c,d]=poly[j];
    if((b>z)!==(d>z)&&x<(c-a)*(z-b)/(d-b)+a)odd=!odd;
  }
  return odd;
}
// Transform each terrain-area edge into the base's local unit circle. This
// accounts for partial overlap, elliptical vehicle bases, and irregular edges.
export function overlapsArea(p,poly){
  if(inside(p.x,p.z,poly))return true;
  const c=Math.cos(p.yaw),s=Math.sin(p.yaw);
  const local=poly.map(([x,z])=>{x-=p.x;z-=p.z;return [(c*x-s*z)*2/p.baseWidth,(s*x+c*z)*2/p.baseDepth]});
  return local.some(([x,z],i)=>{
    const [a,b]=local[(i+1)%local.length],dx=a-x,dz=b-z;
    const t=Math.min(1,Math.max(0,-(x*dx+z*dz)/(dx*dx+dz*dz||1)));
    return (x+t*dx)**2+(z+t*dz)**2<=1.000001;
  });
}
export function objectiveFootprints(game){
  const areas=layouts[game.layout?.map]?.areas??[];
  return areas.map((area,i)=>({...area,name:['청색 진영 본진','적색 진영 본진','중립 거점 1','중립 거점 2'][i]}));
}
export function objectiveAreas(game){
  return objectiveFootprints(game).map(({id,name,side,polygon})=>({id,name,
    home:side==='blue'?game.layout.blue:side==='red'?(game.layout.blue==='marines'?'orks':'marines'):null,
    members:game.pieces.filter(p=>p.faction!=='terrain'&&!p.removed&&overlapsArea(p,polygon)).map(p=>p.id)}));
}
function fitsZone(p,zone,margin=0){
  if(!inside(p.x,p.z,zone))return false;
  // Exact support of the rotated ellipse against each convex half plane.
  const c=Math.cos(p.yaw),s=Math.sin(p.yaw);
  return zone.every(([a,b],i)=>{
    const [x,z]=zone[(i+1)%zone.length],dx=x-a,dz=z-b;
    const support=Math.hypot((dz*c+dx*s)*p.baseWidth/2,(dz*s-dx*c)*p.baseDepth/2);
    return Math.abs(dz*(p.x-a)-dx*(p.z-b))>=support+margin-1e-8;
  });
}
export function validDeployment(game,p){
  const geo=layoutGeometry(game.layout?.map);return !!geo&&fitsZone(p,p.faction===game.layout.blue?geo.blue:geo.red);
}
// The preset rotates troops and terrain in quarter turns. Circular infantry
// use exact gaps, while vehicles keep a conservative rectangular clearance.
const separation=.075;
function footprint(p){
  const sideways=Math.abs(Math.sin(p.yaw))>.5;
  return {x:p.x,z:p.z,rx:(sideways?p.baseDepth:p.baseWidth)/2,rz:(sideways?p.baseWidth:p.baseDepth)/2,
    circle:p.faction!=='terrain'&&p.baseWidth===p.baseDepth};
}
function clear(a,b){
  const dx=Math.abs(a.x-b.x),dz=Math.abs(a.z-b.z);
  if(dx>=a.rx+b.rx+separation||dz>=a.rz+b.rz+separation)return true;
  if(a.circle&&b.circle)return dx*dx+dz*dz>=(a.rx+b.rx+separation)**2;
  if(!a.circle&&!b.circle)return false;
  const rect=a.circle?b:a,r=a.circle?a.rx:b.rx;
  return Math.max(0,dx-rect.rx)**2+Math.max(0,dz-rect.rz)**2>=(r+separation)**2;
}
function formationFits(candidate,placed){
  if(!placed.length)return true;
  let neighbour=false;
  // Every multi-model starter unit has circular bases, including its leader.
  for(const other of placed){
    const d=(candidate.x-other.x)**2+(candidate.z-other.z)**2;
    const radii=candidate.rx+other.rx;
    if(d>(radii+9)**2)return false;
    if(d<=(radii+2)**2)neighbour=true;
  }
  return neighbour;
}
function arrange(team,zone,yaw,terrain,rules){
  const groups=new Map(),spots=new Map();
  const xs=zone.map(v=>v[0]),zs=zone.map(v=>v[1]);
  const left=Math.min(...xs),right=Math.max(...xs),bottom=Math.min(...zs),top=Math.max(...zs);
  for(const p of team){
    const key=groupId(rules,p);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(p);
    const size=p.baseWidth+'/'+p.baseDepth;
    if(spots.has(size))continue;
    const choices=[];
    for(let row=0,z=bottom+.2;z<top;row++,z+=.34){
      for(let x=left+.2+(row%2)*.17;x<right;x+=.34){
        const pose={...p,x,z,yaw},q=footprint(pose);
        if(fitsZone(pose,zone,.02)&&terrain.every(o=>clear(q,o)))choices.push(q);
      }
    }
    spots.set(size,choices);
  }
  const area=p=>p.baseWidth*p.baseDepth;
  const units=[...groups.values()].map(g=>g.sort((a,b)=>area(b)-area(a)||a.id.localeCompare(b.id)));
  units.sort((a,b)=>Number(b[0].baseDepth!==b[0].baseWidth)-Number(a[0].baseDepth!==a[0].baseWidth)||
    b.reduce((n,p)=>n+area(p),0)-a.reduce((n,p)=>n+area(p),0)||a[0].id.localeCompare(b[0].id));
  for(const [sx,sz] of [[1,1],[-1,-1],[1,-1],[-1,1],[.25,1],[-.25,-1],[.25,-1],[-.25,1]]){
    const parked=[],result=[];
    for(const unit of units){
      const available=unit.map(p=>spots.get(p.baseWidth+'/'+p.baseDepth).filter(q=>parked.every(o=>clear(q,o))));
      const starts=available[0].sort((a,b)=>sx*(a.x-b.x)+sz*(a.z-b.z));
      const tried=[];
      let bestFormation=null;
      for(const start of starts){
        if(tried.some(q=>(q.x-start.x)**2+(q.z-start.z)**2<.75**2))continue;
        tried.push(start);
        const grouped=[start];
        for(let i=1;i<unit.length;i++){
          let best=null,score=Infinity;
          for(const q of available[i]){
            const rank=(q.x-start.x)**2+(q.z-start.z)**2;
            if(rank>=score||!grouped.every(o=>clear(q,o))||!formationFits(q,grouped))continue;
            score=rank;best=q;
          }
          if(!best)break;
          grouped.push(best);
        }
        if(grouped.length===unit.length){bestFormation=grouped;break;}
      }
      if(!bestFormation)break;
      parked.push(...bestFormation);
      unit.forEach((p,i)=>result.push([p,{x:bestFormation[i].x,z:bestFormation[i].z,yaw,elevation:0}]));
    }
    if(result.length===team.length)return result;
  }
  throw Error('배치 구역에 분대 전체를 놓을 수 없습니다.');
}
export function applyLayout(game,map,blue){
  const geo=layoutGeometry(map,game.rules?.officialSetup?.version);
  if(!geo||!['orks','marines'].includes(blue))throw Error('지원하지 않는 배치입니다.');
  const scenery=layoutScenery(game,geo);
  const obstacles=scenery.filter(([,pose])=>!pose.removed).map(([p,pose])=>footprint({...p,...pose}));
  const placements=[...scenery];
  for(const faction of ['marines','orks']){
    const army=game.pieces.filter(p=>p.faction===faction&&!p.removed);
    const isBlue=faction===blue;
    const planned=arrange(army,isBlue?geo.blue:geo.red,(isBlue?1:-1)*Math.PI/2,obstacles,{attachments:game.rules?.attachments||{}});
    placements.push(...planned);
  }
  for(const [p,pose] of placements)Object.assign(p,pose);
  game.layout={map,blue};
}
