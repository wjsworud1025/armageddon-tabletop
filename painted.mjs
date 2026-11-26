let mapped;
export async function loadPortraitMap(){
  if(!mapped){
    const res=await fetch('./data/portrait-map.json');if(!res.ok)throw Error('기물 촬영 대응표를 열 수 없습니다.');
    mapped=(await res.json()).portraits;
  }
}
export const portraitId=id=>mapped?.[id]??id;
export const portraitUrl=id=>'./reference/painted/'+portraitId(id)+'.webp';
export function matchesPortraitPose(piece,initialYaw){
  // The single reliquary portrait shows the red door. Retain it for the old
  // display pose. The corrected opening view faces the landing and saints.
  let bearing=initialYaw;
  if(piece.id==='largeRuin-2')bearing=76*Math.PI/180;
  if(piece.id==='smallRuin-4')bearing=piece.previousPipeRuin?163*Math.PI/180:null;
  return bearing!=null&&Math.abs(Math.sin((piece.yaw-bearing)/2))<.001;
}
export async function paintedFigures(T,pieces){
  const response=await fetch('./reference/painted/frames.json');
  if(!response.ok)throw Error('도색 기물 배율표를 불러올 수 없습니다.');
  const frames=await response.json(),loader=new T.TextureLoader(),objects=new Map();
  await Promise.all(pieces.map(async p=>{
    const box=frames[portraitId(p.id)],texture=await loader.loadAsync(portraitUrl(p.id));
    texture.colorSpace=T.SRGBColorSpace;
    const mat=new T.SpriteMaterial({map:texture,transparent:true,depthWrite:false,depthTest:false,toneMapped:false});
    const sprite=new T.Sprite(mat);sprite.scale.set(box.w,box.h,1);sprite.center.set(box.ax,box.ay);
    sprite.userData.pieceId=p.id;
    // Ignore white studio cut-outs when picking a banner, an arch, or the gap
    // between two legs. Keep the full photograph for rendering.
    const mask=document.createElement('canvas');mask.width=texture.image.width;mask.height=texture.image.height;
    const ctx=mask.getContext('2d');ctx.drawImage(texture.image,0,0);
    const alpha=ctx.getImageData(0,0,mask.width,mask.height).data;
    sprite.userData.opaque=uv=>{
      const x=Math.min(mask.width-1,Math.max(0,Math.floor(uv.x*mask.width)));
      const y=Math.min(mask.height-1,Math.max(0,Math.floor((1-uv.y)*mask.height)));
      return alpha[(y*mask.width+x)*4+3]>48;
    };
    objects.set(p.id,sprite);
  }));
  return objects;
}
