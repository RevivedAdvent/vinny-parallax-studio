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
    version: 1, id: 'parallax-environmental', width, height, fps: 24, totalFrames: 240,
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
  const base = (kind, extra) => ({ id: kind, kind, start: 0, duration: 4, layerIds: ['l3'], ...extra });
  const fresh = async () => { await set({ ...config }); await render(0); return png(); };
  await render(0); const neutral = await png();

  // Wind: pivot rotation is visible, deterministic and leaves Arrange values alone.
  await set({ ...config, layerEffects: [base('wind', { direction: 'right', pivotX: .5, pivotY: 1, rotation: 6, movement: 3, speed: .4, gust: .3, phase: 0, spread: 0 })] });
  await render(.8); const windFrame = await png(), wind = await state();
  assert.notEqual(windFrame, neutral, 'wind changes rendered artwork');
  assert.ok(Math.abs(wind.transforms[3].roll) > .5, `wind rotates around its pivot: ${wind.transforms[3].roll}`);
  assert.ok(Math.abs(wind.transforms[3].x - width / 2) > .5, 'pivot rotation displaces the layer centre');
  assert.equal(wind.config.layers[3].rotation, 0, 'Arrange rotation is untouched');
  await render(9); await render(0); await render(.8);
  assert.equal(await png(), windFrame, 'wind is deterministic after seeking backwards');
  await writeFile('output/parallax/wind.png', Buffer.from(windFrame.split(',')[1], 'base64'));

  // Floating: positional bob, exact loop and independent axes.
  await set({ ...config, layerEffects: [base('float', { axis: 'y', amplitude: 24, speed: .35, phase: 0, rotation: 0 })] });
  await render(1.2); const floatA = await state();
  await render(2.8); const floatB = await state();
  assert.notEqual(floatA.transforms[3].y, floatB.transforms[3].y, 'bobbing moves the layer over time');
  assert.ok(Math.abs(floatA.transforms[3].x - width / 2) < .01, 'vertical bobbing leaves x alone');
  await render(9); await render(0); await render(1.2);
  assert.deepEqual((await state()).transforms, floatA.transforms, 'floating seek is deterministic');

  // Ambient layer loop: tileable drift produces wrap state and reuse; no accumulated copies.
  await set({ ...config, layerEffects: [base('ambient', { mode: 'layer', motion: 'drift', direction: 'right', amplitude: 40, speed: 40, loop: 8, phase: 0, tileable: true })] });
  await render(1.5); const wrapped = await state(), wrapFrame = await png();
  assert.ok(wrapped.wraps.l3 && wrapped.wraps.l3.x > 0, 'tileable drift exposes wrap travel');
  assert.notEqual(wrapFrame, neutral, 'ambient drift changes the rendered frame');
  assert.ok(wrapped.visible.l3, 'wrap copies keep the layer visible');
  await render(8); await render(0); await render(1.5);
  assert.equal(await png(), wrapFrame, 'ambient wrap seek is deterministic');

  // Particle loop: bounded, seeded, visible and fully cleaned up.
  await set({ ...config, layerEffects: [base('ambient', { mode: 'particles', motion: 'drift', direction: 'down', count: 18, speedMin: 10, speedMax: 30, sizeMin: 8, sizeMax: 26, opacityMin: .2, opacityMax: .8, lifetime: 5, regionX: .1, regionY: 0, regionWidth: .8, regionHeight: .9, seed: 7 })] });
  await render(1.7); const particles = await state(), particleFrame = await png();
  assert.equal(particles.particles.l3, 18, 'particle count reaches the renderer');
  assert.notEqual(particleFrame, neutral, 'particles render real artwork');
  assert.deepEqual((await state()).particles, particles.particles, 'particle state is repeatable');
  await render(9); await render(0); await render(1.7);
  assert.equal(await png(), particleFrame, 'particle seek is deterministic');
  await set({ ...config }); await render(1.7);
  assert.equal((await state()).particles.l3, 0, 'deleting particles disposes their views');
  assert.equal(await png(), neutral, 'deleting particles restores the neutral frame');
  await writeFile('output/parallax/particles.png', Buffer.from(particleFrame.split(',')[1], 'base64'));

  // Shadow: silhouette, offset and deterministic light drift.
  await set({ ...config, layerEffects: [base('shadow', { angle: 45, distance: 40, opacity: .6, blur: 8, color: '#002244', speed: .2, amplitude: 6, phase: 0 })] });
  await render(2); const shadow = await state(), shadowFrame = await png();
  assert.ok(shadow.shadows.l3, 'shadow state reaches the renderer');
  assert.equal(shadow.spriteAlpha.l3, 1, 'source opacity is not reduced by the shadow');
  assert.notEqual(shadowFrame, neutral, 'shadow is visible beneath the artwork');
  await render(8); await render(0); await render(2);
  assert.equal(await png(), shadowFrame, 'shadow seek is deterministic');
  await set({ ...config }); await render(2);
  assert.equal((await state()).shadows.l3, null, 'shadow view is disposed with the effect');
  assert.equal(await png(), neutral, 'deleting the shadow restores the frame');

  // Depth scale: exact neutral, depth-weighted multipliers and no stored-depth rewrite.
  await render(0); const scaleNeutral = (await state()).transforms;
  await set({ ...config, depthScale: { near: 1.35, far: .8, reference: .5, strength: 1, influence: {} }, depthPlanes: [{ id: 'reference', name: 'Reference', depth: .5, layerIds: ['l1'] }] }); await render(0);
  const scaled = (await state()).transforms;
  assert.ok(Math.abs(scaled[0].scale / scaleNeutral[0].scale - .8) < 1e-6, 'far depth gets the far multiplier');
  assert.ok(Math.abs(scaled[3].scale / scaleNeutral[3].scale - 1.35) < 1e-6, 'near depth gets the near multiplier');
  assert.ok(Math.abs(scaled[1].scale / scaleNeutral[1].scale - 1) < 1e-6, 'reference depth stays neutral');
  assert.deepEqual((await state()).config.layers.map(layer => layer.depth), [0, 1 / 3, 2 / 3, 1], 'stored depth is unchanged');
  await set({ ...config, depthScale: { near: 1, far: 1, reference: .5, strength: 1, influence: {} } }); await render(0);
  assert.equal(await png(), neutral, 'neutral depth scale renders exactly as before');

  // Multi-plane camera: a plane changes camera depth response but not draw order.
  const truck = { id: 'truck', model: 2, type: 'truck', start: 0, duration: 2, x: width / 2 + 200, y: height / 2, scale: 1 };
  await set({ ...config, cameraMoves: [truck] }); await render(0); const beforeStart = (await state()).transforms;
  await render(2); const beforeEnd = (await state()).transforms;
  const beforeTravel = Math.abs(beforeEnd[0].x - beforeStart[0].x);
  await set({ ...config, cameraMoves: [truck], depthPlanes: [{ id: 'foreground', name: 'Foreground', depth: 1, layerIds: ['l0'] }] });
  await render(0); const planeStart = (await state()).transforms;
  await render(2); const planeEnd = (await state()).transforms;
  const planeTravel = Math.abs(planeEnd[0].x - planeStart[0].x);
  assert.ok(planeTravel > beforeTravel + 5, `plane assignment changes depth response: ${planeTravel} vs ${beforeTravel}`);
  assert.deepEqual(planeEnd.map(pose => pose.id), ['l0', 'l1', 'l2', 'l3'], 'plane depth does not reorder artwork');
  assert.ok(Math.abs(planeEnd[3].x - beforeEnd[3].x) < 1e-6, 'unassigned foreground keeps its response');

  // Warp: neutral start is byte-identical, corners animate and hold, invalid quads are dropped.
  const corners = [{ x: -1.15, y: -1.1 }, { x: 1.2, y: -.9 }, { x: 1.1, y: 1.15 }, { x: -.95, y: 1.2 }];
  await set({ ...config, layerEffects: [base('warp', { corners })] }); await render(0);
  assert.equal(await png(), neutral, 'neutral warp start is pixel-identical');
  await render(2); const warped = await state(), warpFrame = await png();
  assert.ok(warped.warps.l3, 'warp corners reach the renderer');
  assert.notEqual(warpFrame, neutral, 'warp deforms the artwork');
  await render(5); const held = (await state()).warps.l3;
  await render(4); assert.deepEqual((await state()).warps.l3, held, 'warp holds its endpoint');
  await render(8); await render(0); await render(2);
  assert.equal(await png(), warpFrame, 'warp seek is deterministic');
  await writeFile('output/parallax/warp.png', Buffer.from(warpFrame.split(',')[1], 'base64'));
  await set({ ...config, layerEffects: [base('warp', { corners: [{ x: -1, y: -1 }, { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }] })] });
  await render(2);
  assert.equal((await state()).config.layerEffects?.length ?? 0, 0, 'self-intersecting warp is rejected');
  assert.equal((await state()).warps.l3, null, 'rejected warp leaves no renderer state');
  assert.equal(await png(), neutral, 'rejected warp leaves the frame untouched');

  // UI: the second catalogue is collapsible, authors wind, edits and deletes it.
  const ui = await runtime.browser.newPage({ viewport: { width: 1500, height: 1000 } });
  ui.on('pageerror', e => errors.push(e.message));
  ui.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  ui.on('dialog', dialog => dialog.accept());
  await ui.goto(runtime.url); await ui.waitForFunction(() => window.cameraStudio?.ready);
  await ui.locator('[data-tab="arrange"]').click();
  await ui.locator('#asset-files').setInputFiles([resolve('test-images/01-background.png'), resolve('test-images/04-layer 3.png')]);
  await ui.waitForFunction(() => window.cameraStudio.getState().config.layers.length === 2);
  await ui.locator('[data-tab="parallax"]').click();
  await ui.evaluate(()=>{const d=document.getElementById('applied-parallax');if(d)d.open=true;});
  assert.equal(await ui.locator('#parallax-layer-effects').evaluate(node => node.open), false, 'the original six techniques are a collapsed dropdown');
  await ui.locator('#parallax-layer-effects summary').click();
  assert.equal(await ui.locator('#parallax-layer-effects').evaluate(node => node.open), true, 'the original six techniques expand');
  assert.equal(await ui.locator('#parallax-catalogue [data-parallax]').count(), 6, 'existing six cards are unchanged');
  assert.equal(await ui.locator('#parallax-environmental-targets [data-parallax]').count(), 7, 'seven environmental cards');
  assert.equal(await ui.locator('#parallax-environmental').evaluate(node => node.open), false, 'environmental catalogue starts collapsed');
  await ui.locator('#parallax-environmental summary').click();
  assert.equal(await ui.locator('#parallax-environmental').evaluate(node => node.open), true, 'environmental catalogue expands');
  const environmentalGeometry = await ui.evaluate(() => {
    const cards = [...document.querySelectorAll('#parallax-environmental-targets [data-parallax]')];
    return {
      clipped: cards.filter(card => card.scrollHeight > card.clientHeight + 1 || card.scrollWidth > card.clientWidth + 1).length,
      tiny: cards.filter(card => { const box = card.getBoundingClientRect(); return box.width < 80 || box.height < 20; }).length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
  assert.deepEqual(environmentalGeometry, { clipped: 0, tiny: 0, overflow: false }, 'environmental cards fit without clipping or page overflow');
  await ui.locator('#parallax-environmental-targets [data-parallax="wind"]').click();
  assert.match(await ui.locator('#parallax-inspector').innerText(), /Sway \/ Wind/);
  await ui.locator('input[name=parallax-layer]').first().check();
  await ui.locator('#wind-rotation').fill('9');
  await ui.locator('#wind-speed').fill('0.5');
  await ui.locator('#parallax-form button[type=submit]').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.layerEffects?.[0]?.kind === 'wind');
  assert.match(await ui.locator('#parallax-effects-list').innerText(), /Sway \/ Wind/);
  await ui.locator('[data-effect-edit]').first().click();
  assert.equal(await ui.locator('#wind-rotation').inputValue(), '9');
  await ui.locator('#wind-rotation').fill('3');
  await ui.locator('#parallax-form button[type=submit]').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.layerEffects?.[0]?.rotation === 3);
  await ui.locator('[data-effect-delete]').first().click();
  await ui.waitForFunction(() => (window.cameraStudio.getState().config.layerEffects?.length ?? 0) === 0);
  assert.equal(await ui.locator('#parallax-effects-list .parallax-item').count(), 0, 'deleting removes the applied row');
  // Depth scale and plane assignments are authored in the same catalogue and survive save/reload.
  await ui.locator('[data-parallax="depthScale"]').click();
  await ui.locator('#depth-scale-near').fill('135');
  await ui.locator('#depth-scale-far').fill('80');
  await ui.locator('#depth-scale-save').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.depthScale?.near === 1.35);
  assert.match(await ui.locator('#parallax-effects-list').innerText(), /Depth-based Scale/);
  await ui.locator('[data-parallax="planes"]').click();
  await ui.locator('#plane-add').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.depthPlanes?.length === 1);
  await ui.locator('[id^=plane-name]').fill('Midground');
  await ui.locator('[id^=plane-depth]').fill('65');
  await ui.locator('[id^=layer-plane]').first().selectOption({ index: 1 });
  await ui.locator('#plane-save').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.depthPlanes?.[0]?.layerIds.length === 1);
  await ui.locator('#save').click();
  await ui.waitForFunction(() => document.querySelector('#save-status').textContent === 'Saved locally');
  await ui.reload(); await ui.waitForFunction(() => window.cameraStudio?.ready);
  await ui.locator('[data-tab="parallax"]').click();
  await ui.evaluate(()=>{const d=document.getElementById('applied-parallax');if(d)d.open=true;});
  const persisted = (await ui.evaluate(() => window.cameraStudio.getState())).config;
  assert.equal(persisted.depthScale.near, 1.35, 'depth scale persists with the scene');
  assert.equal(persisted.depthPlanes[0].name, 'Midground', 'plane names persist');
  assert.equal(persisted.depthPlanes[0].depth, .65, 'plane depths persist');
  assert.equal(persisted.depthPlanes[0].layerIds.length, 1, 'plane assignments persist');
  assert.deepEqual(persisted.layers.map(layer => layer.id), persisted.layers.map(layer => layer.id), 'saved layer order is stable');
  await mkdir('output/parallax', { recursive: true });
  await ui.screenshot({ path: 'output/parallax/parallax-environmental-ui.png' });
  assert.deepEqual(errors, []);
  console.log('Parallax environmental browser checks passed: wind, float, ambient wrap, particles, shadows, depth scale, planes, warp, UI authoring.');
} finally { await runtime.close(); }
