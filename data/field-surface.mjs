// Original procedural terrain. Geometry is authored in board inches from the
// upper left. The pixel buffer is also usable without a browser or image assets.
const TAU=Math.PI*2;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
function random(seed){
  return ()=>{
    seed=(seed+0x6d2b79f5)|0;
    let n=Math.imul(seed^(seed>>>15),seed|1);
    n^=n+Math.imul(n^(n>>>7),n|61);
    return ((n^(n>>>14))>>>0)/4294967296;
  };
}
function noise(cell,rand){
  const cols=Math.ceil(44/cell)+2,rows=Math.ceil(30/cell)+2;
  const values=Float32Array.from({length:cols*rows},()=>rand()*2-1);
  return (x,y)=>{
    const gx=x/cell,gy=y/cell,ix=Math.floor(gx),iy=Math.floor(gy),i=iy*cols+ix;
    let a=gx-ix,b=gy-iy;a*=a*(3-2*a);b*=b*(3-2*b);
    return (values[i]*(1-a)+values[i+1]*a)*(1-b)+(values[i+cols]*(1-a)+values[i+cols+1]*a)*b;
  };
}
function sand(pixels,width,height,reverse,rand){
  // Mineral bands, compacted clay, localized crust and grains vary independently.
  const weather=noise(5.2,rand),mottle=noise(2.0,rand),dust=noise(.72,rand),grit=noise(.18,rand),chips=noise(.055,rand);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const u=x/width*44,v=y/height*30,i=(y*width+x)*4;
    const broad=weather(u,v),patch=mottle(u,v),mid=dust(u,v),fine=grit(u,v),grain=chips(u,v);
    const crust=clamp((patch*.55+mid*.35+fine*.2-.02)*2);
    const light=15*broad+13*patch+10*mid+5*fine+3*grain+crust*grain*10;
    const rust=clamp(-patch*.8-broad*.45)*9,olive=clamp(mid*.65+fine*.3)*6;
    const panel=x<width/2?-3:3;
    pixels[i]=191+light-rust*.3-olive-(reverse?4:0)+panel;
    pixels[i+1]=155+light-rust+olive*.4-(reverse?4:0)+panel;
    pixels[i+2]=114+light*.87-rust*.9+olive*.6-(reverse?5:0)+panel*.5;
    pixels[i+3]=255;
  }
}

function scouredSoil(pixels,width,height,reverse,rand,draw){
  const weather=noise(.72,rand),crumb=noise(.17,rand),scars=reverse?
    [[5,11,4,2],[16,13,3,2],[11,26,4,1.4],[26,2,5,1.4],[38,3,3,2],[41,12,2,4],[36,28,4,2]]:
    [[6.5,4.3,2.8,1.5],[4.3,8.6,2.1,3.1],[10.7,3.2,1.6,.85],[16.4,5.2,3.3,1.7],[14.8,8.6,2.6,1.3],
      [3.3,22.3,4.3,1.5],[11.8,24.3,3.5,1.7],[18.4,26.2,2.4,3.5],[36.5,8.7,2.8,3.0],[36.8,24.4,2.2,3.1],[39.5,24.1,2.1,3.6]];
  const sx=width/44,sy=height/30;
  for(const [cx,cy,rx,ry] of scars){
    for(let y=Math.max(0,Math.floor((cy-ry*1.55)*sy));y<Math.min(height,(cy+ry*1.55)*sy);y++){
      for(let x=Math.max(0,Math.floor((cx-rx*1.55)*sx));x<Math.min(width,(cx+rx*1.55)*sx);x++){
        const u=x/sx,v=y/sy,grit=crumb(u,v),r=Math.hypot((u-cx)/rx,(v-cy)/ry)+weather(u,v)*.25+grit*.07;
        const faded=clamp((1.14-r)*3.1+grit*.35);
        if(!faded)continue;
        const edge=clamp(1-Math.abs(.84-r)*6),shade=grit*11+weather(u,v)*6;
        const i=(y*width+x)*4,weight=faded*(.24+.28*edge);
        const color=[151-edge*12+shade,145-edge*26+shade,115-edge*20+shade];
        for(let k=0;k<3;k++)pixels[i+k]+=(color[k]-pixels[i+k])*weight;
      }
    }
    for(let i=0;i<rx*ry*55;i++){
      const a=rand()*TAU,r=Math.sqrt(rand())*.94,px=cx+Math.cos(a)*r*rx,py=cy+Math.sin(a)*r*ry;
      const vein=weather(px,py)*.6+crumb(px,py)*.43;
      if(vein<-.12)continue;
      const rad=.024+rand()**2*.105,tilt=rand()*.06;
      const lo=[px-rad,py+tilt],hi=[px+rad*.32,py-rad*.7],tip=[px+rad,py+tilt];
      draw.poly([lo,hi,tip,[px,py+rad*.64]],mix([175,150,117],rand()*32-14),.49);
      draw.line(lo,hi,.024,sandLight,.60);draw.line(tip,[px,py+rad*.64],.021,mortar,.53);
    }
  }
}

