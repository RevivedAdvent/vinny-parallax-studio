// Quality check for the Story exporter: encodes lossless renderer frames with each
// quality preset and measures PSNR/SSIM against the source. Run with: npm run test:export-quality
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { launch } from './runtime.mjs';
import { QUALITY_PRESETS } from './export-story-video.mjs';

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const FRAMES = 30;
// A 2-second scene built from the real test-images/ artwork with a pan, so frames differ.
const qualityInput = { intensity: 1, config: { version: 1, id: 'quality', width: 1920, height: 1080, fps: 60, totalFrames: 120,
  layers: [
    { id: 'bg', name: 'Background', asset: 'data:image/png;base64,' + readFileSync(resolve('test-images/01-background.png')).toString('base64'), depth: 0 },
    { id: 'fg', name: 'Foreground', asset: 'data:image/png;base64,' + readFileSync(resolve('test-images/02-layer 1.png')).toString('base64'), depth: 1 },
  ],
  camera: { baseZoom: 1, anchor: { x: 960, y: 540 }, limits: { x: { min: -1920, max: 1920 }, y: { min: -1080, max: 1080 }, zoom: { min: 0.25, max: 4 }, roll: { min: -3, max: 3 } } },
  tracks: [], cameraMoves: [{ id: 'pan', type: 'pan', start: 0, duration: 2, x: 1200, y: 540, scale: 1 }] } };
const work = await mkdtemp(resolve(tmpdir(), 'vinny-quality-'));
const runtime = await launch();
try {
  const page = await runtime.browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(input => { window.__CAMERA_INPUT__ = input; }, qualityInput);
  await page.goto(runtime.url + '/?render=1');
  await page.waitForFunction(() => window.cameraStudio?.ready);
  // Capture lossless PNG frames straight from the renderer.
  await mkdir(resolve(work, 'src'));
  for (let f = 0; f < FRAMES; f++) {
    const png = await page.evaluate(f => { window.cameraStudio.renderTime(f / 60); return window.cameraStudio.capture(true).png; }, f);
    await writeFile(resolve(work, 'src', `${String(f).padStart(4, '0')}.png`), Buffer.from(png.split(',')[1], 'base64'));
  }
  assert.deepEqual(errors, []);
  const measure = (encoded) => {
    const run = (filter) => spawnSync(ffmpeg, ['-hide_banner', '-i', encoded, '-framerate', '60', '-i', resolve(work, 'src', '%04d.png'), '-lavfi', `[0:v]format=rgb24[a];[1:v]format=rgb24[b];[a][b]${filter}`, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
    const psnr = /average:([\d.]+)/.exec(run('psnr'))?.[1];
    const ssim = /All:([\d.]+)/.exec(run('ssim'))?.[1];
    return { psnr: Number(psnr), ssim: Number(ssim) };
  };
  const results = {};
  for (const [name, preset] of Object.entries(QUALITY_PRESETS)) {
    const out = resolve(work, `${name}.mp4`);
    const enc = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '60', '-i', resolve(work, 'src', '%04d.png'), '-c:v', 'libx264', ...preset, '-pix_fmt', 'yuv420p', out], { encoding: 'utf8' });
    assert.equal(enc.status, 0, enc.stderr);
    results[name] = { ...measure(out), preset: preset.join(' ') };
  }
  console.log(JSON.stringify(results, null, 2));
  assert.ok(results.high.psnr > results.standard.psnr, 'high quality must beat standard PSNR');
  assert.ok(results.high.ssim > results.standard.ssim, 'high quality must beat standard SSIM');
  console.log(`Export quality check passed: high ${results.high.psnr.toFixed(2)} dB / SSIM ${results.high.ssim.toFixed(4)} vs standard ${results.standard.psnr.toFixed(2)} dB / SSIM ${results.standard.ssim.toFixed(4)}`);
} finally {
  await runtime.close();
  await rm(work, { recursive: true, force: true });
}
