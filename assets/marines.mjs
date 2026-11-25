import {landSpeeder} from './vehicles.mjs';
import {paint as p} from './sculpt.mjs';
import {sculptMarinePose} from './marine-poses-sculpt.mjs';

function helmet(s, color, bare = false, complexion = p.flesh) {
  if (bare) {
    s.oval(complexion,[0,.008,.012],[.102,.143,.098]);
    s.oval(0x674a3f,[0,.106,-.005],[.106,.054,.096]);
    s.box(complexion,[0,-.013,.102],[.032,.052,.037]);
    for (const sign of [-1,1]) s.box(p.iron,[sign*.045,.033,.102],[.035,.010,.009],[0,sign*.16,0]);
    return;
  }
  s.oval(color,[0,.018,0],[.134,.157,.127]);
  s.oval(color,[0,-.051,.088],[.117,.075,.067]);
  s.box(p.iron,[0,-.045,.148],[.092,.065,.027]);
  for (let i=-1;i<=1;i++) s.box(p.steel,[i*.029,-.045,.165],[.008,.047,.007]);
  for (const sign of [-1,1]) {
    s.oval(0x6c2423,[sign*.068,.024,.105],[.050,.027,.023],[0,sign*.35,sign*-.13]);
    s.oval(0xff6a44,[sign*.062,.025,.123],[.035,.011,.010],[0,sign*.35,sign*-.13]);
    s.cylinder(p.blueShade,[sign*.122,-.016,-.005],.051,.05,.038,10,[0,0,Math.PI/2]);
    s.box(color,[sign*.065,.056,.104],[.13,.03,.04],[0,sign*.38,sign*.16]);
  }
}

function wings(s, x, y, z, color, span) {
  for (const sign of [-1,1]) {
    for (let n=0;n<3;n++) {
      s.plate(color,[[0,0],[sign*(span-.017*n),.065+.016*n],[sign*(span-.027*n),.029],[sign*.036,-.018]],.013,[x,y-.018*n,z]);
    }
  }
  s.oval(p.cream,[x,y,z+.014],[.039,.048,.018]);
}

function pack(s, jump) {
  const center = jump ? .30 : .21, color = p.blue;
  s.box(p.blueShade,[0,0,-.10],[jump ? .46 : .31,.37,.19]);
  for (let i=-1;i<=1;i++) s.box(p.iron,[0,i*.069,-.203],[.20,.026,.025]);
  for (const sign of [-1,1]) {
    const x = sign*center;
    if (jump) {
      s.cylinder(color,[x,.03,-.075],.127,.112,.41,12,[-.13,0,0]);
      s.cylinder(p.steel,[x,.243,-.096],.118,.127,.037,14,[-.13,0,0]);
      s.cylinder(p.iron,[x,.264,-.099],.088,.088,.011,14,[-.13,0,0]);
      for(let n=-1;n<=1;n++) s.box(p.steel,[x+n*.041,.271,-.099],[.012,.012,.117]);
      s.cylinder(p.iron,[x,-.196,-.045],.10,.12,.08,12,[-.13,0,0]);
      s.cylinder(p.brass,[x,-.24,-.04],.09,.076,.016,12);
    } else {
      s.oval(color,[x,.139,-.067],[.105,.092,.104]);
      s.cylinder(p.iron,[x,.072,-.066],.076,.062,.065,10);
      s.cylinder(color,[x*.67,-.149,-.075],.060,.061,.092,10);
    }
  }
}

function leg(s, x, z, side, raised) {
  const heel = [x*.98,raised+.086,z];
  const knee = [x*1.04, .41+raised*.5,z+.065];
  const hip = [side*.128,.70,0];
  s.link(p.blueShade,heel,knee,.10,.121);
  s.link(p.blue,hip,knee,.125,.133);
  s.oval(p.blue,[heel[0],raised+.088,z+.043],[.133,.094,.18]);
  s.box(p.iron,[heel[0],raised+.025,z+.047],[.25,.044,.277]);
  s.oval(p.blue,[x,.259+raised*.7,z+.04],[.12,.184,.122],[-.12,0,side*.07]);
  s.oval(p.blueLight,[knee[0],knee[1],knee[2]+.067],[.119,.107,.068]);
}

