import {layoutGeometry} from '../layouts.mjs';
import {pieceGeometry} from '../assets/pieces.mjs';
import * as THREE from '../vendor/three.module.min.js';

// Keep the open yard of an L-shaped ruin visible in the diagram. Project the
// upper faces of the same cast that the board uses for placement.
const silhouettes=new WeakMap();
function footprint(piece){
  const geometry=pieceGeometry(THREE,piece);
  if(silhouettes.has(geometry))return silhouettes.get(geometry);
  const path=new Path2D(),points=geometry.getAttribute('position'),indices=geometry.index;
  for(let i=0;i<indices.count;i+=3){
    const a=indices.getX(i),b=indices.getX(i+1),c=indices.getX(i+2);
    const ax=points.getX(a),az=points.getZ(a),bx=points.getX(b),bz=points.getZ(b),cx=points.getX(c),cz=points.getZ(c);
    if((bx-ax)*(cz-az)-(bz-az)*(cx-ax)>=0)continue;
    path.moveTo(ax,az);path.lineTo(bx,bz);path.lineTo(cx,cz);path.closePath();
  }
  silhouettes.set(geometry,path);
  return path;
}

// Use the same x/z coordinates as deployment. One cell is one tabletop inch.
export function drawDeploymentDiagram(canvas,code,blueFaction,table){
  const oldQuick=table.layout?.map&&!table.pieces.find(p=>p.id==='largeRuin-2')?.patrolCD;
  const layout=layoutGeometry(code,table.rules?.officialSetup?.version??(oldQuick?8:undefined));
  const ctx=canvas.getContext('2d');
  const cell=17,left=45,top=40;
  const width=table.width*cell,height=table.depth*cell;
  const paperWidth=width+left+21,paperHeight=top+height+65;
  canvas.width=paperWidth*2;canvas.height=paperHeight*2;
  ctx.scale(2,2);
  ctx.fillStyle='#242927';ctx.fillRect(0,0,paperWidth,paperHeight);
  ctx.font='16px "Malgun Gothic",sans-serif';ctx.textAlign='center';
  ctx.fillStyle='#e8e2cb';
  for(let i=0;i<=table.width;i++)if(i%5===0||i===table.width)ctx.fillText(i+'″',left+i*cell,top-12);
  ctx.textAlign='right';
  for(let i=0;i<=table.depth;i+=5)ctx.fillText(i+'″',left-8,top+i*cell+5);

  ctx.save();
  ctx.translate(left,top);
  ctx.fillStyle='#494940';ctx.fillRect(0,0,width,height);
  ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();
  ctx.scale(cell,cell);ctx.translate(table.width/2,table.depth/2);
  function polygon(points,fill,stroke){
    ctx.beginPath();ctx.moveTo(...points[0]);
    for(const p of points.slice(1))ctx.lineTo(...p);
    ctx.closePath();ctx.fillStyle=fill;ctx.fill();
    ctx.strokeStyle=stroke;ctx.lineWidth=.08;ctx.stroke();
  }
  polygon(layout.blue,'#345879','#83bfff');polygon(layout.red,'#794c43','#ffaa97');
  const colors={};
  for(const area of layout.terrainAreas){
    polygon(area.polygon,area.objective?'#71694b':'#666b66',area.objective?'#ffe494':'#c9d0c8');
    Object.assign(colors,area.featureColors);
  }
  for(let axis=0;axis<2;axis++){
    const span=axis===0?table.width:table.depth;
    for(let i=0;i<=span;i++){
      const n=i-span/2;
      ctx.beginPath();
      if(axis===0){ctx.moveTo(n,-table.depth/2);ctx.lineTo(n,table.depth/2)}
      else{ctx.moveTo(-table.width/2,n);ctx.lineTo(table.width/2,n)}
      ctx.strokeStyle=i%5===0?'#f5edce66':'#f5edce22';ctx.lineWidth=i%5===0?.055:.035;ctx.stroke();
    }
  }
  for(const pose of layout.terrain){
    const piece=table.pieces.find(p=>p.id===pose.id);
    ctx.save();ctx.translate(pose.x,pose.z);ctx.rotate(-pose.yaw);
    ctx.fillStyle=colors[pose.id]==='yellow'?'#f4cd61':'#8fc189';
    ctx.fill(footprint(pose.patrolCD?{...piece,...pose}:piece));
    ctx.restore();
  }
  ctx.restore();
  ctx.strokeStyle='#e6d9ba';ctx.lineWidth=1.5;ctx.strokeRect(left,top,width,height);
  const marines=blueFaction==='marines';
  const legend=[['#578ec1',marines?'마린 배치':'오크 배치'],['#b67765',marines?'오크 배치':'마린 배치'],
    ['#a69862','거점'],['#909890','일반 구역'],['#8fc189','녹색 기물'],['#f4cd61','황색 기물']];
  ctx.textAlign='left';ctx.font='15px "Malgun Gothic",sans-serif';
  legend.forEach(([color,label],i)=>{
    const x=left+width*i/legend.length,y=top+height+26;
    ctx.fillStyle=color;ctx.fillRect(x,y,18,14);ctx.strokeRect(x,y,18,14);
    ctx.fillStyle='#eee7d1';ctx.fillText(label,x+26,y+14);
  });
  canvas.setAttribute('aria-label','지도 '+code+', 44 × 30인치. 청색은 '+(marines?'스페이스 마린':'오크')+
    ', 적색은 '+(marines?'오크':'스페이스 마린')+' 배치 구역. 지형 구역 10곳 중 거점 4곳, 기물 '+layout.terrain.length+'개. 격자 한 칸은 1인치.');
}
