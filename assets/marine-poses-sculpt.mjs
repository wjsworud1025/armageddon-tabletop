import {paint as p,Sculpt} from './sculpt.mjs';
import {marinePose} from './marine-poses.mjs';

const boneTrim=0xcdc6b3, darkBlue=0x1a365c, edgeBlue=0x547bb1;
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const add=(v,x,y,z)=>[v[0]+x,v[1]+y,v[2]+z];
const diff=(v,other)=>v.map((n,i)=>n-other[i]);
const length=v=>Math.hypot(...v);
const omega=[[-.065,-.046],[-.018,-.046],[-.028,-.01],[-.034,.012],[-.020,.04],[0,.049],[.024,.037],[.033,.012],[.028,-.010],[.018,-.046],[.065,-.046],[.065,-.028],[.045,-.028],[.057,.007],[.048,.042],[.026,.060],[-.025,.060],[-.05,.041],[-.058,.009],[-.046,-.028],[-.065,-.028]];

function axis(s,from,to,barrel=false){
  const child=s.child(from),d=new s.T.Vector3(...diff(to,from)).normalize();
  if(barrel)child.group.quaternion.setFromRotationMatrix(new s.T.Matrix4().lookAt(d,new s.T.Vector3(),new s.T.Vector3(0,1,0)));
  else{child.group.rotation.z=-Math.atan2(d.x,d.y);child.group.rotateX(Math.asin(d.z))}
  return child;
}
function seal(s,at,t=1){
  const g=s.child(at,[.10,.10,-.15],[t,t,t]);
  g.plate(p.cream,[[-.023,0],[.028,.001],[.044,-.125],[.016,-.10],[-.013,-.137]],.008);
  g.oval(p.red,[0,.006,.012],[.036,.031,.014]);
}
function skull(s,at,t=1){
  const g=s.child(at,[.08,0,0],[t,t,t]);
  g.oval(p.bone,[0,.015,0],[.045,.045,.031]);g.box(p.bone,[0,-.022,.003],[.050,.043,.045]);
  for(const sign of [-1,1])g.oval(p.leather,[sign*.016,.016,.026],[.012,.012,.008]);
}
function boots(s,knees,feet,hips,jump){
  for(let i=0;i<2;i++){
    const sign=i?1:-1,knee=knees[i],foot=feet[i],hip=add(hips,sign*.112,-.036,0);
    const heel=add(foot,0,.065,-.028);
    s.link(p.black,hip,knee,.096,.089);
    s.link(p.blue,mix(hip,knee,.18),mix(hip,knee,.75),.119,.119);
    s.link(p.blueShade,knee,heel,.098,.092);
    const greave=axis(s,heel,knee),height=length(diff(knee,heel));
    greave.oval(p.blue,[0,height*.43,.027],[.109,height*.51,.106]);
    greave.link(edgeBlue,[-.052,height*.29,.108],[-.045,height*.62,.114],.010,.005,6);
    s.oval(p.blue,add(knee,0,0,.051),[.125,.113,.086],[-.07,0,sign*.08]);
    s.plate(p.blueLight,[[-.09,.01],[-.05,.065],[.055,.067],[.086,.029],[.071,.037],[-.048,.047]],.008,add(knee,0,.008,.12));
    const shoe=s.child(foot,[jump?.18:0,sign*.12,sign*.045]);
    shoe.box(p.iron,[0,.019,.015],[.217,.038,.245]);
    shoe.oval(p.blue,[0,.068,.038],[.118,.073,.161],[-.10,0,0]);
    shoe.box(p.blueShade,[0,.052,.153],[.148,.030,.025]);
    for(let r=0;r<2;r++)shoe.link(p.blueLight,[-.077,.064+r*.026,.139-r*.023],[.075,.064+r*.026,.139-r*.023],.007,.007,6);
  }
}
function pauldrons(s,shoulders,jump,features){
  for(let i=0;i<2;i++){
    const sign=i?1:-1;
    const g=s.child(shoulders[i],[.09,sign*.13,sign*.27]);
    // A dome on a flared rim maintains the distinctive broad armour silhouette.
    g.oval(p.blue,[0,.016,0],[.159,.151,.156],[.09,0,0]);
    g.cylinder(p.blue,[0,-.025,0],.159,.161,.098,12,undefined,[1,1,.97]);
    g.cylinder(jump?boneTrim:p.gold,[0,-.081,0],.162,.158,.024,12,undefined,[1,1,.97]);
    const edge=g.child([sign*.10,.006,.102],[0,sign*.62,-sign*.05]);
    if(jump||features.has('omega')){
      if(i===1)edge.plate(boneTrim,omega,.008);
      else if(jump){
        edge.plate(p.cream,[[-.047,.04],[.044,.04],[.044,.022],[.014,.020],[.014,-.039],[-.014,-.039],[-.014,.02],[-.047,.02]],.007);
      }
    }
    if(features.has('squareWard')&&i===0){
      for(let row=0;row<3;row++)for(let col=0;col<3;col++)if((row+col)%2===0)
        edge.box(p.gold,[(col-1)*.046,(row-1)*.043,.003],[.043,.041,.009]);
    }
    if(jump){
      const arch=[[-sign*.093,-.073,.127],[-sign*.107,-.026,.119],[-sign*.096,.049,.112],[-sign*.070,.103,.082],[-sign*.023,.147,.029]];
      for(let j=1;j<arch.length;j++)g.link(boneTrim,arch[j-1],arch[j],.013,.013,6);
    }
  }
}
function backpack(s,anchors,nozzles){
  const jump=Boolean(nozzles);
  const middle=mix(...anchors,.5);
  const width=length(diff(anchors[0],anchors[1]));
  s.box(p.blueShade,add(middle,0,-.122,-.053),[width*.91,.29,.19]);
  s.box(p.blue,add(middle,0,-.022,-.078),[width*.73,.151,.174],[-.11,0,0]);
  for(let n=0;n<3;n++)s.box(p.iron,add(middle,0,-.097-.048*n,-.158),[width*.60,.02,.026]);
  const rotor=add(middle,0,-.096,-.18);
  s.cylinder(p.iron,rotor,.088,.088,.029,12,[Math.PI/2,0,0]);
  for(let j=0;j<5;j++){
    const angle=j*Math.PI/5;
    s.box(darkBlue,add(rotor,0,0,-.017),[.14,.012,.012],[0,0,angle]);
  }
  s.oval(p.brass,add(rotor,0,0,-.027),[.018,.018,.010]);
  for(let i=0;i<2;i++){
    const sign=i?1:-1;
    const g=s.child(anchors[i],[jump?.17:.09,sign*.14,-sign*(jump?.22:.11)]);
    if(!jump){
      g.oval(p.blue,[0,0,0],[.105,.092,.104]);
      g.cylinder(p.iron,[0,-.055,-.013],.083,.077,.047,10);
      g.box(edgeBlue,[0,.065,.039],[.068,.015,.047],[.09,0,0]);
      g.cylinder(p.blueShade,[0,-.17,-.015],.058,.065,.10,10);
      continue;
    }
    g.plate(p.blue,[[-.131,-.122],[-.145,.049],[-.090,.124],[.091,.12],[.145,.052],[.128,-.119]],.264,[0,.006,-.016]);
    g.plate(darkBlue,[[-.105,.065],[.097,.065],[.098,-.073],[.06,-.113],[-.083,-.102]],.013,[0,-.013,.124]);
    g.plate(p.black,[[-.079,.038],[.081,.040],[.074,-.062],[-.067,-.059]],.009,[0,0,.136]);
    for(let n=0;n<3;n++)g.box(p.iron,[(n-1)*.047,-.015,.141],[.01,.077,.009]);
    g.plate(edgeBlue,[[-.113,.047],[-.074,.107],[.079,.106],[.117,.052],[.072,.089],[-.065,.091]],.013,[0,0,.123]);
    g.cylinder(p.blueShade,[0,-.002,-.157],.102,.104,.084,12,[Math.PI/2,0,0]);
    g.cylinder(p.iron,[0,-.002,-.202],.078,.078,.010,12,[Math.PI/2,0,0]);
    g.cylinder(p.black,[0,-.002,-.209],.060,.060,.008,10,[Math.PI/2,0,0]);
    const start=add(anchors[i],sign*.051,-.047,-.049),end=nozzles[i];
    s.link(p.blueShade,start,end,.119,.105,12);
    s.link(p.blue,mix(start,end,.27),mix(start,end,.82),.122,.119,12);
    s.link(edgeBlue,mix(start,end,.68),mix(start,end,.73),.120,.121,12);
    s.link(p.steel,mix(start,end,.87),end,.108,.094,12);
    s.link(p.iron,mix(start,end,.981),mix(start,end,1.02),.081,.078,12);
    g.plate(p.blueLight,[[0,0],[sign*.139,.056],[sign*.155,.104],[sign*.03,.06]],.039,[sign*.079,.071,-.07]);
  }
}
function weapon(s,hand,tip,type){
  if(type==='fist'||type==='support')return;
  if(type==='magazine'){
    const g=axis(s,hand,tip),h=length(diff(tip,hand));
    g.box(p.iron,[0,h*.48,0],[.064,h*.80,.054]);
    g.cylinder(p.brass,[0,h*.91,0],.013,.023,h*.19,7);return;
  }
  if(type.toLowerCase().includes('blade')||type==='chainsword'){
    const g=axis(s,hand,tip),h=length(diff(tip,hand));
    const chain=type==='chainsword',grip=Math.min(.17,h*.28),w=chain?.047:.039;
    g.cylinder(p.leather,[0,.012,0],.026,.028,grip*1.17,8);
    g.cylinder(p.gold,[0,-grip*.53,0],.038,.031,.030,8);
    g.box(p.gold,[0,grip*.64,0],[chain?.135:.173,.038,.050]);
    const base=grip*.77;
    g.plate(chain?p.iron:0x8ea7b3,[[-w,base],[w,base],[w,h*.86],[0,h],[-w,h*.91]],.026);
    g.plate(chain?p.steel:0xdce3df,[[0,base],[w,base],[w,h*.86],[0,h]],.008,[0,0,.015]);
    if(chain)for(let j=0;j<9;j++){
      const y=base+(h-base)*(.04+j*.101);
      g.plate(p.steel,[[0,0],[.036,.037],[0,.046]],.031,[w*.81,y,0]);
    }
    return;
  }
  const g=axis(s,hand,tip,true),h=length(diff(tip,hand)),rifle=!['pistol','plasma'].includes(type);
  const thickness=rifle?.094:.087,caseEnd=h*.66,bodyHeight=rifle?.134:.127;
  g.box(p.black,[0,.023,caseEnd*.37],[thickness*1.18,bodyHeight,caseEnd*1.32]);
  g.box(p.iron,[0,.084,caseEnd*.37],[thickness*1.27,.037,caseEnd*1.23]);
  g.box(p.iron,[0,-.049,caseEnd*.38],[thickness*.79,.101,Math.min(.11,h*.28)],[-.14,0,0]);
  g.box(p.black,[0,-.067,-.022],[.057,.101,.058],[-.19,0,0]);
  g.cylinder(p.iron,[0,.026,(h+caseEnd)/2],.040,.048,h-caseEnd,9,[Math.PI/2,0,0]);
  g.cylinder(p.steel,[0,.026,h-.022],.048,.047,.048,9,[Math.PI/2,0,0]);
  g.cylinder(p.black,[0,.026,h+.006],.027,.027,.008,8,[Math.PI/2,0,0]);
  g.box(p.brass,[.062,.012,caseEnd*.29],[.008,.021,.07]);
  if(rifle){
    g.box(p.iron,[0,.018,-.105],[.074,.085,.188],[-.1,0,0]);
    g.cylinder(p.black,[0,.124,caseEnd*.45],.031,.036,Math.min(h*.34,.15),8,[Math.PI/2,0,0]);
    for(let n=0;n<3;n++)g.box(p.steel,[.058,.026,caseEnd*(.47+.14*n)],[.008,.024,.024]);
  }
  if(type==='launcher')g.cylinder(p.steel,[0,-.025,h*.81],.046,.051,h*.36,9,[Math.PI/2,0,0]);
  if(type==='plasma')for(let i=0;i<6;i++)g.cylinder(i%2?p.teal:0x267879,[0,.055,caseEnd*(.50+.102*i)],.040,.040,.014,9,[Math.PI/2,0,0]);
  if(type==='slingRifle'||type==='downRifle'){
    const end=mix(hand,tip,.88),start=add(hand,0,-.073,.023);
    const a=add(mix(start,end,.70),-.054,-.281,-.043);
    const b=add(mix(start,end,.27),-.018,-.243,-.036);
    s.link(p.leather,start,b,.019,.020,7);s.link(p.leather,b,a,.020,.019,7);s.link(p.leather,a,end,.018,.015,7);
  }
}
function supportRock(s,foot,ground,high,groundZ){
  const h=Math.max(.052,foot[1]+.026),w=high?.112:.14;
  const at=[ground,0,groundZ];
  if(Math.abs(groundZ-foot[2])>.15){
    // A tilted cylinder tips one side of its lower cap through the plinth.
    // Horizontal cross-sections keep the whole shard planted on the base.
    const top=add(foot,0,.016,-.013),bend=mix(at,top,.48);
    const vertices=[],triangles=[];
    for(const [layer,rad] of [[at,w*1.44],[bend,w*.72],[top,w*.47]]){
      for(let j=0;j<6;j++){
        const a=j*Math.PI/3,offset=j%2===0?1:.85;
        vertices.push(layer[0]+Math.cos(a)*rad*offset,layer[1],layer[2]+Math.sin(a)*rad*offset);
      }
    }
    for(let i=0;i<2;i++)for(let j=0;j<6;j++){
      const a=6*i+j,b=6*i+(j+1)%6;
      triangles.push(a,a+6,b,b,a+6,b+6);
    }
    for(let j=1;j<5;j++)triangles.push(0,j,j+1,12,13+j,12+j);
    const mesh=new s.T.BufferGeometry();mesh.setAttribute('position',new s.T.Float32BufferAttribute(vertices,3));
    mesh.setIndex(triangles);const facets=mesh.toNonIndexed();facets.computeVertexNormals();
    s.part(facets,p.stone,[0,0,0],[1,1,1]);
    return;
  }
  const end=foot[0]-ground;
  s.plate(p.stone,[[-w*1.4,0],[w*1.52,0],[w*.90,.034*h],[end+w*.33,h*.76],[end+w*.47,h],[end-w*.56,h*.93],[-w*.82,h*.21]],.18,at,[-.05,.09,0]);
  s.plate(0x746c64,[[w*.75,0],[end+w*.22,h*.75],[end+w*.4,h],[end+w*.52,h*.80],[w*1.1,0]],.019,[at[0],.002,at[2]+.094]);
}

