import {studioGroupFor,studioFrame} from './assets/turntable.mjs';
import {reliquaryCameras} from './assets/reliquary-camera.mjs';
import {isDisplayReliquary} from './data/reliquary-dimensions.mjs';

// Frame 01 is the studio's chosen three-quarter product view. These offsets
// describe its approximate camera bearing relative to each model's front.
// The two ground walls fix group 12's local axes across the three camera rings.
const firstBearing={1:10,2:0,3:0,4:10,5:30,6:5,7:0,8:0,9:0,10:0,11:30,12:124.4,13:0,14:20,15:15};
const rad=Math.PI/180;

export function studioViewFrame(group,relativeYaw,pitch){
  const row=pitch<20*rad?0:pitch<40*rad?1:2;
  const col=Math.round((relativeYaw-(firstBearing[group]||0)*rad)/(30*rad));
  return studioFrame(group,row,col);
}

export function studioScene(T,scene,pieces,ready){
  const sheets=new Map(),figures=new Map();
  for(const p of pieces){
    const group=studioGroupFor(p);if(!group)continue;
    const mat=new T.SpriteMaterial({transparent:true,depthWrite:false,depthTest:false,toneMapped:false});
    const sprite=new T.Sprite(mat);sprite.userData.pieceId=p.id;sprite.visible=false;scene.add(sprite);
    figures.set(p.id,{sprite,group,texture:null,url:null});
  }
  function request(url){
    if(sheets.has(url))return sheets.get(url);
    const sheet={};sheets.set(url,sheet);
    const image=new Image();image.decoding='async';image.onload=()=>{
      // Use half-size sheets on the table. The individual model inspector keeps
      // the larger studio originals. All instances share the GPU image.
      const canvas=document.createElement('canvas');canvas.width=Math.min(image.width,1024);canvas.height=Math.round(image.height*canvas.width/image.width);
      const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);
      sheet.texture=new T.CanvasTexture(canvas);sheet.texture.colorSpace=T.SRGBColorSpace;
      const mask=document.createElement('canvas');mask.width=256;mask.height=192;
      const probe=mask.getContext('2d');probe.drawImage(canvas,0,0,256,192);
      sheet.mask=probe.getImageData(0,0,256,192).data;ready();
    };image.src=url;return sheet;
  }
  function update(p,cameraYaw,pitch,distance,enabled){
    const item=figures.get(p.id);if(!item)return false;
    const {sprite,group}=item;sprite.visible=false;
    if(!enabled||p.removed||pitch>65*rad)return false;
    const f=studioViewFrame(group,cameraYaw-p.yaw,pitch);if(!f||!(f.widthInches>0))return false;
    const sheet=request(String(f.url));if(!sheet.texture)return false;
    if(item.url!==f.url){item.texture?.dispose();item.texture=sheet.texture.clone();item.texture.needsUpdate=true;item.url=f.url;sprite.material.map=item.texture;sprite.material.needsUpdate=true}
    item.texture.repeat.set(1/f.columns,1/f.rows);item.texture.offset.set(f.col/f.columns,1-(f.row+1)/f.rows);
    const registration=isDisplayReliquary(p)?reliquaryCameras[f.elevationIndex*12+f.azimuthIndex]:null;
    const [u,v,width]=registration??[...f.anchor,f.widthInches];
    sprite.position.set(p.x,p.elevation||0,p.z);sprite.center.set(u,1-v);
    sprite.scale.set(width,width,1);sprite.renderOrder=200-distance;sprite.visible=true;
    sprite.userData.opaque=uv=>{
      const x=Math.min(255,Math.max(0,Math.floor((f.col+uv.x)*256/f.columns)));
      const y=Math.min(191,Math.max(0,Math.floor((f.row+1-uv.y)*192/f.rows)));
      return sheet.mask[(y*256+x)*4+3]>44;
    };
    return true;
  }
  return {update,objects:[...figures.values()].map(i=>i.sprite)};
}
