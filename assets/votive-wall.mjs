// A broken manufactorum corner. The axes match the registered miniature:
// local x runs down each wall, y is height, local z is wall thickness.
const stone=0x66605a, breakStone=0x575551, iron=0x4b4946, rib=0x817461;
const bronze=0x8d7555, rim=0xa08b6b, shadow=0x373735, ash=0xad8458;
const wax=0x864754;

// Cast stone and oxidised panels have a patchy patina. Subdivide the flat
// faces for vertex paint so both sides stay textured at close camera ranges.
function wallPlate(s,front,points,depth,z=0,back=front){
  const node=s.plate(front,points,depth,[0,0,z]),geometry=node.userData.geometry;
  const positions=[],normals=[],colors=[];
  const steel=new s.T.Color(0x4b4e50),grit=new s.T.Color(0xb39978);
  const paints=[new s.T.Color(front),new s.T.Color(back)],pigment=new s.T.Color();
  const stoneNoise=(x,y)=>Math.sin(x*19+y*11)*.37+Math.sin(33*x-17*y)*.21+
    Math.sin(43*y+x*21)*.16+Math.sin(y*83-x*63)*.11;
  function emit(a,b,c,n){
    if(Math.abs(n.z)>.99){
      const sides=[a.distanceToSquared(b),b.distanceToSquared(c),c.distanceToSquared(a)];
      const longest=Math.max(...sides);
      if(longest>.016){
        const i=sides.indexOf(longest),v=[a,b,c],left=v[i],right=v[(i+1)%3],tip=v[(i+2)%3];
        const mid=left.clone().lerp(right,.5);
        emit(left,mid,tip,n);emit(mid,right,tip,n);return;
      }
    }
    for(const v of [a,b,c]){
      const {x,y,z}=v,grain=stoneNoise(x,y),dust=Math.max(0,.48-y)*.68;
      pigment.copy(paints[n.z<0?1:0]).lerp(steel,Math.max(0,Math.min(.70,.09+grain*.4+(y-1)*.32)))
        .lerp(grit,Math.max(0,dust+grain*.14)).multiplyScalar(.87+.24*grain);
      positions.push(x,y,z);normals.push(n.x,n.y,n.z);colors.push(pigment.r,pigment.g,pigment.b);
    }
  }
  const attr=geometry.attributes,read=(data,i)=>new s.T.Vector3().fromBufferAttribute(data,i);
  for(let i=0;i<attr.position.count;i+=3)emit(read(attr.position,i),read(attr.position,i+1),read(attr.position,i+2),read(attr.normal,i));
  const surface=new s.T.BufferGeometry();
  for(const [key,array] of [['position',positions],['normal',normals],['color',colors]])surface.setAttribute(key,new s.T.Float32BufferAttribute(array,3));
  node.userData.geometry=surface;
  geometry.dispose();
}

function fractured(s,profile,depth,z=0,color=stone) {
  wallPlate(s,color,[[profile[0][0],0],[profile.at(-1)[0],0],...profile.toReversed()],depth,z,color===bronze?0x787773:color);
}

function channel(s,x,height,face,width=.09) {
  const z=face*.099;
  s.box(iron,[x,height/2,z],[width,height,.071]);
  for(const side of [-1,1])s.box(rib,[x+side*width*.36,height/2,z+face*.036],[.014,height,.017]);
}

function vents(s,x,count,face) {
  // The louvres sit in a shallow arched recess, closed through the masonry.
  const z=face*.108;
  for(let i=0;i<count;i++){
    const panel=s.child([x+i*.158,0,z],[0,face<0?Math.PI:0,0]);
    panel.plate(rib,[[-.079,.02],[.079,.02],[.079,.306],[.065,.361],[.031,.416],[0,.438],[-.031,.416],[-.068,.357],[-.079,.306]],.036);
    panel.plate(shadow,[[-.057,.026],[.057,.026],[.057,.294],[.043,.354],[0,.404],[-.045,.351],[-.057,.294]],.014,[0,0,.023]);
    for(let j=0;j<8;j++){
      const w=j<6?.109:j===6?.086:.049;
      panel.box(i%2?rim:rib,[0,.059+j*.044,.033],[w,.012,.016],[.25,0,0]);
    }
  }
}

