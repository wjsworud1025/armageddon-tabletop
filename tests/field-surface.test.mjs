import test from 'node:test';
import assert from 'node:assert/strict';
import {createFieldPixels} from '../data/field-surface.mjs';

// In board inches from the upper left. Look at regions, so that changing the
// individual bolts or stones does not invalidate the board-orientation checks.
const front=createFieldPixels(false,440),back=createFieldPixels(true,440);
function darkFraction(face,x,y,r=.55){
  const s=face.width/44,t=face.height/30;let dark=0,count=0;
  for(let row=Math.floor((y-r)*t);row<Math.ceil((y+r)*t);row++){
    for(let col=Math.floor((x-r)*s);col<Math.ceil((x+r)*s);col++){
      const i=(row*face.width+col)*4;
      dark+=Number(face.pixels[i]<150);count++;
    }
  }
  return dark/count;
}
test('both faces use opaque, reproducible 44 by 30 terrain at the requested output scale',()=>{
  for(const [isReverse,face] of [[false,front],[true,back]]){
    assert.equal(face.width,440);assert.equal(face.height,300);
    assert.equal(face.pixels.length,face.width*face.height*4);
    for(let i=3;i<face.pixels.length;i+=4)assert.equal(face.pixels[i],255);
    assert.deepEqual(createFieldPixels(isReverse,440).pixels,face.pixels);
  }
  assert.equal(createFieldPixels(false,220).height,150);
  assert.throws(()=>createFieldPixels(true,0),RangeError);
});

test('five industrial foundations occupy each reverse panel; opposite panels are half-turn partners',()=>{
  const left=[[6.4,8.2],[16,4.9],[19,13],[8,20],[15,26.1]];
  for(const [u,v] of left)for(const [x,y] of [[u,v],[44-u,30-v]]){
    assert.ok(darkFraction(back,x,y)>.43,'Missing reverse foundation at '+[x,y]);
    assert.ok(darkFraction(front,x,y)<.12,'Front should show ground at '+[x,y]);
  }
  for(const [x,y] of [[2,17],[12,16],[21,5],[23,25],[32,14],[42,11]])
    assert.ok(darkFraction(back,x,y)<.16,'Reverse walkable ground is sandy at '+[x,y]);
});

test('front central fissure and reverse bone pits stay on their respective panels',()=>{
  assert.ok(darkFraction(front,20.45,16.8,.4)>.20);
  assert.ok(darkFraction(back,20.45,16.8,.4)<.12);
  for(const [x,y] of [[3.15,22.9],[29.5,11.8],[40.8,6.8]]){
    assert.ok(darkFraction(back,x,y,.32)>.17);
    assert.ok(darkFraction(front,x,y,.32)<.14);
  }
});

test('front soil varies at gravel and weathered-patch scales across the two printed panels',()=>{
  const {pixels,width,height}=createFieldPixels(false);
  const stride=width+1,sum=new Float64Array(stride*(height+1));
  for(let y=0;y<height;y++){
    let row=0;
    for(let x=0;x<width;x++){
      const i=(y*width+x)*4;
      row+=.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2];
      sum[(y+1)*stride+x+1]=sum[y*stride+x+1]+row;
    }
  }
  function mean(x,y,r){
    const left=x-r,right=x+r+1,top=(y-r)*stride,bottom=(y+r+1)*stride;
    return (sum[bottom+right]-sum[top+right]-sum[bottom+left]+sum[top+left])/(2*r+1)**2;
  }
  // Box filtering at 30 px/in: compare average tones over 7 and 41 px.
  // Targets are regional RMS measurements, independent of feature placement.
  const samples=[[2,1,10,6,7.52],[34,2,42,9,4.55],[8,20,15,24,5.18],[33,21,42,28,6.19]];
  for(const [left,top,right,bottom,reference] of samples){
    let squared=0,n=0;
    for(let y=top*30;y<bottom*30;y+=2)for(let x=left*30;x<right*30;x+=2){
      squared+=(mean(x,y,3)-mean(x,y,20))**2;n++;
    }
    const rms=Math.sqrt(squared/n);
    assert.ok(Math.abs(rms-reference)<.90,`Soil contrast at (${left}, ${top}): ${rms.toFixed(2)}`);
  }
});
