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
  // ---- UI: categories, Basic/Advanced, folder-aware selection, Depth based Parallax & Scale --
  const ui = await runtime.browser.newPage({ viewport: { width: 1400, height: 900 } });
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

  // Preview protection: the canvas viewport keeps its pre-redesign geometry.
  const geometryBaseline = { '1400x900': { w: 812, h: 742 }, '1920x1080': { w: 1332, h: 922 }, '1100x800': { w: 592, h: 642 } };
  for (const [size, expected] of Object.entries(geometryBaseline)) {
    const [viewportWidth, viewportHeight] = size.split('x').map(Number);
    await ui.setViewportSize({ width: viewportWidth, height: viewportHeight });
    await ui.waitForTimeout(120);
    const box = await ui.evaluate(() => {
      const viewer = document.querySelector('#viewer').getBoundingClientRect();
      const canvas = document.querySelector('#canvas-host canvas').getBoundingClientRect();
      return {
        w: viewer.width, h: viewer.height, cw: canvas.width, ch: canvas.height,
        hostChildren: document.querySelector('#canvas-host').children.length,
        overlays: document.querySelectorAll('#viewer [data-preview-overlay], #viewer .preview-handle, #viewer .parallax-overlay').length,
      };
    });
    assert.ok(box.w >= expected.w - 1 && box.h >= expected.h - 1, `preview shrank at ${size}: ${JSON.stringify(box)}`);
    assert.ok(box.cw > 0 && box.ch > 0, `canvas renders at ${size}`);
    assert.equal(box.hostChildren, 1, 'preview host contains only the canvas');
    assert.equal(box.overlays, 0, 'no new preview controls or overlays');
  }
  await ui.setViewportSize({ width: 1500, height: 1000 });
  await ui.waitForTimeout(120);

  const categoryOf = {
    depth: 'depth', planes: 'depth',
    drift: 'motion', framing: 'motion', wind: 'motion', float: 'motion', ambient: 'motion',
    fade: 'appearance', reveal: 'appearance', shadow: 'appearance',
    transform: 'deformation', warp: 'deformation',
  };
  const openCategory = async id => {
    const details = ui.locator(`.parallax-category[data-category="${id}"]`);
    if (!(await details.evaluate(node => node.open))) await details.locator('summary').click();
  };
  const choose = async id => { await openCategory(categoryOf[id]); await ui.locator(`[data-parallax="${id}"]`).click(); };

  // Four categories with every existing effect in place.
  assert.deepEqual(await ui.locator('.parallax-category-name').allInnerTexts(), ['Depth & Perspective', 'Layer Motion', 'Layer Appearance', 'Advanced Deformation']);
  assert.deepEqual((await ui.locator('.parallax-category-count').allInnerTexts()).map(Number), [2, 5, 3, 2]);
  assert.equal(await ui.locator('#parallax-categories [data-parallax]').count(), 12, 'no unrelated effect is removed');
  const expectedByCategory = {
    depth: ['depth', 'planes'],
    motion: ['drift', 'framing', 'wind', 'float', 'ambient'],
    appearance: ['fade', 'reveal', 'shadow'],
    deformation: ['transform', 'warp'],
  };
  for (const [id, expected] of Object.entries(expectedByCategory)) {
    assert.deepEqual(await ui.locator(`.parallax-category[data-category="${id}"] [data-parallax]`).evaluateAll(nodes => nodes.map(node => node.dataset.parallax)), expected, `${id} catalogue`);
  }
  assert.equal(await ui.locator('.parallax-category[data-category=depth]').evaluate(node => node.open), true, 'depth category starts open');
  assert.equal(await ui.locator('.parallax-category[data-category=motion]').evaluate(node => node.open), false, 'other categories start collapsed');
  await ui.locator('.parallax-category[data-category=depth] summary').click();
  assert.equal(await ui.locator('.parallax-category[data-category=depth]').evaluate(node => node.open), false, 'categories collapse');
  await ui.locator('.parallax-category[data-category=motion] summary').click();
  assert.equal(await ui.locator('.parallax-category[data-category=motion]').evaluate(node => node.open), true, 'categories expand');
  assert.match(await ui.locator('#parallax-inspector').innerText(), /Choose a technique/);

  // Basic settings visible, Advanced collapsed; no artificial empty sections.
  await choose('drift');
  assert.match(await ui.locator('#parallax-inspector').innerText(), /Independent layer drift/);
  assert.equal(await ui.locator('[data-settings=basic]').isVisible(), true, 'basic settings are visible');
  assert.equal(await ui.locator('.parallax-advanced').evaluate(node => node.open), false, 'advanced settings start collapsed');
  assert.equal(await ui.locator('#drift-phase').count(), 1, 'advanced keeps phase');
  assert.equal(await ui.locator('#drift-seed').count(), 1, 'advanced keeps the variation seed');
  await choose('fade');
  assert.equal(await ui.locator('.parallax-advanced').count(), 0, 'fade has no empty advanced section');
  await choose('framing');
  assert.equal(await ui.locator('#framing-repeat').count(), 1, 'framing keeps its cycle count in advanced');
  await ui.locator('.parallax-advanced summary').click();
  assert.equal(await ui.locator('#framing-repeat').getAttribute('min'), '1');
  assert.equal(await ui.locator('#framing-repeat').getAttribute('max'), '8');
  await choose('transform');
  assert.equal(await ui.locator('.parallax-advanced').count(), 0, 'transform has no empty advanced section');

  // Native controls in the Parallax inspector use the dark palette.
  await choose('drift');
  const scheme = await ui.locator('#parallax-inspector').evaluate(node => getComputedStyle(node).colorScheme);
  assert.equal(scheme, 'dark', 'native controls use the dark palette');
  const selectStyle = await ui.locator('#drift-motion').evaluate(node => { const style = getComputedStyle(node); return { background: style.backgroundColor, color: style.color }; });
  assert.notEqual(selectStyle.background, 'rgb(255, 255, 255)', 'selects are not white');
  assert.notEqual(selectStyle.background, 'rgba(0, 0, 0, 0)', 'selects have an explicit dark background');
  // Number fields reuse the Arrange stepper control instead of native spinners.
  assert.equal(await ui.locator('.number-wrap:has(#drift-amplitude) .number-step').count(), 2, 'two stepper arrows per number field');
  assert.equal(await ui.locator('#drift-amplitude').evaluate(node => getComputedStyle(node).appearance), 'textfield', 'native spinners are suppressed');
  await ui.locator('.number-wrap:has(#drift-amplitude) [data-step=up]').click();
  assert.equal(await ui.locator('#drift-amplitude').inputValue(), '13', 'stepper increments by the field step');
  await ui.locator('.number-wrap:has(#drift-amplitude) [data-step=down]').click();
  assert.equal(await ui.locator('#drift-amplitude').inputValue(), '12', 'stepper decrements by the field step');

  // Numeric validation rejects out-of-range values without adding an effect.
  await ui.locator('#drift-amplitude').fill('401');
  await ui.locator('#parallax-form button[type=submit]').click();
  await ui.waitForTimeout(150);
  assert.equal(((await currentConfig()).layerEffects ?? []).length, 0, 'invalid amplitude is rejected');
  await ui.locator('#drift-amplitude').fill('30');
  await ui.locator('#parallax-form button[type=submit]').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.layerEffects?.length === 1);
  await ui.locator('.parallax-advanced summary').click();
  assert.equal(await ui.locator('#drift-phase').inputValue(), '0', 'advanced values load when editing');
  await ui.locator('#drift-phase').fill('45');
  await ui.locator('#parallax-form button[type=submit]').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.layerEffects?.[0]?.phase === 45);
  await ui.locator('[data-effect-duplicate]').first().click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.layerEffects.length === 2);
  await ui.locator('[data-effect-delete]').first().click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.layerEffects.length === 1);
  assert.match(await ui.locator('#parallax-effects-list').innerText(), /Independent layer drift/, 'applied list keeps Edit, Duplicate and Delete');

  // Arrange folders are reused, not recreated.
  await ui.locator('[data-tab="arrange"]').click();
  await ui.locator('#add-folder').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.folders?.length === 1);
  const layerIds = (await currentConfig()).layers.map(layer => layer.id);
  for (const id of layerIds) {
    await ui.locator(`[data-drag="layer:${id}"]`).click({ button: 'right' });
    await ui.locator('.context-menu-item', { hasText: 'Folder 1' }).last().click();
    await ui.waitForTimeout(200);
  }
  await ui.locator(`[data-drag="layer:${layerIds[0]}"] .eye-toggle`).click();
  await ui.waitForTimeout(200);
  await ui.locator(`[data-drag="layer:${layerIds[0]}"] .lock-toggle`).click({ force: true });
  await ui.waitForTimeout(250);

  // Multi-target folder picker.
  await ui.locator('[data-tab="parallax"]').click();
  await choose('fade');
  assert.equal(await ui.locator('.parallax-picker-folder').count(), 1, 'layers sit under their Arrange folder');
  assert.equal(await ui.locator('.parallax-picker-layer').count(), 2, 'both folder members are listed');
  assert.equal(await ui.locator('.parallax-picker-badge.hidden').count(), 1, 'hidden state is shown');
  assert.equal(await ui.locator('.parallax-picker-badge.locked').count(), 1, 'locked state is shown');
  const folderBox = ui.locator('.parallax-picker-folder-head input');
  await folderBox.check();
  assert.equal(await ui.locator('input[name=parallax-layer]:checked').count(), 2, 'folder checkbox selects current members');
  await ui.locator('input[name=parallax-layer]').first().uncheck();
  assert.equal(await folderBox.evaluate(node => node.indeterminate), true, 'partial folder selection is indeterminate');
  assert.equal(await ui.locator('.parallax-picker-total').innerText(), '1 selected');
  await folderBox.check();
  await ui.locator('[data-picker-search]').fill('04');
  assert.equal(await ui.locator('.parallax-picker-layer').count(), 1, 'search filters children');
  assert.equal(await ui.locator('.parallax-picker-folder').count(), 1, 'matching parent stays visible');
  await ui.locator('[data-picker-search]').fill('');
  assert.equal(await ui.locator('input[name=parallax-layer]:checked').count(), 2, 'clearing search restores selection');
  await ui.locator('#parallax-form button[type=submit]').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.layerEffects.filter(effect => effect.kind === 'fade').length === 1);
  const savedFade = (await currentConfig()).layerEffects.find(effect => effect.kind === 'fade');
  assert.deepEqual([...savedFade.layerIds].sort(), [...layerIds].sort(), 'folder selection expands to real layer ids');
  assert.ok(!savedFade.layerIds.includes((await currentConfig()).folders[0].id), 'folder ids are never stored');

  // Single-target picker uses radios and never a folder checkbox.
  await choose('warp');
  assert.equal(await ui.locator('input[name=parallax-layer][type=radio]').count(), 2, 'single target uses radios');
  assert.equal(await ui.locator('[data-folder-check]').count(), 0, 'folder rows cannot be the single target');
  assert.equal(await ui.locator('input[name=parallax-layer]:checked').count(), 1, 'exactly one single target');
  assert.equal(await ui.locator('[data-picker-all]').count(), 0, 'single target has no Select all');
  assert.equal(await ui.locator('[data-picker-clear]').count(), 0, 'single target has no Clear');
  // Arrange multi-selection prepopulates new multi-target effects.
  await ui.locator('[data-tab="arrange"]').click();
  const arrangeRows = ui.locator('#layer-list .layer-row[data-drag^="layer:"]');
  await arrangeRows.nth(0).click();
  await arrangeRows.nth(1).click({ modifiers: ['Control'] });
  await ui.locator('[data-tab="parallax"]').click();
  await choose('framing');
  assert.equal(await ui.locator('input[name=parallax-layer]:checked').count(), 2, 'Arrange selection prepopulates new effects');
  await ui.locator('#parallax-form button[type=submit]').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.layerEffects.some(effect => effect.kind === 'framing'));
  // Editing uses the stored targets even when the Arrange selection changed.
  await ui.locator('[data-tab="arrange"]').click();
  await arrangeRows.nth(0).click();
  await ui.locator('[data-tab="parallax"]').click();
  const framedRow = ui.locator('#parallax-effects-list .parallax-item', { hasText: 'Foreground framing' });
  await framedRow.locator('[data-effect-edit]').click();
  assert.equal(await ui.locator('input[name=parallax-layer]:checked').count(), 2, 'editing restores the stored target ids');

  // Depth based Parallax & Scale: one camera-response editor with an optional size adjustment.
  await choose('depth');
  assert.match(await ui.locator('#parallax-inspector').innerText(), /Depth based Parallax & Scale/i);
  assert.equal(await ui.locator('[data-settings=basic]').isVisible(), true, 'camera response is immediately visible');
  assert.match(await ui.locator('#parallax-inspector').innerText(), /Camera response/i);
  assert.equal(await ui.locator('.parallax-advanced').count(), 1, 'one advanced section');
  assert.equal(await ui.locator('.parallax-advanced').evaluate(node => node.open), false, 'size adjustment starts collapsed');
  assert.equal(await ui.locator('#parallax-strength').getAttribute('min'), '0');
  assert.equal(await ui.locator('#parallax-strength').getAttribute('max'), '300');
  assert.equal(await ui.locator('#parallax-strength').inputValue(), '100', 'global strength defaults to 100%');
  assert.equal(await ui.locator('#parallax-strength-value').inputValue(), '100', 'the strength slider has a numeric companion');
  assert.equal(await ui.locator('.number-wrap:has(#parallax-strength-value) .number-step').count(), 2, 'the numeric strength uses the shared stepper');
  await ui.locator('.number-wrap:has(#parallax-strength-value) [data-step=up]').click();
  assert.equal(await ui.locator('#parallax-strength').inputValue(), '101', 'the stepper moves the slider');
  assert.equal(await ui.locator('#parallax-strength-value').inputValue(), '101');
  await ui.locator('.number-wrap:has(#parallax-strength-value) [data-step=down]').click();
  assert.equal(await ui.locator('#parallax-strength-value').inputValue(), '100');
  await ui.locator('#parallax-strength').fill('220');
  assert.equal(await ui.locator('#parallax-strength-value').inputValue(), '220', 'moving the slider updates the number');
  // Both engines paint the same thin gold rail instead of their native widgets.
  assert.equal(await ui.locator('#parallax-strength').evaluate(node => getComputedStyle(node).appearance), 'none', 'the range uses the shared normalised styling');
  await ui.locator('#parallax-strength-value').fill('63');
  assert.equal(await ui.locator('#parallax-strength').evaluate(node => node.style.getPropertyValue('--range-fill')), '21%', 'the gold fill follows the value');
  assert.equal(await ui.locator('[id^=influence-]').first().getAttribute('max'), '300');
  assert.equal(await ui.locator('[id^=influence-]').first().inputValue(), '100', 'layer influence defaults to 100%');
  assert.equal(await ui.locator('.number-wrap:has([id^=influence-]) .number-step').count(), 4, 'each influence row uses the shared stepper control');
  assert.equal(await ui.locator('.parallax-depth-row input[type=range]').first().getAttribute('min'), '0');
  assert.equal(await ui.locator('.parallax-depth-row input[type=range]').first().getAttribute('max'), '100');
  assert.equal(await ui.locator('.parallax-layer-group').count(), 1, 'layer rows reuse the Arrange folder grouping');
  assert.equal(await ui.locator('#parallax-depth-save').count(), 1, 'exactly one apply action');
  assert.equal(await ui.locator('#parallax-depth-reset').count(), 1, 'exactly one reset action');
  assert.equal(await ui.locator('#depth-scale-save, #depth-scale-reset, [id^=scale-influence]').count(), 0, 'no second scale editor');

  // The optional size adjustment is off by default and initialises neutral values.
  await ui.locator('.parallax-advanced summary').click();
  assert.equal(await ui.locator('#depth-scale-enabled').isChecked(), false, 'size adjustment is off by default');
  assert.equal(await ui.locator('#depth-scale-near').isVisible(), false, 'size fields stay hidden while disabled');
  await ui.locator('#depth-scale-enabled').check();
  assert.equal(await ui.locator('#depth-scale-near').isVisible(), true);
  assert.equal(await ui.locator('#depth-scale-near').inputValue(), '100');
  assert.equal(await ui.locator('#depth-scale-far').inputValue(), '100');
  assert.equal(await ui.locator('#depth-scale-reference').inputValue(), '50');
  await ui.locator('#depth-scale-near').fill('135');
  await ui.locator('#depth-scale-far').fill('80');

  // One apply saves camera response and size adjustment together.
  const beforeDepths = (await currentConfig()).layers.map(layer => layer.depth);
  await ui.locator('#parallax-strength-value').fill('150');
  assert.equal(await ui.locator('#parallax-strength').inputValue(), '150', 'typing a number moves the slider');
  await ui.locator('[id^=influence-]').first().fill('50');
  await ui.locator('#parallax-depth-save').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.depthScale?.near === 1.35);
  const combined = await currentConfig();
  assert.equal(combined.parallax.strength, 1.5, 'apply saves global strength');
  assert.equal(combined.depthScale.far, .8, 'apply saves the background size');
  assert.equal(combined.depthScale.strength, 1, 'hidden compatibility strength is initialised');
  assert.deepEqual(combined.depthScale.influence, {}, 'hidden compatibility influence is initialised empty');
  assert.equal(Object.values(combined.parallax.influence).filter(value => value !== 1).length, 1, 'per-layer influence stays independent');
  assert.equal(await ui.locator('#parallax-effects-list .parallax-item', { hasText: 'Depth based Parallax' }).count(), 1, 'one combined applied row');
  assert.doesNotMatch(await ui.locator('#parallax-effects-list').innerText(), /Depth-based Scale/);
  assert.match(await ui.locator('#parallax-effects-list').innerText(), /Size adjustment on/);

  await choose('depth');
  await ui.locator('.parallax-depth-row input[type=range]').first().fill('30');
  await ui.locator('#parallax-depth-save').click();
  await ui.waitForTimeout(200);
  const afterDepths = (await currentConfig()).layers.map(layer => layer.depth);
  assert.equal(afterDepths.filter((depth, index) => depth !== beforeDepths[index]).length, 1, 'only the edited layer changes depth');
  assert.ok(afterDepths.includes(.3), 'unassigned stored depth is editable');

  // Plane-assigned layers show effective depth and never rewrite stored depth.
  await choose('planes');
  await ui.locator('#plane-add').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.depthPlanes?.length === 1);
  await ui.locator('#plane-name-0').fill('Midground');
  await ui.locator('#plane-depth-0').fill('67');
  await ui.locator('[id^=layer-plane]').first().selectOption({ index: 1 });
  await ui.locator('#plane-save').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.depthPlanes?.[0]?.layerIds.length === 1);
  const assignedId = (await currentConfig()).depthPlanes[0].layerIds[0];
  const assignedStored = (await currentConfig()).layers.find(layer => layer.id === assignedId).depth;
  await choose('depth');
  assert.match(await ui.locator('#parallax-inspector').innerText(), /Inherited from Midground · 67%/);
  assert.equal(await ui.locator(`#depth-${assignedId}`).count(), 0, 'plane depth is not editable here');
  await ui.locator('#parallax-depth-save').click();
  await ui.waitForTimeout(200);
  const preserved = await currentConfig();
  assert.deepEqual(preserved.depthPlanes[0].layerIds, [assignedId], 'plane membership is untouched');
  assert.equal(preserved.depthPlanes[0].depth, .67, 'plane depth is untouched');
  assert.equal(preserved.layers.find(layer => layer.id === assignedId).depth, assignedStored, 'stored depth of an assigned layer is never rewritten');

  // Reset clears camera response and size adjustment only.
  await ui.locator('#parallax-depth-reset').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.parallax === undefined);
  const reset = await currentConfig();
  assert.equal(reset.depthScale, undefined, 'reset clears the size adjustment');
  assert.equal(reset.depthPlanes[0].depth, .67, 'reset keeps depth planes');
  assert.deepEqual(reset.layers.map(layer => layer.depth), preserved.layers.map(layer => layer.depth), 'reset keeps stored layer depth');
  assert.equal(await ui.locator('#parallax-effects-list .parallax-item', { hasText: 'Depth based Parallax' }).count(), 0, 'the combined row disappears at neutral');
  assert.match(await ui.locator('#parallax-effects-list').innerText(), /Depth Planes/, 'Depth Planes keeps its own applied row');

  // Legacy hidden compatibility values survive an edit of the combined feature.
  const now = new Date().toISOString();
  const legacyProject = {
    schemaVersion: 1, id: 'legacy-depth-scale', title: 'Legacy depth scale', createdAt: now, updatedAt: now,
    settings: { width: 1363, height: 768, fps: 24 },
    scenes: [{
      version: 1, id: 'legacy-scene', title: 'Legacy', width: 1363, height: 768, fps: 24, totalFrames: 240,
      camera: { baseZoom: 1, anchor: { x: 681.5, y: 384 }, limits: { x: { min: -1363, max: 1363 }, y: { min: -768, max: 768 }, zoom: { min: .25, max: 4 }, roll: { min: -30, max: 30 } } },
      layers: [
        { id: 'legacy-back', name: 'Legacy background', asset: '/test-images/01-background.png', depth: .2, order: 0 },
        { id: 'legacy-front', name: 'Legacy foreground', asset: '/test-images/04-layer%203.png', depth: .8, order: 1 },
      ],
      tracks: [],
      depthScale: { near: 1.3, far: .8, reference: .4, strength: .7, influence: { 'legacy-front': .5 } },
    }],
  };
  await ui.locator('#project-file').setInputFiles({ name: 'legacy.story.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacyProject)) });
  await ui.waitForFunction(() => { try { return window.cameraStudio?.getState?.().config?.id === 'legacy-scene'; } catch { return false; } });
  await ui.locator('[data-tab="parallax"]').click();
  await choose('depth');
  assert.match(await ui.locator('#parallax-effects-list').innerText(), /Depth based Parallax & Scale/, 'legacy size settings appear in the combined row');
  await ui.locator('.parallax-advanced summary').click();
  assert.equal(await ui.locator('#depth-scale-enabled').isChecked(), true, 'an existing depthScale loads as enabled');
  assert.equal(await ui.locator('#depth-scale-near').inputValue(), '130');
  assert.equal(await ui.locator('#depth-scale-reference').inputValue(), '40');
  assert.match(await ui.locator('#parallax-inspector').innerText(), /preserved/, 'legacy overrides are flagged as preserved');
  await ui.locator('#depth-scale-near').fill('140');
  await ui.locator('#parallax-depth-save').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().config.depthScale?.near === 1.4);
  const legacyScale = (await currentConfig()).depthScale;
  assert.equal(legacyScale.strength, .7, 'hidden legacy strength is preserved on save');
  assert.equal(legacyScale.influence['legacy-front'], .5, 'hidden legacy per-layer size overrides are preserved on save');
  assert.equal(legacyScale.reference, .4);

  // Playback still drives the untouched preview.
  await ui.locator('#play').click();
  await ui.waitForFunction(() => window.cameraStudio.getState().frame > 0, null, { timeout: 4000 });
  await ui.locator('#play').click();
  await ui.locator('[data-tab="effects"]').click();
  await ui.locator('[data-tab="parallax"]').click();
  assert.deepEqual(errors, []);
  console.log('Parallax browser checks passed: preview pixels and masks, depth travel, deterministic seeking, four categories, Basic/Advanced, folder-aware targets, unified Depth based Parallax & Scale with optional size adjustment, effective plane depth and preview geometry.');
} finally { await runtime.close(); }
