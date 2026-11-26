import {paint as p,Sculpt} from './sculpt.mjs';
import {rearBanner} from './wartrakk-banner.mjs';

const navy=0x193258, blue=0x274777, edge=0x50709c;
const rubber=0x272629, gunmetal=0x46484a, dull=0x777574;
const plus=(v,x,y,z)=>[v[0]+x,v[1]+y,v[2]+z];
const mix=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);
const barrel=[Math.PI/2,0,0],axle=[0,0,Math.PI/2];
const stampGeometry=new WeakMap();
function stamp(s,color,at,rx,ry,rotation){
  // Painted bolt recesses and flush fasteners need just one exposed face.
  if(!stampGeometry.has(s.T))stampGeometry.set(s.T,new s.T.CircleGeometry(1,7));
  s.part(stampGeometry.get(s.T),color,at,[rx,ry,1],rotation);
}

// Hull sections specify Z, half-width, bottom Y, top Y and bevel in inches.
// Each section is authored across the vehicle centreline.
function hull(s,color,sections){
  const vertices=[],indices=[];
  for(const [z,w,b,t,r] of sections){
    for(const [x,y] of [[-w+r,b],[w-r,b],[w,b+r],[w,t-r],[w-r,t],[-w+r,t],[-w,t-r],[-w,b+r]])
      vertices.push(x,y,z);
  }
  for(let j=1;j<sections.length;j++)for(let i=0;i<8;i++){
    const a=(j-1)*8+i,b=(j-1)*8+(i+1)%8;
    indices.push(a,b,a+8,b,b+8,a+8);
  }
  const end=(sections.length-1)*8;
  for(let i=1;i<7;i++)indices.push(0,i+1,i,end,end+i,end+i+1);
  const g=new s.T.BufferGeometry();
  g.setAttribute('position',new s.T.Float32BufferAttribute(vertices,3));g.setIndex(indices);
  const facets=g.toNonIndexed();facets.computeVertexNormals();s.part(facets,color,[0,0,0],[1,1,1]);
}
function omega(s,at,size,rot){
  const g=s.child(at,rot,[size,size,size]);
  g.plate(p.cream,[[-.10,-.094],[-.037,-.094],[-.049,-.037],[-.066,.009],[-.050,.052],[0,.072],[.047,.054],[.066,.006],[.049,-.037],[.037,-.094],[.10,-.094],[.10,-.067],[.073,-.067],[.094,.003],[.081,.062],[.038,.099],[-.038,.099],[-.079,.064],[-.095,.007],[-.073,-.067],[-.10,-.067]],.010);
}
function tubeEnd(s,x,y,z,r){
  s.cylinder(navy,[x,y,z],r*1.06,r*1.06,.096,12,barrel);
  s.cylinder(gunmetal,[x,y,z-.081],r,r*.95,.12,12,barrel);
  s.cylinder(dull,[x,y,z-.15],r*.93,r*.92,.028,12,barrel);
  s.cylinder(rubber,[x,y,z-.170],r*.74,r*.74,.020,12,barrel);
  s.cylinder(p.brass,[x,y,z-.185],r*.30,r*.44,.032,8,barrel);
  for(let j=0;j<8;j++){
    const a=j*Math.PI/4;
    s.box(dull,[x+Math.cos(a)*r*.82,y+Math.sin(a)*r*.82,z-.111],[.044,.072,.18],[0,0,a-.4]);
  }
}
function speederCrew(g,helmet){
  for(const sign of [-1,1]){
    const x=sign*.374,crew=g.child([x,.07,.14],[.06,sign*-.10,0]);
    crew.box(navy,[0,.099,0],[.34,.35,.22]);
    crew.box(p.black,[0,.005,-.15],[.36,.43,.082],[-.14,0,0]);
    crew.oval(blue,[0,.21,.03],[.216,.191,.129]);
    const skull=crew.child([0,.44,.043],[-.09,sign*.155,0],[1.06,1.06,1.06]);
    if(sign<0)helmet(skull,blue,true,0xab785e);
    else{
      skull.oval(0xd4b699,[0,.010,0],[.105,.137,.098]);
      skull.oval(gunmetal,[0,-.047,.078],[.102,.074,.063]);
      skull.box(p.iron,[0,-.041,.131],[.077,.058,.031]);
      for(const side of [-1,1]){
        skull.box(p.leather,[side*.045,.030,.094],[.039,.013,.015],[0,side*.24,side*.03]);
        skull.cylinder(p.iron,[side*.088,-.031,.051],.031,.032,.044,9,axle);
      }
    }
    for(const side of [-1,1]){
      const at=[side*.18,.245,.025],elbow=[side*.20,.14,.14],hand=[side*.14,.16,.30];
      crew.oval(blue,at,[.125,.126,.131]);
      crew.link(blue,at,elbow,.090,.080);crew.link(blue,elbow,hand,.082,.056);
    }
    if(sign>0){
      crew.box(p.black,[0,.134,.32],[.355,.083,.074],[-.19,0,0]);
      for(let i=0;i<3;i++)crew.box(i===1?p.teal:p.gold,[(i-1)*.076,.171,.335],[.044,.014,.019]);
    }
  }
}
function plume(s){
  const foot=[.10,0,-.27],top=[.07,2.16,-.89];
  for(const [x,z,h,broad] of [[0,0,.88,.23],[-.14,.075,.55,.12],[.13,-.12,1.01,.12]]){
    const from=plus(foot,x,0,z),end=plus(from,-.12,h,-.43);
    s.link(0x978877,plus(from,0,.08,0),end,broad,.016,5);
  }
  for(let i=0;i<12;i++){
    const t=(i+.8)/13, radius=.123-.036*t;
    const point=mix(foot,top,t);point[0]+=.054*Math.sin(i*1.63);point[2]+=.076*Math.cos(i*.91);
    s.oval(i%3===0?0xb9b3a6:0xd6d3c7,point,[radius,radius*1.45,radius]);
  }
  s.cylinder(gunmetal,plus(top,0,-.015,0),.132,.105,.341,10);
  s.cylinder(p.steel,plus(top,0,-.112,0),.14,.14,.044,10);
}
export function landSpeeder(parent,helmet){
  const s=new Sculpt(parent.T,parent.group,true);
  // Nose is approximately 16 degrees left of the long oval's axis in the
  // studio build. Positive Y rotation places local +Z towards board +X.
  const vehicle=s.child([0,0,0],[0,.28,0]);
  plume(vehicle);
  const g=vehicle.child([0,2.40,-.06],[.132,0,-.025]);
  hull(g,navy,[[-1.78,.68,-.35,-.04,.09],[-1.30,.82,-.39,.02,.12],[.78,.75,-.34,.066,.10],[1.68,.66,-.30,-.027,.10]]);
  hull(g,blue,[[-1.62,.72,-.08,.66,.16],[-1.34,.95,-.12,.81,.15],[-.50,.90,-.12,.77,.145],[-.33,.79,-.08,.49,.09]]);
  // The front hood ends behind the two separate forward cheek plates.
  hull(g,blue,[[.36,.75,-.23,.18,.07],[.73,.79,-.23,.26,.10],[1.50,.73,-.25,.135,.09],[1.77,.61,-.23,.004,.075]]);
  for(const sign of [-1,1]){
    const rail=g.child([sign*.70,0,0]);
    hull(rail,blue,[[-.56,.117,-.15,.44,.045],[-.19,.116,-.15,.14,.046],[.44,.118,-.14,.19,.04]]);
    const cheek=g.child([sign*.55,0,0]);
    hull(cheek,blue,[[1.37,.184,-.304,.08,.055],[1.79,.163,-.318,-.02,.060],[1.91,.137,-.285,-.125,.042]]);
    cheek.cylinder(p.iron,[0,-.198,1.922],.061,.063,.077,9,barrel);
    cheek.cylinder(p.black,[0,-.198,1.964],.039,.039,.014,9,barrel);
    const engine=g.child([sign*.466,.255,-1.64]);
    engine.cylinder(blue,[0,0,-.043],.410,.405,.28,8,barrel);
    tubeEnd(engine,0,0,-.193,.275);
    const wing=g.child([sign*.80,.234,-.93]);
    wing.plate(blue,[[0,-.28],[sign*.58,-.26],[sign*.96,.083],[sign*.89,.31],[sign*.06,.22]],.085,[0,0,0],[Math.PI/2,0,0]);
    omega(wing,[sign*.55,.046,.04],1.28,[-Math.PI/2,0,sign*.08]);
    // The Stormfury missiles hang beneath both short wings.
    for(let j=0;j<2;j++){
      const x=sign*(.50+.20*j);
      wing.cylinder(dull,[x,-.068,.006],.043,.051,.46,8,barrel);
      wing.cylinder(p.steel,[x,-.068,.276],.003,.050,.094,8,barrel);
      wing.box(p.iron,[x,-.070,-.152],[.138,.020,.078]);
    }
    for(let j=0;j<4;j++){
      const z=.28+.358*j,plate=g.child([sign*.736,-.293,z],[.08,0,-sign*.18]);
      plate.box(gunmetal,[0,0,0],[.268,.174,.276]);
      plate.box(dull,[sign*.139,-.018,0],[.023,.146,.248]);
      for(let k=0;k<3;k++)plate.box(p.iron,[sign*.15,-.024,(k-1)*.068],[.012,.103,.020]);
      plate.cylinder(p.steel,[sign*.16,.040,-.069],.030,.030,.018,8,axle);
      plate.cylinder(p.steel,[sign*.16,.040,.069],.030,.030,.018,8,axle);
    }
    g.link(blue,[sign*.731,.331,-.45],[sign*.633,.784,-.17],.071,.061,6);
    g.link(blue,[sign*.633,.784,-.17],[sign*.57,.64,.34],.059,.044,6);
    const rollPost=g.child([sign*.65,.78,-1.18]);
    rollPost.plate(blue,[[-.068,0],[.085,0],[.036,.355],[-.041,.384],[-.086,.307]],.12,[0,0,0],[.17,0,sign*.21]);
    const armor=g.child([sign*.943,.345,-1.04],[0,sign*Math.PI/2,0]);
    armor.plate(navy,[[-.28,-.135],[.24,-.110],[.31,.081],[.21,.134],[-.151,.139],[-.30,.039]],.015);
    armor.plate(blue,[[-.263,-.109],[.225,-.09],[.271,.063],[.195,.110],[-.148,.114],[-.272,.031]],.018,[0,0,.010]);
    for(let n=0;n<4;n++)armor.box(p.iron,[-.12+n*.076,.058,.024],[.025,.071,.008],[0,0,-.28]);
    g.box(navy,[sign*.364,.818,-.95],[.555,.016,.389]);
    g.box(blue,[sign*.364,.828,-.95],[.518,.014,.352]);
    for(let n=0;n<4;n++)g.box(gunmetal,[sign*.360,.840,-.96+n*.052],[.219,.010,.020]);
    g.box(navy,[sign*.899,.215,-.58],[.036,.353,.229]);
    for(let n=0;n<5;n++)g.box(dull,[sign*.92,.09+n*.057,-.587],[.012,.014,.172]);
    const symbol=g.child([sign*.792,.035,.82],[0,sign*1.51,.015]);
    omega(symbol,[0,0,0],1.19);
  }
  g.link(blue,[-.658,.783,-.16],[.658,.783,-.16],.058,.058,6);
  g.link(edge,[-.58,.803,-.174],[.59,.803,-.174],.015,.015,5);
  g.box(blue,[0,1.125,-1.132],[1.237,.108,.131]);
  g.box(edge,[0,1.184,-1.122],[1.173,.014,.092]);
  g.link(blue,[0,.737,-.40],[0,.40,.57],.097,.087,6);
  g.box(navy,[0,.426,-1.88],[.150,.29,.064]);
  g.oval(p.brass,[0,.296,-1.925],[.048,.059,.017]);
  g.box(p.black,[0,.013,-.041],[1.25,.05,.74]);
  speederCrew(g,helmet);
  const gun=g.child([-.42,.395,.40]);
  gun.box(gunmetal,[0,0,.127],[.26,.21,.60]);
  for(const sign of [-1,1]){
    const x=sign*.075;
    gun.cylinder(p.iron,[x,.031,.486],.066,.077,.49,9,barrel);
    gun.cylinder(0x907965,[x,.031,.747],.067,.074,.19,9,barrel);
    gun.cylinder(p.black,[x,.031,.848],.044,.044,.014,8,barrel);
  }
  gun.box(p.black,[0,.115,.07],[.221,.063,.285]);
  for(let j=0;j<3;j++)gun.box(dull,[-.106,.059,-.034+j*.105],[.018,.089,.031]);
  // Underslung flamer, distinct from the crew-operated twin melta.
  g.box(p.iron,[0,-.372,.96],[.232,.195,.58]);
  g.cylinder(gunmetal,[0,-.376,1.47],.076,.093,.63,10,barrel);
  for(let i=0;i<5;i++)g.cylinder(0x856b52,[0,-.376,1.50+i*.064],.087,.087,.026,10,barrel);
  g.cylinder(rubber,[0,-.376,1.838],.057,.063,.022,9,barrel);
  const hood=g.child([.23,.224,1.015],[.14,0,0]);
  hood.cylinder(0xe1b72a,[0,0,0],.114,.114,.015,20);
  for(const sign of [-1,1])hood.box(p.black,[sign*.028,.010,0],[.019,.009,.097]);
  for(const sign of [-1,1])for(let j=0;j<2;j++){
    hood.plate(p.gold,[[0,0],[sign*.156,.064-j*.014],[sign*.116,.014],[sign*.030,-.028]],.009,[sign*.013,.020,-.25+j*.023],[-Math.PI/2,0,0]);
  }
  for(let j=0;j<5;j++){
    const x=(j-2)*.136;
    g.box(navy,[x,-.019,1.72],[.083,.104,.255],[.18,0,0]);
    g.box(blue,[x,.038,1.62],[.066,.026,.117],[.13,0,0]);
  }
}

