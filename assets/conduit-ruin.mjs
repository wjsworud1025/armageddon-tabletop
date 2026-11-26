// Pipe face is +Z. The standing end connects to the return; the opposite
// end has collapsed to the ground. Coordinates are in tabletop inches.
const slate=0x4a5051, iron=0x393e41, edge=0x736e62, brass=0x9a825b;
const dark=0x2f3031, red=0x80393d, ribRed=0x94454a, oxidised=0x456e69;
const tubeGreen=0x50716a, rust=0x795544, dust=0xa87f4e;

// Vertical sections describe the broken skyline. Each coloured facet is
// continuous solid masonry all the way between its two faces.
function wall(s,profile,thickness,color,reverse) {
  const T=s.T,xyz=[],colors=[],indices=[];
  const pigment=new T.Color(),tones=[color,reverse,edge].map(n=>new T.Color(n));
  const dirt=new T.Color(dust);
  function face(points,side){
    const offset=xyz.length/3;
    for(const [x,y,z] of points){
      const grain=.45*Math.sin(x*17+y*9)+.24*Math.sin(33*y-19*x)+.17*Math.sin(57*x-41*y);
      pigment.copy(tones[side]).lerp(dirt,Math.max(0,(.47-y)*.57+grain*.11)).multiplyScalar(.94+grain*.22);
      xyz.push(x,y,z);colors.push(pigment.r,pigment.g,pigment.b);
    }
    indices.push(offset,offset+1,offset+2,offset,offset+2,offset+3);
  }
  const z=thickness/2,rows=9;
  for(let i=1;i<profile.length;i++){
    const [x0,h0,b0=0]=profile[i-1],[x1,h1,b1=0]=profile[i];
    const columns=Math.max(1,Math.ceil((x1-x0)/.12));
    for(let j=0;j<columns;j++){
      const a=j/columns,b=(j+1)/columns;
      const coord=(u,v,depth)=>{
        const low=b0+(b1-b0)*u,top=h0+(h1-h0)*u;
        return [x0+(x1-x0)*u,low+(top-low)*v,depth];
      };
      for(let k=0;k<rows;k++){
        const low=k/rows,high=(k+1)/rows;
        face([coord(a,low,z),coord(b,low,z),coord(b,high,z),coord(a,high,z)],0);
        face([coord(b,low,-z),coord(a,low,-z),coord(a,high,-z),coord(b,high,-z)],1);
      }
      face([coord(a,1,z),coord(b,1,z),coord(b,1,-z),coord(a,1,-z)],2);
      face([coord(b,0,z),coord(a,0,z),coord(a,0,-z),coord(b,0,-z)],2);
      if(i===1&&j===0)face([coord(a,0,-z),coord(a,0,z),coord(a,1,z),coord(a,1,-z)],2);
      if(i===profile.length-1&&j===columns-1)face([coord(b,0,z),coord(b,0,-z),coord(b,1,-z),coord(b,1,z)],2);
    }
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(xyz,3));
  geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  geo.setIndex(indices);geo.computeVertexNormals();
  s.part(geo,color,[0,0,0],[1,1,1]);
}

function cable(s,color,points,radius,depth) {
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    s.link(color,[...a,depth],[...b,depth],radius,radius,9);
    if(i>1)s.oval(color,[...a,depth],[radius,radius,radius]);
  }
}

function upright(s,x,h,face) {
  const z=face*.095;
  s.box(iron,[x,h/2,z],[.083,h,.061]);
  s.box(edge,[x+.028,h/2,z+face*.032],[.014,h,.013]);
  for(let i=0;i<7;i++){
    const y=.094+i*(h-.19)/6;
    s.cylinder(0x887a64,[x-.005,y,z+face*.035],.013,.015,.013,7,[Math.PI/2,0,0]);
  }
}