function sword(s, x, y, z, yaw, chainsaw = false, roll = -.14) {
  const a = s.child([x,y,z],[.18,yaw,roll]);
  a.cylinder(p.leather,[0,.04,0],.030,.030,.19,8);
  a.box(p.brass,[0,.137,0],[.19,.049,.058]);
  a.plate(chainsaw?p.iron:0xabc4d0,[[-.052,0],[.047,0],[.045,.64],[.008,.725],[-.045,.65]],.036,[0,.157,0]);
  if(chainsaw) {
    for(let i=0;i<7;i++) a.plate(p.steel,[[0,0],[.050,.052],[0,.068]],.042,[.043,.18+i*.082,0]);
  } else {
    a.plate(0xe0e3dc,[[0,0],[.045,0],[.045,.62],[.007,.71]],.006,[0,.157,.021]);
  }
}

function shield(s) {
  const g=s.child([.37,.86,.212],[-.11,.24,.12]);
  const outline=[[-.17,.24],[-.105,.30],[.12,.29],[.18,.20],[.153,-.13],[0,-.27],[-.15,-.15]];
  g.plate(p.brass,outline,.08);
  g.plate(p.cream,outline.map(([x,y])=>[x*.85,y*.88]),.018,[0,0,.05]);
  g.plate(p.blueShade,[[-.036,.185],[.036,.185],[.035,-.125],[0,-.201],[-.036,-.12]],.015,[0,0,.068]);
  wings(g,0,.064,.084,p.gold,.117);
  g.oval(p.bone,[0,.07,.115],[.047,.054,.027]);
  for(const sign of [-1,1]) {
    g.link(p.brass,[sign*.13,-.135,.075],[0,-.225,.075],.010,.010);
    g.oval(p.iron,[sign*.018,.074,.14],[.012,.010,.005]);
    for(let i=0;i<3;i++) g.oval(p.gold,[sign*.128,.195-i*.095,.066],[.013,.013,.009]);
  }
}

