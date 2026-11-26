import {paint as p,Sculpt} from './sculpt.mjs';
import {orkPose} from './ork-poses.mjs';
import {shoulderShootaBoy} from './ork-shoulder-shoota.mjs';
import {raisedCleaverGretchin} from './gretchin-raised-cleaver.mjs';

const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const offset=(a,x,y,z)=>[a[0]+x,a[1]+y,a[2]+z];
const norm=a=>Math.hypot(...a);
const delta=(a,b)=>a.map((v,i)=>v-b[i]);

function directed(s,from,to,axis){
  const part=s.child(from);
  const direction=new s.T.Vector3(...delta(to,from)).normalize();
  if(axis==='barrel'){
    part.group.quaternion.setFromRotationMatrix(new s.T.Matrix4().lookAt(direction,new s.T.Vector3(),new s.T.Vector3(0,1,0)));
  }else{
    // Keep the broad, flat face of the chopper towards the viewer.
    part.group.rotation.z=-Math.atan2(direction.x,direction.y);
    part.group.rotateX(Math.asin(direction.z));
  }
  return part;
}

function gun(s,hand,tip,type,u){
  const part=directed(s,hand,tip,'barrel'),length=norm(delta(tip,hand));
  const short=['slugga','grotPistol','blasta'].includes(type), heavy=['rokkit','kustom','vented','bayonet'].includes(type);
  const thickness=(type==='blasta'?.125:type==='cannon'?.11:short?.082:heavy?.104:.083)*u;
  const barrel=type==='bayonet'?length*.73:length;
  const main=barrel*(short?.61:.54);
  const housing=type==='grotPistol'?p.red:p.iron;
  part.box(housing,[0,.011*u,main*.42],[thickness*1.62,thickness*1.92,main*1.18]);
  part.box(p.black,[0,thickness*.80,main*.46],[thickness*1.3,thickness*.36,main*1.12]);
  part.box(p.leather,[0,-thickness*.7,-.008*u],[thickness*.7,thickness*1.3,thickness*.81],[-.28,0,0]);
  part.cylinder(p.iron,[0,.012*u,(barrel+main)*.5],thickness*.53,thickness*.71,barrel-main,9,[Math.PI/2,0,0]);
  part.cylinder(p.steel,[0,.012*u,barrel-.022*u],thickness*.74,thickness*.74,.052*u,9,[Math.PI/2,0,0]);
  part.cylinder(p.black,[0,.012*u,barrel+.005*u],thickness*.48,thickness*.48,.006*u,9,[Math.PI/2,0,0]);
  if(!short){
    part.box(p.leather,[0,0,-.085*u],[thickness,thickness*1.03,.17*u],[-.15,0,0]);
    part.box(p.black,[0,-thickness*.96,main*.57],[thickness*.75,thickness*1.3,.13*u],[.13,0,0]);
    for(const side of [-1,1])for(let i=0;i<3;i++){
      part.box(p.steel,[side*thickness*.83,.016*u,main*(.30+i*.20)],[.009*u,.026*u,.026*u]);
    }
  }
  if(type==='vented'||type==='cannon'||type==='blasta'){
    const coat=type==='cannon'?p.steel:p.iron;
    for(let j=0;j<3;j++){
      const z=main+(barrel-main)*(.14+j*.28);
      part.cylinder(coat,[0,.012*u,z],thickness*.85,thickness*.85,(barrel-main)*.20,10,[Math.PI/2,0,0]);
      if(type==='vented')for(const side of [-1,1])part.oval(p.black,[side*thickness*.62,.047*u,z],[.018*u,.020*u,.040*u]);
    }
  }
  if(type==='bayonet'){
    part.plate(p.steel,[[0,0],[-.033*u,.07*u],[0,(length-barrel)+.05*u],[.044*u,.038*u]],.024*u,[0,-thickness*.35,barrel-.05*u],[Math.PI/2,0,0]);
  }
  if(type==='rokkit'||type==='kustom'){
    for(let i=0;i<2;i++){
      const x=(i-.5)*thickness;
      part.cylinder(p.steel,[x,thickness*.46,barrel*.69],thickness*.40,thickness*.48,barrel*.46,8,[Math.PI/2,0,0]);
      if(type==='rokkit')part.cylinder(i?p.red:p.bone,[x,thickness*.46,barrel*.97],.002,thickness*.43,barrel*.18,7,[Math.PI/2,0,0]);
    }
    // Loose linked ammunition hangs vertically from the side of each Nob's gun.
    const start=mix(hand,tip,.38),end=offset(start,-.055*u,-.265*u,.025*u);
    s.link(p.leather,start,end,.026*u,.029*u,8);
    for(let j=0;j<7;j++)s.box(p.brass,mix(start,end,j/7),[.080*u,.02*u,.033*u],[.03,-.24,.15]);
  }
  if(type==='skullGun'){
    const tag=s.child(offset(hand,-.030*u,.172*u,.005*u),[.08,.05,-.14],[u,u,u]);
    tag.box(p.black,[0,0,0],[.178,.208,.120]);
    tag.plate(p.iron,[[-.074,-.104],[-.068,.09],[-.027,.130],[.076,.108],[.091,-.080]],.045,[0,0,.058]);
    tag.plate(p.iron,[[.037,.046],[.109,.154],[.209,.072],[.09,.008]],.054);
    tag.oval(p.cream,[0,.03,.087],[.045,.042,.01]);tag.box(p.cream,[0,-.006,.087],[.047,.036,.017]);
    for(const sign of [-1,1])tag.oval(p.black,[sign*.017,.028,.1],[.011,.012,.005]);
    for(let row=0;row<2;row++)tag.box(p.brass,[0,-.075-row*.032,.091],[.063,.012,.012]);
  }
  if(type==='shoulderGun'){
    part.box(p.iron,[0,.025*u,-.115*u],[.139*u,.155*u,.29*u],[.11,0,0]);
    part.box(p.steel,[0,.082*u,-.14*u],[.14*u,.033*u,.23*u]);
    part.plate(p.rust,[[0,0],[-.042*u,.11*u],[.062*u,.205*u],[.09*u,.015*u]],.04*u,[0,.088*u,main*.58],[0,1.24,0]);
  }
  if(type==='blasta'){
    for(let j=0;j<2;j++){
      const z=barrel*(.21+j*.21);
      part.cylinder(p.steel,[0,.012*u,z],thickness,thickness,.055*u,10,[Math.PI/2,0,0]);
    }
  }
}

