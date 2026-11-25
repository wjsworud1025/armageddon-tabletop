import {paint as p} from './sculpt.mjs';

const skin=0xcbd2a2,light=0xdfe0b6,shade=0x9eab82,cloth=0x776c68,iron=0x53565a;
const plus=(a,b)=>a.map((v,i)=>v+b[i]);
const between=(a,b,t)=>a.map((v,i)=>v*(1-t)+b[i]*t);

function blade(s){
  // The chopper's broad, bevelled face is seen from the figure's right.
  const knife=s.child([-.542,1.30,.556]);
  const up=new s.T.Vector3(.232,.588,-.383).normalize();
  const normal=new s.T.Vector3(.92,-.19,.32);
  const right=up.clone().cross(normal).normalize();
  normal.copy(right).cross(up).normalize();
  knife.group.quaternion.setFromRotationMatrix(new s.T.Matrix4().makeBasis(right,up,normal));
  knife.cylinder(p.leather,[0,-.016,0],.031,.033,.242,8);
  for(const y of [-.132,.064,.099])knife.cylinder(p.steel,[0,y,0],.047,.043,.022,8);
  knife.box(iron,[0,.106,0],[.13,.035,.054]);
  const length=.728;
  knife.plate(iron,[[-.047,.121],[.041,.121],[.051,.21],[.064,.54],[.036,.669],[0,length],[-.067,.57],[-.088,.314]],.034);
  knife.plate(0xb8b7ac,[[-.083,.314],[-.065,.54],[.001,length],[-.027,.568],[-.04,.315],[-.03,.126],[-.047,.126]],.036);
  for(const y of [.30,.39,.51])knife.link(p.steel,[-.061,y,.020],[.017,y+.055,.020],.003,.002,4);
  for(const sign of [-1,1])knife.link(p.steel,[0,-.129,0],[sign*.03,-.16,0],.009,.009,6);
  knife.link(p.steel,[-.03,-.16,0],[0,-.19,0],.009,.009,6);knife.link(p.steel,[0,-.19,0],[.03,-.16,0],.009,.009,6);
}

function shoota(s){
  // Stock at the extended end. Vented muzzle rests over the shoulder.
  const gun=s.child([.705,.968,-.184]);
  const z=new s.T.Vector3(-.794,.406,.285).normalize();
  const x=new s.T.Vector3(0,1,0).cross(z).normalize(),y=z.clone().cross(x);
  gun.group.quaternion.setFromRotationMatrix(new s.T.Matrix4().makeBasis(x,y,z));
  gun.box(iron,[0,0,.043],[.114,.161,.056],[.12,0,0]);
  gun.box(p.iron,[0,0,.208],[.085,.089,.32]);gun.box(p.steel,[0,.043,.205],[.096,.025,.257]);
  gun.box(p.black,[0,0,.417],[.172,.190,.261]);
  for(const side of [-1,1]){
    gun.box(iron,[side*.087,.006,.415],[.017,.162,.232]);
    gun.box(p.black,[side*.097,.005,.416],[.006,.082,.158]);
    gun.box(p.steel,[side*.101,.007,.45],[.007,.038,.07]);
  }
  gun.link(p.leather,[0,.05,.157],[0,.249,.132],.041,.030,8);
  for(let j=0;j<4;j++)gun.cylinder(p.rust,[0,.09+j*.043,.15-j*.006],.043,.044,.019,8,[-.14,0,0]);
  gun.plate(p.iron,[[.313,.09],[.465,.09],[.481,.172],[.462,.254],[.395,.319],[.336,.296],[.383,.229],[.395,.174]],.077,[0,0,0],[0,-Math.PI/2,0]);
  for(let j=0;j<3;j++)gun.oval(p.brass,[.041,.147+j*.052,.436-j*j*.010],[.009,.021,.034],[-.22*j,0,0]);
  gun.cylinder(0x848682,[0,.009,.699],.085,.080,.316,10,[Math.PI/2,0,0]);
  for(const k of [.562,.830,.904])gun.cylinder(p.steel,[0,.009,k],.088,.088,.021,10,[Math.PI/2,0,0]);
  gun.cylinder(p.black,[0,.009,.918],.051,.051,.01,10,[Math.PI/2,0,0]);
  for(const side of [-1,1])for(let j=0;j<4;j++){
    gun.oval(p.black,[side*.077,.016,.586+j*.068],[.011,.022,.025]);
  }
}

