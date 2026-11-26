// Run after desktop/build.ps1. Uses the installed Chromium browser and an
// isolated temporary profile so the player's campaign saves are never touched.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {existsSync,mkdtempSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createTable} from '../data/catalog.mjs';
import {baseDistance} from '../state.mjs';
import {checkPatrolSetup} from '../rules/browser-patrol-setup.mjs';
import {checkRuinSight} from './browser-ruin-sight.mjs';
import {checkShooterSight} from './browser-shooter-sight.mjs';
import {checkPlungingFire} from './browser-plunging-fire.mjs';
import {checkTerrainAreas} from './browser-terrain-areas.mjs';
import {checkAreaCover} from './browser-area-cover.mjs';
import {checkOverwatch} from './browser-overwatch.mjs';
import {checkDetection} from './browser-detection.mjs';
import {checkSmallRuin} from './browser-small-ruin.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// --public-exe <file> exercises a clean distribution using the same native host.
const publicFlag=process.argv.indexOf('--public-exe');
if(publicFlag!==-1)assert.ok(process.argv[publicFlag+1],'--public-exe requires an executable path');
const executable=publicFlag===-1?join(root,'dist','ArmageddonTable.exe'):resolve(process.argv[publicFlag+1]);
const target='http://127.0.0.1:41946';
const profile=mkdtempSync(join(tmpdir(),'armageddon-smoke-'));
const evidence=join(root,'.build','qa');mkdirSync(evidence,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,timeout=60000){const expires=Date.now()+timeout;let last;
  while(Date.now()<expires){try{const v=await fn();if(v)return v}catch(e){last=e}await delay(140)}
  throw Error('Timed out: '+fn.toString().slice(0,180)+' '+(last?.message||''))}
