import {wartrakkVehicle} from './vehicles.mjs';
import {paint as p} from './sculpt.mjs';
import {sculptOrkPose} from './ork-poses-sculpt.mjs';

function face(s, grot, index, plain=false) {
  const skin=[p.green,0x73883b,0x829741,0x657f36][index%4];
  s.oval(skin,[0,.023,0],[.156,.135,.128]);
  s.oval(p.olive,[0,-.080,.075],[.148,.084,.124]);
  s.oval(skin,[0,-.050,.116],[.15,.047,.10]);
  s.oval(p.leather,[0,-.043,.192],[.107,.019,.021]);
  s.oval(p.lightGreen,[0,.004,.15],[.061,.039,.063]);
  for(const sign of [-1,1]) {
    s.plate(skin,[[0,-.044],[sign*.163,.099],[sign*.121,-.012],[sign*.041,-.076]],.05,[sign*.118,.020,0],[0,-sign*.45,0]);
    s.oval(0xf29a44,[sign*.074,.040,.115],[.029,.019,.021]);
    s.box(p.olive,[sign*.079,.067,.104],[.105,.045,.05],[0,sign*.25,sign*.26]);
    s.link(p.bone,[sign*.091,-.077,.178],[sign*.112,-.004,.207],.022,.003,7);
    if(!grot) s.oval(p.green,[sign*.115,-.030,.095],[.059,.06,.085]);
  }
  if(plain)return;
  if(index%4===1) {
    s.oval(p.iron,[0,.090,-.01],[.159,.086,.126]);
    s.box(p.brass,[0,.095,.099],[.1,.046,.05]);
  } else if(!grot && index%3===0) {
    s.cylinder(p.black,[0,.148,-.039],.037,.046,.094,8,[-.24,0,0]);
    s.oval(p.black,[0,.216,-.071],[.064,.059,.052]);
  }
}

function pistol(s, position, rot, size=1) {
  const gun=s.child(position,rot,[size,size,size]);
  gun.box(p.iron,[0,.013,.064],[.109,.13,.27]);
  gun.box(p.black,[0,.07,.058],[.126,.046,.232]);
  gun.cylinder(p.steel,[0,.018,.228],.043,.057,.11,8,[Math.PI/2,0,0]);
  gun.cylinder(p.black,[0,.018,.285],.026,.026,.008,8,[Math.PI/2,0,0]);
  gun.box(p.leather,[0,-.078,-.014],[.062,.103,.066],[-.18,0,0]);
  gun.box(p.brass,[.06,.008,.065],[.01,.036,.083]);
}

function checks(s, pos, rot, unit, rows, columns) {
  const badge=s.child(pos,rot);
  badge.box(p.cream,[0,0,0],[columns*unit,rows*unit,.014]);
  for(let y=0;y<rows;y++) for(let x=0;x<columns;x++) if((x+y)%2===0) {
    badge.box(p.black,[(x-(columns-1)/2)*unit,(y-(rows-1)/2)*unit,.011],[unit,unit,.009]);
  }
}

function flag(s) {
  s.link(p.iron,[-.13,.63,-.16],[-.20,1.99,-.18],.026,.022);
  const pennon=s.child([-.20,1.92,-.18],[0,-.13,-.09]);
  pennon.plate(p.black,[[0,0],[-.46,.045],[-.356,-.079],[-.48,-.155],[-.31,-.19],[-.29,-.297],[0,-.244]],.022);
  pennon.oval(p.cream,[-.19,-.091,.018],[.088,.072,.011]);
  pennon.box(p.cream,[-.19,-.154,.021],[.085,.061,.018]);
  for(const side of [-1,1]) pennon.oval(p.orange,[-.19+side*.035,-.101,.032],[.019,.015,.006]);
}