function manifold(s){
  const x=.929,z=.157;
  // On the sprue the corrugated crown reaches roughly 96% of the end post.
  const stack=s.child([0,0,0],undefined,[1,1.065,1]);
  stack.cylinder(red,[x,.556,z],.088,.098,1.11,14);
  stack.cylinder(brass,[x,.422,z],.105,.106,.067,14);
  stack.cylinder(0xb29b76,[x,.442,z],.106,.106,.013,14);
  stack.cylinder(0x6e3438,[x,1.111,z],.128,.113,.413,14);
  for(const [y,r] of [[.958,.135],[1.029,.146],[1.105,.15],[1.181,.15],[1.256,.143],[1.315,.127]]){
    stack.cylinder(0x6c3337,[x,y,z],r,r*.87,.04,14);
    stack.cylinder(ribRed,[x,y+.021,z],r*.89,r,.031,14);
  }
  stack.cylinder(0x703739,[x,1.353,z],.113,.124,.038,14);
  s.link(red,[x,1.447,z],[1.02,1.46,.109],.040,.033,9);
  cable(s,red,[[1.012,1.46],[1.128,1.459],[1.151,1.473],[1.23,1.461],
    [1.294,1.416],[1.421,1.437],[1.464,1.465],[1.523,1.448]],.026,.092);

  // A separate short bottle and its outlet stand in front of the control box.
  const bottle=1.184;
  s.cylinder(oxidised,[bottle,.055,.175],.117,.120,.11,12);
  s.cylinder(tubeGreen,[bottle,.407,.176],.083,.094,.605,12);
  for(const [y,c] of [[.133,0x3c5751],[.294,edge],[.350,0x395450],[.676,0x395450]])
    s.cylinder(c,[bottle,y,.176],.096,.099,.034,12);
  s.oval(oxidised,[bottle,.716,.174],[.085,.096,.085]);
  s.link(0x41615a,[bottle,.764,.171],[bottle-.075,.835,.100],.045,.046,9);

  // On the broken end the outer sleeve splits and exposes a dark hollow.
  const broken=s.child([0,0,0],undefined,[1,1.114,1]);
  broken.link(tubeGreen,[.405,.355,.086],[.415,.676,.127],.106,.108,11);
  broken.link(0x60817a,[.415,.675,.127],[.502,.871,.122],.107,.084,11);
  broken.link(0x709089,[.502,.869,.122],[.502,1.027,.111],.084,.080,11);
  broken.cylinder(0x82897c,[.502,1.045,.111],.092,.094,.059,12);
  broken.cylinder(tubeGreen,[.502,1.112,.111],.074,.074,.077,12);
  broken.cylinder(dark,[.502,1.155,.111],.064,.063,.012,12);
  broken.plate(0x60817a,[[.429,1.144],[.447,1.196],[.464,1.190],[.5,1.239],
    [.515,1.216],[.554,1.254],[.571,1.139]],.030,[0,0,.077]);

  const box=s.child([1.38,1.222,.103]);
  box.box(dark,[0,0,0],[.519,.307,.102]);
  box.plate(0x80776b,[[-.25,-.137],[.196,-.137],[.245,-.087],[.245,.132],[-.25,.132]],.036,[0,.004,.067]);
  for(const [u,v] of [[-.178,.061],[.156,.072],[-.025,-.022]]){
    box.cylinder(0x969182,[u,v,.094],.048,.049,.017,8,[Math.PI/2,0,0],[1.31,1,.72]);
    box.cylinder(iron,[u,v,.107],.035,.038,.017,8,[Math.PI/2,0,0],[1.24,1,.74]);
    box.cylinder(0x756751,[u,v,.119],.013,.017,.016,8,[Math.PI/2,0,0]);
  }
  for(const [u,v] of [[-.216,-.089],[.207,-.074],[.097,.105],[-.068,.095]])
    box.cylinder(brass,[u,v,.093],.012,.014,.013,6,[Math.PI/2,0,0]);
  for(const line of [
    [[1.14,1.080],[1.18,1.017],[1.224,1.006],[1.264,.943],[1.268,.853],[1.311,.809],[1.352,.867],[1.360,1.070]],
    [[1.49,1.075],[1.49,.988],[1.445,.900],[1.46,.746],[1.417,.630],[1.330,.535],[1.306,.494],[1.208,.492]],
    [[1.575,1.075],[1.592,.955],[1.625,.861],[1.613,.711],[1.531,.625],[1.496,.556]]
  ])cable(s,0x783d38,line,.019,.107);
}

function reversePlumbing(s){
  const z=-.141;
  s.cylinder(0x66514a,[1.51,.62,z],.123,.134,1.18,12);
  for(const y of [.105,.180,.83,1.17])s.cylinder(iron,[1.51,y,z],.139,.141,.049,12);
  cable(s,0x656c69,[[1.50,1.203],[1.44,1.227],[1.29,1.221],[1.172,1.135],[1.136,1.064],[1.136,.30]],.051,-.18);
  for(const y of [.336,1.038])s.cylinder(edge,[1.136,y,-.18],.061,.062,.037,10);
  s.link(slate,[.805,.074,z],[.805,.802,z],.073,.071,9);
  s.cylinder(iron,[.805,.348,z],.087,.086,.047,10);
  s.link(tubeGreen,[.428,.081,-.108],[.418,.458,-.104],.087,.089,11);
  s.link(tubeGreen,[.418,.458,-.104],[.487,.645,-.033],.089,.069,11);
  // Two recessed sockets on the connector face of the pipe-wall moulding.
  for(const y of [.29,1.118]){
    s.box(dark,[2.067,y,-.080],[.309,.173,.018]);
    for(const sign of [-1,1])s.box(iron,[2.067+sign*.166,y,-.106],[.031,.229,.066]);
    for(const sign of [-1,1])s.box(edge,[2.067,y+sign*.099,-.108],[.362,.027,.067]);
  }
}

