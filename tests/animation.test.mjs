import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene, validateProject, createProject } from '../src/studio/project.ts';
import { compileCamera } from '../src/camera/evaluate.ts';
import { projectLayers, projectedLayerInfo } from '../src/camera/project.ts';
import { validateScene } from '../src/camera/validate.ts';
import { effectTrack, putKeyframe, deleteKeyframe, snapSecond, secondsToFrame, sceneDuration, legacyKeyframes, keyframeValue, effectDuration, editEffectTiming } from '../src/camera/animation.ts';
const make = () => { const s=createScene('Animation',10,1920,1080,24);s.layers=Array.from({length:4},(_,i)=>({id:`l${i}`,name:`Art ${i}`,asset:'/art.png',depth:i/3}));return s; };
const effect = (s, overrides={}) => effectTrack({id:'effect',target:'camera',property:'x',start:2,duration:3,from:0,to:120,easing:'linear',intensity:1,...overrides},s);
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);
test('ordered creation, replacement, deletion, snapping and original timebase',()=>{
 const s=make(), t=effect(s);assert.equal(sceneDuration(s),10);assert.equal(secondsToFrame(1,24),24);assert.equal(secondsToFrame(1,60),60);
 assert.equal(snapSecond(1.6,10),2);assert.equal(snapSecond(-1,10),0);assert.equal(snapSecond(10.8,10.5),10);
 const added=putKeyframe(t,{id:'middle',timeSeconds:3,value:30,easing:'ease_out'});assert.deepEqual(added.keyframes.map(k=>k.timeSeconds),[2,3,5]);
 assert.equal(putKeyframe(added,{...added.keyframes[1],timeSeconds:1}).keyframes[0].id,'middle');
 assert.equal(deleteKeyframe(added,'middle').keyframes.length,2);assert.equal(t.keyframes.length,2);
});
test('editable effect timing, duration edits, disabled/reset state and later movement',()=>{
 const s=make(),x=effectTrack({id:'x-a',target:'layer:l0',property:'x',start:0,duration:3,from:500,to:800,easing:'linear',intensity:1},s);
 s.animationTracks=[x];let core=compileCamera(s);near(core.evaluateTime(1.5).layers.l0.x,650);
 const resized=editEffectTiming(x,0,5,s);assert.equal(effectDuration(resized),5);s.animationTracks=[resized];core=compileCamera(s);near(core.evaluateTime(2.5).layers.l0.x,650);assert.equal(core.evaluateTime(2.5).layers.l0.zoom,1);
 // A single property lane stores sequential movements as additional keyframes.
 const later=putKeyframe(putKeyframe(resized,{id:'later-start',timeSeconds:7,value:800,easing:'linear'}),{id:'later-end',timeSeconds:10,value:900,easing:'linear'});
 const multi={...s,animationTracks:[later]};core=compileCamera(multi);assert.equal(core.evaluateTime(5).layers.l0.x,800);near(core.evaluateTime(8.5).layers.l0.x,850);
 const disabled={...resized,enabled:false};core=compileCamera({...s,animationTracks:[disabled]});assert.equal(core.evaluateTime(2).layers.l0.x,0,'disabled effect falls back to the base/neutral transform');
 const removed=compileCamera({...s,animationTracks:[]}).evaluateTime(1.5);assert.equal(removed.layers.l0.x,0,'deleting effect restores base transform');
});
test('durations, boundaries, interpolation and hold after end',()=>{
 for(const duration of [1,2,3,5,2.5]) { const s=make();s.animationTracks=[effect(s,{duration})];const core=compileCamera(s);
 assert.equal(core.evaluateTime(1.5).x,0);assert.equal(core.evaluateTime(2).x,0);near(core.evaluateTime(2+duration/2).x,60);assert.equal(core.evaluateTime(2+duration).x,120);assert.equal(core.evaluateTime(10).x,120); }
 assert.throws(()=>effect(make(),{duration:9}),/fit/);
});
test('all segment easings and exact points',()=>{
 const s=make();for(const easing of ['linear','ease_in','ease_out','ease_in_out','hold','overshoot_settle']) {
 const t=effect(s,{easing});assert.equal(keyframeValue(t,2),0);assert.equal(keyframeValue(t,5),120);
 if(easing==='hold')assert.equal(keyframeValue(t,4.9),0);
 if(easing==='ease_in')near(keyframeValue(t,3.5),30);
 if(easing==='ease_out')near(keyframeValue(t,3.5),90);
 if(easing==='overshoot_settle')assert.ok(keyframeValue(t,4)>120);
 }
});
test('safe validation: values clamp, malformed data reject; validation owns copy',()=>{
 const s=make();s.animationTracks=[effect(s,{target:'layer:l0',property:'opacity',from:-10,to:10})];const v=validateScene(s);assert.equal(v.animationTracks[0].keyframes[0].value,0);assert.equal(v.animationTracks[0].keyframes[1].value,1);assert.equal(s.animationTracks[0].keyframes[0].value,-10);
 for(const mutate of [t=>t.target='layer:missing',t=>t.keyframes[1].id=t.keyframes[0].id,t=>t.keyframes[1].timeSeconds=2,t=>t.keyframes[0].timeSeconds=11,t=>t.keyframes[0].value=NaN,t=>t.keyframes[0].easing='bad',t=>t.keyframes=[],t=>t.property='depth']) {
 const c=make();c.animationTracks=[effect(c)];mutate(c.animationTracks[0]);assert.throws(()=>validateScene(c)); }
 const c=make();c.animationTracks=[effect(c),effect(c,{id:'other'})];assert.throws(()=>validateScene(c),/one animation track/);
 c.animationTracks[1].property='y';c.animationTracks[1].keyframes[0].id=c.animationTracks[0].keyframes[0].id;assert.throws(()=>validateScene(c),/Keyframe IDs/);
 c.animationTracks[1].id=c.animationTracks[0].id;assert.throws(()=>validateScene(c),/track IDs/);
});
test('dolly differs from uniform zoom, pan and tilt preserve direction and depth; static preserves layers',()=>{
 for(const property of ['dolly','zoom','x','y'])for(const sign of [-1,1]) {
 const s=make(),base=property==='dolly'||property==='zoom'?1:0;s.animationTracks=[effect(s,{property,from:base,to:base+sign*(base?.2:120)})];
 const core=compileCamera(s),state=core.evaluateTime(5),poses=projectLayers(s,state);
 const camera=state.virtualCamera;
 if(property==='zoom') {near(state.zoom,1+sign*.2);near(camera.focalLength,3840*(1+sign*.2));poses.forEach(p=>near(projectedLayerInfo(s,p,camera).scale,1+sign*.2));}
 else if(property==='dolly') {near(state.zoom,1+sign*.2);assert.equal(Math.sign(camera.z),sign);assert.ok(Math.abs(camera.z)>0);const projected=poses.map(p=>projectedLayerInfo(s,p,camera));assert.ok(sign>0?projected[3].scale>projected[0].scale:projected[3].scale<projected[0].scale,'dolly changes relative depth scale in the correct direction');}
 else {near(camera[property],sign*120);const projected=poses.map(p=>projectedLayerInfo(s,p,camera));const centre=property==='x'?960:540;
  projected.forEach(p=>assert.ok(Math.sign(p[property]-centre)===-sign,`${property} moves in the expected direction`));
  assert.ok(Math.abs(projected[3][property]-centre)>Math.abs(projected[0][property]-centre),'near layers respond more strongly');
  assert.ok(Object.values(state.layers).every(pose=>pose.x===0&&pose.y===0),'camera animation is not baked into local layer transforms');}
 assert.deepEqual(poses.map(p=>p.id),s.layers.map(l=>l.id));
 }
 const s=make();s.animationTracks=[effect(s,{target:'layer:l0'})];const state=compileCamera(s).evaluateTime(5);assert.equal(state.x,0);assert.equal(state.zoom,1);assert.equal(state.layers.l0.x,120);
});
test('four layers move independently; opacity reaches renderer projection; arbitrary seeks are deterministic',()=>{
 const s=make();s.animationTracks=[['l0','x',80],['l1','y',60],['l2','zoom',1.5],['l3','rotation',90],['l3','opacity',0]].map(([id,property,to],i)=>effect(s,{id:`t${i}`,target:`layer:${id}`,property,from:['zoom','opacity'].includes(property)?1:0,to}));
 s.animationTracks.push(effect(s,{id:'camera',property:'dolly',from:1,to:1.2}));const core=compileCamera(s),end=core.evaluateTime(5);
 assert.equal(end.layers.l0.x,80);assert.equal(end.layers.l0.y,0);assert.equal(end.layers.l1.y,60);assert.equal(end.layers.l2.zoom,1.5);assert.equal(end.layers.l3.roll,90);assert.equal(projectLayers(s,end)[3].opacity,0);
 const middle=core.evaluateTime(3.5);assert.equal(middle.layers.l3.opacity,.5);for(const t of [10,0,5,2,1,3.5])core.evaluateTime(t);assert.deepEqual(core.evaluateTime(3.5),middle);
});
test('layer scale/rotation bounds are independent of restrictive legacy camera bounds',()=>{
 const s=make();s.camera.limits.zoom={min:1,max:1.18};s.camera.limits.roll={min:-3,max:3};s.animationTracks=[effect(s,{target:'layer:l0',property:'zoom',from:1,to:2}),effect(s,{id:'rotate',target:'layer:l0',property:'rotation',to:90})];const state=compileCamera(s).evaluateTime(5);assert.equal(state.layers.l0.zoom,2);assert.equal(state.layers.l0.roll,90);
});
test('legacy positions use source FPS; loading/saving does not mutate or discard legacy tracks',()=>{
 const s=make();s.tracks=[{id:'old',target:'camera',property:'x',startFrame:24,endFrame:72,startValue:0,endValue:100,easing:'linear',intensity:1,limits:{min:-100,max:100}}];
 const instant=legacyKeyframes({...s.tracks[0],startFrame:24,endFrame:24},24);assert.equal(instant.keyframes.length,1);assert.equal(instant.keyframes[0].value,100);
 assert.throws(()=>legacyKeyframes({...s.tracks[0],holdAfter:false},24),/Keep this legacy/);
 const t=legacyKeyframes(s.tracks[0],s.fps);assert.deepEqual(t.keyframes.map(k=>k.timeSeconds),[1,3]);assert.equal(compileCamera(s).evaluateTime(2).x,50);
 const p=createProject('Legacy');p.scenes=[s];const before=JSON.stringify(p),loaded=validateProject(p);assert.equal(JSON.stringify(p),before);assert.deepEqual(loaded.scenes[0].tracks,s.tracks);assert.equal(loaded.scenes[0].fps,24);
 s.animationTracks=[effect(s,{start:1,duration:2,to:80})];assert.equal(compileCamera(s).evaluateTime(2).x,40,'authored channel overrides rather than accumulates');
});