function squig(s){
  const beast=s.child([-.502,.425,.044],[.06,-.61,-.13]);
  beast.oval(0x9d4437,[0,.003,-.014],[.106,.079,.124]);
  beast.oval(0xb04e3f,[0,-.015,.070],[.090,.059,.080]);
  beast.oval(0x452522,[0,-.057,.103],[.065,.049,.037]);
  beast.oval(0xa54a39,[0,-.091,.087],[.068,.026,.051]);
  for(const sign of [-1,1]){
    beast.oval(0xaf5240,[sign*.059,-.003,.113],[.038,.029,.033]);
    beast.oval(p.brass,[sign*.053,.007,.137],[.015,.011,.009]);
    beast.oval(p.black,[sign*.052,.007,.144],[.006,.007,.003]);
    for(let i=0;i<2;i++)beast.link(p.bone,[sign*(.023+i*.028),-.032,.138],[sign*(.021+i*.027),-.061+.008*i,.134],.012,.002,6);
    beast.link(p.bone,[sign*.041,-.081,.128],[sign*.048,-.062,.133],.011,.002,6);
    beast.link(p.red,[sign*.075,-.018,-.035],[sign*.122,-.052,-.081],.029,.020,7);
    beast.link(p.iron,[sign*.116,-.052,-.077],[sign*.132,-.078,-.045],.012,.003,6);
  }
  beast.link(0x923d32,[.059,.008,-.067],[.108,-.011,-.177],.048,.018,8);
  s.link(p.leather,[-.292,.424,-.055],[-.458,.437,-.043],.022,.020,7);
}

function boot(s,ankle,turn){
  const b=s.child(ankle,[.03,turn,0]);
  b.oval(p.black,[0,-.004,.004],[.101,.099,.159]);
  b.box(0x302e2a,[0,-.058,.026],[.181,.042,.242]);
  b.oval(iron,[0,-.025,.111],[.101,.063,.076]);
  for(const sign of [-1,1])b.oval(p.steel,[sign*.074,-.027,.151],[.014,.015,.014]);
  b.cylinder(p.black,[0,.060,-.036],.089,.101,.16,9,undefined,[1,1,.86]);
  for(const y of [.071,.123]){
    b.cylinder(iron,[0,y,-.030],.092,.094,.024,9,undefined,[1,1,.85]);
    b.box(p.steel,[.079,y,-.003],[.014,.035,.045]);
  }
}

function grimace(s){
  const head=s.child([-.094,1.085,.205],[.08,-.09,-.045]);
  head.oval(skin,[0,.024,-.001],[.131,.139,.118]);
  head.oval(shade,[0,-.089,.032],[.128,.119,.10]);
  head.oval(skin,[0,-.150,.075],[.113,.064,.074]);
  head.oval(0x3c2828,[0,-.094,.129],[.091,.090,.027]);
  head.oval(0xaa5c54,[0,-.145,.146],[.055,.019,.012]);
  head.oval(light,[0,.003,.124],[.055,.034,.044]);
  for(const sign of [-1,1]){
    head.plate(skin,[[0,-.042],[sign*.091,.060],[sign*.063,-.033],[sign*.010,-.075]],.037,[.104*sign,-.010,0],[0,sign*.24,0]);
    head.oval(light,[sign*.083,-.045,.112],[.044,.072,.042],[0,0,-sign*.25]);
    head.oval(p.black,[sign*.058,.048,.109],[.039,.029,.013]);
    head.oval(0xa23523,[sign*.055,.046,.119],[.020,.018,.009]);
    head.oval(p.brass,[sign*.052,.044,.125],[.010,.011,.006]);
    head.oval(light,[sign*.064,.066,.112],[.049,.017,.019],[0,0,sign*.25]);
    head.link(p.bone,[sign*.072,-.118,.138],[sign*.072,-.082,.157],.017,.002,7);
    for(let j=0;j<3;j++)head.link(p.bone,[sign*(.014+.020*j),-.032-.011*j,.148],[sign*(.016+.020*j),-.057-.008*j,.149],.011,.002,6);
    head.oval(p.iron,[sign*.061,.110,.075],[.060,.038,.038],[0,0,-sign*.14]);
    head.oval(0x32383a,[sign*.061,.114,.103],[.043,.023,.012]);
    head.oval(0x9ba4a7,[sign*.061,.123,.113],[.023,.006,.004]);
  }
  head.link(p.leather,[-.125,.080,.030],[.124,.080,.030],.020,.020,8);
}