export function marine(s, kind, variant = 0) {
  if(kind==='intercessor'||kind==='vanguard'){
    sculptMarinePose(s,kind,variant,helmet,wings);
    return;
  }
  const captain = kind==='captain', psyker = kind==='librarian';
  const stride = [-.085,.10,-.135,.045,.15][variant%5];
  if(captain||psyker) {
    s.plate(p.stone,[[-.46,0],[.38,0],[.48,.125],[.52,.205],[.31,.13],[-.09,.141],[-.34,.22],[-.29,.118]],.31,[0,.006,0],[-.03,-.28,0]);
  }
  const body = s.child([0,.13,0],[0,[-.16,.13,.0,-.22,.23][variant%5],0]);
  leg(body,-.17,-stride,-1,0);
  leg(body,.19,stride,1,0);
  const torso=body.child([0,0,0],[.035,variant%2===0?.09:-.10,0]);
  torso.oval(p.black,[0,.716,0],[.22,.14,.14]);
  torso.oval(p.blueShade,[0,.85,.016],[.207,.18,.16]);
  for(let n=0;n<3;n++) torso.box(p.blue,[0,.835+n*.065,.138],[.296+n*.03,.048,.040]);
  torso.oval(p.blue,[0,1.038,0],[.263,.236,.18]);
  wings(torso,0,1.062,.172,p.gold,.182);
  torso.box(p.leather,[0,.72,.142],[.335,.074,.053]);
  torso.box(p.brass,[0,.72,.178],[.083,.075,.033]);
  for(const sign of [-1,1]) {
    torso.box(p.leather,[sign*.174,.696,.132],[.072,.112,.077],[0,sign*.45,sign*.13]);
    const shoulder=torso.child([sign*.278,1.075,0],[0,0,sign*.19]);
    shoulder.oval(p.brass,[0,-.012,0],[.158,.155,.170]);
    shoulder.oval(p.blue,[0,.014,0],[.166,.155,.177]);
    const badge=shoulder.child([sign*.136,.012,.056],[0,sign*.95,-sign*.07]);
    const omega=[[-.058,-.045],[-.019,-.045],[-.027,-.015],[-.035,.001],[-.032,.030],[0,.049],[.032,.030],[.035,.001],[.027,-.015],[.019,-.045],[.058,-.045],[.058,-.027],[.044,-.027],[.055,.002],[.049,.038],[.025,.058],[-.025,.058],[-.049,.038],[-.055,.002],[-.043,-.027],[-.058,-.027]];
    if(sign>0) badge.plate(p.cream,omega,.009);
    const captainArm=captain && sign<0;
    const elbow=captainArm?[-.413,1.063,.035]:[sign*.319,.855,.079];
    const end = captainArm?[-.505,1.081,.14]:captain?[.322,.89,.202]:sign < 0 ? [-.33,.86,.21] : [sign*.183,.865,.26];
    torso.link(p.blueShade,[sign*.294,1.007,0],elbow,.102,.087);
    torso.link(p.blue,elbow,end,.090,.077);
    torso.oval(p.blueShade,end,[.080,.071,.078]);
    for(let n=0;n<3;n++) torso.oval(p.blue,[end[0]+sign*.054,end[1]-.021+n*.028,end[2]+.026],[.034,.016,.041]);
  }
  const head=torso.child([0,1.27,.017],[0,[-.14,.15,-.27,.04,.18][variant%5],0]);
  helmet(head,p.blue,true);
  pack(torso.child([0,1.055,-.125]),false);
  if(captain || psyker) {
    torso.plate(psyker?p.cream:p.red,[[-.2,.34],[.17,.32],[.23,-.18],[.32,-.37],[.08,-.31],[-.10,-.43],[-.3,-.32]],.035,[0,.75,-.19],[.20,0,.08]);
    torso.plate(p.cream,[[-.104,.21],[.100,.2],[.138,-.245],[.02,-.19],[-.08,-.265]],.031,[0,.635,.169],[-.24,0,.09]);
  }
  if(captain) {
    shield(torso);
    sword(torso,-.505,1.082,.14,-.06,false,1.35);
    const hoop=torso.child([0,1.54,-.20]);
    for(let i=0;i<16;i++) {
      const a=2*Math.PI*i/16,b=2*Math.PI*(i+1)/16;
      hoop.link(p.brass,[.110*Math.cos(a),.110*Math.sin(a),0],[.110*Math.cos(b),.110*Math.sin(b),0],.014,.015,6);
      if(i%2===0) hoop.link(p.gold,[.125*Math.cos(a),.125*Math.sin(a),0],[.151*Math.cos(a),.151*Math.sin(a),0],.011,.002,5);
    }
    torso.plate(p.red,[[-.24,.044],[.23,.044],[.21,-.023],[-.13,-.049],[-.29,-.094]],.047,[0,.761,.151],[0,0,.22]);
  } else if(psyker) {
    const a=torso.child([.029,.88,.28],[.03,-.10,-1.43]);
    a.cylinder(p.brass,[0,.04,0],.027,.027,1.28,10);
    for(let n=0;n<9;n++) a.cylinder(p.cream,[0,-.16+n*.083,0],.031,.031,.022,7,[0,0,.24]);
    a.plate(p.cream,[[0,.02],[-.10,-.015],[-.24,-.14],[-.27,-.255],[-.151,-.237],[-.048,-.176],[0,-.13]],.034,[0,-.53,0]);
    a.oval(p.gold,[0,.72,0],[.088,.097,.066]);
    a.oval(p.teal,[0,.728,.047],[.047,.055,.025]);
    for(let n=0;n<7;n++) {
      const a1=n*2*Math.PI/7;
      a.link(p.brass,[.08*Math.cos(a1),.72+.08*Math.sin(a1),0],[.12*Math.cos(a1),.72+.12*Math.sin(a1),0],.012,.002);
    }
    torso.oval(p.blueShade,[0,1.30,-.075],[.17,.202,.106]);
    for(const sign of [-1,1]) torso.link(p.gold,[sign*.12,1.23,.015],[sign*.158,1.017,.145],.025,.025);
  }
}

export function speeder(s) {
  landSpeeder(s,helmet);
}
