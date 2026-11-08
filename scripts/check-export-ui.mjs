// Real Chromium workflow for both export buttons. It uses the running dev:studio
// stack (npm run dev:studio) and verifies each downloaded MP4 with FFprobe.
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const base = process.env.STUDIO_URL || 'http://127.0.0.1:5173';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
const dir = await mkdtemp(resolve(tmpdir(), 'vinny-ui-export-'));

function probe(file) {
  const result = spawnSync(ffprobe, ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_name,width,height,pix_fmt,avg_frame_rate,nb_read_frames:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  assert.equal(result.status, 0, `ffprobe failed: ${result.stderr}`);
  const data = JSON.parse(result.stdout);
  return { stream: data.streams[0], duration: Number(data.format.duration) };
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
try {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(base + '/');
  await page.waitForFunction(() => window.cameraStudio?.ready, null, { timeout: 60000 });
  await page.locator('[data-tab="export"]').click();

  const cases = [
    { scope: 'current', frames: 1800, seconds: 30 },
    { scope: 'all', frames: 1800, seconds: 30 },
  ];
  for (const testCase of cases) {
    await page.locator(`input[name="export-scope"][value="${testCase.scope}"]`).check();
    const downloadPromise = page.waitForEvent('download', { timeout: 300000 });
    await page.locator('#export').click();
    assert.equal(await page.locator('#export').isDisabled(), true, `${testCase.scope} export disables while running`);
    await page.waitForFunction(() => /Ready|failed/.test(document.querySelector('#export-status').textContent), null, { timeout: 240000 });
    const message = await page.locator('#export-status').textContent();
    assert.match(message, /^Ready/, `${testCase.scope} export succeeds: ${message}`);
    assert.equal(await page.locator('#export').isDisabled(), false, `${testCase.scope} export re-enabled`);
    const download = await downloadPromise;
    const file = resolve(dir, download.suggestedFilename());
    await download.saveAs(file);
    assert.ok((await stat(file)).size > 1000, 'downloaded MP4 is not empty');
    const { stream, duration } = probe(file);
    assert.equal(stream.codec_name, 'h264');
    assert.equal(stream.width, 1920);
    assert.equal(stream.height, 1080);
    assert.equal(stream.pix_fmt, 'yuv420p');
    assert.equal(stream.avg_frame_rate, '60/1');
    assert.equal(Number(stream.nb_read_frames), testCase.frames, `${testCase.scope} frame count`);
    assert.ok(Math.abs(duration - testCase.seconds) < 0.01, `${testCase.scope} duration ${duration}`);
    console.log(`${testCase.scope}: ${download.suggestedFilename()} verified (${stream.nb_read_frames} frames, ${duration.toFixed(3)}s)`);
  }
  assert.deepEqual(pageErrors, [], 'no uncaught page errors');
  console.log('export UI check passed');
} finally {
  await browser.close();
}
