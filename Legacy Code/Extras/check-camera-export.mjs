import { spawnSync } from 'node:child_process';
import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { CAMERA_PROOF } from '../src/scenes/camera-proof.ts';
import { compileCamera } from '../src/camera/evaluate.ts';
import { projectLayers } from '../src/camera/project.ts';
import { projectRoot } from './runtime.mjs';

const masterDir=resolve(projectRoot,'output/camera-phase1');
const dir=resolve(projectRoot,process.argv[2]??'output/camera-phase1/export-check');
await mkdir(dir,{recursive:true});
function run(script,args,expectedError) {
  const result=spawnSync(process.execPath,[resolve(projectRoot,'scripts',script),...args],{cwd:projectRoot,encoding:'utf8',timeout:90000});
  if(expectedError) {assert.notEqual(result.status,0);assert.match(result.stderr,expectedError);}
  else {assert.equal(result.status,0,result.stdout+'\n'+result.stderr);console.log(result.stdout.trim());}
  return {status:result.status,stdout:result.stdout,stderr:result.stderr};
}
const master=JSON.parse(await readFile(resolve(masterDir,'manifest.json'),'utf8'));
run('render-frames.mjs',['--frame','120','--dir',resolve(dir,'single-frame')]);
const frame=await readFile(resolve(dir,'single-frame/frames/0120.png'));
assert.equal(createHash('sha256').update(frame).digest('hex'),master.frames[120].sha256);
const invalid=run('render-frames.mjs',['--frame','576','--dir',resolve(dir,'invalid-frame')],/Invalid --frame index/);
const reuse=structuredClone(CAMERA_PROOF);reuse.id='generic-three-layer-test';reuse.totalFrames=96;
reuse.layers=[reuse.layers[0],reuse.layers[1],reuse.layers[3]].map((l,i)=>({...l,id:['far','middle','front'][i],name:['Test far','Test middle','Test front'][i],depth:i/2}));
reuse.tracks=[{id:'different-story-path',target:'camera',property:'y',startFrame:0,endFrame:95,startValue:0,endValue:6,easing:'ease_out',intensity:1,limits:{min:-10,max:10}}];
await writeFile(resolve(dir,'reuse-fixture.json'),JSON.stringify({config:reuse,intensity:0.5},null,2));
run('render-frames.mjs',['--config',resolve(dir,'reuse-fixture.json'),'--frame','31','--dir',resolve(dir,'reuse-fixture')]);
const reused=JSON.parse(await readFile(resolve(dir,'reuse-fixture/frame-31.json'),'utf8'));
assert.equal(reused.frames.length,1);assert.equal(reused.intensity,0.5);
assert.deepEqual(reused.frames[0].transforms,projectLayers(reuse,compileCamera(reuse).evaluate(31,0.5)));
const unsafe=structuredClone(CAMERA_PROOF);unsafe.camera.baseZoom=1;
unsafe.tracks=[{id:'deliberately-unsafe',target:'camera',property:'zoom',projection:'uniform',startFrame:0,endFrame:0,startValue:0.9,endValue:0.9,easing:'hold',intensity:1,limits:{min:0.9,max:1}}];
await writeFile(resolve(dir,'unsafe-fixture.json'),JSON.stringify({config:unsafe,intensity:1},null,2));
const rejected=run('render-frames.mjs',['--config',resolve(dir,'unsafe-fixture.json'),'--dir',resolve(dir,'rejected-underscan')],/GAP FAIL at frame 0/);
const bad=JSON.parse(await readFile(resolve(dir,'rejected-underscan/manifest.json'),'utf8'));
assert.equal(bad.complete,false);assert.equal(bad.frames.length,1);assert.ok(bad.frames[0].coverage.uncoveredPixels>0);
await access(resolve(dir,'rejected-underscan/GAP-FAIL-frame-0.png'));
const blocked=run('export-video.mjs',[resolve(dir,'must-not-exist.mp4'),'--frames',resolve(dir,'rejected-underscan')],/Incomplete frame sequence/);
await assert.rejects(access(resolve(dir,'must-not-exist.mp4')));
const report={pass:true,singleFrame120MatchesMaster:true,invalidFrame576Rejected:invalid.status!==0,
  genericConfig:{layers:3,renamedIDs:true,frames:96,intensity:0.5,projectionMatchesPureEvaluator:true},
  underscanRejected:true,firstBadFrame:0,negativeCoverage:bad.frames[0].coverage,
  rejectedRenderError:rejected.stderr,rejectedEncodeError:blocked.stderr};
await writeFile(resolve(dir,'export-checks.json'),JSON.stringify(report,null,2));
console.log('EXPORT CHECKS PASSED: frame-N PNG/master equality, arbitrary layer IDs/count/duration/intensity, invalid index rejection, fail-fast gap evidence, and blocked unsafe MP4.');
