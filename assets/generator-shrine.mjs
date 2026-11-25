// Model inches. The two end frames stand across X. Their splayed feet, coils
// and winged crests run along Z, leaving the discharge chamber open on both sides.
const charcoal=0x38373b, iron=0x504e51, rim=0x6d6865, shadow=0x27292c;
const brass=0x958065, dust=0x887e63, copper=0x94574b, steel=0x817f77;
const arcColors=[0xabc5c9,0x91b3bb,0xb7cdd0];
const faceRotation=[Math.PI/2,0,0];

function endFrame(t){
  // This is a forked casting. Its central arch opens all the way to the floor.
  const legs=[[-.94,.035],[-.94,.18],[-.51,1.64],[-.46,2.05],[-.61,2.27],
    [-.58,2.52],[.58,2.52],[.61,2.27],[.46,2.05],[.51,1.64],[.94,.18],
    [.94,.035],[.27,.035],[.27,.57],[.23,.85],[.13,1.06],[0,1.14],
    [-.13,1.06],[-.23,.85],[-.27,.57],[-.27,.035]];
  t.plate(iron,legs,.29);
  for(const hand of [-1,1]){
    const bevel=[[.285,.07],[.88,.07],[.86,.22],[.475,1.59],
      [.413,2.03],[.315,1.97],[.37,1.56],[.25,.80]].map(([u,y])=>[hand*u,y]);
    t.plate(dust,bevel,.042,[0,0,.149]);
    t.box(dust,[hand*.596,.058,0],[.66,.116,.36]);
    for(const [y,u] of [[.28,.608],[.55,.559],[.82,.495]]){
      t.cylinder(shadow,[hand*u,y,.181],.10,.10,.025,10,faceRotation);
      t.cylinder(iron,[hand*u,y,.198],.074,.074,.016,10,faceRotation);
    }
    const z=.02;
    t.cylinder(dust,[hand*1.10,.27,z],.149,.176,.47,10);
    for(const y of [.11,.24,.44,.57])t.cylinder(rim,[hand*1.10,y,z],.164,.164,.036,10);
    t.cylinder(steel,[hand*1.10,.68,z],.094,.085,.26,9);
    t.cylinder(rim,[hand*1.10,.82,z],.118,.118,.051,9);
  }
  t.link(rim,[0,2.16,.192],[0,1.72,.195],.091,.063,9);
  t.link(copper,[0,1.76,.203],[-.035,.82,.204],.041,.034,8);
  t.box(brass,[0,.40,.172],[.117,.63,.099]);
}

function wingedCrest(t){
  for(const hand of [-1,1]){
    const outline=[[.01,4.48],[.18,4.73],[.37,4.91],[.69,5.01],[1.01,5.03],
      [.89,4.87],[.71,4.72],[.49,4.59],[.24,4.51],[.09,4.41]];
    t.plate(brass,outline.map(([u,y])=>[hand*u,y]),.115);
    for(let i=0;i<5;i++){
      const u=.20+i*.135;
      t.link(dust,[hand*.16,4.70+i*.043,.069],[hand*u,4.54+i*.075,.067],.019,.014,5);
    }
  }
  t.plate(dust,[[-.185,4.59],[-.112,4.76],[-.037,4.80],[0,4.71],[.10,4.8],
    [.16,4.76],[.11,4.62],[.17,4.50],[.075,4.48],[0,4.31],[-.078,4.47]],.17);
}

function inductionHead(t){
  // The cylindrical generators face outwards on each end. The two curved
  // radiator banks flank an open iron frame below the crest.
  t.cylinder(charcoal,[0,3.15,0],.80,.80,.33,20,faceRotation);
  t.cylinder(iron,[0,3.15,.18],.724,.724,.063,20,faceRotation);
  for(const hand of [-1,1]){
    const spine=[[hand*.73,2.72],[hand*.73,3.93],[hand*.65,4.03],
      [hand*.34,4.35],[hand*.12,4.40],[hand*.10,4.27],[hand*.27,4.23],
      [hand*.59,3.91],[hand*.61,2.72]];
    t.plate(iron,spine,.24);
    const sector=(angle,r)=>[hand*Math.cos(angle)*r,3.23+Math.sin(angle)*r];
    const angles=Array.from({length:8},(_,i)=>(i/7-.5)*1.21);
    t.plate(iron,[...angles.map(a=>sector(a,1.34)),...angles.slice().reverse().map(a=>sector(a,1.02))],.32);
    for(const angle of angles){
      const inner=sector(angle,1.052),outer=sector(angle,1.275);
      t.link(steel,[...inner,.17],[...outer,.17],.035,.035,5);
    }
    for(const y of [3.06,3.36])t.box(rim,[hand*.88,y,0],[.36,.088,.21]);
    for(const y of [2.95,3.43]){
      const u=hand*.38;
      t.cylinder(rim,[u,y,.235],.219,.219,.145,14,faceRotation);
      t.cylinder(shadow,[u,y,.324],.158,.158,.041,12,faceRotation);
      for(let spoke=0;spoke<6;spoke++){
        const a=spoke*Math.PI/3;
        t.link(hand<0?steel:copper,[u+.048*Math.cos(a),y+.048*Math.sin(a),.353],
          [u+.14*Math.cos(a+.21),y+.14*Math.sin(a+.21),.353],.021,.028,5);
      }
      t.cylinder(steel,[u,y,.37],.057,.057,.039,8,faceRotation);
    }
  }
  t.box(charcoal,[0,3.16,.233],[.235,1.52,.106]);
  for(let i=0;i<11;i++)t.box(rim,[0,2.80+i*.074,.298],[.18,.026,.031]);
  t.cylinder(brass,[0,3.98,.18],.128,.128,.11,10,faceRotation);
  t.box(iron,[0,2.34,0],[.73,.29,.42]);
  t.box(rim,[0,2.53,.43],[.12,.073,.81]);
  wingedCrest(t);
}