function handTool(s,hand,tip,type,u){
  if(type==='support')return;
  if(!['axe','hammer','grenade','knife','saw','cleaver'].includes(type)){
    gun(s,hand,tip,type,u);return;
  }
  const part=directed(s,hand,tip,'haft'),h=norm(delta(tip,hand));
  const grip=.033*u;
  const bladeType=['knife','saw','cleaver'].includes(type);
  const shank=bladeType?h*.28:h*.8;
  part.cylinder(p.leather,[0,shank/2-.035*u,0],grip,grip*1.11,shank+.09*u,8);
  for(let i=0;i<3;i++)part.cylinder(p.brass,[0,shank*(.18+.20*i),0],grip*1.12,grip*1.12,.014*u,8);
  if(type==='grenade'){
    part.cylinder(p.iron,[0,h*.835,0],.058*u,.049*u,h*.26,8);
    part.cylinder(p.rust,[0,h*.91,0],.070*u,.071*u,h*.17,8);
    part.cylinder(p.iron,[0,h*.997,0],.060*u,.060*u,.017*u,8);
    return;
  }
  const w=(type==='knife'?.064:type==='saw'?.085:.14)*u;
  const shapes={
    axe:[[-w*.40,h*.69],[w*.38,h*.70],[w*1.4,h*.55],[w*1.85,h*.87],[w*1.43,h*1.03],[-w*.48,h*.98]],
    hammer:[[-w,h*.74],[w*.93,h*.70],[w*1.15,h*.98],[-w*.82,h*1.03]],
    knife:[[-w*.57,shank],[w*.69,shank],[w*.57,h*.73],[-w*.3,h],[-w*.87,h*.70]],
    cleaver:[[-w*.46,shank],[w*.48,shank],[w,h*.63],[w*.82,h*.89],[w*.22,h],[-w*.55,h*.84]],
    saw:[[-w*.62,shank],[w*.71,shank],[w*.71,h*.93],[w*.44,h],[-w*.57,h*.98]],
  };
  part.plate(type==='saw'?p.rust:p.iron,shapes[type],(type==='hammer'?.145:.047)*u);
  if(type==='saw'){
    for(let i=0;i<7;i++){
      const y=shank+(h-shank)*(.08+i*.125);
      part.plate(p.steel,[[0,0],[.061*u,.057*u],[0,.046*u]],.038*u,[w*.61,y,0]);
    }
  }else if(type==='knife'||type==='cleaver'){
    part.plate(p.steel,[[-w*.48,shank],[-w*.63,h*.78],[-w*.28,h*.96],[-w*.22,h*.65]],.05*u);
  }
}

