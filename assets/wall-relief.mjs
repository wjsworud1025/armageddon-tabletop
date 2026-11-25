let wallSurvey;
export async function loadWallSurvey(){
  ({wallSurvey}=await import('./wall-survey.mjs'));
}

const decoded=new Map();
const reliefs=new WeakMap();

function unpack(name,T) {
  if(decoded.has(name)) return decoded.get(name);
  const data=wallSurvey[name], byteString=atob(data.palette), palette=[[0,0,0]];
  const index=Uint8Array.from(atob(data.index),c=>c.charCodeAt(0));
  for(let i=0;i<byteString.length;i+=3) {
    const color=new T.Color((byteString.charCodeAt(i)<<16)|(byteString.charCodeAt(i+1)<<8)|byteString.charCodeAt(i+2));
    palette.push([color.r,color.g,color.b]);
  }
  const sample={...data,palette,index};
  decoded.set(name,sample);
  return sample;
}

function pixel(sheet,x,y) {
  return sheet.index[y*sheet.width+x];
}

// Reconstruct a continuous double-sided wall with thickness, jagged boundary,
// open windows and relief. The texture samples stay fixed when the player orbits.
export function relief(s,name,width,height,innerName,rotation,origin) {
  if(!wallSurvey){
    const wall=s.child(origin,rotation);
    wall.box(0x62594b,[width*.5,height*.14,0],[width,height*.28,.15]);
    for(const u of [.08,.5,.91]){
      const h=height*(u>.9?.67:1);
      wall.box(0x70665b,[width*u,h*.5,0],[width*.13,h,.17]);
    }
    wall.box(0x584e44,[width*.29,height*.85,0],[width*.54,height*.13,.2]);
    return;
  }
  const T=s.T;
  if(!reliefs.has(T)) reliefs.set(T,new Map());
  const cache=reliefs.get(T);
  const key=[name,width,height,innerName].join('/');
  if(!cache.has(key)) {
    const sheet=unpack(name,T), inside=innerName?unpack(innerName,T):null;
    const w=sheet.width,h=sheet.height;
    const xyz=[], rgb=[], indices=[];
    const corners=new Int32Array(w*h).fill(-1), cells=new Uint8Array((w-1)*(h-1));
    function vertex(x,y) {
      const idx=y*w+x;
      if(corners[idx]>=0) return corners[idx];
      const u=x/(w-1), v=1-y/(h-1);
      const pigment=sheet.palette[sheet.index[idx]];
      const luma=.25*pigment[0]+.65*pigment[1]+.10*pigment[2];
      let protrusion=.026+Math.min(.22,luma)*.26;
      if(name==='door' && (u<.10 || Math.abs(u-.37)<.06)) protrusion+=.066;
      if(name==='pipe' && Math.abs(u-.19)<.047 && v>.13 && v<.81) protrusion+=.064;
      const coord=[width*u,height*v];
      const front=xyz.length/3;
      xyz.push(...coord,-.056-protrusion,...coord,.058+protrusion*.45);
      let back=pigment, shade=.78;
      if(inside && v<.58) {
        const ix=Math.round(u*(inside.width-1)), iy=Math.round((1-v/.58)*(inside.height-1));
        const alternate=pixel(inside,ix,iy);
        if(alternate) {back=inside.palette[alternate];shade=1.04;}
      }
      rgb.push(...pigment,...back.map(b=>b*shade));
      corners[idx]=front;
      return front;
    }
    const solid=(x,y)=>x>=0&&x<w-1&&y>=0&&y<h-1&&cells[y*(w-1)+x];
    for(let y=0;y<h-1;y++) for(let x=0;x<w-1;x++) {
      if(pixel(sheet,x,y)&&pixel(sheet,x+1,y)&&pixel(sheet,x,y+1)&&pixel(sheet,x+1,y+1)) cells[y*(w-1)+x]=1;
    }
    for(let y=0;y<h-1;y++) for(let x=0;x<w-1;x++) {
      if(!solid(x,y)) continue;
      const a=vertex(x,y),b=vertex(x+1,y),c=vertex(x+1,y+1),d=vertex(x,y+1);
      indices.push(a,b,c,a,c,d,a+1,c+1,b+1,a+1,d+1,c+1);
      const cap=(i,j)=>indices.push(i,j+1,j,i,i+1,j+1);
      if(!solid(x,y-1)) cap(a,b);
      if(!solid(x+1,y)) cap(b,c);
      if(!solid(x,y+1)) cap(c,d);
      if(!solid(x-1,y)) cap(d,a);
    }
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(xyz,3));
    geo.setAttribute('color',new T.Float32BufferAttribute(rgb,3));
    geo.setIndex(indices);geo.computeVertexNormals();
    cache.set(key,geo);
  }
  s.part(cache.get(key),0xffffff,origin,[1,1,1],rotation);
}
