// An original studio photo, when present, identifies the optional local art pack.
// The public checkout uses procedural scenery and figures without external services.
export async function findLocalArt(){
  if(!document.querySelector('meta[name="local-studio-photos"]')&&new URLSearchParams(location.search).get('studio')!=='1')return null;
  const image=new Image();
  image.src='./reference/starter-set.jpg';
  try{await image.decode();return image}catch{return null}
}

export async function fieldTexture(T,reverse=false){
  // Painting the field takes longer than a frame. Keep pointer input and the
  // loading indicator responsive, including on the first flip during a game.
  const worker=new Worker(new URL('./data/field-worker.mjs',import.meta.url),{type:'module'});
  let field;
  try{
    field=await new Promise((resolve,reject)=>{
      worker.onmessage=event=>resolve(event.data);
      worker.onerror=event=>reject(new Error(event.message||'전장 도안을 그릴 수 없습니다.'));
      worker.onmessageerror=()=>reject(new Error('전장 도안을 읽을 수 없습니다.'));
      worker.postMessage(reverse);
    });
  }finally{worker.terminate()}
  const {width,height,pixels}=field;
  const surface=document.createElement('canvas');surface.width=width;surface.height=height;
  surface.getContext('2d').putImageData(new ImageData(pixels,width,height),0,0);
  const texture=new T.CanvasTexture(surface);texture.colorSpace=T.SRGBColorSpace;return texture;
}
