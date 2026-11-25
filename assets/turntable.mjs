import {registration} from './turns/registration.mjs';

export const studioSource='https://www.warhammer.com/ko-KR/shop/40k-starter-set-2026-eng';
const battlezoneSource='https://www.warhammer.com/en-GB/shop/combat-patrol-battlezone-2026';
export const studioElevations=registration.elevationsDegrees;

const exact={
  'captain-1':1,'librarian-1':2,'intercessor-1':3,'vanguard-4':4,'landSpeeder-1':5,
  'warboss-1':6,'boy-1':7,'weirdboy-1':8,'boy-20':9,'gretchin-5':10,'wartrakk-1':11,
  'largeRuin-2':12,'capacitorStack-1':13,'generatorShrine-1':15,
  'largeRuin-1':16,'barricade-1':17,'barricade-2':17,'smallRuin-1':18,
};
const exemplar={captain:1,librarian:2,intercessor:3,vanguard:4,landSpeeder:5,warboss:6,
  weirdboy:8,boy:9,gretchin:10,wartrakk:11,largeRuin:12,capacitorStack:13,pylon:14,generatorShrine:15,
  barricade:17,smallRuin:18};

export function studioGroupFor(piece,{allowExemplar=false}={}) {
  if(!piece) return null;
  if(exact[piece.id]) return exact[piece.id];
  if(piece.kind==='pylon') return 14;
  if(!allowExemplar) return null;
  if(piece.kind==='boy' && piece.variant%10===0) return 7;
  return exemplar[piece.kind]??null;
}

/** Bounds and the projected ground anchor are normalized to one image cell. */
export function studioFrame(group,elevationIndex=0,azimuthIndex=0) {
  const levels=registration.frames[group];
  if(!levels || !Number.isFinite(elevationIndex)||!Number.isFinite(azimuthIndex)) return null;
  const level=Math.max(0,Math.min(2,Math.round(elevationIndex)));
  const a=((Math.round(azimuthIndex)%12)+12)%12;
  const [x,y,pixelsPerInch,...bounds]=levels[level][a];
  return {
    url:new URL('./turns/'+String(group).padStart(2,'0')+'-'+(level+1)+'.webp',import.meta.url).href,
    col:a%4,row:Math.floor(a/4),columns:4,rows:3,anchor:[x,y],bounds,
    pixelsPerInch,widthInches:512/pixelsPerInch,cellSize:512,
    scaleConfidence:group>=12?'estimated terrain footprint':group===5||group===11?'estimated from oval rim':'measured from round rim',
    elevationDegrees:studioElevations[level],azimuthIndex:a,elevationIndex:level,
  };
}

