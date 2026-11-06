import { launch } from './runtime.mjs';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const runtime = await launch(), errors = [];
try {
  const page = await runtime.browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const width = 1363, height = 768;
  const config = {
    version: 1, id: 'parallax-preview', width, height, fps: 24, totalFrames: 240,
    camera: { baseZoom: 1, maxRoll: 180, anchor: { x: width / 2, y: height / 2 }, limits: { x: { min: -width, max: width }, y: { min: -height, max: height }, zoom: { min: .25, max: 4 }, roll: { min: -30, max: 30 } } }, tracks: [],
    layers: ['01-background.png', '02-layer 1.png', '03-layer 2.png', '04-layer 3.png'].map((asset, i) => ({ id: `l${i}`, name: asset, asset: '/test-images/' + encodeURIComponent(asset), depth: i / 3, order: i, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 })),
  };
  await page.addInitScript(config => { window.__CAMERA_INPUT__ = { config }; }, config);
  await page.goto(runtime.url + '/?render=1');
  await page.waitForFunction(() => window.cameraStudio?.ready);
  const set = cfg => page.evaluate(cfg => window.cameraStudio.setConfig(cfg), cfg);
  const render = t => page.evaluate(t => window.cameraStudio.renderTime(t), t);
  const png = () => page.evaluate(() => window.cameraStudio.capture().png);
  const state = () => page.evaluate(() => window.cameraStudio.getState());
  const colors = () => page.evaluate(() => {
    const source = document.querySelector('#canvas-host canvas'), c = document.createElement('canvas');
    c.width = 80; c.height = 45;
    const ctx = c.getContext('2d'); ctx.drawImage(source, 0, 0, 80, 45);
    const data = ctx.getImageData(0, 0, 80, 45).data, set = new Set();
    for (let i = 0; i < data.length; i += 4) set.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    return set.size;
  });
  const base = (kind, extra) => ({ id: kind, kind, start: 0, duration: 2, layerIds: ['l3'], ...extra });
  await render(0); const neutral = await png();
  await page.evaluate(() => window.cameraStudio.setIntensity(1));

  // Depth-based parallax: same camera move, different layer travel by depth.
  const truck = { id: 'truck', model: 2, type: 'truck', start: 0, duration: 2, x: width / 2 + 200, y: height / 2, scale: 1 };
  const moved = (s, t) => s.transforms;
  await set({ ...config, cameraMoves: [truck] }); await render(0); const startPoses = (await state()).transforms;
  await render(2); const endPoses = (await state()).transforms;
  const travel = endPoses.map((p, i) => Math.abs(p.x - startPoses[i].x));
  assert.ok(travel[3] > travel[0], `foreground travels more: ${travel}`);
  const neutralParallax = await png();
  await set({ ...config, cameraMoves: [truck], parallax: { strength: 2, influence: {} } }); await render(2);
  const strongPoses = (await state()).transforms;
  const strong = Math.abs(strongPoses[3].x - startPoses[3].x);
  assert.ok(strong > travel[3] * 1.1, `stronger parallax exaggerates travel: ${strong} vs ${travel[3]}`);
  await set({ ...config, cameraMoves: [truck], parallax: { strength: 1, influence: { l3: 0 } } }); await render(2);
  const flat = (await state()).transforms;
  assert.ok(Math.abs(flat[3].x - startPoses[3].x) < travel[3], 'zero influence reduces differential response');
  await set({ ...config, cameraMoves: [truck] }); await render(2);
  assert.equal(await png(), neutralParallax, 'neutral parallax renders exactly as before');

  // Drift: deterministic, visible, and gone when the effect is removed.
  await set({ ...config, layerEffects: [base('drift', { axis: 'xy', motion: 'sway', amplitude: 40, speed: .4, phase: 0, seed: 5 })] });
  await render(1); const driftA = await png(); const driftState = await state();
  assert.notEqual(driftA, neutral, 'drift changes rendered artwork');
  assert.ok(Math.abs(driftState.transforms[3].x - width / 2) > 3, 'drift offset is applied before projection');
  await render(7); await render(0); await render(1);
  assert.equal(await png(), driftA, 'seeking back reproduces the drifted frame');
  await set({ ...config }); await render(1); assert.equal(await png(), neutral, 'deleting drift restores the frame');

  // Scale and rotation: selected layer only.
  await set({ ...config, layerEffects: [base('transform', { startScale: 1, endScale: 1.5, startRotation: 0, endRotation: 8 })] });
  await render(2); const scaled = await state();
  assert.ok(Math.abs(scaled.transforms[0].scale - 1) < 1e-6, 'unselected layer keeps its scale');
  assert.ok(scaled.transforms[3].scale > 1.4, 'selected layer scales');
  assert.ok(Math.abs(scaled.transforms[3].roll) > 2, 'selected layer rotates');
  assert.equal(scaled.config.layers[3].scale, 1, 'Arrange scale is untouched');
  await render(0.6); const mid = await state();
  assert.ok(mid.transforms[3].scale > 1 && mid.transforms[3].scale < 1.5, 'scale evaluates at arbitrary time');

  // Foreground framing: entry from the left, other layers untouched.
  await set({ ...config, layerEffects: [base('framing', { direction: 'left', startOffset: 110, endOffset: 0, repeat: 1 })] });
  await render(0); const outside = await state();
  assert.ok(outside.transforms[3].x < width / 2 - 200, 'framing starts outside the frame');
  await render(2); const framed = await state();
  assert.ok(Math.abs(framed.transforms[3].x - width / 2) < 1e-6, 'framing ends at its arranged position');
  assert.ok(Math.abs(framed.transforms[0].x - width / 2) < 1e-6, 'unselected layer does not move');

  // Layer fade: only the selected layer, multiplied by its Arrange opacity.
  await set({ ...config, layerEffects: [base('fade', { startOpacity: 1, endOpacity: 0 })] });
  await render(0); assert.ok((await state()).spriteAlpha.l3 > .99);
  await render(2); const faded = await state();
  assert.ok(faded.spriteAlpha.l3 < .01 && faded.spriteAlpha.l2 > .99, 'only l3 fades');
  assert.equal(faded.config.layers[3].opacity, 1, 'Arrange opacity is preserved');

  // Animated mask reveal: wipe and radial differ, cover only the selected layer, seek identically.
  await set({ ...config, layerEffects: [base('reveal', { mask: 'wipe', direction: 'left', startCoverage: 0, endCoverage: 1, softness: .4 })] });
  await render(0.6); const wipe = await png(); const wipeState = await state();
  assert.notEqual(wipe, neutral, 'partial wipe actually masks artwork');
  assert.equal(wipeState.state.layerMasks.l3.kind, 'wipe');
  assert.ok(wipeState.state.layerMasks.l3.coverage > .2 && wipeState.state.layerMasks.l3.coverage < .4);
  assert.ok((await colors()) > 20, 'masked frame still renders textured artwork');
  await render(3); await render(0); await render(0.6);
  assert.equal(await png(), wipe, 'wipe seeking is deterministic');
  await set({ ...config, layerEffects: [base('reveal', { mask: 'radial', direction: 'left', originX: .5, originY: .5, startCoverage: 0, endCoverage: 1, softness: .2 })] });
  await render(0.6); const radial = await png();
  assert.equal((await state()).state.layerMasks.l3.kind, 'radial');
  assert.notEqual(radial, wipe, 'radial and wipe render differently');
  await mkdir('output/parallax', { recursive: true });
  await writeFile('output/parallax/wipe.png', Buffer.from(wipe.split(',')[1], 'base64'));
  await writeFile('output/parallax/radial.png', Buffer.from(radial.split(',')[1], 'base64'));
  await render(2); const open = await png();
  await set({ ...config }); await render(2);
  assert.equal(await png(), open, 'fully revealed layer matches no-mask rendering at the end');
  assert.equal((await state()).state.layerMasks, undefined, 'deleting the reveal removes mask state');
  await render(1.5); assert.equal(await png(), neutral, 'removing the reveal restores unmasked artwork');
  await set({ ...config, layers: config.layers.slice(0, 2) }); await render(1);
  assert.equal((await state()).state.layerMasks, undefined, 'changing the scene clears mask state');

  // Masks and camera moves together project the masked mesh.
  await set({ ...config, cameraMoves: [truck], layerEffects: [base('reveal', { mask: 'wipe', direction: 'left', startCoverage: 0, endCoverage: 1, softness: .3 })] });
  await render(.6); const maskedMove = await state();
  assert.equal(maskedMove.state.layerMasks.l3.kind, 'wipe'); assert.ok(maskedMove.state.virtualCamera.x > 0);
  await render(1.5); const maskedMoveLater = await png(); assert.notEqual(maskedMoveLater, neutral, 'masked layer renders under a camera move');

  // Effects + camera moves together.
  await set({ ...config, cameraMoves: [truck], layerEffects: [base('fade', { startOpacity: 1, endOpacity: .2 })] });
  await render(2); const composed = await state();
  assert.ok(composed.state.virtualCamera.x > 0 && composed.spriteAlpha.l3 < .3, 'camera and layer effects compose');
  assert.deepEqual(errors, []);
  // Authoring workflow: cards, inspector, applied list, edit, delete and persistence.
  const ui = await runtime.browser.newPage({ viewport: { width: 1500, height: 1000 } });
  ui.on('pageerror', e => errors.push(e.message));
  ui.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  ui.on('dialog', dialog => dialog.accept());
  await ui.goto(runtime.url); await ui.waitForFunction(() => window.cameraStudio?.ready);
  const uiState = () => ui.evaluate(() => window.cameraStudio.getState());
  await ui.locator('[data-tab="arrange"]').click();
  await ui.locator('#asset-files').setInputFiles([resolve('test-images/01-background.png'), resolve('test-images/04-layer 3.png')]);
  await ui.waitForFunction(() => window.cameraStudio.getState().config.layers.length === 2);
  await ui.locator('[data-tab="parallax"]').click();
  assert.equal(await ui.locator('#parallax-catalogue [data-parallax]').count(), 6, 'six feature cards');
  assert.equal(await ui.locator('#parallax-layer-effects').evaluate(node => node.open), false, 'first six techniques start collapsed');
  await ui.locator('#parallax-layer-effects summary').click();
  assert.equal(await ui.locator('#parallax-layer-effects').evaluate(node => node.open), true, 'first six techniques expand from their dropdown');
  assert.match(await ui.locator('.parallax-pane').innerText(), /PARALLAX AND LAYER ANIMATION/);
  assert.match(await ui.locator('.parallax-pane').innerText(), /Stronger movement is not always better/);
  assert.match(await ui.locator('#parallax-inspector').innerText(), /Choose a technique/);
  // Drift
  await ui.locator('[data-parallax="drift"]').click();
  assert.match(await ui.locator('#parallax-inspector').innerText(), /Independent layer drift/);
  await ui.locator('#parallax-duration').fill('4');
  await ui.locator('#drift-amplitude').fill('30');
  await ui.locator('#parallax-form button[type=submit]').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.layerEffects?.length === 1);
  assert.match(await ui.locator('#parallax-effects-list').innerText(), /Independent layer drift/);
  // Edit drift
  await ui.locator('[data-effect-edit]').first().click();
  assert.equal(await ui.locator('#drift-amplitude').inputValue(), '30');
  await ui.locator('#drift-amplitude').fill('18');
  await ui.locator('#parallax-form button[type=submit]').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.layerEffects[0].amplitude === 18);
  // Fade on the second layer
  await ui.locator('[data-parallax="fade"]').click();
  await ui.locator('input[name=parallax-layer]').last().check();
  await ui.locator('#fade-from').fill('100'); await ui.locator('#fade-to').fill('0');
  await ui.locator('#parallax-start').fill('2');
  await ui.locator('#parallax-form button[type=submit]').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.layerEffects?.length === 2);
  // Radial reveal on the first layer
  await ui.locator('[data-parallax="reveal"]').click();
  await ui.locator('#reveal-mask').selectOption('radial');
  await ui.locator('#reveal-to').fill('80');
  await ui.locator('#parallax-form button[type=submit]').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.layerEffects?.length === 3);
  // Depth settings
  await ui.locator('[data-parallax="depth"]').click();
  await ui.locator('#parallax-strength').fill('150');
  await ui.locator('#parallax-depth-save').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.parallax?.strength === 1.5);
  assert.match(await ui.locator('#parallax-effects-list').innerText(), /Depth-based parallax/);
  await ui.screenshot({ path: 'output/parallax/parallax-ui.png' });
  const geometry = await ui.evaluate(() => {
    const area = document.querySelector('.parallax-pane');
    const cards = [...document.querySelectorAll('#parallax-catalogue [data-parallax]')];
    const rows = [...document.querySelectorAll('#parallax-effects-list .parallax-item')];
    const buttons = [...document.querySelectorAll('#parallax-effects-list .parallax-actions button')];
    const inspector = document.querySelector('#parallax-inspector');
    return {
      viewport: document.documentElement.clientWidth,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      cards: cards.length,
      cardClipped: cards.filter(c => c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1).length,
      cardZero: cards.filter(c => c.getBoundingClientRect().width < 80 || c.getBoundingClientRect().height < 20).length,
      rows: rows.length,
      rowClipped: rows.filter(r => r.scrollWidth > r.clientWidth + 1).length,
      buttons: buttons.length,
      buttonHidden: buttons.filter(b => { const r = b.getBoundingClientRect(); return r.width < 20 || r.height < 10 || r.right > document.documentElement.clientWidth + 1; }).length,
      paneRight: area.getBoundingClientRect().right,
      inspectorHidden: inspector.getBoundingClientRect().height < 20,
    };
  });
  assert.equal(geometry.pageOverflow, false, `page overflows horizontally: ${JSON.stringify(geometry)}`);
  assert.equal(geometry.cards, 6); assert.equal(geometry.cardClipped, 0, `clipped cards: ${JSON.stringify(geometry)}`);
  assert.equal(geometry.cardZero, 0, `cards without size: ${JSON.stringify(geometry)}`);
  assert.equal(geometry.rows, 4, 'depth settings plus three effects are listed');
  assert.equal(geometry.rowClipped, 0, `clipped applied rows: ${JSON.stringify(geometry)}`);
  assert.equal(geometry.buttons, 11, 'Edit, Duplicate and Delete per effect plus depth Edit/Reset');
  assert.equal(geometry.buttonHidden, 0, `unreachable buttons: ${JSON.stringify(geometry)}`);
  assert.equal(geometry.inspectorHidden, false, 'inspector stays visible');
  await ui.locator('[data-tab="effects"]').click();
  await ui.locator('[data-tab="parallax"]').click();
  await ui.locator('#scrub').fill('1.5');
  await ui.waitForFunction(() => Math.abs(window.cameraStudio.getState().frame / window.cameraStudio.getState().config.fps - 1.5) < .02);
  let effects = (await uiState()).state.layerMasks;
  assert.equal(Object.values(effects ?? {}).length, 1, 'only the reveal layer is masked');
  await ui.locator('#save').click();
  await ui.waitForFunction(() => document.querySelector('#save-status').textContent === 'Saved locally');
  await ui.reload(); await ui.waitForFunction(() => window.cameraStudio?.ready);
  await ui.locator('[data-tab="parallax"]').click();
  const saved = await uiState();
  assert.equal(saved.config.layerEffects.length, 3, 'effects persist after reload');
  assert.equal(saved.config.parallax.strength, 1.5, 'depth settings persist');
  assert.equal(saved.config.layerEffects.find(e => e.kind === 'reveal').mask, 'radial');
  assert.equal(saved.config.layerEffects.find(e => e.kind === 'drift').amplitude, 18);
  assert.ok(saved.config.layers.every(l => l.scale === 1 && l.opacity === 1 && l.x === 0 && l.y === 0), 'Arrange transforms are preserved');
  await ui.locator('[data-tab="parallax"]').click();
  await ui.locator('[data-effect-delete]').first().click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.layerEffects.length === 2);
  assert.deepEqual(errors, []);
  console.log('Parallax browser checks passed: preview pixels and masks, depth travel, deterministic seeking, six cards, authoring, editing, deleting and persistence.');
} finally { await runtime.close(); }
