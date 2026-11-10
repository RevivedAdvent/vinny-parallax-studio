import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { exportStoryVideo } from './export-story-video.mjs';
import { launchCamera } from './camera-runtime.mjs';
import { effectTrack } from '../src/camera/animation.ts';

const dir=resolve('output/phase3');await mkdir(dir,{recursive:true});
const project=JSON.parse(await readFile(resolve(dir,'animated-project.json'),'utf8'));
const original=JSON.stringify(project),first=project.scenes[0];
assert.equal(first.fps,24);assert.equal(first.animationTracks.length,7);
const second=structuredClone(first);second.id='independent-second';second.title='Independent second scene';second.totalFrames=48;
second.layers[0].x=-300;second.layers[0].scale*=.75;second.tracks=[];second.animationTracks=[
 effectTrack({id:'second-pan',target:'camera',property:'x',start:0,duration:2,from:0,to:-180,easing:'linear',intensity:1},second),
 effectTrack({id:'second-fade',target:`layer:${second.layers[3].id}`,property:'opacity',start:0,duration:1,from:.2,to:1,easing:'linear',intensity:1},second),
];
project.scenes.push(second);await writeFile(resolve(dir,'two-scene-project.json'),JSON.stringify(project,null,2));
const firstRuntime=await launchCamera({config:first,intensity:1});
try {
 for(const time of [0,1,1.5,2,3,4]) {
 const png=await firstRuntime.page.evaluate(t=>{window.cameraStudio.renderTime(t);return window.cameraStudio.capture().png;},time);
 await writeFile(resolve(dir,`preview-${time}.png`),Buffer.from(png.split(',')[1],'base64'));
 }
}finally{await firstRuntime.close();}
const runtime=await launchCamera({config:second,intensity:1});
try {
 for(const time of [0,1,119/60]) {
 const result=await runtime.page.evaluate(t=>{window.cameraStudio.renderTime(t);return {png:window.cameraStudio.capture().png,state:window.cameraStudio.getState()};},time);
 if(time===0){assert.equal(result.state.state.dollyDelta,0);assert.equal(result.state.state.x,0);}
 await writeFile(resolve(dir,`second-preview-${time}.png`),Buffer.from(result.png.split(',')[1],'base64'));
 }
}finally{await runtime.close();}
const results={};
for(const mode of ['current','all']) {
 console.log(`Exporting animated ${mode}…`);
 const output=resolve(dir,`animated-${mode}.mp4`);
 results[mode]=await exportStoryVideo({project,sceneId:mode==='current'?first.id:undefined,output,onPhase:(...phase)=>console.log(mode,...phase)});
 const expected=mode==='current'?300:420;assert.equal(results[mode].frames,expected);assert.equal(results[mode].duration,expected/60);
 assert.equal(project.scenes[0].fps,24);assert.equal(JSON.stringify(project.scenes[0]),JSON.stringify(JSON.parse(original).scenes[0]),'export does not modify project');
 const probe=spawnSync('ffprobe',['-v','error','-count_frames','-show_entries','stream=codec_name,width,height,pix_fmt,avg_frame_rate,nb_read_frames:format=duration','-of','json',output],{encoding:'utf8'});
 assert.equal(probe.status,0,probe.stderr);const metadata=JSON.parse(probe.stdout),stream=metadata.streams[0];
 assert.equal(stream.codec_name,'h264');assert.equal(stream.width,1920);assert.equal(stream.height,1080);assert.equal(stream.pix_fmt,'yuv420p');assert.equal(stream.avg_frame_rate,'60/1');assert.equal(Number(stream.nb_read_frames),expected);
 results[mode].ffprobe=metadata;
}
function rgb(file,frame=0) {
 const args=['-hide_banner','-loglevel','error','-i',file,'-vf',`select=eq(n\\,${frame})`,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'];
 const r=spawnSync('ffmpeg',args,{maxBuffer:16*1024*1024});assert.equal(r.status,0,r.stderr.toString());assert.equal(r.stdout.length,1920*1080*3);return r.stdout;
}
function difference(a,b) {let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);return sum/a.length;}
const comparisons=[];
for(const mode of ['current','all']) {
 let previous;
 for(const time of [0,1,1.5,2,3,4]){
 const video=rgb(resolve(dir,`animated-${mode}.mp4`),time*60),preview=rgb(resolve(dir,`preview-${time}.png`)),mae=difference(video,preview);
 assert.ok(mae<3,`${mode} ${time}s preview/export RGB mean error ${mae}`);
 if(previous&&time<=3)assert.ok(difference(video,previous)>1,`actual video changes at ${time}s`);
 comparisons.push({mode,time,meanAbsoluteError:mae});previous=video;
 const extract=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',resolve(dir,`animated-${mode}.mp4`),'-vf',`select=eq(n\\,${time*60})`,'-frames:v','1',resolve(dir,`${mode}-frame-${time}.png`)]);assert.equal(extract.status,0,extract.stderr.toString());
 }
}
const all=resolve(dir,'animated-all.mp4');
for(const [frame,reference] of [[299,'preview-4.png'],[300,'second-preview-0.png'],[360,'second-preview-1.png'],[419,`second-preview-${119/60}.png`]]) {
 const mae=difference(rgb(all,frame),rgb(resolve(dir,reference)));assert.ok(mae<3,`hard cut/independent scene frame ${frame}: ${mae}`);comparisons.push({frame,reference,meanAbsoluteError:mae});
}
assert.ok(difference(rgb(all,299),rgb(all,300))>10,'visible hard cut exactly at frame 300');
await writeFile(resolve(dir,'export-results.json'),JSON.stringify({pass:true,results,comparisons},null,2));
console.log('Animated exports passed: real artwork, 24 FPS source sampled at 60 FPS, changing camera and layer pixels, preview match, opacity, exact hard cut, independent scene state, H.264 metadata.');
