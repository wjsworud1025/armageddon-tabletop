import test from 'node:test';
import assert from 'node:assert/strict';
import {assessMove,coherency} from '../movement.mjs';

function model(id,x=0,z=0,options={}) {
  const [kind,ordinal]=id.split('-');
  return {id,kind,variant:Number(ordinal)-1,name:id,faction:['boy','wartrakk','gretchin'].includes(kind)?'orks':'marines',
    x,z,yaw:0,elevation:0,baseWidth:1,baseDepth:1,...options};
}
const board=(pieces,rules=null)=>({width:44,depth:30,pieces,rules});
const codes=(result)=>result.errors.map(e=>e.code);
const manual=(result)=>result.manual.map(e=>e.code);

test('11th coherency uses one neighbour and an all-pairs span for any multi-model unit',()=>{
  const members=[0,2.8,6.8,9.6].map((x,i)=>model('intercessor-'+(i+1),x));
  assert.ok(coherency([members[0]]).ok);
  // Two close pairs satisfy the two printed conditions, even with a 3-inch gap between pairs.
  assert.ok(coherency(members).ok);
  members[3].x=10.01;
  assert.ok(codes(coherency(members)).includes('coherency-span'));
  assert.ok(codes(coherency(members)).includes('coherency-neighbour'));
  const just=model('intercessor-2',3,0,{elevation:5});
  assert.ok(coherency([members[0],just]).ok);
  just.elevation=5.001;
  assert.ok(!coherency([members[0],just]).ok);
  assert.ok(coherency([members[0],{...just,removed:true}]).ok);
});

test('an attached unit uses individual M, one shared advance die, and immutable original waypoints',()=>{
  const cap=model('captain-1',2),vet=model('vanguard-1',1.5);
  const game=board([cap,vet],{attachments:{[cap.id]:'vanguard'}});
  const args={game,pieces:[cap],type:'advance',advanceRoll:2,phase:'path',origins:{
    [cap.id]:{x:-3,z:0},[vet.id]:{x:-1,z:0}},paths:{
    [cap.id]:[{x:1},{x:-3},{x:-2}],[vet.id]:[{x:10}]}};
  const snapshot=structuredClone(args);
  const result=assessMove(args);
  assert.deepEqual(result.errors.find(e=>e.code==='distance').modelIds,[cap.id]);
  assert.deepEqual([result.models[cap.id].distance,result.models[cap.id].limit],[9,8]);
  assert.deepEqual([result.models[vet.id].distance,result.models[vet.id].limit],[11,14]);
  assert.deepEqual(args,snapshot);
  assert.ok(codes(assessMove({...args,advanceRoll:0})).includes('invalid-move'));
});

test('ordinary movement may pass through engagement range, while enemy-base crossings and engaged endpoints fail',()=>{
  const vet=model('vanguard-1',-4,1.1),enemy=model('boy-1',0);
  const args={game:board([vet,enemy]),pieces:[vet],type:'normal'};
  assert.ok(assessMove({...args,paths:{[vet.id]:[{x:4}]}}).ok);
  const crossing=assessMove({...args,paths:{[vet.id]:[{x:-4,z:0},{x:4}]}});
  assert.ok(codes(crossing).includes('enemy-base'));
  const tangent=assessMove({...args,paths:{[vet.id]:[{x:-4,z:1},{x:4}]}});
  assert.ok(tangent.ok);
  const paths={[vet.id]:[{x:0,z:1.2}]};
  assert.ok(assessMove({...args,paths,phase:'path'}).ok);
  assert.ok(codes(assessMove({...args,paths})).includes('end-engaged'));
});

test('friendly models can be passed; final overlaps and coherency are tested only on completion',()=>{
  const vet=model('vanguard-1',-5),ally=model('intercessor-1',0);
  const args={game:board([vet,ally]),pieces:[vet.id],type:'normal'};
  assert.ok(assessMove({...args,paths:{[vet.id]:[{x:3}]}}).ok);
  assert.ok(assessMove({...args,paths:{[vet.id]:[{x:0}]},phase:'path'}).ok);
  assert.ok(codes(assessMove({...args,paths:{[vet.id]:[{x:0}]}})).includes('base-overlap'));
  const mate=model('vanguard-2',-7);
  const scattered={...args,game:board([vet,mate,ally]),paths:{[vet.id]:[{x:2}]}};
  assert.ok(assessMove({...scattered,phase:'path'}).ok);
  assert.ok(codes(assessMove(scattered)).includes('coherency-neighbour'));
});

