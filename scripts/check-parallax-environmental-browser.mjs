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

  // ---- UI: conditional forms and folder-aware depth authoring ----------------
  const ui = await runtime.browser.newPage({ viewport: { width: 1500, height: 1000 } });
  ui.on('pageerror', e => errors.push(e.message));
  ui.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  ui.on('dialog', dialog => dialog.accept());
  await ui.goto(runtime.url); await ui.waitForFunction(() => window.cameraStudio?.ready);
  const currentConfig = async () => (await ui.evaluate(() => window.cameraStudio.getState())).config;
  await ui.locator('[data-tab="arrange"]').click();
  await ui.locator('#asset-files').setInputFiles([resolve('test-images/01-background.png'), resolve('test-images/04-layer 3.png')]);
  await ui.waitForFunction(() => window.cameraStudio.getState().config.layers.length === 2);
  await ui.locator('[data-tab="parallax"]').click();
  await ui.evaluate(() => { const applied = document.getElementById('applied-parallax'); if (applied) applied.open = true; });
  const categoryOf = { drift: 'motion', framing: 'motion', wind: 'motion', float: 'motion', ambient: 'motion', fade: 'appearance', reveal: 'appearance', shadow: 'appearance', transform: 'deformation', warp: 'deformation', depthScale: 'depth', planes: 'depth' };
  const openCategory = async id => {
    const details = ui.locator(`.parallax-category[data-category="${id}"]`);
    if (!(await details.evaluate(node => node.open))) await details.locator('summary').click();
  };
  const choose = async id => { await openCategory(categoryOf[id]); await ui.locator(`[data-parallax="${id}"]`).click(); };
  const openAdvanced = async () => {
    const details = ui.locator('.parallax-advanced');
    if (!(await details.isVisible())) return false;
    if (!(await details.evaluate(node => node.open))) await details.locator('summary').click();
    return true;
  };
  const visible = async id => ui.locator(`#${id}`).isVisible();

  // Sway / Wind: Basic and Advanced keep every existing parameter.
  await choose('wind');
  assert.match(await ui.locator('#parallax-inspector').innerText(), /Sway \/ Wind/);
  assert.equal(await ui.locator('input[name=wind-direction]').first().isVisible(), true, 'wind direction is visible');
  assert.equal(await visible('wind-rotation'), true);
  assert.equal(await visible('wind-speed'), true);
  assert.equal(await visible('wind-gust'), true);
  assert.equal(await ui.locator('.parallax-advanced').evaluate(node => node.open), false, 'advanced starts collapsed');
  await ui.locator('[data-picker-all]').click();
  await ui.locator('#wind-rotation').fill('9');
  await ui.locator('#wind-speed').fill('0.5');
  await ui.locator('#parallax-form button[type=submit]').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.layerEffects?.[0]?.kind === 'wind');
  assert.match(await ui.locator('#parallax-effects-list').innerText(), /Sway \/ Wind/);
  await ui.locator('[data-effect-edit]').first().click();
  assert.equal(await openAdvanced(), true);
  assert.equal(await ui.locator('#wind-rotation').inputValue(), '9', 'basic values reload');
  assert.equal(await ui.locator('#wind-pivot-y').inputValue(), '100', 'advanced pivot values reload');
  await ui.locator('#wind-rotation').fill('3');
  await ui.locator('#parallax-form button[type=submit]').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.layerEffects?.[0]?.rotation === 3);
  await ui.locator('[data-effect-delete]').first().click();
  await ui.waitForFunction(() => (window.cameraStudio.getState().config.layerEffects?.length ?? 0) === 0);

  // Ambient: Layer Loop shows only layer controls, Particle Loop only particles.
  await choose('ambient');
  assert.match(await ui.locator('#parallax-inspector').innerText(), /Ambient Looping/);
  assert.equal(await visible('ambient-motion'), true, 'layer loop shows its motion selector');
  assert.equal(await visible('ambient-loop'), true);
  assert.equal(await visible('ambient-count'), false, 'particle controls stay hidden in layer mode');
  assert.equal(await openAdvanced(), true);
  assert.equal(await visible('ambient-phase'), true, 'oscillation has a phase');
  assert.equal(await visible('ambient-tileable'), false, 'tileable only applies to drift');
  await ui.locator('#ambient-motion').selectOption('drift');
  assert.equal(await visible('ambient-speed'), true, 'continuous drift exposes speed');
  assert.equal(await visible('ambient-loop'), false, 'continuous drift hides the loop period');
  assert.equal(await visible('ambient-amplitude'), false, 'continuous drift hides pulse amplitude');
  assert.equal(await visible('ambient-phase'), false, 'phase is irrelevant to drift');
  assert.equal(await visible('ambient-tileable'), true);
  await ui.locator('#ambient-motion').selectOption('pulse');
  assert.equal(await visible('ambient-amplitude'), true);
  assert.equal(await visible('ambient-loop'), true);
  assert.equal(await visible('ambient-speed'), false, 'drift speed is hidden for opacity pulse');
  assert.equal(await ui.locator('input[name=ambient-direction]').first().isVisible(), false, 'direction has no effect on opacity pulse');
  await ui.locator('input[name=ambient-mode][value=particles]').check();
  assert.equal(await visible('ambient-count'), true, 'particle mode exposes particle controls');
  assert.equal(await visible('ambient-motion'), false, 'layer loop controls disappear in particle mode');
  assert.equal(await visible('ambient-amplitude'), false);
  await ui.locator('#ambient-count').fill('44');
  await ui.locator('#ambient-size-min').fill('12');
  await ui.locator('#ambient-size-max').fill('30');
  assert.equal(await visible('ambient-lifetime'), true, 'particle advanced settings stay available');
  await ui.locator('input[name=ambient-mode][value=layer]').check();
  assert.equal(await ui.locator('#ambient-count').inputValue(), '44', 'hidden particle values survive a mode switch');
  await ui.locator('input[name=ambient-mode][value=particles]').check();
  assert.equal(await ui.locator('#ambient-size-min').inputValue(), '12', 'unsaved values survive repeated mode switches');
  await ui.locator('input[name=ambient-mode][value=layer]').check();
  await ui.locator('#ambient-motion').selectOption('drift');
  await ui.locator('#ambient-tileable').check();
  await ui.locator('input[name=ambient-mode][value=particles]').check();
  await ui.locator('#ambient-count').fill('44');
  await ui.locator('#parallax-form button[type=submit]').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.layerEffects?.[0]?.kind === 'ambient');
  let ambient = (await currentConfig()).layerEffects[0];
  assert.equal(ambient.mode, 'particles', 'particle mode saves');
  assert.equal(ambient.count, 44);
  assert.equal(ambient.sizeMin, 12);
  assert.equal(ambient.tileable, true, 'irrelevant stored layer settings are preserved');
  await ui.locator('[data-effect-edit]').first().click();
  await ui.locator('input[name=ambient-mode][value=layer]').check();
  await ui.locator('#ambient-motion').selectOption('drift');
  await ui.locator('#parallax-form button[type=submit]').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.layerEffects?.[0]?.mode === 'layer');
  ambient = (await currentConfig()).layerEffects[0];
  assert.equal(ambient.motion, 'drift');
  assert.equal(ambient.count, 44, 'particle count is preserved when switching back to layer mode');
  assert.equal(ambient.sizeMax, 30);
  await ui.locator('[data-effect-delete]').first().click();
  await ui.waitForFunction(() => (window.cameraStudio.getState().config.layerEffects?.length ?? 0) === 0);

  // Reveal: wipe and radial expose only their relevant controls.
  await choose('reveal');
  assert.equal(await visible('reveal-direction') || await ui.locator('input[name=reveal-direction]').first().isVisible(), true, 'wipe shows direction');
  assert.equal(await ui.locator('.parallax-advanced').evaluate(node => node.hidden), true, 'wipe has no radial origin section');
  await ui.locator('input[name=reveal-mask][value=radial]').check();
  assert.equal(await ui.locator('input[name=reveal-direction]').first().isVisible(), false, 'radial hides wipe direction');
  assert.equal(await ui.locator('.parallax-advanced').evaluate(node => node.hidden), false, 'radial exposes origin controls');
  await openAdvanced();
  assert.equal(await visible('reveal-origin-x'), true);
  assert.equal(await visible('reveal-origin-y'), true);
  await ui.locator('#reveal-origin-x').fill('25');
  await ui.locator('input[name=reveal-mask][value=wipe]').check();
  await ui.locator('#parallax-form button[type=submit]').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.layerEffects?.[0]?.kind === 'reveal');
  let reveal = (await currentConfig()).layerEffects[0];
  assert.equal(reveal.mask, 'wipe');
  assert.ok(Math.abs(reveal.originX - .25) < 1e-9, 'radial origin is preserved while hidden');
  await ui.locator('[data-effect-edit]').first().click();
  await ui.locator('input[name=reveal-mask][value=radial]').check();
  await ui.locator('#parallax-form button[type=submit]').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.layerEffects?.[0]?.mask === 'radial');
  reveal = (await currentConfig()).layerEffects[0];
  assert.ok(Math.abs(reveal.originX - .25) < 1e-9, 'stored radial origin survives re-editing');
  await ui.locator('[data-effect-delete]').first().click();
  await ui.waitForFunction(() => (window.cameraStudio.getState().config.layerEffects?.length ?? 0) === 0);

  // Folder-aware Depth-based Scale influence hierarchy.
  await choose('depthScale');
  assert.equal(await visible('depth-scale-near'), true);
  assert.equal(await visible('depth-scale-reference'), false, 'reference depth is an advanced setting');
  await openAdvanced();
  assert.equal(await ui.locator('[id^=scale-influence]').count(), 2, 'every layer has its own influence');
  await ui.locator('#depth-scale-near').fill('135');
  await ui.locator('#depth-scale-far').fill('80');
  await ui.locator('[id^=scale-influence]').first().fill('50');
  await ui.locator('#depth-scale-save').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.depthScale?.near === 1.35);
  const depthScale = (await currentConfig()).depthScale;
  assert.equal(depthScale.far, .8);
  assert.equal(Object.values(depthScale.influence).filter(value => value !== 1).length, 1, 'each influence value is independently editable');
  // Group the existing layers under a folder and confirm the hierarchy follows.
  await ui.locator('[data-tab="arrange"]').click();
  await ui.locator('#add-folder').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.folders?.length === 1);
  const layerIds = (await currentConfig()).layers.map(layer => layer.id);
  for (const id of layerIds) {
    await ui.locator(`[data-drag="layer:${id}"]`).click({ button: 'right' });
    await ui.locator('.context-menu-item', { hasText: 'Folder 1' }).last().click();
    await ui.waitForTimeout(200);
  }
  await ui.locator('[data-tab="parallax"]').click();
  await ui.locator('[data-parallax="depthScale"]').click();
  await openAdvanced();
  assert.equal(await ui.locator('.parallax-layer-group-head').count(), 1, 'influence rows are grouped under their folder');
  assert.equal(await ui.locator('[id^=scale-influence]').count(), 2, 'every member keeps an independent influence field');

  // Multi-plane Camera: folder bulk assignment expands into explicit layer ids.
  const originalDepths = (await currentConfig()).layers.map(layer => layer.depth);
  await choose('planes');
  await ui.locator('#plane-add').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.depthPlanes?.length === 1);
  await ui.locator('#plane-add').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.depthPlanes?.length === 2);
  assert.equal(await ui.locator('#plane-depth-exact-0').isVisible(), false, 'exact depths are advanced settings');
  await ui.locator('#plane-name-0').fill('Midground');
  await ui.locator('#plane-depth-0').fill('65');
  await ui.locator('.number-wrap:has(#plane-depth-0) [data-step=up]').click();
  assert.equal(await ui.locator('#plane-depth-0').inputValue(), '66', 'plane depth uses the shared stepper');
  await ui.locator('.number-wrap:has(#plane-depth-0) [data-step=down]').click();
  await ui.locator('#plane-name-1').fill('Foreground');
  assert.equal(await ui.locator('[data-folder-plane]').count(), 1, 'folders get a bulk assignment control');
  await ui.locator('[data-folder-plane]').selectOption({ index: 1 });
  assert.deepEqual(await ui.locator('[id^=layer-plane]').evaluateAll(nodes => nodes.map(node => node.value)), [await ui.locator('[data-folder-plane] option').nth(1).getAttribute('value'), await ui.locator('[data-folder-plane] option').nth(1).getAttribute('value')], 'folder assignment fills every member');
  await ui.locator('[id^=layer-plane]').first().selectOption({ index: 2 });
  await ui.locator('#plane-save').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.depthPlanes?.length === 2);
  const planes = (await currentConfig()).depthPlanes;
  assert.equal(planes[0].name, 'Midground');
  assert.equal(planes[0].depth, .65);
  assert.ok(planes[0].layerIds.length >= 1 && planes[1].layerIds.length >= 1, 'individual overrides remain possible');
  assert.equal(new Set([...planes[0].layerIds, ...planes[1].layerIds]).size, planes[0].layerIds.length + planes[1].layerIds.length, 'each layer belongs to at most one plane');
  const knownLayerIds = new Set((await currentConfig()).layers.map(layer => layer.id));
  assert.ok(planes.every(plane => plane.layerIds.every(id => knownLayerIds.has(id))), 'plane assignments store layer ids');
  assert.deepEqual((await currentConfig()).layers.map(layer => layer.depth), originalDepths, 'stored depth is untouched');
  await openAdvanced();
  assert.equal(await ui.locator('#plane-depth-exact-0').inputValue(), '0.65', 'exact depth mirrors the percentage');
  await ui.locator('#plane-depth-exact-0').fill('0.4');
  assert.equal(await ui.locator('#plane-depth-0').inputValue(), '40', 'exact and percentage depth stay in step');
  await ui.locator('#plane-save').click();
  await ui.waitForTimeout(250);
  assert.equal((await currentConfig()).depthPlanes[0].depth, .4);

  // Persistence across a reload.
  await ui.locator('#save').click();
  await ui.waitForFunction(() => document.querySelector('#save-status').textContent === 'Saved locally');
  await ui.reload(); await ui.waitForFunction(() => window.cameraStudio?.ready);
  await ui.locator('[data-tab="parallax"]').click();
  await ui.evaluate(() => { const applied = document.getElementById('applied-parallax'); if (applied) applied.open = true; });
  const persisted = await currentConfig();
  assert.equal(persisted.depthScale.near, 1.35, 'depth scale persists');
  assert.equal(persisted.depthPlanes[0].name, 'Midground');
  assert.equal(persisted.depthPlanes[0].depth, .4);
  assert.equal(persisted.depthPlanes.reduce((sum, plane) => sum + plane.layerIds.length, 0), 2, 'plane assignments persist');
  assert.deepEqual(persisted.layers.map(layer => layer.depth), originalDepths, 'stored depths are unchanged after reload');
  assert.deepEqual(errors, []);
  console.log('Parallax environmental browser checks passed: wind, float, ambient wrap, particles, shadows, depth scale, planes, warp, conditional Ambient/Reveal forms and folder-aware depth authoring.');
} finally { await runtime.close(); }
