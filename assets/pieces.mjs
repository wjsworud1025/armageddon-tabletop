import {castPiece, castGeometry, plinth} from './sculpt.mjs';
import {marine, speeder} from './marines.mjs';
import {greenskin, wartrakk} from './orks.mjs';
import {scenery,legacySecondRuin,legacySmallRuin,legacyPipeRuin,legacyBarricade} from './terrain.mjs';

const marines=new Set(['captain','librarian','intercessor','vanguard']);
const orks=new Set(['warboss','weirdboy','boy','gretchin']);
const terrain=new Set(['largeRuin','smallRuin','shockArray','capacitorStack','barricade','generatorShrine','pylon']);

/** Model faces +Z, Y up, origin at ground in inches. */
export function createPiece(THREE,item) {
  return buildPiece(THREE,item,castPiece);
}

// Scene construction prepares these immutable casts. Rules queries reuse
// them directly: creating a Three Group or Mesh also allocates a random UUID.
export function pieceGeometry(THREE,item) {
  return buildPiece(THREE,item,castGeometry);
}

function buildPiece(THREE,item,cast) {
  if(item.previousBarricade&&item.kind==='barricade'){
    const previous={...item,kind:'previous-barricade',baseWidth:3.8,baseDepth:.65};
    return cast(THREE,previous,s=>legacyBarricade(s,previous));
  }
  if(item.previousPipeRuin&&item.kind==='smallRuin'&&item.variant===3){
    const previous={...item,kind:'previous-pipe-ruin',baseWidth:2.5,baseDepth:1.4};
    return cast(THREE,previous,s=>legacyPipeRuin(s,previous));
  }
  if(item.previousSmallRuin&&item.kind==='smallRuin'&&item.variant===0){
    const previous={...item,kind:'previous-small-ruin',baseWidth:2.5,baseDepth:1.4};
    return cast(THREE,previous,s=>legacySmallRuin(s,previous));
  }
  if(item.previousSecondRuin&&item.kind==='largeRuin'&&item.variant===1){
    const previous={...item,kind:'previous-second-ruin',baseWidth:5.2,baseDepth:4.10};
    return cast(THREE,previous,s=>legacySecondRuin(s,previous));
  }
  return cast(THREE,item,s=>{
    if(terrain.has(item.kind)) {
      scenery(s,item);
      return;
    }
    const variant=item.variant??0;
    const vehicle=item.kind==='landSpeeder'||item.kind==='wartrakk';
    const width=item.baseWidth || (vehicle?70:32)/25.4;
    const depth=item.baseDepth || (vehicle?105:32)/25.4;
    plinth(s,width,depth,variant+item.kind.charCodeAt(0));
    const body=s.child([0,.14,0]);
    if(vehicle)body.group.userData.vehicleBody=true;
    if(marines.has(item.kind)) marine(body,item.kind,variant);
    else if(orks.has(item.kind)) greenskin(body,item.kind,variant);
    else if(item.kind==='landSpeeder') speeder(body);
    else if(item.kind==='wartrakk') wartrakk(body);
    else throw new Error('Unknown starter set piece '+item.kind);
  });
}