function crawler(s,x){
  const g=s.child([x,.367,-.55]),side=Math.sign(x);
  // Distinct front idler, rear drive wheel, two lower rollers and upper rollers.
  const rollers=[[-.79,.02,.301],[-.37,-.110,.226],[.09,-.116,.213],[.52,.022,.270]];
  g.box(rubber,[0,-.012,-.098],[.478,.415,1.41]);
  for(const [z,y,r] of rollers){
    g.cylinder(rubber,[0,y,z],r,r,.511,12,axle);
    g.cylinder(gunmetal,[side*.268,y,z],r*.83,r*.83,.043,12,axle);
    g.cylinder(p.iron,[side*.30,y,z],r*.56,r*.59,.026,9,axle);
    g.cylinder(dull,[side*.319,y,z],r*.23,r*.28,.032,8,axle);
    for(let k=0;k<5;k++){
      const a=2*Math.PI*k/5;
      stamp(g,rubber,[side*.299,y+Math.cos(a)*r*.60,z+Math.sin(a)*r*.60],.028,.028,[0,side*Math.PI/2,0]);
    }
  }
  for(const z of [-.44,.17]){
    g.cylinder(p.iron,[side*.256,.20,z],.106,.107,.072,8,axle);
    g.cylinder(dull,[side*.301,.20,z],.036,.036,.030,8,axle);
  }
  const rim=[[.60,.28],[.28,.32],[-.69,.345],[-.94,.26],[-1.065,.055],[-1.041,-.15],[-.89,-.302],[-.57,-.328],[.17,-.331],[.55,-.273],[.749,-.108],[.788,.04],[.735,.171]];
  for(let i=0;i<rim.length;i++){
    const a=rim[i],b=rim[(i+1)%rim.length],dz=b[0]-a[0],dy=b[1]-a[1];
    const span=Math.hypot(dz,dy),n=Math.max(1,Math.round(span/.122)),slope=-Math.atan2(dy,dz);
    for(let j=0;j<n;j++){
      const t=(j+.5)/n,z=a[0]+dz*t,y=a[1]+dy*t;
      const link=g.child([0,y,z],[slope,0,0]);
      link.box(0x393735,[0,0,0],[.534,.047,span/n*.99]);
      link.box(dull,[0,.027,0],[.550,.027,.041]);
      link.box(p.iron,[side*.226,.046,0],[.07,.021,.074]);
    }
  }
}

