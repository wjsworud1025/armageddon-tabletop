// Table inches, origin at the bottom of the Wartrakk's oval base.
// Each station specifies the top and bottom edges of a sewn, twisting pennant.
const hems=[
  [-1.428,-.480,2.959,-.384,2.585],
  [-1.540,-.459,2.914,-.418,2.586],
  [-1.680,-.439,2.875,-.475,2.592],
  [-1.789,-.451,2.831,-.525,2.609],
  [-1.893,-.465,2.795,-.578,2.638],
  [-2.002,-.537,2.813,-.635,2.666],
  [-2.113,-.614,2.809,-.678,2.680],
  [-2.166,-.615,2.785,-.650,2.659],
  [-2.261,-.559,2.722,-.583,2.639],
  [-2.343,-.550,2.695,-.577,2.638],
  [-2.413,-.577,2.682,-.579,2.677],
];

// Hand-painted horned skull. The mark sits below the hoist and follows
// the fabric on either side. Coordinates run from hoist to fly, bottom to top.
const skull=[
  [.055,.73],[.052,.925],[.087,.86],[.094,.706],[.134,.632],
  [.199,.645],[.224,.725],[.227,.844],[.255,.913],[.263,.757],
  [.243,.582],[.207,.488],[.195,.372],[.175,.339],[.164,.205],
  [.148,.23],[.135,.185],[.117,.218],[.114,.317],[.091,.325],
  [.081,.444],[.077,.548],[.059,.598],
];
function cloth(s){
  const T=s.T,edge=which=>new T.CatmullRomCurve3(hems.map(r=>
    new T.Vector3(r[which],r[which+1],r[0])),false,'centripetal');
  const top=edge(1),bottom=edge(3);
  const columns=21,rows=3,stride=rows+1,side=stride*columns;
  const positions=[],colors=[],indices=[];
  const soot=new T.Color(0x333036),oxide=new T.Color(0xa3473f),ivory=new T.Color(0xd8d1c4);
  function surface(t,v,sign,raised=0){
    const high=top.getPoint(t),low=bottom.getPoint(t);
    const normal=top.getTangent(t).add(bottom.getTangent(t))
      .cross(high.clone().sub(low)).normalize();
    const camber=.012*Math.sin(Math.PI*v)*Math.sin(t*Math.PI*2)*(1-t);
    return low.lerp(high,v).addScaledVector(normal,camber+sign*(.009-.005*t+raised));
  }
  function vertex(point,tint){
    positions.push(point.x,point.y,point.z);colors.push(tint.r,tint.g,tint.b);
  }
  for(const sign of [1,-1])for(let column=0;column<columns;column++){
    const t=column/(columns-1);
    for(let row=0;row<=rows;row++){
      const v=row/rows;
      const red=Math.min(1,Math.max(0,(t-.27-.13*(1-v))/.18));
      const tint=soot.clone().lerp(oxide,red);
      tint.multiplyScalar(.92+.08*Math.sin(Math.PI*v)+.07*Math.cos(2*Math.PI*t));
      vertex(surface(t,v,sign),tint);
    }
  }
  const quad=(a,b,c,d)=>indices.push(a,b,c,a,c,d);
  for(let col=0;col<columns-1;col++){
    const a=col*stride,b=a+stride;
    for(let row=0;row<rows;row++){
      const i=a+row,j=b+row;
      quad(i,j,j+1,i+1);quad(side+i+1,side+j+1,side+j,side+i);
    }
    quad(a,side+a,side+b,b);
    quad(a+rows,b+rows,side+b+rows,side+a+rows);
  }
  const end=side-stride;
  for(let i=0;i<rows;i++){
    quad(i,i+1,side+i+1,side+i);
    quad(end+i,side+end+i,side+end+i+1,end+i+1);
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  g.setIndex(indices);g.computeVertexNormals();
  s.part(g,0xffffff,[0,0,0],[1,1,1]);
  const contours=skull.map(([t,v])=>new T.Vector2(t,v));
  const eye=(t,v,dt,dv)=>Array.from({length:8},(_,i)=>{
    const a=i*Math.PI/4;
    return new T.Vector2(t+dt*Math.cos(a),v+dv*Math.sin(a));
  });
  const holes=[eye(.119,.459,.022,.067),eye(.172,.463,.020,.066),eye(.146,.369,.008,.036)];
  const facets=T.ShapeUtils.triangulateShape(contours,holes),uv=contours.concat(...holes);
  for(const sign of [1,-1]){
    const mark=new T.BufferGeometry(),points=uv.flatMap(p=>surface(p.x,p.y,sign,.009).toArray());
    mark.setAttribute('position',new T.Float32BufferAttribute(points,3));
    mark.setIndex(facets.flatMap(([a,b,c])=>sign>0?[a,b,c]:[c,b,a]));
    mark.computeVertexNormals();
    const paint=s.part(mark,ivory.getHex(),[0,0,0],[1,1,1]);
    paint.userData.paintOnly=true;
  }

}

export function rearBanner(body){
  const s=body.child([0,-.14,0]);
  const ferrule=[-.379,2.565,-1.442],spike=[-.575,3.290,-1.418];
  const along=t=>ferrule.map((n,k)=>n+(spike[k]-n)*t);
  s.link(0x6b6765,[-.182,1.15,-.898],[-.304,1.83,-1.34],.035,.031,10);
  s.link(0x88827c,[-.304,1.83,-1.34],ferrule,.031,.030,10);
  s.link(0x49464a,ferrule,along(.64),.045,.052,10);
  // Raised hoops bind the hoist to the shaft under the red trophy.
  for(const t of [.025,.18,.335,.49])
    s.link(0x96918b,along(t),along(t+.052),.055,.055,7);
  const head=along(.714);
  s.oval(0x963d34,head,[.128,.152,.120],[.04,-.16,.24]);
  for(const sign of [-1,1]){
    const joint=[head[0]+sign*.114,head[1]-.030,head[2]+.018];
    s.cylinder(0x9e9690,joint,.027,.030,.027,7,[0,0,Math.PI/2]);
  }
  s.link(0x7c7471,along(.864),spike,.033,.002,8);
  cloth(s);
}
