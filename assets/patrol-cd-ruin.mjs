import {doorWall} from './reliquary-ruin.mjs';
import {reliquaryScale} from '../data/reliquary-dimensions.mjs';

const iron=0x514c4a, oxide=0x674b3c, shadow=0x343438, rim=0x716a63;
const brass=0x998367, steel=0x777574;

// Distances on wall D start at its joining post. Positive u runs towards the
// torn end. The short ground toe and the higher projecting sill are separate.
function returnWall(s){
  const plate=(color,shape,depth=.21,z=0)=>s.plate(color,shape,depth,[0,0,z]);
  const box=(color,x,y,w,h,depth,z=0)=>s.box(color,[x,y,z],[w,h,depth]);
  const rod=(color,x0,y0,x1,y1,z,r=.028)=>s.link(color,[x0,y0,z],[x1,y1,z],r,r,6);
  plate(iron,[[-.37,.03],[2.08,.03],[2.07,.10],[1.96,.17],[1.98,.26],
    [1.88,.27],[1.83,.50],[1.77,.60],[1.80,.77],[1.68,.91],[1.74,1.04],
    [1.77,1.18],[1.91,1.28],[1.89,1.38],[2.04,1.41],[2.01,1.60],
    [2.13,1.62],[2.10,1.83],[1.96,1.90],[2.03,2.04],[1.72,2.12],[-.37,2.12]]);
  plate(iron,[[.29,2.08],[1.70,2.08],[1.64,2.22],[1.57,2.30],[1.67,2.43],
    [1.62,2.58],[1.80,2.71],[1.73,2.87],[1.92,2.97],[.29,2.99]]);
  for(const face of [-1,1]){
    for(const [u,w] of [[-.31,.55],[.37,.56],[.99,.58]]){
      const h=1.60,x=u+w*.5;
      const arch=[[u,.19],[u,h-.28],[u+.10,h-.15],[x,h],
        [u+w-.10,h-.15],[u+w,h-.28],[u+w,.19]];
      plate(shadow,arch,.023,face*.117);
      for(let i=1;i<arch.length;i++)rod(rim,...arch[i-1],...arch[i],face*.144,.021);
      box(iron,x,.18,w+.06,.07,.042,face*.14);
    }
    for(const x of [.58,1.04,1.44]){
      rod(rim,x,2.18,x,2.65,face*.147);
      rod(rim,x,2.65,x+.13,2.79,face*.147);
    }
    for(const x of [.33,.95,1.60]){
      box(rim,x,1.02,.056,1.90,.048,face*.144);
      for(const y of [.26,.88,1.48,1.86])s.cylinder(steel,[x,y,face*.174],.018,.018,.012,6,[Math.PI/2,0,0]);
    }
    for(const [y,width] of [[.07,2.43],[2.05,2.44],[2.96,2.89]]){
      const x0=-.37;
      box(iron,x0+width/2,y,width,.108,.11,face*.142);
      for(let x=x0+.14;x<x0+width-.03;x+=.27){
        box(rim,x,y+.012,.11,.054,.034,face*.209);
        s.cylinder(brass,[x,y+.014,face*.233],.023,.023,.014,7,[Math.PI/2,0,0]);
      }
    }
  }
  // The corner girder has apertures between its diagonal straps. The
  // narrow adjoining lancet retains two posts, an arch and three bars.
  for(const x of [-.32,.29]){
    box(iron,x,3.35,.090,2.70,.245);
    for(const face of [-1,1])box(rim,x,3.36,.048,2.72,.044,face*.146);
  }
  for(const [lo,hi] of [[2.15,2.87],[3.10,3.73],[3.85,4.55]]){
    rod(rim,-.28,lo,.25,hi,0,.047);
    rod(iron,-.28,hi,.25,lo,0,.050);
  }
  for(const y of [2.11,2.97,3.79,4.62])box(iron,-.015,y,.71,.11,.27);
  plate(iron,[[.26,2.98],[.48,2.98],[.49,4.39],[.57,4.50],[.74,4.56],
    [.88,4.45],[.93,4.39],[1.08,4.40],[1.02,4.54],[.81,4.68],[.47,4.70],[.26,4.61]]);
  plate(iron,[[.94,2.99],[1.14,2.99],[1.11,3.28],[1.16,3.52],[1.10,3.58],
    [1.12,3.97],[1.06,4.16],[1.10,4.37],[.94,4.44]]);
  for(const y of [3.32,3.72,4.12])box(rim,.72,y,.50,.045,.062,.035);
  box(iron,1.075,3.035,2.93,.088,.33); // ends at u=2.54
  plate(rim,[[-.35,3.065],[2.54,3.065],[2.49,3.118],[.27,3.118],[-.35,3.09]],.225);
  s.link(oxide,[1.72,2.77,.07],[2.14,2.99,.07],.045,.035,7);
}