let activeViewer=null;
export function openStudioViewer(piece,{allowExemplar=false}={}) {
  const group=studioGroupFor(piece,{allowExemplar});
  if(group===null) return false;
  activeViewer?.close();
  const dlg=document.createElement('dialog');
  dlg.setAttribute('aria-label','실물 미니어처 회전 사진');
  dlg.style.cssText='width:min(46rem,94vw);max-height:92vh;padding:0;border:1px solid #a49c89;border-radius:5px;color:#242722;background:#f4f1e8;box-shadow:0 22px 80px #1119;overflow:auto';
  const host=document.createElement('div');
  dlg.appendChild(host);
  const root=host.attachShadow({mode:'open'});
  root.innerHTML=`<style>
  :host{font:14px system-ui,sans-serif}*{box-sizing:border-box}
  header,.controls,.info{display:flex;align-items:center;gap:9px;padding:10px 18px}
  header{border-bottom:1px solid #cac5b9;justify-content:space-between}h2{margin:2px 0;font-size:18px}
  .window{position:relative;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 47%,#fff 20%,#e7e4d9 100%);overflow:hidden;cursor:grab;touch-action:none;user-select:none;outline-offset:-3px}
  .window:active{cursor:grabbing}.subject{width:min(100%,58vh);aspect-ratio:1;background-repeat:no-repeat;background-size:400% 300%;transform-origin:50% 50%;pointer-events:none}
  button{border:1px solid #afa999;background:#faf8f0;color:#272c28;border-radius:4px;font:inherit;padding:5px 10px;cursor:pointer}
  button:focus-visible,a:focus-visible{outline:2px solid #226d8d;outline-offset:2px}
  button:hover{background:#e3dfd1}.controls{justify-content:center;flex-wrap:wrap;padding:9px 10px;border-top:1px solid #ccc5b7}.controls span{min-width:5em;text-align:center}
  .info{justify-content:space-between;flex-wrap:wrap;padding:4px 16px 11px;color:#53554d;font-size:12px}.info a{color:inherit}
  </style>
  <header><h2></h2><button data-action="close">닫기</button></header>
  <div class="window" tabindex="0" role="group" aria-label="드래그 또는 방향키로 사진 회전"><div class="subject" role="img"></div></div>
  <div class="controls"><button data-action="left" aria-label="왼쪽 회전">←</button><span class="angle"></span><button data-action="right" aria-label="오른쪽 회전">→</button><button data-action="down" aria-label="낮은 시점">↓</button><span class="level"></span><button data-action="up" aria-label="높은 시점">↑</button><button data-action="zoomOut" aria-label="축소">−</button><button data-action="zoomIn" aria-label="확대">＋</button></div>
  <div class="info"><span class="caption"></span><a href="${group>=16?battlezoneSource:studioSource}" target="_blank" rel="noopener noreferrer">Warhammer 공식 상품 사진 ↗</a></div>`;
  const windowEl=root.querySelector('.window'),subject=root.querySelector('.subject');
  const title=piece.name??piece.kind;
  root.querySelector('h2').textContent=title;
  const exactMatch=studioGroupFor(piece)===group;
  root.querySelector('.caption').textContent=exactMatch?'도색 실물 · 드래그로 회전, 휠로 확대':'같은 병종의 대표 조형 · 드래그로 회전, 휠로 확대';
  subject.setAttribute('aria-label',title+' 실물 사진');
  let azimuth=0,elevation=0,zoom=1,drag=null;
  const repaint=()=>{
    const frame=studioFrame(group,elevation,azimuth);
    subject.style.backgroundImage='url("'+frame.url+'")';
    subject.style.backgroundPosition=(frame.col/3*100)+'% '+(frame.row/2*100)+'%';
    subject.style.transform='scale('+zoom+')';
    root.querySelector('.angle').textContent=(frame.azimuthIndex*30)+'°';
    root.querySelector('.level').textContent=['낮은 시점','중간 시점','높은 시점'][elevation];
  };
  const adjust=(dx,dy,factor=1)=>{
    azimuth+=dx;elevation=Math.max(0,Math.min(2,elevation+dy));
    zoom=Math.max(.75,Math.min(2.5,zoom*factor));repaint();
  };
  const actions={left:()=>adjust(-1,0),right:()=>adjust(1,0),down:()=>adjust(0,-1),up:()=>adjust(0,1),
    zoomIn:()=>adjust(0,0,1.2),zoomOut:()=>adjust(0,0,1/1.2),close:()=>dlg.close()};
  root.addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;actions[action]?.();});
  dlg.addEventListener('keydown',e=>{
    const action={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down','+':'zoomIn','-':'zoomOut'}[e.key];
    if(action){e.preventDefault();e.stopPropagation();actions[action]();}
  });
  windowEl.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,azimuth,elevation};windowEl.setPointerCapture(e.pointerId);
  });
  windowEl.addEventListener('pointermove',e=>{
    if(drag?.id!==e.pointerId)return;
    azimuth=drag.azimuth-Math.round((e.clientX-drag.x)/24);
    elevation=Math.max(0,Math.min(2,drag.elevation+Math.round((e.clientY-drag.y)/48)));
    repaint();
  });
  windowEl.addEventListener('lostpointercapture',()=>{drag=null});
  windowEl.addEventListener('wheel',e=>{e.preventDefault();adjust(0,0,e.deltaY<0?1.1:1/1.1)},{passive:false});
  dlg.addEventListener('close',()=>{if(activeViewer===dlg) activeViewer=null;dlg.remove()},{once:true});
  document.body.appendChild(dlg);activeViewer=dlg;repaint();dlg.showModal();windowEl.focus();
  return true;
}