// Small scan converter for the original stone, metal and rubble drawings.
// Fractional edge coverage keeps narrow mortar cracks visible at modest zoom.
function painter(pixels,width,height){
  const sx=width/44,sy=height/30;
  function dot(x,y,color,alpha){
    const i=(y*width+x)*4;
    for(let k=0;k<3;k++)pixels[i+k]+=(color[k]-pixels[i+k])*alpha;
  }
  function polygon(points,color,alpha=1){
    const pts=points.map(([x,y])=>[x*sx,y*sy]);
    const ys=pts.map(p=>p[1]),top=Math.max(0,Math.ceil(Math.min(...ys)-.5)),bottom=Math.min(height-1,Math.floor(Math.max(...ys)-.5));
    for(let y=top;y<=bottom;y++){
      const row=y+.5,cuts=[];
      for(let i=0,j=pts.length-1;i<pts.length;j=i++){
        const [x1,y1]=pts[j],[x2,y2]=pts[i];
        if((y1<=row&&row<y2)||(y2<=row&&row<y1))cuts.push(x1+(row-y1)*(x2-x1)/(y2-y1));
      }
      cuts.sort((a,b)=>a-b);
      for(let i=0;i+1<cuts.length;i+=2){
        const a=cuts[i],b=cuts[i+1];
        for(let x=Math.max(0,Math.floor(a));x<Math.min(width,Math.ceil(b));x++){
          const coverage=Math.min(b,x+1)-Math.max(a,x);
          dot(x,y,color,coverage*alpha);
        }
      }
    }
  }
  function segment([x1,y1],[x2,y2],thickness,color,alpha=1){
    const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy);
    if(!len)return;
    const nx=-dy/len*thickness/2,ny=dx/len*thickness/2;
    polygon([[x1+nx,y1+ny],[x2+nx,y2+ny],[x2-nx,y2-ny],[x1-nx,y1-ny]],color,alpha);
  }
  return (cx=0,cy=0,angle=0)=>{
    const c=Math.cos(angle),s=Math.sin(angle),at=([x,y])=>[cx+c*x-s*y,cy+s*x+c*y];
    const poly=(pts,col,a)=>polygon(pts.map(at),col,a);
    const line=(p,q,w,col,a)=>segment(at(p),at(q),w,col,a);
    const rect=(x,y,w,h,col,a)=>poly([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],col,a);
    const oval=(x,y,rx,ry,col,a)=>poly(Array.from({length:12},(_,i)=>[x+rx*Math.cos(i*TAU/12),y+ry*Math.sin(i*TAU/12)]),col,a);
    return {poly,line,rect,oval};
  };
}
const warm=[193,159,121],sandLight=[234,205,157],mortar=[91,70,52];
const iron=[52,53,46],oxide=[110,76,51],metalEdge=[153,140,111],soot=[45,42,35];
const mix=(col,k)=>col.map(v=>v+k);
function speckle(draw,rand){
  for(let i=0;i<230;i++){
    const x=rand()*44,y=rand()*30,w=.22+rand()*1.7,h=.14+rand()*.9;
    const count=12+rand()*52;
    for(let j=0;j<count;j++){
      const angle=rand()*TAU,r=Math.sqrt(rand()),u=x+Math.cos(angle)*r*w,v=y+Math.sin(angle)*r*h;
      const size=.012+rand()**3*.08;
      draw.line([u,v],[u+size*.8,v-size*.45],size*.5,rand()<.65?sandLight:mortar,.21+rand()*.25);
    }
  }
}