function dischargeWeb(s, face){
  // Both banks have their own linked conductors, joined at the tower sockets.
  // Connections share nodes, so the irregular strands leave genuine through-holes.
  const z=face*.39;
  const rows=[
    [[-.84,3.02],[-.51,3.09],[-.25,2.98],[.02,3.12],[.27,3.04],[.54,3.16],[.84,3.08]],
    [[-.84,3.39],[-.55,3.46],[-.30,3.34],[-.08,3.52],[.23,3.42],[.51,3.53],[.84,3.43]],
    [[-.84,3.70],[-.57,3.80],[-.37,3.71],[-.12,3.90],[.14,3.76],[.47,3.84],[.84,3.77]],
  ].map((row,level)=>row.map(([x,y],i)=>[x,y+(face>0||i===0||i===6?0:.055*Math.sin(i*2+level)),z+.027*Math.sin(i+level)]));
  for(let row=0;row<rows.length;row++){
    for(let i=1;i<rows[row].length;i++){
      s.link(arcColors[row],rows[row][i-1],rows[row][i],.018,.016,6);
      if(row<2 && (i+row)%2===1){
        const a=rows[row][i],b=rows[row+1][i];
        const elbow=[(a[0]+b[0])*.5+(i%3-.7)*.087,(a[1]+b[1])*.5,z];
        s.link(arcColors[row],a,elbow,.021,.016,6);
        s.link(arcColors[row+1],elbow,b,.016,.022,6);
      }
    }
  }
}

function lowerRails(s){
  for(const y of [.40,.66,.89,1.17]){
    s.link(y<.7?brass:steel,[-.90,y,0],[.90,y,0],.039,.042,9);
  }
  s.box(rim,[.015,.69,0],[.15,1.20,.18]);
  s.box(iron,[.43,.897,0],[.46,.56,.235]);
  s.box(charcoal,[-.44,1.12,0],[.44,.17,.25]);
  s.cylinder(copper,[-.37,1.02,.09],.123,.123,.24,10,[0,0,Math.PI/2]);
  for(const x of [-.65,-.50,-.16]){
    s.cylinder(rim,[x,1.13,0],.133,.133,.045,8,[0,0,Math.PI/2]);
  }
  for(const face of [-1,1]){
    for(const y of [.37,.68,.99])s.cylinder(steel,[.015,y,face*.104],.043,.043,.035,7,faceRotation);
  }
}

export function generatorShrine(s){
  for(const side of [-1,1]){
    const t=s.child([side*.90,0,0],[0,side*Math.PI/2,0]);
    endFrame(t);
    inductionHead(t);
    const cable=[[0,2.32,.31],[0,2.21,.47],[.035,1.95,.51],[.085,1.56,.49],[.11,1.29,.55]];
    for(let i=1;i<cable.length;i++)t.link(copper,cable[i-1],cable[i],.036,.032,7);
  }
  for(const face of [-1,1]){
    const z=face*.53;
    s.link(iron,[-.9,2.24,z],[.90,2.24,z],.064,.064,9);
    s.box(iron,[0,2.56,z],[.88,.57,.115]);
    for(const x of [-.41,-.11,.19,.41]){
      s.cylinder(rim,[x,2.62,z+face*.067],.038,.038,.026,7,faceRotation);
    }
    for(const x of [-.22,-.08,.08,.22]){
      s.box(shadow,[x,2.37,z+face*.065],[.022,.128,.022],[0,0,x*.6]);
    }
    dischargeWeb(s,face);
  }
  lowerRails(s);
}