function forkAndWheel(s){
  const center=[0,.474,1.17],front=s.child(center);
  front.cylinder(rubber,[0,0,0],.456,.456,.368,20,axle);
  for(let i=0;i<18;i++){
    const a=i*Math.PI/9;
    front.box(0x47403a,[0,.446*Math.cos(a),.446*Math.sin(a)],[.362,.042,.072],[a,0,0]);
  }
  for(const sign of [-1,1]){
    front.cylinder(gunmetal,[sign*.19,0,0],.264,.264,.044,14,axle);
    front.cylinder(p.rust,[sign*.226,0,0],.134,.145,.048,10,axle);
    front.cylinder(p.steel,[sign*.251,0,0],.056,.063,.042,8,axle);
    const a=[sign*.259,.45,1.17],b=[sign*.289,1.05,.79];
    s.link(p.iron,a,b,.066,.073);s.link(dull,mix(a,b,.17),mix(a,b,.63),.079,.075,9);
    for(let j=0;j<5;j++){
      const t=.54+j*.069;
      s.link(p.rust,mix(a,b,t),mix(a,b,t+.026),.084,.084,8);
    }
    s.link(gunmetal,[sign*.130,.36,1.49],[sign*.177,.165,1.87],.070,.040,6);
    s.link(dull,[sign*.177,.165,1.87],[sign*.27,.199,2.03],.042,.004,6);
  }
  const armor=s.child([0,.849,1.28],[.69,0,0]);
  hull(armor,p.red,[[-.24,.20,-.085,.039,.034],[0,.228,-.081,.064,.036],[.29,.153,-.050,.048,.030]]);
  s.plate(gunmetal,[[-.265,-.240],[-.291,.113],[-.18,.296],[.163,.263],[.283,.128],[.249,-.218],[.084,-.152],[.002,-.261],[-.084,-.159]],.143,[0,1.025,1.084],[-.45,0,0]);
  s.oval(p.bone,[0,1.085,1.149],[.080,.069,.023],[-.44,0,0]);
  for(const sign of [-1,1]){
    s.oval(p.black,[sign*.033,1.087,1.177],[.022,.016,.009]);
    for(let j=0;j<2;j++)s.plate(p.bone,[[-.028,.026],[.034,.026],[0,-.060]],.014,[sign*(.073+j*.056),.88,1.192],[-.45,0,0]);
  }
}

