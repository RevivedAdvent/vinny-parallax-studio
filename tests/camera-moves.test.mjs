import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene, createProject, validateProject } from '../src/studio/project.ts';
import { compileCamera } from '../src/camera/evaluate.ts';
import { projectLayers, projectedLayerInfo } from '../src/camera/project.ts';
import { calibration, neutralCamera } from '../src/camera/virtual-projection.ts';

const make = () => {
 const s=createScene('Moves',10,800,600,24);
 s.layers=[0,.5,1].map((depth,i)=>({id:`l${i}`,name:`Layer ${i}`,asset:'/test.png',depth}));
 return s;
};
const move = (type,options={}) => ({id:type,type,start:2,duration:4,x:600,y:450,scale:type==='pull'?.5:2,...options});
const near = (a,b,tol=1e-8) => assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
const projected = (s,t) => {
 const core=compileCamera(s), cfg=core.config(), state=core.evaluateTime(t);
 return { state, layers:projectLayers(cfg,state).map(pose=>projectedLayerInfo(cfg,pose,state.virtualCamera)) };
};

test('legacy basic moves migrate to the virtual camera and every move holds its endpoint',()=>{
 for(const type of ['push','pull','pan','tilt','zoom']) {
  const s=make();s.cameraMoves=[move(type)];
  const cfg=compileCamera(s).config();
  assert.equal(cfg.cameraMoves.length,1,'the movement is preserved');
  assert.equal(cfg.cameraMoves[0].model,2,`${type} uses the virtual camera`);
  assert.equal(cfg.cameraMoves[0].legacyModel,1,`${type} records that it was migrated`);
  const atStart=projected(s,0), before=projected(s,2), end=projected(s,6), held=projected(s,9);
  assert.deepEqual(atStart.state.virtualCamera,neutralCamera(calibration(800,600)),`${type} starts from neutral`);
  assert.notDeepEqual(before.layers,end.layers,`${type} changes the projection`);
  assert.deepEqual(held.layers,end.layers,`${type} holds its endpoint`);
  if(type==='push'||type==='pull') {
   assert.ok(cfg.cameraMoves[0].travel>0,`${type} converts its old scale to dolly travel`);
   assert.equal(Math.sign(end.state.virtualCamera.z),type==='push'?1:-1,`${type} moves on the correct Z side`);
   assert.ok(type==='push'?end.layers[2].scale>end.layers[0].scale:end.layers[2].scale<end.layers[0].scale,'near depth changes perspective most');
  }
  if(type==='pan') { assert.ok(end.state.virtualCamera.yaw>0); near(end.state.virtualCamera.x,0); }
  if(type==='tilt') { assert.ok(end.state.virtualCamera.pitch>0); near(end.state.virtualCamera.y,0); }
  if(type==='zoom') {
   near(end.state.virtualCamera.z,0); near(end.state.virtualCamera.focalLength,3200);
   end.layers.forEach(layer=>near(layer.scale,2));
  }
 }
});

test('both directions and sequential absolute coordinates work',()=>{
 for(const [type,key,coordinate,check] of [['pan','x',200,c=>c.yaw<0],['pan','x',600,c=>c.yaw>0],['tilt','y',100,c=>c.pitch<0],['tilt','y',500,c=>c.pitch>0]]) {
  const s=make();s.cameraMoves=[move(type,{[key]:coordinate})];assert.ok(check(projected(s,7).state.virtualCamera),`${type} ${key}=${coordinate}`);
 }
 const s=make();s.cameraMoves=[move('pan',{x:600}),move('pan',{id:'second',start:6,duration:2,x:300})];
 near(projected(s,8).state.virtualCamera.yaw,Math.atan2(-100,1600));
 for(const factor of [.5,2]) { s.cameraMoves=[move('zoom',{scale:factor})]; near(projected(s,6).state.virtualCamera.focalLength,1600*factor); }
});

test('moves compose, intensity works, and random seeks are deterministic',()=>{
 const s=make();s.cameraMoves=[move('pan'),move('zoom',{id:'zoom'})];const core=compileCamera(s);
 const full=core.evaluateTime(6),half=core.evaluateTime(6,.5);
 assert.ok(full.virtualCamera.yaw>0);near(full.virtualCamera.focalLength,3200);
 assert.ok(full.virtualCamera.yaw>half.virtualCamera.yaw);near(half.virtualCamera.focalLength,2400);
 const snapshot=core.evaluateTime(3.4);for(const t of [0,10,4,1])core.evaluateTime(t);assert.deepEqual(core.evaluateTime(3.4),snapshot);
});

test('validation rejects invalid movement data and project round trips preserve migrated camera data',()=>{
 for(const change of [m=>m.type='bad',m=>m.id='',m=>m.start=-1,m=>m.duration=0,m=>m.start=9,m=>m.x=801,m=>m.y=-1,m=>m.scale=NaN,m=>m.scale=.5]) {
  const s=make();s.cameraMoves=[move('push')];change(s.cameraMoves[0]);assert.throws(()=>compileCamera(s));
 }
 const s=make();s.cameraMoves=[move('pull',{scale:2})];assert.throws(()=>compileCamera(s));
 s.cameraMoves=[move('pan'),move('pan')];assert.throws(()=>compileCamera(s),/IDs/);
 const repeated=make();repeated.cameraMoves=[move('pan',{id:'pan-a'}),move('pan',{id:'pan-b'})];assert.equal(compileCamera(repeated).config().cameraMoves.length,2,'the same movement type can be used more than once');
 const legacy=make();legacy.cameraMoves=[move('push')];const p=createProject('Test');p.scenes=[legacy];
 const restored=validateProject(JSON.parse(JSON.stringify(p))).scenes[0];
 assert.equal(restored.cameraMoves[0].model,2);
 assert.equal(restored.cameraMoves[0].legacyModel,1);
 assert.equal(restored.cameraMoves[0].type,'push');
 assert.equal(restored.cameraMoves[0].scale,2);
 assert.ok(restored.cameraMoves[0].travel>0,'old push scale survives as virtual travel');
});

test('layer transforms and legacy camera animation remain compatible',()=>{
 const s=make();s.layers[1].x=60;s.cameraMoves=[move('pan')];
 const core=compileCamera(s),cfg=core.config(),state=core.evaluateTime(6),local=projectLayers(cfg,state);
 near(local[1].x-local[0].x,60);
 assert.equal(local[1].x-local[0].x,60,'authored layer offset is preserved before projection');
 near(local[2].x,local[0].x);
 s.cameraMoves=[];
 s.tracks=[{id:'old',target:'camera',property:'x',startFrame:0,endFrame:24,startValue:0,endValue:100,easing:'ease_in',intensity:1,limits:{min:-100,max:100}}];
 const legacy=projected(s,1);
 near(legacy.state.virtualCamera.x,100);
 near(legacy.state.virtualCamera.y,0);
 assert.ok(legacy.layers[2].x<legacy.layers[0].x&&legacy.layers[0].x<400,'translation responds with depth and the expected sign');
});
