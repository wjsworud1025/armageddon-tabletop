import {paint as p,Sculpt} from './sculpt.mjs';

// Measurements from front and right-side studies, tied to the turntable rim.
// A landmark holds front X, front Y and right-side X. Depth is positive
// towards the front camera. Dimensions of props are in the same study units.
const survey={
  captain:[40,123.55,129.48,218.87],librarian:[40,133.9,130.36,215.32],
  warboss:[50,131.99,134.25,244.05],weirdboy:[50,166.97,131.16,233.32],
};
const blue=0x284778, midnight=0x1a304e, ivory=0xd6d1bc, brass=0xb18b55;
const add=(a,x,y,z)=>[a[0]+x,a[1]+y,a[2]+z];
const mix=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);
const minus=(a,b)=>a.map((v,i)=>v-b[i]);
const line=(s,color,a,b,r1,r2=r1,n=8)=>s.link(color,a,b,r1,r2,n);

function study(parent,kind){
  const [mm,diam,cx,cy]=survey[kind],scale=mm/25.4/diam;
  const s=new Sculpt(parent.T,parent.group,true).child([0,-.14,0],undefined,[scale,scale,scale]);
  const pitch=6*Math.PI/180;
  const P=(x,y,sideX=cx)=>{const z=cx-sideX;return [x-cx,(cy-y+z*Math.sin(pitch))/Math.cos(pitch),z]};
  return {s,P,floor:.14/scale};
}
function mesh(s,color,vertices,indices){
  const geo=new s.T.BufferGeometry();
  geo.setAttribute('position',new s.T.Float32BufferAttribute(vertices.flat(),3));
  geo.setIndex(indices);
  const flat=geo.toNonIndexed();flat.computeVertexNormals();
  s.part(flat,color,[0,0,0],[1,1,1]);
}
function shard(s,base,w,d,h,tilt){
  const vertices=[[-.95,0,.35],[-.54,0,-.98],[.48,0,-.82],[.99,0,.08],[.44,0,.90],[-.4,0,1.03]]
    .map(([x,y,z])=>add(base,x*w,y,z*d));
  for(const [x,y,z] of [[-.69,.57,.33],[-.21,.77,-.7],[.57,.66,-.37],[.53,.48,.45],[-.18,.79,.65]])
    vertices.push(add(base,x*w+tilt*y,y*h,z*d));
  const peak=add(base,tilt,h,-.16*d);vertices.push(peak);
  mesh(s,0x9c9181,vertices,[0,6,1,1,6,7,1,7,2,2,7,8,2,8,3,3,8,9,3,9,4,4,9,10,4,10,5,5,10,6,5,6,0,6,11,7,7,11,8,8,11,9,9,11,10,10,11,6]);
}
function footRocks(s,P,feet,floor){
  for(const pose of feet){
    const [x,sole,z]=P(...pose),height=sole-floor;
    const center=[x-2,floor,z+2];
    shard(s,center,13.8,13.6,height+3,2);
    shard(s,add(center,-5,0,4),13.2,12,height*.68,-3.5);
  }
}
function skull(s,at,size,shade=p.bone){
  const g=s.child(at,[0,.04,0],[size,size,size]);
  g.oval(shade,[0,1.2,0],[3.6,4.0,2.9]);g.box(shade,[0,-1.87,.4],[4.9,3.2,4.0]);
  for(const side of [-1,1])g.oval(p.black,[side*1.51,.31,2.53],[.98,1.0,.44]);
  g.oval(p.leather,[0,-.68,2.7],[.46,.73,.28]);
}
function hoop(s,at,r,thickness,color,teeth=0,rotation){
  const g=s.child(at,rotation),n=16;
  for(let j=0;j<n;j++){
    const a=j*2*Math.PI/n,b=(j+1)*2*Math.PI/n;
    line(g,color,[r*Math.cos(a),r*Math.sin(a),0],[r*Math.cos(b),r*Math.sin(b),0],thickness,thickness,6);
    if(teeth&&j%(n/teeth)===0)line(g,p.gold,[r*Math.cos(a),r*Math.sin(a),0],[(r+4.2)*Math.cos(a),(r+4.2)*Math.sin(a),0],1.1,.12,5);
  }
}
function cloth(s,tops,hems,colors,inside){
  // Separate painted front and reverse. An intermediate fold keeps the shawl
  // visible edge-on as it swings off the shoulders.
  const mid=tops.map((a,i)=>add(mix(a,hems[i],.54),i%2?-1.1:1.1,0,i%2?-3:3));
  for(let i=0;i<hems.length-1;i++){
    const v=[tops[i],tops[i+1],mid[i],mid[i+1],hems[i],hems[i+1]];
    mesh(s,colors[i%colors.length],v,[0,1,2,1,3,2,2,3,4,3,5,4]);
    mesh(s,inside,v,[0,2,1,1,2,3,2,4,3,3,4,5]);
  }
}
function armorLeg(s,hip,knee,foot){
  const ankle=add(foot,0,5,-1);
  line(s,p.black,hip,knee,7.5,7);line(s,blue,mix(hip,knee,.14),mix(hip,knee,.82),9.0,8.8);
  line(s,midnight,knee,ankle,8.7,7.1);line(s,blue,mix(ankle,knee,.11),mix(ankle,knee,.82),7.8,8.6);
  s.oval(blue,add(foot,0,4,2),[8.6,5.4,11.4],[-.13,0,0]);
  s.box(p.iron,add(foot,0,1.4,1.6),[15.2,2.6,17.2]);
  s.oval(blue,add(knee,0,0,4),[9.2,8.7,5.7]);
  line(s,0x55749b,add(knee,-5.3,3.6,8.4),add(knee,4.5,5.1,8.3),.73,.64,5);
}
function armorBody(s,P,where,helmet,wings,lib){
  const [belt,head,shoulders,elbows,hands,knees,feet,pack]=where,at=arr=>P(...arr);
  const hip=at(belt),chest=mix(at(shoulders[0]),at(shoulders[1]),.5);
  for(let i=0;i<2;i++)armorLeg(s,add(hip,(i?1:-1)*8,-1,0),at(knees[i]),at(feet[i]));
  s.oval(p.black,hip,[13,8,10]);
  const rib=mix(hip,chest,.57);
  s.oval(midnight,rib,[17,Math.hypot(...minus(hip,chest))*.60,11]);
  for(let i=1;i<4;i++)s.box(blue,add(mix(hip,chest,.12+i*.11),0,0,9.5),[18+i*1.6,3.2,3.1]);
  s.oval(blue,add(chest,0,-1.2,0),[20,13,13]);
  if(!lib)wings(s.child(add(chest,0,-2,12),undefined,[63,63,63]),0,0,0,p.gold,.19);
  s.box(p.leather,add(hip,0,1,8.9),[26,4.5,4.1]);
  s.box(brass,add(hip,0,1,11.5),[5.2,4.8,2.1]);
  for(let i=0;i<2;i++){
    const sign=i?1:-1,shoulder=at(shoulders[i]),elbow=at(elbows[i]),hand=at(hands[i]);
    line(s,midnight,shoulder,elbow,7,6.4);line(s,blue,mix(shoulder,elbow,.27),mix(shoulder,elbow,.87),7.4,6.2);
    line(s,blue,elbow,hand,7,5);s.oval(lib?p.leather:blue,hand,[5.7,5.5,5.7]);
    for(let j=0;j<3;j++)s.oval(lib?0x72533d:midnight,add(hand,sign*3.4,-1.9+j*1.8,2.2),[2.5,1.2,2.8]);
    const pad=s.child(shoulder,[.08,sign*.11,sign*.29]);
    pad.oval(blue,[0,1,0],[11.7,11.4,11.5]);
    pad.cylinder(blue,[0,-1.9,0],11.3,11.5,6,10,undefined,[1,1,.95]);
    pad.cylinder(brass,[0,-5.0,0],11.7,11.2,2.1,10,undefined,[1,1,.94]);
    s.box(p.leather,add(hip,sign*11,-2,4.7),[6,8,5],[0,sign*.24,sign*.14]);
  }
  const hp=s.child(add(at(head),0,1.6,10),[.04,lib?-.22:-.18,0],[61,60,62]);
  if(lib){
    hp.oval(0x6a7375,[0,.027,0],[.118,.140,.101]);hp.oval(0xafa89b,[0,-.041,.068],[.097,.095,.074]);
    hp.box(p.iron,[0,-.084,.13],[.087,.045,.048]);
    for(const sign of [-1,1]){
      hp.oval(p.black,[sign*.048,.014,.118],[.037,.027,.013]);
      hp.oval(0x83c8c0,[sign*.05,.014,.131],[.018,.010,.006]);
      hp.link(brass,[sign*.072,.091,.043],[sign*.112,.135,.008],.018,.002,7);
    }
  }else{
    helmet(hp,blue,true,0xbe9174);
    hp.box(0x9b715a,[0,-.049,.104],[.047,.008,.010]);
    hp.oval(0x866558,[-.077,-.002,.069],[.032,.074,.025]);
  }
  // Raised gorget and gilded edging frame the visible face.
  for(const sign of [-1,1]){
    const faceRoot=add(at(head),sign*7,-6,11);
    line(s,lib?brass:0x6683a2,faceRoot,add(faceRoot,sign*5,-6,-2),1.8,2.1,7);
    const leg=at(knees[sign<0?0:1]),toe=at(feet[sign<0?0:1]);
    line(s,0x4c6890,add(leg,sign*6,-7,5),add(toe,sign*4,7,7.9),1.3,1,6);
  }
  const back=at(pack);
  s.box(midnight,back,[20,22,11]);s.box(blue,add(back,0,1,-5),[20,20,7]);
  s.cylinder(p.iron,add(back,0,1,-9.1),5.4,5.4,1.8,12,[Math.PI/2,0,0]);
  for(let j=0;j<4;j++)s.box(0x66737e,add(back,0,1,-10.2),[8.8,.9,1],[0,0,j*Math.PI/4]);
  for(const sign of [-1,1]){
    s.oval(blue,add(back,sign*13,4,-.6),[7.1,6.2,7.1]);s.cylinder(p.iron,add(back,sign*13,-.5,-.6),5.8,4.9,4,9);
    s.box(darkSteel,add(back,sign*5,-6,-7),[4,6,2]);
  }
  return {hip,chest,hp};
}
const darkSteel=0x545759;

