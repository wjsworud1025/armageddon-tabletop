import test from 'node:test';
import assert from 'node:assert/strict';
import {measureFootprints} from '../ruler.mjs';
import {baseDistance} from '../state.mjs';

const vehicle={x:0,z:0,baseWidth:70/25.4,baseDepth:105/25.4,yaw:.6,elevation:2};
const close=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} vs ${expected}`);
function ellipseBoundary(p,angle){
  const rx=p.baseWidth/2,rz=p.baseDepth/2,c=Math.cos(p.yaw),s=Math.sin(p.yaw);
  const u=Math.cos(angle),v=Math.sin(angle);
  const nx=c*u/rx+s*v/rz,nz=-s*u/rx+c*v/rz,length=Math.hypot(nx,nz);
  return {x:p.x+c*rx*u+s*rz*v,z:p.z-s*rx*u+c*rz*v,nx:nx/length,nz:nz/length};
}
test('the tape meets the rotated rim of a 105 mm oval and includes the height to a ground point',()=>{
  for(const angle of [0,.32,1.1,2.65,4.6]){
    const rim=ellipseBoundary(vehicle,angle);
    const ground={x:rim.x+rim.nx*3,z:rim.z+rim.nz*3};
    const tape=measureFootprints(vehicle,ground),reverse=measureFootprints(ground,vehicle);
    close(tape.horizontal,3);close(tape.distance,Math.hypot(3,2));
    close(tape.from.x,rim.x,.0002);close(tape.from.z,rim.z,.0002);
    close(tape.to.x,ground.x);close(tape.to.z,ground.z);
    close(reverse.distance,tape.distance);
  }
});
test('a round base tangent to an oval gives zero horizontal range and a vertical tape',()=>{
  const rim=ellipseBoundary(vehicle,.83),radius=.65;
  const model={baseWidth:2*radius,baseDepth:2*radius,x:rim.x+rim.nx*radius,z:rim.z+rim.nz*radius,elevation:5};
  const tape=measureFootprints(vehicle,model);
  close(tape.horizontal,0);close(tape.distance,3);close(baseDistance(vehicle,model),0);
  model.x-=rim.nx*.3;model.z-=rim.nz*.3;
  close(measureFootprints(model,vehicle).horizontal,0);
});
test('closest parts of parallel terrain faces can be away from both centres; ground points measure directly',()=>{
  const wall={faction:'terrain',baseWidth:4,baseDepth:2,x:0,z:0};
  const shifted={...wall,x:2.7,z:5};
  const tape=measureFootprints(wall,shifted);
  close(tape.from.z,1);close(tape.to.z,4);close(tape.from.x,tape.to.x);
  assert.ok(tape.from.x>=.7&&tape.from.x<=2);close(tape.distance,3);
  close(measureFootprints({x:-1,z:3},{x:2,z:7}).distance,5);
});
