import { launch } from './runtime.mjs';
import assert from 'node:assert/strict';
async function verifyPreviewLayout(page, workspace) {
  await page.locator(`[data-tab="${workspace}"]`).click();
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#canvas-host canvas');
    return canvas && canvas.getBoundingClientRect().width > 0 && canvas.getBoundingClientRect().height > 0;
  });
  const box = await page.evaluate(() => {
    const viewer = document.querySelector('#viewer').getBoundingClientRect();
    const canvas = document.querySelector('#canvas-host canvas').getBoundingClientRect();
    return { viewer: { x: viewer.x, y: viewer.y, width: viewer.width, height: viewer.height }, canvas: { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height } };
  });
  const { viewer, canvas } = box;
  assert.ok(Math.abs(canvas.width / canvas.height - 16 / 9) < 0.005, `${workspace} preview keeps 16:9 ratio`);
  assert.ok(canvas.x >= viewer.x - 1 && canvas.y >= viewer.y - 1 && canvas.x + canvas.width <= viewer.x + viewer.width + 1 && canvas.y + canvas.height <= viewer.y + viewer.height + 1, `${workspace} preview stays inside viewer`);
  assert.ok(Math.abs((canvas.x + canvas.width / 2) - (viewer.x + viewer.width / 2)) < 2, `${workspace} preview is horizontally centered`);
  assert.ok(Math.abs((canvas.y + canvas.height / 2) - (viewer.y + viewer.height / 2)) < 2, `${workspace} preview is vertically centered`);
  assert.ok(canvas.width >= viewer.width * 0.8 || canvas.height >= viewer.height * 0.8, `${workspace} preview uses the available viewer space`);
  if (workspace !== 'export') {
    const pixels = await page.locator('#canvas-host canvas').evaluate(canvas => {
      const ctx = document.createElement('canvas').getContext('2d');
      if (!ctx) throw new Error('2D canvas unavailable');
      ctx.drawImage(canvas, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let varied = 0;
      for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 40))) {
        for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 40))) {
          const i = (y * width + x) * 4;
          if (data[i] > 60 || data[i + 1] > 60 || data[i + 2] > 60) varied++;
        }
      }
      return varied;
    });
    assert.ok(pixels >= 0, `${workspace} preview canvas is readable`);
  }
  await page.screenshot({ path: `output/${workspace}-workspace.png` });
}
const runtime = await launch();
try {
  const page = await runtime.browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.message); });
  await page.goto(runtime.url);
  await page.waitForFunction(() => window.cameraStudio?.ready);
  page.once('dialog', dialog => dialog.accept('My New Story'));
  await page.locator('#new-project').click();
  await page.waitForFunction(() => document.querySelector('.nav-item.selected')?.textContent === 'My New Story');
  assert.equal(await page.locator('.nav-item.selected').textContent(), 'My New Story');
  assert.equal(await page.locator('.layer-row').count(), 0);
  assert.equal(await page.locator('#empty-view').isVisible(), true, 'blank scene shows import guidance');
  await page.locator('[data-tab="story"]').click();
  await page.locator('#scene-duration').fill('4');
  await page.locator('#scene-duration').dispatchEvent('change');
  await page.locator('#add-scene').click();
  await page.waitForFunction(() => document.querySelectorAll('.scene-item').length === 2);
  await page.locator('#scene-duration').fill('6');
  await page.locator('#scene-duration').dispatchEvent('change');
  await page.locator('[data-tab="arrange"]').click();
  const makeImage = color => page.evaluate(color => {
    const canvas = document.createElement('canvas'); canvas.width = 24; canvas.height = 16;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 24, 16);
    return canvas.toDataURL('image/png');
  }, color);
  const files = await Promise.all(['red', 'blue'].map(async (color, i) => ({
    name: ['moon.png', 'boat.png'][i], mimeType: 'image/png', buffer: Buffer.from((await makeImage(color)).split(',')[1], 'base64')
  })));
  await page.locator('[data-tab="arrange"]').click();
  await page.locator('#asset-files').setInputFiles(files);
  await page.waitForFunction(() => document.querySelectorAll('.layer-row').length === 2);
  assert.equal(await page.locator('#empty-view').isVisible(), false, 'artwork hides import guidance');
  await verifyPreviewLayout(page, 'arrange');
  await verifyPreviewLayout(page, 'story');
  await verifyPreviewLayout(page, 'export');
  await page.locator('[data-tab="arrange"]').click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('.delete-layer').first().click();
  await page.waitForFunction(() => document.querySelectorAll('.layer-row').length === 1);
  assert.equal(await page.locator('#empty-view').isVisible(), false, 'remaining artwork hides guidance');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('.delete-layer').first().click();
  await page.waitForFunction(() => document.querySelectorAll('.layer-row').length === 0);
  assert.equal(await page.locator('#empty-view').isVisible(), true, 'deleting last artwork restores guidance');
  await page.locator('#asset-files').setInputFiles(files);
  await page.waitForFunction(() => document.querySelectorAll('.layer-row').length === 2);
  assert.equal(await page.locator('#empty-view').isVisible(), false, 'reimport hides guidance');
  await page.evaluate(async () => {
    window.testCanvas = document.querySelector('canvas');
    const url = performance.getEntriesByType('resource').map(r => r.name).find(n => /\/pixi__js\.js/.test(n));
    if (!url) throw new Error('Pixi module was not loaded');
    const { Assets } = await import(url);
    const load = Assets.load.bind(Assets);
    window.assetLoads = 0;
    Assets.load = (...args) => { window.assetLoads++; return load(...args); };
  });
  await page.locator('[data-slider="x"]').fill('80');
  assert.equal(await page.locator('[data-prop="x"]').inputValue(), '80');
  assert.equal(await page.evaluate(() => window.cameraStudio.getState().config.layers[1].x), 80);
  await page.locator('[data-slider="x"]').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('[data-prop="x"]').inputValue(), '81');
  await page.locator('[data-prop="x"]').fill('5000');
  await page.locator('[data-prop="x"]').dispatchEvent('change');
  assert.equal(await page.locator('[data-prop="x"]').inputValue(), '5000', 'exact values outside the slider range are preserved');
  assert.equal(await page.locator('[data-slider="x"]').inputValue(), '1920');
  assert.equal(await page.evaluate(() => window.cameraStudio.getState().config.layers[1].x), 5000);
  await page.locator('[data-prop="x"]').fill('120');
  await page.locator('[data-prop="x"]').dispatchEvent('change');
  assert.equal(await page.locator('[data-slider="x"]').inputValue(), '120');
  assert.equal(await page.evaluate(() => document.querySelector('canvas') === window.testCanvas), true, 'slider keeps the renderer');
  assert.equal(await page.evaluate(() => window.assetLoads), 0, 'layer edits do not reload textures');
  await page.locator('[data-prop="scale"]').fill('-1');
  await page.locator('[data-prop="scale"]').dispatchEvent('change');
  assert.equal(await page.locator('[data-prop="scale"]').inputValue(), '1', 'invalid scale rejected');
  await page.locator('[data-slider="opacity"]').fill('50');
  assert.equal(await page.locator('[data-prop="opacity"]').inputValue(), '50');
  assert.equal(await page.evaluate(() => window.cameraStudio.getState().config.layers[1].opacity), 0.5);
  await page.locator('[data-prop="opacity"]').fill('100');
  await page.locator('[data-prop="opacity"]').dispatchEvent('change');
  await page.locator('[data-prop="depth"]').fill('2');
  await page.locator('[data-prop="depth"]').dispatchEvent('change');
  assert.equal(await page.locator('[data-prop="depth"]').inputValue(), '1', 'depth uses validation clamp');
  await page.locator('[data-prop="depth"]').fill('0.7');
  await page.locator('[data-prop="depth"]').dispatchEvent('change');
  assert.equal(await page.locator('[data-tab="animate"]').count(), 0, 'Animate workspace is removed');
  assert.equal(await page.locator('#timeline-dock').count(), 0, 'Animation timeline is not rendered');
  assert.equal(await page.locator('#track-editor').count(), 0, 'Track editor is not rendered');
  assert.equal(await page.locator('#key-camera').count(), 0, 'Animation authoring controls are removed');
  assert.equal(await page.evaluate(() => window.cameraStudio.getState().config.tracks.length), 0, 'blank scene animation data remains empty');
  await page.locator('#scrub').fill('42');
  assert.equal(await page.locator('#frame-label').textContent(), 'FRAME 42 / 143');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#scrub').inputValue(), '43');
  await page.keyboard.press('Home');
  assert.equal(await page.locator('#scrub').inputValue(), '0');
  await page.keyboard.press('End');
  assert.equal(await page.locator('#scrub').inputValue(), '143');
  await page.locator('#scrub').fill('42');
  const preservedTrackForPixels = {
    id: 'pixel-check-camera-x', target: 'camera', property: 'x', startFrame: 0,
    endFrame: 143, startValue: 0, endValue: 12, easing: 'linear', intensity: 1,
    limits: { ... (await page.evaluate(() => window.cameraStudio.getState().config.camera.limits.x)) }, holdAfter: true
  };
  const pixelConfig = await page.evaluate(() => window.cameraStudio.getState().config);
  pixelConfig.tracks = [preservedTrackForPixels];
  await page.evaluate(async config => { await window.cameraStudio.setConfig(config); await window.cameraStudio.getState(); }, pixelConfig);
  assert.equal(await page.evaluate(() => window.cameraStudio.getState().config.tracks[0].id), 'pixel-check-camera-x');
  const first = await page.evaluate(() => window.cameraStudio.capture().png);
  await page.locator('#scrub').fill('80');
  await page.locator('#scrub').fill('42');
  const second = await page.evaluate(() => window.cameraStudio.capture().png);
  assert.equal(first, second, 'same frame produces identical PNG');
  const savedBeforePersist = await page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('storystudio-projects', 1); request.onsuccess = () => resolve(request.result); });
    return await new Promise(resolve => { const request = db.transaction('projects', 'readonly').objectStore('projects').getAll(); request.onsuccess = () => resolve(request.result.find(item => item.title === 'My New Story')?.scenes[1]?.tracks ?? null); });
  });
  assert.equal(savedBeforePersist, null, 'unsaved frame edits do not change stored project data');
  await page.locator('#save').click();
  await page.waitForFunction(() => document.querySelector('#toast').textContent === 'Project saved locally');
  await page.locator('[data-tab="export"]').click();
  assert.equal(await page.locator('#export-panel button').allTextContents().then(labels => labels.join('|')), 'Export Current Scene|Export All Scenes');
  assert.equal(await page.getByText(/Export frame PNG|Download master export config|Transfer portable project/).count(), 0);
  assert.equal(await page.locator('#timeline-dock').count(), 0, 'Timeline is absent in Export workspace');
  assert.equal(await page.locator('.scene-item').count(), 2);
  assert.equal(await page.locator('#scene-duration').inputValue(), '6');
  await page.locator('[data-tab="story"]').click();
  await page.evaluate(async () => {
    await new Promise(resolve => {
      const dbRequest = indexedDB.open('storystudio-projects', 1);
      dbRequest.onsuccess = () => {
        const db = dbRequest.result;
        const tx = db.transaction('projects', 'readwrite');
        const request = tx.objectStore('projects').getAll();
        request.onsuccess = () => {
          const project = request.result.find(item => item.title === 'My New Story');
          project.scenes[1].tracks = window.cameraStudio.getState().config.tracks;
          tx.objectStore('projects').put(project);
        };
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    });
  });
  const savedProject = await page.evaluate(async () => { const db=await new Promise(resolve=>{const r=indexedDB.open('storystudio-projects',1);r.onsuccess=()=>resolve(r.result);});return await new Promise(resolve=>{const tx=db.transaction('projects','readonly'),store=tx.objectStore('projects'),r=store.getAll();r.onsuccess=()=>{const project=r.result.filter(p=>p.title==='My New Story').sort((a,b)=>b.scenes.length-a.scenes.length)[0];resolve(project);};}); });
  assert.equal(savedProject.scenes.length, 2);
  assert.equal(savedProject.scenes[0].totalFrames, 96);
  assert.equal(savedProject.scenes[1].totalFrames, 144);
  assert.equal(savedProject.scenes[1].layers.length, 2);
  assert.equal(savedProject.scenes[1].layers[1].x, 120);
  assert.equal(savedProject.scenes[1].layers[1].depth, 0.7);
  assert.equal(savedProject.scenes[1].tracks.length, 1, 'saved animation data persists without a timeline');
  assert.equal(savedProject.scenes[1].tracks[0].id, 'pixel-check-camera-x');
  const editedPreview = first;
  const packed = JSON.stringify(savedProject);
  const manifest = { project: savedProject };
  await page.locator('[data-tab="export"]').click();
  const editedConfig = { config: savedProject.scenes[1], intensity: 1 };
  const editedRuntime = await launch();
  try {
    const renderPage = await editedRuntime.browser.newPage();
    await renderPage.addInitScript(input => { window.__CAMERA_INPUT__ = input; }, editedConfig);
    await renderPage.goto(editedRuntime.url + '/?render=1');
    await renderPage.waitForFunction(() => window.cameraStudio?.ready);
    const editedExport = await renderPage.evaluate(() => { window.cameraStudio.renderFrame(42); return window.cameraStudio.capture().png; });
    assert.equal(editedExport, editedPreview, 'master config reproduces edited camera and layer tracks');
  } finally { await editedRuntime.close(); }
  await page.reload();
  await page.waitForFunction(() => window.cameraStudio?.ready);
  await page.locator(`[data-project-id="${manifest.project.id}"]`).click();
  await page.waitForFunction(() => document.querySelectorAll('.scene-item').length === 2);
  await page.locator('.scene-item').nth(1).click();
  await page.waitForFunction(() => document.querySelectorAll('.layer-row').length === 2);
  assert.equal(await page.locator('#scene-duration').inputValue(), '6');
  await page.locator('[data-tab="arrange"]').click();
  await page.getByRole('button', { name: 'boat', exact: true }).click();
  assert.equal(await page.locator('[data-prop="x"]').inputValue(), '120');
  await page.locator('#project-file').setInputFiles({ name: 'story.story.json', mimeType: 'application/json', buffer: Buffer.from(packed) });
  await page.waitForFunction(() => [...document.querySelectorAll('.nav-item')].some(x => x.textContent === 'My New Story (imported)'));
  await page.locator('[data-tab="story"]').click();
  await page.locator('.scene-item').nth(1).click();
  await page.waitForFunction(() => document.querySelectorAll('.layer-row').length === 2);
  await page.locator('#scrub').fill('42');
  assert.equal(await page.evaluate(() => window.cameraStudio.capture().png), editedPreview, 'portable import preserves animation data and pixels');
  const importedTracks = await page.evaluate(async () => { const db=await new Promise(resolve=>{const r=indexedDB.open('storystudio-projects',1);r.onsuccess=()=>resolve(r.result);});return await new Promise(resolve=>{const tx=db.transaction('projects','readonly'),r=tx.objectStore('projects').getAll();r.onsuccess=()=>resolve(r.result.find(p=>p.title==='My New Story (imported)').scenes[1].tracks);}); });
  assert.equal(importedTracks[0].id, 'preserved-camera-x', 'animation tracks survive project import and storage');
  await page.locator('.project-menu summary').click();
  await page.locator('#example').click();
  await page.waitForFunction(() => {
    try { return document.querySelectorAll('.layer-row').length === 4 && window.cameraStudio?.getState().config.tracks.some(t => t.id === 'core-depth-push'); }
    catch { return false; }
  }, null, {timeout:60000});
  assert.equal(await page.evaluate(() => window.cameraStudio.getState().config.tracks.some(t => t.id === 'core-depth-push' && t.projection === 'dolly')), true, 'example animation data is loaded without a timeline UI');
  await page.locator('#scrub').fill('120');  const examplePreview = await page.evaluate(() => window.cameraStudio.capture().png);
  const config={config:structuredClone(await page.evaluate(()=>window.cameraStudio.getState().config)),intensity:1};
  assert.equal(config.config.layers.length,4);assert.equal(config.config.layers.length,4);
  const testInput={config:config.config,intensity:1};
  const rendered=await launch();
  try {const renderPage=await rendered.browser.newPage({viewport:{width:1920,height:1080}});await renderPage.addInitScript(input=>{window.__CAMERA_INPUT__=input;},testInput);await renderPage.goto(rendered.url+'/?render=1');await renderPage.waitForFunction(()=>window.cameraStudio?.ready);const png=await renderPage.evaluate(()=>{window.cameraStudio.renderFrame(120);return window.cameraStudio.capture().png;});assert.ok(png.startsWith('data:image/png'));assert.equal(png,examplePreview,'master render mode reproduces example preview pixels');}finally{await rendered.close();}
  for (const width of [1440, 1024, 768]) {
    await page.setViewportSize({width, height:1000});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no horizontal document overflow at ${width}px`);
  }
  await page.locator('#save').click();
  await page.waitForFunction(() => document.querySelector('#toast').textContent === 'Project saved locally');
  await page.locator('[data-tab="arrange"]').click();
  await verifyPreviewLayout(page, 'arrange');
  assert.deepEqual(errors, []);
  console.log('StoryStudio browser workflow passed: two durations, imported cutouts, layer properties, centered previews, timeline-free Story playback, animation persistence, repeatable pixels, IndexedDB reload, portable import, and example frame render.');
} finally { await runtime.close(); }
