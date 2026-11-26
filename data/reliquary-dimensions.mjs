// The Manufactorum mezzanine is 3 inches above ground. The original cast
// was registered with a 2.30-inch floor, 5.20-inch width and 4.22-inch depth.
export const reliquaryScale=3/2.30;
export const mapReliquarySize={baseWidth:5.2,baseDepth:4.22};
export const reliquarySize={baseWidth:5.2*reliquaryScale,baseDepth:4.22*reliquaryScale};

export function isDisplayReliquary(piece){
  return piece?.id==='largeRuin-2'&&piece.baseWidth===reliquarySize.baseWidth;
}