function headwear(head,has,grot){
  if(has('cap')||has('jawHelm')||has('mask')||has('darkSpike')||has('copperSpike')){
    const color=has('copperSpike')?0x976941:p.iron;
    head.oval(color,[0,.104,-.006],[.158,.087,.135]);
    head.cylinder(color,[0,.102,0],.158,.164,.035,12,undefined,[1,1,.84]);
    head.box(p.brass,[0,.111,.130],[.055,.029,.019]);
    if(grot||has('jawHelm')){
      head.cylinder(p.brass,[0,.187,0],.036,.057,.033,9);
      head.link(p.steel,[0,.191,0],[.019,grot?.385:.31,-.017],.042,.002,8);
    }
  }
  if(has('jawHelm')){
    for(let i=-2;i<=2;i++)head.link(p.bone,[i*.045,.129,.110],[i*.043,.108-Math.abs(i)*.019,.167],.035,.006,8);
    for(const sign of [-1,1])head.box(p.iron,[sign*.138,.03,.025],[.037,.162,.102],[.11,0,sign*.1]);
  }
  if(has('mask')){
    head.box(p.iron,[0,.043,.119],[.272,.094,.070]);
    for(const sign of [-1,1])head.oval(p.black,[sign*.065,.049,.159],[.044,.026,.010]);
  }
  if(has('jawHelm')||has('mask')){
    for(const sign of [-1,1])head.oval(p.steel,[sign*.132,.085,.066],[.018,.018,.014]);
  }
  if(has('redCrest')||has('blackCrest')){
    const color=has('redCrest')?p.red:p.black;
    const crest=grot?[[0,.142,0],[.016,.265,-.033],[.052,.38,-.075],[.148,.238,-.12]]:[[0,.14,-.018],[-.012,.245,-.03],[.06,.28,-.095],[.094,.18,-.16]];
    for(let i=0;i<3;i++)head.link(color,crest[i],crest[i+1],i===0?.026:.050,i===2?.021:.038,8);
  }
}

