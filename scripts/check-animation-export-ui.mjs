// Exercise real buttons, HTTP service, job polling and downloaded animated MP4s.
import { launch } from './runtime.mjs';
import { createServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const port=await new Promise((resolvePort,reject)=>{const s=createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolvePort(port));});});
process.env.EXPORT_SERVICE_URL=`http://127.0.0.1:${port}`;
const runtime=await launch();let service;
try {
 service=spawn(process.execPath,['scripts/export-server.mjs'],{env:{...process.env,EXPORT_PORT:String(port),EXPORT_ALLOWED_ORIGINS:runtime.url},stdio:['ignore','pipe','pipe']});
 service.stderr.on('data',d=>process.stderr.write(d));
 await new Promise((resolveReady,reject)=>{const timer=setTimeout(()=>reject(new Error('Export service start timeout')),15000);service.on('error',reject);service.on('exit',code=>{if(code!==0)reject(new Error(`Export service exited ${code}`));});service.stdout.on('data',d=>{if(String(d).includes('listening')){clearTimeout(timer);resolveReady();}});});
 const project=JSON.parse(await readFile('output/phase3/two-scene-project.json','utf8'));
 const page=await runtime.browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(runtime.url);await page.waitForFunction(()=>window.cameraStudio?.ready);
 await page.locator('#project-file').setInputFiles({name:'animated.story.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
 await page.waitForFunction(()=>{try{return window.cameraStudio.getState().config.animationTracks?.length===7;}catch{return false;}},null,{timeout:60000});
 await page.locator('[data-tab="export"]').click();
 const results=[];
 for(const [scope,frames] of [['current',300],['all',420]]) {
  await page.locator(`#export-${scope}`).click();assert.equal(await page.locator(`#export-${scope}`).isDisabled(),true);
  await page.waitForFunction(scope=>/Ready|failed/.test(document.querySelector(`#${scope}-status`).textContent),scope,{timeout:600000});
  assert.match(await page.locator(`#${scope}-status`).textContent(),/^Ready/);
  const event=page.waitForEvent('download');await page.locator(`#${scope}-download`).click();const download=await event;
  const file=resolve(`output/phase3/ui-${scope}.mp4`);await download.saveAs(file);
  const probe=spawnSync('ffprobe',['-v','error','-count_frames','-show_entries','stream=codec_name,width,height,pix_fmt,avg_frame_rate,nb_read_frames:format=duration','-of','json',file],{encoding:'utf8'});assert.equal(probe.status,0,probe.stderr);const data=JSON.parse(probe.stdout),stream=data.streams[0];
  assert.equal(stream.codec_name,'h264');assert.equal(stream.width,1920);assert.equal(stream.height,1080);assert.equal(stream.avg_frame_rate,'60/1');assert.equal(stream.pix_fmt,'yuv420p');assert.equal(Number(stream.nb_read_frames),frames);
  const extract=n=>{const r=spawnSync('ffmpeg',['-v','error','-i',file,'-vf',`select=eq(n\\,${n})`,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{maxBuffer:8*1024*1024});assert.equal(r.status,0,r.stderr.toString());assert.equal(r.stdout.length,1920*1080*3);return r.stdout;};
  assert.notDeepEqual(extract(0),extract(30),'downloaded MP4 contains real animation');
  results.push({scope,filename:download.suggestedFilename(),metadata:data});console.log(`Animated UI ${scope} download passed (${frames} frames)`);
 }
 assert.deepEqual(errors,[]);await writeFile('output/phase3/export-ui-results.json',JSON.stringify({pass:true,results},null,2));
} finally {if(service){service.kill('SIGTERM');await new Promise(resolveExit=>service.exitCode!==null?resolveExit():service.once('exit',resolveExit));}await runtime.close();}