export function conduitRuin(sculpt){
  // Absolute height is estimated from the assembled board. The sprue
  // supplies proportions but was photographed without a measuring scale.
  const s=sculpt.child([0,0,0],undefined,[1,1.64/1.519,1]);
  const front=s.child([-1.20,0,.445]);
  wall(front,[[0,.256],[.082,.275],[.213,.269],[.284,.327],[.331,.392],[.360,.380],
    [.418,.581],[.491,.648],[.554,.654],[.604,.768],[.672,.740],[.720,.893],
    [.791,.963],[.822,1.116],[.883,1.181],[1.048,1.276],[1.124,1.325],[1.218,1.337],
    [1.283,1.409],[1.36,1.387],[1.434,1.423],[1.51,1.464],[1.597,1.438],
    [1.656,1.505],[1.705,1.475],[1.755,1.497]],.14,slate,0x4a4c49);
  wall(front,[[1.745,1.494],[1.823,1.478],[1.9,1.496,.143],[1.993,1.441,.143],
    [2.106,1.452,.143],[2.168,1.419,.143],[2.224,1.493,.143],[2.295,1.519,0],[2.395,1.50,0]],.148,0x41474a,slate);
  for(const [x,h] of [[.053,.257],[.584,.718],[1.736,1.487],[2.352,1.502]])upright(front,x,h,1);
  upright(front,1.736,1.487,-1);
  front.plate(0x575c59,[[1.803,.141],[2.311,.141],[2.311,.373],[2.274,.552],[1.873,.538],[1.803,.414]],.108,[0,0,.102]);
  front.plate(0x4b5254,[[1.838,.427],[2.277,.427],[2.265,.546],[1.914,.571]],.058,[0,0,.168],[-.09,0,0]);
  manifold(front);reversePlumbing(front);
  front.plate(0x677174,[[.265,0],[.655,0],[.652,.549],[.599,.589],[.568,.546],[.498,.552],
    [.454,.507],[.397,.515],[.359,.432],[.313,.444],[.274,.363]],.046,[0,0,.189]);
  cable(front,0x888a7c,[[.272,.342],[.313,.407],[.341,.397],[.389,.47],[.447,.468]],.009,.216);

  // The assembled elbow is visible on the table photo. The unseen inside
  // of this return uses plain recessed metal panels with a broken free end.
  const end=s.child([1.10,0,.445],[0,Math.PI/2,0]);
  wall(end,[[-.055,1.491],[.06,1.50],[.119,1.465],[.209,1.484],[.255,1.453],
    [.337,1.472],[.409,1.466],[.456,1.407],[.528,1.399],[.559,1.342],[.641,1.257],
    [.697,.812],[.784,.763],[.798,.639],[.896,.544],[.949,.398],[1.034,.297],[1.055,.251]],.145,slate,0x555653);
  upright(end,.106,1.411,1);
  end.plate(0x575b57,[[.219,.139],[.81,.139],[.81,.550],[.718,.656],[.696,.76],
    [.604,.828],[.567,.932],[.478,1.028],[.423,1.077],[.326,1.151],[.219,1.191]],.027,[0,0,.081]);
  end.box(iron,[.481,.152,-.090],[.689,.085,.066]);
  end.plate(0x92754f,[[.135,1.222],[.523,1.222],[.515,1.346],[.461,1.352],
    [.412,1.41],[.313,1.397],[.255,1.419],[.135,1.431]],.032,[0,0,-.091]);
  end.box(iron,[.318,1.203,-.101],[.429,.037,.044]);
  for(const [x,z,size] of [[.612,.083,.148],[.70,.130,.112],[.763,.17,.111],
    [.598,.179,.086],[.813,.142,.097],[.517,.139,.058],[.687,.235,.065],[.743,.22,.046]]){
    const y=size*.38;
    front.cylinder(dust,[x,y,z],size*.47,size,size*.76,6,[0,x*16,0],[1,.94,.76]);
  }
  // Projecting iron feet tie the narrow wall to the ground on both ends.
  front.box(edge,[.027,.056,0],[.123,.112,.211]);
  end.box(iron,[1.032,.055,0],[.115,.11,.211]);
}