function accessories(s,shoulder,origins,hip,hands,has,u){
  const local=(v,x,y,z)=>offset(v,x*u,y*u,z*u);
  if(['ironPad','steelPad','checkPad','glyphPad','topPlate'].some(has)){
    const side=has('aerials')?-1:1;
    const at=local(origins[side>0?1:0],side*.015,.043,-.015);
    const pad=s.child(at,[.12,-side*.18,side*.13],[u,u,u]);
    pad.plate(p.iron,[[-.116,-.088],[-.139,.027],[-.078,.126],[.10,.10],[.151,.02],[.09,-.11]],.17);
    if(has('checkPad'))for(let row=0;row<2;row++)for(let col=0;col<3;col++)if((row+col)%2===0)
      pad.box(p.cream,[(col-1)*.062,row*.056+.001,.091],[.060,.053,.009]);
    if(has('glyphPad')||has('steelPad'))pad.plate(has('glyphPad')?p.cream:p.steel,[[-.05,.045],[0,.017],[.055,.048],[.031,-.037],[-.031,-.034]],.013,[0,.003,.088]);
  }
  if(has('aerials')||has('ironBanner')||has('redTrophy')||has('redSkull')){
    const start=local(shoulder,-.09,.014,-.10);
    if(has('aerials')){
      for(let n=0;n<2;n++){
        const tip=local(start,-.19+n*.15,.23+n*.16,-.082);
        s.link(p.iron,start,tip,.018*u,.019*u,8);s.oval(p.rust,tip,[.036*u,.035*u,.04*u]);
      }
    }else{
      const top=local(shoulder,-.032,.58,-.14);
      s.link(p.iron,start,top,.021*u,.018*u,8);
      if(has('ironBanner'))s.plate(p.rust,[[-.13,-.083],[-.15,.13],[-.08,.048],[-.025,.147],[.013,.052],[.085,.101],[.151,.145],[.12,-.081]],.032,top);
      else{
        s.oval(p.red,top,[.091*u,.089*u,.082*u]);s.oval(p.bone,local(top,0,-.11,.017),[.062*u,.074*u,.060*u]);
        const trophy=local(shoulder,-.235,.29,-.12);
        s.link(p.iron,start,trophy,.018*u,.014*u,8);s.oval(p.red,trophy,[.057*u,.058*u,.062*u]);
      }
    }
  }
  if(has('redSquig')){
    const at=local(hip,-.245,-.06,-.035);
    s.link(p.leather,hip,at,.018*u,.014*u,7);s.oval(p.red,at,[.114*u,.08*u,.072*u]);
    s.oval(p.orange,local(at,-.077,-.004,.027),[.074*u,.054*u,.066*u]);
    s.oval(p.black,local(at,-.141,.008,.045),[.02*u,.017*u,.013*u]);
    s.link(p.cream,local(at,-.087,-.033,.071),local(at,-.08,.002,.083),.012*u,.002,6);
    s.link(p.red,local(at,.070,.005,0),local(at,.147,.090,-.057),.033*u,.006*u,7);
  }
  if(has('ammo')||has('leatherStrap')){
    const a=local(shoulder,.112,.012,.090),b=local(hip,-.138,.027,.132);
    s.link(p.leather,a,b,.032*u,.043*u,8);
    if(has('ammo'))for(let i=0;i<6;i++){
      const x=mix(a,b,(i+.5)/6);s.link(p.brass,local(x,-.028,-.013,.024),local(x,.023,.014,.024),.014*u,.014*u,6);
    }
  }
  if(has('ammoLoop')){
    const middle=mix(hands[0],hands[1],.50);
    const a=local(middle,-.045,-.007,.026),b=local(middle,.017,-.291,.039);
    s.link(p.leather,a,b,.036*u,.043*u,8);
    for(let i=0;i<7;i++)s.box(p.brass,mix(a,b,(i+.3)/7),[.092*u,.022*u,.038*u],[0,.08,-.12]);
  }
  if(has('shellBelt'))for(let i=0;i<4;i++)s.cylinder(p.rust,local(hip,.104+i*.030,-.011,.090),.016*u,.018*u,.088*u,7);
  if(has('tuskBelt'))for(let i=0;i<4;i++)s.link(p.bone,local(hip,-.11+i*.066,-.022,.12),local(hip,-.11+i*.066,-.144,.127),.03*u,.004,7);
}

function groundSkull(s,foot,side,u){
  const prop=s.child(offset(foot,side*.105*u,-foot[1]+.042*u,.13*u),[.18,side*.41,side*.34],[u,u,u]);
  prop.oval(p.bone,[0,.019,0],[.055,.044,.051]);prop.oval(p.bone,[0,-.003,.034],[.047,.026,.031]);
  for(const sign of [-1,1])prop.oval(p.leather,[sign*.020,.015,.047],[.015,.013,.009]);
}