function pavement(brush,rand,x,y,length,width,angle){
  const d=brush(x,y,angle);let start=-length/2;
  while(start<length/2){
    const course=.47+rand()*.91;
    let cross=-width/2-rand()*.75;
    while(cross<width/2){
      const span=.55+rand()*1.25,l=Math.max(-width/2,cross),r=Math.min(width/2,cross+span);
      const u=Math.min(length/2,start+course),v=start;
      const along=(v+u)/length,side=(l+r)/width;
      const fade=clamp(1.32-.63*along**2-.54*side**2+rand()*.26);
      if(r-l>.20&&rand()<fade){
        const chip=Math.min(.15,(r-l)*.23),j=()=>rand()*.064;
        const stone=[[v+j(),l+chip],[v+chip,l+j()],[u-.10,l+j()],[u-j(),l+.13],
          [u-j(),r-.06],[u-.09,r-j()],[v+.07,r-j()],[v+j(),r-.14]];
        const opacity=clamp(fade*fade*.84);
        d.poly(stone,mix(warm,rand()*32-16),opacity*.45);
        for(let i=0;i<stone.length;i++)d.line(stone[i],stone[(i+1)%stone.length],.046,mortar,opacity*.77);
        d.line(stone[1],stone[2],.040,sandLight,opacity*.9);
        d.line(stone[4],stone[5],.042,mortar,opacity*.84);
        if(rand()<.31){
          const k=l+(r-l)*rand(),mid=[v+(u-v)*.52,k+.14];
          d.line([v,k],mid,.019,mortar,.51*fade);d.line(mid,[u,k-.05],.016,mortar,.46*fade);
        }
        for(let i=0;i<10;i++){
          const a=v+rand()*(u-v),b=l+rand()*(r-l);
          d.line([a,b],[a+.018+rand()*.05,b-.018],.02,sandLight,.52*fade);
        }
      }
      cross+=span;
    }
    start+=course;
  }
}

// Fractured slabs occupy larger, irregular areas around the few surviving
// masonry courses. Every fracture network is constructed from new seeds.
function stoneShelf(brush,rand,cx,cy,rx,ry,spacing,angle){
  const d=brush(cx,cy,angle),sites=[];
  for(let y=-ry-spacing*2;y<ry+spacing*2;y+=spacing){
    for(let x=-rx-spacing*2;x<rx+spacing*2;x+=spacing){
      sites.push([x+rand()*spacing*.59,y+rand()*spacing*.75]);
    }
  }
  for(const [x,y] of sites){
    const radius=Math.hypot(x/rx,y/ry),cover=clamp(1.40-radius*.89);
    if(radius>1.22||rand()>cover+.16)continue;
    let pts=[[-rx-4,-ry-4],[rx+4,-ry-4],[rx+4,ry+4],[-rx-4,ry+4]];
    for(const [u,v] of sites){
      const dx=u-x,dy=v-y;
      if((!dx&&!dy)||Math.abs(dx)>spacing*3||Math.abs(dy)>spacing*3)continue;
      const mid=(u*u+v*v-x*x-y*y)/2,next=[];
      for(let i=0,j=pts.length-1;i<pts.length;j=i++){
        const a=pts[j],b=pts[i],da=a[0]*dx+a[1]*dy-mid,db=b[0]*dx+b[1]*dy-mid;
        if((da<=0)!==(db<=0))next.push([a[0]+(b[0]-a[0])*da/(da-db),a[1]+(b[1]-a[1])*da/(da-db)]);
        if(db<=0)next.push(b);
      }
      pts=next;
    }
    if(pts.length<3)continue;
    const tint=rand()*39-18;
    d.poly(pts,mix(warm,tint),.36*cover);
    for(let i=0;i<pts.length;i++){
      const a=pts[i],b=pts[(i+1)%pts.length];
      if(rand()<.23)continue;
      const shade=cover*(.40+rand()*.60),width=.024+rand()*.065;
      const m=[(a[0]+b[0])*.5+(rand()-.5)*.15,(a[1]+b[1])*.5+(rand()-.5)*.15];
      for(const [p,q] of [[a,m],[m,b]]){
        d.line([p[0]-.035,p[1]-.035],[q[0]-.035,q[1]-.035],width*2.4,sandLight,shade*.87);
        d.line(p,q,width,mortar,shade);
      }
      if(rand()<.48){
        const length=.10+rand()*.14;
        d.poly([a,[a[0]+length,a[1]+length],[a[0]-.056,a[1]+.07]],mortar,shade);
      }
    }
  }
}

