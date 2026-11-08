import { launch, projectRoot } from './runtime.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const dir=resolve(projectRoot,'output/camera-phase1');await mkdir(dir,{recursive:true});
const runtime=await launch(), errors=[];
try {
  const page=await runtime.browser.newPage({viewport:{width:1440,height:1050}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(runtime.url);await page.waitForFunction(()=>window.cameraStudio?.ready);
  assert.equal(await page.locator('#scrub').getAttribute('max'),'1799');
  await page.locator('#scrub').fill('120');
  assert.equal(await page.evaluate(()=>window.cameraStudio.getState().frame),120);
  assert.equal(await page.locator('#clock').textContent(),'00:02:00');

  // The current studio starts with a blank scene; use real imported artwork.
  await page.locator('[data-tab="arrange"]').click();
  await page.locator('#asset-files').setInputFiles([
    resolve(projectRoot,'test-images/01-background.png'),
    resolve(projectRoot,'test-images/02-layer 1.png'),
  ]);
  await page.waitForFunction(()=>window.cameraStudio.getState().config.layers.length===2);
  const layerId=await page.evaluate(()=>window.cameraStudio.getState().config.layers[1].id);
  // Arrange no longer edits depth; the imported value remains available to Parallax.
  assert.equal(await page.locator('[data-prop="depth"]').count(),0);
  const importedDepth=await page.evaluate(id=>window.cameraStudio.getState().config.layers.find(l=>l.id===id).depth,layerId);
  const visibility=page.locator('.layer-row').first().locator('.eye-toggle');
  await visibility.click();await page.waitForFunction(id=>window.cameraStudio.getState().visible[id]===false,layerId);
  await visibility.click();await page.waitForFunction(id=>window.cameraStudio.getState().visible[id]===true,layerId);

  await page.locator('[data-tab="animate"]').click();
  await page.locator('#camera-basic-moves summary').click();
  await page.locator('[data-preset="push"]').click();
  await page.locator('#effect-duration').fill('3');await page.locator('#camera-travel').fill('20');
  await page.locator('#effect-form button[type="submit"]').click();
  await page.waitForFunction(()=>window.cameraStudio.getState().config.cameraMoves?.length===1);
  await page.locator('[data-tab="story"]').click();

  await page.locator('#scrub').fill('120');
  const preview=await page.evaluate(()=>window.cameraStudio.capture());
  assert.ok(preview.png.startsWith('data:image/png;base64,'));
  assert.ok(preview.coverage.uncoveredPixels>=0);
  await writeFile(resolve(dir,'preview-frame-120.png'),Buffer.from(preview.png.split(',')[1],'base64'));
  await page.locator('#play').click();
  await page.waitForFunction(()=>window.cameraStudio.getState().frame>120);
  await page.locator('#play').click();
  const after=await page.evaluate(()=>window.cameraStudio.getState());
  assert.ok(after.frame>120);assert.ok(Math.abs(after.frame-Math.round(after.frame))<1e-8);

  // Intensity remains part of the shared renderer API, not a studio slider.
  await page.evaluate(()=>window.cameraStudio.setIntensity(0));
  await page.locator('#scrub').fill('120');const still=await page.evaluate(()=>window.cameraStudio.capture().png);
  await page.locator('#scrub').fill('500');assert.equal(await page.evaluate(()=>window.cameraStudio.capture().png),still);
  await page.evaluate(()=>window.cameraStudio.setIntensity(1));
  await page.locator('#scrub').fill('120');assert.notEqual(await page.evaluate(()=>window.cameraStudio.capture().png),still);

  await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Saved locally');
  await page.reload();await page.waitForFunction(()=>window.cameraStudio?.ready);
  const saved=await page.evaluate(()=>window.cameraStudio.getState().config);
  assert.equal(saved.layers.length,2);assert.equal(saved.layers.find(l=>l.id===layerId).depth,importedDepth);
  assert.equal(saved.cameraMoves.length,1);assert.equal(saved.cameraMoves[0].type,'push');
  await page.screenshot({path:resolve(dir,'studio-desktop.png'),fullPage:true});
  const geometry=[];
  for(const width of [1440,1024,768,390]) {
    await page.setViewportSize({width,height:1050});
    const state=await page.evaluate(()=>{
      const rect=document.querySelector('#canvas-host canvas').getBoundingClientRect();
      return {viewport:innerWidth,content:document.documentElement.scrollWidth,canvas:{width:rect.width,height:rect.height}};
    });
    assert.ok(state.canvas.width>0&&state.canvas.height>0,`Preview is visible at ${width}px`);
    if(width>=768)assert.ok(state.content<=width,`Horizontal overflow at ${width}px`);
    geometry.push(state);
  }
  await page.screenshot({path:resolve(dir,'studio-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  const warnings=geometry.filter(g=>g.content>g.viewport).map(g=>`Horizontal overflow at ${g.viewport}px: content is ${g.content}px`);
  await writeFile(resolve(dir,'browser-checks.json'),JSON.stringify({pass:true,errors,warnings,geometry},null,2));
  for(const warning of warnings)console.warn(warning);
  console.log('CAMERA BROWSER CHECKS PASSED: scrubbing, playback, real artwork, depth, visibility, intensity, save/reload and preview sizing.');
} finally {await runtime.close();}
