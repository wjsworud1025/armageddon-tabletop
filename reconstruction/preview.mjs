// Offline developer QA: render the shipped shader through an actual WebGL renderer.
// node tabletop/reconstruction/preview.mjs captain-1 .tmp/captain-review.png
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname,extname,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const [id,out]=process.argv.slice(2);
if(!id||!out)throw Error('Expected a piece ID and an output PNG path');
const fixture=`<style>*{margin:0}body{display:flex}</style><script type="module">
import * as T from '/vendor/three.module.min.js';
import {createTable} from '/data/catalog.mjs';
import {loadReconstruction} from '/reconstruction/mesh.mjs';
const model=await loadReconstruction(T,createTable().pieces.find(p=>p.id===${JSON.stringify(id)}));
if(!model)throw Error('Model unavailable');
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(300,300);renderer.setClearColor(0xffffff);
const scene=new T.Scene();scene.add(model);
const bound=new T.Box3().setFromObject(model),center=bound.getCenter(new T.Vector3()),size=bound.getSize(new T.Vector3());
const extent=Math.max(size.x,size.y,size.z)*.61;
for(const [degrees,pitch] of [[10,8],[25,18],[105,29],[226,78]]){
 const camera=new T.OrthographicCamera(-extent,extent,extent,-extent,.01,100);
 const angle=degrees*Math.PI/180,e=pitch*Math.PI/180;
 camera.position.set(Math.sin(angle)*Math.cos(e),Math.sin(e),Math.cos(angle)*Math.cos(e)).multiplyScalar(15).add(center);
 camera.lookAt(center);renderer.render(scene,camera);
 const img=document.createElement('img');img.src=renderer.domElement.toDataURL();await img.decode();document.body.append(img);
}
window.ready=true;
</script>`;
const server=createServer(async(req,res)=>{
  try{
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(path==='/qa'){res.writeHead(200,{'content-type':'text/html'});res.end(fixture);return;}
    const file=resolve(root,'.'+path);
    if(!file.startsWith(root+sep))throw Error('Outside fixture');
    res.writeHead(200,{'content-type':{'.js':'text/javascript','.mjs':'text/javascript','.webp':'image/webp','.json':'application/json'}[extname(file)]||'application/octet-stream'});
    res.end(await readFile(file));
  } catch{res.end();}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const chrome=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const profile=await mkdtemp(join(tmpdir(),'warhammer-reconstruction-'));
const processHandle=spawn(chrome,['--headless=new','--no-first-run','--disable-extensions','--no-default-browser-check','--use-angle=swiftshader','--enable-unsafe-swiftshader','--remote-debugging-port=0','--user-data-dir='+profile,'--window-size=1200,440','about:blank'],{stdio:'ignore',windowsHide:true});
const delay=ms=>new Promise(done=>setTimeout(done,ms));
async function until(fn){
  const end=Date.now()+60000;while(Date.now()<end){const r=await fn();if(r)return r;await delay(150);}throw Error('Renderer timeout');
}
let ws;
try {
  const fp=join(profile,'DevToolsActivePort');
  const port=await until(async()=>existsSync(fp)&&(await readFile(fp,'utf8')).split(/\s/)[0]);
  const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await once(ws,'open');
  let seq=0;const pending=new Map(),errors=[];
  ws.onmessage=event=>{
    const msg=JSON.parse(event.data);
    if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.exception?.description||msg.params.exceptionDetails.text);
    if(msg.method==='Runtime.consoleAPICalled'&&msg.params.type==='error')errors.push(msg.params.args.map(x=>x.value||x.description).join(' '));
    if(pending.has(msg.id)){const [ok,no]=pending.get(msg.id);pending.delete(msg.id);msg.error?no(Error(msg.error.message)):ok(msg.result);}
  };
  const send=(method,params={})=>new Promise((ok,no)=>{pending.set(++seq,[ok,no]);ws.send(JSON.stringify({id:seq,method,params}));});
  await send('Runtime.enable');await send('Page.enable');await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/qa'});
  await until(async()=>{if(errors.length)throw Error(errors.join('\n'));return (await send('Runtime.evaluate',{expression:'!!window.ready'})).result.value;});
  const result=await send('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width:1200,height:300,scale:1}});
  if(errors.length)throw Error(errors.join('\n'));await writeFile(out,Buffer.from(result.data,'base64'));console.log(id+' GPU render passed');
} finally {ws?.close();processHandle.kill();server.closeAllConnections();server.close();}
