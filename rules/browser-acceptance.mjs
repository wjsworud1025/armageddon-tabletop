// node tabletop/rules/browser-acceptance.mjs (Windows, installed Chrome/Edge)
// The test uses the game's ordinary save-import, board, roster and battle UI.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {existsSync,readFileSync,mkdtempSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createTable} from '../data/catalog.mjs';
import {layoutGeometry,objectiveAreas} from '../layouts.mjs';
import {getProfile} from './profiles.mjs';
import {newBattle,startBattle} from './battle.mjs';
import {checkShootingReactions} from './browser-shooting-reactions.mjs';
import {checkCoreStratagems} from './browser-core-stratagems.mjs';
import {checkTraining} from './browser-training.mjs';
import {checkTrainingTwo} from './browser-training-two.mjs';
import {checkTrainingThree} from './browser-training-three.mjs';
import {checkTrainingFour} from './browser-training-four.mjs';
import {checkPatrolSetup} from './browser-patrol-setup.mjs';
import {checkRuinSight} from '../tests/browser-ruin-sight.mjs';
import {checkShooterSight,sightButton,inspectButton} from '../tests/browser-shooter-sight.mjs';
import {checkPlungingFire} from '../tests/browser-plunging-fire.mjs';
import {checkAreaCover} from '../tests/browser-area-cover.mjs';

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
const localArt=!process.argv.includes('--public') && existsSync(join(root,'reference','starter-set.jpg'));
const url='http://127.0.0.1:'+server.address().port+(localArt?'/?studio=1':'');
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
  const trainingTools={save,upload,click,state,js,send,reload:async()=>{
    await send('Page.reload');await until(()=>js('!!window.tabletopView'));await click('[data-tab=battle]');
  }};
  await checkRuinSight(trainingTools);
  console.log('Passed both surface picks through the ruin window and into its crossbar');
  await checkShooterSight(trainingTools);
  console.log('Passed individual sight records, unit range, declaration locks and persistence');
  const shootingTools={...trainingTools,screenshot:async name=>{
    const folder=join(root,'.build','qa',localArt?'browser-studio':'browser-public');
    await mkdir(folder,{recursive:true});
    const {data}=await send('Page.captureScreenshot',{format:'png'});
    await writeFile(join(folder,name),Buffer.from(data,'base64'));
  }};
  await checkAreaCover(shootingTools);
  console.log('Passed automatic terrain cover and separate cover decisions for each shooter');
  await checkPlungingFire(shootingTools);
  console.log('Passed upper-floor and ground shooters, locked BS packets, and hit-roll outcomes');
  await checkPatrolSetup(trainingTools);
  console.log('Passed the official mission sequence, private formations, deployment and separate roll-offs');
  await checkTraining(trainingTools);
  console.log('Passed the handbook duel, both winners, save import, reload and table restoration');
  await checkTrainingTwo(trainingTools);
  console.log('Passed the second handbook battlefield, model movement, undo, reload and restoration');
  await checkTrainingThree(trainingTools);
  console.log('Passed the shooting battlefield, deployment zones, undo, reload and table restoration');
  await checkTrainingFour(trainingTools);
  console.log('Passed the strategic objective battlefield, command scoring, saved turns and victory');
  await checkCoreStratagems({save,upload,choose,click,button,state,js,
    reload:async()=>{await send('Page.reload');await until(()=>js('!!window.tabletopView'));await click('[data-tab=battle]');}});
  assert.deepEqual(errors,[]);
  console.log('Passed core stratagem UI, Precision allocation, save import, reload and undo');
  const template=createTable();
  const centroid=arr=>arr.reduce(([x,y],[a,b])=>[x+a/arr.length,y+b/arr.length],[0,0]);
  const areas=layoutGeometry('A').areas;
  const positions=areas.map(a=>centroid(a.polygon));
  const actor=template.pieces.find(p=>p.kind==='captain');
  const victim=template.pieces.find(p=>p.kind==='gretchin');
  const scouts=template.pieces.filter(p=>p.kind==='landSpeeder'||p.kind==='librarian');
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
  assert.equal(await disabled('attack'),true);
  await click(sightButton(actor.id,victim.id));
  assert.equal(await disabled('attack'),false);
  // Real attack pipeline with 6 to hit, 6 to wound, natural 1 to save.
  await js('window.acceptanceRandom=Math.random;{const samples=[.95,.95,.01];Math.random=()=>samples.shift()??.5;}');
  await click(button('attack'));
  assert.equal(await disabled('next'),true);
  assert.equal((await state()).rules.hp[victim.id],undefined);
  await click(button('lock'));await click(button('resolve-0'));await js('Math.random=window.acceptanceRandom');
  s=await state();assert.equal(s.rules.hp[victim.id],0);
  assert.ok(s.pieces.find(p=>p.id===victim.id).removed);
  assert.notEqual(await disabled('attack'),false);
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
  if((await state()).rules.shootingReaction)await click(button('reaction-decline'));
  await choose('fighter',rifles[0].id);
  const otherGrot=template.pieces.find(p=>p.kind==='gretchin' && p.id!==victim.id);
  await choose('target',otherGrot.id);
  const beforeSight=await state();
  await click(inspectButton(rifles[0].id,otherGrot.id));
  const visible=id=>js('tabletopView.pose('+JSON.stringify(id)+') !== null');
  for(const id of [rifles[0].id,rifles[1].id,'gretchin-3'])assert.equal(await visible(id),false,id);
  for(const id of [otherGrot.id,actor.id,'generatorShrine-1'])assert.equal(await visible(id),true,id);
  assert.deepEqual(await state(),beforeSight,'Sight inspection cannot change the battle');
  await choose('target','gretchin-3');
  assert.equal(await visible(rifles[1].id),true,'Changing target restores the shared table');
  await choose('target',otherGrot.id);
  for(const p of rifles)await click(sightButton(p.id,otherGrot.id));
  await click(button('volley'));
  await choose('fighter',rifles[1].id);await choose('weapon','3');
  const secondUnit=template.pieces.find(p=>p.kind==='boy');
  await choose('target',secondUnit.id);await click(sightButton(rifles[1].id,secondUnit.id));await click(button('attack'));
  await click(button('lock'));
  const declared=(await state()).rules.declaration;
  assert.equal(declared.locked,true);assert.ok(declared.rows.some(r=>r.target==='boy-0'));
  await send('Page.reload');await until(()=>js('!!window.tabletopView'));await click('[data-tab=battle]');
  assert.deepEqual((await state()).rules.declaration,declared);
  await js('window.acceptanceRandom=Math.random; Math.random=()=>.01');
  await click(button('resolve-0'));
  const nextRow=(await state()).rules.declaration.rows.findIndex(r=>!r.done);
  await click(button('resolve-'+nextRow));await js('Math.random=window.acceptanceRandom');
  s=await state();
  assert.equal(s.rules.units.intercessor.attacks[rifles[0].id].length,1);
  assert.equal(s.rules.units.intercessor.attacks[rifles[1].id].length,2);
  if(s.rules.shootingReaction)await click(button('reaction-decline'));
  await choose('fighter',rifles[1].id);
  assert.equal(await disabled('attack'),true);
  // In this five-round scoring fixture all combatants stay out of engagement.
  // Only press the actual optional movement pass. A mandatory combat blocks it.
  async function advancePhases(count){
    await js('(()=>{for(let i=0;i<'+count+';i++){let next=document.querySelector("[data-act=next]");'+
      'for(let side=0;side<4&&next?.disabled;side++){const pass=document.querySelector("[data-act=fight-pass]");'+
      'if(!pass||pass.disabled||!/(밀착|재정비) 마침/.test(pass.textContent))break;pass.click();next=document.querySelector("[data-act=next]");}'+
      'if(!next||next.disabled)throw Error("Required action at phase transition "+i+" · "+document.querySelector("#rules .br-phase")?.textContent);next.click();}})()');
  }
  await advancePhases(3);
  assert.equal((await state()).rules.step,5);assert.equal(await disabled('next'),true);
  await click(button('coherency-'+rifles[0].id));assert.equal(await disabled('next'),true);
  await click('#undo');assert.equal((await state()).pieces.find(p=>p.id===rifles[0].id).removed,false);
  await click('#redo');await send('Page.reload');await until(()=>js('!!window.tabletopView'));await click('[data-tab=battle]');
  await click(button('coherency-'+rifles[1].id));assert.equal(await disabled('next'),false);
  await advancePhases(55);
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
  for(const p of bombers)await click(sightButton(p.id,actor.id));
  await js('window.acceptanceRandom=Math.random;Math.random=()=>.01');
  await click(button('volley'));
  assert.ok(!(await state()).rules.hazard);
  await click(button('lock'));await click(button('resolve-0'));
  assert.equal((await state()).rules.hazard.count,2);
  assert.equal(await disabled('next'),true);
  await js('let hazardDice=[.01,.4];Math.random=()=>hazardDice.shift()??.9');
  await click(button('hazard-roll'));
  await js('Math.random=window.acceptanceRandom');
  const hazardOffer=await state();assert.deepEqual(hazardOffer.rules.hazard.commandDice,[1,3]);
  assert.equal(hazardOffer.pieces.find(p=>p.id===bombers[1].id).removed,false);
  const badHazard=structuredClone(hazardOffer);badHazard.rules.hazard.commandDice[0]='invalid';
  await upload(badHazard);assert.deepEqual(await state(),hazardOffer);
  await send('Page.reload');await until(()=>js('!!window.tabletopView'));await click('[data-tab=battle]');
  assert.deepEqual((await state()).rules.hazard.commandDice,[1,3]);
  await choose('hazard-die','0');await js('window.acceptanceRandom=Math.random;Math.random=()=>.99');
  await click(button('hazard-command'));await js('Math.random=window.acceptanceRandom');
  s=await state();assert.equal(s.rules.hazard,null);assert.equal(s.rules.cp.orks,hazardOffer.rules.cp.orks-1);
  assert.equal(s.pieces.find(p=>p.id===bombers[1].id).removed,false);
  assert.match(s.rules.last,/1번 1 → 6/);
  await click('#undo');assert.deepEqual((await state()).rules.hazard.commandDice,[1,3]);
  await click(button('hazard-keep'));assert.equal((await state()).rules.cp.orks,hazardOffer.rules.cp.orks);
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

  // These removed pieces supply read-only screen projections for exact board
  // positions. Use genuine pointer events for selection and every drag.
  const near='librarian-1',far='landSpeeder-1';
  const movementFixture=(locations,units,team)=>{
    const fixture=structuredClone(save);
    for(const rec of fixture.pieces) {
      rec.removed=!units.includes(rec.id);
      if(locations[rec.id]) [rec.x,rec.z]=locations[rec.id];
    }
    fixture.layout=null;
    fixture.rules={...startBattle(newBattle(),team,5),step:1};
    return fixture;
  };
  const at=(id)=>js('(()=>{const p=tabletopView.screen('+JSON.stringify(id)+'), r=document.querySelector("#view").getBoundingClientRect();return {x:p.x+r.x,y:p.y+r.y};})()');
  const mouse=(type,p,buttons)=>send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',buttons,clickCount:1});
  async function drag(id,anchor) {
    const from=await at(id),to=await at(anchor);
    await mouse('mousePressed',from,1);await mouse('mouseMoved',to,1);await mouse('mouseReleased',to,0);
  }
  const coords=(snap,id)=>{const p=snap.pieces.find(rec=>rec.id===id);return [p.x,p.z];};
  const nearX=(snap,id,x)=>assert.ok(Math.abs(coords(snap,id)[0]-x)<.15,'Expected '+id+' at x='+x+', observed '+coords(snap,id));
  const drillMove=movementFixture({[actor.id]:[0,0],[near]:[3,0],[far]:[10,0]},[actor.id],'marines');
  await upload(drillMove);await click('[data-tab=battle]');await click('#camera');
  await choose('fighter',actor.id);await click(button('normal'));
  assert.equal((await state()).rules.movePlan.unit,'captain');
  assert.equal(await disabled('next'),true);
  await drag(actor.id,near);
  s=await state();nearX(s,actor.id,3);assert.equal(s.rules.movePlan.paths[actor.id].length,1);
  const draft=structuredClone(s.rules.movePlan);
  await drag(actor.id,far);
  s=await state();nearX(s,actor.id,3);assert.deepEqual(s.rules.movePlan,draft);
  assert.match(await js('document.getElementById("notice").textContent'),/누적 이동 거리/);
  await click(button('move-rewind'));s=await state();nearX(s,actor.id,0);assert.deepEqual(s.rules.movePlan.paths,{});
  await click('#undo');s=await state();nearX(s,actor.id,3);assert.deepEqual(s.rules.movePlan,draft);
  await send('Page.reload');await until(()=>js('!!window.tabletopView'));await click('[data-tab=battle]');
  assert.deepEqual((await state()).rules.movePlan,draft);assert.equal(await disabled('next'),true);
  await click(button('move-finish'));s=await state();assert.equal(s.rules.movePlan,null);nearX(s,actor.id,3);
  await click('#undo');assert.deepEqual((await state()).rules.movePlan,draft);
  await click('#redo');assert.equal((await state()).rules.movePlan,null);
  await click(button('next'));assert.equal((await state()).rules.step,2);

  const escapes=movementFixture({[actor.id]:[0,0],[bombers[0].id]:[-2.1,0],[bombers[1].id]:[-2.1,1.25],[near]:[-6,1.25]},
    [actor.id,bombers[0].id,bombers[1].id],'orks');
  await upload(escapes);await click('[data-tab=battle]');await click('#camera');
  await choose('fighter',bombers[0].id);await click(button('desperate'));
  s=await state();assert.equal(s.rules.hazard.reason,'escape');assert.equal(s.rules.hazard.count,2);
  assert.equal(await disabled('move-finish'),true);
  await js('window.acceptanceRandom=Math.random;{const dice=[.01,.8];Math.random=()=>dice.shift()??.8}');
  await click(button('hazard-roll'));await js('Math.random=window.acceptanceRandom');
  assert.deepEqual((await state()).rules.hazard.commandDice,[1,5]);
  assert.equal((await state()).rules.movePlan.desperateEscapeResolved,false);
  await choose('hazard-die','0');await js('Math.random=()=>.20');
  await click(button('hazard-command'));await js('Math.random=window.acceptanceRandom');
  assert.deepEqual((await state()).rules.hazard.dice,[2,5]);
  assert.equal((await state()).rules.cp.orks,0);
  await click(button('hazard-wound-'+bombers[0].id));
  s=await state();assert.equal(s.rules.movePlan.desperateEscapeResolved,true);
  assert.equal(s.pieces.find(p=>p.id===bombers[0].id).removed,true);
  await drag(bombers[1].id,near);s=await state();nearX(s,bombers[1].id,-6);
  await js('Math.random=()=>.01');await click(button('move-finish'));await js('Math.random=window.acceptanceRandom');
  s=await state();assert.equal(s.rules.movePlan,null);assert.equal(s.rules.units.gretchin.shocked,true);
  assert.match(s.logs.at(-1),/전장 충격.*실패/);

  const chargeFixture=(team,enemyCharged=false)=>{
    const fixture=movementFixture({[actor.id]:[0,0],[victim.id]:[6,0],[near]:[1.5,0],[far]:[4.2,0]},
      [actor.id,victim.id],team);
    fixture.rules.step=3;fixture.rules.cp.marines=3;
    if(enemyCharged) fixture.rules.units.gretchin={charge:7,charged:true,chargeTracked:true};
    return fixture;
  };
  async function loadCharge(team,enemyCharged=false){
    await upload(chargeFixture(team,enemyCharged));await click('[data-tab=battle]');
    await click('#home');await click('#camera');await choose('fighter',actor.id);
  }
  async function declareCharge(mode,value){
    await js('window.chargeRandom=Math.random;Math.random=()=>'+value);
    try{await click(button('charge-'+mode));}finally{await js('Math.random=window.chargeRandom');}
  }
  async function selectGrots(){
    await click('[data-charge-target="gretchin"]');await click(button('charge-targets'));
  }
  await loadCharge('marines');await declareCharge('normal',0);
  s=await state();assert.deepEqual(s.rules.chargePlan.dice,[1,1]);assert.equal(await disabled('charge-targets'),true);
  await click(button('charge-cancel'));s=await state();assert.equal(s.rules.chargePlan,null);
  assert.equal(s.rules.units.captain.charge,2);assert.ok(!s.rules.units.captain.charged);
  assert.equal(await disabled('charge-normal'),true);assert.equal(await js('!!document.querySelector("[data-act=charge-legacy]")'),false);
  await loadCharge('marines');await declareCharge('normal',.5);await selectGrots();
  assert.equal(await disabled('next'),true);
  await drag(actor.id,near);s=await state();nearX(s,actor.id,1.5);
  const shortCharge=structuredClone(s.rules.chargePlan);
  await click(button('charge-finish'));s=await state();assert.deepEqual(s.rules.chargePlan,shortCharge);
  assert.match(await js('document.getElementById("notice").textContent'),/교전/);
  await click(button('charge-cancel'));s=await state();nearX(s,actor.id,0);assert.equal(s.rules.chargePlan,null);
  assert.equal(await disabled('charge-normal'),true);
  await click('#undo');s=await state();nearX(s,actor.id,1.5);assert.deepEqual(s.rules.chargePlan,shortCharge);
  await click(button('charge-rewind'));s=await state();nearX(s,actor.id,0);assert.deepEqual(s.rules.chargePlan.paths,{});
  await drag(actor.id,far);s=await state();nearX(s,actor.id,4.2);
  const validCharge=structuredClone(s.rules.chargePlan);
  assert.equal(validCharge.paths[actor.id].length,1);
  await send('Page.reload');await until(()=>js('!!window.tabletopView'));await click('[data-tab=battle]');
  assert.deepEqual((await state()).rules.chargePlan,validCharge);
  await click(button('charge-finish'));s=await state();
  assert.equal(s.rules.step,3);assert.equal(s.rules.chargePlan,null);assert.equal(s.rules.units.captain.charged,true);
  assert.match(s.logs.at(-1),/선제 전투/);
  await click('#undo');assert.deepEqual((await state()).rules.chargePlan,validCharge);
  await click('#redo');assert.equal((await state()).rules.units.captain.charged,true);
  for(const [mode,cost,limit] of [['masterOfBattle',0,6],['leapToDefend',1,12],['intoTheFray',2,6]]){
    await loadCharge('orks',mode==='leapToDefend');
    assert.equal(await js('!!document.querySelector('+JSON.stringify(button('charge-'+mode))+')'),false);
    await click(button('charge-window'));await declareCharge(mode,.99);s=await state();
    assert.equal(s.rules.chargePlan.mode,mode);assert.deepEqual(s.rules.chargePlan.dice,[6,6]);
    assert.equal(s.rules.chargePlan.roll,limit);assert.equal(s.rules.cp.marines,3-cost);
    await selectGrots();await drag(actor.id,far);s=await state();nearX(s,actor.id,4.2);
    await click(button('charge-finish'));s=await state();assert.equal(s.rules.step,3);
    assert.equal(s.rules.units.captain.charged,true);assert.equal(s.rules.cp.marines,3-cost);
  }
  const fightSave=movementFixture({[actor.id]:[0,0],[victim.id]:[4,0],[near]:[1.4,0],[far]:[2.2,0]},
    [actor.id,victim.id],'marines');
  fightSave.rules.step=4;fightSave.rules.units.captain={charged:true,chargeTracked:true,charge:7};
  await upload(fightSave);await click('[data-tab=battle]');await click('#home');await click('#camera');
  await choose('fighter',actor.id);assert.equal(await disabled('next'),true);assert.equal(await disabled('attack'),true);
  await choose('fight-unit','captain');await click(button('fight-move'));
  await drag(actor.id,near);s=await state();nearX(s,actor.id,1.4);
  const pileDraft=structuredClone(s.rules.fightPlan);
  assert.deepEqual(pileDraft.targets,['gretchin']);assert.equal(pileDraft.paths[actor.id].length,1);
  await click(button('combat-path-cancel'));s=await state();nearX(s,actor.id,0);assert.equal(s.rules.fightPlan,null);
  await click('#undo');s=await state();nearX(s,actor.id,1.4);assert.deepEqual(s.rules.fightPlan,pileDraft);
  await send('Page.reload');await until(()=>js('!!window.tabletopView'));await click('[data-tab=battle]');
  assert.deepEqual((await state()).rules.fightPlan,pileDraft);assert.equal(await disabled('next'),true);
  const badFight=structuredClone(await state());badFight.rules.fightSequence.reactions=['<script>'];badFight.pieces[0].x=-10;
  const beforeBad=await state();await upload(badFight);assert.deepEqual(await state(),beforeBad);
  await click(button('combat-path-finish'));s=await state();
  assert.equal(s.rules.fightPlan,null);assert.equal(s.rules.fightSequence.team,'orks');assert.deepEqual(s.rules.fightSequence.piled,['captain']);
  await click(button('fight-pass'));s=await state();assert.equal(s.rules.fightSequence.stage,'first');
  assert.deepEqual(s.rules.fightSequence.engagedAtFightStart,['captain','gretchin']);
  assert.equal(await js('!!document.querySelector("[data-act=fight-pass]")'),false);
  for(const [unit,attacker,defender] of [['captain',actor,victim],['gretchin',victim,actor]]){
    await choose('fight-unit',unit);await click(button('fight-normal'));
    assert.equal((await state()).rules.fightSequence.active.unit,unit);assert.equal(await disabled('fight-finish'),true);
    await choose('fighter',defender.id);await choose('target',attacker.id);assert.equal(await disabled('attack'),true);
    await choose('fighter',attacker.id);await choose('target',defender.id);
    await click(button('attack'));await click(button('lock'));s=await state();
    assert.equal(s.rules.declaration.locked,true);assert.equal(s.rules.declaration.unit,unit);
    assert.equal(await disabled('fight-finish'),true);assert.equal(await disabled('next'),true);
    if(unit==='captain'){
      await send('Page.reload');await until(()=>js('!!window.tabletopView'));await click('[data-tab=battle]');
      assert.deepEqual((await state()).rules.declaration,s.rules.declaration);
      assert.deepEqual((await state()).rules.fightSequence,s.rules.fightSequence);
    }
    await js('window.fightRandom=Math.random;Math.random=()=>.01');
    try{await click(button('resolve-0'));}finally{await js('Math.random=window.fightRandom');}
    s=await state();assert.equal(s.rules.units[unit].finishedAttack,4);assert.equal(s.rules.declaration,null);
    await click(button('fight-finish'));
  }
  s=await state();assert.equal(s.rules.fightSequence.stage,'consolidate');assert.deepEqual(s.rules.fightSequence.fought,['captain','gretchin']);
  await choose('fight-unit','captain');await click(button('fight-move'));
  assert.equal((await state()).rules.fightPlan.mode,'ongoing');
  await click('#home');await click('#camera');await drag(actor.id,far);s=await state();nearX(s,actor.id,2.2);
  await click(button('combat-path-finish'));await click(button('fight-pass'));s=await state();
  assert.equal(s.rules.fightSequence.stage,'done');assert.equal(await disabled('next'),false);
  await click(button('next'));s=await state();assert.equal(s.rules.step,5);assert.ok(!s.rules.fightSequence);
  await click(button('next'));s=await state();assert.equal(s.rules.step,0);assert.equal(s.rules.active,'orks');

  // Round two, map A. Two surviving Intercessors and their attached Librarian
  // enter at the left battlefield edge. Removed models mark pointer destinations.
  const librarian=template.pieces.find(p=>p.kind==='librarian');
  const arrivals=[rifles[0].id,rifles[1].id,librarian.id];
  const legalMarkers=['vanguard-1','vanguard-2','vanguard-3'];
  const blockedMarkers=['vanguard-4','vanguard-5','captain-1'];
  const entryPositions=Object.fromEntries(arrivals.map((id,i)=>[id,[-13,-2+i*2]]));
  legalMarkers.forEach((id,i)=>{entryPositions[id]=[-19,-10+i*2];});
  blockedMarkers.forEach((id,i)=>{entryPositions[id]=[-19,2*i];});
  entryPositions[victim.id]=[-14.5,5];
  const entry=movementFixture(entryPositions,[victim.id],'marines');
  entry.layout={map:'A',blue:'marines'};entry.rules.round=2;
  entry.rules.attachments[librarian.id]='intercessor';entry.rules.reserves.intercessor=arrivals;
  await upload(entry);await click('[data-tab=battle]');await click('#home');await click('#camera');
  await choose('fighter',librarian.id);await click(button('ingress'));s=await state();
  assert.equal(s.rules.reinforcePlan?.unit,'intercessor');assert.deepEqual(s.rules.reserves.intercessor,arrivals);
  assert.deepEqual(Object.keys(s.rules.reinforcePlan.origins).sort(),[...arrivals].sort());
  assert.equal(await disabled('next'),true);
  for(const id of arrivals)assert.equal(s.pieces.find(p=>p.id===id).removed,false);
  for(const [i,id] of arrivals.entries())await drag(id,blockedMarkers[i]);
  s=await state();
  const invalidEntry=structuredClone(s);
  await click(button('reinforce-finish'));s=await state();
  assert.deepEqual(s.rules.reinforcePlan,invalidEntry.rules.reinforcePlan);
  assert.deepEqual(s.rules.reserves.intercessor,arrivals);assert.ok(!s.rules.units.intercessor?.reinforcing);
  assert.match(await js('document.querySelector("#rules [aria-live=polite]")?.textContent||""'),/8″/);
  await click(button('reinforce-cancel'));s=await state();
  assert.equal(s.rules.reinforcePlan,null);assert.deepEqual(s.rules.reserves.intercessor,arrivals);
  for(const id of arrivals){
    assert.equal(s.pieces.find(p=>p.id===id).removed,true);
    assert.deepEqual(coords(s,id),entryPositions[id]);
  }
  await click('#undo');s=await state();assert.deepEqual(s.rules.reinforcePlan,invalidEntry.rules.reinforcePlan);
  await send('Page.reload');await until(()=>js('!!window.tabletopView'));await click('[data-tab=battle]');
  s=await state();assert.deepEqual(s.rules.reinforcePlan,invalidEntry.rules.reinforcePlan);
  assert.deepEqual(s.rules.reserves.intercessor,arrivals);assert.equal(await disabled('next'),true);
  for(const id of arrivals)assert.deepEqual(coords(s,id),coords(invalidEntry,id));
  await click('#home');await click('#camera');
  for(const [i,id] of arrivals.entries())await drag(id,legalMarkers[i]);
  s=await state();for(const [i,id] of arrivals.entries()){
    assert.ok(Math.hypot(coords(s,id)[0]+19,coords(s,id)[1]-(-10+2*i))<.16,'Reserve placement missed '+id);
  }
  const legalEntry=structuredClone(s.rules.reinforcePlan);
  await click(button('reinforce-finish'));s=await state();
  assert.equal(s.rules.reinforcePlan,null);assert.equal(s.rules.reserves.intercessor,undefined);
  assert.equal(s.rules.units.intercessor.reinforcing,true);assert.equal(s.rules.units.intercessor.movementTracked,true);
  assert.equal(s.rules.attachments[librarian.id],'intercessor');
  for(const id of arrivals)assert.equal(s.pieces.find(p=>p.id===id).removed,false);
  await choose('fighter',librarian.id);assert.equal(await disabled('normal'),true);
  await click('#undo');s=await state();assert.deepEqual(s.rules.reinforcePlan,legalEntry);assert.deepEqual(s.rules.reserves.intercessor,arrivals);
  await click('#redo');s=await state();assert.equal(s.rules.reinforcePlan,null);assert.equal(s.rules.reserves.intercessor,undefined);
  const arrived=arrivals.map(id=>coords(s,id));
  await drag(librarian.id,blockedMarkers[2]);s=await state();
  assert.deepEqual(arrivals.map(id=>coords(s,id)),arrived,'An arriving squad cannot move again in its Movement phase');
  await click(button('next'));assert.equal((await state()).rules.step,2);
  await drag(arrivals[0],blockedMarkers[0]);s=await state();
  assert.deepEqual(arrivals.map(id=>coords(s,id)),arrived,'Ingress prevents another move until the next Charge phase');
  const reactionChecks=await checkShootingReactions({movementFixture,upload,choose,click,button,state,js,drag,
    reload:async()=>{await send('Page.reload');await until(()=>js('!!window.tabletopView'));await click('[data-tab=battle]');}});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,areas:4,rounds:5,winner:'marines',vp:finalVP,casualtyUndoRedo:true,
    corruptImportsRejected:2,volley:true,splitFire:true,lockedDeclarationReload:true,persisted:true,hazardousVolleyUndoRedo:true,
    localArt,movementDrag:true,movementRange:true,movementUndoReload:true,desperateEscape:true,endTurnCoherency:true,
    chargeDrag:true,chargeFailure:true,chargeUndoReload:true,chargeReactions:3,fightDrag:true,fightUndoReload:true,
    fightTurns:2,fightLocked:true,fightConsolidation:true,fightEndTurn:true,corruptFightRejected:true,
    ingressAttached:true,ingressDistance:true,ingressCancelUndoReload:true,ingressCommitted:true,ingressMovementLocked:true,
    hazardReroll:true,escapeHazardReroll:true,...reactionChecks}));
} finally {ws?.close();browser.kill();server.closeAllConnections();server.close();}
