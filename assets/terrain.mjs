import {paint as p, seeded} from './sculpt.mjs';
import {relief} from './wall-relief.mjs';
import {shrineReturn} from './manufactorum-walls.mjs';
import {generatorShrine} from './generator-shrine.mjs';
import {reliquaryRuin} from './reliquary-ruin.mjs';

const frame=0x464647, edge=0x69635b, panel=0x664332, inset=0x302e2c;

function deck(s, width, depth, y) {
  // The balcony is a torn sheet of metal with raised ribs and a hatch.
  s.plate(panel,[[-.49,-.49],[.49,-.49],[.49,.04],[.42,.09],[.44,.18],
    [.30,.21],[.34,.29],[.18,.33],[.21,.41],[.04,.40],[-.04,.48],[-.49,.48]]
    .map(([x,z])=>[x*width,z*depth]),.074,[0,y,0],[Math.PI/2,0,0]);
  for(let i=0; i<=5; i++) {
    const z=-depth/2+i*depth/5;
    s.box(i%2===0?panel:p.rust,[0,y,z],[width,.094,.097]);
  }
  for(let i=0;i<=4;i++) {
    s.box(panel,[-width/2+i*width/4,y-.025,0],[.106,.114,depth]);
  }
  for(const sign of [-1,1]) {
    s.box(frame,[sign*width/2,y-.08,0],[.1,.17,depth]);
    s.box(frame,[0,y-.08,sign*depth/2],[width,.17,.11]);
  }
  // Riveted treads and concentric access hatch on the grated floor.
  const hatch=s.child([width*.12,y+.072,depth*.02]);
  for(const radius of [depth*.145,depth*.204]) {
    for(let k=0;k<12;k++) {
      const a=k*Math.PI/6,b=(k+1)*Math.PI/6;
      hatch.link(p.rust,[radius*Math.cos(a),0,radius*Math.sin(a)],[radius*Math.cos(b),0,radius*Math.sin(b)],.033,.033,6);
    }
  }
}

function ruin(s, large, variant) {
  const w=large?4.35:2.2, d=large?2.94:1.02;
  const corner=[-w/2,0,-d/2];
  if(large) {
    const shrineCorner=variant===0;
    const shell=shrineCorner ? s.child([0,0,0],undefined,[1,5.40/3.95,1]) : s;
    const hasPipe=shrineCorner||variant===3;
    if(shrineCorner){
      relief(shell,'pipe',w,3.95,'inside',undefined,corner,'pipe');
      shrineReturn(shell.child(corner,[0,-Math.PI/2,0]),d,3.95);
    }else{
      relief(shell,'door',w,3.95,'inside',undefined,corner,hasPipe?'chapel':'door');
      relief(shell,'pipe',d,3.95,undefined,[0,-Math.PI/2,0],corner,hasPipe?'pipe':'reliquary');
    }
    const landingOffset=shrineCorner ? .12 : 0;
    const balcony=shell.child([-w*.22,landingOffset,-d*.12]);
    deck(balcony,w*.56,d*.76,2.30);
    for(const z of [-d*.32,d*.30]) {
      balcony.link(frame,[-w*.255,2.01,z],[-w*.03,2.26,z],.049,.053,5);
      balcony.box(p.rust,[-w*.095,2.265,z],[w*.32,.078,.084]);
    }
    // A cast elbow, flanged collars and weathered cabling project from the
    // outer wall, leaving the rear passage and first-floor windows open.
    if(hasPipe){
      const pipeWall=shell.child(corner,shrineCorner?undefined:[0,-Math.PI/2,0]);
      const onFace=([x,y,z])=>shrineCorner?[x*1.66,y,-z]:[x,y,z];
      const path=[[.31,1.78,.14],[.31,1.96,.23],[.32,3.21,.23],[.43,3.38,.23],[.71,3.40,.20],[.86,3.45,.15]].map(onFace);
      const oxides=[0x853c33,0x925242,0x6f3931,0xa15c47];
      for(let i=1;i<path.length;i++) pipeWall.link(oxides[(i-1)%oxides.length],path[i-1],path[i],.098,.098,10);
      for(let n=0;n<4;n++) pipeWall.cylinder(0x725844,onFace([.316,2.13+n*.28,.23]),.12,.12,.055);
    }
    for(let n=0;n<8;n++) {
      const z=-d/2+(n+.5)*d/8;
      shell.box(0x53453b,[-w/2+.15,2.27+landingOffset,z],[.31,.075,.068]);
    }
  } else {
    // The four kit fragments include two flat ends and two masonry corners;
    // they expose very different silhouettes at the same camera angle.
    const front=['back','shrine','shrine','shortPipe'][variant%4];
    const h=[1.50,1.15,1.45,1.68][variant%4];
    relief(s,front,w,h,undefined,undefined,corner);
    if(variant%4===1 || variant%4===2) {
      relief(s,'shortPipe',d,h,undefined,[0,-Math.PI/2,0],corner);
    } else {
      const toe=s.child(corner);
      for(const x of [.10,w-.12]) toe.plate(frame,[[0,0],[.51,0],[.22,.14],[.13,.32],[0,.32]],.13,[x,0,0],[0,-Math.PI/2,0]);
    }
  }
  const rng=seeded(variant+51);
  for(let i=0;i<(large?24:10);i++) {
    const frac=rng(), x=-w/2+frac*w, z=-d/2+(rng()-.55)*.36;
    const size=.025+rng()*.084;
    s.cylinder([0xa56a40,0x846b4f,0x735239,p.rust][i%4],[x,size*.40,z],size*.48,size,size*.83,5,[0,rng()*3,0],[1.39,1,.8]);
  }
}
function lightning(s,a,b,seed) {
  const rand=seeded(seed);
  let prev=a;
  for(let i=1;i<=7;i++) {
    const t=i/7;
    const v=a.map((n,j)=>n+(b[j]-n)*t+(i<7?(rand()-.5)*.15:0));
    s.link(p.teal,prev,v,.018,.019,5);
    if(i===3) s.link(p.teal,prev,[prev[0]+.09,prev[1]+.12,prev[2]-.04],.015,.002,5);
    prev=v;
  }
}

