import { launch } from './runtime.mjs';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const dir=resolve('output/phase3');await mkdir(dir,{recursive:true});
const runtime=await launch(),errors=[];
try {
 const page=await runtime.browser.newPage({viewport:{width:1600,height:1050}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(runtime.url);await page.waitForFunction(()=>window.cameraStudio?.ready);
 await page.locator('#scene-duration').fill('5');await page.locator('#scene-duration').dispatchEvent('change');
 await page.locator('[data-tab="arrange"]').click();
 const files=(await readdir('test-images')).filter(n=>n.endsWith('.png')).sort();assert.equal(files.length,4);
 await page.locator('#asset-files').setInputFiles(files.map(n=>resolve('test-images',n)));
 await page.waitForFunction(()=>document.querySelectorAll('.layer-row').length===4);
 const layers=await page.evaluate(()=>window.cameraStudio.getState().config.layers);
 for(const layer of layers){await page.getByRole('button',{name:layer.name,exact:true}).click();await page.locator('[data-prop="scale"]').fill(String(1920/1363));await page.locator('[data-prop="scale"]').dispatchEvent('change');}
 await page.locator('[data-tab="animate"]').click();
 const state=()=>page.evaluate(()=>window.cameraStudio.getState());
 const seek=async t=>{await page.locator('#scrub').fill(String(t));assert.ok(Math.abs((await state()).frame/24-t)<1e-9);};
 async function apply({duration=3,to,from=0,start=0,easing='linear'}){
  await page.locator('#effect-start').fill(String(start));await page.locator('#effect-duration').fill(String(duration));await page.locator('#effect-from').fill(String(from));await page.locator('#effect-to').fill(String(to));await page.locator('#effect-easing').selectOption(easing);
  const before=JSON.stringify((await state()).config.animationTracks);
  await page.getByRole('button',{name:/^(Apply \/ Update|Create effect|Update effect)$/}).click();
  await page.waitForFunction(before=>JSON.stringify(window.cameraStudio.getState().config.animationTracks)!==before,before);
 }
 await page.locator('[data-target="camera"]').click();await page.locator('[data-preset="push"]').click();
 assert.equal((await state()).config.animationTracks,undefined,'preset selection does not apply');
 await apply({duration:3,from:1,to:1.25,easing:'ease_in_out'});
 await page.locator('[data-preset="pan"]').click();await apply({duration:3,to:160});
 await page.locator(`[data-target="layer:${layers[1].id}"]`).click();
 for(const [time,value] of [[0,0],[1,50],[2,140]]){
  await seek(time);await page.locator('#key-value').fill(String(value));await page.locator('#add-key').click();
  await page.waitForFunction(({id,count})=>window.cameraStudio.getState().config.animationTracks.find(t=>t.target===`layer:${id}`&&t.property==='x')?.keyframes.length===count,{id:layers[1].id,count:time+1});
 }
 const xTrack=(await state()).config.animationTracks.find(t=>t.target===`layer:${layers[1].id}`&&t.property==='x');
 await page.locator(`[data-key="${xTrack.keyframes[1].id}"]`).click();await page.locator('#key-value').fill('80');await page.locator('#key-easing').selectOption('ease_out');await page.locator('#update-key').click();
 await page.waitForFunction(id=>window.cameraStudio.getState().state.layers[id].x===80,layers[1].id);
 // Move a point, then restore it. Delete a temporary point. These edits must affect evaluated state.
 await page.locator('#key-time').fill('3');await page.locator('#update-key').click();
 await page.waitForFunction(id=>window.cameraStudio.getState().config.animationTracks.find(t=>t.target===`layer:${id}`&&t.property==='x').keyframes.some(k=>k.timeSeconds===3),layers[1].id);
 await page.locator('#key-time').fill('1');await page.locator('#update-key').click();await seek(4);await page.locator('#key-value').fill('170');await page.locator('#add-key').click();
 await page.waitForFunction(id=>window.cameraStudio.getState().config.animationTracks.find(t=>t.target===`layer:${id}`&&t.property==='x').keyframes.length===4,layers[1].id);
 await page.locator('#delete-key').click();await page.waitForFunction(id=>window.cameraStudio.getState().config.animationTracks.find(t=>t.target===`layer:${id}`&&t.property==='x').keyframes.length===3,layers[1].id);
 await page.locator(`[data-target="layer:${layers[2].id}"]`).click();await page.locator('#animation-property').selectOption('zoom');await apply({from:1,to:1.35,easing:'ease_out'});
 await page.locator(`[data-target="layer:${layers[3].id}"]`).click();await page.locator('#animation-property').selectOption('rotation');await apply({to:8});
 await page.locator('#animation-property').selectOption('opacity');await apply({from:100,to:15});
 await page.locator(`[data-target="layer:${layers[0].id}"]`).click();await page.locator('#animation-property').selectOption('y');await apply({to:-25});
 // Verify same-track editing (start, duration, endpoint, easing), disable/enable and reset
 // against evaluated layer state, not only inspector fields.
 await page.locator(`[data-target="layer:${layers[2].id}"]`).click();await page.locator('#animation-property').selectOption('zoom');
 await page.locator('#effect-start').fill('1');await page.locator('#effect-duration').fill('2');await page.locator('#effect-to').fill('1.6');await page.locator('#effect-easing').selectOption('linear');
 await page.getByRole('button',{name:'Update effect',exact:true}).click();
 await page.waitForFunction(id=>{const s=window.cameraStudio.getState();return s.config.animationTracks.find(t=>t.target===`layer:${id}`&&t.property==='zoom')?.keyframes.at(-1)?.timeSeconds===3;},layers[2].id);
 await seek(2);assert.ok((await state()).state.layers[layers[2].id].zoom>1);
 await page.getByRole('button',{name:'Disable',exact:true}).click();await page.waitForFunction(id=>window.cameraStudio.getState().state.layers[id].zoom===1,layers[2].id);
 await page.getByRole('button',{name:'Enable',exact:true}).click();await page.waitForFunction(id=>window.cameraStudio.getState().state.layers[id].zoom>1,layers[2].id);
 await page.getByRole('button',{name:'Delete \/ Reset',exact:true}).click();await page.waitForFunction(id=>window.cameraStudio.getState().state.layers[id].zoom===1,layers[2].id);
 await page.locator('#animation-property').selectOption('zoom');await apply({from:1,to:1.35,easing:'ease_out'});
 await seek(0);await page.locator('#play').click();await page.waitForFunction(()=>window.cameraStudio.getState().frame>=12);await page.locator('#play').click();
 const paused=(await state()).frame;await page.waitForTimeout(120);assert.equal((await state()).frame,paused);
 await seek(1);let s=await state();assert.equal(s.state.layers[layers[1].id].x,80);assert.equal(s.state.layers[layers[2].id].x,0);assert.ok(s.transforms[3].opacity<1);
 await seek(2);s=await state();assert.equal(s.state.layers[layers[1].id].x,140);assert.ok(s.state.dollyDelta>0);assert.ok(s.state.x>0);
 const snapshots={};
 for(const time of [0,1,2,3,4,1.5,5]){
  await seek(time);snapshots[time]=await state();const png=await page.evaluate(()=>window.cameraStudio.capture().png);
  await writeFile(resolve(dir,`preview-${time}.png`),Buffer.from(png.split(',')[1],'base64'));
  await seek(0);await seek(4.8);await seek(time);assert.equal(await page.evaluate(()=>window.cameraStudio.capture().png),png,`repeatable pixels at ${time}s`);
 }
 // Check real sprite alpha, not just evaluator values.
 const alphas=await page.evaluate(()=>window.cameraStudio.getState().spriteAlpha);assert.equal(alphas[layers[3].id],.15);
 await seek(2);await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Saved locally');
 const saved=await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('storystudio-projects',1);r.onsuccess=()=>resolve(r.result);});const all=await new Promise(resolve=>{const r=db.transaction('projects').objectStore('projects').getAll();r.onsuccess=()=>resolve(r.result);});db.close();return all.find(p=>p.scenes[0].layers.length===4);});
 await writeFile(resolve(dir,'animated-project.json'),JSON.stringify(saved,null,2));
 await page.reload();await page.waitForFunction(()=>window.cameraStudio?.ready);await page.locator('[data-tab="animate"]').click();await seek(2);
 assert.deepEqual((await state()).config.animationTracks,saved.scenes[0].animationTracks,'tracks survive IndexedDB reload');assert.deepEqual((await state()).transforms,snapshots[2].transforms);
 await page.screenshot({path:resolve(dir,'animate-workspace.png')});
 const geometry=await page.evaluate(()=>{const v=document.querySelector('#viewer').getBoundingClientRect(),c=document.querySelector('canvas').getBoundingClientRect();return {ratio:c.width/c.height,dx:c.x+c.width/2-v.x-v.width/2,dy:c.y+c.height/2-v.y-v.height/2,overflow:document.documentElement.scrollWidth>innerWidth};});
 assert.ok(Math.abs(geometry.ratio-16/9)<.005);assert.ok(Math.abs(geometry.dx)<2&&Math.abs(geometry.dy)<2);assert.equal(geometry.overflow,false);
 await page.locator('[data-target="camera"]').click();await page.screenshot({path:resolve(dir,'animate-camera.png')});
 // Static clears only camera animation, with confirmation.
 await page.locator('[data-preset="static"]').click();page.once('dialog',d=>d.accept());await page.locator('#camera-reset').click();
 await page.waitForFunction(()=>window.cameraStudio.getState().config.animationTracks.every(t=>t.target!=='camera'));
 assert.equal((await state()).config.animationTracks.length,5);assert.equal((await state()).state.zoom,1);
 await writeFile(resolve(dir,'browser-results.json'),JSON.stringify({pass:true,errors,geometry,snapshots},null,2));
 assert.deepEqual(errors,[]);console.log('Animation Chromium passed: real imported artwork, camera dolly/pan, independent X/Y/scale/rotation/opacity, key edits/move/delete, playback, deterministic pixels, save/reload and static reset.');
} finally {await runtime.close();}
