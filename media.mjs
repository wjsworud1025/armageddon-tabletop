// An original studio photo, when present, identifies the optional local art pack.
// The public checkout uses procedural scenery and figures without external services.
export async function findLocalArt(){
  if(!document.querySelector('meta[name="local-studio-photos"]')&&new URLSearchParams(location.search).get('studio')!=='1')return null;
  const image=new Image();
  image.src='./reference/starter-set.jpg';
  try{await image.decode();return image}catch{return null}
}

export function fieldTexture(T,reverse=false){
  const surface=document.createElement('canvas');surface.width=880;surface.height=600;
  const ctx=surface.getContext('2d'),img=ctx.createImageData(surface.width,surface.height);
  let seed=reverse?173:71;
  const base=reverse?[87,81,72]:[130,112,84];
  for(let y=0;y<surface.height;y++)for(let x=0;x<surface.width;x++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const grain=(seed/4294967296-.5)*19;
    const broad=4*Math.sin(x/27+y/58)+4*Math.cos(y/31-x/47);
    const seam=reverse&&(y%57<2||(x+(Math.floor(y/57)%2)*38)%76<2)?-17:0;
    const i=(y*surface.width+x)*4;
    for(let c=0;c<3;c++)img.data[i+c]=base[c]+grain+broad+seam;
    img.data[i+3]=255;
  }
  ctx.putImageData(img,0,0);
  const texture=new T.CanvasTexture(surface);texture.colorSpace=T.SRGBColorSpace;return texture;
}
