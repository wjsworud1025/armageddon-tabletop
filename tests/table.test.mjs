import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable,photoFrame,photoToBoard} from '../data/catalog.mjs';
import {baseDistance,place,restore,snapshot} from '../state.mjs';
import * as T from '../vendor/three.module.min.js';
import {photoCamera,photoFit} from '../photo-camera.mjs';
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
    assert.equal(layoutGeometry(map).terrain.length,15);
    checkArmyDeployment(game);
    const areas=objectiveAreas(game);assert.equal(areas.length,4);
    assert.equal(areas.filter(a=>a.home===blue).length,1);
    assert.equal(areas.filter(a=>a.home===null).length,2);
    assert.deepEqual(snapshot(restore(board,snapshot(game))),snapshot(game));
  }
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
