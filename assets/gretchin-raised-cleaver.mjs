import {paint as p} from './sculpt.mjs';

// Inches above the top of the 25 mm plinth. The figure leans over the gun
// hand; its two boots take the weight at different heights and depths.
const skin=0xc4c398, highlight=0xd5d3a9, skinShade=0x9c9c72;
const trousers=0x8b623e, fold=0x6a4934, vest=0x433d3e, seam=0x71615a;
const boot=0x313236, worn=0x555658, iron=0x46454b, steel=0xa9aaa7;
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const off=(a,x,y,z)=>[a[0]+x,a[1]+y,a[2]+z];

function section(s,color,from,to,radii){
  // Turn the long muscle or boot fold along the line of the limb.
  const delta=new s.T.Vector3(...to).sub(new s.T.Vector3(...from));
  const node=s.oval(color,mix(from,to,.5),[radii[0],delta.length()/2,radii[1]]);
  node.quaternion.setFromUnitVectors(new s.T.Vector3(0,1,0),delta.normalize());
}

function leather(s,positions,faces,checks){
  const g=new s.T.BufferGeometry();
  g.setAttribute('position',new s.T.Float32BufferAttribute(positions.flat(),3));
  g.setIndex(faces.flat());g.computeVertexNormals();
  const painted=g.toNonIndexed(),colors=[];
  const dark=new s.T.Color(vest),wornCheck=new s.T.Color(0x746f70);
  for(let i=0;i<faces.length;i++){
    const pigment=checks.has(i)?wornCheck:dark;
    for(let j=0;j<3;j++)colors.push(pigment.r,pigment.g,pigment.b);
  }
  painted.setAttribute('color',new s.T.Float32BufferAttribute(colors,3));
  s.part(painted,vest,[0,0,0],[1,1,1]);
}

function waistcoat(s){
  // A slit down the front exposes the belly. The side seams dip beneath
  // each arm; the back hem hangs below the belt on the knife side.
  const shape=s.child([.075,0,-.090],[0,-.24,0]);
  const angles=[24,48,69,91,106,117,145,178,211,240,267,291,316,339];
  // The free leather corner turns out beside the hip. The underside at
  // the fold can be seen from the front and the slit opens below it.
  const hem={
    24:[.118,.471,.110],48:[.145,.448,.080],69:[.180,.418,.045],
    91:[.218,.399,-.007],106:[.203,.399,-.043],117:[.180,.402,-.092],
    145:[.112,.397,-.134],
  };
  const rings=[],positions=[],faces=[];
  for(const [row,y,rx,rz] of [[0,.378,.152,.113],[1,.414,.134,.106],[2,.495,.125,.101],[3,.590,.133,.083]]){
    const ring=angles.map((deg,i)=>{
      const a=deg*Math.PI/180;
      let x=rx*Math.sin(a),z=rz*Math.cos(a),h=y;
      const scallop=.014*Math.sin(3*a)-.024*Math.max(0,Math.sin(a));
      if(row===0)h+=scallop;
      if(hem[deg]){
        const w=[1,.70,.27,0][row],edge=hem[deg];
        x+=w*(edge[0]-.152*Math.sin(a));
        h+=w*(edge[1]-.378-scallop);
        z+=w*(edge[2]-.113*Math.cos(a));
      }
      const side=Math.max(0,1-Math.abs(deg-94)/65);
      const back=Math.max(0,1-Math.abs(deg-164)/78);
      x+=[0,.029,.026,0][row]*side;
      z-=[.017,.038,.038,0][row]*back;
      const shoulder=Math.max(0,1-Math.abs(deg-152)/56);
      z-=[0,0,.016,.040][row]*shoulder;
      h+=[0,0,.004,.013][row]*shoulder;
      if(row===3)h+=.033*Math.cos(2*a)+.015*Math.sin(a)-(i===0||i===angles.length-1?.028:0);
      return [x,h,z];
    });rings.push(ring);positions.push(...ring);
  }
  const n=angles.length,outer=positions.length;
  for(const r of rings)for(const [x,h,z] of r)positions.push([x*.90,h,z*.90]);
  const checks=new Set();
  const quad=(a,b,c,d)=>faces.push([a,b,c],[a,c,d]);
  for(let k=0;k<3;k++)for(let j=0;j<n-1;j++){
    // Two staggered rows of faded checks on the outward fold.
    if((k===0&&(j===1||j===3))||(k===1&&j===2)){
      checks.add(faces.length);checks.add(faces.length+1);
    }
    const a=k*n+j;quad(a,a+1,a+n+1,a+n);
    quad(outer+a,outer+a+n,outer+a+n+1,outer+a+1);
  }
  for(let j=0;j<n-1;j++){
    quad(j,outer+j,outer+j+1,j+1);
    const a=3*n+j;quad(a,a+1,outer+a+1,outer+a);
  }
  for(let k=0;k<3;k++)for(const j of [0,n-1]){
    const a=k*n+j;
    if(j===0)quad(a,a+n,outer+a+n,outer+a);else quad(a,outer+a,outer+a+n,a+n);
  }
  leather(shape,positions,faces,checks);
  for(const k of [0,3])for(let j=1;j<n;j++)shape.link(seam,rings[k][j-1],rings[k][j],.005,.005,6);
  for(const j of [0,n-1])for(let k=0;k<3;k++)
    shape.link(seam,rings[k][j],rings[k+1][j],.006,.005,6);
  // One leather front overlaps the belly below the chin; the second front
  // turns back toward the raised arm and carries the pendant.
  s.plate(vest,[[-.035,.432],[-.043,.498],[-.023,.561],[.004,.586],
    [.061,.539],[.103,.49],[.139,.405],[.079,.398],[.019,.410]],.013,
    [0,0,.046],[0,-.13,0]);
  s.link(seam,[.057,.537,.059],[.102,.486,.067],.005,.006,6);
  s.link(seam,[.102,.486,.067],[.139,.405,.071],.006,.005,6);
  s.link(seam,[.019,.410,.055],[.077,.398,.061],.005,.005,6);
  for(const j of [4,6,8])shape.link(0x554b49,rings[0][j],
    mix(rings[0][j],rings[1][j],.89),.004,.001,5);
}

