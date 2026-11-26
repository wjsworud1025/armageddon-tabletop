// Inches from the junction of the two walls. The door runs along +X and
// the bank of reliquaries returns along -Z. The corner opens towards +X/-Z.
const iron=0x4e4b4b, dark=0x353438, rim=0x706a64, rust=0x79503d;
const brass=0x9a8063, pale=0xa39786, red=0x753d39, dust=0x9b7955;

function facade(s){
  const slab=(color,poly,depth=.15,z=0)=>s.plate(color,poly,depth,[0,0,z]);
  const panel=(color,x0,x1,y0,y1,depth=.14,z=0)=>
    s.box(color,[(x0+x1)/2,(y0+y1)/2,z],[x1-x0,y1-y0,depth]);
  const rod=(color,a,b,r,z=0)=>s.link(color,[...a,z],[...b,z],r,r,6);
  function molding(x,y,w,h,face,color){
    const poly=[[x,y],[x,y+h*.76],[x+w*.19,y+h*.91],
      [x+w*.5,y+h],[x+w*.81,y+h*.91],[x+w,y+h*.76],[x+w,y]];
    slab(dark,poly,.027,face*.09);
    for(let i=1;i<poly.length;i++)rod(color,poly[i-1],poly[i],.024,face*.12);
  }
  function louvers(x,y,w,h,face){
    panel(dark,x,x+w,y,y+h,.039,face*.108);
    for(let i=0;i<6;i++)panel(rim,x+.02,x+w-.02,y+.015+i*h/6,y+.039+i*h/6,.036,face*.139);
  }
  function band(x0,x1,y){
    for(const face of [-1,1]){
      panel(iron,x0,x1,y-.054,y+.054,.084,face*.092);
      for(let x=x0+.076;x<x1-.04;x+=.164)
        panel(dark,x-.031,x+.031,y-.029,y+.028,.023,face*.143);
    }
  }
  function pier(x,y1,faces=[-1,1],openBay=false){
    function upright(color,halfWidth,bottom,depth,z=0){
      if(!openBay || z<0){
        panel(color,x-halfWidth,x+halfWidth,bottom,y1,depth,z);
        return;
      }
      // Only the outside flange continues across the lower corner light.
      panel(color,x-halfWidth,x+halfWidth,bottom,1.52,depth,z);
      panel(color,x-halfWidth,x+halfWidth,2.25,y1,depth,z);
      if(z===0)panel(color,x-halfWidth,x+halfWidth,1.52,2.25,.160,-.025);
    }
    upright(iron,.061,.025,.21);
    for(const face of faces){
      upright(rim,.032,.03,.049,face*.112);
      for(const y of [.07,1.57,2.25,2.95,3.55])if(y<y1){
        if(openBay && face>0 && y===1.57)continue;
        panel(iron,x-.079,x+.079,y-.043,Math.min(y+.062,y1),.060,face*.137);
        s.cylinder(brass,[x,y,face*.173],.029,.029,.022,7,[Math.PI/2,0,0]);
      }
    }
  }
  function crossed(x0,x1,y0,y1){
    rod(rim,[x0,y0],[x1,y1],.041);
    rod(iron,[x0,y1],[x1,y0],.049);
  }
  return {slab,panel,rod,molding,louvers,band,pier,crossed};
}