function captain({s,P,floor},helmet,wings){
  shard(s,[0,floor,0],48,27,15,-12);shard(s,[-20,floor,4],24,19,26,-20);shard(s,[17,floor,-9],17,15,8,3);
  const where=[[125,118,129],[134,73,121],[[108,83,121],[153,82,117]],[[94,84,126],[155,106,110]],[[79,79,128],[162,109,97]],[[104,143,114],[155,159,153]],[[88,177,110],[164,192,145]],[141,79,154]];
  footRocks(s,P,where[6],floor);
  armorBody(s,P,where,helmet,wings,false);
  cloth(s,[[108,72,140],[116,69,143],[129,72,149],[143,75,149],[150,79,141],[154,82,134]].map(v=>P(...v)),
    [[111,157,172],[127,163,179],[152,158,192],[179,153,199],[204,143,190],[225,122,182]].map(v=>P(...v)),
    [p.red,0xa13b33,p.red,ivory,0xe0dbcc],0xb55443);
  // The captain's white cloak border travels behind the shield.
  const honor=s.child(P(102,141,105),[0,-.20,-.24]);
  honor.plate(brass,[[-6,9],[-1,4],[3,5],[7,10],[5,2],[0,0],[-5,2]],1.6);
  skull(honor,[0,4,2],.77,ivory);
  for(let j=0;j<2;j++)honor.box(brass,[0,-6-j*4,1],[10-j*2,1.2,1.6]);
  // Cropped scabbard and holstered sidearm at the hip.
  const holster=s.child(P(111,124,144),[-.12,.22,-.28]);
  holster.box(p.leather,[0,0,0],[7,16,5]);holster.box(p.iron,[0,8,-1],[5,7,4]);
  const stripe=s.child(P(206,133,190),[.18,.2,.21]);
  stripe.plate(blue,[[-3,2],[0,3],[3,2],[4,0],[3,-1],[2,1],[0,2],[-1,1],[-1,-1],[-3,-1]],.5);
  const apron=P(126,136,113);
  for(let n=0;n<4;n++){
    const a=add(apron,(n-1.5)*3,1,0),b=add(a,(n-1)*1.3,-(12+n%2*4),1);
    line(s,p.leather,a,b,2.1,1.6);s.oval(brass,b,[1.4,1.4,.8]);
  }
  skull(s,P(104,143,109),1.3,brass);
  const shield=s.child(P(165,124,86),[.055,-.60,.24]);
  const profile=[[-25,34],[-15,34],[-8,40],[-4,34],[9,36],[13,43],[17,36],[24,32],[24,9],[28,5],[27,-18],[11,-38],[1,-45],[-18,-36],[-26,-22],[-24,-4],[-29,0],[-25,7]];
  shield.plate(brass,profile,4);
  shield.plate(ivory,profile.map(([x,y])=>[x*.92,y*.94]),1,[0,0,2.4]);
  shield.plate(p.iron,[[-8,13],[0,26],[6,16],[14,12],[16,2],[10,-9],[4,-20],[-2,-13],[-12,-9],[-15,0],[-12,10]],1,[0,3,3.1]);
  hoop(shield,[0,4,4.3],9.3,1.2,brass,8);
  skull(shield,[0,4,6],1.65,p.gold);
  for(const sign of [-1,1])for(let j=0;j<3;j++){
    shield.plate(p.iron,[[0,0],[sign*(9-j),3],[sign*6,-2],[sign*2,-4]],.8,[sign*6,11-j*4,4]);
    shield.oval(brass,[sign*19,25-j*19,3.2],[1.5,1.5,.6]);
  }
  shield.plate(p.cream,[[-10,1],[12,5],[11,0],[-8,-6]],.8,[3,-23,3.7]);
  const h=P(79,79,128),tip=P(1,44,144),blade=minus(tip,h),span=Math.hypot(...blade);
  const g=s.child(h);const dir=new s.T.Vector3(...blade).normalize();
  g.group.rotation.z=-Math.atan2(dir.x,dir.y);g.group.rotateX(Math.asin(dir.z));
  g.cylinder(p.leather,[0,1,0],2.4,2.4,11,7);g.box(brass,[0,7,0],[11,2.5,4]);
  g.plate(0x90a4af,[[-2.7,9],[2.7,9],[2.1,span*.86],[0,span],[-2.1,span*.92]],1.4);
  g.plate(0xd8dedc,[[0,9],[2.7,9],[2.1,span*.86],[0,span]],.34,[0,0,.85]);
  hoop(s,P(150,49,140),10,1.3,brass,8,[0,-.21,.1]);
  for(const sign of [-1,1])line(s,brass,P(146+sign*3,65,141),P(150+sign*6,59,141),1.6,1.3,7);
  const red=s.child(P(110,78,127),[-.19,-.20,-.4]);
  for(let n=0;n<4;n++)red.box(n%2?p.red:0xaa5445,[n*2-3,0,0],[2.8,13-n,5]);
}

