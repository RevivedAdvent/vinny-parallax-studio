import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { CAMERA_PROOF } from '../src/scenes/camera-proof.ts';
import { ease, drift } from '../src/camera/easing.ts';
import { validateScene } from '../src/camera/validate.ts';
import { compileCamera, trackValue } from '../src/camera/evaluate.ts';
import { projectLayers } from '../src/camera/project.ts';

const clone = () => structuredClone(CAMERA_PROOF);
function track(overrides = {}) {
  return { id:'test', target:'camera', property:'x', startFrame:10, endFrame:30,
    startValue:0, endValue:20, easing:'ease_in_out', intensity:1, limits:{min:-80,max:80}, ...overrides };
}
function only(t) { const c=clone(); c.tracks=[t]; return validateScene(c); }
const close = (a,b,eps=1e-10) => assert.ok(Math.abs(a-b)<eps, `${a} != ${b}`);

test('all seven easings have exact endpoints', () => {
  for (const name of ['linear','ease_in','ease_out','ease_in_out','overshoot_settle','hold','seeded_noise']) {
    assert.equal(ease(name,0),0); assert.equal(ease(name,1),1);
  }
});
test('cinematic easing shapes and overshoot', () => {
  close(ease('ease_in',0.5),0.25); close(ease('ease_out',0.5),0.75);
  close(ease('ease_in_out',0.5),0.5); assert.ok(ease('overshoot_settle',0.7)>1);
  assert.equal(ease('hold',0.99),0);
});
test('inclusive track frames, endpoints, hold, and one-frame track', () => {
  const t=track(); assert.equal(trackValue(t,9,24),0); assert.equal(trackValue(t,10,24),0);
  assert.equal(trackValue(t,30,24),20); assert.equal(trackValue(t,575,24),20);
  assert.equal(trackValue({...t,holdAfter:false},31,24),0);
  assert.equal(trackValue(track({startFrame:20,endFrame:20}),20,24),20);
});
test('static hold does not move', () => {
  const t=track({startValue:10,endValue:10,easing:'hold'});
  for(let f=10;f<576;f++) assert.equal(trackValue(t,f,24),10);
});
test('seeded noise is random-access, bounded, and exact at endpoints', () => {
  const t=track({startFrame:0,endFrame:575,startValue:0,endValue:0,easing:'seeded_noise',noise:{seed:842,amplitude:3,frequency:0.8}});
  const values=Array.from({length:576},(_,f)=>trackValue(t,f,24));
  assert.equal(values[0],0); assert.equal(values[575],0);
  for(let f=575;f>=0;f--) { assert.equal(trackValue(t,f,24),values[f]); assert.ok(Math.abs(values[f])<=3); }
  assert.notEqual(drift(2.3,842),drift(2.3,843));
});
test('noise validation needs seed and clamps amplitude', () => {
  assert.throws(()=>only(track({easing:'seeded_noise'})),/noise config/);
  const c=only(track({easing:'seeded_noise',noise:{seed:3,amplitude:90,frequency:90}}));
  assert.equal(c.tracks[0].noise.amplitude,3); assert.equal(c.tracks[0].noise.frequency,6);
});
test('frame 120 evaluates identically after unrelated seeks', () => {
  const core=compileCamera(clone()), a=core.evaluate(120);
  core.evaluate(575); core.evaluate(0); assert.deepEqual(core.evaluate(120),a);
});
test('sequential state evaluation equals direct seek to frame 500', () => {
  const core=compileCamera(clone()), direct=core.evaluate(500); let sequential;
  for(let f=0;f<=500;f++) sequential=core.evaluate(f);
  assert.deepEqual(sequential,direct);
});
test('exactly 576 legal frame indexes, no extra frame 576', () => {
  const core=compileCamera(clone()); let count=0;
  for(let f=0;f<576;f++) {core.evaluate(f);count++;} assert.equal(count,576);
  for(const f of [-1,576,120.5,NaN,Infinity]) assert.throws(()=>core.evaluate(f),/frameIndex/);
});
test('zero intensity equals no-track baseline at every frame', () => {
  const c=clone(), core=compileCamera(c); c.tracks=[]; const baseline=compileCamera(c);
  for(let f=0;f<576;f++) assert.deepEqual(core.evaluate(f,0),baseline.evaluate(f));
});
test('track intensity zero is also a no-op', () => {
  const c=only(track({startValue:20,endValue:20,intensity:0}));
  assert.equal(compileCamera(c).evaluate(20).x,0);
});
test('intensities clamp and nonfinite intensities reject', () => {
  const core=compileCamera(clone()); assert.deepEqual(core.evaluate(200,-10),core.evaluate(200,0));
  assert.deepEqual(core.evaluate(200,99),core.evaluate(200,1));
  for(const n of [NaN,Infinity]) assert.throws(()=>core.evaluate(1,n),/finite/);
});
test('input values, depth, headroom, and roll limits clamp', () => {
  const c=clone();c.camera.baseZoom=3;c.layers[0].depth=-1;c.layers[1].depth=2;
  c.camera.limits.roll={min:-90,max:90}; c.tracks=[track({property:'roll',startValue:90,endValue:90,limits:{min:-90,max:90},intensity:2})];
  const v=validateScene(c); assert.equal(v.camera.baseZoom,2); assert.equal(v.layers[0].depth,0); assert.equal(v.layers[1].depth,1);
  assert.equal(compileCamera(v).evaluate(20).roll,3);
  assert.equal(c.layers[0].depth,-1,'validation does not mutate input');
});
test('summed track contributions obey final property bounds', () => {
  const c=clone();c.tracks=[track({id:'a',startValue:80,endValue:80}),track({id:'b',startValue:80,endValue:80})];
  assert.equal(compileCamera(c).evaluate(20).x,80);
});
test('track order cannot change composition', () => {
  const c=clone(); const a=compileCamera(c).evaluate(300);c.tracks.reverse();assert.deepEqual(compileCamera(c).evaluate(300),a);
});
test('optical zoom scales every layer uniformly', () => {
  const c=only(track({property:'zoom',startValue:1,endValue:1.12,limits:{min:1,max:1.18},projection:'uniform'}));
  const poses=projectLayers(c,compileCamera(c).evaluate(30));
  for(const pose of poses) close(pose.scale,1.15*1.12);
});
test('dolly scale delta exactly follows layer depth', () => {
  const c=only(track({property:'zoom',startValue:1,endValue:1.12,limits:{min:1,max:1.18},projection:'dolly'}));
  const poses=projectLayers(c,compileCamera(c).evaluate(30));
  poses.forEach((p,i)=>close(p.scale/1.15-1,0.12*c.layers[i].depth));
  assert.ok(poses[0].scale<poses[3].scale);
});
test('x/y translation ratios follow depths and sign convention', () => {
  const c=only(track({startValue:20,endValue:20}));
  let p=projectLayers(c,compileCamera(c).evaluate(20));p.forEach((v,i)=>close(v.x-960,-20*c.layers[i].depth));
  c.tracks=[track({property:'y',startValue:20,endValue:20})];
  p=projectLayers(c,compileCamera(c).evaluate(20));p.forEach((v,i)=>close(v.y-540,-20*c.layers[i].depth));
});
test('combined zoom/dolly clamp near-field scale contribution', () => {
  const c=clone(); c.tracks=['uniform','dolly'].map((projection,i)=>track({id:String(i),property:'zoom',startValue:1.18,endValue:1.18,projection,limits:{min:1,max:1.18}}));
  const state=compileCamera(c).evaluate(20);close(state.zoom,1.18);
  close(projectLayers(c,state)[3].scale,1.15*1.18);
});
test('layer-targeted tracks do not move other layers', () => {
  const c=only(track({target:'layer:foreground',startValue:20,endValue:20}));
  const p=projectLayers(c,compileCamera(c).evaluate(20));assert.equal(p[3].x,980);assert.equal(p[0].x,960);
});
test('invalid identity, targets, timing, projection and limits reject', () => {
  const bad=[track({target:'layer:missing'}),track({endFrame:576}),track({startFrame:31,endFrame:30}),track({property:'x',projection:'dolly'}),track({limits:{min:50,max:-50}}),track({startValue:NaN})];
  for(const t of bad) assert.throws(()=>only(t));
  const c=clone();c.tracks=[track(),track()];assert.throws(()=>validateScene(c),/unique/);
});
test('core closure owns scene data and returned snapshots', () => {
  const c=clone(), core=compileCamera(c), before=core.evaluate(300);
  c.tracks=[];core.config().tracks=[];assert.deepEqual(core.evaluate(300),before);
});
test('all normalized layers exist at registered full-canvas dimensions', async () => {
  for(const l of CAMERA_PROOF.layers) {
    const url=new URL('../public'+l.asset,import.meta.url);await access(url);
    const png=await readFile(url);assert.equal(png.readUInt32BE(16),1920);assert.equal(png.readUInt32BE(20),1080);
  }
});
test('no wall-clock, ticker, scheduling, DOM or unseeded randomness in camera-state modules', async () => {
  for(const name of ['types','easing','validate','evaluate','project']) {
    const code=await readFile(new URL(`../src/camera/${name}.ts`,import.meta.url),'utf8');
    assert.doesNotMatch(code,/\b(?:performance|Date)\s*\.|Math\s*\.\s*random\s*\(|\b(?:requestAnimationFrame|setInterval|setTimeout|deltaTime|document|window)\b/);
  }
});
