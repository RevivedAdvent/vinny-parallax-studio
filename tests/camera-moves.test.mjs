import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene, createProject, validateProject } from '../src/studio/project.ts';
import { compileCamera } from '../src/camera/evaluate.ts';
import { projectLayers } from '../src/camera/project.ts';

const make = () => {
 const s=createScene('Moves',10,800,600,24);
 s.layers=[0,.5,1].map((depth,i)=>({id:`l${i}`,name:`Layer ${i}`,asset:'/test.png',depth}));
 return s;
};
const move = (type,options={}) => ({id:type,type,start:2,duration:4,x:600,y:450,scale:type==='pull'?.5:2,...options});
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const pose = (s,t) => {const core=compileCamera(s);return projectLayers(core.config(),core.evaluateTime(t));};

test('every move is linear, holds its endpoint and ignores layer depth',()=>{
 for(const type of ['push','pull','pan','tilt','zoom']) {
  const s=make();s.cameraMoves=[move(type)];
  for(const t of [0,2,3,4,6,9]) {
   const layers=pose(s,t);layers.forEach(p=>{near(p.x,layers[0].x);near(p.y,layers[0].y);near(p.scale,layers[0].scale);});
  }
  const before=pose(s,2)[0],quarter=pose(s,3)[0],half=pose(s,4)[0],end=pose(s,6)[0];
  if(type==='pan'){near(quarter.x,350);near(half.x,300);near(end.x,200);near(end.y,300);}
  if(type==='tilt'){near(quarter.y,262.5);near(half.y,225);near(end.y,150);near(end.x,400);}
  if(type==='zoom'){near(end.x,400);near(end.y,300);near(quarter.scale,1.25);near(end.scale,2);}
  if(type==='pull'){near(end.scale,.5);near(end.x,400);near(end.y,300);}
  if(type==='push'){near(end.scale,2);near(end.x,0);near(end.y,0);near(end.x+(600-400)*end.scale,400);near(end.y+(450-300)*end.scale,300);}
  near(before.scale,1);assert.deepEqual(pose(s,9),pose(s,6));
 }
});
test('both directions and sequential absolute coordinates work',()=>{
 for(const [type,key,coordinate,expected] of [['pan','x',200,600],['pan','x',600,200],['tilt','y',100,500],['tilt','y',500,100]]) {
  const s=make();s.cameraMoves=[move(type,{[key]:coordinate})];near(pose(s,6)[0][key],expected);
 }
 const s=make();s.cameraMoves=[move('pan',{x:600}),move('pan',{id:'second',start:6,duration:2,x:300})];near(pose(s,8)[0].x,500);
 for(const factor of [.5,2]){s.cameraMoves=[move('zoom',{scale:factor})];near(pose(s,6)[0].scale,factor);}
});
test('moves compose, intensity works, and random seeks are deterministic',()=>{
 const s=make();s.cameraMoves=[move('pan'),move('zoom',{id:'zoom'})];const core=compileCamera(s);
 const full=core.evaluateTime(6),half=core.evaluateTime(6,.5);
 near(full.compositeCamera.x,200);near(full.compositeCamera.scale,2);near(half.compositeCamera.x,100);near(half.compositeCamera.scale,1.5);
 const snapshot=core.evaluateTime(3.4);for(const t of [0,10,4,1])core.evaluateTime(t);assert.deepEqual(core.evaluateTime(3.4),snapshot);
});
test('validation rejects invalid movement data and project round trips',()=>{
 for(const change of [m=>m.type='bad',m=>m.id='',m=>m.start=-1,m=>m.duration=0,m=>m.start=9,m=>m.x=801,m=>m.y=-1,m=>m.scale=NaN,m=>m.scale=.5]) {
  const s=make();s.cameraMoves=[move('push')];change(s.cameraMoves[0]);assert.throws(()=>compileCamera(s));
 }
 const s=make();s.cameraMoves=[move('pull',{scale:2})];assert.throws(()=>compileCamera(s));
 s.cameraMoves=[move('pan'),move('pan')];assert.throws(()=>compileCamera(s),/IDs/);
 s.cameraMoves=[move('push')];const p=createProject('Test');p.scenes=[s];assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))).scenes[0].cameraMoves,s.cameraMoves);
});
test('layer transforms and legacy camera animation remain compatible',()=>{
 const s=make();s.layers[1].x=60;s.cameraMoves=[move('pan')];const p=pose(s,6);near(p[1].x-p[0].x,60);near(p[2].x,p[0].x);
 s.cameraMoves=[];s.tracks=[{id:'old',target:'camera',property:'x',startFrame:0,endFrame:24,startValue:0,endValue:100,easing:'ease_in',intensity:1,limits:{min:-100,max:100}}];
 const legacy=pose(s,1);near(legacy[0].x,400);near(legacy[2].x,300);
});