function librarian({s,P,floor},helmet,wings){
  shard(s,[-11,floor,4],47,25,12,-2);shard(s,[26,floor,-1],28,18,30,28);shard(s,[38,floor,3],21,15,42,35);
  const where=[[122,125,130],[126,69,130],[[96,85,122],[154,81,135]],[[89,98,109],[159,93,109]],[[102,105,107],[171,99,82]],[[105,151,123],[150,144,113]],[[97,193,147],[168,178,109]],[142,66,156]];
  footRocks(s,P,where[6],floor);
  armorBody(s,P,where,helmet,wings,true);
  cloth(s,[[100,74,148],[111,67,153],[122,66,157],[136,70,159],[151,79,151]].map(v=>P(...v)),
    [[81,151,191],[94,150,203],[121,169,195],[145,160,208],[163,140,208]].map(v=>P(...v)),
    [0x292b30,0x39404a,0x212329,0x373d45],0x504e4a);
  const hood=s.child(add(P(126,69,137),0,1,8),[.07,-.16,.05]);
  for(const sign of [-1,1]){
    line(hood,midnight,[sign*8,-7,-4],[sign*9.3,5,-6],2.6,3.2);
    line(hood,blue,[sign*9.3,5,-6],[sign*6,12,-7],3.0,2.4);
    line(hood,brass,[sign*8,-5,4],[sign*8,7,3],1.35,1.1,6);
  }
  line(hood,blue,[-6,12,-7],[6,12,-7],2.8,2.8,8);
  skull(s,P(115,95,113),1.52,ivory);
  for(const sign of [-1,1])line(s,p.gold,P(126+sign*13,70,131),P(118+sign*10,101,114),1.75,1.5,7);
  hoop(s,P(140,40,155),7.8,1.2,brass,8,[0,-.31,-.12]);skull(s,P(140,40,155),.76,brass);
  const belt=P(123,122,121);
  cloth(s,[add(belt,-8,0,4),add(belt,0,0,6),add(belt,8,2,4)],
    [P(75,174,108),P(93,168,111),P(111,152,122)],[0xc0b89d,ivory],p.cream);
  const hand=P(100,102,106),end=P(242,98,53),butt=P(67,106,173);
  line(s,p.leather,butt,end,2.6,2.8);
  for(let i=0;i<15;i++){
    const t=.03+i*.062;line(s,i%3===0?brass:ivory,mix(butt,end,t),mix(butt,end,t+.022),3.0,3.0,7);
  }
  for(const [x,sz] of [[.13,1.03],[.85,1]]){const a=mix(butt,end,x);s.oval(p.red,a,[3.2*sz,3.6*sz,3.2*sz]);}
  const orb=s.child(end,[.05,-.18,0]);
  orb.oval(ivory,[0,0,0],[7.7,8.8,6.5]);orb.oval(0x5f958e,[0,0,5.4],[4.6,4.6,2.9]);orb.oval(0xb6ded5,[0,0,7.4],[2.4,2.4,.9]);
  hoop(orb,[0,0,0],9.4,1.2,brass,8);
  for(const sign of [-1,1])line(orb,p.gold,[sign*4.4,6,-1],[sign*9,13.2,-2],1.7,.22,6);
  // White parchment curls around the heel of the staff and flares behind it.
  const pennant=[P(75,104,163),P(81,104,170),P(90,105,171)];
  cloth(s,pennant,[P(44,94,194),P(50,85,205),P(57,90,202)],[ivory,p.cream],0xc8c5b6);
  line(s,brass,mix(hand,end,.66),P(194,83,78),2.0,1.8,7);
  const knee=s.child(P(147,146,106),[0,-.27,-.25]);hoop(knee,[0,0,1],5.5,1.4,ivory);
  const book=s.child(P(107,124,115),[.17,.26,-.52]);book.box(p.leather,[0,0,0],[11,16,5]);book.box(ivory,[0,0,2.6],[8.5,13,1]);
}

