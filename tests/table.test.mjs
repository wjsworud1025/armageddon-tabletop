import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable,photoFrame,photoToBoard} from '../data/catalog.mjs';
import {baseDistance,place,restore,snapshot} from '../state.mjs';
import * as T from '../vendor/three.module.min.js';
import {photoCamera,photoFit} from '../photo-camera.mjs';
import {createPiece} from '../assets/pieces.mjs';
import {applyLayout,layoutGeometry,validDeployment,objectiveAreas,overlapsArea} from '../layouts.mjs';
import {coherency} from '../movement.mjs';
import {groupId,newBattle} from '../rules/battle.mjs';
const board=createTable(), approx=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<tol,`${a} ≠ ${b}`);
test('Published roster counts, individual heights, unique ids and oriented photo corners',()=>{
  assert.equal(new Set(board.pieces.map(p=>p.id)).size,61);
  for(const [team,n] of [['orks',33],['marines',13],['terrain',15]])assert.equal(board.pieces.filter(p=>p.faction===team).length,n);
  const view=photoCamera(T,44,30);view.fit(1200,800);
  const {px,uMid,vMid}=photoFit(1200,800);
  photoFrame.corners.forEach(([u,v],i)=>{
    const [x,z]=photoFrame.worldCorners[i],p=photoToBoard(u,v);
    approx(p.x,x,.001);approx(p.z,z,.001);
    const screen=new T.Vector3(x,0,z).project(view.camera);
    approx((1+screen.x)*600,600+px*(u-uMid));approx((1-screen.y)*400,400+px*(v-vMid));
  });
  const foot=new T.Vector3().project(view.camera),head=new T.Vector3(0,2,0).project(view.camera);
  assert.ok(head.y>foot.y);
});
test('close-up frames the elevated shrine and both wing tips in wide and tall viewports',()=>{
  const p=board.pieces.find(p=>p.kind==='generatorShrine'),obj=createPiece(T,p);
  obj.position.set(p.x,2,p.z);obj.rotation.y=p.yaw;obj.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(obj,true);
  for(const [w,h] of [[1089,713],[480,860]]){
    const cam=photoCamera(T,44,30),v=cam.frame(w,h,bounds);
    cam.fit(w,h,v.zoom,v.offsetX,v.offsetY);
    const frame=bounds.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(cam.camera.projectionMatrix,cam.camera.matrixWorldInverse));
    for(const axis of ['x','y']){
      approx(frame.min[axis],-frame.max[axis]);
      assert.ok(frame.max[axis]<=.74001);
    }
    approx(Math.max(frame.max.x,frame.max.y),.74);
  }
});
test('Rotating elliptical vehicle and measuring round bases uses inches at the nearest edge',()=>{
  const a={faction:'orks',baseWidth:2,baseDepth:4,yaw:0,x:0,z:0},b={...a,baseWidth:2,baseDepth:2,x:10};
  approx(baseDistance(a,b),8);a.yaw=Math.PI/2;approx(baseDistance(a,b),7);
  b.x=1;approx(baseDistance(a,b),0);b.x=b.z=5;approx(baseDistance(a,b),baseDistance(b,a));
  place(a,200,200,board);approx(a.x,20);approx(a.z,14);
});
test('Save roundtrip preserves per-piece state, wounded models, objectives, and rejects damaged records',()=>{
  const original={...structuredClone(board),rules:{hp:{'captain-1':3}},logs:['첫 턴']};
  original.pieces[0].removed=true;original.pieces[4].elevation=2;
  const data=snapshot(original),loaded=restore(board,JSON.parse(JSON.stringify(data)));
  assert.deepEqual(snapshot(loaded),data);
  data.pieces[0].id='unknown';assert.throws(()=>restore(board,data));
});
function checkArmyDeployment(game){
  const groups=new Map();
  const deployed=game.pieces.filter(p=>!p.removed);
  for(const [i,a] of deployed.entries()){
    if(a.faction==='terrain')continue;
    assert.ok(validDeployment(game,a),a.id+' outside deployment zone');
    assert.equal(a.elevation,0);
    const key=groupId(game.rules??{attachments:{}},a);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(a);
    for(const [j,b] of deployed.entries()){
      if(i===j||(b.faction!=='terrain'&&j<i))continue;
      const reach=(p)=>p.faction==='terrain'?Math.hypot(p.baseWidth,p.baseDepth)/2:Math.max(p.baseWidth,p.baseDepth)/2;
      if(Math.hypot(a.x-b.x,a.z-b.z)>reach(a)+reach(b)+.08)continue;
      assert.ok(baseDistance(a,b)>.06,a.id+' overlaps '+b.id);
    }
  }
  for(const [id,unit] of groups)assert.ok(coherency(unit).ok,id+' breaks unit coherency');
}
test('All six map and side combinations deploy each formation inside its zone with four objective areas',()=>{
  for(const map of ['A','B','C'])for(const blue of ['marines','orks']){
    const game={...createTable(),rules:null,logs:[]};applyLayout(game,map,blue);
    assert.equal(layoutGeometry(map).terrain.length,14);
    assert.equal(game.pieces.filter(p=>p.faction==='terrain'&&!p.removed).length,14);
    assert.equal(game.pieces.find(p=>p.kind==='shockArray').removed,true);
    checkArmyDeployment(game);
    const areas=objectiveAreas(game);assert.equal(areas.length,4);
    assert.equal(areas.filter(a=>a.home===blue).length,1);
    assert.equal(areas.filter(a=>a.home===null).length,2);
    assert.deepEqual(snapshot(restore(board,snapshot(game))),snapshot(game));
  }
});
test('on all three diagrams the shrine and capacitor each occupy their own printed area; the capacitor console faces the short edge shown',()=>{
  const plants={A:[[850,861,0],[693.5,1099,0]],B:[[353,1090,90],[1187,871,90]],C:[[767,1319,90],[770,642,90]]};
  for(const [map,expected] of Object.entries(plants)){
    const {terrain}=layoutGeometry(map);
    for(const [index,id] of ['generatorShrine-1','capacitorStack-1'].entries()){
      const at=terrain.find(p=>p.id===id),[u,v,angle]=expected[index];
      assert.ok(Math.abs(u-(203+(15-at.z)*1129/30))<1e-7);
      assert.ok(Math.abs(v-(154+(22+at.x)*1654/44))<1e-7);
      assert.equal(at.yaw,angle*Math.PI/180);
    }
    const capacitor=terrain.find(p=>p.id==='capacitorStack-1');
    // Local +z transformed into world x/z by the sculpt's yaw.
    const direction=[Math.sin(capacitor.yaw),Math.cos(capacitor.yaw)].map(n=>Math.round(n)||0);
    assert.deepEqual(direction,map==='A'?[0,1]:[1,0]);
    assert.equal(terrain.some(p=>p.id==='shockArray-1'),false);
    const previous=layoutGeometry(map,2).terrain;
    const withoutPlants=poses=>poses.filter(p=>!['generatorShrine-1','capacitorStack-1','shockArray-1'].includes(p.id));
    assert.deepEqual(withoutPlants(previous),withoutPlants(layoutGeometry(map,1).terrain));
    const withoutRuins=poses=>poses.filter(p=>!p.id.includes('Ruin-'));
    assert.deepEqual(withoutRuins(terrain),withoutRuins(previous));
  }
});
test('printed walls and open courtyards on the three patrol maps align with the projected casts',()=>{
  const marks=[
    ['A','largeRuin-1',[874,507],[896,386]],
    ['B','largeRuin-2',[1104,1413],[1078,1511]],
    ['C','largeRuin-1',[1237,630],[1130,516]]
  ];
  const down=new T.Vector3(0,-1,0);
  for(const [map,id,wall,yard] of marks){
    const model=createPiece(T,board.pieces.find(p=>p.id===id));
    const at=layoutGeometry(map).terrain.find(p=>p.id===id);
    model.position.set(at.x,0,at.z);model.rotation.y=at.yaw;model.updateMatrixWorld(true);
    function surface([u,v]){
      const origin=new T.Vector3((v-154)*44/1654-22,12,15-(u-203)*30/1129);
      return new T.Raycaster(origin,down).intersectObject(model,true)[0]?.point.y;
    }
    assert.ok(surface(wall)>3,map+' printed wall must intersect a tall part of the miniature');
    assert.equal(surface(yard),undefined,map+' courtyard must be clear');
  }
});
test('a saved custom table retains industrial terrain centres that touched the board edge with the former footprints',()=>{
  const old={...createTable(),rules:newBattle(),logs:[]};
  const saved=snapshot(old);
  for(const [id,z] of [['generatorShrine-1',14.25],['capacitorStack-1',14.125]]){
    Object.assign(saved.pieces.find(p=>p.id===id),{x:0,z,yaw:0,removed:false});
  }
  const loaded=restore(board,saved);
  for(const id of ['generatorShrine-1','capacitorStack-1']){
    assert.deepEqual(snapshot(loaded).pieces.find(p=>p.id===id),saved.pieces.find(p=>p.id===id));
  }
  saved.pieces.find(p=>p.id==='capacitorStack-1').z=100;
  assert.ok(restore(board,saved).pieces.find(p=>p.id==='capacitorStack-1').z<=15);
});
test('attached leaders deploy with their specific bodyguard on all maps and both sides',()=>{
  const assignments=[{}, {'warboss-1':'boy-0'}, {'warboss-1':'boy-1'},
    {'weirdboy-1':'boy-0'}, {'weirdboy-1':'boy-1'},
    {'warboss-1':'boy-0','weirdboy-1':'boy-1'}, {'warboss-1':'boy-1','weirdboy-1':'boy-0'}];
  for(const map of ['A','B','C'])for(const blue of ['marines','orks'])for(const assignmentsOrks of assignments)for(const attachLibrarian of [false,true]) {
    const game={...createTable(),rules:newBattle(),logs:[]};
    game.rules.attachments={...assignmentsOrks};
    if(attachLibrarian)game.rules.attachments['librarian-1']='intercessor';
    applyLayout(game,map,blue);
    checkArmyDeployment(game);
  }
});
test('deployment is deterministic, preserves reserves and commits only a complete arrangement',()=>{
  const game={...createTable(),rules:newBattle(),logs:[]};
  for(const p of game.pieces)if(p.kind==='gretchin'){p.removed=true;p.elevation=3;}
  applyLayout(game,'A','orks');
  const first=snapshot(game);
  applyLayout(game,'A','orks');
  assert.deepEqual(snapshot(game),first);
  assert.ok(game.pieces.filter(p=>p.kind==='gretchin').every(p=>p.removed&&p.elevation===3));
  game.pieces.find(p=>p.kind==='landSpeeder').baseWidth=100;
  const before=structuredClone(game);
  assert.throws(()=>applyLayout(game,'C','marines'),/배치 구역/);
  assert.deepEqual(game,before);
});
test('Objective control counts partial elliptical overlap and excludes an outside base',()=>{
  const ring=[[-1,-1],[1,-1],[1,1],[-1,1]];
  const p={x:2.1,z:.1,baseWidth:1,baseDepth:3,yaw:Math.PI/2};
  assert.equal(overlapsArea(p,ring),true);
  p.yaw=0;assert.equal(overlapsArea(p,ring),false);
});