export function shoulderShootaBoy(s){
  const hips=[-.041,.525,-.115],chest=[-.134,.862,-.067];
  s.oval(cloth,hips,[.239,.161,.19],[.07,.07,-.170]);
  const ankles=[[-.322,.078,.003],[.346,.175,-.221]],knees=[[-.261,.341,-.091],[.222,.358,-.271]];
  for(let i=0;i<2;i++){
    const sign=i?1:-1,hip=plus(hips,[sign*.111,-.004,0]);
    s.link(cloth,hip,knees[i],.143,.126);
    s.oval(cloth,knees[i],[.132,.112,.118],[.15,0,-sign*.32]);
    s.link(p.black,knees[i],ankles[i],.107,.089);
    boot(s,ankles[i],i?.68:-.12);
  }
  s.plate(p.stone,[[-.132,0],[.152,0],[.226,.124],[.105,.074],[-.079,.087],[-.158,.047]],.23,[.34,0,-.205],[0,.58,0]);
  s.oval(skin,chest,[.279,.269,.209],[.24,.06,-.22]);
  s.oval(skin,[-.054,.722,-.087],[.199,.200,.158],[.21,.05,-.17]);
  for(const sign of [-1,1]){
    s.oval(skin,plus(chest,[sign*.115,.030,.085]),[.152,.144,.159],[.08,.32*sign,.12*sign]);
    s.oval(skin,plus(chest,[sign*.115,.034,-.104]),[.134,.207,.116],[.3,-.10*sign,.22*sign]);
  }
  s.cylinder(p.leather,[-.046,.565,-.110],.218,.232,.09,12,[.103,0,-.153],[1,1,.79]);
  for(const sign of [-1,1])s.box(iron,[sign*.143-.047,.564,.024],[.042,.094,.033],[0,.40*sign,-.14]);
  const belt=s.child([.016,.536,.060],[.045,.16,.139]);
  belt.plate(p.red,[[-.086,.039],[.005,.079],[.085,.091],[.091,.01],[.058,-.060],[-.015,-.073],[-.073,-.035]],.036);
  for(const sign of [-1,1])belt.oval(p.black,[sign*.041,.009,.020],[.019,.013,.007]);
  for(const front of [true,false]){
    const top=front?[.097,1.079,.030]:[.124,1.051,-.217];
    const mid=front?[.028,.856,.134]:[.097,.846,-.242];
    const low=front?[-.099,.581,.067]:[.035,.574,-.269];
    s.link(p.leather,top,mid,.049,.047,6);s.link(p.leather,mid,low,.047,.040,6);
    s.box(iron,between(mid,low,.72),[.102,.067,.040],[.2,0,-.26]);
  }
  const shoulders=[[-.294,1.006,.012],[.151,1.036,-.103]];
  const elbows=[[-.415,.982,.297],[.275,.905,-.158]],hands=[[-.540,1.297,.548],[.382,1.030,-.092]];
  for(let i=0;i<2;i++){
    const a=shoulders[i],b=elbows[i],c=hands[i],sign=i?1:-1;
    s.oval(skin,a,[.151,.163,.160]);
    s.link(skin,a,b,.118,.092);
    s.oval(light,between(a,b,.45),[.103,.108,.124],[.32,.05,sign*.21]);
    s.link(skin,b,c,.103,.067);
    s.link(p.leather,between(b,c,.38),between(b,c,.74),.092,.085,9);
    s.link(iron,between(b,c,.47),between(b,c,.53),.095,.094,9);
    s.oval(light,c,[.085,.092,.077],[-.19,0,sign*.18]);
    for(let j=0;j<4;j++)s.oval(skin,plus(c,[sign*.024,-.052+.030*j,.044]),[.059,.022,.037],[.05,.12,sign*.17]);
  }
  s.oval(iron,[.146,1.121,-.107],[.166,.091,.178],[.1,-.12,.13]);
  for(const sign of [-1,1])s.oval(p.steel,[.139+sign*.130,1.153,-.112],[.014,.014,.015]);
  grimace(s);blade(s);shoota(s);squig(s);
  const skull=s.child([.002,.072,.253],[.10,-.26,.25]);
  skull.oval(p.bone,[0,0,0],[.071,.067,.064]);skull.box(p.bone,[0,-.039,.032],[.082,.047,.067]);
  for(const sign of [-1,1])skull.oval(p.leather,[sign*.028,.002,.055],[.021,.020,.011]);
}
