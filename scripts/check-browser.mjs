import { launch, projectRoot } from './runtime.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

await mkdir(resolve(projectRoot, 'output'), { recursive: true });
const runtime = await launch();
const errors = [];
try {
  const page = await runtime.browser.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(runtime.url + '/legacy.html');
  await page.waitForFunction(() => window.story?.ready);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('canvas').count(), 1);
  assert.equal(await page.locator('canvas').getAttribute('width'), '1920');
  assert.equal(await page.locator('canvas').getAttribute('height'), '1080');
  await page.evaluate(() => window.story.renderAt(8));
  const first = await page.evaluate(() => window.story.frame());
  await page.evaluate(() => window.story.renderAt(18));
  const second = await page.evaluate(() => window.story.frame());
  assert.notEqual(first, second, 'Scene must move across time');
  await page.evaluate(() => window.story.renderAt(8));
  assert.equal(await page.evaluate(() => window.story.frame()), first, 'Seeking must be deterministic');
  await page.screenshot({ path: resolve(projectRoot, 'output/studio-desktop.png'), fullPage: true });
  for (const t of [3, 8, 14, 19]) {
    await page.evaluate(t => window.story.renderAt(t), t);
    const png = await page.locator('canvas').evaluate(canvas => canvas.toDataURL('image/png').split(',')[1]);
    await writeFile(resolve(projectRoot, `output/scene-${t}s.png`), Buffer.from(png, 'base64'));
  }
  await page.getByRole('button', { name: 'Play scene', exact: true }).click();
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.story.getState().playing), true);
  assert.ok(await page.evaluate(() => window.story.getState().time) > 19);
  await page.getByRole('button', { name: 'Pause scene', exact: true }).click();
  assert.equal(await page.evaluate(() => window.story.getState().playing), false);
  await page.locator('#motion').fill('90');
  assert.equal(await page.evaluate(() => window.story.getState().options.motion), 0.9);
  await page.locator('#motion').fill('65');
  await page.locator('#captions').uncheck();
  assert.equal(await page.evaluate(() => window.story.getState().options.captions), false);
  await page.locator('#captions').check();
  await page.locator('#atmosphere').uncheck();
  assert.equal(await page.evaluate(() => window.story.getState().options.atmosphere), false);
  await page.locator('#atmosphere').check();
  await page.locator('[data-layer="vinny"]').uncheck();
  assert.equal(await page.evaluate(() => window.story.getState().options.layers.vinny), false);
  await page.locator('[data-layer="vinny"]').check();
  await page.locator('#compare').click();
  assert.equal(await page.locator('#reference').isVisible(), true);
  await page.locator('#compare').click();
  assert.equal(await page.locator('#reference').isVisible(), false);
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#save-frame').click();
  const download = await downloadEvent;
  assert.ok(download.suggestedFilename().endsWith('.png'));
  await download.saveAs(resolve(projectRoot, 'output/downloaded-still.png'));
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1050 });
    const geometry = await page.evaluate(() => ({
      viewport: innerWidth, content: document.documentElement.scrollWidth,
      buttons: [...document.querySelectorAll('button')].map(el => {
        const r = el.getBoundingClientRect(); return { id: el.id, left: r.left, right: r.right, bottom: r.bottom, width: r.width };
      }),
    }));
    assert.ok(geometry.content <= geometry.viewport, `No horizontal overflow at ${width}px`);
    for (const b of geometry.buttons) assert.ok(b.left >= 0 && b.right <= width + 1, `Button ${b.id} fits at ${width}px`);
  }
  await page.evaluate(() => window.story.renderAt(8));
  await page.screenshot({ path: resolve(projectRoot, 'output/studio-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1050 });
  // Exercise the actual 24-second browser download, not just API availability.
  const videoEvent = page.waitForEvent('download', { timeout: 90000 });
  await page.locator('#export').click();
  const video = await videoEvent;
  await video.saveAs(resolve(projectRoot, 'output/browser-export.webm'));
  assert.ok(video.suggestedFilename().endsWith('.webm'));
  await page.waitForFunction(() => !document.getElementById('play').disabled);
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('BROWSER CHECKS PASSED: deterministic frames, playback, seeking, settings, layers, comparison, PNG + WebM downloads, and 4 responsive widths.');
} finally { await runtime.close(); }
