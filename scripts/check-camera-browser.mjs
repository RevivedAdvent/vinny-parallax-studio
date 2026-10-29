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
  assert.equal(await page.locator('#scrub').getAttribute('max'),'575');
  assert.equal(await page.locator('#scrub').getAttribute('step'),'1');
  await page.locator('#scrub').fill('120');
  assert.equal(await page.evaluate(()=>window.cameraStudio.getState().frame),120);
  assert.equal(await page.locator('#current').textContent(),'00:05:00');
  const preview=await page.evaluate(()=>window.cameraStudio.capture());
  assert.equal(preview.coverage.uncoveredPixels,0);
  await writeFile(resolve(dir,'preview-frame-120.png'),Buffer.from(preview.png.split(',')[1],'base64'));
  await page.getByRole('button',{name:'Play scene',exact:true}).click();await page.waitForTimeout(650);
  const after=await page.evaluate(()=>window.cameraStudio.getState());assert.ok(after.frame>120);assert.ok(Number.isInteger(after.frame));
  await page.getByRole('button',{name:'Pause scene',exact:true}).click();
  await page.locator('#motion').fill('0');
  assert.equal(await page.evaluate(()=>window.cameraStudio.getState().intensity),0);
  await page.locator('#scrub').fill('120');const a=await page.evaluate(()=>window.cameraStudio.capture().png);
  await page.locator('#scrub').fill('500');assert.equal(await page.evaluate(()=>window.cameraStudio.capture().png),a);
  await page.locator('#motion').fill('100');
  const depth=page.locator('[data-depth="background"]');await depth.fill('0.2');await depth.dispatchEvent('change');
  assert.equal(await page.evaluate(()=>window.cameraStudio.getState().config.layers[0].depth),0.2);
  await depth.fill('0.1');await depth.dispatchEvent('change');
  await page.locator('#check-coverage').click();assert.match(await page.locator('#coverage-status').textContent(),/PASS/);
  await page.locator('[data-layer="vinny"]').uncheck();
  assert.equal(await page.evaluate(()=>window.cameraStudio.getState().visible.vinny),false);
  await page.locator('[data-layer="vinny"]').check();
  await page.locator('#compare').click();assert.equal(await page.locator('#reference').isVisible(),true);
  await page.locator('#compare').click();assert.equal(await page.locator('#reference').isVisible(),false);
  const pngEvent=page.waitForEvent('download');await page.locator('#save-frame').click();
  const png=await pngEvent;await png.saveAs(resolve(dir,'browser-downloaded-frame.png'));assert.ok(png.suggestedFilename().endsWith('.png'));
  const jsonEvent=page.waitForEvent('download');await page.locator('#save-config').click();
  const json=await jsonEvent;await json.saveAs(resolve(dir,'browser-camera-config.json'));
  await page.locator('#scrub').fill('120');
  await page.screenshot({path:resolve(dir,'studio-desktop.png'),fullPage:true});
  const geometry=[];
  for(const width of [1440,1024,768,390]) {
    await page.setViewportSize({width,height:1050});
    const state=await page.evaluate(()=>({viewport:innerWidth,content:document.documentElement.scrollWidth,
      buttons:[...document.querySelectorAll('button,input')].map(el=>{const r=el.getBoundingClientRect();return {name:el.id||el.getAttribute('aria-label'),left:r.left,right:r.right,top:r.top,bottom:r.bottom};}),
      inspector:[...document.querySelectorAll('.inspector > *')].map(el=>{const r=el.getBoundingClientRect();return {name:el.id||el.className||el.tagName,left:r.left,right:r.right,top:r.top,bottom:r.bottom};})}));
    assert.ok(state.content<=width,`Horizontal overflow at ${width}`);
    for(const b of state.buttons) assert.ok(b.left>=0&&b.right<=width+1,`${b.name} overflows ${width}`);
    for(const group of [state.buttons,state.inspector]) for(let i=0;i<group.length;i++) for(let j=i+1;j<group.length;j++) {
      const a=group[i],b=group[j];
      const x=Math.min(a.right,b.right)-Math.max(a.left,b.left),y=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
      assert.ok(x<=1||y<=1,`${a.name} overlaps ${b.name} at ${width}`);
    }
    geometry.push({width,...state});
  }
  await page.screenshot({path:resolve(dir,'studio-mobile.png'),fullPage:true});
  if(process.argv.includes('--record-preview')) {
    const event=page.waitForEvent('download',{timeout:90000});
    await page.locator('#export').click();const video=await event;
    await video.saveAs(resolve(dir,'browser-preview.webm'));
    await page.waitForFunction(()=>!document.getElementById('export').disabled);
    assert.ok(video.suggestedFilename().endsWith('.webm'));
  }
  await writeFile(resolve(dir,'browser-checks.json'),JSON.stringify({pass:true,errors,geometry},null,2));
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('CAMERA BROWSER CHECKS PASSED: integer scrubbing/playback, real track intensity, depth editing, coverage, visibility, comparison, PNG/config downloads, 4 responsive widths.');
} finally {await runtime.close();}