function foot(s,heel,yaw,pitch){
  const b=s.child(heel,[pitch,yaw,0]);
  const sole=[[-.052,-.072],[.054,-.073],[.071,-.046],[.078,.087],
    [.058,.146],[.020,.166],[-.050,.158],[-.074,.111],[-.071,-.043]];
  b.plate(0x25272b,sole.map(([x,z])=>[x,z]),.027,[0,.003,.036],[Math.PI/2,0,0]);
  b.oval(boot,[0,.044,.060],[.072,.051,.126],[-.10,0,0]);
  b.oval(0x3b3a3c,[0,.075,-.014],[.059,.069,.073],[.05,0,0]);
  for(const [z,h] of [[.017,.091],[.066,.088],[.118,.071]]){
    for(const sign of [-1,1])
      b.link(worn,[sign*.067,h-.020,z-.009],[sign*.025,h+.001,z+.018],.010,.008,6);
  }
  b.cylinder(worn,[0,.115,-.019],.057,.060,.020,10,[.08,0,0],[1,1,.98]);
}

function head(s){
  const h=s.child([.101,.705,.021],[0,-.57,-.08]);
  h.oval(skin,[0,.004,0],[.106,.079,.112],[.12,0,0]);
  h.oval(highlight,[0,.026,.048],[.093,.056,.076],[.15,0,0]);
  // Both ears taper sideways, with an inset ruddy fold on the inner face.
  for(const sign of [-1,1]){
    const ear=h.child([sign*.075,-.006,.000],[.10,-sign*.29,sign*.09]);
    ear.plate(skin,[[0,-.029],[sign*.050,-.049],[sign*.099,-.016],[sign*.139,.016],[sign*.113,.021],[sign*.045,.031],[0,.018]],.024);
    ear.plate(0x968266,[[sign*.028,-.005],[sign*.066,-.026],[sign*.116,.008],[sign*.062,.011]],.008,[0,0,.017]);
    h.oval(skinShade,[sign*.064,-.018,.084],[.046,.054,.051],[-.12,0,sign*.18]);
    h.oval(0x34322c,[sign*.058,.015,.102],[.039,.027,.022],[0,sign*.32,sign*.26]);
    h.oval(0xd08e4f,[sign*.060,.012,.122],[.016,.010,.007],[0,sign*.30,sign*.23]);
    h.oval(0x211e1d,[sign*.060,.014,.128],[.005,.008,.003]);
    section(h,highlight,[sign*.015,.027,.126],[sign*.090,.056,.074],[.025,.022]);
  }
  // Flattened nose bridge and a hooked, pointed tip.
  section(h,highlight,[0,.038,.065],[0,-.003,.166],[.040,.028]);
  h.link(skin,[0,.009,.131],[-.007,-.022,.211],.036,.024,10);
  h.link(highlight,[-.007,-.019,.199],[-.012,-.043,.247],.027,.003,9);
  for(const sign of [-1,1]){
    h.oval(skinShade,[sign*.028,-.020,.158],[.020,.013,.026]);
    h.oval(0x544c3d,[sign*.036,-.022,.177],[.009,.005,.008]);
  }
  for(const sign of [-1,1])
    section(h,skin,[sign*.077,-.019,.066],[.024+sign*.061,-.112,.085],[.026,.031]);
  const mouth=h.child([.028,-.113,.086],[-.30,0,0]);
  mouth.oval(skinShade,[0,-.007,-.020],[.073,.066,.058],[.20,0,0]);
  mouth.oval(0x382125,[0,.014,.020],[.065,.052,.023],[-.17,0,0]);
  mouth.oval(0x9f4e4f,[0,-.012,.041],[.038,.013,.012],[-.28,0,0]);
  mouth.oval(skin,[0,-.038,.032],[.067,.020,.040],[-.30,0,0]);
  for(const sign of [-1,1]){
    mouth.link(skin,[sign*.062,-.018,.025],[sign*.068,.025,.008],.015,.012,8);
    mouth.link(p.bone,[sign*.049,-.023,.053],[sign*.052,.003,.052],.012,.003,7);
    mouth.link(p.bone,[sign*.037,.048,.035],[sign*.033,.023,.049],.012,.002,7);
  }
  for(const x of [-.016,.011])mouth.link(p.cream,[x,-.024,.061],[x,-.014,.061],.007,.001,6);
}