export function greenskin(s,kind,variant=0) {
  if(kind==='boy' || kind==='gretchin') {
    sculptOrkPose(s,kind,variant,face);
    return;
  }
  const boss=kind==='warboss', wyrd=kind==='weirdboy';
  const scale=boss?1.39:1.14;
  const body=s.child([0,0,0],[0,[.02,-.18,.15,-.055,.20][variant%5],0],[scale,scale,scale]);
  const skin=[p.green,0x73883b,0x829741,0x657f36][variant%4];
  const cloth=[p.leather,0x655c42,0x594c3d,p.black][variant%4];
  for(const side of [-1,1]) {
    const x=side*.186, z=side*[-.061,.069,-.111,.09][variant%4];
    body.link(cloth,[side*.119,.56,0],[x,.34,z+.056],.112,.101);
    body.link(cloth,[x,.34,z+.056],[x*1.14,.108,z-.015],.098,.077);
    body.oval(p.leather,[x*1.14,.073,z+.048],[.108,.076,.151]);
    body.box(p.black,[x*1.14,.029,z+.046],[.18,.040,.238]);
    body.link(p.leather,[x,.247,z+.02],[x,.270,z+.025],.095,.095);
  }
  body.oval(cloth,[0,.55,-.014],[.214,.138,.151]);
  body.oval(wyrd?p.red:p.black,[0,.758,-.022],[.246,.235,.164],[-.12,0,0]);
  body.oval(skin,[0,.870,.015],[.253,.173,.137]);
  body.box(p.leather,[0,.782,.136],[.093,.365,.041],[0,0,-.67]);
  body.box(p.leather,[0,.574,.123],[.36,.083,.047]);
  body.box(p.brass,[.018,.568,.150],[.092,.065,.027]);
  for(const side of [-1,1]) {
    body.box(p.leather,[side*.142,.542,.142],[.083,.108,.058],[0,side*.19,side*.14]);
  }
  const head=body.child([0,1.051,.075],[.065,[-.11,.23,-.22,.07,.14][variant%5],0]);
  face(head,false,variant);
  const wide=wyrd?.357:.335, raise=wyrd?.76:boss?.85:.815;
  for(const side of [-1,1]) {
    const lifted=boss&&side>0;
    const hand=[side*wide,lifted?1.28:raise+(side>0?(.07*(variant%3)):-.035),.20];
    const elbow=[side*(wyrd?.41:.36),lifted?1.08:.79,.039];
    body.oval(skin,[side*.248,.919,-.015],[.134,.135,.122]);
    body.link(skin,[side*.257,.913,0],elbow,.116,.095);
    body.oval(skin,elbow,[.096,.099,.105]);
    body.link(skin,elbow,hand,.089,.079);
    body.oval(skin,hand,[.085,.074,.088]);
    for(let n=0;n<3;n++) body.oval(skin,[hand[0]+side*.055,hand[1]-.030+n*.027,hand[2]+.042],[.027,.018,.036]);
    body.link(p.leather,elbow.map((v,i)=>v*.24+hand[i]*.76),hand,.084,.081);
  }
  if(boss) {
    body.plate(boss?p.orange:p.iron,[[-.164,.04],[-.076,.124],[.083,.092],[.163,.015],[.12,-.093],[-.125,-.088]],.145,[-.251,.97,.003],[.10,-.12,-.28]);
    if(variant%4===0) checks(body,[-.25,.96,.09],[0,0,-.24],.038,2,4);
  }
  if(boss) {
    flag(body);
    const heavy=body.child([-.29,.79,.18],[.71,-.22,-.16],[1.36,1.35,1.45]);
    pistol(heavy,[0,0,.03],[0,0,0]);
    heavy.cylinder(p.iron,[0,-.05,.18],.057,.067,.23,9,[Math.PI/2,0,0]);
    checks(heavy,[-.067,.018,.078],[0,-1.46,0],.030,2,4);
    const mace=body.child([wide,1.28,.20],[.15,-.20,-.23]);
    mace.cylinder(p.leather,[0,.095,0],.031,.033,.39,9);
    mace.oval(p.iron,[0,.374,0],[.094,.133,.080]);
    for(let n=0;n<8;n++) {
      const a=n*2*Math.PI/8;
      mace.link(p.steel,[.067*Math.cos(a),.375+.088*Math.sin(a),0],[.115*Math.cos(a),.375+.154*Math.sin(a),0],.027,.002);
    }
    body.box(p.iron,[0,.84,.162],[.36,.22,.064]);
    for(let i=-1;i<=1;i++) body.link(p.bone,[i*.075,.75,.18],[i*.075+.025,.70,.205],.017,.002,6);
  } else if(wyrd) {
    const stick=body.child([0,.765,.228],[.01,-.12,1.47]);
    stick.cylinder(p.leather,[0,.05,0],.024,.034,1.41,9);
    for(let n=0;n<5;n++) stick.cylinder(p.brass,[0,-.44+n*.21,0],.037,.037,.035,8);
    stick.oval(p.bone,[0,.712,0],[.110,.105,.076]);
    for(const side of [-1,1]) stick.link(p.brass,[side*.06,.71,0],[side*.137,.84,0],.034,.003);
    for(const side of [-1,1]) for(let n=0;n<4;n++) {
      const a=[side*.13,.93,-.103], b=[side*(.13+n*.10),1.17+n*.019,-.16];
      const c=[side*(.18+n*.136),1.34-n*.030,-.14];
      const tip=[side*(.13+n*.147),1.61-n*.09,-.12];
      body.link(p.iron,a,b,.034,.030);
      body.link(p.rust,b,c,.030,.023);
      body.link(p.leather,c,tip,.025,.021);
      body.cylinder(p.red,tip,.045,.036,.071,8,[0,0,side*-.17]);
    }
    body.oval(p.leather,[0,1.105,.189],[.057,.067,.022]);
    body.oval(p.orange,[0,1.077,.207],[.039,.020,.013]);
    for(const side of [-1,1]) for(let n=0;n<3;n++) body.link(p.cream,[side*.16,.16+n*.053,.014],[side*.18,.19+n*.053,.021],.082,.082,8);
  }
}

export function wartrakk(s) {
  wartrakkVehicle(s,face);
}
