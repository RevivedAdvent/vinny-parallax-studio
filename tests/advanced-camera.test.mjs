import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene, createProject, validateProject } from '../src/studio/project.ts';
import { compileCamera } from '../src/camera/evaluate.ts';
import { projectLayers, projectedLayerInfo } from '../src/camera/project.ts';
import { calibration, planePoint, projectPoint } from '../src/camera/virtual-projection.ts';
import { focusBlur } from '../src/camera/advanced-moves.ts';

const scene=()=>{const s=createScene('Advanced',10,800,600,24);s.layers=[0,.5,1].map((depth,i)=>({id:`l${i}`,name:`Layer ${i}`,asset:'/art.png',depth}));return s;};
const move=(type,extra={})=>({id:type,model:2,type,start:1,duration:2,x:400,y:300,scale:1,...extra});
const near=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
const run=(s,t,intensity=1)=>compileCamera(s).evaluateTime(t,intensity);
const projected=(s,t)=>{const c=compileCamera(s),cfg=c.config(),state=c.evaluateTime(t);return projectLayers(cfg,state).map(p=>projectedLayerInfo(cfg,p,state.virtualCamera));};

test('Dutch roll rotates about its screen-space center and holds',()=>{
 const s=scene();s.cameraMoves=[move('dutch',{angle:20,x:500,y:350})];
 const c=calibration(800,600),p=planePoint(c,.5,{x:500,y:350});
 for(const t of [1,2,3,5]){const camera=run(s,t).virtualCamera,point=projectPoint(camera,p,c.focalLength*.1);near(point.x,500);near(point.y,350);}
 near(run(s,3).virtualCamera.roll,20*Math.PI/180);near(run(s,5).virtualCamera.roll,run(s,3).virtualCamera.roll);near(run(s,3,0).virtualCamera.roll,0);
});

test('handheld noise is deterministic when seeking, seeded, bounded and fades at boundaries',()=>{
 const s=scene();s.cameraMoves=[move('handheld',{strength:1,speed:2,seed:41})];const core=compileCamera(s);
 const first=core.evaluateTime(1.8);for(const t of [0,2.9,7,1.1])core.evaluateTime(t);assert.deepEqual(core.evaluateTime(1.8),first);
 const a=first.virtualCamera;assert.ok(Math.abs(a.x)<20&&Math.abs(a.y)<20&&Math.abs(a.roll)<.02);assert.ok(a.x!==0||a.y!==0);
 assert.equal(run(s,1).virtualCamera.x,0);assert.equal(run(s,3).virtualCamera.x,0);assert.equal(run(s,1.8,0).virtualCamera.x,0);
 s.cameraMoves[0].seed=42;assert.notEqual(run(s,1.8).virtualCamera.x,a.x);
});

test('impact shake fades rapidly and returns exactly to the prior camera',()=>{
 const s=scene();s.cameraMoves=[move('impact',{strength:1})];const early=run(s,1.05).virtualCamera,late=run(s,2.05).virtualCamera;
 assert.ok(Math.hypot(early.x,early.y)>Math.hypot(late.x,late.y));assert.equal(run(s,1).virtualCamera.roll,0);assert.equal(run(s,3).virtualCamera.roll,0);
});

test('whip accelerates and holds its angle; optional blur occurs only during motion',()=>{
 const s=scene();s.cameraMoves=[move('whip',{angle:-18,blur:true})];
 const mid=run(s,2).virtualCamera,end=run(s,3).virtualCamera;near(mid.yaw,-9*Math.PI/180);near(end.yaw,-18*Math.PI/180);assert.ok(mid.motionBlur>0);assert.equal(end.motionBlur,undefined);near(run(s,5).virtualCamera.yaw,end.yaw);
 s.cameraMoves[0].blur=false;assert.equal(run(s,2).virtualCamera.motionBlur,undefined);
 s.cameraMoves[0].blur=true;s.cameraMoves[0].angle=0;assert.equal(run(s,2).virtualCamera.motionBlur,0);
});