function firearm(s){
  const base=[-.078,.421,.055],muzzle=[-.258,.93,.285];
  const part=s.child(base),axis=new s.T.Vector3(...muzzle).sub(new s.T.Vector3(...base)).normalize();
  const side=new s.T.Vector3(1,0,0).cross(axis).normalize(),across=axis.clone().cross(side).normalize();
  part.group.quaternion.setFromRotationMatrix(new s.T.Matrix4().makeBasis(across,axis,side));
  const len=Math.hypot(...muzzle.map((v,i)=>v-base[i]));
  part.box(iron,[0,.115,0],[.097,.292,.084],[0,0,.012]);
  part.box(0x28282d,[0,.112,.043],[.086,.226,.022]);
  part.cylinder(steel,[0,(len+.224)/2,.001],.031,.037,len-.224,12);
  part.cylinder(0xb7b7b1,[0,len-.076,.001],.049,.047,.021,12);
  part.cylinder(steel,[0,len-.019,.001],.040,.043,.040,12);
  part.cylinder(0x26272b,[0,len+.002,.001],.023,.023,.004,12);
  part.link(iron,[.037,.236,-.024],[.040,len-.043,-.022],.013,.012,8);
  for(const sign of [-1,1]){
    part.box(0x65666b,[0,.073,sign*.050],[.070,.147,.010]);
    for(const y of [.025,.096,.18])part.oval(0xa19d99,[.023,y,sign*.058],[.009,.009,.004]);
  }
  // The square butt and the curved magazine sit on opposite sides of the receiver.
  for(const [from,to,r] of [[base,[-.079,.336,.062],.036],[[-.079,.336,.062],[-.140,.245,.085],.028]])
    s.link(iron,from,to,r,r*.78,8);
  s.box(steel,[-.136,.246,.083],[.090,.024,.066],[.14,-.14,-.20]);
  const root=[-.165,.538,.158],far=[-.286,.491,.283];
  const magazine=s.child(root),out=new s.T.Vector3(...far).sub(new s.T.Vector3(...root));
  const length=out.length();out.normalize();
  const front=out.clone().cross(new s.T.Vector3(0,1,0)).normalize();
  magazine.group.quaternion.setFromRotationMatrix(new s.T.Matrix4().makeBasis(out,front.clone().cross(out),front));
  magazine.plate(iron,[[0,-.026],[length*.28,-.049],[length,-.040],
    [length,.039],[length*.31,.036],[0,.056]],.039);
  for(let i=1;i<=4;i++){
    const x=length*(.12+i*.16),y=-.002*i;
    magazine.cylinder(0xad805b,[x,y,-.003],.015,.017,.061,7);
  }
  for(const y of [-.039,.031])magazine.box(steel,[length*.52,y,0],[length*.84,.010,.055]);
  magazine.box(steel,[length,-.006,0],[.036,.101,.072],[0,0,-.08]);
}

function cleaver(s){
  const part=s.child([.345,.991,.070]);
  const along=new s.T.Vector3(-.355,.160,.100).normalize();
  const fore=new s.T.Vector3(.15,-.03,1),up=fore.clone().cross(along).normalize().negate();
  const normal=along.clone().cross(up).normalize();
  part.group.quaternion.setFromRotationMatrix(new s.T.Matrix4().makeBasis(along,up,normal));
  part.cylinder(0x814940,[-.112,0,0],.032,.036,.232,10,[0,0,Math.PI/2]);
  for(const [x,r] of [[-.223,.041],[-.190,.035],[-.037,.040],[.005,.048]])
    part.cylinder(steel,[x,0,0],r,r,.022,10,[0,0,Math.PI/2]);
  part.plate(iron,[[.009,-.047],[.041,-.057],[.065,-.029],[.027,.046],[.003,.043]],.054);
  part.plate(0x858687,[[.029,-.036],[.238,-.039],[.396,-.014],[.299,.067],
    [.253,.083],[.078,.064],[.058,.040],[.032,.043]],.036);
  for(const side of [-1,1]){
    part.plate(0xbab9b4,[[.030,-.036],[.238,-.039],[.396,-.014],
      [.288,-.002],[.259,.012],[.206,-.018],[.113,-.007],[.064,-.017]],.004,[0,0,side*.019]);
    for(const [x,w] of [[.093,.030],[.185,.045],[.233,.034],[.294,.023]])
      part.link(steel,[x,.054,side*.021],[x+w*.23,.054-w,side*.021],.0025,.0015,5);
  }
}