function transformer(s,x,top) {
  s.cylinder(p.iron,[x,.10,0],.29,.36,.20,8);
  s.cylinder(p.rust,[x,top*.4,0],.14,.14,top*.71,12);
  for(let i=0;i<5;i++) s.cylinder(p.brass,[x,.26+i*.104,0],.224,.227,.055,12);
  s.cylinder(p.iron,[x,top*.83,0],.209,.205,.21);
  s.oval(p.iron,[x,top,0],[.203,.203,.155]);
  s.cylinder(p.brass,[x,top,.13],.104,.104,.055,14,[Math.PI/2,0,0]);
}

function shock(s) {
  s.box(frame,[0,.11,0],[3.25,.21,.56]);
  for(const x of [-1.06,0,1.06]) {
    transformer(s,x,1.07);
    for(const side of [-1,1]) {
      s.link(p.iron,[x+side*.14,.97,0],[x+side*.22,1.62,.035],.05,.04);
      s.oval(p.brass,[x+side*.22,1.63,.035],[.10,.11,.08]);
      lightning(s,[x+side*.22,1.71,.035],[x+side*.38,1.97,.04],40+(x+2)*29+side);
    }
  }
  lightning(s,[-.80,1.55,.038],[-.21,1.56,0],8);
  lightning(s,[.21,1.56,0],[.83,1.60,.033],14);
}

function pylon(s) {
  for(const side of [-1,1]) {
    const x=side*.98;
    s.box(frame,[x,.091,0],[.60,.182,.74]);
    for(const z of [-.2,.2]) {
      s.link(frame,[side*1.099,.15,z],[side*.84,2.1,z],.137,.107,5);
      s.link(edge,[side*.82,.15,z],[side*.90,1.51,z],.088,.07,5);
    }
    s.box(frame,[side*.86,1.56,0],[.39,.218,.54]);
    s.box(frame,[side*.85,2.08,0],[.42,.40,.55]);
  }
  for(const z of [-.20,.01,.20]) {
    const path=[[-1.26,1.19,z],[-1.22,1.75,z],[-1.07,2.12,z],[-.83,2.32,z],[-.58,2.36,z],[.76,2.36,z],[1.03,2.32,z],[1.23,2.12,z],[1.25,1.81,z]];
    path.slice(1).forEach((point,i)=>s.link(i%4===0?p.rust:p.leather,path[i],point,.067,.067,9));
  }
  for(const x of [-.84,.83]) s.box(frame,[x,2.35,0],[.21,.23,.61]);
  for(const sign of [-1,1]) {
    const x=sign*1.17;
    s.cylinder(p.brass,[x,2.33,0],.19,.19,.33,12,[0,0,Math.PI/2]);
    s.oval(p.teal,[x+sign*.15,2.33,0],[.12,.131,.13]);
  }
}

