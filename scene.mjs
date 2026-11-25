import * as T from 'three';
import {photoCamera} from './photo-camera.mjs';
import {createPiece} from './assets/pieces.mjs';
import {sightHiddenPieces} from './assets/sight-units.mjs';
import {paintedFigures} from './painted.mjs';
import {layoutGeometry} from './layouts.mjs';
import {trainingThreePlan,trainingThreeWorldPoint} from './data/training-three-layout.mjs';
import {trainingFourAreas} from './data/training-four-layout.mjs';
import {studioScene} from './studio-scene.mjs';
import {loadReconstruction} from './reconstruction/mesh.mjs';
import {loadWallSurvey} from './assets/wall-relief.mjs';
import {fieldTexture} from './media.mjs';
import {translateFormation} from './state.mjs';
import {measureFootprints} from './ruler.mjs';

const up = new T.Vector3(0,1,0);
const floor = new T.Plane(up,0);
const clamp = T.MathUtils.clamp;
export async function buildScene(canvas,api) {
  const game=api.template;
  const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.7));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.17;
  const scene=new T.Scene();scene.background=new T.Color(0x393d38);
  scene.add(new T.HemisphereLight(0xfff1d9,0x64615b,1.7));
  const sun=new T.DirectionalLight(0xffe6c3,2.8);sun.position.set(-22,43,20);sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-34,right:34,top:33,bottom:-33,near:.1,far:105});
  sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.00025;sun.shadow.normalBias=.018;scene.add(sun);
  const rim=new T.DirectionalLight(0xc2dcff,1.1);rim.position.set(16,20,-22);scene.add(rim);
  const orbitCamera=new T.OrthographicCamera(-25,25,20,-20,.05,450);
  const eyeCamera=new T.PerspectiveCamera(54,1,.025,450);let sightPair=null,eyeOffset=0;
  const promo=photoCamera(T,game.width,game.depth); let photo=true,camera=promo.camera;
  let photoZoom=1, offsetX=0, offsetY=0;
  const target=new T.Vector3(), ray=new T.Raycaster(), pointer=new T.Vector2();
  let yaw=-.24,pitch=.67,half=21,mode='pick',selected=null,gridVisible=false,gesture=null;
  const deck=new T.Mesh(new T.BoxGeometry(game.width+.15,.27,game.depth+.15),new T.MeshStandardMaterial({color:0x443a32}));
  deck.position.y=-.16;deck.receiveShadow=true;deck.castShadow=true;scene.add(deck);
  const panels=['left','right'].map((side,i)=>{
    const mat=new T.MeshStandardMaterial({color:0xffffff,roughness:.95});
    const geometry=new T.PlaneGeometry(game.width/2,game.depth);
    const uv=geometry.attributes.uv;for(let n=0;n<uv.count;n++)uv.setX(n,(uv.getX(n)+i)/2);
    const board=new T.Mesh(geometry,mat);board.rotation.x=-Math.PI/2;
    board.position.x=(i-.5)*game.width/2;board.receiveShadow=true;scene.add(board);return {side,mat,board};
  });
  // Handbook p. 53 uses the right panel turned counter-clockwise. The top
  // edge runs down the outer edge of the supplied right-hand print.
  const drillGeometry=new T.PlaneGeometry(game.depth,game.width/2);
  const drillUV=drillGeometry.attributes.uv;
  for(let i=0;i<drillUV.count;i++)drillUV.setXY(i,.5+drillUV.getY(i)/2,1-drillUV.getX(i));
  const drillBoard=new T.Mesh(drillGeometry,new T.MeshStandardMaterial({color:0xffffff,roughness:.95}));
  drillBoard.rotation.x=-Math.PI/2;drillBoard.receiveShadow=true;drillBoard.visible=false;scene.add(drillBoard);
  const matFloor=new T.Mesh(new T.PlaneGeometry(400,400),new T.MeshStandardMaterial({color:0x363b38,roughness:1}));
  matFloor.rotation.x=-Math.PI/2;matFloor.position.y=-.34;matFloor.receiveShadow=true;scene.add(matFloor);
  function gridGeometry(width,depth){
    const points=[];
    for(let x=-width/2;x<=width/2;x++)points.push(x,.025,-depth/2,x,.025,depth/2);
    for(let z=-depth/2;z<=depth/2;z++)points.push(-width/2,.025,z,width/2,.025,z);
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));return g;
  }
  const lineGeom=gridGeometry(game.width,game.depth),drillGrid=gridGeometry(game.depth,game.width/2);
  const grid=new T.LineSegments(lineGeom,new T.LineBasicMaterial({color:0xffedbb,transparent:true,opacity:.32}));scene.add(grid);grid.visible=false;
  let invalid=true;
  function dirty(){invalid=true}
  async function textureFor(path){const tex=await new T.TextureLoader().loadAsync(path);
    tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=renderer.capabilities.getMaxAnisotropy();return tex}
  const localArt=api.localArt;
  if(localArt)await loadWallSurvey();
  async function boardTexture(back){
    if(localArt)return textureFor(back?'./data/board-reverse.svg':'./data/board.svg');
    const tex=await fieldTexture(T,back);
    tex.anisotropy=renderer.capabilities.getMaxAnisotropy();
    return tex;
  }
  const texture=await boardTexture(false);let reverse=null,reverseRequest;
  drillBoard.material.map=texture;
  async function loadReverse(){if(reverse)return;reverseRequest??=boardTexture(true);
    try{reverse=await reverseRequest}finally{reverseRequest=null}}
  if(['left','right','reverse'].includes(api.game().surface))await loadReverse();
  const objects=new Map(),painted=localArt?await paintedFigures(T,game.pieces):new Map();
  const studio=studioScene(T,scene,localArt?game.pieces:[],()=>sync());
  const initialYaw=new Map(api.template.pieces.map(p=>[p.id,p.yaw]));
  for(const obj of painted.values())scene.add(obj);
  let usePaint=localArt;
  for(let i=0;i<game.pieces.length;i++){
    const p=game.pieces[i];
    const obj=(localArt?await loadReconstruction(T,p):null) ?? createPiece(T,p);
    obj.userData.pieceId=p.id;
    objects.set(p.id,obj);scene.add(obj);
    if(i%5===0){api.progress(i,game.pieces.length);await new Promise(requestAnimationFrame)}
  }
  const halo=new T.Mesh(new T.RingGeometry(.96,1.08,72),new T.MeshBasicMaterial({color:0xffd773,side:T.DoubleSide,depthTest:false,transparent:true,opacity:.9}));
  const ringRoot=new T.Group();halo.rotation.x=-Math.PI/2;halo.renderOrder=10;ringRoot.add(halo);scene.add(ringRoot);
  const tape=new T.Line(new T.BufferGeometry(),new T.LineBasicMaterial({color:0xffe189,depthTest:false}));tape.renderOrder=11;scene.add(tape);
  const zones=new T.Group();scene.add(zones);let drawnMap=null;
  function updateZones(){
    const table=api.game();
    const code=table.training?.scenario===4?'training-four-'+(table.training.phase==='deployment'?'setup':'battle'):
      table.training?.scenario===3&&table.training.phase==='deployment'?'training-three':table.layout?.map??null;
    zones.visible=api.zones()&&!!code;
    if(code===drawnMap)return;drawnMap=code;
    for(const obj of [...zones.children]){obj.geometry.dispose();obj.material.dispose();zones.remove(obj)}
    function patch(polygon,color,opacity,y){
      const shape=new T.Shape(polygon.map(([x,z])=>new T.Vector2(x,-z)));
      const mesh=new T.Mesh(new T.ShapeGeometry(shape),new T.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:T.DoubleSide}));
      mesh.rotation.x=-Math.PI/2;mesh.position.y=y;mesh.renderOrder=-3;zones.add(mesh);
      const edge=new T.LineLoop(new T.BufferGeometry().setFromPoints(polygon.map(([x,z])=>new T.Vector3(x,y+.01,z))),new T.LineBasicMaterial({color}));zones.add(edge);
    }
    if(code?.startsWith('training-four-')){
      for(const area of trainingFourAreas){
        if(area.terrainIds.length)patch(area.polygon,0xe3bd62,.19,.035);
        else if(code==='training-four-setup'&&area.id==='eastern-vent')patch(area.polygon,0x3c9bee,.14,.035);
      }
      return;
    }
    if(code==='training-three'){
      const colors={marines:0x3c9bee,orks:0xa6b955,gretchin:0xe3bd62};
      for(const [unit,{left,top,right,bottom}] of Object.entries(trainingThreePlan.zones)){
        const polygon=[[left,top],[right,top],[right,bottom],[left,bottom]].map(([x,z])=>{
          const world=trainingThreeWorldPoint({x,z});return [world.x,world.z];
        });
        patch(polygon,colors[unit],.14,.035);
      }
      return;
    }
    const data=layoutGeometry(code);if(!data)return;
    patch(data.blue,0x3c9bee,.25,.035);patch(data.red,0xe46b50,.25,.035);
    for(const area of data.areas)patch(area.polygon,area.side?'#ffe295':'#98e2c6',.36,.05);
  }
  const label=document.createElement('output');
  Object.assign(label.style,{position:'absolute',pointerEvents:'none',background:'#232823',color:'#ffe39e',border:'1px solid #a39059',font:'bold 13px Consolas,monospace',padding:'3px 6px',borderRadius:'4px',transform:'translate(-50%,-120%)'});
  canvas.parentElement.append(label);
  let ends=[],waypoints=[];
  function lookup(id){return api.game().pieces.find(p=>p.id===id)}
  function sync(){
    const table=api.game(),drill=!!table.training;
    if(sightPair&&sightPair.some(id=>!table.pieces.some(p=>p.id===id&&!p.removed))){
      sightPair=null;eyeOffset=0;projection();return;
    }
    const hidden=sightHiddenPieces(table,sightPair);
    drillBoard.visible=drill;grid.geometry=drill?drillGrid:lineGeom;
    if(drill){
      const map=table.surface==='reverse'&&reverse?reverse:texture;
      if(drillBoard.material.map!==map){drillBoard.material.map=map;drillBoard.material.needsUpdate=true}
    }
    deck.scale.set((table.width+.15)/(game.width+.15),1,(table.depth+.15)/(game.depth+.15));
    for(const {side,mat,board} of panels){
      board.visible=!drill;
      const surface=table.surface,useBack=surface==='reverse'||surface===side;
      const face=(useBack&&reverse)||texture;if(mat.map!==face){mat.map=face;mat.needsUpdate=true}
      if(useBack&&!reverse&&!reverseRequest)loadReverse().then(sync).catch(()=>{});
    }
    updateZones();
    for(const p of table.pieces){
      const obj=objects.get(p.id),portrait=painted.get(p.id);
      const matchingPose=Math.abs(Math.sin((p.yaw-initialYaw.get(p.id))/2))<.001;
      if(portrait)portrait.visible=!p.removed&&photo&&usePaint&&matchingPose&&!sightPair;
      const viewYaw=photo?Math.atan2(promo.camera.position.x-p.x,promo.camera.position.z-p.z):yaw;
      const pos=photo?promo.camera.position:orbitCamera.position;
      const dist=Math.hypot(pos.x-p.x,pos.y-(p.elevation||0),pos.z-p.z);
      const stereo=studio.update(p,viewYaw,photo ? .32 : pitch,dist,usePaint&&!sightPair&&!portrait?.visible&&!obj.userData.reconstruction);
      obj.visible=!p.removed&&!portrait?.visible&&!stereo&&!hidden.has(p.id);obj.position.set(p.x,p.elevation||0,p.z);obj.rotation.y=p.yaw;
      if(portrait){portrait.position.copy(obj.position);portrait.renderOrder=200-promo.camera.position.distanceTo(obj.position)}
    }
    const p=lookup(selected);
    ringRoot.visible=!!p&&!p.removed&&!sightPair;
    if(p){ringRoot.position.set(p.x,(p.elevation||0)+.05,p.z);ringRoot.rotation.y=p.yaw;halo.scale.set(p.baseWidth*.52,p.baseDepth*.52,1)}
    dirty();
  }
  function projection(){
    const w=canvas.clientWidth,h=canvas.clientHeight;if(w<=0||h<=0)return;
    sync();api.appearance(usePaint&&!sightPair&&(photo||pitch<65*Math.PI/180),photo);
    if(sightPair){
      const [a,b]=sightPair.map(lookup);
      if(a&&b&&!a.removed&&!b.removed){
        camera=eyeCamera;camera.aspect=w/h;
        const high=p=>{const box=new T.Box3().setFromObject(objects.get(p.id));return box.max.y-box.min.y};
        const eye=Math.max(.1,high(a)*.72+eyeOffset);
        camera.position.set(a.x,(a.elevation||0)+eye,a.z);
        camera.lookAt(b.x,(b.elevation||0)+high(b)*.55,b.z);camera.updateProjectionMatrix();camera.updateMatrixWorld();
        const unitHint=a.faction!=='terrain'&&b.faction!=='terrain'?' · 양쪽 분대의 다른 모델 숨김':'';
        api.sightInfo(a.name+' → '+b.name+unitHint+' · 시점 높이 '+eye.toFixed(2)+'″ · 휠로 높이 조절 · 전체 보기로 복귀');dirty();return;
      }
      sightPair=null;sync();
    }
    if(photo){camera=promo.camera;promo.fit(w,h,photoZoom,offsetX,offsetY);dirty();return}
    camera=orbitCamera;camera.left=-half*w/h;camera.right=half*w/h;camera.top=half;camera.bottom=-half;
    camera.position.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(95).add(target);
    camera.lookAt(target);camera.updateProjectionMatrix();camera.updateMatrixWorld();sync();dirty();
  }
  function home(top=false){sightPair=null;eyeOffset=0;photo=!top;photoZoom=1;offsetX=offsetY=0;target.set(0,.4,0);yaw=top?0:-.24;pitch=top?Math.PI/2-.0001:.67;
    const aspect=canvas.clientWidth/Math.max(1,canvas.clientHeight);
    const table=api.game();
    if(table.training){photo=false;
      const duel=table.training.scenario===1;
      target.set(0,top?0:duel?1.15:.4,0);
      pitch=top?Math.PI/2-.0001:duel?.34:.92;
      half=top||!duel?Math.max(table.depth*.57,(table.width*Math.cos(yaw)+table.depth*Math.abs(Math.sin(yaw)))*.56/aspect):Math.max(2.6,2.8/aspect);
      projection();return}
    half=Math.max(top?game.depth*.61:game.depth*.46,(game.width*Math.cos(yaw)+game.depth*Math.abs(Math.sin(yaw)))*.56/aspect);projection()}
  function resize(){renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);projection()}
  new ResizeObserver(resize).observe(canvas);
  function hits(e){const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);ray.setFromCamera(pointer,camera)}
  function ground(e){hits(e);return ray.ray.intersectPlane(floor,new T.Vector3())}
  function pick(e){
    hits(e);scene.updateMatrixWorld();const visible=[...objects.values(),...painted.values(),...studio.objects].filter(o=>o.visible);
    const hit=ray.intersectObjects(visible,true).find(h=>!h.object.userData.opaque||h.object.userData.opaque(h.uv));let obj=hit?.object;
    while(obj && !obj.userData.pieceId)obj=obj.parent;
    return obj?.userData.pieceId??null;
  }
  function endpoint(end){const p=end?.id?lookup(end.id):end;return p&&!p.removed?p:null}
  function paintMeasure(){
    const actor=lookup(selected);
    if(mode==='path'&&actor&&!actor.removed&&waypoints.length){
      const all=[actor,...waypoints].map(p=>new T.Vector3(p.x,(actor.elevation||0)+.22,p.z));
      tape.visible=true;tape.geometry.dispose();tape.geometry=new T.BufferGeometry().setFromPoints(all);
      const length=all.slice(1).reduce((sum,v,i)=>sum+v.distanceTo(all[i]),0);
      const tip=all.at(-1).clone().project(camera);
      label.hidden=false;label.style.left=(tip.x*.5+.5)*canvas.clientWidth+'px';label.style.top=(.5-tip.y*.5)*canvas.clientHeight+'px';
      label.textContent=length.toFixed(2)+'″ · '+waypoints.length+'구간';return;
    }
    let [a,b]=ends.map(endpoint);const dragging=gesture?.type==='move'&&gesture.drag;
    if(dragging){a=gesture.start;b=lookup(gesture.id)}
    label.hidden=!a||!b;tape.visible=!!a&&!!b;
    if(!a||!b)return;
    const measured=dragging?{from:a,to:b,distance:gesture.distance??0}:measureFootprints(a,b);
    const position=p=>new T.Vector3(p.x,(p.elevation||0)+.06,p.z);
    const pa=position(measured.from),pb=position(measured.to);
    tape.geometry.dispose();tape.geometry=new T.BufferGeometry().setFromPoints([pa,pb]);
    const projected=pa.clone().lerp(pb,.5).project(camera);
    label.style.left=(projected.x*.5+.5)*canvas.clientWidth+'px';label.style.top=(.5-projected.y*.5)*canvas.clientHeight+'px';
    const kind=dragging?'이동':a.id&&b.id?'베이스 간격':a.id||b.id?'베이스–지점':'지점 거리';
    label.textContent=measured.distance.toFixed(2)+'″ '+kind;
  }
  function start(e){
    if(gesture||![0,1,2].includes(e.button))return;
    if(sightPair&&mode!=='sight')return;
    const pan=e.shiftKey||e.button===1,orbit=e.button===2;
    const id=pan||orbit?null:pick(e),g=ground(e);
    gesture={type:pan?'pan':orbit?'orbit':mode==='ruler'?'measure':mode==='sight'?'sight':mode==='path'?'path':id?'move':'orbit',id,g,sx:e.clientX,sy:e.clientY,angle:yaw,pitch,target:target.clone(),offsetX,offsetY,drag:false,pointer:e.pointerId};
    if(id&&mode==='pick'){api.select(id);const p=lookup(id);
      if(!api.canDrag(p)){gesture.type='orbit'}else{
        gesture.start={x:p.x,z:p.z,elevation:p.elevation};gesture.records=api.moving(p).map(piece=>({piece,x:piece.x,z:piece.z}));
      }}
    canvas.setPointerCapture(e.pointerId);e.preventDefault();
  }
  function move(e){
    const d=gesture;if(!d||d.pointer!==e.pointerId)return;
    const dx=e.clientX-d.sx,dy=e.clientY-d.sy;
    if(!d.drag&&Math.hypot(dx,dy)<3)return;
    d.drag=true;
    if(d.type==='orbit'){if(photo){const r=canvas.getBoundingClientRect();const centre=ground({clientX:r.left+r.width/2,clientY:r.top+r.height/2});if(centre)target.copy(centre);half/=photoZoom}photo=false;yaw=d.angle-dx*.007;pitch=clamp(d.pitch+dy*.007,.14,Math.PI/2-.0001);projection()}
    if(d.type==='pan'){
      if(photo){offsetX=d.offsetX+dx;offsetY=d.offsetY+dy;projection();return}
      const ratio=2*half/canvas.clientHeight;
      target.copy(d.target).addScaledVector(new T.Vector3(Math.cos(yaw),0,-Math.sin(yaw)),-dx*ratio)
        .addScaledVector(new T.Vector3(Math.sin(yaw),0,Math.cos(yaw)),-dy*ratio/Math.max(.22,Math.sin(pitch)));
      projection();
    }
    if(d.type==='move'){const g=ground(e);if(g&&d.g){d.distance=translateFormation(d.records,g.x-d.g.x,g.z-d.g.z,api.game());sync()}}
  }
  function finish(e,cancel=false){
    const d=gesture;if(!d||d.pointer!==e.pointerId)return;
    gesture=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    if(d.type==='move'&&d.drag){const p=lookup(d.id),end={x:p.x,z:p.z};
      for(const i of d.records){i.piece.x=i.x;i.piece.z=i.z}
      if(!cancel)api.route(p,[d.start,end],true);
      sync();}
    if(!cancel&&d.type==='measure'&&!d.drag&&d.g){if(ends.length>=2)ends=[];ends.push(d.id?{id:d.id}:{x:d.g.x,z:d.g.z});dirty();api.measure(ends.length)}
    if(!cancel&&d.type==='path'&&!d.drag&&d.g){
      if(d.id&&!waypoints.length&&d.id!==selected){api.select(d.id)}
      else if(lookup(selected)&&!lookup(selected).removed){waypoints.push({x:d.g.x,z:d.g.z});dirty()}
    }
    if(!cancel&&d.type==='sight'&&!d.drag&&selected&&d.id&&d.id!==selected){sightPair=[selected,d.id];eyeOffset=0;projection()}
    if(!cancel&&d.type==='orbit'&&!d.drag&&e.button===0&&!d.id)api.select(null);
  }
  canvas.addEventListener('pointerdown',start);canvas.addEventListener('pointermove',move);
  canvas.addEventListener('pointerup',e=>finish(e));canvas.addEventListener('pointercancel',e=>finish(e,true));
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('wheel',e=>{e.preventDefault();if(sightPair){eyeOffset=clamp(eyeOffset-Math.sign(e.deltaY)*.15,-3,5);projection();return}const scale=Math.exp(clamp(e.deltaY,-300,300)*.0014);
    if(photo){const prev=photoZoom;photoZoom=clamp(prev/scale,.55,12);const ratio=photoZoom/prev,r=canvas.getBoundingClientRect();
      offsetX=ratio*offsetX+(1-ratio)*(e.clientX-r.left-r.width/2);offsetY=ratio*offsetY+(1-ratio)*(e.clientY-r.top-r.height/2)}
    else half=clamp(half*scale,1.2,55);projection()},{passive:false});
  function focus(id){const p=lookup(id);if(!p||p.removed)return;sightPair=null;
    target.set(p.x,(p.elevation||0)+1,p.z);half=Math.max(2.1,p.baseWidth*1.2,p.baseDepth*1.2);
    if(photo){photoZoom=Math.min(8,17/Math.max(p.baseWidth,2));offsetX=offsetY=0;projection();
      const v=target.clone().project(camera);offsetX=-v.x*canvas.clientWidth/2;offsetY=v.y*canvas.clientHeight/2}
    projection()}
  canvas.addEventListener('dblclick',e=>focus(pick(e)));
  function render(){if(invalid){invalid=false;paintMeasure();renderer.render(scene,camera)}requestAnimationFrame(render)}
  resize();home();sync();render();
  return {sync,loadReverse,select(id){if(selected!==id)waypoints=[];selected=id;sync()},home,focus,top(){home(pitch<1.55);return pitch>1.55},
    inSight(){return !!sightPair},
    lookFrom(from,to){if(from!==to&&lookup(from)&&lookup(to)){sightPair=[from,to];eyeOffset=0;projection()}},
    backPoint(){waypoints.pop();dirty()},walk(){const p=lookup(selected);if(p&&!p.removed&&waypoints.length&&api.route(p,[{x:p.x,z:p.z},...waypoints])){waypoints=[];dirty()}},
    togglePaint(){if(!photo&&pitch>=65*Math.PI/180){usePaint=true;home()}else{usePaint=!usePaint;projection()}},
    setMode(next){mode=next;if(sightPair){sightPair=null;projection()}ends=[];waypoints=[];dirty()},toggleGrid(){gridVisible=!gridVisible;grid.visible=gridVisible;dirty();return gridVisible},
    pose(id){
      const obj=objects.get(id),visible=obj?.visible||painted.get(id)?.visible||studio.objects.some(o=>o.visible&&o.userData.pieceId===id);
      return visible?{x:obj.position.x,z:obj.position.z,elevation:obj.position.y,yaw:obj.rotation.y}:null;
    },
    stats(){return {pieces:objects.size,visiblePieces:[...objects.values(),...painted.values(),...studio.objects].filter(o=>o.visible).length,
      boardPanels:panels.filter(p=>p.board.visible).length+Number(drillBoard.visible),
      boardSurface:drillBoard.visible?(reverse&&drillBoard.material.map===reverse?'reverse':'front'):api.game().surface,
      boardWidth:drillBoard.visible?drillGeometry.parameters.width:game.width,boardDepth:drillBoard.visible?drillGeometry.parameters.height:game.depth,
      drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
      reconstructed:[...objects.values()].filter(o=>o.userData.reconstruction).length,
      studioVisible:studio.objects.filter(o=>o.visible).length}},
    screen(id){const p=lookup(id);if(!p)return null;const v=new T.Vector3(p.x,(p.elevation||0)+.45,p.z).project(camera);return {x:(v.x*.5+.5)*canvas.clientWidth,y:(.5-v.y*.5)*canvas.clientHeight}}};
}