export function raisedCleaverGretchin(s){
  const hip=[.081,.264,-.086],chest=[.078,.541,-.094];
  s.oval(skin,[.086,.391,-.074],[.105,.145,.105],[-.16,0,-.11]);
  section(s,skin,off(chest,-.012,-.035,.015),[.099,.698,.032],[.066,.060]);
  s.oval(trousers,hip,[.131,.075,.093],[-.15,-.22,-.10]);
  for(const [knee,ankle,heel,yaw,tilt,sign] of [
    [[-.077,.213,.041],[-.140,.132,.052],[-.147,.057,.066],-.48,-.12,-1],
    [[.170,.180,-.086],[.143,.112,-.145],[.152,.023,-.143],.71,.01,1]]){
    const thigh=off(hip,sign*.073,-.008,0);
    section(s,trousers,thigh,knee,[.076,.066]);s.oval(trousers,knee,[.070,.062,.067]);
    s.link(trousers,knee,ankle,.061,.046,10);
    s.link(fold,mix(knee,ankle,.76),mix(knee,ankle,.89),.052,.048,10);
    foot(s,heel,yaw,tilt);
  }
  // The front boot rests on a tilted shard. The other little stone is loose.
  s.plate(0x969085,[[-.170,0],[-.115,.022],[.070,.080],[.167,.073],
    [.106,.012],[.074,-.007],[-.119,-.008]],.109,[-.212,.012,.212],[0,-1.93,0]);
  s.plate(0xaba193,[[-.049,0],[-.017,.038],[.048,.023],[.058,.002]],.095,[.226,.004,.155],[0,.42,0]);
  const belt=s.child([.081,.312,-.08],[-.09,-.22,-.13]);
  belt.cylinder(fold,[0,0,0],.117,.120,.028,12,undefined,[1,1,.78]);
  belt.cylinder(0x4a4241,[0,-.014,0],.119,.121,.019,12,undefined,[1,1,.8]);
  belt.box(0x985346,[.027,0,.095],[.061,.036,.015],[0,.21,-.02]);
  belt.oval(steel,[.035,.003,.104],[.012,.012,.005]);
  waistcoat(s);head(s);
  const joints=[
    [[-.041,.562,-.058],[-.178,.492,-.006],[-.212,.645,.213]],
    [[.207,.603,-.133],[.328,.728,-.109],[.422,.947,.034]]];
  for(const [i,[shoulder,elbow,hand]] of joints.entries()){
    s.oval(skin,shoulder,[.064,.070,.065]);s.link(skin,shoulder,elbow,.060,.044);
    section(s,highlight,mix(shoulder,elbow,.16),mix(shoulder,elbow,.92),[.052,.049]);
    s.oval(skin,elbow,[.045,.047,.044]);
    const wrist=mix(elbow,hand,.85);
    s.link(skin,elbow,wrist,.045,.036,10);
    section(s,skin,mix(elbow,hand,.12),wrist,[.051,.043]);
    s.oval(skin,hand,i?[.055,.063,.064]:[.064,.086,.056],i?[0,0,-.32]:[-.18,-.24,-.30]);
    for(let k=0;k<4;k++){
      const center=i?off(hand,(k-1.5)*.025,-(k-1.5)*.011,.019):off(hand,-.012,.056-k*.030,.032);
      const a=i?off(center,-.004,.044,-.053):off(center,-.037,-.007,-.030);
      const b=i?off(center,.011,.043,.016):off(center,-.030,.007,.009);
      const c=i?off(center,.016,-.008,.050):off(center,.035,.019,.021);
      s.link(highlight,a,b,.016,.016,7);s.link(skin,b,c,.017,.012,7);
      s.oval(0x939583,c,[.010,.011,.008]);
    }
  }
  s.link(seam,[.034,.589,.027],[.126,.440,.044],.006,.005,6);
  s.link(seam,[.174,.605,-.009],[.126,.440,.044],.006,.005,6);
  s.link(p.bone,[.126,.443,.047],[.137,.402,.051],.011,.002,7);
  firearm(s);cleaver(s);
}
