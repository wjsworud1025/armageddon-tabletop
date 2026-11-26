// Two lockcrete castings joined by exposed tie rods. The decorated faces
// point toward -Z and the outer ground braces project toward +Z.
const stone=0x626262, lip=0x92866b, armor=0x62635b, iron=0x494b4f;
const steel=0x6d6e6a, silver=0xb3afa7, bronze=0x514b40, shadow=0x373a36;
const postX=[-1.78,-.16,.16,1.78];
const railZ=y=>-.42+Math.max(0,y-1.43)*.32;

function badge(s,x) {
  const at=s.child([x,.66,-.588]);
  for(const side of [-1,1]){
    const wing=(points,color,z)=>at.plate(color,points.map(([u,v])=>[side*u,v]),.014,[0,0,z]);
    wing([[.03,.14],[.48,.20],[.43,.13],[.14,.08],[.08,.03]],bronze,0);
    for(let i=0;i<5;i++){
      const u=.10+i*.073,v=.09+i*.014;
      wing([[u,v],[u+.09,v+.012],[u+.033,v-.115],[u-.034,v-.148]],bronze,0);
    }
    wing([[.008,.075],[.02,.18],[.073,.235],[.145,.195],[.089,.173],[.086,.112],[.048,.052]],bronze,-.003);
  }
  at.plate(bronze,[[-.074,.08],[.069,.08],[.09,-.04],[.032,-.12],[.048,-.21],[0,-.17],[-.047,-.21],[-.035,-.115],[-.085,-.04]],.022);
}

function panel(s,x) {
  const bay=s.child([x,0,0]);
  bay.plate(stone,[[-.86,0],[.86,0],[.86,1.34],[.73,1.34],[.59,1.12],
    [.29,1.12],[.15,1.35],[-.16,1.35],[-.30,1.12],[-.59,1.12],[-.74,1.34],[-.86,1.34]],.30,[0,0,-.405]);
  bay.plate(shadow,[[-.69,.11],[.68,.11],[.70,.95],[.59,1.014],[-.60,1.014],[-.70,.94]],.026,[0,0,-.553]);
  bay.plate(armor,[[-.655,.15],[.647,.15],[.664,.917],[.575,.972],[-.58,.972],[-.662,.906]],.022,[0,0,-.57]);
  badge(s,x);
  for(const u of [-.62,.62])for(const y of [.205,.875])
    bay.link(silver,[u,y,-.58],[u,y,-.604],.029,.024,6);
  bay.box(lip,[0,.115,-.398],[1.72,.23,.38]);
  for(const y of [.13,.57,1.04])bay.link(steel,[-.81,y,-.215],[.81,y,-.215],.052,.052,9);
  for(const u of [-.58,-.20,.20,.58])
    bay.plate(iron,[[.255,.014],[-.015,.014],[-.009,.515],[.078,.684],[.235,.72]],.091,[u,0,0],[0,Math.PI/2,0]);
  for(const u of [-.51,.51])for(const y of [1.49,1.94,2.37]){
    const z=railZ(y);
    bay.link(silver,[u-.034,y,z],[u+.034,y,z],.076,.076,10);
    bay.link(bronze,[u+.034,y,z],[u+.049,y,z],.067,.066,10);
  }
}

function lattice(s,x) {
  // Clip each diagonal to its own bay. The spaces between strips remain
  // physically open from front to back, including to the game's sight probe.
  const w=.735, h=.126, pitch=.139;
  const grid=s.child([x,2.15,railZ(2.15)],[Math.atan(.32),0,0]);
  for(const y of [-h,h])grid.box(steel,[0,y,0],[2*w,.042,.064]);
  for(const slope of [-1,1])for(let i=-7;i<=7;i++){
    const offset=i*pitch;
    const a=Math.max(-w,offset-h),b=Math.min(w,offset+h);
    if(a>=b)continue;
    grid.link(silver,[a,slope*(a-offset),0],[b,slope*(b-offset),0],.019,.019,6);
  }
}

export function lockcreteBarricade(s) {
  for(const x of [-.97,.97]){panel(s,x);lattice(s,x);}
  for(const x of postX){
    s.box(iron,[x,.706,-.416],[.157,1.41,.277]);
    s.link(steel,[x,1.355,railZ(1.355)],[x,2.49,railZ(2.49)],.092,.082,8);
    s.box(iron,[x,2.466,railZ(2.466)],[.167,.142,.173],[Math.atan(.32),0,0]);
    for(const y of [1.49,1.94,2.37])
      s.box(iron,[x,y,railZ(y)],[.184,.147,.173],[Math.atan(.32),0,0]);
    for(const y of [.13,.57,1.04,1.49,1.94,2.37]){
      const z=y>1.42?railZ(y)-.078:-.54;
      s.link(steel,[x,y,z],[x,y,z-.041],.043,.037,6);
    }
  }
  for(const y of [1.49,1.94,2.37]){
    const z=railZ(y);
    s.link(steel,[-1.84,y,z],[1.84,y,z],.056,.056,12);
  }
  for(const y of [.13,.57,1.04])
    s.link(iron,[-.17,y,-.413],[.17,y,-.413],.041,.041,8);
  for(const side of [-1,1]){
    const x=side*1.78;
    s.box(iron,[x,.056,-.004],[.24,.112,1.245]);
    // In this rotated profile horizontal u maps to -Z.
    s.plate(steel,[[-.605,.096],[.24,.096],[.32,.265],[.17,.255],[-.40,.165]],.098,[x,0,0],[0,Math.PI/2,0]);
    s.box(steel,[x,.23,-.444],[.215,.43,.287]);
  }
}