function bonePit(brush,rand,x,y,rx,ry,angle){
  const d=brush(x,y,angle),n=13;
  const rim=Array.from({length:n},(_,i)=>{
    const a=i/n*TAU,r=.76+rand()*.35;
    return [Math.cos(a)*rx*r,Math.sin(a)*ry*r];
  });
  const inside=(px,py)=>{
    let hit=false;
    for(let i=0,j=n-1;i<n;j=i++){
      const [x1,y1]=rim[i],[x2,y2]=rim[j];
      if((y1>py)!==(y2>py)&&px<(x2-x1)*(py-y1)/(y2-y1)+x1)hit=!hit;
    }
    return hit;
  };
  for(let i=0;i<n;i++){
    const p=rim[i],q=rim[(i+1)%n],jitter=.4+rand()*.55;
    const joint=[p[0]*(1+jitter),p[1]*(1+jitter)];
    d.line(p,joint,.060,mortar,.93);
    d.line([p[0]-.034,p[1]-.031],[joint[0]-.034,joint[1]-.031],.030,sandLight,.86);
    if(i%3!==0)d.line(joint,[joint[0]+q[0]*.61,joint[1]+q[1]*.66],.038,mortar,.66);
    if(i%2===0)d.line(joint,[q[0]*1.48,q[1]*1.48],.042,mortar,.74);
  }
  d.poly(rim,[79,68,49]);
  for(let i=0;i<rx*ry*240;i++){
    const px=(rand()*2-1)*rx,py=(rand()*2-1)*ry;
    if(!inside(px,py))continue;
    const r=.028+rand()*.067;
    d.oval(px,py,r,r*.83,mix([182,157,112],rand()*45-17),.98);
    if(r>.062){
      d.rect(px-r*.43,py,r*.82,r*.89,[175,151,104],.92);
      d.oval(px-r*.37,py,r*.22,r*.22,soot);d.oval(px+r*.35,py-r*.07,r*.21,r*.25,soot);
    }
  }
}
function front(brush,rand){
  stoneShelf(brush,rand,6.7,16.7,8.0,3.1,1.65,-.08);
  stoneShelf(brush,rand,12.0,15.6,4.1,2.6,1.41,-.27);
  stoneShelf(brush,rand,9.4,29.3,4.8,2.0,1.52,.13);
  stoneShelf(brush,rand,29.9,9.2,3.0,7.2,1.71,.26);
  stoneShelf(brush,rand,27.6,17.3,3.5,6.6,1.87,.14);
  stoneShelf(brush,rand,28.4,26.9,4.1,6.3,1.98,.062);
  pavement(brush,rand,5.0,17.8,6.4,1.65,-.09);
  pavement(brush,rand,8.5,27.2,4.4,1.55,1.49);
  pavement(brush,rand,30.7,4.9,4.0,1.5,1.85);
  pavement(brush,rand,29.8,8.0,4.7,1.55,.30);
  pavement(brush,rand,27.7,20.0,4.0,1.45,1.66);
  pavement(brush,rand,29.1,22.7,4.6,1.45,.13);
  bonePit(brush,rand,20.45,16.8,1.76,.91,-.25);
}

