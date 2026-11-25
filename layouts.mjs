import {baseDistance} from './state.mjs';

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
    positions:[[933,454,0],[600,1505,180],[348,776,180],[1130,1203,90],[1200,301,0],[1200,496,90],[341,1465,180],[342,1662,270],[845,860,0],[697,1097,0],[1137,754,90],[391,1208,90],[671,1097,0],[575,453,90],[966,1505,90]]
  },
  B:{
    zone:'203,154 1332,154 1332,757',
    areas:[
      shape('blue-home','blue','410,305 842,305 842,568 781,568 762,575 739,573 722,590 707,589 696,572 676,569 651,574 623,567 584,586 562,580 539,568 410,568'),
      shape('red-home','red','692,1394 736,1394 763,1381 784,1381 805,1371 823,1376 831,1394 861,1394 877,1387 904,1392 947,1377 977,1383 995,1394 1126,1394 1126,1656 692,1656'),
      shape('neutral-1',null,'242,1019 467,1019 467,1056 482,1072 486,1091 477,1112 466,1136 466,1168 374,1168 351,1176 339,1173 322,1182 306,1179 293,1176 286,1168 242,1168'),
      shape('neutral-2',null,'1067,794 1160,794 1180,786 1196,787 1212,780 1236,783 1246,794 1293,794 1293,943 1067,943 1067,903 1051,887 1047,870 1052,853 1050,843 1067,827')],
    positions:[[539,496,0],[1010,1465,180],[473,1471,180],[1071,518,0],[798,347,0],[798,530,90],[738,1430,180],[739,1623,270],[355,1092,90],[1177,854,90],[574,754,90],[959,1207,90],[1177,905,90],[652,1060,0],[880,907,0]]
  },
  C:{
    zone:'768,154 1332,154 1332,981 768,568',
    areas:[
      shape('blue-home','blue','993,232 1255,232 1255,665 993,665 993,617 981,600 982,589 973,573 980,553 973,547 993,532 993,502 985,480 993,448 977,407 980,390 993,361'),
      shape('red-home','red','279,1300 542,1300 542,1347 555,1368 548,1389 554,1401 543,1427 543,1456 550,1475 543,1509 560,1548 555,1573 543,1594 543,1733 279,1733'),
      shape('neutral-1',null,'279,567 429,567 429,793 391,793 374,804 355,810 341,805 324,806 306,793 279,793 279,698 273,681 273,664 265,648 271,622 279,611'),
      shape('neutral-2',null,'1108,1168 1150,1168 1166,1154 1186,1147 1202,1154 1214,1151 1233,1168 1257,1168 1257,1258 1266,1278 1264,1294 1273,1311 1267,1335 1257,1348 1257,1394 1108,1394')],
    positions:[[1171,561,90],[339,1424,270],[1187,1260,180],[362,717,0],[1034,281,180],[1222,268,0],[314,1680,270],[491,1705,90],[766,1323,90],[768,622,90],[545,377,90],[994,1582,90],[769,679,90],[646,940,90],[908,1015,90]]
  }
};
const ids=['largeRuin-1','largeRuin-2','largeRuin-3','largeRuin-4', 'smallRuin-1','smallRuin-2','smallRuin-3','smallRuin-4','shockArray-1','capacitorStack-1','barricade-1','barricade-2','generatorShrine-1','pylon-1','pylon-2'];
export function layoutGeometry(code){
  const data=layouts[code];if(!data)return null;
  const blue=points(data.zone),red=blue.map(([x,z])=>[-x,-z]);
  return {blue,red,areas:data.areas,terrain:data.positions.map(([u,v,deg],i)=>{
    const [x,z]=world([u,v]);return {id:ids[i],x,z,yaw:deg*Math.PI/180}
  })};
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
export function objectiveAreas(game){
  const geo=layoutGeometry(game.layout?.map);if(!geo)return [];
  return geo.areas.map((area,i)=>({id:area.id,name:['청색 진영 본진','적색 진영 본진','중립 거점 1','중립 거점 2'][i],
    home:area.side==='blue'?game.layout.blue:area.side==='red'?(game.layout.blue==='marines'?'orks':'marines'):null,
    members:game.pieces.filter(p=>p.faction!=='terrain'&&!p.removed&&overlapsArea(p,area.polygon)).map(p=>p.id)}));
}
function fitsZone(p,zone){
  if(!inside(p.x,p.z,zone))return false;
  // Exact support of the rotated ellipse against each convex half plane.
  const c=Math.cos(p.yaw),s=Math.sin(p.yaw);
  return zone.every(([a,b],i)=>{
    const [x,z]=zone[(i+1)%zone.length],dx=x-a,dz=z-b;
    const support=Math.hypot((dz*c+dx*s)*p.baseWidth/2,(dz*s-dx*c)*p.baseDepth/2);
    return Math.abs(dz*(p.x-a)-dx*(p.z-b))>=support+.02;
  });
}
export function validDeployment(game,p){
  const geo=layoutGeometry(game.layout?.map);return !!geo&&fitsZone(p,p.faction===game.layout.blue?geo.blue:geo.red);
}
export function applyLayout(game,map,blue){
  const geo=layoutGeometry(map);if(!geo||!['orks','marines'].includes(blue))throw Error('지원하지 않는 배치입니다.');
  game.layout={map,blue};const terrain=game.pieces.filter(p=>p.faction==='terrain');
  for(const pose of geo.terrain){const p=terrain.find(p=>p.id===pose.id);Object.assign(p,pose,{removed:false,elevation:0})}
  const parked=[...terrain],positions=[];
  for(let x=-21.5;x<22;x+=.6)for(let z=-14.5;z<15;z+=.6)positions.push({x,z});
  const radius=p=>Math.hypot(p.baseWidth,p.baseDepth)/2;
  for(const team of [blue,blue==='marines'?'orks':'marines']){
    const zone=team===blue?geo.blue:geo.red,sign=team===blue?1:-1;
    const army=game.pieces.filter(p=>p.faction===team&&!p.removed).sort((a,b)=>b.baseWidth*b.baseDepth-a.baseWidth*a.baseDepth||a.kind.localeCompare(b.kind));
    let prev=null;
    for(const p of army){
      p.yaw=sign*Math.PI/2;p.elevation=0;
      const same=prev?.kind===p.kind,anchor=same?prev:{x:-sign*18,z:0};
      const sorted=[...positions].sort((a,b)=>Math.hypot(a.x-anchor.x,a.z-anchor.z)-Math.hypot(b.x-anchor.x,b.z-anchor.z));
      const chosen=sorted.find(q=>{
        const test={...p,...q};if(!fitsZone(test,zone))return false;
        return !parked.some(f=>Math.hypot(f.x-q.x,f.z-q.z)<radius(f)+radius(test)+.08&&baseDistance(f,test)<.07);
      });
      if(!chosen)throw Error('배치 구역에 남은 공간이 없습니다.');
      Object.assign(p,chosen);parked.push(p);prev=p;
    }
  }
}
