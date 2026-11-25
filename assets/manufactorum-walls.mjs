// Original cast-iron wall sections, built in inches. The outside of a wall
// faces local -Z. Both faces remain visible from within the L-shaped ruin.
const iron=0x49464a,edge=0x756a63,oxide=0x84543d,recess=0x302e30;
const dust=0x9c7858,brass=0x957956,red=0x773b35;

function wallTools(s,w,h){
  const plate=(color,points,depth,z=0)=>s.plate(color,points.map(([x,y])=>[x*w,y*h]),depth,[0,0,z]);
  function panel(color,x,y,width,height,z,depth){
    s.box(color,[(x+width/2)*w,(y+height/2)*h,z],[width*w,height*h,depth]);
  }
  function bar(color,a,b,z,r){
    s.link(color,[a[0]*w,a[1]*h,z],[b[0]*w,b[1]*h,z],r,r,5);
  }
  function arch(x,y,width,height,face,trim){
    const a=[x,y],b=[x,y+height*.72],c=[x+width*.20,y+height*.88],
      peak=[x+width*.5,y+height],d=[x+width*.80,y+height*.88],
      e=[x+width,y+height*.72],f=[x+width,y];
    plate(recess,[a,b,c,peak,d,e,f],.022,face*.085);
    const path=[a,b,c,peak,d,e,f];
    for(let k=1;k<path.length;k++)bar(trim,path[k-1],path[k],face*.111,.020);
  }
  function vent(x,y,width,height,face){
    panel(recess,x,y,width,height,face*.097,.034);
    for(let i=0;i<5;i++)panel(edge,x+.01*width,y+(i+.35)*height/5,width*.96,height*.063,face*.124,.03);
  }
  function bolt(x,y,face){
    s.cylinder(brass,[x*w,y*h,face*.14],.026,.026,.03,6,[Math.PI/2,0,0]);
  }
  return {plate,panel,bar,arch,vent,bolt};
}

function tallWall(s,name,w,h){
  const {plate,panel,bar,arch,vent,bolt}=wallTools(s,w,h);
  // A solid ground floor survives below the collapsed courses. The clear
  // lights in the high corner are built between structural metal members.
  plate(iron,[[0,0],[1,0],[.974,.043],[.919,.066],[.892,.14],[.853,.145],
    [.865,.26],[.815,.31],[.811,.407],[.76,.46],[.714,.449],[.663,.53],
    [.62,.53],[.566,.597],[.52,.602],[.464,.685],[.412,.711],[.383,.79],
    [.35,.80],[.347,.632],[.13,.632],[.13,.977],[.084,1],[0,.979]],.15);
  panel(iron,.291,.628,.032,.264,0,.142);
  plate(edge,[[.124,.953],[.191,.962],[.224,.943],[.24,.916],[.239,.945],
    [.21,.979],[.146,.996],[.122,.989]],.145);
  panel(iron,.21,.626,.014,.31,0,.09);
  for(const y of [.698,.785,.866])panel(edge,.126,y,y>.85?.109:.174,.011,0,.065);
  // Side-specific castings give the surviving sections different identities.
  for(const face of [-1,1]){
    const trim=face<0?edge:oxide;
    for(const [x,top] of [[.026,.97],[.123,.96],[.334,.865],[.431,.66],[.785,.393]]){
      panel(trim,x-.011,0,.022,top,face*.085,.056);
      for(const y of [.04,.40,.60,.79,.94])if(y<top)bolt(x,y,face);
    }
    for(const [y,length] of [[.408,.809],[.609,.512],[.783,.132]]){
      panel(trim,0,y,length,.025,face*.087,.072);
      for(let x=.03;x<length-.015;x+=.081)panel(recess,x,y+.004,.029,.012,face*.129,.012);
    }
    for(const y of [.44,.644,.803]){
      bar(trim,[.034,y],[.113,y+.137],face*.112,.024);
      bar(trim,[.113,y],[.034,y+.137],face*.112,.024);
    }
    if(name==='door'&&face<0){
      panel(recess,.135,.007,.184,.39,-.096,.055);
      panel(red,.152,.009,.152,.35,-.133,.04);
      bar(oxide,[.163,.06],[.293,.32],-.163,.03);
      bar(oxide,[.293,.06],[.163,.32],-.163,.03);
      panel(brass,.257,.182,.041,.012,-.17,.027);
    }else if(name==='pipe'&&face<0){
      for(const x of [.46,.66]){arch(x,.021,.114,.326,face,trim);vent(x+.015,.032,.085,.07,face)}
    }else if(name==='chapel'&&face<0){
      arch(.143,.015,.164,.38,face,brass);
      for(const x of [.194,.24])panel(brass,x,.045,.011,.189,-.13,.035);
      s.cylinder(brass,[.226*w,.244*h,-.139],.092,.092,.045,10,[Math.PI/2,0,0]);
      s.cylinder(iron,[.226*w,.244*h,-.169],.065,.065,.025,10,[Math.PI/2,0,0]);
    }else{
      arch(.148,.025,.157,.354,face,trim);
      for(const x of [.176,.24])vent(x,.053,.041,.086,face);
    }
    for(const x of [.047,.353,.476,.616]){
      arch(x,.029,x<.40?.052:.105,.335,face,trim);
      panel(dust,x,.022,x<.40?.05:.102,.029,face*.103,.02);
    }
    vent(.155,.446,.145,.123,face);
    vent(.353,.636,.047,.083,face);
  }
}

function brokenWall(s,name,w,h){
  const {plate,panel,bar,arch,vent,bolt}=wallTools(s,w,h);
  const pipe=name==='shortPipe';
  const crown=pipe?[[.96,.23],[.81,.51],[.70,.47],[.65,.82],[.47,.81],[.40,.93]]:
    [[.98,.83],[.85,.86],[.78,.98],[.69,.96],[.64,1],[.56,.93],
      [.42,.91],[.35,.81],[.26,.84],[.20,.77],[.11,.80]];
  plate(iron,[[0,0],[1,0],...crown,[0,pipe?.99:.78]],.15);
  for(const face of [-1,1]){
    const shrine=(name==='shrine')===(face===-1);
    for(const [x,top] of [[.045,.74],[.28,.78],[.71,pipe?.49:.94]]){
      panel(edge,x,0,.021,top,face*.083,.06);bolt(x+.009,.12,face);
    }
    if(pipe&&face<0){
      for(const x of [.20,.37]){
        bar(red,[x,.06],[x,.72],-.15,.068);
        for(const y of [.21,.57])panel(oxide,x-.037,y,.074,.040,-.15,.16);
      }
    }else if(shrine){
      arch(.339,.076,.337,.746,face,brass);arch(.43,.32,.159,.36,face,brass);
      panel(oxide,.36,.316,.30,.036,face*.13,.073);
      for(const x of [.395,.462,.571])panel(red,x,.093,.025,.127,face*.126,.048);
    }else{
      arch(.37,.063,.266,.65,face,edge);
      vent(.39,.107,.092,.177,face);vent(.50,.107,.092,.177,face);
    }
    vent(.082,.053,.137,.196,face);
  }
}

export function manufactorumWall(s,name,width,height){
  if(['door','pipe','chapel','reliquary'].includes(name))tallWall(s,name,width,height);
  else brokenWall(s,name,width,height);
}
