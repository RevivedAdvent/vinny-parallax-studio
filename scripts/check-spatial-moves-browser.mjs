import { launch } from '/home/sriharsham/Downloads/vinny-parallax-studio/scripts/runtime.mjs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const root='/home/sriharsham/Downloads/vinny-parallax-studio';
const runtime=await launch(),errors=[];
try {
 const page=await runtime.browser.newPage({viewport:{width:1500,height:1000}});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',d=>d.accept());
 await page.goto(runtime.url);await page.waitForFunction(()=>window.cameraStudio?.ready);
 await page.locator('[data-tab="arrange"]').click();
 await page.locator('#asset-files').setInputFiles([resolve(root,'test-images/01-background.png'),resolve(root,'test-images/02-layer 1.png')]);
 await page.waitForFunction(()=>window.cameraStudio.getState().config.layers.length===2);
 await page.locator('[data-tab="animate"]').click();
 const spatial=page.locator('#camera-spatial-moves summary');
 assert.equal(await spatial.count(),1,'B dropdown exists');
 assert.equal(await page.locator('#camera-spatial-moves').getAttribute('open'),null,'B starts collapsed');
 await spatial.click();
 const cards=await page.locator('#spatial-moves-targets [data-preset]').allInnerTexts();
 console.log('B cards:',cards.map(c=>c.split('\n')[0]).join(' | '));
 assert.equal(cards.length,6);
 // Tracking: pick the foreground layer, place it at a screen point.
 await page.locator('#spatial-moves-targets [data-preset="tracking"]').click();
 await page.locator('#effect-form select#track-layer').selectOption({index:1});
 await page.locator('#effect-start').fill('1');await page.locator('#effect-duration').fill('2');
 await page.locator('#camera-x').fill('400');await page.locator('#camera-y').fill('300');
 await page.locator('#effect-form button[type=submit]').click();
 await page.waitForFunction(()=>window.cameraStudio.getState().config.cameraMoves?.some(m=>m.type==='tracking'));
 // Reveal: select the foreground layer, offset it.
 await page.locator('#spatial-moves-targets [data-preset="reveal"]').click();
 await page.locator('input[name=reveal-layer]').nth(1).check();
 await page.locator('#camera-x').fill('200');await page.locator('#camera-y').fill('-40');
 await page.locator('#effect-start').fill('4');await page.locator('#effect-duration').fill('2');
 await page.locator('#effect-form button[type=submit]').click();
 await page.waitForFunction(()=>window.cameraStudio.getState().config.cameraMoves?.some(m=>m.type==='reveal'));
 const moves=(await page.evaluate(()=>window.cameraStudio.getState().config.cameraMoves));
 console.log('saved:',JSON.stringify(moves.map(m=>({type:m.type,layerId:m.layerId,layerIds:m.layerIds,offsetX:m.offsetX,offsetY:m.offsetY}))));
 assert.equal(moves.find(m=>m.type==='reveal').layerIds.length,1);
 assert.equal(moves.find(m=>m.type==='reveal').layerIds[0],(await page.evaluate(()=>window.cameraStudio.getState().config.layers[1].id)));
 // Persist and reload.
 await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Saved locally');
 await page.reload();await page.waitForFunction(()=>window.cameraStudio?.ready);
 const after=await page.evaluate(()=>window.cameraStudio.getState().config.cameraMoves);
 assert.equal(after.length,moves.length);
 assert.deepEqual(after.map(m=>m.type),moves.map(m=>m.type));
 // Preview at a seek time: layers and camera values are finite.
 await page.evaluate(()=>window.cameraStudio.renderTime(5));
 const st=await page.evaluate(()=>window.cameraStudio.getState());
 assert.ok(Number.isFinite(st.state.virtualCamera.x)&&Number.isFinite(st.state.virtualCamera.z)&&Number.isFinite(st.state.virtualCamera.focalLength));
 assert.deepEqual(errors,[]);
 console.log('Spatial browser workflow passed: B dropdown, six cards, tracking and reveal create, save and reload.');
} finally {await runtime.close();}
