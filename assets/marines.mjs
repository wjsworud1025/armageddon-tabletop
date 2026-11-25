import {character} from './characters.mjs';
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

export function marine(s,kind,variant=0){
  if(kind==='intercessor'||kind==='vanguard')sculptMarinePose(s,kind,variant,helmet,wings);
  else character(s,kind,helmet,wings);
}

export function speeder(s) {
  landSpeeder(s,helmet);
}
