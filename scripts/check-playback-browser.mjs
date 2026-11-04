import { launch } from './runtime.mjs';
import assert from 'node:assert/strict';

const runtime = await launch(), errors = [];
try {
  const page = await runtime.browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(runtime.url);
  await page.waitForFunction(() => window.cameraStudio?.ready);
  await page.locator('[data-tab="story"]').click();
  assert.equal(await page.locator('#scene-fps').inputValue(), '60', 'new projects default to 60 FPS');
  assert.equal(await page.evaluate(() => window.cameraStudio.getState().config.totalFrames), 600);
  await page.locator('#scene-fps').fill('24');
  await page.locator('#scene-fps').dispatchEvent('change');
  await page.waitForFunction(() => window.cameraStudio.getState().config.fps === 24);
  assert.equal(await page.evaluate(() => window.cameraStudio.getState().config.totalFrames), 240);

  const unfocus = () => page.evaluate(() => document.activeElement.blur());
  for (const tab of ['animate', 'effects']) {
    await page.locator(`[data-tab="${tab}"]`).click();
    await page.evaluate(() => window.cameraStudio.renderTime(239 / 24));
    await page.locator('#play').click();
    await page.waitForFunction(() => Number(document.querySelector('#scrub').value) === 10 && document.querySelector('#play').textContent === '▶', null, {timeout: 3000});
    assert.equal(await page.locator('#scrub').inputValue(), '10', `${tab} advances from frame 239 to frame 240`);
    await page.locator('#play').click();
    await page.waitForFunction(() => Number(document.querySelector('#scrub').value) < 1, null, {timeout: 3000});
    await page.locator('#play').click();
    assert.ok(Number(await page.locator('#scrub').inputValue()) < 1, `${tab} restarts after frame 240`);
    await unfocus();
    await page.keyboard.press('End');
    assert.equal(await page.locator('#scrub').inputValue(), '10', `${tab} End seeks to frame 240`);
    await page.keyboard.press('ArrowLeft');
    assert.ok(Math.abs(Number(await page.locator('#scrub').inputValue()) - 239 / 24) < .001);
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#scrub').inputValue(), '10', `${tab} can step from frame 239 to 240`);
  }
  await page.locator('[data-tab="animate"]').click();
  assert.equal(await page.locator('#scrub').inputValue(), '10', 'switching between timeline workspaces preserves the endpoint');
  await page.locator('[data-tab="story"]').click();
  assert.equal(await page.locator('#scrub').inputValue(), '239', 'Story clamps to its last renderable frame');
  await unfocus();
  await page.keyboard.press('Home');
  await page.keyboard.press('End');
  assert.equal(await page.locator('#scrub').inputValue(), '239', 'Story End seeks to frame 239');
  await page.keyboard.press('ArrowLeft');
  await page.locator('#play').click();
  await page.waitForFunction(() => document.querySelector('#scrub').value === '239' && document.querySelector('#play').textContent === '▶', null, {timeout: 3000});
  await page.locator('#play').click();
  await page.waitForFunction(() => Number(document.querySelector('#scrub').value) < 24, null, {timeout: 3000});
  await page.locator('#play').click();
  assert.ok(Number(await page.locator('#scrub').inputValue()) < 24, 'Story restarts after frame 239');

  await page.locator('#add-scene').click();
  await page.waitForFunction(() => { try { return window.cameraStudio.getState().config.title === 'Scene 2'; } catch { return false; } });
  assert.equal(await page.locator('#scene-fps').inputValue(), '60', 'new scenes use the project default');
  assert.deepEqual(errors, []);
  console.log('Playback endpoints and 60 FPS defaults passed in Story, Camera Movements and Timeline.');
} finally { await runtime.close(); }
