// Run after desktop/build.ps1. Uses the installed Chromium browser and an
// isolated temporary profile so the player's campaign saves are never touched.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {existsSync,mkdtempSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
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
  host=spawn(join(root,'dist','ArmageddonTable.exe'),['--serve'],{windowsHide:true,stdio:'ignore'});
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
  await send('Runtime.enable');await send('Page.enable');await send('Page.navigate',{url:target});
  await until(async()=>{if(errors.length)throw Error(errors.join('; '));return js('!!window.tabletopView')});
  const stats=await js('tabletopView.stats()');assert.equal(stats.pieces,61);
  async function screenshot(name){await delay(500);const img=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(evidence,name),Buffer.from(img.data,'base64'))}
  await screenshot('01-table.png');
  const studioInstalled=await js('!document.querySelector("#appearance").hidden');
  if(studioInstalled)await click('#appearance');
  await delay(400);const meshes=await js('tabletopView.stats()');assert.ok(meshes.triangles>10000);await screenshot('01b-meshes.png');
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
  await click('[data-tab=battle]');await click('#apply-map');assert.equal((await state()).layout.map,'A');
  await screenshot('04a-deployment.png');
  await js('(()=>{const s=document.querySelector("[data-field=first]");s.value="marines";s.dispatchEvent(new Event("change",{bubbles:true}))})()');
  await click('[data-act=start]');assert.equal((await state()).rules.status,'playing');
  for(let i=0;i<6;i++)await click('[data-act=next]');
  assert.equal((await state()).rules.active,'orks');await screenshot('04-turn.png');
  const saved=await state();await send('Page.reload');await until(()=>js('!!window.tabletopView'));assert.deepEqual(await state(),saved);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,stats,verified:[...(studioInstalled?['photo','studio gallery']:[]),'two-sided board','3D drag','routed movement','eye-level view','undo/redo','casualty','camera','ruler','deployment','turn handoff','reload'],evidence},null,2));
  function approx(a,b){assert.ok(Math.abs(a-b)<1e-6)}
} finally {ws?.close();browser?.kill();host?.kill()}
