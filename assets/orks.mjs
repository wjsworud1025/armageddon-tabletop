import {character} from './characters.mjs';
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

export function greenskin(s,kind,variant=0){
  if(kind==='boy'||kind==='gretchin')sculptOrkPose(s,kind,variant,face);
  else character(s,kind,face);
}

export function wartrakk(s) {
  wartrakkVehicle(s,face);
}
