// Pixel landmarks transcribed on a 195 × 197 front-view study for each model.
// The physical base diameter supplies the scale. Viewer-left corresponds to
// the figure's right. Each hand target marks the visible tip of its prop.
// Depth, shoulder occlusion and the backs of the poses are inferred.
function pose(portrait,baseWidth,baseX,head,belt,feet,hands,tools,targets,features){
  return {portrait,baseWidth,baseX,head,belt,feet,hands,tools,targets,features};
}
// Source coordinates in each local frame. Their independent scales retain
// differences in photographic magnification, including the 40 mm Boss Nobs.
const boy=[
  pose(11,114,101,[105,74],[100,116],[[67,159],[132,158]],[[57,79],[156,104]],['rokkit','saw'],[[16,36],[181,43]],'brown redTrophy redSkull blackKnees steelPad'),
  pose(17,119,97,[81,78],[92,115],[[71,159],[131,157]],[[62,119],[119,32]],['shoota','axe'],[[88,161],[56,22]],'brown cap bandage ironPad'),
  pose(18,128,106,[85,65],[101,110],[[73,156],[148,143]],[[44,78],[146,59]],['slugga','hammer'],[[28,86],[98,20]],'brown ammo redSquig steelPad'),
  pose(13,161,96,[97,53],[93,106],[[55,153],[136,149]],[[65,97],[127,85]],['support','bayonet'],[[65,97],[28,149]],'charcoal cap topPlate ammoLoop wraps'),
  pose(16,112,92,[80,95],[90,124],[[66,165],[127,162]],[[37,72],[113,84]],['knife','shoulderGun'],[[69,11],[169,96]],'charcoal redBuckle openMouth stockFin'),
  pose(12,119,112,[108,88],[113,122],[[87,166],[139,163]],[[54,103],[173,101]],['slugga','cleaver'],[[10,118],[144,152]],'brown cap steelPad shellBelt'),
  pose(20,130,69,[71,83],[71,117],[[35,157],[111,154]],[[48,115],[133,101]],['bayonet','grenade'],[[119,155],[181,86]],'brown aerials bracers leatherStrap'),
  pose(8,148,97,[86,62],[94,109],[[55,157],[130,148]],[[66,102],[114,111]],['vented','support'],[[160,100],[114,111]],'charcoal jawHelm steelPad ammoLoop bareFeet bandage'),
  pose(15,126,81,[73,77],[87,107],[[71,149],[122,148]],[[50,114],[149,53]],['shoota','grenade'],[[77,151],[165,21]],'charcoal checkPad openMouth bandage'),
  pose(19,124,93,[88,73],[91,119],[[63,155],[121,154]],[[63,132],[137,58]],['axe','skullGun'],[[130,141],[163,58]],'brown blackCrest ammo ironPad bracers'),
  pose(1,105,94,[102,84],[94,121],[[69,163],[108,167]],[[62,89],[142,104]],['kustom','saw'],[[27,80],[161,50]],'charcoal ironBanner kneePlate tuskBelt'),
  pose(2,152,98,[94,51],[93,103],[[61,149],[134,152]],[[62,96],[127,88]],['support','bayonet'],[[62,96],[23,144]],'charcoal jawHelm topPlate ammoLoop kneePlate'),
  pose(5,143,76,[68,49],[76,106],[[41,154],[116,151]],[[31,105],[154,54]],['shoota','grenade'],[[39,146],[179,20]],'charcoal glyphPad bandage paleVest'),
  pose(7,124,110,[114,81],[113,114],[[78,166],[139,163]],[[55,107],[174,107]],['slugga','cleaver'],[[10,125],[144,150]],'brown blackCrest ironPad shellBelt'),
  pose(9,132,105,[88,72],[107,111],[[70,158],[147,150]],[[45,68],[151,72]],['slugga','hammer'],[[24,67],[106,18]],'brown cap redWrap ammo'),
  pose(3,143,96,[88,70],[93,113],[[60,155],[135,156]],[[67,107],[117,109]],['vented','support'],[[151,122],[117,109]],'brown cap aerials ammoLoop'),
  pose(14,137,72,[55,64],[69,105],[[48,158],[105,153]],[[36,105],[136,74]],['bayonet','grenade'],[[126,132],[179,53]],'charcoal mask topPlate shinPlate'),
  pose(6,128,94,[84,75],[88,119],[[57,159],[123,155]],[[59,133],[141,54]],['axe','skullGun'],[[133,137],[161,55]],'brown bareFeet ironPad bracers'),
  pose(4,119,96,[92,69],[97,111],[[78,162],[139,153]],[[76,116],[127,31]],['shoota','axe'],[[110,151],[67,26]],'brown glyphPad paleVest bandage'),
  pose(10,110,99,[85,87],[96,126],[[73,164],[138,158]],[[38,74],[118,82]],['knife','shoulderGun'],[[67,11],[168,89]],'brown redBuckle redSquig openMouth stockFin'),
];
const gretchin=[
  pose(7,154,97,[83,64],[91,110],[[60,146],[134,145]],[[74,112],[123,108]],['carbine','support'],[[161,114],[123,108]],'charcoal redCrest boots bladeBelt'),
  pose(8,184,97,[87,39],[108,93],[[79,126],[138,151]],[[87,68],[114,76]],['blasta','support'],[[129,78],[114,76]],'brown bareFeet wristWrap longNose'),
  pose(6,165,96,[112,68],[91,108],[[59,142],[127,142]],[[88,117],[126,125]],['cannon','support'],[[166,136],[126,125]],'brown darkSpike bareFeet leatherStrap openMouth'),
  pose(9,141,96,[92,82],[94,113],[[71,149],[116,142]],[[67,120],[149,44]],['grotPistol','grenade'],[[46,135],[128,20]],'brown copperSpike bareFeet blackVest'),
  pose(4,132,90,[102,79],[93,115],[[66,153],[115,149]],[[73,86],[148,35]],['carbine','knife'],[[62,50],[100,15]],'brown boots blackVest rockStep openMouth'),
  pose(10,150,97,[84,74],[91,115],[[65,143],[137,149]],[[79,115],[122,122]],['cannon','support'],[[161,111],[122,122]],'charcoal copperSpike boots redWrap openMouth'),
  pose(1,142,97,[82,78],[92,117],[[66,153],[122,148]],[[55,118],[119,31]],['grotPistol','knife'],[[28,132],[49,23]],'brown bareFeet leatherStrap openMouth'),
  pose(5,172,94,[110,63],[90,101],[[60,137],[129,143]],[[76,112],[134,125]],['carbine','support'],[[180,145],[134,125]],'brown blackCrest bareFeet bladeBelt'),
  pose(3,153,97,[87,73],[95,103],[[67,148],[135,155]],[[100,88],[124,73]],['blasta','support'],[[156,65],[124,73]],'brown darkSpike bareFeet wristWrap'),
  pose(2,147,82,[89,68],[85,108],[[48,146],[117,150]],[[39,65],[168,66]],['carbine','grenade'],[[20,19],[136,22]],'charcoal darkSpike boots paleVest'),
];