function orkCore(s,P,where,face,wyrd){
  const [belt,head,shoulders,elbows,hands,knees,feet]=where,at=v=>P(...v);
  const hip=at(belt),chest=mix(at(shoulders[0]),at(shoulders[1]),.5),skin=wyrd?0x8d9b50:0x75873f;
  for(let i=0;i<2;i++){
    const sign=i?1:-1,knee=at(knees[i]),foot=at(feet[i]),thigh=add(hip,sign*8,-3,0);
    line(s,wyrd?skin:p.leather,thigh,knee,8.8,7.6);line(s,wyrd?skin:p.black,knee,add(foot,0,4,-1),7.1,5.7);
    for(let j=0;j<4;j++){
      const t=.16+j*.19;
      line(s,wyrd?0xc4b392:j%2?p.iron:p.leather,mix(knee,foot,t),mix(knee,foot,t+.095),7.6-j*.31,7.8-j*.34,8);
    }
    s.oval(wyrd?skin:darkSteel,add(foot,0,3,2),[7.4,4.8,9.8]);
    for(let j=-1;j<=1;j++){
      const toe=add(foot,j*3.25,2.6,9);
      s.oval(wyrd?skin:p.iron,toe,[2.5,2.6,4.1]);
      if(wyrd)line(s,p.bone,add(toe,0,0,1.5),add(toe,0,-.3,4.4),1.4,.4,6);
    }
  }
  s.oval(wyrd?0x363331:p.leather,hip,[16,10,12]);
  const thorax=mix(hip,chest,.65),tall=Math.hypot(...minus(chest,hip))*.56;
  s.oval(wyrd?0x7b854f:0xa29684,thorax,[wyrd?22:24,tall,16],[-.10,0,-.04]);
  for(const side of [-1,1]){
    const shoulder=at(shoulders[side<0?0:1]),collar=add(chest,side*5,-6,.8);
    line(s,wyrd?0x393b34:0x5b5045,collar,shoulder,9.3,8.5,9);
  }
  const h=add(at(head),0,0,3.5),headNode=s.child(h,[.02,wyrd?-.10:.09,wyrd?.02:-.03],wyrd?[60,74,72]:[74,77,75]);
  face(headNode,false,0,true);
  for(let i=0;i<2;i++){
    const sign=i?1:-1,origin=at(shoulders[i]),elbow=at(elbows[i]),hand=at(hands[i]);
    s.oval(skin,origin,[10.6,11.1,10]);line(s,skin,origin,elbow,9.8,7.4);
    s.oval(skin,elbow,[7.9,7.2,7.9]);line(s,skin,elbow,hand,7.1,4.7);
    s.oval(skin,hand,[5.7,5.1,5.5]);
    for(let k=0;k<3;k++)s.oval(skin,add(hand,sign*3.2,-2.4+k*2.4,3.3),[2.7,1.5,2.5]);
    const cuff=mix(elbow,hand,.59);line(s,wyrd?0x7c705a:p.leather,cuff,mix(elbow,hand,.91),6.9,5.4,8);
    if(!wyrd)line(s,p.iron,mix(elbow,hand,.67),mix(elbow,hand,.71),7.0,6.9,8);
  }
  s.box(p.leather,add(hip,0,2,10),[27,6,4]);s.box(brass,add(hip,0,2,12.6),[7,4,1.8]);
  for(const sign of [-1,1])line(s,p.leather,add(chest,sign*14,3,4),add(hip,-sign*8,5,9),2.5,2.8,7);
  return {h,hip,chest,headNode,skin};
}
function warboss({s,P,floor},face){
  shard(s,[-20,floor,4],23,20,13,-5);shard(s,[19,floor,-6],20,19,11,5);
  const where=[[129,170,143],[125,126,102],[[94,133,107],[148,109,125]],[[82,154,95],[161,97,116]],[[98,168,81],[172,75,117]],[[107,197,123],[150,194,177]],[[100,222,118],[155,223,178]]];
  footRocks(s,P,where[6],floor);
  const {h,hip,chest}=orkCore(s,P,where,face,false);
  for(const sign of [-1,1]){
    line(s,p.bone,add(h,sign*7,5,6),add(h,sign*16,7,10),3.4,1.9);
    line(s,ivory,add(h,sign*16,7,10),add(h,sign*20,12,14),2.0,.19);
  }
  const jaw=s.child(add(h,0,-6,9),[.08,0,0]);
  jaw.plate(p.iron,[[-11,3],[-8,-5],[-4,-8],[5,-8],[10,-3],[11,4],[7,0],[0,-2],[-6,0]],2.9);
  s.oval(p.iron,add(h,-4,2,9.7),[4.6,4,2.2]);s.oval(0x9ed4cf,add(h,-4.2,2.2,11.8),[2.1,1.7,.55]);
  const armor=s.child(P(144,111,129),[.17,-.10,.28]);
  armor.plate(p.iron,[[-13,-9],[-14,3],[-9,12],[8,13],[15,4],[13,-10]],14);
  for(let r=0;r<2;r++)for(let c=0;c<4;c++)if((r+c)%2===0)armor.box(ivory,[(c-1.5)*5,2+r*4,7.3],[4.9,3.95,.7]);
  const breast=s.child(add(mix(hip,chest,.44),1,0,17),[.04,0,-.15]);
  breast.plate(darkSteel,[[-15,10],[-5,13],[8,10],[15,13],[13,-6],[5,-13],[-5,-12],[-12,-6]],3.4);
  skull(breast,[1,0,2.2],1.62,p.iron);
  for(const side of [-1,1]){
    breast.oval(brass,[side*10,6.1,2.1],[1.2,1.2,.8]);
    line(s,0x5c503f,add(chest,side*18,-1,11),add(hip,side*8,6,17),3.9,3.8,8);
    line(s,0x92775b,add(chest,side*18,-1,14.6),add(hip,side*8,6,20.5),.70,.64,6);
  }
  jaw.box(darkSteel,[0,-4,4.8],[13,4.8,3.4]);
  for(let j=-2;j<=2;j++)jaw.box(p.steel,[j*2.45,-4,7],[.98,2.9,1.1]);
  for(let j=0;j<5;j++)line(s,p.bone,add(hip,-11+j*5,2,12),add(hip,-10+j*5,-3,14),1.5,.25,5);
  // A broad steel shoulder shell, studded gloves and the plated boots
  // break up the exposed green of the arms at playing distance.
  const shoulder=s.child(P(96,132,110),[.21,.16,-.36]);
  shoulder.oval(darkSteel,[0,1,0],[13.5,10.4,12.7]);
  shoulder.plate(p.iron,[[-12,2],[-9,8],[4,10],[11,6],[14,-2],[8,-7],[-6,-7]],3,[0,0,10]);
  for(const sign of [-1,1]){
    line(shoulder,p.steel,[sign*7,5,9],[sign*11,7,5],1.2,.8,6);
    shoulder.oval(brass,[sign*7,0,11.8],[1.4,1.4,.65]);
  }
  for(const [a,b] of [[where[3][0],where[4][0]],[where[3][1],where[4][1]]]){
    const lower=P(...a),palm=P(...b);
    line(s,p.leather,mix(lower,palm,.46),mix(lower,palm,.83),8.0,6.5);
    line(s,darkSteel,mix(lower,palm,.53),mix(lower,palm,.68),8.2,7.8);
    s.oval(p.iron,add(palm,0,-.6,3.8),[6,5.4,3.1]);
  }
  for(const [i,k] of where[5].entries()){
    const knee=P(...k),foot=P(...where[6][i]);
    s.oval(p.iron,add(knee,0,-1,5.1),[7.8,9.0,4.2]);
    s.box(darkSteel,add(foot,0,3.9,6.3),[14.7,5.5,13],[.08,0,0]);
    for(const sign of [-1,1])s.oval(p.steel,add(knee,sign*4.4,2.6,8.3),[1.1,1.1,.7]);
  }
  for(let j=0;j<4;j++){
    const pouch=s.child(add(hip,-13+j*8.1,-2.1,11.3),[.08,0,(j-1.5)*.14]);
    pouch.box(p.leather,[0,0,0],[6.8,9.4,5.2]);pouch.box(darkSteel,[0,2.4,3],[6.2,3.4,1.3]);
  }
  // The actual head is a transverse crescent power axe with a toothed edge.
  const eye=P(152,30,166),poleEnd=P(180,91,109);
  line(s,p.leather,poleEnd,eye,2.3,1.9);
  for(let j=0;j<6;j++)line(s,j%2?p.iron:brass,mix(poleEnd,eye,j*.13),mix(poleEnd,eye,j*.13+.031),2.8,2.75,7);
  const cutter=s.child(eye,[-.22,1.38,.04]);
  const crescent=[[-17,1],[-13,13],[-4,22],[8,24],[15,20],[5,16],[3,9],[8,4],[14,-4],[13,-16],[7,-22],[4,-12],[-2,-8],[-9,-6],[-13,-11]];
  cutter.plate(p.iron,crescent,4.3);cutter.oval(darkSteel,[0,2,2.4],[6.2,7,2.6]);
  cutter.cylinder(brass,[0,2,5],2.9,3.7,2.3,9,[Math.PI/2,0,0]);
  for(const [x,y,dx,dy] of [[-16,2,-3,3],[-14,9,-3,3],[-9,17,-2,3],[-3,22,0,3],[5,24,1,3],[12,21,3,1],[13,-9,3,-2],[10,-17,2,-3]]){
    cutter.plate(p.steel,[[0,0],[dx,dy],[3,0]],3.4,[x,y,0]);
  }
  const cable=[poleEnd,P(186,105,99),P(190,119,100),P(173,129,116),P(152,137,145)];
  for(let j=1;j<cable.length;j++)for(let n=0;n<4;n++)
    line(s,n%2?0xb99c45:p.black,mix(cable[j-1],cable[j],n/4),mix(cable[j-1],cable[j],(n+1)/4),1.9,1.9,7);
  const grip=P(98,168,81),muzzle=P(148,202,47),gun=s.child(grip);
  const d=new s.T.Vector3(...minus(muzzle,grip)).normalize();
  gun.group.quaternion.setFromRotationMatrix(new s.T.Matrix4().lookAt(d,new s.T.Vector3(),new s.T.Vector3(0,1,0)));
  const span=Math.hypot(...minus(muzzle,grip));
  gun.box(p.iron,[0,0,span*.24],[14,13,span*.67]);gun.box(darkSteel,[0,5.9,span*.27],[16,4,span*.65]);
  for(const sign of [-1,1]){
    gun.cylinder(p.iron,[sign*4,.7,span*.72],4.1,4.5,span*.55,9,[Math.PI/2,0,0]);
    gun.cylinder(p.steel,[sign*4,.7,span*.94],4.7,4.4,span*.12,9,[Math.PI/2,0,0]);
    gun.cylinder(p.black,[sign*4,.7,span*1.006],2.9,2.9,1.1,8,[Math.PI/2,0,0]);
  }
  for(let j=0;j<6;j++)gun.box(brass,[7.7,-1.1,4+j*4.3],[1.4,6,1.8]);
  gun.oval(p.red,[-7.4,.1,3],[1.4,3.2,3.2]);gun.cylinder(p.iron,[0,-7,8],8,8,9,10,[0,0,Math.PI/2]);
  // Banner crossbar, pelt, and red canister on the rear harness.
  s.oval(p.red,P(117,149,154),[11,20,9],[.1,0,-.26]);
  for(let j=0;j<2;j++)s.box(p.leather,P(117,137+15*j,161),[20,3,4],[0,0,-.20]);
  const a=P(76,44,118),b=P(121,36,123);
  line(s,p.iron,P(125,163,153),P(88,29,117),2.4,1.75);line(s,p.leather,a,b,2.3,2.0);
  const banner=s.child(P(99,65,128),[.09,-.22,.32]);
  banner.plate(p.black,[[-24,21],[19,20],[20,8],[26,-5],[20,-8],[18,-16],[12,-13],[5,-24],[-2,-27],[-5,-32],[-13,-29],[-20,-35],[-22,-19]],1.3);
  banner.plate(p.red,[[-14,10],[-3,15],[12,11],[15,0],[10,-13],[-2,-19],[-15,-8]],.53,[0,0,1]);
  skull(banner,[0,-2,2],1.53,ivory);
  for(const sign of [-1,1])line(banner,ivory,[sign*3,0,2],[sign*10,5,2.1],2.1,.18,7);
  skull(s,P(71,76,128),1.05);skull(s,P(88,33,121),.9,darkSteel);
}

