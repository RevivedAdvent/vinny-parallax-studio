import { launch } from './runtime.mjs';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const runtime = await launch(), errors = [];
const outDir = resolve('output/atmosphere');
await mkdir(outDir, { recursive: true });
try {
  const width = 1363, height = 768;
  const assets = ['01-background.png', '02-layer 1.png', '03-layer 2.png', '04-layer 3.png'];
  const config = {
    version: 1, id: 'atmosphere-preview', width, height, fps: 24, totalFrames: 240, tracks: [],
    camera: { baseZoom: 1, maxRoll: 180, anchor: { x: width / 2, y: height / 2 },
      limits: { x: { min: -width, max: width }, y: { min: -height, max: height }, zoom: { min: .25, max: 4 }, roll: { min: -30, max: 30 } } },
    layers: assets.map((asset, i) => ({ id: `l${i}`, name: asset, asset: '/test-images/' + encodeURIComponent(asset), depth: i / (assets.length - 1), order: i, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 })),
  };

  // Phase 1: renderer accuracy with real artwork on the deterministic render page.
  const page = await runtime.browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(cfg => { window.__CAMERA_INPUT__ = { config: cfg }; }, config);
  await page.goto(runtime.url + '/?render=1');
  await page.waitForFunction(() => window.cameraStudio?.ready);
  const set = cfg => page.evaluate(cfg => window.cameraStudio.setConfig(cfg), cfg);
  const render = t => page.evaluate(t => window.cameraStudio.renderTime(t), t);
  const state = () => page.evaluate(() => window.cameraStudio.getState());
  const png = () => page.evaluate(() => window.cameraStudio.capture().png);
  const hash = async () => {
    const data = await png();
    return page.evaluate(async data => {
      const bytes = Uint8Array.from(atob(data.split(',')[1]), c => c.charCodeAt(0));
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    }, data);
  };
  await render(0);
  const neutral = await hash();
  const at = (kind, extra = {}) => ({ id: `effect-${kind}`, kind, start: 0, duration: 4, target: ['foliage', 'clouds', 'defocus'].includes(kind) ? 'layers' : 'scene', layerIds: ['l3'], ...extra });

  const kinds = ['fog', 'haze', 'rays', 'dust', 'depthBlur', 'light', 'defocus', 'leaves', 'foliage', 'clouds', 'rain', 'snow', 'fireflies', 'waterfall'];
  for (const kind of kinds) {
    await set({ ...config, atmosphere: [at(kind)] });
    await render(1.5);
    const current = await state();
    assert.ok(current.atmosphere, `${kind} exposes atmosphere state`);
    const overlayKinds = ['fog', 'rays', 'dust', 'leaves', 'rain', 'snow', 'fireflies', 'waterfall'];
    if (overlayKinds.includes(kind)) assert.ok(current.atmosphere.overlays.length > 0, `${kind} renders an overlay`);
    if (kind === 'waterfall') assert.ok(current.atmosphere.overlays.some(o => o.type === 'particles') && current.atmosphere.overlays.some(o => o.type === 'ripples'));
    if (kind === 'haze') assert.ok(current.atmosphere.layers.l0.desaturate > 0 && current.atmosphere.layers.l3.desaturate === 0, 'haze stays on distant planes');
    if (kind === 'depthBlur') assert.ok(current.atmosphere.layers.l3.blur >= 0 && current.atmosphere.layers.l0.blur > current.atmosphere.layers.l3.blur, 'depth blur separates planes');
    if (kind === 'defocus') assert.ok(current.atmosphere.layers.l3.blur > 0, 'defocus softens the foreground');
    if (kind === 'foliage') assert.notEqual(current.transforms[3].roll, 0, 'foliage moves its target layer');
    if (kind === 'clouds') assert.ok(Math.abs(current.transforms[3].x - width / 2) > .01, 'clouds drift their target layer');
    if (kind === 'light') assert.notEqual(current.atmosphere.sceneBrightness, 1);
    const frame = await hash();
    assert.notEqual(frame, neutral, `${kind} changes rendered pixels`);
    const first = await hash();
    await render(3.6); await render(1.5);
    assert.equal(await hash(), first, `${kind} is seek-deterministic`);
    assert.deepEqual(current.config.layers.map(l => [l.id, l.x, l.y, l.rotation, l.scale]), config.layers.map(l => [l.id, l.x, l.y, l.rotation, l.scale]), `${kind} never mutates artwork transform data`);
    const image = await png();
    await writeFile(resolve(outDir, `${kind}.png`), Buffer.from(image.split(',')[1], 'base64'));
  }

  // Particle caps and seed independence.
  await set({ ...config, atmosphere: [at('rain', { count: 100000, seed: 3 })] });
  await render(1.5);
  let rain = (await state()).atmosphere.overlays.find(o => o.type === 'particles');
  assert.equal(rain.particles.length, 160, 'rain is capped');
  await set({ ...config, atmosphere: [at('rain', { count: 100000, seed: 4 })] });
  await render(1.5);
  const seeded = (await state()).atmosphere.overlays.find(o => o.type === 'particles');
  assert.notDeepEqual(seeded.particles, rain.particles, 'seed changes the particle layout');

  // Removing atmosphere restores the exact neutral frame.
  await set({ ...config });
  await render(0);
  assert.equal(await hash(), neutral, 'deleting all atmosphere restores the neutral frame');

  // Phase 2: workspace authoring, timeline integration and persistence.
  const studio = await runtime.browser.newPage({ viewport: { width: 1500, height: 1000 } });
  studio.on('pageerror', e => errors.push(e.message));
  studio.on('dialog', dialog => dialog.accept());
  await studio.goto(runtime.url);
  await studio.waitForFunction(() => window.cameraStudio?.ready);
  const labels = await studio.locator('.workspace-tab').allInnerTexts();
  assert.deepEqual(labels, ['Story', 'Arrange', 'Camera Movements', 'Parallax', 'Atmosphere', 'Timeline', 'Export'], 'Atmosphere sits between Parallax and Timeline');
  await studio.locator('[data-tab="atmosphere"]').click();
  await studio.evaluate(()=>{const d=document.getElementById('applied-atmosphere');if(d)d.open=true;});
  assert.equal(await studio.locator('.atmosphere-pane').isVisible(), true);
  assert.equal(await studio.locator('.atmosphere-category').count(), 4, 'four catalogue categories are shown');
  assert.deepEqual(await studio.locator('.atmosphere-category .parallax-category-name').allInnerTexts(),
    ['ATMOSPHERE & DEPTH', 'LIGHTING', 'PARTICLES', 'WEATHER & ENVIRONMENT'], 'categories appear in the approved order');
  assert.deepEqual(await studio.locator('.atmosphere-category .parallax-category-count').allInnerTexts(),
    ['4', '2', '3', '5'], 'each category shows its effect count');
  await studio.evaluate(() => document.querySelectorAll('.atmosphere-category').forEach(details => { details.open = true; }));
  assert.equal(await studio.locator('[data-atmosphere]').count(), 14, 'all fourteen effects are offered');
  assert.equal(await studio.locator('[data-atmosphere="fog"] b').innerText(), 'Ground Fog', 'catalogue uses the new display names');
  assert.equal(await studio.locator('#atmosphere-inspector').isVisible(), true);

  // Import real artwork, then author every catalogue card once through the UI.
  await studio.locator('[data-tab="arrange"]').click();
  await studio.locator('#asset-files').setInputFiles(resolve('test-images/01-background.png'));
  await studio.waitForFunction(() => window.cameraStudio.getState().config.layers.length === 1);
  await studio.locator('[data-tab="atmosphere"]').click();
  await studio.evaluate(()=>{const d=document.getElementById('applied-atmosphere');if(d)d.open=true;});
  const names = {
    fog: 'Ground Fog', haze: 'Atmospheric Haze', rays: 'Light Rays',
    dust: 'Floating Dust', depthBlur: 'Depth Blur', light: 'Ambient Light', defocus: 'Foreground Defocus',
    leaves: 'Leaves / Petals', foliage: 'Wind / Foliage Motion', clouds: 'Clouds & Sunlight', rain: 'Rain',
    snow: 'Snow / Ash', fireflies: 'Fireflies', waterfall: 'Waterfall Mist / Ripples',
  };
  // Approved Basic / Advanced split; ids are `atmos-<field key>`.
  const basicFields = {
    fog: ['level', 'density', 'opacity', 'speed', 'color'],
    haze: ['intensity', 'depthLimit', 'color'],
    rays: ['angle', 'opacity', 'color'],
    depthBlur: ['focus', 'range', 'strength'],
    defocus: ['strength', 'depthThreshold'],
    light: ['brightness', 'amount', 'color'],
    dust: ['count', 'sizeMin', 'sizeMax', 'opacityMin', 'opacityMax', 'speed', 'color'],
    leaves: ['count', 'sizeMin', 'sizeMax', 'opacityMin', 'opacityMax', 'speed', 'rotationSpeed', 'color'],
    fireflies: ['count', 'size', 'glow', 'opacity', 'speed', 'color'],
    rain: ['count', 'speed', 'opacity', 'droplets', 'color'],
    snow: ['mode', 'count', 'sizeMin', 'sizeMax', 'speed', 'color'],
    foliage: ['direction', 'strength', 'speed', 'gust'],
    clouds: ['driftX', 'driftY', 'period', 'sunDim'],
    waterfall: ['mistSpeed', 'mistOpacity', 'rippleOpacity', 'color'],
  };
  const advancedFields = {
    fog: ['bands', 'coverage', 'softness', 'driftX', 'driftY', 'period'],
    haze: ['feather', 'desaturate', 'brightness'],
    rays: ['originX', 'originY', 'count', 'width', 'rayLength', 'spread', 'vary', 'speed'],
    depthBlur: ['falloff', 'animate', 'focusEnd'],
    defocus: ['softness', 'animate', 'amount'],
    light: ['speed', 'irregular', 'period'],
    dust: ['direction', 'lifetime', 'depthSpread', 'drift', 'regionX', 'regionY', 'regionWidth', 'regionHeight', 'seed'],
    leaves: ['direction', 'lifetime', 'drift', 'depthSpread', 'regionX', 'regionY', 'regionWidth', 'regionHeight', 'texture-layer', 'seed'],
    fireflies: ['lifetime', 'pulse', 'depthSpread'],
    rain: ['angle', 'streakLength', 'streakWidth', 'depthSpread', 'regionX', 'regionY', 'regionWidth', 'regionHeight', 'seed'],
    snow: ['opacityMin', 'opacityMax', 'oscillation', 'rotationSpeed', 'lifetime', 'depthSpread', 'regionX', 'regionY', 'regionWidth', 'regionHeight', 'seed'],
    foliage: ['phase', 'spread', 'movement', 'pivotX', 'pivotY'],
    clouds: ['opacityVariation', 'scaleVariation', 'tileable', 'sunPeriod'],
    waterfall: ['mistCount', 'mistSize', 'mistSoftness', 'softness', 'rippleCount', 'rippleRadius', 'rippleSpeed', 'rippleSpacing', 'regionX', 'regionY', 'regionWidth', 'regionHeight'],
  };
  for (const kind of kinds) {
    await studio.locator(`[data-atmosphere="${kind}"]`).click();
    assert.equal(await studio.locator('#atmosphere-inspector h3').innerText(), names[kind], `${kind} shows its display name`);
    assert.equal(await studio.locator('#atmosphere-inspector .parallax-settings').first().isVisible(), true, `${kind} shows Basic settings immediately`);
    assert.equal(await studio.locator('#atmosphere-inspector .parallax-advanced').count(), 1, `${kind} has an Advanced settings section`);
    assert.equal(await studio.locator('#atmosphere-inspector .parallax-advanced[open]').count(), 0, `${kind} keeps Advanced settings collapsed by default`);
    for (const key of basicFields[kind]) {
      assert.equal(await studio.locator(`#atmosphere-inspector .parallax-settings #atmos-${key}`).count(), 1, `${kind} shows ${key} in Basic settings`);
      assert.equal(await studio.locator(`#atmosphere-inspector .parallax-advanced-body #atmos-${key}`).count(), 0, `${kind} does not duplicate ${key} in Advanced`);
    }
    for (const key of advancedFields[kind]) {
      assert.equal(await studio.locator(`#atmosphere-inspector .parallax-advanced-body #atmos-${key}`).count(), 1, `${kind} keeps ${key} in Advanced settings`);
    }
    if (kind === 'fog') {
      assert.equal(await studio.locator('.number-wrap:has(#atmos-density) .number-step').count(), 2, 'atmosphere fields use the shared stepper');
      assert.equal(await studio.locator('#atmosphere-inspector').evaluate(node => getComputedStyle(node).colorScheme), 'dark', 'atmosphere native controls are dark');
      assert.equal(await studio.locator('#atmos-density').evaluate(node => getComputedStyle(node).appearance), 'textfield', 'native spinners are suppressed');
      const before = Number(await studio.locator('#atmos-density').inputValue());
      await studio.locator('.number-wrap:has(#atmos-density) [data-step=up]').click();
      assert.equal(Number(await studio.locator('#atmos-density').inputValue()), before + 1, 'atmosphere stepper increments');
      await studio.locator('.number-wrap:has(#atmos-density) [data-step=down]').click();
      assert.equal(Number(await studio.locator('#atmos-density').inputValue()), before, 'atmosphere stepper decrements');
    }
    if (kind === 'foliage') {
      assert.notEqual(await studio.locator('#atmos-direction').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(255, 255, 255)', 'atmosphere selects are dark');
    }
    if (['haze', 'light', 'defocus', 'leaves'].includes(kind)) {
      await studio.locator('#atmos-target-mode').selectOption('layers');
      await studio.locator('input[name=atmos-layer]').first().check();
    } else if (['foliage', 'clouds'].includes(kind)) {
      await studio.locator('input[name=atmos-layer]').first().check();
    }
    if (kind === 'fireflies') await studio.locator('#atmos-size').fill('30');
    await studio.locator('#atmosphere-form button[type=submit]').click();
    await studio.waitForFunction(() => (window.cameraStudio.getState().config.atmosphere ?? []).length === 1);
    const added = await studio.evaluate(() => window.cameraStudio.getState().config.atmosphere.at(-1));
    assert.equal(added.kind, kind, `${kind} authors through the inspector`);
    assert.ok(added.duration > 0);
    if (['haze', 'light', 'defocus', 'leaves'].includes(kind)) {
      assert.equal(added.target, 'layers', `${kind} can target selected layers`);
      assert.ok(added.layerIds?.length > 0, `${kind} keeps the selected layer`);
    }
    if (kind === 'fireflies') assert.equal(added.size, 30, 'firefly glow size is saved and not clamped away');
    const item = studio.locator('#atmosphere-effects-list .parallax-item').filter({ hasText: names[kind] }).last();
    await item.locator('[data-atmos-delete]').click();
    await studio.waitForFunction(() => (window.cameraStudio.getState().config.atmosphere ?? []).length === 0);
  }

  // Advanced values survive editing even when the user never opens Advanced settings.
  await studio.locator('[data-atmosphere="fog"]').click();
  await studio.locator('#atmosphere-inspector .parallax-advanced summary').click();
  await studio.locator('#atmos-bands').fill('3');
  await studio.locator('#atmosphere-form button[type=submit]').click();
  await studio.waitForFunction(() => window.cameraStudio.getState().config.atmosphere?.length === 1);
  let advancedFog = await studio.evaluate(() => window.cameraStudio.getState().config.atmosphere[0]);
  assert.equal(advancedFog.bands, 3, 'advanced values are saved');
  await studio.locator('[data-atmos-edit]').first().click();
  assert.equal(await studio.locator('#atmosphere-inspector .parallax-advanced[open]').count(), 0, 'advanced is collapsed when reopening an effect');
  assert.equal(Number(await studio.locator('#atmos-bands').inputValue()), 3, 'the saved advanced value is restored');
  await studio.locator('#atmos-duration').fill('2.5');
  await studio.locator('#atmosphere-form button[type=submit]').click();
  await studio.waitForFunction(() => window.cameraStudio.getState().config.atmosphere?.[0]?.duration === 2.5);
  advancedFog = await studio.evaluate(() => window.cameraStudio.getState().config.atmosphere[0]);
  assert.equal(advancedFog.bands, 3, 'updating without opening Advanced settings preserves the value');
  await studio.locator('[data-atmos-delete]').first().click();
  await studio.waitForFunction(() => (window.cameraStudio.getState().config.atmosphere ?? []).length === 0);

  await studio.locator('[data-atmosphere="fog"]').click();
  await studio.locator('#atmos-start').fill('0');
  await studio.locator('#atmos-duration').fill('2');
  await studio.locator('#atmosphere-form button[type=submit]').click();
  await studio.waitForFunction(() => window.cameraStudio.getState().config.atmosphere?.length === 1);
  assert.match(await studio.locator('#atmosphere-effects-list').innerText(), /Ground Fog/);
  let current = await studio.evaluate(() => window.cameraStudio.getState().config.atmosphere[0]);
  assert.equal(current.kind, 'fog'); assert.equal(current.duration, 2); assert.ok(current.density > 0);

  await studio.locator('[data-tab="effects"]').click();
  assert.equal(await studio.locator('.timeline-row[data-atmos]').count(), 1, 'atmosphere appears in the main timeline');
  assert.equal(await studio.locator('.timeline-group-label').first().innerText(), 'ATMOSPHERE & DEPTH');
  const row = studio.locator('.timeline-row[data-atmos]').first();
  const lane = await row.locator('.timeline-lane').boundingBox(), bar = await row.locator('.timeline-bar').boundingBox();
  assert.ok(Math.abs(bar.width / lane.width - 2 / 30) < .01, 'clip width represents duration');
  await row.locator('[name=start]').fill('1'); await row.locator('[name=end]').fill('3');
  await row.getByRole('button', { name: 'Apply timing' }).click();
  await studio.waitForFunction(() => window.cameraStudio.getState().config.atmosphere[0].start === 1);
  current = await studio.evaluate(() => window.cameraStudio.getState().config.atmosphere[0]);
  assert.equal(current.duration, 2, 'timeline retime preserves the effect configuration');
  await row.locator('.timeline-bar').click();
  await studio.waitForFunction(() => document.querySelector('#timeline-clock').textContent.startsWith('1.00s'));

  await row.getByRole('button', { name: 'Edit' }).click();
  await studio.waitForFunction(() => document.querySelector('#app').dataset.workspace === 'atmosphere');
  assert.match(await studio.locator('#atmosphere-inspector h3').innerText(), /Ground Fog/);
  assert.match(await studio.locator('#atmosphere-effects-list .parallax-item.selected').innerText(), /Ground Fog/);

  await studio.locator('#atmosphere-add-another').click();
  await studio.locator('[data-atmosphere="dust"]').click();
  await studio.locator('#atmos-start').fill('3');
  await studio.locator('#atmos-duration').fill('2');
  await studio.locator('#atmosphere-form button[type=submit]').click();
  await studio.waitForFunction(() => window.cameraStudio.getState().config.atmosphere?.length === 2);
  await studio.locator('#save').click();
  await studio.waitForFunction(() => document.querySelector('#save-status').textContent === 'Saved locally');
  await studio.reload();
  await studio.waitForFunction(() => window.cameraStudio?.ready);
  await studio.locator('[data-tab="atmosphere"]').click();
  await studio.evaluate(()=>{const d=document.getElementById('applied-atmosphere');if(d)d.open=true;});
  await studio.waitForFunction(() => /No atmosphere effects yet|Floating Dust/.test(document.querySelector('#atmosphere-effects-list').innerText));
  const saved = await studio.evaluate(() => window.cameraStudio.getState().config.atmosphere ?? []);
  assert.equal(saved.length, 2, 'atmosphere survives save and reload');
  assert.deepEqual(saved.map(e => e.kind).sort(), ['dust', 'fog']);
  assert.equal(await studio.locator('#timeline-panel').isVisible(), false, 'timeline stays hidden in the atmosphere tab');

  await studio.locator('[data-tab="effects"]').click();
  assert.equal(await studio.locator('.timeline-row[data-atmos]').count(), 2);
  await studio.locator('.timeline-row[data-atmos] [data-atmos-delete]').first().click();
  await studio.waitForFunction(() => (window.cameraStudio.getState().config.atmosphere ?? []).length === 1);
  await studio.locator('[data-tab="atmosphere"]').click();
  await studio.evaluate(()=>{const d=document.getElementById('applied-atmosphere');if(d)d.open=true;});
  await studio.locator('[data-atmos-delete]').first().click();
  await studio.waitForFunction(() => (window.cameraStudio.getState().config.atmosphere ?? []).length === 0);
  await studio.locator('[data-tab="effects"]').click();
  assert.match(await studio.locator('#effects-list').innerText(), /No movements yet/);
  await studio.close();

  assert.deepEqual(errors, []);
  console.log('atmosphere browser checks passed');
} finally {
  await runtime.close();
}