// Part 6 has two complete upper panels and a torn third panel at the end.
// Coordinates are (distance along C, distance along D) from the joint.
function landingSix(s){
  const floor=(color,points,top,depth)=>s.plate(color,points.map(([x,d])=>[x,-d]),
    depth,[0,top-depth/2,0],[Math.PI/2,0,0]);
  const outline=[[.035,.035],[4.16,.035],[4.14,.19],[4.01,.27],[4.08,.38],
    [3.81,.44],[3.86,.61],[3.72,.72],[3.78,.83],[3.83,1.00],[3.67,1.13],
    [3.79,1.27],[3.89,1.35],[3.80,1.48],[3.91,1.65],[4.09,1.68],
    [4.09,1.80],[3.87,1.80],[3.89,1.96],[3.68,1.99],[3.71,2.12],
    [3.56,2.18],[3.63,2.29],[3.43,2.36],[3.22,2.40],[3.08,2.54],
    [2.89,2.59],[2.73,2.58],[2.66,2.67],[2.54,2.64],[2.42,2.69],
    [2.29,2.58],[2.18,2.48],[2.03,2.52],[1.91,2.64],[1.73,2.62],
    [1.63,2.52],[1.46,2.54],[1.35,2.49],[1.20,2.52],[1.06,2.36],
    [.98,2.22],[.81,2.18],[.76,2.08],[.61,2.16],[.45,2.20],[.33,2.23],
    [.29,2.40],[.035,2.40]];
  floor(oxide,outline,3,.133);
  // Individual metal beams remain visible from below, and end beyond
  // the broken plate. There is no supporting plane between their ends.
  for(const x of [1.71,3.24]){
    s.box(iron,[x,2.86,-1.46],[.14,.19,2.88]);
    s.box(rim,[x,2.972,-1.46],[.19,.044,2.88]);
  }
  for(const d of [.17,1.70])s.box(iron,[1.97,2.841,-d],[3.88,.14,.088]);
  function frame(x,d,w,h){
    for(const a of [-1,1]){
      s.box(iron,[x+a*w/2,3.003,-d],[.045,.018,h]);
      s.box(rim,[x,3.004,-d+a*h/2],[w,.019,.043]);
    }
  }
  for(const x of [.93,2.47]){
    frame(x,.94,1.39,1.44);
    frame(x,.94,1.08,1.12);
    frame(x,.94,.78,.83);
    for(const d of [.28,1.60])for(const a of [-.51,.51]){
      s.cylinder(brass,[x+a,3.014,-d],.031,.034,.012,8);
    }
    for(const d of [1.87,2.02]){
      s.box(rim,[x,3.002,-d],[1.21,.014,.034]);
      s.box(iron,[x+.60,3.003,-2.10],[.034,.015,.39]);
    }
  }
  // Cog access cover and the adjacent plate stamped with four dark
  // triangular recesses. The pressed details sit on solid metal.
  s.box(shadow,[2.47,3.004,-.94],[.51,.012,.72]);
  s.cylinder(iron,[2.47,3.015,-.94],.187,.187,.015,10);
  for(let i=0;i<8;i++){
    const angle=i*Math.PI/4;
    s.box(rim,[2.47+.185*Math.cos(angle),3.016,-.94+.185*Math.sin(angle)],
      [.095,.016,.066],[0,-angle,0]);
  }
  for(const a of [-1,1])for(const b of [-1,1]){
    const x=.93+a*.22,d=.94+b*.23;
    floor(shadow,[[x,d],[x-a*.18,d],[x,d-b*.18]],3.012,.015);
  }
  // The far bay is fractured through its own mouldings. Leave only the
  // two corners still carried by the sheet.
  for(const d of [.23,.39]){
    s.box(rim,[3.58,3.003,-d],[d===.23?.69:.47,.016,.037]);
    s.box(iron,[3.36,3.003,-(d+.30)],[.038,.015,.62]);
  }
  s.cylinder(shadow,[2.47,3.024,-.94],.092,.092,.006,10);
  for(const [x,d,dx,dd] of [[.84,2.17,.06,.23],[.97,2.24,-.07,.25],
    [2.40,2.58,-.12,.19],[2.71,2.60,-.04,.15],[3.72,1.94,.19,.08]]){
    s.link(steel,[x,2.95,-d],[x+dx,2.78,-d-dd],.024,.019,7);
  }
}

export function patrolCDRuin(s){
  const part=s.child([-3.035,0,1.25]);
  doorWall(part.child([0,0,0],[0,0,0],[reliquaryScale,reliquaryScale,reliquaryScale]));
  returnWall(part.child([0,0,0],[0,Math.PI/2,0]));
  landingSix(part);
}