export function sculptOrkPose(parent,kind,variant,face){
  const s=new Sculpt(parent.T,parent.group,true);
  if(kind==='boy'&&variant===19)return shoulderShootaBoy(s);
  if(kind==='gretchin'&&variant===4)return raisedCleaverGretchin(s);
  const pose=orkPose(kind,variant);
  if(!pose) throw new RangeError('Missing '+kind+' pose '+variant);
  const grot=kind==='gretchin',nob=!grot&&variant%10===0;
  const flags=new Set(pose.features.split(' ')),has=key=>flags.has(key);
  const u=grot?.63:nob?1.19:1;
  const pixel=(grot?25:nob?40:32)/25.4/pose.baseWidth;
  const ground=(pose.feet[0][1]+pose.feet[1][1])*.5;
  // Invert the low studio camera elevation for front landmarks. The visible
  // difference in height between feet belongs to their depth on the base.
  const pitch=10*Math.PI/180;
  const point=(xy,z)=>[(xy[0]-pose.baseX)*pixel,((ground-xy[1])*pixel+z*u*Math.sin(pitch))/Math.cos(pitch),z*u];
  const at=(v,x,y,z)=>offset(v,x*u,y*u,z*u);
  const head=point(pose.head,.081), hip=point(pose.belt,-.012);
  const joint=(idx,z)=>point(pose.joints.slice(idx,idx+2),z);
  const origins=[joint(0,-.046),joint(2,-.052)];
  const shoulder=mix(...origins,.5);
  const colors=[p.green,0x73883b,0x829741,0x657f36],skin=colors[variant%4];
  const trousers=has('brown')?0x6d4833:0x48464a;
  const feet=pose.feet.map(([x,y])=>[(x-pose.baseX)*pixel,.034*u,(y-ground)*pixel*1.75]);
  for(let i=0;i<2;i++){
    const sign=i===0?-1:1,foot=feet[i];
    const thigh=at(hip,sign*.102,-.040,0);
    const knee=joint(8+i*2,.080+foot[2]/u*.43);
    s.link(trousers,thigh,knee,.103*u,.083*u);
    s.oval(trousers,mix(thigh,knee,.46),[.109*u,.125*u,.102*u],[.05,0,-sign*.24]);
    s.link(trousers,knee,at(foot,0,.037,-.007),.083*u,.065*u);
    s.link(has('brown')?0x76553b:0x515054,mix(knee,foot,.25),mix(knee,foot,.38),.080*u,.086*u);
    if(has('kneePlate')||has('blackKnees')||has('shinPlate'))s.oval(p.iron,at(knee,0,-.035,.054),[.071*u,.09*u,.039*u]);
    if(has('bareFeet')){
      s.oval(skin,at(foot,0,.024,.018),[.080*u,.060*u,.122*u]);
      for(let toe=0;toe<3;toe++)s.oval(skin,at(foot,(toe-1)*.048,.008,.114),[.029*u,.030*u,.061*u]);
    }else{
      s.oval(p.leather,at(foot,0,.023,.012),[.095*u,.066*u,.134*u]);
      s.box(p.black,at(foot,0,-.012,.021),[.163*u,.040*u,.207*u],[0,sign*.13,0]);
      s.cylinder(p.black,at(foot,0,.074,-.019),.070*u,.082*u,.08*u,9);
    }
  }
  s.oval(trousers,hip,[.183*u,.106*u,.130*u]);
  const rib=mix(hip,shoulder,.62), chestColor=has('paleVest')?0x9b8a74:has('blackVest')?p.black:has('leatherStrap')?p.leather:0x423b34;
  const ribs=Math.max(grot?.105:.14,Math.min((grot?.220:.255)*u,norm(delta(origins[0],origins[1]))*.49));
  s.oval(chestColor,rib,[ribs,(norm(delta(shoulder,hip))*.62)+.010*u,.154*u],[.08,0,-Math.atan2(shoulder[0]-hip[0],shoulder[1]-hip[1])]);
  s.link(chestColor,origins[0],origins[1],.115*u,.122*u);
  for(let i=0;i<2;i++){
    const sign=2*i-1;
    const a=at(origins[i],-sign*.026,.025,.065),b=at(hip,sign*.103,.044,.102);
    s.link(p.leather,a,b,.025*u,.031*u,8);
    s.box(p.steel,mix(a,b,.63),[.055*u,.025*u,.027*u],[0,0,-sign*.22]);
    s.box(p.leather,at(hip,sign*.121,-.024,.075),[.085*u,.097*u,.060*u],[0,sign*.24,-sign*.10]);
    s.box(p.brass,at(hip,sign*.121,-.013,.111),[.027*u,.023*u,.012*u]);
  }
  s.box(p.leather,at(hip,0,.035,.098),[.28*u,.062*u,.056*u]);
  s.box(has('redBuckle')?p.red:p.brass,at(hip,0,.033,.129),[.079*u,.061*u,.019*u]);
  const hsize=(grot?.83:nob?1.22:1.01);
  const faceGroup=s.child(head,[.04,(pose.head[0]-pose.belt[0])*-.014,0],[hsize,hsize,hsize]);
  face(faceGroup,grot,variant,true);
  headwear(faceGroup,has,grot);
  if(grot){
    faceGroup.link(skin,[0,.034,.103],[.018,-.047,.245],.066,.015,9);
    for(const sign of [-1,1])faceGroup.oval(p.olive,[sign*.113,.010,.100],[.032,.040,.030]);
  }
  for(const sign of [-1,1]){
    faceGroup.oval(0x899447,[sign*.088,.063,.130],[.038,.015,.019],[0,sign*.14,sign*.21]);
    faceGroup.oval(p.olive,[sign*.032,.002,.195],[.009,.007,.006]);
    faceGroup.link(p.cream,[sign*.060,-.073,.198],[sign*.053,-.054,.202],.011,.002,6);
  }
  if(has('openMouth')){
    faceGroup.oval(0x3e2823,[0,-.060,.188],[.080,.037,.019]);
    for(const sign of [-1,1])faceGroup.link(p.bone,[sign*.055,-.039,.204],[sign*.05,-.067,.207],.012,.001,6);
  }
  const hands=pose.hands.map((xy,i)=>point(xy,pose.tools[i]==='support'?.27:.225));
  for(let i=0;i<2;i++){
    const sign=i===0?-1:1,hand=hands[i],origin=origins[i];
    const elbow=joint(4+i*2,.036);
    s.oval(skin,origin,[.119*u,.125*u,.123*u]);
    s.link(skin,origin,elbow,.103*u,.080*u);s.oval(skin,elbow,[.085*u,.083*u,.091*u]);
    s.link(skin,elbow,hand,.078*u,.061*u);
    const bicep=mix(origin,elbow,.48),arm=delta(elbow,origin);
    s.oval(skin,at(bicep,0,0,.034),[.092*u,Math.max(.09*u,norm(arm)*.47),.070*u],[0,0,-Math.atan2(arm[0],arm[1])]);
    s.oval(skin,hand,[.069*u,.066*u,.069*u]);
    for(let n=0;n<3;n++)s.oval(skin,at(hand,sign*.039,-.030+n*.026,.034),[.037*u,.016*u,.032*u]);
    if(has('bandage')||has('wristWrap')||has('bracers')||has('redWrap')){
      const cuff=has('bandage')||has('wristWrap')?p.cream:has('redWrap')?p.red:p.leather;
      s.link(cuff,mix(elbow,hand,.56),mix(elbow,hand,.86),.076*u,.070*u,9);
    }
    const type=pose.tools[i],projected=Math.hypot((pose.targets[i][0]-pose.hands[i][0])*pixel,(pose.targets[i][1]-pose.hands[i][1])*pixel);
    const frontFacing=['slugga','blasta','rokkit','kustom','grotPistol'].includes(type)&&projected<.30*u;
    const target=point(pose.targets[i],frontFacing?.55:type==='shoulderGun'?.16:.30);
    handTool(s,hand,target,type,u);
  }
  if(has('rockStep'))s.plate(p.stone,[[-.104,0],[-.082,.033],[.047,.063],[.095,.030],[.110,0]],.131,[feet[0][0]+.026,0,feet[0][2]+.043],[0,.2,0]);
  if(pose.tools.includes('skullGun')){
    const rear=at(origins[0],-.015,-.026,-.103),tip=at(origins[0],-.182,.175,-.135);
    s.link(p.leather,rear,tip,.032*u,.037*u,8);
    s.link(p.iron,at(tip,-.06,-.056,0),at(tip,.039,.029,0),.028*u,.030*u,8);
  }
  if((kind==='boy'&&[0,9,19].includes(variant))||(grot&&[1,8,9].includes(variant)))groundSkull(s,feet[variant%2],variant%2?-1:1,u);
  accessories(s,shoulder,origins,hip,hands,has,u);
}