function grille(d,x,y,w,h,rand){
  d.rect(x,y,w,h,mix(soot,-7));
  const pitch=.115;
  for(let a=x+.05;a<x+w;a+=pitch)d.line([a,y],[a,y+h],.033,mix(metalEdge,rand()*20-32));
  for(let b=y+.05;b<y+h;b+=pitch*1.35)d.line([x,b],[x+w,b],.034,mix(oxide,rand()*28));
  d.rect(x,y,w,.035,metalEdge);d.rect(x,y,.035,h,metalEdge);
}
function fan(d,x,y,r,rand){
  d.oval(x,y,r+.043,r+.043,metalEdge);d.oval(x,y,r,r,iron);
  for(let i=0;i<8;i++){
    const a=i*TAU/8+.31,b=a+.30;
    d.poly([[x+.10*Math.cos(a),y+.10*Math.sin(a)],[x+r*.86*Math.cos(b),y+r*.86*Math.sin(b)],
      [x+r*.67*Math.cos(b+.42),y+r*.67*Math.sin(b+.42)]],mix(metalEdge,rand()*20-28));
  }
  d.oval(x,y,r*.21,r*.21,[110,104,85]);d.line([x-r,y],[x+r,y],.034,mortar);
}
function conduits(d,x,y,w,h,rand){
  const step=w*.19;
  for(let n=0;n<4;n++){
    const xx=x+n*step+.1,yy=y+.11+n*.08,ex=x+w-.12-n*.12,ey=y+h-.12-n*.09;
    if(ex<xx||ey<yy)continue;
    d.line([xx,yy],[ex,yy],.055,metalEdge,.83);
    d.line([ex,yy],[ex,ey],.055,metalEdge,.83);
    d.line([ex,ey],[xx+.11,ey],.050,metalEdge,.72);
    if(rand()<.65)d.rect(xx,yy-.03,.15,.09,soot);
  }
}
function beam(d,x,y,l,w,angle){
  const c=Math.cos(angle),s=Math.sin(angle),end=[x+c*l,y+s*l];
  d.line([x+.035,y+.07],[end[0]+.035,end[1]+.07],w*1.2,soot,.85);
  d.line([x,y],end,w,[79,83,75]);d.line([x-s*w*.44,y+c*w*.44],[end[0]-s*w*.44,end[1]+c*w*.44],.034,metalEdge);
}
function rubble(d,cx,cy,spreadX,spreadY,n,rand,chunk=.38){
  for(let i=0;i<n;i++){
    const a=rand()*TAU,rad=Math.sqrt(rand()),x=cx+Math.cos(a)*spreadX*rad,y=cy+Math.sin(a)*spreadY*rad;
    const s=.026+rand()**2*(1-rad*.62)*chunk;
    const color=rand()<.42?[117,125,118]:rand()<.55?[171,152,123]:[138,118,94];
    const p=[[x-s,y-s*.4],[x-s*.25,y-s*.89],[x+s*.78,y-s*.3],[x+s*.6,y+s*.64],[x-s*.49,y+s*.7]];
    d.poly(p.map(([u,v])=>[u+.022,v+.047]),soot,.78);d.poly(p,mix(color,rand()*23-6));
    d.poly([p[0],p[1],p[2],[x+s*.1,y+s*.05]],mix(color,32),.81);
  }
}
function platform(brush,rand,x,y,w,h,angle,type){
  const d=brush(x,y,angle),left=-w/2,top=-h/2;
  d.rect(left+.03,top+.06,w,h,[126,101,71],.77);
  d.rect(left,top,w,h,[87,88,75]);
  d.rect(left+.025,top+.025,w-.05,h-.05,metalEdge,.64);
  d.rect(left+.12,top+.12,w-.24,h-.24,[91,71,52]);
  if(type==='vent'){
    for(let y0=top+.16;y0<h/2-.2;y0+=.9){
      const len=Math.min(.88,h/2-.14-y0);
      d.rect(left+.16,y0,w-.32,len,mix([127,87,64],rand()*27-14));
      d.rect(left+.19,y0+.03,w-.4,.026,[170,135,98],.67);
    }
    d.rect(-.56,-.50,1.12,1.0,[162,155,131]);d.rect(-.45,-.39,.9,.78,soot);
    for(let k=0;k<5;k++)d.rect(-.39+k*.17,-.34,.055,.68,[158,157,135]);
    rubble(d,left+.22,h*.30,.38,.77,38,rand);
  }else{
    const nx=Math.round(w/1.25),ny=Math.round(h/1.28),cw=(w-.40)/nx,ch=(h-.40)/ny;
    for(let iy=0;iy<ny;iy++)for(let ix=0;ix<nx;ix++){
      const u=left+.2+ix*cw,v=top+.2+iy*ch,m=rand();
      d.rect(u+.015,v+.015,cw-.035,ch-.035,mix([125,97,75],rand()*30-17));
      if(m<.59)grille(d,u+.085,v+.09,cw-.17,ch-.18,rand);
      else if(m<.82)conduits(d,u+.045,v+.045,cw-.09,ch-.09,rand);
      else if(m<.94)fan(d,u+cw*.50,v+ch*.50,Math.min(cw,ch)*.38,rand);
      else d.rect(u+.16,v+.15,cw-.32,.09,oxide);
    }
    if(type==='large'){
      // Torn deck plates, fallen beams and two distinct rubble piles interrupt the floor.
      const hole=[[left+.5,-2.3],[-.7,-1.8],[.65,-2.4],[1.33,-.8],[.45,.27],[1.1,1.0],[-.8,1.68],[-1.8,.96],[-2.0,-.6]];
      d.poly(hole,soot,.95);
      for(let n=0;n<10;n++){
        const yy=-1.8+n*.32;
        d.line([-1.9,yy],[.8+rand()*.2,yy-.07],.067,mix(iron,rand()*23),.91);
      }
      rubble(d,-1.15,2.85,2.4,2.4,300,rand,.73);rubble(d,1.04,-3.25,2.25,1.98,290,rand,.69);
      rubble(d,-1.57,-.05,1.28,2.22,76,rand,.42);
      for(let n=0;n<14;n++)beam(d,(rand()-.5)*4.2,(rand()-.5)*6.7,1+rand()*1.4,.09+rand()*.11,rand()*TAU);
    }else{
      rubble(d,-w*.21,h*.19,w*.28,h*.22,97,rand,.49);
      rubble(d,w*.20,-h*.26,w*.25,h*.16,80,rand,.49);
      for(let n=0;n<4;n++)beam(d,(rand()-.5)*w*.67,(rand()-.5)*h*.6,.45+rand()*.85,.08+rand()*.07,rand()*TAU);
    }
  }
  for(let xx=left+.14;xx<w/2-.07;xx+=.34)for(const yy of [top+.06,h/2-.06]){
    d.rect(xx,yy,.035,.035,soot);d.rect(xx-.008,yy-.014,.026,.026,sandLight,.84);
  }
  for(let yy=top+.16;yy<h/2;yy+=.34)for(const xx of [left+.06,w/2-.07]){
    d.rect(xx,yy,.038,.038,soot);d.rect(xx-.012,yy-.015,.026,.026,metalEdge);
  }
  for(let i=0;i<w*h*5;i++){
    const xx=left+rand()*w,yy=top+rand()*h;
    d.line([xx,yy],[xx+.014+rand()*.055,yy-.015],.018,sandLight,.57);
  }
}