// Explicit shoulder centres, elbows and knees on each side of the visible face.
// Right and left are anatomical, including across-chest support-hand poses.
const boyJoints=[
  [79,67,126,72,65,81,138,96,77,130,119,133],
  [66,74,108,62,51,97,126,58,82,132,125,129],
  [68,64,113,53,54,77,130,65,77,129,133,117],
  [66,41,131,36,56,84,149,62,66,121,128,117],
  [66,85,99,81,51,91,107,91,69,143,118,142],
  [88,79,137,76,70,91,157,87,93,144,135,138],
  [48,78,91,72,29,98,106,82,41,139,100,130],
  [60,65,116,56,38,91,135,81,66,127,121,125],
  [51,75,94,57,38,93,127,56,68,131,117,125],
  [67,82,108,63,60,115,126,65,65,141,108,126],
  [70,79,119,83,61,93,130,107,77,137,103,135],
  [60,44,124,42,50,78,146,62,69,118,128,116],
  [43,44,100,37,23,70,128,54,52,124,104,124],
  [91,77,138,75,70,94,158,88,88,145,133,138],
  [68,64,112,55,57,73,135,70,75,133,133,131],
  [58,72,119,63,43,91,131,88,66,130,126,128],
  [32,70,83,53,14,85,108,65,53,132,103,124],
  [67,76,102,61,54,110,127,65,69,142,109,130],
  [69,69,107,58,61,94,135,58,84,132,130,128],
  [68,81,103,78,53,86,111,88,78,144,127,139],
];
const grotJoints=[
  [58,66,104,70,43,88,115,92,72,126,116,126],
  [62,49,104,41,47,55,120,59,86,101,125,118],
  [86,61,118,77,60,81,132,110,72,118,119,122],
  [88,91,106,66,78,109,121,57,77,132,109,127],
  [88,83,114,70,84,106,133,54,78,134,105,130],
  [61,73,102,71,52,93,116,92,72,121,120,123],
  [70,80,97,67,65,99,113,53,71,129,108,128],
  [84,61,119,69,53,81,129,102,66,120,117,119],
  [75,72,99,66,77,88,119,83,69,125,119,125],
  [64,68,110,69,52,80,139,73,63,129,112,127],
];

export function orkPose(kind,variant){
  const profile=(kind==='boy'?boy:kind==='gretchin'?gretchin:[])[variant];
  if(!profile)return null;
  return {...profile,joints:(kind==='boy'?boyJoints:grotJoints)[variant]};
}