function shrinePanel(s) {
  const center=1.039,left=center-.104,right=center+.104,lo=.782,shoulder=1.220,peak=1.338;
  const profile=[[.56,1.365],[.65,1.434],[.77,1.46],[.85,1.50],[.94,1.50],
    [1.06,1.55],[1.17,1.618],[1.28,1.656],[1.37,1.681],[1.47,1.664],[1.57,1.70],[1.66,1.691]];
  // Build the lower field, side piers and spandrel as separate solids.
  fractured(s,profile.filter(([x])=>x<left).concat([[left,1.527]]),.174,0,bronze);
  fractured(s,[[right,1.646],...profile.filter(([x])=>x>right)],.174,0,bronze);
  wallPlate(s,bronze,[[left,0],[right,0],[right,lo],[left,lo]],.174,0,0x797973);
  wallPlate(s,bronze,[[left,shoulder],[center,peak],[right,shoulder],[right,1.646],[left,1.527]],.174,0,0x797973);

  for(const face of [1,-1]){
    const z=face*.103;
    const arch=[[left,lo],[left,shoulder],[center,peak],[right,shoulder],[right,lo]];
    for(let i=1;i<arch.length;i++){
      const [a,b]=arch[i-1],[c,d]=arch[i];
      s.link(face>0?rim:rib,[a,b,z],[c,d,z],.015,.015,6);
    }
  }
  // A single thick casting joins the skulls to the sides of the pointed
  // niche. Light passes through the paired slots and the opening at its tip.
  const grille=new s.T.Shape();
  grille.moveTo(left,lo);grille.lineTo(right,lo);grille.lineTo(right,shoulder);
  grille.lineTo(center,peak);grille.lineTo(left,shoulder);grille.closePath();
  for(const [y,rx,ry] of [[.834,.028,.044],[.997,.035,.048],[1.127,.023,.024]]){
    for(const side of [-1,1]){
      const x=center+side*.052,hole=new s.T.Path();
      hole.moveTo(x-side*rx,y-ry*.37);
      hole.quadraticCurveTo(x-side*rx*.96,y+ry*.67,x+side*rx*.82,y+ry);
      hole.lineTo(x+side*rx,y-ry*.78);
      hole.quadraticCurveTo(x+side*rx*.10,y-ry*1.06,x-side*rx,y-ry*.37);
      hole.closePath();grille.holes.push(hole);
    }
  }
  const tip=new s.T.Path();
  tip.moveTo(center-.055,1.228);tip.lineTo(center,1.307);tip.lineTo(center+.055,1.228);
  tip.quadraticCurveTo(center,1.236,center-.055,1.228);tip.closePath();grille.holes.push(tip);
  const metalwork=new s.T.ExtrudeGeometry(grille,{depth:.038,bevelEnabled:false,curveSegments:4});
  metalwork.translate(0,0,-.019);
  s.part(metalwork,0x776c5a,[0,0,0],[1,1,1]);
  for(const y of [.847,1.009,1.148]){
    s.box(iron,[center,y+.049,0],[.185,.017,.058]);
    s.oval(0xa79c81,[center,y,0],[.040,.056,.066]);
    s.box(0x998971,[center,y-.032,.002],[.047,.033,.081]);
    for(const face of [-1,1])for(const side of [-1,1]){
      s.oval(shadow,[center+side*.015,y+.009,face*.059],[.011,.013,.006]);
    }
  }
  // Two-tier votive front, fluted piers, and pools of burgundy candle wax.
  s.box(rim,[1.109,.736,.125],[.856,.048,.083]);
  s.box(rib,[1.10,.093,.121],[.89,.055,.065]);
  for(const x of [.732,.807,.884,1.368,1.44,1.504]){
    const h=x<1?1.404:1.57;
    s.cylinder(bronze,[x,h/2,.101],.017,.022,h,7);
    for(const y of [.19,.49,.65,.92,1.21])s.box(rim,[x,y,.115],[.065,.024,.039]);
  }
  for(const [x,y,h] of [[.839,.759,.067],[.878,.759,.113],[.917,.759,.075],[.957,.759,.091],
    [1.029,.114,.10],[1.069,.114,.16],[1.109,.114,.127],[1.364,.098,.094]]){
    s.cylinder(wax,[x,y+h/2,.166],.022,.025,h,7);
    s.link(0x75424b,[x,y+.03,.167],[x+.018,y-.041,.151],.013,.008,6);
    s.cylinder(0x4a3933,[x,y+h+.008,.165],.003,.005,.016,5);
  }
  for(const [x,y] of [[.84,.73],[.90,.715],[.95,.752],[1.04,.087],[1.09,.106],[1.34,.089]]){
    s.oval(wax,[x,y,.152],[.042,.044,.025]);
    s.link(0x8e5360,[x+.014,y-.01,.161],[x+.029,y-.086,.158],.014,.011,6);
  }
  // Interior controls, wiring and the cast relief on either side of the aperture.
  for(const [x,w] of [[.89,.345],[1.29,.354]]){
    s.box(rib,[x,.323,-.102],[w,.645,.065]);
    s.box(x<1?0x867760:iron,[x,.333,-.14],[w-.048,.59,.025]);
  }
  s.box(shadow,[.884,.492,-.157],[.258,.143,.022]);
  for(let i=0;i<5;i++)for(let j=0;j<3;j++)s.box(0xaa9672,[.801+i*.042,.32-j*.046,-.157],[.026,.025,.014]);
  for(let i=0;i<7;i++){
    const a=i*Math.PI*2/7,b=(i+1)*Math.PI*2/7;
    s.link(rib,[1.29+.106*Math.cos(a),.43+.096*Math.sin(a),-.165],
      [1.29+.106*Math.cos(b),.43+.096*Math.sin(b),-.165],.016,.016,6);
  }
  for(const d of [-1,1])s.link(rib,[1.29+d*.089,.14,-.165],[1.29-d*.055,.45,-.165],.017,.015,6);
  for(const side of [-1,1]){
    const x=center+side*.129;
    const cable=[[x,.70],[x+side*.074,.79],[x+side*.042,.94],[x+side*.102,1.02],[x+side*.078,1.145],[x,1.166]];
    for(let i=1;i<cable.length;i++)s.link(i%3?0x743e37:iron,[...cable[i-1],-.146],[...cable[i],-.146],.016,.018,6);
  }
}