export function doorWall(s){
  const {slab,panel,rod,molding,louvers,band,pier,crossed}=facade(s);
  slab(iron,[[-.11,0],[4.86,0],[4.79,.10],[4.52,.20],[4.42,.23],
    [4.43,.49],[4.30,.57],[4.30,.96],[4.18,1.19],[4.10,1.28],[4.05,1.61],
    [3.89,1.65],[3.77,1.91],[3.50,1.96],[3.35,1.88],[3.10,1.88],
    [2.86,1.94],[2.68,2.16],[2.89,2.20],[2.89,2.28],[2.68,2.32],
    [2.60,2.46],[2.23,2.63],[2.08,2.79],[2.04,2.91],[1.93,2.95],
    [1.81,3.16],[1.69,3.11],[1.63,3.27],[1.42,3.27],[1.39,2.46],
    [.68,2.46],[.66,3.53],[.49,3.60],[.15,3.58],[-.10,3.61]]);
  // The intact lancet and its broken neighbour are separated by a broad jamb.
  panel(iron,.957,1.105,2.43,3.30);
  slab(iron,[[.58,3.49],[.68,3.56],[.82,3.53],[.98,3.47],[1.09,3.37],
    [1.115,3.21],[.971,3.21],[.953,3.32],[.895,3.40],[.842,3.44],
    [.763,3.40],[.703,3.32],[.674,3.23],[.595,3.23]]);
  // The thin glazing stands toward the outer flange. A full-depth extrusion
  // closes these lights when viewed from the upper ring of the turntable.
  for(const y of [2.72,3.20])panel(rim,.641,1.409,y-.019,y+.019,.030,.060);
  panel(rim,.641,1.206,2.936,2.974,.030,.060);
  panel(rim,1.292,1.409,2.936,2.974,.030,.060);
  for(const [x,top] of [[0,3.60],[.522,3.56],[1.564,3.26],[2.066,2.83],[4.03,1.62]])
    pier(x,top,x===0?[1]:undefined);
  for(const [y0,y1] of [[1.62,2.22],[2.30,2.90],[2.99,3.52]])
    crossed(.04,.482,y0,y1);
  for(const [end,y] of [[4.08,1.57],[2.85,2.25],[.56,2.95]])band(-.06,end,y);
  for(const face of [-1,1]){
    for(const x of [.068,1.652])molding(x,.035,.32,1.38,face,brass);
    for(const x of [.663,.907,1.153]){
      molding(x,1.686,.205,.46,face,rim);
      louvers(x+.027,1.71,.15,.30,face);
    }
    louvers(1.69,2.34,.272,.42,face);
    panel(rust,.64,1.43,.045,1.40,.060,face*.118);
    panel(red,.70,1.39,.067,1.35,.044,face*.161);
    rod(iron,[.75,.18],[1.30,1.26],.029,face*.194);
    rod(iron,[.75,1.26],[1.3,.18],.028,face*.194);
    panel(brass,1.21,1.33,.685,.724,.037,face*.195);
    for(const x of [2.28,2.88,3.52])molding(x,.07,.40,1.31,face,face>0?rim:brass);
    if(face>0){
      for(const x of [2.51,2.81,3.11,3.41,3.67])
        s.cylinder(rust,[x,1.87,.123],.098,.098,.052,10,[Math.PI/2,0,0]);
    }else{
      for(const x of [2.41,2.63,3.23,3.49]){
        rod(iron,[x,.12],[x,1.36],.062,-.142);
        for(const y of [.32,1.12])panel(brass,x-.074,x+.074,y,y+.042,.063,-.181);
      }
    }
  }
}

function reliquaryWall(s){
  const {slab,panel,rod,molding,louvers,band,pier,crossed}=facade(s);
  slab(iron,[[-.23,0],[3.88,0],[3.82,.20],[3.76,.48],[3.66,.56],
    [3.56,.79],[3.27,1.01],[2.97,1.11],[2.52,1.26],[2.49,1.68],
    [2.33,1.80],[2.13,2.16],[2.05,2.27],[1.63,2.30],[1.57,2.44],
    [1.52,2.78],[1.48,2.97],[.43,2.98],[.41,1.60],[-.23,1.60]]);
  // The corner column is a genuinely open three-storey lattice.
  for(const [x,top] of [[-.17,3.61],[.343,3.60],[1.983,2.30],[2.46,1.64]])
    pier(x,top,undefined,x===.343);
  // The lowest cross is a flat iron strap on the outside face of the post.
  // Its two exposed edges have little depth when seen through the corner.
  slab(rim,[[-.155,1.66],[-.050,1.66],[.335,2.24],[.230,2.24]],.032,-.030);
  slab(iron,[[-.155,2.24],[-.050,2.24],[.335,1.66],[.230,1.66]],.032,-.030);
  for(const [y0,y1] of [[2.30,2.91],[3.00,3.53]])
    crossed(-.115,.286,y0,y1);
  for(const [end,y] of [[2.51,1.56],[2.27,2.25],[1.48,2.96],[.45,3.54]])
    band(-.215,end,y);
  panel(iron,.356,.480,2.95,3.57);
  panel(iron,.866,.959,2.95,3.42);
  slab(iron,[[.388,3.52],[.45,3.605],[.749,3.605],[.867,3.56],[.990,3.43],
    [.943,3.365],[.864,3.39],[.815,3.443],[.763,3.476],[.703,3.44],
    [.669,3.414],[.617,3.452],[.551,3.474],[.495,3.424],[.456,3.353]]);
  panel(rim,.655,.686,2.98,3.44,.035,.037);
  panel(rim,1.123,1.15,2.98,3.23,.035,.037);
  for(const [y,end] of [[3.075,1.40],[3.18,1.29],[3.305,1.08]])
    panel(rim,.443,end,y-.014,y+.014,.036,.037);
  for(const face of [-1,1]){
    for(const x of [-.12,.55,.98,1.41,2.096,2.70,3.09]){
      const h=x>2.65?.76:1.34,w=x<0||x>2?.29:.34;
      molding(x,.08,w,h,face,face<0?brass:rim);
      louvers(x+.027,.10,w-.056,.22,face);
      const cx=x+w/2;
      s.oval(face<0?pale:iron,[cx,h*.73,face*.137],[w*.16,h*.085,.037]);
      slab(face<0?dust:rim,[[cx-.054,h*.62],[cx+.05,h*.62],[cx+.084,h*.28],[cx-.073,h*.28]],.043,face*.126);
    }
    for(const x of [.472,.72,.968,1.216,1.464,1.712])louvers(x,1.70,.19,.396,face);
    panel(iron,1.00,1.40,2.465,2.82,.045,face*.10);
    s.cylinder(brass,[1.20,2.64,face*.133],.136,.136,.042,9,[Math.PI/2,0,0]);
  }
}