function back(brush,rand){
  stoneShelf(brush,rand,7.5,25.1,5.8,2.5,1.67,.16);
  stoneShelf(brush,rand,12.5,8.0,2.6,5.0,1.55,-.12);
  stoneShelf(brush,rand,30.6,21.2,4.8,3.1,1.45,-.22);
  pavement(brush,rand,8.4,25.1,13.2,2.4,.13);
  pavement(brush,rand,13.4,3.3,8.2,2.3,-.37);
  pavement(brush,rand,26.1,21.3,6.4,2.0,.12);
  pavement(brush,rand,33.3,19.9,5.6,1.6,1.83);
  bonePit(brush,rand,3.15,22.9,.7,.52,.33);
  bonePit(brush,rand,29.5,11.8,1.05,1.7,-.16);
  bonePit(brush,rand,40.8,6.8,.71,.58,.21);
  // For every left-board foundation the right board has its half-turned partner.
  const layouts=[[6.4,8.15,7.0,11.6,'large'],[15.95,4.9,1.95,6.0,'vent'],
    [18.95,12.95,6.1,4.05,'small'],[8.0,20.0,1.95,6.05,'vent'],[15.0,26.1,4.05,6.1,'small']];
  for(const [x,y,w,h,type] of layouts){
    platform(brush,rand,x,y,w,h,0,type);platform(brush,rand,44-x,30-y,w,h,Math.PI,type);
  }
}

export function createFieldPixels(reverse=false,width=1320){
  if(!Number.isInteger(width)||width<44)throw new RangeError('A battlefield texture must be at least 44 pixels wide.');
  const height=Math.round(width*30/44),pixels=new Uint8ClampedArray(width*height*4);
  const rand=random(reverse?0x89ba212d:0x743b9e17);
  sand(pixels,width,height,reverse,rand);
  const brush=painter(pixels,width,height),draw=brush();
  scouredSoil(pixels,width,height,reverse,rand,draw);
  speckle(draw,rand);
  const substrate=pixels.slice();
  if(reverse)back(brush,rand);else front(brush,rand);
  // Fine tonal noise continues across newly drawn blocks and oxidized metal.
  const patina=noise(.27,rand),soil=noise(.83,rand);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,u=x/width*44,v=y/height*30;
    const mineral=soil(u,v),wear=patina(u,v),grain=(rand()-.5)*15;
    const shade=grain+mineral*3+wear*3;
    const dust=clamp((mineral*.77+wear*.53+.09)*(pixels[i]<155?.55:1.28),0,.96);
    for(let k=0;k<3;k++)pixels[i+k]+=(substrate[i+k]-pixels[i+k])*dust+shade;
  }
  draw.line([22,0],[22,30],.025,mortar,.25);
  return {width,height,pixels};
}