export function votiveWall(s) {
  const corner=[.526,0,-.340];
  const front=s.child(corner,[0,Math.atan2(-.513,-.859),0]);
  const end=s.child(corner,[0,Math.atan2(-.844,.537),0]);
  fractured(front,[[-.102,1.318],[.017,1.355],[.185,1.347],[.291,1.337],[.385,1.282],
    [.455,1.327],[.53,1.309],[.569,1.377]],.184);
  shrinePanel(front);
  for(const [x,h] of [[.019,1.35],[.565,1.374],[1.615,1.69]])for(const sign of [1,-1])channel(front,x,h,sign,.102);
  vents(front,.154,2,1);
  // Knocked-back panels and an uneven toe at the shattered tall end.
  fractured(front,[[1.658,1.443],[1.739,1.458],[1.777,1.51],[1.821,1.42],
    [1.80,1.31],[1.826,1.14],[1.831,.90],[1.855,.69],[1.911,.446],[1.927,.32],[1.974,.121]],.136,.104,breakStone);
  vents(front,1.80,1,1);
  for(const y of [.15,.94])front.box(iron,[.28,y,-.137],[.48,.065,.080]);
  wallPlate(front,0x876e50,[[.085,.189],[.498,.189],[.498,.905],[.085,.905]],.032,-.100);
  fractured(end,[[-.08,1.326],[.102,1.315],[.26,1.273],[.364,1.211],
    [.44,1.206],[.508,1.148],[.62,1.102],[.671,1.008],[.792,.958],[.86,.85],
    [.949,.774],[.979,.647],[1.006,.62],[1.011,.413],[1.061,.297],[1.061,.087]],.194,0,breakStone);
  vents(end,.105,2,-1);
  for(const sign of [-1,1])channel(end,.44,1.201,sign,.077);
  wallPlate(end,0x8c785d,[[.52,.235],[.948,.235],[.943,.69],[.888,.758],[.831,.788],[.73,.921],[.586,1.018],[.52,1.055]],.021,.108);
  for(let i=0;i<6;i++)for(const v of [-1,1]){
    const x=.025+i*.078;
    end.oval(iron,[x,1.04,v*.10],[.013,.013,.014]);
  }
  // The cast rests on low broken masonry. These little projecting pieces
  // bound the 2.50 × 1.25 in plan without bridging the space between walls.
  const floor=(points,y,color)=>s.plate(color,points,.037,[0,y,0],[Math.PI/2,0,0]);
  floor([[-1.25,.457],[-1.14,.359],[-.94,.301],[-.84,.420],[-.90,.579],[-1.035,.625],[-1.22,.556]],.0185,ash);
  floor([[.37,-.551],[.51,-.625],[.65,-.599],[.76,-.465],[.70,-.372],[.514,-.353]],.0185,stone);
  floor([[.923,.375],[1.071,.324],[1.216,.404],[1.25,.519],[1.197,.596],[1.07,.615],[.965,.53]],.0185,ash);
  for(const [wall,t,side] of [[front,.50,1],[front,1.42,-1],[end,.78,1]]){
    for(let k=0;k<8;k++){
      const x=t+(k%4-.8)*.051, z=side*(.116+.017*(k%3));
      wall.cylinder(k%3?ash:rim,[x,.034+(k%2)*.006,z],.029,.056,.068,5,[0,k*.81,0],[.83,1,1.15]);
    }
  }
}
