// Read-only smoke checks for the archived preview and lab presets.
import assert from 'node:assert/strict';
import { launch } from '../../scripts/runtime.mjs';
import { launchCamera } from '../../scripts/camera-runtime.mjs';
import { compileCamera } from '../../src/camera/evaluate.ts';
import { LAB_BASIC_PRESETS } from './camera-lab/camera-lab-basic.ts';
import { LAB_SPATIAL_PRESETS } from './camera-lab/camera-lab-spatial.ts';

const runtime = await launch();
try {
  for (const path of ['/legacy.html', '/Legacy%20Code/legacy.html']) {
    const page = await runtime.browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(runtime.url + path);
    await page.waitForFunction(() => window.story?.ready);
    assert.equal(await page.locator('canvas').count(), 1);
    await page.evaluate(() => window.story.renderAt(8));
    const first = await page.evaluate(() => window.story.frame());
    await page.evaluate(() => window.story.renderAt(18));
    assert.notEqual(await page.evaluate(() => window.story.frame()), first);
    await page.evaluate(() => window.story.renderAt(8));
    assert.equal(await page.evaluate(() => window.story.frame()), first);
    await page.locator('#captions').uncheck();
    assert.equal(await page.evaluate(() => window.story.getState().options.captions), false);
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally { await runtime.close(); }

for (const presets of [LAB_BASIC_PRESETS, LAB_SPATIAL_PRESETS]) {
  assert.ok(presets.length > 0);
  for (const preset of presets) compileCamera(preset).evaluate(36, 1);
  const camera = await launchCamera({ config: presets[0], intensity: 1 });
  try {
    const image = await camera.page.evaluate(() => { window.cameraStudio.renderFrame(36); return window.cameraStudio.capture().png; });
    assert.ok(image.startsWith('data:image/png'));
    assert.deepEqual(camera.errors, []);
  } finally { await camera.close(); }
}
console.log('Archived preview routes and basic/spatial camera lab presets passed.');
