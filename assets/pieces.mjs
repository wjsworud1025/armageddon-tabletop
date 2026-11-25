import {castPiece, plinth} from './sculpt.mjs';
import {marine, speeder} from './marines.mjs';
import {greenskin, wartrakk} from './orks.mjs';
import {scenery} from './terrain.mjs';

const marines=new Set(['captain','librarian','intercessor','vanguard']);
const orks=new Set(['warboss','weirdboy','boy','gretchin']);
const terrain=new Set(['largeRuin','smallRuin','shockArray','capacitorStack','barricade','generatorShrine','pylon']);

/** Model faces +Z, Y up, origin at ground in inches. */
export function createPiece(THREE,item) {
  return castPiece(THREE,item,s=>{
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
    if(marines.has(item.kind)) marine(body,item.kind,variant);
    else if(orks.has(item.kind)) greenskin(body,item.kind,variant);
    else if(item.kind==='landSpeeder') speeder(body);
    else if(item.kind==='wartrakk') wartrakk(body);
    else throw new Error('Unknown starter set piece '+item.kind);
  });
}
