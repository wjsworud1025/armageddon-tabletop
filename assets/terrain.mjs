import {paint as p, seeded} from './sculpt.mjs';
import {relief} from './wall-relief.mjs';

const frame=0x464647, edge=0x69635b, panel=0x664332, inset=0x302e2c;

function deck(s, width, depth, y) {
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
    relief(s,'door',w,3.95,'inside',undefined,corner);
    relief(s,'pipe',d,3.95,undefined,[0,-Math.PI/2,0],corner);
    const balcony=s.child([-w*.22,0,-d*.12]);
    deck(balcony,w*.56,d*.76,2.30);
    for(const z of [-d*.32,d*.30]) {
      balcony.link(frame,[-w*.255,2.01,z],[-w*.03,2.26,z],.049,.053,5);
      balcony.box(p.rust,[-w*.095,2.265,z],[w*.32,.078,.084]);
    }
    const short=s.child(corner,[0,-Math.PI/2,0]);
    // A cast elbow, flanged collars and weathered cabling project from the
    // outer wall, leaving the rear passage and first-floor windows open.
    const path=[[.31,2.00,-.13],[.32,3.21,-.13],[.43,3.38,-.13],[.71,3.40,-.13],[.86,3.45,-.13]];
    const oxides=[0x853c33,0x925242,0x6f3931,0xa15c47];
    for(let i=1;i<path.length;i++) short.link(oxides[i-1],path[i-1],path[i],.058,.058,10);
    for(let n=0;n<4;n++) short.cylinder(0x725844,[.316,2.13+n*.28,-.136],.071,.071,.047);
    for(let n=0;n<8;n++) {
      const z=-d/2+(n+.5)*d/8;
      s.box(0x53453b,[-w/2+.15,2.27,z],[.31,.075,.068]);
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
  const box=s.child([0,0,-.37]);
  box.box(frame,[0,.85,0],[.66,1.67,.45]);
  for(let i=0;i<4;i++) box.box(p.rust,[0,.49+i*.24,-.23],[.53,.08,.07]);
  const station=s.child([.64,0,-.49]);
  station.box(frame,[0,.92,0],[.57,1.83,.38]);
  station.box(0x465139,[0,.61,.205],[.46,.34,.056]);
  station.box(p.brass,[0,.374,.21],[.37,.075,.055]);
  for(const side of [-1,1]) {
    station.cylinder(p.brass,[side*.196,1.79,0],.056,.085,.46,9);
    station.cylinder(p.iron,[side*.196,1.98,0],.086,.086,.14,9);
  }
  lightning(station,[-.18,2.10,0],[.19,2.08,0],9);
}

function shrine(s) {
  // Paired induction housings capped by bronze aquilas in the box photograph.
  for(const side of [-1,1]) {
    const tower=s.child([side*.91,0,0]);
    tower.box(frame,[0,.085,0],[.70,.17,.87]);
    for(const z of [-.25,.25]) {
      tower.link(frame,[side*.178,.12,z],[0,2.29,z],.144,.141,6);
      tower.link(edge,[-side*.192,.12,z],[0,1.10,z],.073,.059,6);
    }
    tower.box(frame,[0,2.28,0],[.42,.62,.65],[0,0,side*.09]);
    tower.cylinder(p.iron,[0,2.21,0],.38,.36,.65,14,[0,0,Math.PI/2]);
    for(const y of [1.97,2.37]) {
      tower.cylinder(p.brass,[-side*.34,y,0],.16,.16,.10,14,[0,0,Math.PI/2]);
      tower.oval(p.teal,[-side*.40,y,0],[.07,.1,.1]);
    }
    tower.link(p.rust,[side*.20,.13,.37],[side*.22,1.51,.30],.046,.046);
    tower.cylinder(p.brass,[0,2.73,0],.047,.135,.27,8);
    for(const wing of [-1,1]) {
      for(let n=0;n<4;n++) {
        tower.plate(n%2?p.brass:p.gold,[[0,0],[wing*(.39-n*.04),.21],[wing*(.34-n*.04),.10],[wing*.035,-.053]],.033,[0,2.82-n*.032,.013*n]);
      }
    }
  }
  for(const x of [-.39,.39]) {
    s.cylinder(p.rust,[x,.49,0],.092,.11,.95,9);
    s.cylinder(p.brass,[x,.18,0],.143,.143,.078,10);
  }
  s.box(frame,[0,1.52,0],[1.70,.22,.47]);
  s.box(panel,[0,.47,0],[.78,.09,.26]);
  for(let n=0;n<5;n++) lightning(s,[-.53,1.89+n*.132,-.11+n*.06],[.53,1.90+n*.137,-.08+n*.06],102+n*13);
}

const factories={largeRuin:(s,v)=>ruin(s,true,v),smallRuin:(s,v)=>ruin(s,false,v),shockArray:shock,capacitorStack:capacitor,barricade,generatorShrine:shrine,pylon};

export function scenery(s,item) {
  const model=s.child();
  factories[item.kind](model,item.variant??0);
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