export function sculptMarinePose(parent,kind,variant,helmet,wings){
  const data=marinePose(kind,variant);
  if(!data)throw new RangeError('Missing '+kind+' pose '+variant);
  const s=new Sculpt(parent.T,parent.group,true),jump=kind==='vanguard',flags=new Set(data.features.split(' '));
  const pixel=32/25.4/data.baseWidth,pitch=10*Math.PI/180;
  const point=(xy,z)=>[(xy[0]-data.baseX)*pixel,((data.ground-xy[1])*pixel+z*Math.sin(pitch))/Math.cos(pitch),z];
  const pts=(xy,depth)=>xy.map((entry,i)=>point(entry,depth[i]));
  const side=data.sideDepth;
  const hips=point(data.belt,side?.hip??-.012),head=point(data.head,side?.head??.035),shoulders=pts(data.shoulders,side?.shoulders??[-.032,-.035]);
  const chest=mix(...shoulders,.5),feet=pts(data.feet,side?.feet??[.04,-.035]),knees=pts(data.knees,side?.knees??[.090,.062]);
  if(!jump)feet.forEach((f,i)=>{if(!flags.has('rockLeft')||i===0)f[1]=.005});
  if(jump&&variant===4)feet.forEach(f=>{f[1]=.005});
  if(jump&&variant===2)feet[1][1]=.008;
  for(const f of feet)f[1]=Math.max(.004,f[1]);
  if(flags.has('pillar')||flags.has('rockLeft')){
    const i=flags.has('rockLeft')||variant===0?1:0;
    supportRock(s,feet[i],feet[i][0]-(flags.has('rockLeft')?.13:.04),jump,side&&jump?.12:feet[i][2]-.035);
  }
  boots(s,knees,feet,hips,jump);
  const ribs=mix(hips,chest,.65),spine=diff(chest,hips),width=length(diff(...shoulders));
  s.oval(p.black,hips,[.184,.121,.139]);
  s.oval(p.blueShade,ribs,[Math.min(.246,width*.47),length(spine)*.64,.147],[.10,0,-Math.atan2(spine[0],spine[1])]);
  for(let i=1;i<=3;i++)s.box(p.blue,add(mix(hips,chest,.08+i*.11),0,0,.120),[.243+i*.014,.038,.037]);
  s.oval(p.blue,add(chest,0,-.025,.009),[Math.min(.266,width*.54),.164,.153],[.045,0,0]);
  wings(s,chest[0],chest[1]-.056,chest[2]+.155,p.gold,.159);
  const collar=[[-.15,.06,.07],[-.13,-.014,.132],[-.074,-.045,.152],[.030,-.049,.160],[.105,-.029,.139],[.148,.048,.067]];
  for(let j=1;j<collar.length;j++)s.link(jump?boneTrim:edgeBlue,add(chest,...collar[j-1]),add(chest,...collar[j]),.014,.014,7);
  s.box(p.leather,add(hips,0,.012,.131),[.308,.053,.042]);
  s.box(p.brass,add(hips,0,.011,.164),[.072,.059,.024]);
  for(let i=0;i<2;i++){
    const sign=i?1:-1;
    s.box(p.leather,add(hips,sign*.147,-.020,.068),[.068,.104,.069],[0,sign*.23,sign*.14]);
    s.box(p.brass,add(hips,sign*.148,-.014,.107),[.029,.017,.008]);
  }
  if(jump)s.box(p.leather,add(hips,.19,-.019,-.001),[.097,.193,.068],[.12,.24,.36]);
  if(flags.has('tabard'))s.plate(p.cream,[[-.05,0],[.053,0],[.069,-.124],[.031,-.105],[0,-.19],[-.045,-.114]],.018,add(hips,0,-.028,.145));
  const face=s.child(head,[-.025,[-.13,.20,.08,-.09,-.20][variant],0]);
  helmet(face,jump?0xd9d9ce:p.blue,flags.has('bare'),jump?0x955e4a:0xb77f5e);
  if(flags.has('optic'))face.oval(p.red,[-.094,.040,.103],[.026,.023,.016]);
  pauldrons(s,shoulders,jump,flags);
  backpack(s,pts(data.pack,side?.pack??[-.20,-.23]),data.nozzles?pts(data.nozzles,[-.35,-.35]):null);
  const elbows=pts(data.elbows,side?.elbows??[.043,.065]),hands=pts(data.hands,side?.hands??[.255,.237]);
  for(let i=0;i<2;i++){
    const elbow=elbows[i],hand=hands[i],upper=shoulders[i];
    s.link(p.black,upper,elbow,.078,.076);
    s.link(p.blue,mix(upper,elbow,.31),mix(upper,elbow,.83),.090,.086);
    s.oval(p.blueShade,elbow,[.083,.084,.083]);
    s.link(p.blue,elbow,mix(elbow,hand,.82),.086,.071);
    s.oval(p.blue,hand,[.068,.067,.076]);
    for(let n=0;n<3;n++)s.box(darkBlue,add(hand,(i?1:-1)*.038,-.030+n*.025,.039),[.050,.018,.046],[0,i?.08:-.08,0]);
    const type=data.tools[i],projected=length(diff(data.hands[i],data.tips[i]))*pixel;
    const depth=projected<.29&&['pistol','plasma','launcher','aimed'].includes(type)?.57:type==='shortBlade'?.43:.30;
    weapon(s,hand,point(data.tips[i],side?.tips[i]??depth),type);
  }
  if(flags.has('kneeSkull')){
    const at=add(knees[jump?0:1],0,.003,.127);
    if(!jump)s.plate(boneTrim,[[-.079,.059],[.061,.072],[.091,-.045],[-.015,-.083],[-.072,-.045]],.012,at);
    skull(s,add(at,0,0,.010),.79);
  }
  if(flags.has('kneeGlyph')||flags.has('goldKnee')){
    const at=add(knees[0],0,.015,.137);
    s.plate(flags.has('goldKnee')?p.gold:p.cream,[[-.054,.024],[.052,.023],[0,-.050]],.006,at);
  }
  if(flags.has('rivetedKnee'))for(let n=0;n<7;n++){
    const a=n*Math.PI/5;s.oval(p.cream,add(knees[1],Math.sin(a)*.079,Math.cos(a)*.079,.108),[.011,.011,.011]);
  }
  if(flags.has('rivetedKnee'))for(let n=0;n<4;n++)for(const sign of [-1,1]){
    const shin=mix(knees[1],feet[1],.27+n*.13);
    s.oval(p.steel,add(shin,sign*.06,0,.117),[.012,.012,.008]);
  }
  if(flags.has('kneeScroll')||flags.has('rightScroll')||flags.has('paper'))seal(s,add(knees[flags.has('kneeScroll')?1:0],-.071,.020,.077),.82);
  if(flags.has('waistChain'))for(let i=0;i<8;i++){
    const a=i*Math.PI/7;s.oval(p.gold,add(hips,.103*Math.cos(a),-.027-.085*Math.sin(a),.147),[.018,.020,.009]);
  }
  if(flags.has('skullGround'))skull(s,[(feet[0][0]+feet[1][0])*.50,.038,.212],.94);
}