function weirdboy({s,P,floor},face){
  for(const [x,z,w,d,h,t] of [[-36,0,20,16,13,-14],[-17,-20,27,14,19,-6],[7,-19,24,16,17,15],[29,-4,22,24,28,20],[42,5,16,13,15,8],[-30,12,13,10,21,-14]])
    shard(s,[x,floor,z],w,d,h,t);
  const where=[[130,158,144],[128,111,97],[[102,124,111],[150,124,125]],[[89,139,102],[163,147,109]],[[96,154,83],[155,163,79]],[[102,178,121],[153,173,142]],[[90,207,126],[168,193,154]]];
  footRocks(s,P,where[6],floor);
  const {h}=orkCore(s,P,where,face,true);
  s.oval(0x512635,add(h,.1,-4.6,15.8),[5.5,4.8,2.2]);
  for(const sign of [-1,1]){
    s.oval(0xa34c64,add(h,sign*4.5,.2,13.0),[4.6,3.4,2.1]);
    s.oval(0xe78fa4,add(h,sign*4.6,.5,14.9),[2.3,1.7,.9]);
    s.oval(0xfbdbc7,add(h,sign*4.7,.6,15.7),[.91,.73,.34]);
    line(s,p.bone,add(h,sign*3.8,-6.1,17.0),add(h,sign*4.1,-1.5,17.3),1.3,.21,6);
  }
  const jacket=s.child(P(131,133,117),[-.12,.05,.07]);
  jacket.oval(0x797b4a,[0,1,1],[13,15.5,10]);
  jacket.plate(0x37382f,[[-13,12],[-8,15],[-6,1],[-2,-10],[4,-11],[9,12],[13,10],[11,-12],[5,-17],[-8,-15]],2,[0,0,8.0]);
  jacket.oval(darkSteel,[0,1,10.3],[6.4,7,2.8]);jacket.oval(0x98a45f,[0,1,12.3],[4.8,5.0,1.6]);
  for(const sign of [-1,1])line(jacket,p.leather,[sign*9,11,8],[sign*5,-10,8.2],2.4,2.3,7);
  // Five individual black coat tails sweep well behind the feet in profile.
  const roots=[[106,148,137],[115,148,145],[125,150,149],[139,150,147],[148,149,140],[152,148,135]].map(v=>P(...v));
  const ends=[[58,175,225],[93,181,204],[108,185,228],[130,181,218],[145,175,238],[171,171,222]].map(v=>P(...v));
  for(let j=0;j<5;j++){
    const left=roots[j],right=roots[j+1],end=ends[j];
    const lower=add(mix(mix(left,right,.5),end,.72),0,-5.2,0);
    mesh(s,j%2?0x353539:0x232528,[left,right,add(lower,-4,0,2),add(lower,4,0,-1),end],
      [0,1,2,1,3,2,2,3,4,0,2,1,1,2,3,2,4,3]);
  }
  // The conductors bend independently. Several terminate in forks or rings
  // rather than the same tip repeated around the head.
  const rack=P(127,102,140);
  const arms=[
    [[111,96,132],[82,100,127],[73,69,159],[41,55,178],'comb'],
    [[119,90,130],[96,64,131],[104,32,131],[98,14,131],'plug'],
    [[137,90,139],[133,55,134],[151,37,130],[158,16,125],'fork'],
    [[143,98,145],[164,95,158],[189,82,176],[204,53,183],'ring'],
    [[148,106,146],[178,122,151],[194,121,164],[221,94,182],'fork'],
  ];
  s.oval(darkSteel,rack,[25,12,10]);
  for(const [a,b,c,d,tip] of arms){
    const points=[a,b,c,d].map(v=>P(...v));
    for(let j=1;j<4;j++){
      const u=points[j-1],v=points[j];
      line(s,j===2?0x6c5255:darkSteel,u,v,2.9-j*.27,2.7-j*.3);
      for(let n=0;n<3;n++){
        const t=.14+n*.31;
        line(s,n%2?0x9b6b6f:brass,mix(u,v,t),mix(u,v,t+.070),2.7-j*.27,2.7-j*.27,7);
      }
    }
    const end=points[3],dxy=minus(end,points[2]),q=1/Math.hypot(...dxy),v=dxy.map(n=>n*q);
    const g=s.child(end);g.group.rotation.z=-Math.atan2(v[0],v[1]);g.group.rotateX(Math.asin(v[2]));
    if(tip==='ring')hoop(g,[0,1,0],4.5,.91,0xaa7881,0);
    else if(tip==='fork')for(const sign of [-1,1]){
      line(g,0x8b6370,[0,-1,0],[sign*3.1,1,0],1.6,1.4);
      line(g,0xad7e82,[sign*3.1,1,0],[sign*3.6,9,0],1.4,1.0);
    }else{
      g.box(0x9c6e78,[0,.8,0],[tip==='comb'?6:10,3.6,3.9]);
      for(let j=0;j<3;j++)g.box(darkSteel,[(j-1)*2.8,4.0,0],[1.7,3.1,2.7]);
    }
  }
  for(const [x,y,z,xx,yy,zz] of [[110,99,130,91,65,157],[121,92,132,117,62,143],[136,91,139,138,67,139],[146,100,141,161,71,150],[150,105,144,177,75,169]]){
    const a=P(x,y,z),b=P(xx,yy,zz);line(s,darkSteel,a,b,4.3,3.0,9);
    for(let j=0;j<5;j++)line(s,j%2?brass:0x89646d,mix(a,b,.19+j*.15),mix(a,b,.25+j*.15),4.1-j*.17,4.1-j*.17,8);
  }
  const points=[P(22,146,86),P(206,169,80)];
  line(s,p.leather,...points,3.0,3.2);
  for(let j=0;j<18;j++){
    const t=.07+j*.050;line(s,j%4===0?darkSteel:0x97676b,mix(...points,t),mix(...points,t+.022),3.5,3.5,7);
  }
  s.oval(brass,points[1],[5.5,5.8,5.0]);
  const head=P(43,145,85);skull(s,head,2.05,ivory);
  for(let j=0;j<8;j++){
    const a=j*Math.PI/4,x=Math.cos(a),y=Math.sin(a),base=add(head,x*8,y*8,0);
    line(s,brass,base,add(base,x*6.1,y*7.3,0),2.3,.25,7);
  }
  for(let j=0;j<5;j++)s.oval(brass,add(head,-4+j*2,-9-j%2*3,1),[.8,2,.9]);
  // Angular rose-coloured psychic discharge between the crown and staff.
  const arc=[[47,140,86],[59,125,90],[66,135,96],[75,114,111],[81,118,114],[79,98,121],[93,109,118],[111,99,112]].map(v=>P(...v));
  for(let j=1;j<arc.length;j++)line(s,j%2?0xb87288:0xd096ab,arc[j-1],arc[j],1.45,1.05,6);
  skull(s,[38,floor+2.4,24],1.06);
}

export function character(parent,kind,face,wings){
  const observed=study(parent,kind);
  if(kind==='captain')captain(observed,face,wings);
  else if(kind==='librarian')librarian(observed,face,wings);
  else if(kind==='warboss')warboss(observed,face);
  else weirdboy(observed,face);
}
