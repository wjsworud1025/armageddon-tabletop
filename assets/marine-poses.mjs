// Local 195 × 197 study coordinates, one separately scaled 32 mm base per
// image. The first point of a pair is the figure's anatomical right.
function pose(portrait,baseWidth,baseX,ground,head,belt,shoulders,elbows,hands,knees,feet,pack,tools,tips,features){
  return {portrait,baseWidth,baseX,ground,head,belt,shoulders,elbows,hands,knees,feet,pack,tools,tips,features};
}
const intercessors=[
  pose(1,97,117,168,[118,70],[117,108],[[99,82],[145,70]],[[91,91],[148,81]],[[76,101],[143,65]],[[102,134],[143,130]],[[86,169],[148,161]],[[107,54],[134,53]],['rifle','chainsword'],[[31,132],[93,10]],'bare squareWard paper rockLeft'),
  pose(2,123,101,164,[79,39],[82,96],[[53,61],[107,57]],[[48,83],[110,84]],[[66,87],[101,91]],[[69,123],[121,126]],[[61,162],[139,163]],[[73,19],[113,22]],['launcher','support'],[[108,102],[101,91]],'kneeSkull paper skullGround omega'),
  pose(4,120,97,166,[100,38],[95,99],[[71,53],[125,56]],[[67,75],[132,73]],[[83,72],[111,80]],[[77,124],[118,124]],[[66,157],[127,161]],[[88,19],[139,24]],['aimed','support'],[[124,81],[111,80]],'goldKnee optic rightScroll'),
  pose(5,123,98,164,[113,41],[100,98],[[80,56],[137,58]],[[71,73],[144,84]],[[83,89],[147,80]],[[73,120],[118,114]],[[55,162],[134,159]],[[80,22],[123,23]],['downRifle','magazine'],[[112,163],[157,56]],'sling chestWings rightScroll'),
  pose(3,124,109,163,[99,40],[100,94],[[74,55],[126,60]],[[71,63],[121,86]],[[59,59],[110,96]],[[81,118],[136,120]],[[70,158],[154,157]],[[102,18],[143,28]],['slingRifle','fist'],[[25,26],[110,96]],'sling omega kneeScroll skullGround'),
];
const veterans=[
  pose(1,69,95,180,[103,76],[98,101],[[84,87],[111,83]],[[77,88],[110,94]],[[90,80],[93,91]],[[79,124],[94,129]],[[76,147],[94,154]],[[86,62],[121,67]],['uprightBlade','support'],[[94,10],[93,91]],'bare pillar tabard kneeScroll'),
  pose(4,95,95,177,[94,40],[96,84],[[69,58],[124,50]],[[66,59],[138,65]],[[56,51],[145,83]],[[80,110],[109,115]],[[81,142],[120,149]],[[87,21],[124,25]],['pistol','shortBlade'],[[43,20],[113,99]],'rockLeft tabard kneeSkull omega'),
  pose(3,106,101,172,[104,60],[102,109],[[73,64],[127,74]],[[65,82],[130,87]],[[63,94],[98,88]],[[75,132],[113,132]],[[71,161],[112,161]],[[94,29],[125,35]],['pistol','diagonalBlade'],[[36,122],[43,36]],'waistChain kneeGlyph omega'),
  pose(5,82,85,178,[77,73],[84,104],[[57,85],[98,73]],[[54,96],[114,73]],[[47,99],[130,67]],[[79,128],[103,123]],[[81,152],[114,144]],[[53,55],[88,50]],['plasma','raisedBlade'],[[39,104],[159,10]],'pillar kneeScroll chestWings'),
  pose(2,98,71,177,[65,79],[66,121],[[42,93],[87,84]],[[41,116],[99,87]],[[55,131],[119,84]],[[47,146],[87,141]],[[48,174],[99,174]],[[41,66],[65,54]],['pistol','levelBlade'],[[78,143],[189,101]],'rivetedKnee skullGround laurels omega'),
];
const nozzles=[
  [[79,72],[130,80]],[[76,32],[141,49]],[[72,44],[150,54]],[[42,76],[99,58]],[[14,82],[70,65]],
];
// Registration against the official turntable's 90-degree camera. Values are
// Z in inches, from the base centre towards the reader in the front portrait.
const sideDepth={
  'intercessor-0':{head:.12,hip:-.01,shoulders:[-.045,.08],elbows:[.017,.34],hands:[.07,.49],
    knees:[.07,.11],feet:[-.08,.13],pack:[-.235,-.215],tips:[.16,-.015]},
  'vanguard-3':{head:.14,hip:.02,shoulders:[.24,-.03],elbows:[.53,-.08],hands:[.80,-.10],
    knees:[-.13,-.30],feet:[-.49,-.13],pack:[-.105,-.29],tips:[1.25,.14]},
};
export function marinePose(kind,variant){
  const pose=(kind==='intercessor'?intercessors:kind==='vanguard'?veterans:[])[variant];
  return pose?{...pose,sideDepth:sideDepth[kind+'-'+variant],nozzles:kind==='vanguard'?nozzles[variant]:null}:null;
}