test('climbs charge every ascent and descent separately; declared flying subtracts two and ignores vertical distance',()=>{
  const vet=model('vanguard-1');
  const args={game:board([vet]),pieces:[vet],type:'normal',paths:{[vet.id]:[{x:3,elevation:4},{z:2,elevation:0}]}};
  const walking=assessMove(args);
  assert.deepEqual([walking.models[vet.id].distance,walking.models[vet.id].limit],[13,12]);
  assert.ok(manual(walking).includes('climb'));
  const flying=assessMove({...args,takeToSkies:true});
  assert.deepEqual([flying.models[vet.id].distance,flying.models[vet.id].limit],[5,10]);
  assert.ok(flying.ok);
  assert.ok(!manual(flying).includes('climb'));
  const grot=model('gretchin-1');
  assert.ok(codes(assessMove({game:board([grot]),pieces:[grot],type:'normal',takeToSkies:true})).includes('cannot-fly'));
});

test('ordered retreat cannot cross an enemy; desperate escape allows it and reports before/after rolls',()=>{
  const marine=model('intercessor-1',-1.5),enemy=model('boy-1');
  const args={game:board([marine,enemy]),pieces:[marine],paths:{[marine.id]:[{x:4}]},type:'fallback'};
  assert.ok(codes(assessMove(args)).includes('enemy-base'));
  assert.ok(codes(assessMove({...args,type:'normal'})).includes('start-engaged'));
  const desperate=assessMove({...args,fallbackMode:'desperate'});
  assert.ok(desperate.ok);
  assert.deepEqual(manual(desperate),['desperate-hazard','desperate-shock']);
  args.game.rules={units:{intercessor:{shocked:true}}};
  assert.ok(codes(assessMove(args)).includes('ordered-shocked'));
  assert.ok(assessMove({...args,fallbackMode:'desperate',desperateEscapeResolved:true}).ok);
  assert.deepEqual(manual(assessMove({...args,fallbackMode:'desperate',desperateEscapeResolved:true})),[]);
  assert.ok(codes(assessMove({...args,game:board([marine])})).includes('start-unengaged'));
});

test('vehicle and flying transit exceptions do not waive post-move engagement or base overlap',()=>{
  const speeder=model('landSpeeder-1',-5),boy=model('boy-1');
  const args={game:board([speeder,boy]),pieces:[speeder],type:'normal',paths:{[speeder.id]:[{x:5}]}};
  assert.ok(assessMove(args).ok);
  const second=model('landSpeeder-2',0,0,{faction:'orks'});
  const blocked={...args,game:board([speeder,second])};
  assert.ok(codes(assessMove(blocked)).includes('enemy-base'));
  assert.ok(assessMove({...blocked,takeToSkies:true}).ok);
  const onTop=assessMove({...blocked,paths:{[speeder.id]:[{x:0}]},takeToSkies:true});
  assert.ok(codes(onTop).includes('base-overlap'));
  assert.ok(codes(onTop).includes('end-engaged'));
});

test('a free pivot sweeps the actual oval through the board edge even if both endpoints fit',()=>{
  const oval=model('wartrakk-1',20.5,0,{baseWidth:2,baseDepth:4});
  const args={game:board([oval]),pieces:[oval],type:'normal',paths:{[oval.id]:[{yaw:Math.PI}]}};
  const result=assessMove(args);
  assert.equal(result.models[oval.id].distance,0);
  assert.ok(codes(result).includes('board-edge'));
  assert.ok(codes(assessMove({...args,type:'remain'})).includes('stationary'));
  const enemy=model('captain-1',0,1.7,{baseWidth:.2,baseDepth:.2});
  const pivot={...oval,x:0,yaw:Math.PI/2};
  const swings={game:board([pivot,enemy]),pieces:[pivot],type:'fallback',paths:{[pivot.id]:[{yaw:3*Math.PI/2},{x:4}]}};
  assert.ok(codes(assessMove(swings)).includes('enemy-base'));
});

test('terrain walls and upstairs clearance are explicit physical checks',()=>{
  const marine=model('intercessor-1',-3),ruin=model('largeRuin-1',0,0,{faction:'terrain',baseWidth:4,baseDepth:3});
  const args={game:board([marine,ruin]),pieces:[marine],type:'normal',paths:{[marine.id]:[{x:0},{elevation:2}]}};
  const walk=assessMove(args);
  assert.ok(walk.ok);
  assert.ok(['terrain-path','climb','terrain-end','supported-floor'].every(code=>manual(walk).includes(code)));
  const trakk=model('wartrakk-1',-3);
  assert.ok(codes(assessMove({...args,game:board([trakk,ruin]),pieces:[trakk],paths:{[trakk.id]:[{x:0,elevation:2}]}})).includes('upper-floor'));
});