// A sloping strip has parallel top and bottom faces. Its underside leans
// inwards where the metal has folded away from the horizontal landing.
function brokenStrip(s,color,outline,thickness,[x,y,d],drop,lean){
  const node=s.plate(color,outline.map(([u,v])=>[u-x,d-v]),thickness,
    [x,y-thickness/2,-d],[Math.PI/2,0,0]);
  node.userData.geometry.applyMatrix4(new s.T.Matrix4().set(
    1,0,-lean,-lean*thickness/2,
    0,1,0,0,
    0,-drop,1,0,
    0,0,0,1));
}

function landing(s){
  // The freestanding edge splits into a heavy beam and a curled metal tab.
  const boundary=[[.035,.035],[2.77,.035],[2.78,.69],[2.598,.731],
    [2.565,.841],[2.550,.953],[2.535,1.015],[2.535,1.107],
    [2.52,1.29],[2.38,1.24],[2.46,1.42],[2.26,1.44],
    [2.15,1.67],[1.97,1.76],[1.91,1.98],[1.77,2.09],[1.89,2.21],
    [1.66,2.20],[1.69,2.45],[1.91,2.50],[1.91,2.61],[.94,2.61],
    [.95,2.49],[1.11,2.46],[1.12,2.34],[.95,2.40],[.86,2.27],
    [.65,2.31],[.66,2.22],[.41,2.31],[.24,2.41],[.19,2.29],[.035,2.34]];
  const cast=s.plate(rust,boundary.map(([x,d])=>[x,-d]),.105,[0,2.2475,0],[Math.PI/2,0,0]);
  cast.userData.supportBridges=[[[2.78,-.69,-.0525],[2.66,-.81,-.0525]],
    [[2.66,-.81,-.0525],[2.72,-1.08,-.0525]],[[2.72,-1.08,-.0525],[2.58,-1.07,-.0525]],
    [[2.58,-1.07,-.0525],[2.52,-1.29,-.0525]]];
  brokenStrip(s,iron,[[2.585,.725],[2.778,.682],[2.759,.983],[2.750,1.031],
    [2.730,1.049],[2.625,1.046],[2.617,1.032],[2.626,.946],[2.605,.854]],
    .060,[2.65,2.299,.69],.141,.46);
  brokenStrip(s,rust,[[2.492,.994],[2.523,.991],[2.545,1.036],[2.585,1.069],
    [2.617,1.105],[2.635,1.140],[2.624,1.155],[2.605,1.150],
    [2.570,1.114],[2.531,1.092],[2.504,1.061]],
    .034,[2.51,2.262,.990],.350,.25);
  for(const [x,d,full] of [[.76,.76,true],[2.01,.76,true],[.76,1.95,false]]){
    const size=full ? .53 : .425;
    for(const rad of [size,size*.71]){
      for(const sign of [-1,1]){
        s.box(iron,[x,2.306,-d+sign*rad],[2*rad,.014,.038]);
        s.box(iron,[x+sign*rad,2.306,-d],[.038,.014,2*rad]);
      }
    }
  }
  for(let i=0;i<16;i++){
    const a=i*Math.PI/8,b=(i+1)*Math.PI/8;
    s.link(brass,[.76+.35*Math.cos(a),2.313,-.72+.35*Math.sin(a)],
      [.76+.35*Math.cos(b),2.313,-.72+.35*Math.sin(b)],.021,.021,6);
  }
  for(const x of [.18,1.39]){
    s.box(iron,[x,2.18,-1.20],[.081,.102,2.29]);
  }
  s.link(rim,[1.39,1.90,-.13],[1.39,2.16,-.89],.038,.038,5);
}

export function reliquaryRuin(s){
  doorWall(s);
  reliquaryWall(s.child([0,0,0],[0,Math.PI/2,0]));
  landing(s);
  // Eroded corner soles and broken masonry establish the ground contact envelope.
  s.plate(dust,[[-.33,0],[.23,0],[.18,.12],[-.11,.16],[-.31,.087]],.31,[0,0,.17]);
  s.plate(dust,[[4.20,0],[4.87,0],[4.76,.08],[4.49,.14],[4.32,.30]],.18);
  for(const [x,z] of [[.37,.26],[2.48,.19],[3.72,.17],[.12,-3.47]]){
    s.cylinder(dust,[x,.052,z],.075,.124,.102,6,[0,x*.8,0],[1.10,1,.72]);
  }
}
