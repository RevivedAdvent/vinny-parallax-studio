// End-to-end: real studio import/save/reload -> both buttons -> service -> Pixi ->
// FFmpeg -> download -> decode every frame and compare against the live preview.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launch } from './runtime.mjs';
import { exportProject } from './fixtures/export-project.mjs';

const out = resolve(process.env.EXPORT_TEST_OUTPUT || 'output/export-e2e');
await mkdir(out, { recursive: true });
const work = resolve(out, 'work'); await mkdir(work, { recursive: true });
const port = await new Promise((yes, no) => {
  const server = createServer().listen(0, '127.0.0.1', () => {
    const port = server.address().port; server.close(() => yes(port));
  });
  server.on('error', no);
});
process.env.EXPORT_SERVICE_URL = `http://127.0.0.1:${port}`;
const runtime = await launch();
let service, serviceLog = '', page;
const errors = [], requests = [], results = [], references = new Map();
function ffmpeg(args) {
  const result = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-threads', '2', ...args], { maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr.toString());
  return result.stdout;
}
function raw(png) { return ffmpeg(['-i', png, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']); }
function compare(a, b) {
  assert.equal(a.length, b.length); let squared = 0, absolute = 0, brightness = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; squared += d * d; absolute += Math.abs(d); brightness += b[i]; }
  return { psnr: squared ? 10 * Math.log10(255 ** 2 / (squared / a.length)) : 100,
    mae: absolute / a.length, brightness: brightness / b.length };
}
async function snapshot(sceneIndex, frame) {
  await page.locator('[data-tab="story"]').click();
  await page.locator('.scene-item').nth(sceneIndex).click();
  await page.waitForFunction(id => { try { return window.cameraStudio.getState().config.id === id; } catch { return false; } }, project.scenes[sceneIndex].id);
  const png = await page.evaluate(frame => {
    window.cameraStudio.renderTime(frame / 60);
    return window.cameraStudio.capture().png;
  }, frame);
  const file = resolve(out, `preview-scene-${sceneIndex}-frame-${frame}.png`);
  await writeFile(file, Buffer.from(png.split(',')[1], 'base64'));
  references.set(`${sceneIndex}/${frame}`, raw(file));
  return png;
}
const project = await exportProject();
await writeFile(resolve(out, 'project.story.json'), JSON.stringify(project));
try {
  service = spawn(process.execPath, ['scripts/export-server.mjs'], {
    env: { ...process.env, TMPDIR: work, EXPORT_PORT: String(port), EXPORT_ALLOWED_ORIGINS: runtime.url },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  service.stdout.on('data', chunk => { serviceLog += chunk; });
  service.stderr.on('data', chunk => { serviceLog += chunk; process.stderr.write(chunk); });
  await new Promise((yes, no) => {
    const timer = setTimeout(() => no(new Error('Export service startup timeout')), 15000);
    service.once('error', no); service.once('exit', code => no(new Error(`Export service exited ${code}`)));
    service.stdout.on('data', chunk => { if (String(chunk).includes('listening')) { clearTimeout(timer); yes(); } });
  });
  page = await runtime.browser.newPage({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/export')) requests.push(JSON.parse(request.postData())); });
  await page.goto(runtime.url); await page.waitForFunction(() => window.cameraStudio?.ready);
  await page.locator('#project-file').setInputFiles(resolve(out, 'project.story.json'));
  await page.waitForFunction(id => { try { return window.cameraStudio.getState().config.id === id; } catch { return false; } }, project.scenes[0].id, { timeout: 60000 });
  await page.locator('#save').click();
  await page.waitForFunction(() => document.querySelector('#save-status').textContent === 'Saved locally');
  await page.reload(); await page.waitForFunction(() => window.cameraStudio?.ready);
  const loaded = await page.evaluate(() => window.cameraStudio.getState().config);
  assert.equal(loaded.id, project.scenes[0].id, 'export uses the saved/reloaded project');
  assert.equal(loaded.cameraMoves.length, 9); assert.equal(loaded.layerEffects.length, 5);
  assert.equal(loaded.atmosphere.length, 14); assert.equal(loaded.depthPlanes.length, 1);

  for (const [sceneIndex, frames] of [[0, [0, 30, 75, 119]], [1, [0, 30, 59]], [2, [0, 30, 59]]]) {
    for (const frame of frames) await snapshot(sceneIndex, frame);
  }
  await snapshot(0, 30);
  const state = await page.evaluate(() => window.cameraStudio.getState());
  assert.ok(state.state.virtualCamera); assert.ok(state.warps['art-1']);
  assert.ok(state.state.layerMasks['art-3']); assert.ok(state.shadows['art-2']);
  assert.equal(state.particles.pollen, 8);
  assert.ok(state.atmosphere.overlays.some(o => o.type === 'fog'));
  assert.ok(state.atmosphere.overlays.some(o => o.type === 'rays'));
  assert.ok(state.atmosphere.overlays.some(o => o.type === 'ripples'));
  assert.ok(state.atmosphere.layers['art-3'].blur > 0);
  await writeFile(resolve(out, 'evaluated-state.json'), JSON.stringify(state, null, 2));
  await page.locator('[data-tab="export"]').click();
  const sceneStarts = [0, 120, 180];
  for (const [scope, frames] of [['current', 120], ['all', 240]]) {
    console.log(`Starting UI ${scope} export…`);
    await page.locator(`#export-${scope}`).click();
    assert.equal(await page.locator(`#export-${scope}`).isDisabled(), true);
    await page.waitForFunction(scope => !document.querySelector(`#${scope}-download`).hidden
      || /failed/i.test(document.querySelector(`#${scope}-status`).textContent), scope, { timeout: 900000 });
    const message = await page.locator(`#${scope}-status`).innerText();
    assert.match(message, /^Ready \u00b7/, `${scope}: ${message}\n${serviceLog}`);
    const pending = page.waitForEvent('download'); await page.locator(`#${scope}-download`).click();
    const download = await pending, file = resolve(out, `${scope}.mp4`); await download.saveAs(file);
    const probed = spawnSync(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-count_frames',
      '-show_entries', 'stream=codec_name,width,height,pix_fmt,avg_frame_rate,nb_read_frames:format=duration', '-of', 'json', file], { encoding: 'utf8' });
    assert.equal(probed.status, 0, probed.stderr);
    const metadata = JSON.parse(probed.stdout), stream = metadata.streams[0];
    assert.equal(stream.codec_name, 'h264'); assert.equal(stream.width, 1920); assert.equal(stream.height, 1080);
    assert.equal(stream.pix_fmt, 'yuv420p'); assert.equal(stream.avg_frame_rate, '60/1');
    assert.equal(Number(stream.nb_read_frames), frames); assert.equal(Number(metadata.format.duration), frames / 60);
    const bytes = await readFile(file); let pos = 0, moov = -1, mdat = -1;
    while (pos + 8 <= bytes.length) { const size = bytes.readUInt32BE(pos), type = bytes.toString('ascii', pos + 4, pos + 8);
      if (type === 'moov') moov = pos; if (type === 'mdat') mdat = pos; if (size < 8) break; pos += size; }
    assert.ok(moov >= 0 && mdat > moov, 'fast-start moov precedes mdat');
    // Decode the entire MP4 (not just FFprobe metadata); blackdetect covers every frame.
    const decode = spawnSync('ffmpeg', ['-hide_banner', '-v', 'info', '-threads', '2', '-i', file,
      '-vf', 'blackdetect=d=0.01:pix_th=0.02', '-f', 'null', '-'], { encoding: 'utf8' });
    assert.equal(decode.status, 0, decode.stderr);
    assert.doesNotMatch(decode.stderr, /black_start|Error|corrupt/i, 'all video frames decode, none unexpectedly black');
    await writeFile(resolve(out, `${scope}-decode.log`), decode.stderr);
    const comparisons = [];
    for (const [key, reference] of references) {
      const [sceneIndex, frame] = key.split('/').map(Number); if (scope === 'current' && sceneIndex > 0) continue;
      const n = frame + sceneStarts[sceneIndex], png = resolve(out, `${scope}-frame-${n}.png`);
      ffmpeg(['-y', '-i', file, '-vf', `select=eq(n\\,${n})`, '-frames:v', '1', png]);
      // Non-16:9 scenes are letterboxed inside the 1920x1080 frame; compare the content box.
      const box = sceneIndex === 2 ? resolve(out, `${scope}-frame-${n}-box.png`) : png;
      if (box !== png) ffmpeg(['-y', '-i', png, '-vf', 'crop=1080:1080:420:0', box]);
      const actual = raw(box), metric = compare(reference, actual);
      const full = box === png ? actual : raw(png);
      assert.ok(metric.psnr > 28, `${scope} frame ${n} differs from preview: ${JSON.stringify(metric)}`);
      assert.ok(metric.brightness > 8, `${scope} frame ${n} is not black`);
      // Every scene must differ from the first frame of scene 1: no stale frames.
      if (sceneIndex) assert.ok(compare(raw(resolve(out, `${scope}-frame-0.png`)), full).psnr < 25, `scene ${sceneIndex + 1} frame ${n} is a stale copy of scene 1`);
      comparisons.push({ sceneIndex, frame: n, ...metric });
    }
    assert.notDeepEqual(await readFile(resolve(out, `${scope}-frame-0.png`)), await readFile(resolve(out, `${scope}-frame-30.png`)), 'video contains actual animation');
    results.push({ scope, file, metadata, fastStart: true, decodedAllFrames: true, comparisons });
    console.log(`${scope}: ${frames} frames verified, preview PSNR ${Math.min(...comparisons.map(c => c.psnr)).toFixed(2)} dB`);
  }
  assert.equal(requests.length, 2); assert.equal(requests[0].project.scenes[0].atmosphere.length, 14);
  // Failure handling: unusable artwork must fail with a named reason, not a broken video.
  const broken = structuredClone(project);
  broken.scenes[0].layers[0].asset = '/assets/not-here.png';
  const before = (await readdir(work)).filter(name => name.startsWith('vinny-export')).length;
  const start = await fetch(`http://127.0.0.1:${port}/api/export`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: broken, sceneId: broken.scenes[0].id }) });
  assert.equal(start.status, 202);
  const jobId = (await start.json()).id;
  let failed;
  for (let i = 0; i < 60; i++) {
    failed = await (await fetch(`http://127.0.0.1:${port}/api/export/${jobId}`)).json();
    if (failed.error) break;
    await new Promise(done => setTimeout(done, 250));
  }
  assert.equal(failed.error, true); assert.match(failed.status, /Unable to load .*file does not exist/);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/export/${jobId}/file`)).status, 404, 'no file is served for a failed job');
  assert.equal((await readdir(work)).filter(name => name.startsWith('vinny-export')).length, before, 'a failed job deletes its temporary directory immediately');
  // The same failure must be visible in the UI, with the button usable again.
  await page.locator('#project-file').setInputFiles({ name: 'broken.story.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(broken)) });
  await page.waitForFunction(() => { try { return window.cameraStudio.getState().config.layers.length > 0; } catch { return false; } }, null, { timeout: 60000 });
  await page.locator('[data-tab="export"]').click();
  await page.locator('#export-current').click();
  await page.waitForFunction(() => /Export failed/.test(document.querySelector('#current-status').textContent), null, { timeout: 300000 });
  assert.match(await page.locator('#current-status').innerText(), /Export failed\. Unable to load .*file does not exist/);
  assert.equal(await page.locator('#export-current').isDisabled(), false, 'the export button recovers after a failure');
  assert.equal(await page.locator('#current-download').isHidden(), true, 'no download link is offered for a failed export');
  assert.equal(errors.filter(message => !/404 \(Not Found\)/.test(message)).length, 0, `unexpected browser errors: ${errors.join(' | ')}`);
  const missing = await fetch(`http://127.0.0.1:${port}/api/export`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project: { scenes: [{ ...broken.scenes[0], layers: [{ ...broken.scenes[0].layers[0], asset: 'blob:http://127.0.0.1/x' }] }] } }) });
  assert.equal(missing.status, 400); assert.match((await missing.json()).error, /blob reference/);
  assert.deepEqual(errors, [], 'no browser console, request or page errors');
  console.log('EXPORT E2E PASSED');
} finally {
  if (service) { service.kill('SIGTERM'); if (service.exitCode === null) await once(service, 'exit'); }
  await runtime.close();
  await writeFile(resolve(out, 'service.log'), serviceLog);
  const leftovers = (await readdir(work)).filter(name => name.startsWith('vinny-export'));
  await writeFile(resolve(out, 'results.json'), JSON.stringify({ pass: results.length === 2 && errors.length === 0, results, errors, leftovers }, null, 2));
  assert.deepEqual(leftovers, [], 'service shutdown removes result and failed-job directories');
}