function barricade(s) {
  for(const side of [-1,1]) {
    s.plate(frame,[[-.095,0],[.13,0],[.085,1.33],[.02,1.45],[-.082,1.37]],.24,[side*1.04,0,0]);
    s.box(p.iron,[side*1.04,.075,0],[.31,.13,.41]);
  }
  s.plate(frame,[[-1.04,0],[1.04,0],[1.04,.51],[.60,.50],[.48,.63],[-.45,.63],[-.61,.49],[-1.04,.49]],.17);
  for(let row=0;row<2;row++) {
    s.box(edge,[0,1.04+row*.22,0],[2.05,.075,.12]);
    for(let i=-3;i<=3;i++) s.link(p.brass,[i*.235-.10,1.07,.02],[i*.235+.11,1.23,.02],.015,.015,5);
  }
  for(let i=-2;i<=2;i++) s.box(panel,[i*.35,.26,.089],[.286,.31,.022]);
}

function capacitor(s) {
  for(const x of [-.47,.47]) {
    s.cylinder(frame,[x,.74,0],.435,.445,1.46,20);
    for(let i=0;i<5;i++) {
      s.cylinder(p.teal,[x,.17+i*.267,0],.449,.449,.105,20);
      s.cylinder(p.rust,[x,.10+i*.267,0],.476,.48,.075,20);
    }
    s.cylinder(p.brass,[x,1.48,0],.399,.48,.11,18);
    s.cylinder(inset,[x,1.54,0],.315,.32,.023,18);
    for(const angle of [-1.1,1.10,3.1]) s.box(edge,[x+Math.sin(angle)*.44,.76,Math.cos(angle)*.44],[.094,1.48,.065],[0,angle,0]);
  }
  const box=s.child([0,0,.37]);
  box.box(frame,[0,.85,0],[.66,1.67,.45]);
  for(let i=0;i<4;i++) box.box(p.rust,[0,.49+i*.24,.23],[.53,.08,.07]);
  const station=s.child([.64,0,.49]);
  station.box(frame,[0,.92,0],[.57,1.83,.38]);
  station.box(0x465139,[0,.61,.205],[.46,.34,.056]);
  station.box(p.brass,[0,.374,.21],[.37,.075,.055]);
  for(const side of [-1,1]) {
    station.cylinder(p.brass,[side*.196,1.79,0],.056,.085,.46,9);
    station.cylinder(p.iron,[side*.196,1.98,0],.086,.086,.14,9);
  }
  lightning(station,[-.18,2.10,0],[.19,2.08,0],9);
}

const factories={largeRuin:(s,v)=>v===1?reliquaryRuin(s):ruin(s,true,v),smallRuin:(s,v)=>ruin(s,false,v),shockArray:shock,capacitorStack:capacitor,barricade,generatorShrine,pylon};

function registeredScenery(s,item,draw) {
  const model=s.child();
  draw(model,item.variant??0);
  // Center the authored silhouette and register its footprint to the physical
  // table axes. Height remains in tabletop inches.
  model.group.updateMatrixWorld(true);
  const T=s.T, bounds=new T.Box3().makeEmpty(), vertex=new T.Vector3();
  model.group.traverse(node=>{
    const geo=node.userData.geometry;
    if (!geo) return;
    const position=geo.attributes.position;
    for(let i=0;i<position.count;i++) bounds.expandByPoint(vertex.fromBufferAttribute(position,i).applyMatrix4(node.matrixWorld));
  });
  const size=bounds.getSize(new T.Vector3());
  const center=bounds.getCenter(new T.Vector3());
  const sx=(item.baseWidth||size.x)/size.x, sz=(item.baseDepth||size.z)/size.z;
  model.group.scale.set(sx,1,sz);
  model.group.position.set(-center.x*sx,-bounds.min.y,-center.z*sz);
}

export function scenery(s,item) {
  registeredScenery(s,item,factories[item.kind]);
}

// The save upgrader rechecks support on the original second ruin before
// moving a model on its landing. Both archived art modes use their original shell.
export function legacySecondRuin(s,item) {
  registeredScenery(s,{...item,baseWidth:5.2,baseDepth:4.1},model=>ruin(model,true,1));
}

