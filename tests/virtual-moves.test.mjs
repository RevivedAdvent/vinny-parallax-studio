import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene, createProject, validateProject } from '../src/studio/project.ts';
import { compileCamera } from '../src/camera/evaluate.ts';
import { projectLayers, projectedLayerInfo } from '../src/camera/project.ts';
import { calibration, neutralCamera } from '../src/camera/virtual-projection.ts';

const scene = () => {
 const s=createScene('Virtual',10,800,600,24);
 s.layers=[0,1].map((depth,i)=>({id:`l${i}`,name:`Layer ${i}`,asset:'/art.png',depth}));
 return s;
};
const move = (type,extra={}) => ({id:type,model:2,type,start:0,duration:2,x:400,y:300,scale:1,travel:.2,...extra});
const near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
const evalAt=(s,t)=>{const core=compileCamera(s),cfg=core.config(),state=core.evaluateTime(t);return {state,layers:projectLayers(cfg,state).map(p=>projectedLayerInfo(cfg,p,state.virtualCamera))};};

test('neutral frame, dolly and anchored zoom preserve their distinct semantics',()=>{
 const s=scene();s.cameraMoves=[move('push',{scale:1.2})];
 let {state,layers}=evalAt(s,0);assert.deepEqual(state.virtualCamera,neutralCamera(calibration(800,600)));layers.forEach(p=>{near(p.x,400);near(p.y,300);near(p.scale,1);});
 ({state,layers}=evalAt(s,2));assert.ok(state.virtualCamera.z>0);near(state.virtualCamera.focalLength,1600);assert.ok(layers[1].scale>layers[0].scale);
 s.cameraMoves=[move('pull',{scale:.8})];({state,layers}=evalAt(s,2));assert.ok(state.virtualCamera.z<0);assert.ok(layers[1].scale<layers[0].scale);
 s.cameraMoves=[move('zoom',{scale:1.5,x:500,y:350})];({state,layers}=evalAt(s,2));near(state.virtualCamera.z,0);layers.forEach(p=>{near(p.scale,1.5);near(p.x,350);near(p.y,275);});
});

test('off-center dolly follows its viewing direction at constant physical speed',()=>{
 for(const type of ['push','pull']){
  const s=scene();s.cameraMoves=[move(type,{x:600,y:450,scale:type==='push'?1.2:.8})];
  const core=compileCamera(s),t=.9,dt=1e-4,a=core.evaluateTime(t).virtualCamera,b=core.evaluateTime(t+dt).virtualCamera;
  const velocity=['x','y','z'].map(k=>(b[k]-a[k])/dt), sign=type==='push'?1:-1;
  near(Math.hypot(...velocity),160,1e-4);
  near(velocity[0],sign*160*Math.sin(a.yaw)*Math.cos(a.pitch),.001);
  near(velocity[1],sign*160*Math.sin(a.pitch),.001);
  near(velocity[2],sign*160*Math.cos(a.yaw)*Math.cos(a.pitch),.001);
 }
});

test('pan and tilt rotate without translating; truck and diagonal translate without rotating',()=>{
 const s=scene();s.cameraMoves=[move('pan',{x:600})];let a=evalAt(s,2);assert.ok(a.state.virtualCamera.yaw>0);near(a.state.virtualCamera.x,0);
 s.cameraMoves=[move('truck',{x:600})];let b=evalAt(s,2);near(b.state.virtualCamera.yaw,0);near(b.state.virtualCamera.x,200);assert.notEqual(a.layers[0].x,b.layers[0].x);assert.notEqual(b.layers[0].x,b.layers[1].x);
 s.cameraMoves=[move('tilt',{y:100})];a=evalAt(s,2);assert.ok(a.state.virtualCamera.pitch<0);near(a.state.virtualCamera.x,0);near(a.state.virtualCamera.y,0);near(a.state.virtualCamera.z,0);
 s.cameraMoves=[move('diagonal',{x:600,y:100})];a=evalAt(s,2);near(a.state.virtualCamera.x,200);near(a.state.virtualCamera.y,-200);near(a.state.virtualCamera.yaw,0);near(a.state.virtualCamera.pitch,0);
});

test('crane follows an arc and adjusts its look direction unlike pedestal, in both directions',()=>{
 for(const y of [100,500]){
  const s=scene();s.cameraMoves=[move('pedestal',{y})];const pedestal=evalAt(s,2).state.virtualCamera;
  s.cameraMoves=[move('crane',{y,lookX:400,lookY:300})];const crane=evalAt(s,2).state.virtualCamera;
  near(pedestal.y,y-300);near(crane.y,y-300);near(pedestal.pitch,0);near(pedestal.z,0);assert.ok(crane.z>0);assert.ok(Math.sign(crane.pitch)===-Math.sign(crane.y));
 }
});

test('tracking follows an animated layer with existing orientation and zoom, including seeking',()=>{
 const s=scene();s.layers[1].x=50;
 s.animationTracks=[{id:'layer-x',target:'layer:l1',property:'x',intensity:1,keyframes:[{id:'a',timeSeconds:0,value:0,easing:'linear'},{id:'b',timeSeconds:10,value:200,easing:'linear'}]}];
 s.cameraMoves=[move('pan',{x:500,duration:1}),move('zoom',{scale:1.3,duration:1}),move('tracking',{layerId:'l1',x:480,y:260,duration:1})];
 for(const t of [1,2,5,9]){const {layers}=evalAt(s,t);near(layers[1].x,480,1e-6);near(layers[1].y,260,1e-6);}
 const core=compileCamera(s),first=core.evaluateTime(4.2);for(const t of [9,0,8,1])core.evaluateTime(t);assert.deepEqual(core.evaluateTime(4.2),first);
});

test('reveal changes selected layer only and leaves virtual camera neutral',()=>{
 const s=scene();s.cameraMoves=[move('reveal',{layerIds:['l1'],offsetX:120,offsetY:-80})];const {state,layers}=evalAt(s,2);
 assert.deepEqual(state.virtualCamera,neutralCamera(calibration(800,600)));near(layers[0].x,400);near(layers[0].y,300);near(layers[1].x,520);near(layers[1].y,220);
 near(evalAt(s,0).layers[1].x,400);
});

test('legacy and virtual moves survive project round trips without reinterpretation',()=>{
 const s=scene();const old={id:'old',type:'pan',start:0,duration:2,x:600,y:300,scale:1};s.cameraMoves=[old,move('push',{scale:1.2})];
 const p=createProject('Compatibility');p.scenes=[s];const saved=validateProject(JSON.parse(JSON.stringify(p)));
 assert.equal(saved.scenes[0].cameraMoves[0].model,2);assert.equal(saved.scenes[0].cameraMoves[0].legacyModel,1);assert.deepEqual(saved.scenes[0].cameraMoves[1],s.cameraMoves[1]);
 const state=compileCamera(saved.scenes[0]).evaluateTime(2);assert.ok(state.virtualCamera.x>0,'the old pan becomes a virtual pan');assert.ok(state.virtualCamera.z>0);
 const invalid=structuredClone(s);invalid.cameraMoves[1].model=3;assert.throws(()=>compileCamera(invalid),/Unsupported/);
});