let host,browser,ws;
try{
  await fetch(target+'/table-health',{signal:AbortSignal.timeout(500)}).then(()=>{throw Error('Close the running game before testing.')},()=>{});
  host=spawn(executable,['--serve'],{windowsHide:true,stdio:'ignore'});
  await until(async()=>(await(await fetch(target+'/table-health')).text())==='armageddon-2026-v1',15000);
  const chrome=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  assert.ok(chrome);
  browser=spawn(chrome,['--headless=new','--disable-background-networking','--disable-extensions','--no-first-run','--disable-default-apps','--disable-gpu-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--remote-debugging-port=0','--user-data-dir='+profile,'--window-size=1450,940','about:blank'],{stdio:'ignore',windowsHide:true});
  const portFile=join(profile,'DevToolsActivePort');
  const port=await until(()=>existsSync(portFile)&&readFileSync(portFile,'utf8').split(/\s/)[0],20000);
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await once(ws,'open');
  let seq=0;const pending=new Map(),errors=[];
  ws.onmessage=e=>{const m=JSON.parse(e.data);
    if(m.id){const job=pending.get(m.id);if(job){pending.delete(m.id);m.error?job.reject(Error(m.error.message)):job.resolve(m.result)}}
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
    if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.description||a.value).join(' '));};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
  async function js(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value}
  const click=selector=>js('document.querySelector('+JSON.stringify(selector)+').click()');
  const state=()=>js('tabletopView.state()');
  async function upload(save){
    await js('(()=>{const input=document.querySelector("#file"),dt=new DataTransfer();dt.items.add(new File(['+JSON.stringify(JSON.stringify(save))+'],"patrol.json",{type:"application/json"}));input.files=dt.files;input.dispatchEvent(new Event("change",{bubbles:true}))})()');
    await until(()=>js('document.querySelector("#file").value===""'));
  }
  await send('Runtime.enable');await send('Page.enable');await send('Page.navigate',{url:target});
  await until(async()=>{if(errors.length)throw Error(errors.join('; '));return js('!!window.tabletopView')});
  const stats=await js('tabletopView.stats()');assert.equal(stats.pieces,61);
  async function screenshot(name){await delay(500);const img=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(evidence,name),Buffer.from(img.data,'base64'))}
  await checkSmallRuin({save:await state(),upload,state,js,click,send,screenshot});
  await checkRuinSight({save:await state(),upload,state,js,click,send,screenshot});
  const shootingTools={save:await state(),upload,state,js,click,screenshot,reload:async()=>{
    await send('Page.reload');await until(()=>js('!!window.tabletopView'));await click('[data-tab=battle]');
  }};
  await checkOverwatch(shootingTools);
  await checkDetection(shootingTools);
  await checkTerrainAreas({...shootingTools,until});
  await checkShooterSight(shootingTools);
  await checkPlungingFire(shootingTools);
  await checkAreaCover(shootingTools);
  await screenshot('01-table.png');
  const studioInstalled=await js('!document.querySelector("#appearance").hidden');
  if(publicFlag!==-1)assert.equal(studioInstalled,false,'Public executable must run without the studio pack');
  if(studioInstalled)await click('#appearance');
  await delay(400);const meshes=await js('tabletopView.stats()');assert.ok(meshes.triangles>10000);await screenshot('01b-meshes.png');
  await js('document.querySelector("#search").value="발전기 성소";document.querySelector("#search").dispatchEvent(new Event("input"))');
  await click('[aria-label$="generatorShrine-1"]');await click('#focus');
  assert.match(await js('document.querySelector("#piece-name").textContent'),/발전기 성소/);
  await screenshot('01c-generator-shrine.png');
  await click('#home');await js('document.querySelector("#search").value="";document.querySelector("#search").dispatchEvent(new Event("input"))');
  const preBoy=await state(),boyStudy=structuredClone(preBoy);
  for(const p of boyStudy.pieces){
    p.removed=p.id!=='boy-20';
    if(!p.removed)Object.assign(p,{x:0,z:0,yaw:-Math.PI/8,elevation:0});
  }
  await upload(boyStudy);
  await js('document.querySelector("#search").value="보이 20";document.querySelector("#search").dispatchEvent(new Event("input"))');
  await click('[aria-label$="boy-20"]');await click('#focus');
  assert.match(await js('document.querySelector("#piece-name").textContent'),/보이 20/);
  await until(()=>js('document.querySelector("#notice").hidden&&tabletopView.stats().visiblePieces===1'));
  const visibleBoy=await js('tabletopView.pose("boy-20")');
  assert.equal(visibleBoy.x,0);assert.equal(visibleBoy.yaw,-Math.PI/8);
  await screenshot('03-boy-20.png');
  await upload(preBoy);await click('#home');
  await js('document.querySelector("#search").value="";document.querySelector("#search").dispatchEvent(new Event("input"))');
  assert.deepEqual((await state()).pieces,preBoy.pieces);
  if(publicFlag!==-1)assert.equal(meshes.reconstructed,0);
  else if(studioInstalled&&existsSync(join(root,'reconstruction','models','14.whm')))assert.ok(meshes.reconstructed>=17,'Installed set must display both reconstructed pylons');
  if(studioInstalled){
    await click('#appearance');
    await click('#reference-toggle');assert.equal(await js('document.querySelector("#reference").hidden'),false);await screenshot('02-reference.png');await click('#reference-toggle');
  }
  await click('#flip-left');await until(async()=>(await state()).surface==='left');
  await click('#flip-right');await until(async()=>(await state()).surface==='reverse');await screenshot('02b-reverse.png');
  await click('#undo');await click('#undo');assert.equal((await state()).surface,'front');
  await click('#camera');await click('#grid');
  const id='captain-1';
  const xy=await js('(()=>{const p=tabletopView.screen("captain-1"),r=document.querySelector("#view").getBoundingClientRect();return{x:r.left+p.x,y:r.top+p.y}})()');
  const mouse=(type,x,y,button='left',buttons=0)=>send('Input.dispatchMouseEvent',{type,x,y,button,buttons,clickCount:1});
  const start=(await state()).pieces.find(p=>p.id===id);
  await mouse('mousePressed',xy.x,xy.y,'left',1);await mouse('mouseMoved',xy.x+54,xy.y+12,'left',1);await mouse('mouseReleased',xy.x+54,xy.y+12);
  const moved=(await state()).pieces.find(p=>p.id===id);assert.ok(Math.abs(moved.x-start.x)>.1,'3D drag changes ground position');
  await click('#undo');approx((await state()).pieces.find(p=>p.id===id).x,start.x);
  await click('#redo');approx((await state()).pieces.find(p=>p.id===id).x,moved.x);
  await click('#path');
  const routePoints=await js('(()=>{const r=document.querySelector("#view").getBoundingClientRect();return [[.48,.49],[.50,.51]].map(([a,b])=>({x:r.x+a*r.width,y:r.y+b*r.height}))})()');
  for(const point of routePoints){await mouse('mousePressed',point.x,point.y,'left',1);await mouse('mouseReleased',point.x,point.y)}
  await click('#walk');assert.ok((await state()).logs.at(-1).includes('경로 이동'));await click('#undo');await click('#pick');
  await click('#sight');const aim=await js('(()=>{const r=document.querySelector("#view").getBoundingClientRect(),p=tabletopView.screen("warboss-1");return{x:r.x+p.x,y:r.y+p.y}})()');
  await mouse('mousePressed',aim.x,aim.y,'left',1);await mouse('mouseReleased',aim.x,aim.y);
  assert.ok(await js('document.getElementById("hint").textContent.includes("시점 높이")'));await click('#home');
  await click('#rotate');await click('#remove');assert.equal((await state()).pieces.find(p=>p.id===id).removed,true);await click('#undo');
  await click('#focus');await screenshot('03-miniature.png');
  if(studioInstalled){await click('#studio-view');
  const viewer='document.querySelector("dialog[open] > div").shadowRoot';
  await js(viewer+'.querySelector("[data-action=right]").click()');
  assert.equal(await js(viewer+'.querySelector(".angle").textContent'),'30°');
  await js(viewer+'.querySelector("[data-action=up]").click()');
  assert.equal(await js(viewer+'.querySelector(".level").textContent'),'중간 시점');
  await js('(()=>{const img=new Image();img.src='+viewer+'.querySelector(".subject").style.backgroundImage.slice(5,-2);return img.decode()})()');
  await screenshot('05-studio.png');
  await js(viewer+'.querySelector("[data-action=close]").click()');}
  await click('#home');await click('#ruler');const c=await js('document.querySelector("#view").getBoundingClientRect().toJSON()');
  for(const [x,y] of [[.3,.44],[.63,.55]]){await mouse('mousePressed',c.x+c.width*x,c.y+c.height*y,'left',1);await mouse('mouseReleased',c.x+c.width*x,c.y+c.height*y)}
  assert.ok(await js('document.querySelector("#stage output").textContent.includes("″")'));await click('#pick');
  await click('#home');await click('#camera');
  assert.equal(await js('tabletopView.stats().studioVisible'),0);
  const board=createTable(),vehicles=['landSpeeder-1','wartrakk-1'];
  const record=(snap,id)=>snap.pieces.find(p=>p.id===id);
  const screen=id=>js('(()=>{const p=tabletopView.screen('+JSON.stringify(id)+'),r=document.querySelector("#view").getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y}})()');
  async function tap(p){await mouse('mousePressed',p.x,p.y,'left',1);await mouse('mouseReleased',p.x,p.y);}
  const initial=await state(),[left,right]=await Promise.all(vehicles.map(screen));
  const scale=(right.x-left.x)/(record(initial,vehicles[1]).x-record(initial,vehicles[0]).x);
  const parked=[];
  for(const [i,id] of vehicles.entries()){
    const model=record(board,id),before=record(initial,id),from=await screen(id);
    await tap(from);assert.equal(await js('document.querySelector("#piece-name").textContent'),model.name);
    await click('#rotate');const turned=record(await state(),id);
    approx(turned.yaw,(before.yaw+Math.PI/12)%(2*Math.PI));
    const sign=i?1:-1,z=i?11:-10;
    const side=from.x+(sign*board.width/2-before.x)*scale,row=from.y+(z-before.z)*scale;
    await mouse('mousePressed',from.x,from.y,'left',1);await mouse('mouseMoved',side,row,'left',1);await mouse('mouseReleased',side,row);
    const pose=record(await state(),id),radiusX=Math.hypot(model.baseWidth*Math.cos(pose.yaw),model.baseDepth*Math.sin(pose.yaw))/2;
    const radiusZ=Math.hypot(model.baseWidth*Math.sin(pose.yaw),model.baseDepth*Math.cos(pose.yaw))/2;
    approx(sign*pose.x+radiusX,board.width/2);assert.ok(Math.abs(pose.z-z)<.1);
    assert.ok(Math.abs(pose.z)+radiusZ<=board.depth/2);approx(pose.yaw,turned.yaw);
    await click('#undo');assert.deepEqual(record(await state(),id),turned);
    await click('#redo');assert.deepEqual(record(await state(),id),pose);parked.push({...model,...pose});
  }
  const vehicleSave=await state();await send('Page.reload');await until(()=>js('!!window.tabletopView'));
  assert.deepEqual(await state(),vehicleSave);await click('#home');await click('#camera');await click('#ruler');
  async function rulerValue(kind){
    const label=await until(async()=>{
      const value=await js('document.querySelector("#stage output:not([hidden])")?.textContent');
      return value?.endsWith(kind)&&value;
    });
    return Number(label.split('″')[0]);
  }
  const [speeder,trakk]=parked,source=await screen(speeder.id);
  await tap(source);await tap(await screen(trakk.id));
  const baseGap=await rulerValue('베이스 간격');
  assert.equal(baseGap,Number(baseDistance(speeder,trakk).toFixed(2)));
  // An empty point four inches along +z from the Speeder's centre.
  const ground={...speeder,z:speeder.z+4,baseWidth:0,baseDepth:0};
  await tap(source);await tap({x:source.x,y:source.y+4*scale});
  const groundGap=await rulerValue('베이스–지점');
  assert.ok(Math.abs(groundGap-baseDistance(speeder,ground))<.1,'Ground click is measured from the rotated base rim');
  await click('#pick');
  await click('[data-tab=battle]');
  await click('#training-start');await until(()=>js('tabletopView.stats().visiblePieces===2'));
  assert.equal(await js('tabletopView.pose("warboss-1").x<tabletopView.pose("captain-1").x'),true);
  assert.deepEqual(await js('(()=>{const s=tabletopView.stats();return [s.boardPanels,s.boardWidth,s.boardDepth]})()'),[1,30,22]);
  await screenshot('04-handbook-duel.png');await click('#camera');await screenshot('04-handbook-board.png');await click('#training-roll');
  assert.equal((await state()).training.rolls.length,1);
  await click('#training-exit');assert.equal((await state()).training,undefined);
  assert.deepEqual(await js('(()=>{const s=tabletopView.stats();return [s.boardPanels,s.boardWidth,s.boardDepth]})()'),[2,44,30]);
  const beforeSecond=await state();
  await click('#training-two-start');
  await until(()=>js('tabletopView.stats().boardSurface==="reverse"&&tabletopView.stats().visiblePieces===20'));
  assert.deepEqual(await js('(()=>{const s=tabletopView.stats();return [s.boardPanels,s.boardWidth,s.boardDepth]})()'),[1,30,22]);
  await click('#camera');await screenshot('04-handbook-moving.png');
  await click('#training-two-options [data-action="move"][data-unit="warboss"][data-mode="normal"]');
  assert.equal((await state()).training.plan.unit,'warboss');
  await click('#training-two-exit');assert.deepEqual(await state(),beforeSecond);
  await click('#training-three-start');
  await until(()=>js('tabletopView.stats().boardSurface==="reverse"&&tabletopView.stats().visiblePieces===26'));
  await click('#camera');await screenshot('04-handbook-shooting.png');
  await click('#training-three-begin');assert.equal((await state()).training.active,'orks');
  const shot='#training-three-options [data-action=';
  await click(shot+'next]');
  await click(shot+'shoot-unit][data-unit=warboss]');
  await click(shot+'shoot-weapon][data-model=warboss-1][data-weapon="0"]');
  await click(shot+'shoot-target][data-target=captain]');
  await click('#training-three-options fieldset button');
  await until(()=>js('document.querySelector("#hint").textContent.includes("시점 높이")'));
  await screenshot('04-handbook-sight.png');
  await click('#training-three-exit');assert.deepEqual(await state(),beforeSecond);
  await click('#training-four-start');
  await until(()=>js('tabletopView.stats().boardSurface==="reverse"&&tabletopView.stats().visiblePieces===28'));
  await click('#camera');
  await click('#training-four-begin');
  assert.equal((await state()).training.phase,'command');
  assert.equal(await js('document.querySelectorAll("#training-four-objectives [data-area]").length'),3);
  await click('#training-four-options [data-action="four-score"]');
  assert.match(await js('document.querySelector("#training-four-objectives strong").textContent'),/오크 15/);
  await screenshot('04-handbook-objectives.png');
  await click('#training-four-exit');assert.deepEqual(await state(),beforeSecond);
  await checkPatrolSetup({save:beforeSecond,click,state,js,upload,
    async reload(){await send('Page.reload');await until(()=>js('!!window.tabletopView'));await click('[data-tab=battle]')},
    onDeployment:()=>screenshot('04-official-deployment.png'),
  });
  await js('document.querySelector("#deployment").open=true');
  const beforePreview=await state(),diagrams=new Set();
  for(const map of ['B','C','A']){
    await js('document.querySelector("#map").value='+JSON.stringify(map));
    assert.equal(await js('document.querySelector("#show-map").getClientRects().length>0'),true);
    await click('#show-map');
    assert.equal(await js('document.querySelector("#map-dialog").open'),true);
    if(studioInstalled){
      await js('document.querySelector("#map-image").decode()');
      assert.equal(await js('document.querySelector("#map-image").hidden'),false);
    }else{
      assert.equal(await js('document.querySelector("#map-diagram").hidden'),false);
      assert.match(await js('document.querySelector("#map-diagram").getAttribute("aria-label")'),new RegExp('지도 '+map));
      diagrams.add(await js(`(async()=>{
        const c=document.querySelector('#map-diagram'),pixels=c.getContext('2d').getImageData(0,0,c.width,c.height);
        return [...new Uint8Array(await crypto.subtle.digest('SHA-256',pixels.data))].join(',');
      })()`));
    }
    if(map==='C')await screenshot('04-map-preview.png');
    await click('#map-dialog button');
  }
  if(!studioInstalled)assert.equal(diagrams.size,3);
  assert.deepEqual(await state(),beforePreview,'previewing all three maps preserves the table');
  await click('#apply-map');assert.equal((await state()).layout.map,'A');
  await screenshot('04a-deployment.png');
  await js('(()=>{const s=document.querySelector("[data-field=first]");s.value="marines";s.dispatchEvent(new Event("change",{bubbles:true}))})()');
  await click('[data-act=start]');assert.equal((await state()).rules.status,'playing');
  for(let i=0;i<6;i++){
    await click('[data-act=next]');
    if((await state()).rules.overwatch?.stage==='offer')await click('[data-act=overwatch-decline]');
  }
  assert.equal((await state()).rules.active,'orks');await screenshot('04-turn.png');
  const saved=await state();await send('Page.reload');await until(()=>js('!!window.tabletopView'));assert.deepEqual(await state(),saved);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,stats,vehicleRuler:{baseGap,groundGap},verified:[...(studioInstalled?['photo','studio gallery']:[]),'two-sided board','3D drag','routed movement','eye-level view','undo/redo','casualty','camera','ruler','vehicle picking, rotated base bounds and reload','deployment','turn handoff','reload'],evidence},null,2));
  function approx(a,b){assert.ok(Math.abs(a-b)<1e-6)}
} finally {ws?.close();browser?.kill();host?.kill()}
