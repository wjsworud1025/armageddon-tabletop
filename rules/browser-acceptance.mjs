// node tabletop/rules/browser-acceptance.mjs (Windows, installed Chrome/Edge)
// The test uses the game's ordinary save-import, board, roster and battle UI.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {existsSync,readFileSync,mkdtempSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createTable} from '../data/catalog.mjs';
import {layoutGeometry,objectiveAreas} from '../layouts.mjs';
import {getProfile} from './profiles.mjs';
import {newBattle,startBattle} from './battle.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const server=createServer(async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    assert.ok(path.startsWith(root+sep));
    const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png'};
    const body=await readFile(path);
    res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream'});
    res.end(body);
  } catch (error) {console.error('Static file',req.url,error.message);res.writeHead(404);res.end();}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const url='http://127.0.0.1:'+server.address().port+(existsSync(join(root,'reference','starter-set.jpg'))?'/?studio=1':'');
const profile=mkdtempSync(join(tmpdir(),'patrol-acceptance-'));
const chrome=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
assert.ok(chrome);
const browser=spawn(chrome,['--headless=new','--no-first-run','--disable-default-apps','--disable-background-networking','--disable-extensions','--use-angle=swiftshader','--enable-unsafe-swiftshader','--remote-debugging-port=0','--user-data-dir='+profile,'--window-size=1300,900','about:blank'],{stdio:'ignore',windowsHide:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,timeout=60000){
  const end=Date.now()+timeout;
  while(Date.now()<end){const value=await check();if(value)return value;await delay(120);}
  throw Error('Waiting for '+check.toString().slice(0,120));
}
let ws;
try {
  const fp=join(profile,'DevToolsActivePort');
  const port=await until(()=>existsSync(fp)&&readFileSync(fp,'utf8').split(/\s/)[0],20000);
  const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  ws=new WebSocket(pages.find(x=>x.type==='page').webSocketDebuggerUrl);
  await once(ws,'open');
  const pending=new Map(),errors=[];
  let id=0;
  ws.onmessage=event=>{
    const msg=JSON.parse(event.data);
    if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.exception?.description||msg.params.exceptionDetails.text);
    if(msg.method==='Runtime.consoleAPICalled'&&msg.params.type==='error')errors.push(msg.params.args.map(a=>a.description||a.value).join(' '));
    if(msg.id&&pending.has(msg.id)){
      const {yes,no}=pending.get(msg.id);pending.delete(msg.id);
      if(msg.error)no(Error(msg.error.message));else yes(msg.result);
    }
  };
  const send=(method,params={})=>new Promise((yes,no)=>{pending.set(++id,{yes,no});ws.send(JSON.stringify({id,method,params}));});
  async function js(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
  function click(selector){return js('(()=>{const el=document.querySelector('+JSON.stringify(selector)+'); if(!el || el.disabled)throw Error("Missing or disabled "+'+JSON.stringify(selector)+'); el.click()})()');}
  function choose(field,value){return js('(()=>{const el=document.querySelector('+JSON.stringify('[data-field="'+field+'"]')+'); el.value='+JSON.stringify(value)+'; el.dispatchEvent(new Event("change",{bubbles:true}))})()');}
  const button=key=>'[data-act="'+key+'"]';
  const disabled=key=>js('document.querySelector('+JSON.stringify(button(key))+')?.disabled');
  const state=()=>js('tabletopView.state()');
  async function upload(save) {
    await js('(()=>{const input=document.querySelector("#file"),dt=new DataTransfer(); dt.items.add(new File(['+JSON.stringify(JSON.stringify(save))+'],"battle-test.json",{type:"application/json"}));input.files=dt.files;input.dispatchEvent(new Event("change",{bubbles:true}))})()');
    await until(()=>js('document.querySelector("#file").value===""'));
  }
  await send('Runtime.enable');await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:"{const listen=EventTarget.prototype.addEventListener;EventTarget.prototype.addEventListener=function(type,...args){if(type==='error' && this instanceof HTMLImageElement){listen.call(this,'error',()=>console.error('Image decode failed '+this.src));}return listen.call(this,type,...args)}}"});await send('Page.navigate',{url});
  await until(async()=>{if(errors.length)throw Error(errors.join('\n'));return js('!!window.tabletopView');},120000);
  await click('[data-tab=battle]');
  assert.equal(await js('!!document.querySelector("[data-act=next]")'),false);
  const save=await state();
  const template=createTable();
  const centroid=arr=>arr.reduce(([x,y],[a,b])=>[x+a/arr.length,y+b/arr.length],[0,0]);
  const areas=layoutGeometry('A').areas;
  const positions=areas.map(a=>centroid(a.polygon));
  const actor=template.pieces.find(p=>p.kind==='captain');
  const victim=template.pieces.find(p=>p.kind==='gretchin');
  const scouts=template.pieces.filter(p=>p.kind==='vanguard').slice(0,2);
  const rifles=template.pieces.filter(p=>p.kind==='intercessor').slice(0,2);
  const preset=new Map([[actor.id,[0,0]],[victim.id,[5,0]],[scouts[0].id,positions[2]],[scouts[1].id,positions[3]],
    [rifles[0].id,[1,-2]],[rifles[1].id,[2,-2]]]);
  for(const rec of save.pieces){
    const item=template.pieces.find(p=>p.id===rec.id);
    if(item.faction==='terrain')continue;
    const baseline=item.faction==='orks'?[20,-13]:[-20,13];
    [rec.x,rec.z]=preset.get(rec.id)||baseline;
  }
  save.layout={map:'A',blue:'marines'};
  const fixtures={...template,layout:save.layout,pieces:template.pieces.map(p=>({...p,...save.pieces.find(r=>r.id===p.id)}))};
  assert.equal(objectiveAreas(fixtures).length,4);
  await upload(save);
  await until(async()=>(await state()).layout?.map==='A');
  await choose('first','marines');await click(button('start'));
  let s=await state();assert.equal(s.rules.active,'marines');assert.equal(s.rules.step,0);
  await choose('fighter',actor.id);
  assert.equal(await disabled('shock'),true);
  await click(button('next'));await click(button('next'));
  await choose('target',victim.id);
  assert.equal(await disabled('attack'),false);
  // Real attack pipeline with 6 to hit, 6 to wound, natural 1 to save.
  await js('window.acceptanceRandom=Math.random;{const samples=[.95,.95,.01];Math.random=()=>samples.shift()??.5;}');
  await click(button('attack'));await js('Math.random=window.acceptanceRandom');
  s=await state();assert.equal(s.rules.hp[victim.id],0);
  assert.ok(s.pieces.find(p=>p.id===victim.id).removed);
  assert.equal(await disabled('attack'),true);
  await click('#undo');s=await state();
  assert.equal(s.pieces.find(p=>p.id===victim.id).removed,false);
  assert.ok((s.rules.hp[victim.id]??getProfile(victim).wounds)>0);
  await click('#redo');assert.equal((await state()).rules.hp[victim.id],0);
  await click('[data-tab=battle]');
  const previous=await state();
  for(const bad of [{step:'<b>1</b>'},{units:{captain:{attacks:'invalid'}}}]) {
    const corrupt=structuredClone(previous);
    corrupt.rules={...corrupt.rules,...bad};corrupt.pieces[0].x=17;
    await upload(corrupt);
    assert.deepEqual(await state(),previous);
  }
  await choose('fighter',rifles[0].id);
  const otherGrot=template.pieces.find(p=>p.kind==='gretchin' && p.id!==victim.id);
  await choose('target',otherGrot.id);
  await js('Math.random=()=>.01');
  await click(button('volley'));await js('Math.random=window.acceptanceRandom');
  s=await state();
  for(const rifle of rifles) assert.equal(s.rules.units.intercessor.attacks[rifle.id].length,1);
  assert.equal(await disabled('attack'),true);
  await js('(()=>{for(let i=0;i<58;i++){const b=document.querySelector("[data-act=next]"); if(!b || b.disabled)throw Error("Missing phase "+i);b.click();}})()');
  s=await state();
  assert.equal(s.rules.status,'finished');assert.equal(s.rules.round,5);
  assert.equal(Object.keys(s.rules.objectives).length,4);
  assert.equal(s.rules.vp.marines,60);
  assert.equal(s.rules.vp.orks,0);
  const finalVP=s.rules.vp;
  assert.match(await js('document.querySelector("#rules").textContent'),/스페이스 마린 승리/);
  await send('Page.reload');
  await until(()=>js('!!window.tabletopView'));
  assert.deepEqual((await state()).rules,s.rules);
  // Two grots throw one bomb each; both miss. Casualties come only after the
  // entire unit finishes, and save/reload and undo must retain the rolled pool.
  const hazardSave=structuredClone(save);
  const bombers=template.pieces.filter(p=>p.kind==='gretchin').slice(0,2);
  const drill=new Map([[actor.id,[0,0]],[bombers[0].id,[5,0]],[bombers[1].id,[5,1]]]);
  for(const rec of hazardSave.pieces) {
    const location=drill.get(rec.id);
    if (location) [rec.x,rec.z]=location;
    rec.removed=!location;
  }
  hazardSave.rules={...startBattle(newBattle(),'orks',5),step:2};
  await upload(hazardSave);
  await until(async()=>(await state()).rules.active==='orks' && (await state()).rules.step===2);
  await click('[data-tab=battle]');
  await choose('fighter',bombers[0].id);
  await choose('weapon','1');
  await choose('target',actor.id);
  await js('window.acceptanceRandom=Math.random;Math.random=()=>.01');
  await click(button('volley'));
  assert.equal((await state()).rules.hazard.count,2);
  assert.equal(await disabled('next'),true);
  await js('let hazardDice=[.01,.4];Math.random=()=>hazardDice.shift()??.9');
  await click(button('hazard-roll'));
  await js('Math.random=window.acceptanceRandom');
  assert.deepEqual((await state()).rules.hazard.dice,[1,3]);
  await send('Page.reload');await until(()=>js('!!window.tabletopView'));
  await click('[data-tab=battle]');
  await click(button('hazard-wound-'+bombers[1].id));
  s=await state();
  assert.ok(s.pieces.find(p=>p.id===bombers[1].id).removed);
  assert.equal(s.rules.hazard,null);
  await click('#undo');s=await state();
  assert.equal(s.pieces.find(p=>p.id===bombers[1].id).removed,false);
  assert.deepEqual(s.rules.hazard.dice,[1,3]);
  await click('#redo');assert.equal((await state()).rules.hp[bombers[1].id],0);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,areas:4,rounds:5,winner:'marines',vp:finalVP,casualtyUndoRedo:true,corruptImportsRejected:2,volley:true,persisted:true,hazardousVolleyUndoRedo:true}));
} finally {ws?.close();browser.kill();server.closeAllConnections();server.close();}
