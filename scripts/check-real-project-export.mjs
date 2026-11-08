// Acceptance check for a real saved StoryStudio project (.story.json export).
// It imports the file through the real UI, exports Current Scene and All Scenes,
// then verifies each MP4 with FFprobe and checks artwork and scene boundaries.
// Usage: STORY_PROJECT=/path/to/project.story.json npm run test:real-project
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const projectFile = process.env.STORY_PROJECT;
if (!projectFile) { console.log('STORY_PROJECT not set; skipping real-project check.'); process.exit(0); }
const base = process.env.STUDIO_URL || 'http://127.0.0.1:5173';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe', ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const dir = await mkdtemp(resolve(tmpdir(), 'vinny-real-export-'));

const source = JSON.parse(await readFile(projectFile, 'utf8'));
const project = source.project ?? source;
const expectedScenes = project.scenes.map(scene => ({ title: scene.title, frames: Math.max(1, Math.round(scene.totalFrames / scene.fps * 60)), layers: scene.layers.length }));
const expectedFrames = expectedScenes.reduce((sum, scene) => sum + scene.frames, 0);

function probe(file) {
  const result = spawnSync(ffprobe, ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_name,profile,width,height,pix_fmt,avg_frame_rate,nb_read_frames:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  assert.equal(result.status, 0, `ffprobe failed: ${result.stderr}`);
  const data = JSON.parse(result.stdout);
  return { stream: data.streams[0], duration: Number(data.format.duration) };
}
function framePixels(file, seconds) {
  const out = resolve(dir, `frame-${seconds}.gray`);
  const result = spawnSync(ffmpeg, ['-hide_banner', '-v', 'error', '-y', '-ss', String(seconds), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', out]);
  assert.equal(result.status, 0, 'frame extraction failed');
  return readFile(out);
}
const nonBlack = bytes => { let n = 0; for (const v of bytes) if (v > 0) n++; return n / bytes.length; };

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
try {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(base + '/');
  await page.waitForFunction(() => window.cameraStudio?.ready, null, { timeout: 60000 });
  await page.locator('.project-menu summary').click();
  await page.locator('#project-file').setInputFiles(projectFile);
  await page.waitForFunction(() => [...document.querySelectorAll('.nav-item')].some(x => x.textContent.includes('(imported)')), null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.locator('[data-tab="export"]').click();

  const modes = [
    { name: 'current', scope: 'current', frames: expectedScenes[0].frames },
    { name: 'all', scope: 'all', frames: expectedFrames },
  ];
  for (const mode of modes) {
    await page.locator(`input[name="export-scope"][value="${mode.scope}"]`).check();
    const downloadPromise = page.waitForEvent('download', { timeout: 1200000 });
    await page.locator('#export').click();
    await page.waitForFunction(() => /Ready|failed/.test(document.querySelector('#export-status').textContent), null, { timeout: 1200000 });
    const message = await page.locator('#export-status').textContent();
    assert.match(message, /^Ready/, `${mode.name} export: ${message}`);
    const download = await downloadPromise;
    const file = resolve(dir, `${mode.name}.mp4`);
    await download.saveAs(file);
    assert.ok((await stat(file)).size > 10000, `${mode.name} MP4 is not empty`);
    const { stream, duration } = probe(file);
    assert.equal(stream.codec_name, 'h264');
    assert.equal(stream.width, 1920);
    assert.equal(stream.height, 1080);
    assert.equal(stream.pix_fmt, 'yuv420p');
    assert.equal(stream.avg_frame_rate, '60/1');
    assert.equal(Number(stream.nb_read_frames), mode.frames, `${mode.name} frame count`);
    assert.ok(Math.abs(duration - mode.frames / 60) < 0.01, `${mode.name} duration ${duration}`);
    // First frame of Scene 1 must contain its artwork (non-black).
    assert.ok(nonBlack(await framePixels(file, 0.5)) > 0.2, `${mode.name}: first scene shows artwork`);
    console.log(`${mode.name}: ${download.suggestedFilename()} verified (${stream.nb_read_frames} frames, ${duration.toFixed(3)}s)`);
  }
  // Scene boundary for All Scenes: last frame of scene 1 has artwork, first frame of scene 2 is empty when it has no layers.
  if (expectedScenes.length > 1 && expectedScenes[0].layers > 0 && expectedScenes[1].layers === 0) {
    const allFile = resolve(dir, 'all.mp4');
    const before = nonBlack(await framePixels(allFile, expectedScenes[0].frames / 60 - 0.1));
    const after = nonBlack(await framePixels(allFile, expectedScenes[0].frames / 60 + 0.1));
    assert.ok(before > 0.2 && after === 0, `scene boundary: before ${before}, after ${after}`);
  }
  assert.deepEqual(pageErrors, [], 'no uncaught page errors');
  console.log('real project export check passed');
} finally {
  await browser.close();
}
