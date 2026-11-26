// The Manufactorum mezzanine is 3 inches above ground. The original cast
// was registered with a 2.30-inch floor, 5.20-inch width and 4.22-inch depth.
export const reliquaryScale=3/2.30;
export const mapReliquarySize={baseWidth:5.2,baseDepth:4.22};
export const reliquarySize={baseWidth:5.2*reliquaryScale,baseDepth:4.22*reliquaryScale};

// The printed patrol diagrams label their ruin CD. It has a short D wall
// and floor 6; the studio display has a longer B wall and floor 3.
export const patrolCDVersion=9;
export const patrolCDSize={baseWidth:6.61,baseDepth:3.30};

export function isDisplayReliquary(piece){
  return piece?.id==='largeRuin-2'&&!piece.patrolCD&&piece.baseWidth===reliquarySize.baseWidth;
}
