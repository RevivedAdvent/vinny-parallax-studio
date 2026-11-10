// End-to-end check for the current animation UI: real artwork import, camera
// movements, parallax layer effects, timeline editing, playback, deterministic
// pixels, save/reload and camera reset. Runs against the Vite dev server.
import { launch } from './runtime.mjs';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const dir=resolve('output/phase3');await mkdir(dir,{recursive:true});
const runtime=await launch(),errors=[],dialogs=[];
try {
  const page=await runtime.browser.newPage({viewport:{width:1600,height:1050}});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.accept();});
  await page.goto(runtime.url);await page.waitForFunction(()=>window.cameraStudio?.ready);

  // 5-second scene at the default 60 fps → 300 frames.
  await page.locator('#scene-duration').fill('5');await page.locator('#scene-duration').dispatchEvent('change');
  await page.waitForFunction(()=>window.cameraStudio.getState().config.totalFrames===300);

  await page.locator('[data-tab="arrange"]').click();
  const files=(await readdir('test-images')).filter(n=>n.endsWith('.png')).sort();assert.equal(files.length,4);
  await page.locator('#asset-files').setInputFiles(files.map(n=>resolve('test-images',n)));
  await page.waitForFunction(()=>document.querySelectorAll('.layer-row').length===4);
  const layers=await page.evaluate(()=>window.cameraStudio.getState().config.layers);
  for(const layer of layers){
    await page.getByRole('button',{name:layer.name,exact:true}).click();
    await page.locator('[data-prop="scale"]').fill(String(1920/1363));await page.locator('[data-prop="scale"]').dispatchEvent('change');
  }

  const state=()=>page.evaluate(()=>window.cameraStudio.getState());
  const config=async()=>(await state()).config;
  const seek=async seconds=>{
    await page.locator('#scrub').fill(String(seconds));
    await page.waitForFunction(seconds=>Math.abs(window.cameraStudio.getState().frame/60-seconds)<1e-9,seconds);
  };
  const moves=async()=>(await config()).cameraMoves??[];
  const effects=async()=>(await config()).layerEffects??[];
  const waitMoves=async count=>page.waitForFunction(count=>(window.cameraStudio.getState().config.cameraMoves??[]).length===count,count);
  const waitEffects=async count=>page.waitForFunction(count=>(window.cameraStudio.getState().config.layerEffects??[]).length===count,count);

  await page.locator('[data-tab="animate"]').click();
  await page.evaluate(()=>{const d=document.getElementById('applied-camera');if(d)d.open=true;});
  await page.locator('#camera-basic-moves summary').click();

  // Camera movements: preset selection alone must not author anything.
  await page.locator('#camera-basic-moves [data-preset="push"]').click();
  assert.equal((await moves()).length,0,'preset selection does not apply a movement');
  await page.locator('#effect-start').fill('0');await page.locator('#effect-duration').fill('3');
  await page.locator('#effect-form button[type=submit]').click();await waitMoves(1);
  const push=(await moves())[0];assert.equal(push.type,'push');assert.equal(push.model,2);

  await page.locator('#camera-basic-moves [data-preset="pan"]').click();
  await page.locator('#effect-start').fill('1');await page.locator('#effect-duration').fill('3');await page.locator('#camera-x').fill('300');
  await page.locator('#effect-form button[type=submit]').click();await waitMoves(2);

  // Applied Effects list mirrors the authored movements and supports duplicate/delete.
  assert.equal(await page.locator('#animation-effects-list .parallax-item').count(),2);
  const moveIdsBefore=new Set((await moves()).map(move=>move.id));
  await page.locator(`#animation-effects-list [data-move-duplicate="${push.id}"]`).click();await waitMoves(3);
  const duplicate=(await moves()).find(move=>!moveIdsBefore.has(move.id));
  assert.ok(duplicate,'duplicate creates a second copy with a new id');
  assert.equal(duplicate.type,'push');
  await page.locator(`#animation-effects-list [data-move-delete="${duplicate.id}"]`).click();await waitMoves(2);

  // A second push-in proves the same movement can be added again.
  await page.locator('#camera-basic-moves [data-preset="push"]').click();
  await page.locator('#effect-start').fill('1.5');await page.locator('#effect-duration').fill('1');
  await page.locator('#effect-form button[type=submit]').click();await waitMoves(3);

  // Timeline lists both movements and both effect types, and retimes them.
  await page.locator('[data-tab="effects"]').click();
  assert.equal(await page.locator('#effects-list .timeline-row[data-move]').count(),3);
  const pan=(await moves()).find(move=>move.type==='pan');
  const panForm=page.locator(`[data-timing="${pan.id}"]`);
  await panForm.locator('input[name=start]').fill('1');await panForm.locator('input[name=end]').fill('3');
  await panForm.locator('button[type=submit]').click();
  await page.waitForFunction(id=>{const m=window.cameraStudio.getState().config.cameraMoves.find(m=>m.id===id);return m&&Math.abs(m.start-1)<1e-9&&Math.abs(m.duration-2)<1e-9;},pan.id);
  await page.locator('[data-tab="animate"]').click();
  await page.evaluate(()=>{const d=document.getElementById('applied-camera');if(d)d.open=true;});

  // Parallax layer effects: drift (x/y), transform (scale/rotation) and fade (opacity).
  await page.locator('[data-tab="parallax"]').click();
  await page.evaluate(()=>{const d=document.getElementById('applied-parallax');if(d)d.open=true;});
  const chooseParallax=async(id,category)=>{
    const details=page.locator(`.parallax-category[data-category="${category}"]`);
    if(!(await details.evaluate(node=>node.open))) await details.locator('summary').click();
    await page.locator(`[data-parallax="${id}"]`).click();
  };

  await chooseParallax('drift','motion');
  await page.locator(`input[name=parallax-layer][value="${layers[1].id}"]`).check();
  await page.locator('#parallax-start').fill('0');await page.locator('#parallax-duration').fill('3');await page.locator('#drift-amplitude').fill('40');
  await page.locator('#parallax-form button[type=submit]').click();await waitEffects(1);

  await chooseParallax('transform','deformation');
  await page.locator(`input[name=parallax-layer][value="${layers[2].id}"]`).check();
  await page.locator('#parallax-start').fill('0');await page.locator('#parallax-duration').fill('3');
  await page.locator('#transform-scale-from').fill('100');await page.locator('#transform-scale-to').fill('135');
  await page.locator('#parallax-form button[type=submit]').click();await waitEffects(2);

  await chooseParallax('fade','appearance');
  await page.locator(`input[name=parallax-layer][value="${layers[3].id}"]`).check();
  await page.locator('#parallax-start').fill('0');await page.locator('#parallax-duration').fill('3');
  await page.locator('#fade-from').fill('0');await page.locator('#fade-to').fill('15');
  await page.locator('#parallax-form button[type=submit]').click();await waitEffects(3);

  // Same effect twice: duplicate the drift, then remove the copy.
  assert.equal(await page.locator('#parallax-effects-list .parallax-item').count(),3);
  const drift=(await effects()).find(effect=>effect.kind==='drift');
  const effectIdsBefore=new Set((await effects()).map(effect=>effect.id));
  await page.locator(`#parallax-effects-list [data-effect-duplicate="${drift.id}"]`).click();await waitEffects(4);
  const driftCopy=(await effects()).find(effect=>!effectIdsBefore.has(effect.id));
  assert.ok(driftCopy&&driftCopy.kind==='drift','duplicate creates a second drift effect with a new id');
  await page.locator(`#parallax-effects-list [data-effect-delete="${driftCopy.id}"]`).click();await waitEffects(3);

  // Timeline shows the parallax effects; Edit opens the Parallax workspace on that effect.
  await page.locator('[data-tab="effects"]').click();
  assert.equal(await page.locator('#effects-list .timeline-row[data-effect]').count(),3);
  const fade=(await effects()).find(effect=>effect.kind==='fade');
  await page.locator(`#effects-list [data-effect-edit="${fade.id}"]`).click();
  await page.waitForFunction(()=>document.querySelector('#parallax-inspector').textContent.includes('Update effect'));
  assert.equal(await page.locator('#parallax-start').inputValue(),'0');
  await page.locator('[data-tab="effects"]').click();

  // Retime an effect through the timeline form.
  const driftForm=page.locator(`[data-effect-timing="${drift.id}"]`);
  await driftForm.locator('input[name=start]').fill('0.5');await driftForm.locator('input[name=end]').fill('2.5');
  await driftForm.locator('button[type=submit]').click();
  await page.waitForFunction(id=>{const e=window.cameraStudio.getState().config.layerEffects.find(e=>e.id===id);return e&&Math.abs(e.start-.5)<1e-9&&Math.abs(e.duration-2)<1e-9;},drift.id);

  // Playback advances in real time and pauses where it was stopped.
  await seek(0);await page.locator('#play').click();
  await page.waitForFunction(()=>window.cameraStudio.getState().frame>=12);await page.locator('#play').click();
  const paused=(await state()).frame;await page.waitForTimeout(120);assert.equal((await state()).frame,paused);

  // Deterministic pixels across seeks; write the new-format previews.
  const snapshots={};
  for(const time of [0,1,2,3,4]){
    await seek(time);snapshots[time]=await state();
    const png=(await page.evaluate(()=>window.cameraStudio.capture())).png;
    await writeFile(resolve(dir,`ui-preview-${time}.png`),Buffer.from(png.split(',')[1],'base64'));
    await seek(0);await seek(4.8);await seek(time);
    assert.equal((await page.evaluate(()=>window.cameraStudio.capture())).png,png,`repeatable pixels at ${time}s`);
  }

  // Evaluated state reflects the authored moves and layer effects.
  await seek(0);const neutral=snapshots[0].state.virtualCamera;assert.ok(neutral,'camera moves expose a virtual camera');
  await seek(1);let current=await state();
  assert.ok(Math.abs(current.state.layers[layers[1].id].x)>1,'drift moves its layer horizontally');
  await seek(2);current=await state();
  const camera=current.state.virtualCamera;
  assert.ok(camera,'virtual camera survives playback');
  assert.ok(Math.abs(camera.z-neutral.z)+Math.abs(camera.yaw-neutral.yaw)+Math.abs(camera.x-neutral.x)>1,'camera moves the virtual viewpoint');
  assert.ok(current.state.layers[layers[2].id].zoom>1.01,'transform scales its layer');
  await seek(3);current=await state();
  assert.ok(Math.abs(current.spriteAlpha[layers[3].id]-.15)<1e-6,'fade reaches its end opacity on the real sprite');

  // Save, capture the new-format project, reload and compare.
  await seek(2);await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Saved locally');
  const saved=await page.evaluate(async()=>{
    const db=await new Promise(resolve=>{const request=indexedDB.open('storystudio-projects',1);request.onsuccess=()=>resolve(request.result);});
    const all=await new Promise(resolve=>{const request=db.transaction('projects').objectStore('projects').getAll();request.onsuccess=()=>resolve(request.result);});db.close();
    return all.find(project=>project.scenes[0].layers.length===4);
  });
  await writeFile(resolve(dir,'animation-ui-project.json'),JSON.stringify(saved,null,2));
  await page.reload();await page.waitForFunction(()=>window.cameraStudio?.ready);await page.locator('[data-tab="animate"]').click();
  await page.evaluate(()=>{const d=document.getElementById('applied-camera');if(d)d.open=true;});await seek(2);
  const reloaded=await config();
  assert.deepEqual(reloaded.cameraMoves,saved.scenes[0].cameraMoves,'camera movements survive IndexedDB reload');
  assert.deepEqual(reloaded.layerEffects,saved.scenes[0].layerEffects,'layer effects survive IndexedDB reload');
  assert.deepEqual((await state()).transforms,snapshots[2].transforms,'reloaded transforms match');

  await page.screenshot({path:resolve(dir,'animate-workspace.png')});
  const geometry=await page.evaluate(()=>{const v=document.querySelector('#viewer').getBoundingClientRect(),c=document.querySelector('canvas').getBoundingClientRect();return {ratio:c.width/c.height,dx:c.x+c.width/2-v.x-v.width/2,dy:c.y+c.height/2-v.y-v.height/2,overflow:document.documentElement.scrollWidth>innerWidth};});
  assert.ok(Math.abs(geometry.ratio-16/9)<.005);assert.ok(Math.abs(geometry.dx)<2&&Math.abs(geometry.dy)<2);assert.equal(geometry.overflow,false);

  // Static clears only camera movement; authored layer effects remain.
  const effectsBefore=(await effects()).length;
  await page.locator('#camera-basic-moves summary').click();
  await page.locator('#camera-basic-moves [data-preset="static"]').click();
  await page.locator('#camera-reset').click();
  await page.waitForFunction(()=>(window.cameraStudio.getState().config.cameraMoves??[]).length===0);
  assert.equal((await effects()).length,effectsBefore,'reset keeps layer effects');
  const resetCamera=(await state()).state.virtualCamera;assert.ok(resetCamera,'reset keeps the one canonical virtual camera');
  assert.deepEqual({x:resetCamera.x,y:resetCamera.y,z:resetCamera.z,yaw:resetCamera.yaw,pitch:resetCamera.pitch,roll:resetCamera.roll},{x:0,y:0,z:0,yaw:0,pitch:0,roll:0},'reset returns the virtual camera to neutral');
  assert.equal((await state()).state.zoom,1);
  assert.ok(dialogs.some(message=>/Clear all camera movement/.test(message)),'reset asks for confirmation');

  await writeFile(resolve(dir,'browser-results.json'),JSON.stringify({pass:true,errors,geometry,snapshots},null,2));
  assert.deepEqual(errors,[]);
  console.log('Animation Chromium passed: real imported artwork, camera pushes and pans, applied-effect list duplicate/delete, timeline retiming, drift/transform/fade layer effects, playback, deterministic pixels, save/reload and camera-only reset.');
} finally {await runtime.close();}