function orkRider(s,face){
  const g=s.child([0,.35,.47],[.25,-.06,0],[1.20,1.12,1.12]);
  g.oval(p.leather,[0,.418,-.17],[.22,.142,.204]);
  g.oval(0x504639,[0,.665,-.071],[.24,.224,.194],[-.20,0,0]);
  g.oval(p.olive,[0,.751,.015],[.236,.15,.14]);
  face(g.child([0,.917,.117],[.12,-.06,.09]),false,1);
  g.box(p.leather,[0,.957,.221],[.252,.047,.037],[0,0,-.04]);
  g.oval(p.red,[.069,.956,.248],[.034,.023,.014]);g.oval(dull,[-.064,.960,.244],[.032,.023,.015]);
  for(const sign of [-1,1]){
    const shoulder=[sign*.227,.712,0],elbow=[sign*.290,.543,.217],hand=[sign*.243,.627,.411];
    g.oval(p.green,shoulder,[.12,.128,.125]);
    g.link(p.green,shoulder,elbow,.106,.083);
    g.link(p.green,elbow,hand,.084,.063);g.oval(p.olive,hand,[.072,.065,.071]);
    g.link(gunmetal,[sign*.09,.565,.39],[sign*.29,.635,.416],.028,.031,8);
    const hip=[sign*.127,.389,-.142],knee=[sign*.32,.241,.16],boot=[sign*.309,.17,-.071];
    g.link(0x605341,hip,knee,.113,.102);g.link(p.leather,knee,boot,.091,.073);
    g.oval(p.black,boot,[.089,.073,.14]);
    g.plate(gunmetal,[[-.087,-.076],[-.11,.042],[-.048,.112],[.081,.072],[.102,-.061]],.065,plus(shoulder,sign*.045,.04,.018),[.18,sign*.59,0]);
  }
}
function gunner(s,face){
  const g=s.child([.085,1.025,-.767],[.04,-.09,0],[1.16,1.16,1.16]);
  for(const sign of [-1,1]){
    const hip=[sign*.113,.54,0],knee=[sign*.187,.31,.10],foot=[sign*.197,.074,.04];
    g.link(0x988367,hip,knee,.103,.112);g.link(p.leather,knee,foot,.105,.076);
    g.oval(p.black,foot,[.104,.084,.148]);
    g.cylinder(gunmetal,[sign*.19,.204,.052],.091,.099,.057,9);
  }
  g.oval(0x9c866c,[0,.487,.002],[.215,.156,.16]);
  g.oval(p.leather,[0,.728,-.025],[.268,.239,.175]);
  g.oval(p.green,[0,.837,.033],[.256,.175,.153]);g.box(p.leather,[0,.714,.17],[.095,.36,.041],[0,0,-.64]);
  face(g.child([0,1.049,.069],[.084,.08,-.03],[1.15,1.07,1.10]),false,2,true);
  for(const sign of [-1,1]){
    const raised=sign>0,at=[sign*.232,.863,.008];
    const elbow=[sign*(raised?.43:.33),raised?.87:.697,.134],hand=[sign*(raised?.78:.32),raised?.96:.693,.293];
    g.oval(p.green,at,[.144,.137,.132]);g.link(p.green,at,elbow,.136,.095);
    g.link(p.green,elbow,hand,.097,.073);g.oval(p.olive,hand,[.087,.079,.084]);
    g.link(p.leather,mix(elbow,hand,.59),mix(elbow,hand,.85),.097,.082);
    if(raised){
      const axe=g.child(hand,[.05,-.22,.19],[1.18,1.13,1.08]);
      axe.cylinder(p.leather,[0,.141,0],.036,.037,.52,8);
      axe.plate(gunmetal,[[-.04,.29],[.13,.33],[.232,.46],[.177,.63],[-.10,.59],[-.116,.397]],.065);
      axe.plate(p.steel,[[.104,.37],[.231,.46],[.177,.63],[.148,.54]],.07);
    }
  }
  g.box(p.black,[0,.53,.143],[.342,.078,.059]);
  for(let j=0;j<4;j++)g.box(p.brass,[.120-j*.072,.519,.177],[.032,.047,.014]);
  for(let j=0;j<2;j++)g.box(0x644630,[-.162+j*.26,.64,-.159],[.114,.165,.106],[.08,0,.10]);
  const spare=g.child([-.156,.656,-.181],[.05,.09,-.56]);
  spare.box(gunmetal,[0,0,0],[.128,.362,.10]);
  spare.cylinder(p.iron,[0,.257,0],.040,.056,.232,8);
  spare.box(p.rust,[.052,-.108,0],[.096,.073,.077]);
}
function rocketRack(s){
  const post=s.child([-.215,1.179,-.217]);
  post.cylinder(p.brass,[0,.279,0],.109,.153,.536,9);
  post.cylinder(p.iron,[0,.53,0],.138,.149,.118,10);
  const g=post.child([0,.719,0],[-.049,.04,0]);
  for(const sign of [-1,1]){
    const guard=g.child([sign*.316,.004,-.012],[0,sign*1.55,0]);
    guard.plate(gunmetal,[[-.374,-.144],[-.371,.127],[-.12,.287],[.16,.298],[.356,.134],[.341,-.136],[.10,-.213]],.073);
    guard.plate(p.iron,[[-.23,.09],[-.17,.25],[-.21,.39],[-.115,.36],[-.018,.204],[.11,.19],[.22,.29],[.252,.124]],.047);
    for(let j=0;j<4;j++)stamp(guard,dull,[-.24+j*.139,.094,.047],.022,.022);
  }
  g.box(p.black,[0,-.048,-.034],[.58,.273,.63]);
  for(const [x,y,sz] of [[-.163,.07,1],[.146,.11,1],[0,.258,.91]]){
    const r=g.child([x,y,.029],[.011,x*.13,0],[sz,sz,sz]);
    r.cylinder(gunmetal,[0,0,.06],.111,.121,.76,10,barrel);
    r.cylinder(p.red,[0,0,.431],.097,.109,.131,10,barrel);
    r.cylinder(p.cream,[0,0,.544],.054,.100,.14,8,barrel);
    r.cylinder(p.red,[0,0,.657],.006,.056,.106,8,barrel);
  }
  // The smaller dark gun barrel sits below the three striped rocket tips.
  g.cylinder(dull,[.07,-.17,.444],.046,.064,.485,8,barrel);
  g.cylinder(rubber,[.07,-.17,.691],.031,.031,.016,8,barrel);
  for(let j=0;j<7;j++)g.box(p.brass,[-.21-.024*Math.sin(j*.5),-.15-j*.045,.02],[.116,.028,.048],[0,-.21,-.1]);
}
export function wartrakkVehicle(parent,face,previousBanner=false){
  const root=new Sculpt(parent.T,parent.group,true);
  const s=root.child([0,0,0],[0,.06,0]);
  crawler(s,-.607);crawler(s,.607);forkAndWheel(s);
  hull(s,gunmetal,[[-1.54,.55,.38,.78,.09],[-1.22,.68,.39,.94,.10],[-.125,.61,.37,.94,.115],[.56,.36,.375,.732,.097],[.84,.178,.43,.69,.048]]);
  for(const sign of [-1,1]){
    const side=s.child([sign*.63,.829,-.61],[0,sign*1.5708,0]);
    side.plate(gunmetal,[[-.89,-.071],[-.76,.071],[-.42,.112],[.074,.155],[.71,.111],[.85,.016],[.73,-.060],[.324,-.027],[-.041,-.098]],.425);
    side.plate(p.red,[[-.70,-.012],[-.306,.072],[.024,.075],[-.138,.001],[-.43,-.036]],.014,[0,0,.218]);
    for(let j=0;j<8;j++)stamp(side,dull,[-.66+j*.18,.052,.224],.020,.018);
    const tail=[sign*.52,.585,-1.38],outlet=[sign*.78,1.113,-1.60];
    s.link(gunmetal,tail,outlet,.094,.097,10);
    s.link(p.rust,mix(tail,outlet,.59),mix(tail,outlet,.91),.113,.109,10);
    s.link(dull,mix(tail,outlet,.91),outlet,.108,.106,10);
    s.link(rubber,outlet,mix(tail,outlet,1.009),.078,.078,10);
    s.link(p.iron,[sign*.41,.55,.46],[sign*.194,1.00,.693],.051,.045,8);
  }
  s.box(gunmetal,[0,.968,-.66],[.91,.092,1.10]);
  for(let j=0;j<7;j++)s.box(p.iron,[0,1.018,-1.10+j*.146],[.84,.023,.041],[0,.04,0]);
  for(const sign of [-1,1])for(let j=0;j<3;j++){
    const from=[sign*.48,1.01,-.39+j*.14],to=plus(from,sign*.11,-.043,.063);
    s.link(j===0?p.rust:dull,from,to,.027,.025,7);
  }
  s.oval(p.leather,[0,.751,.27],[.232,.101,.339]);
  orkRider(s,face);gunner(s,face);rocketRack(s);
  if(!previousBanner){
    rearBanner(root);return;
  }
  const pole=[-.091,2.93,-.972];
  s.link(gunmetal,[-.128,1.01,-.907],pole,.034,.026,8);
  s.oval(p.red,plus(pole,0,.10,0),[.124,.182,.129],[.13,0,.14]);
  s.link(gunmetal,plus(pole,0,.243,0),plus(pole,.026,.396,-.011),.043,.002,7);
  const flag=s.child(plus(pole,0,-.071,0),[0,-1.78,-.11]);
  flag.plate(p.black,[[0,0],[-.208,.049],[-.432,-.009],[-.632,.085],[-.768,.050],[-.61,-.031],[-.48,-.104],[-.306,-.122],[0,-.202]],.022);
  flag.plate(p.red,[[-.28,.033],[-.44,-.01],[-.63,.085],[-.77,.05],[-.61,-.03],[-.47,-.10],[-.31,-.115]],.025);
  flag.oval(p.cream,[-.133,-.061,.017],[.057,.054,.012]);flag.box(p.cream,[-.130,-.108,.017],[.052,.048,.022]);
}