test('dolly zoom preserves selected subject size while perspective changes, in both directions',()=>{
 for(const travel of [-.2,.2]){
  const s=scene();s.cameraMoves=[move('dollyZoom',{travel,layerId:'l1'})];
  for(const t of [1,1.5,2,2.5,3])near(projected(s,t)[1].scale,1,1e-6);
  const end=run(s,3).virtualCamera,layers=projected(s,3);assert.equal(Math.sign(end.z),Math.sign(travel));assert.equal(Math.sign(end.focalLength-1600),-Math.sign(travel));
  assert.notEqual(layers[0].scale,layers[2].scale);
 }
});

test('rack focus interpolates calibrated depth, holds and targets layers',()=>{
 const s=scene();s.cameraMoves=[move('rackFocus',{focusFrom:0,focusTo:1,strength:.8})];
 let camera=run(s,2).virtualCamera;near(camera.focus.depth,.5);near(focusBlur(.5,camera.focus),0);assert.ok(focusBlur(0,camera.focus)>0);near(focusBlur(0,camera.focus),focusBlur(1,camera.focus));
 near(run(s,4).virtualCamera.focus.depth,1);assert.equal(run(s,0).virtualCamera.focus,undefined);
 s.cameraMoves[0].layerId='l1';near(run(s,3).virtualCamera.focus.depth,.5);near(run(s,2,0).virtualCamera.focus.strength,0);
});

test('orbit arcs around subject with stable framing, parallax, radius and elevation',()=>{
 const s=scene();s.cameraMoves=[move('orbit',{angle:10,radius:1,elevation:.02,layerId:'l1'})];
 const start=projected(s,1),end=projected(s,3),camera=run(s,3).virtualCamera;
 near(end[1].x,start[1].x);near(end[1].y,start[1].y);assert.notEqual(end[0].x,end[2].x);assert.notEqual(camera.x,0);assert.notEqual(camera.y,0);
 s.cameraMoves[0].angle=-10;assert.ok(Math.sign(run(s,3).virtualCamera.x)!==Math.sign(camera.x));
 s.cameraMoves[0].radius=.9;assert.notEqual(run(s,3).virtualCamera.z,camera.z);
});

test('transient effects return to a composed base pose and the latest focus wins',()=>{
 const s=scene();s.cameraMoves=[move('truck',{id:'truck',start:0,duration:1,x:500}),move('impact',{strength:1}),move('handheld',{strength:1,speed:1,seed:12}),move('rackFocus',{id:'focusA',start:0,focusFrom:0,focusTo:.5,strength:.5}),move('rackFocus',{id:'focusB',start:2,focusFrom:1,focusTo:.75,strength:.5})];
 const early=run(s,1.5).virtualCamera,after=run(s,4).virtualCamera;
 near(after.x,100);near(after.y,0);near(after.roll,0);near(early.focus.depth,.375);near(after.focus.depth,.75);
 const core=compileCamera(s),first=core.evaluateTime(2.4);core.evaluateTime(8);core.evaluateTime(0);assert.deepEqual(core.evaluateTime(2.4),first);
});

test('advanced moves validate, persist, and compose with unversioned moves',()=>{
 const s=scene();s.cameraMoves=[{id:'old',type:'pan',start:0,duration:2,x:500,y:300,scale:1},move('dutch',{angle:10}),move('handheld',{strength:.4,speed:1,seed:7}),move('rackFocus',{focusFrom:0,focusTo:1,strength:.5})];
 const p=createProject('Advanced');p.scenes=[s];const restored=validateProject(JSON.parse(JSON.stringify(p)));assert.deepEqual(restored.scenes[0].cameraMoves,s.cameraMoves);
 const state=compileCamera(restored.scenes[0]).evaluateTime(2);assert.equal(state.compositeCamera.x,100);assert.ok(state.virtualCamera.roll!==0);assert.ok(state.virtualCamera.focus);
 const bad=[move('dutch',{angle:31}),move('handheld',{strength:1,speed:1,seed:1.5}),move('impact',{strength:NaN}),move('whip',{angle:2,blur:'yes'}),move('dollyZoom',{travel:.3}),move('rackFocus',{focusFrom:0,focusTo:2,strength:.5}),move('orbit',{angle:13,radius:1,elevation:0}),move('orbit',{angle:1,radius:1,elevation:0,layerId:'missing'}),move('dutch',{angle:5,model:undefined})];
 for(const invalid of bad){const copy=scene();copy.cameraMoves=[invalid];assert.throws(()=>compileCamera(copy),undefined,invalid.type);}
});
