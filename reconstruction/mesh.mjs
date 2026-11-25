import {studioGroupFor,studioFrame} from '../assets/turntable.mjs';
import {accepted} from './registry.mjs';

const meshes=new Map(),sheets=new Map();
const firstBearing={1:10,2:0,3:0,4:10,5:30,6:5,7:0,8:0,9:0,10:0,11:30,12:35,13:0,14:20,15:15};

function meshGeometry(T,bytes) {
  const data=new DataView(bytes);
  if(data.getUint32(0,false)!==0x57484d32) throw Error('Invalid reconstruction mesh');
  const count=data.getUint32(4,true),indexCount=data.getUint32(8,true),wide=data.getUint32(12,true);
  const indexOffset=(16+count*9+3)&~3;
  if(indexOffset+indexCount*(wide?4:2)!==bytes.byteLength) throw Error('Incomplete reconstruction');
  const positions=Float32Array.from(new Int16Array(bytes,16,count*3),n=>n/12000);
  const colors=new Uint8Array(bytes,16+6*count,3*count);
  const indices=wide?new Uint32Array(bytes,indexOffset,indexCount):new Uint16Array(bytes,indexOffset,indexCount);
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.BufferAttribute(positions,3));
  geometry.setAttribute('color',new T.BufferAttribute(colors,3,true));
  geometry.setIndex(new T.BufferAttribute(indices,1));
  geometry.computeBoundingSphere();geometry.computeBoundingBox();
  return geometry;
}

async function resource(url) {
  const response=await fetch(url);
  if(!response.ok) throw Error('Missing reconstruction asset '+url);
  return response;
}

function atlas(T,group,level) {
  const url=studioFrame(group,level,0).url;
  if(!sheets.has(url)) sheets.set(url,(async()=>{
    const image=new Image();image.src=url;await image.decode();
    // Each GPU frame is 256x256. Full 512px source cells remain available in the studio viewer.
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=768;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;return texture;
  })());
  return sheets.get(url);
}

const vertexShader=`
  attribute vec3 color;
  varying vec3 point;
  varying vec3 pigment;
  void main() {
    point=position;
    pigment=mix(color/12.92,pow((color+0.055)/1.055,vec3(2.4)),step(vec3(0.04045),color));
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
  }`;
const fragmentShader=`
  uniform sampler2D lowAtlas;
  uniform sampler2D middleAtlas;
  uniform sampler2D highAtlas;
  uniform vec3 eye[3], rightAxis[3], downAxis[3], lens[3], tile[3];
  uniform float weight[3], distanceToLens[3], paint;
  varying vec3 point;
  varying vec3 pigment;
  void main() {
    vec3 colorSum=vec3(0.);
    float weightSum=0.;
    for(int i=0; i<3; i++) {
      float zoom=lens[i].z/(1.0-dot(point,eye[i])/distanceToLens[i]);
      vec2 p=lens[i].xy+zoom*vec2(dot(point,rightAxis[i]),dot(point,downAxis[i]));
      vec2 uv=vec2((tile[i].x+clamp(p.x,0.001,0.999))/4.,1.-(tile[i].y+clamp(p.y,0.001,0.999))/3.);
      vec4 sampleColor;
      if(tile[i].z<0.5) sampleColor=texture2D(lowAtlas,uv);
      else if(tile[i].z<1.5) sampleColor=texture2D(middleAtlas,uv);
      else sampleColor=texture2D(highAtlas,uv);
      float contribution=weight[i]*smoothstep(.07,.9,sampleColor.a);
      colorSum+=sampleColor.rgb*contribution;
      weightSum+=contribution;
    }
    vec3 paintColor=colorSum/max(.00001,weightSum);
    gl_FragColor=vec4(mix(pigment,paintColor,paint*smoothstep(0.,.35,weightSum)),1.);
    #include <colorspace_fragment>
  }`;

function buildMaterial(T,source,sheets) {
  const vectors=()=>({value:Array.from({length:3},()=>new T.Vector3())});
  const uniforms={lowAtlas:{value:sheets[0]},middleAtlas:{value:sheets[1]},highAtlas:{value:sheets[2]},
    eye:vectors(),rightAxis:vectors(),downAxis:vectors(),lens:vectors(),tile:vectors(),
    weight:{value:[1,0,0]},distanceToLens:{value:[15,15,15]},paint:{value:1}};
  return new T.ShaderMaterial({uniforms,vertexShader,fragmentShader,toneMapped:false});
}

function orientPhotos(T,mesh,source) {
  const look=new T.Vector3(),inv=new T.Matrix4();
  const views=source.cameras.map((c,i)=>({...c,i,direction:new T.Vector3(...c.eye),score:0}));
  const sorted=views.slice();
  mesh.onBeforeRender=(renderer,scene,camera)=>{
    inv.copy(mesh.matrixWorld).invert();
    if(camera.isOrthographicCamera) camera.getWorldDirection(look).negate().transformDirection(inv);
    else camera.getWorldPosition(look).applyMatrix4(inv).sub(mesh.geometry.boundingSphere.center).normalize();
    for(const view of sorted) view.score=look.dot(view.direction);
    sorted.sort((a,b)=>b.score-a.score);
    const u=mesh.material.uniforms;
    let sum=0;
    for(let n=0;n<3;n++){
      const c=sorted[n],angle=c.i%12,level=Math.floor(c.i/12);
      u.distanceToLens.value[n]=c.distance??source.distance;
      const w=1/Math.pow(Math.max(.0001,1-c.score),2);
      u.weight.value[n]=w;sum+=w;
      u.eye.value[n].copy(c.direction);u.rightAxis.value[n].fromArray(c.right);u.downAxis.value[n].fromArray(c.down);
      u.lens.value[n].set(c.cx,c.cy,c.scale);u.tile.value[n].set(angle%4,Math.floor(angle/4),level);
    }
    for(let n=0;n<3;n++)u.weight.value[n]/=sum;
    // Zenith and underside have no matching source photograph. Use the fused surface color there.
    u.paint.value=T.MathUtils.smoothstep(sorted[0].score,.65,.96);
    mesh.material.uniformsNeedUpdate=true;
  };
}

export async function loadReconstruction(T,piece) {
  const group=studioGroupFor(piece);
  if(!accepted.includes(group)) return null;
  if(!meshes.has(group)) meshes.set(group,(async()=>{
    const key=String(group).padStart(2,'0');
    const path=new URL('./models/'+key+'.whm',import.meta.url);
    const meta=new URL('./models/'+key+'.json',import.meta.url);
    const [bytes,source,textures]=await Promise.all([
      resource(path).then(r=>r.arrayBuffer()),resource(meta).then(r=>r.json()),
      Promise.all([0,1,2].map(level=>atlas(T,group,level)))
    ]);
    return {geometry:meshGeometry(T,bytes),source,textures};
  })());
  let assets;
  try {assets=await meshes.get(group);}
  catch(error) {
    console.warn('3D 복원 자료를 열 수 없어 기본 조형을 표시합니다.',piece.id,error);
    return null;
  }
  const {geometry,source,textures}=assets;
  const mesh=new T.Mesh(geometry,buildMaterial(T,source,textures));
  mesh.castShadow=true;
  orientPhotos(T,mesh,source);
  const root=new T.Group();root.add(mesh);root.userData.pieceId=piece.id;root.userData.reconstruction=true;
  mesh.rotation.y=source.yaw??(firstBearing[group]||0)*Math.PI/180;
  mesh.scale.setScalar(source.inches);
  if(source.center) mesh.position.fromArray(source.center).multiplyScalar(-source.inches).applyEuler(mesh.rotation);
  return root;
}
