// Production-build check: the built `dist` bundle must render the same frames as
// the Vite dev server, using local assets only and with no page errors.
// The recorded PNG master is compared too when `output/camera-phase1/manifest.json`
// exists, but it is not required (run `npm run render:frames` to create it).
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { once } from 'node:events';
import { resolve, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { launch, projectRoot } from './runtime.mjs';
import { CAMERA_PROOF } from '../src/scenes/camera-proof.ts';

const root = resolve(projectRoot, 'dist'), dir = resolve(projectRoot, 'output/camera-phase1');
const frames = [120, 500];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://local').pathname;
    const file = resolve(root, '.' + (path === '/' ? '/index.html' : decodeURIComponent(path)));
    if (!file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = 'http://127.0.0.1:' + server.address().port;

const hash = buffer => createHash('sha256').update(buffer).digest('hex');
async function captureFrames(browser, base, { localOnly = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  if (localOnly) await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(base + '/') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    external.push(url); return route.abort();
  });
  await page.addInitScript(input => { window.__CAMERA_INPUT__ = input; }, { config: CAMERA_PROOF, intensity: 1 });
  await page.goto(base + '/?render=1');
  await page.waitForFunction(() => window.cameraStudio?.ready, null, { timeout: 60000 });
  const shots = [];
  for (const frame of frames) {
    const result = await page.evaluate(frame => { window.cameraStudio.renderFrame(frame); return window.cameraStudio.capture(); }, frame);
    shots.push({ frame, sha256: hash(Buffer.from(result.png.split(',')[1], 'base64')), coverage: result.coverage });
  }
  await page.close();
  return { shots, errors, external };
}

// The built studio shell must serve the current UI, not a stale bundle.
async function checkStudioUI(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(base + '/') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    external.push(url); return route.abort();
  });
  await page.goto(base + '/');
  await page.waitForFunction(() => window.cameraStudio?.ready, null, { timeout: 60000 });
  const tabs = await page.locator('[data-tab]').evaluateAll(nodes => nodes.map(node => node.textContent.trim()));
  assert.deepEqual(tabs, ['Story', 'Arrange', 'Camera Movements', 'Parallax', 'Atmosphere', 'Timeline', 'Export'], 'current workspace tabs are built');
  assert.equal(await page.locator('#toggle-left, #toggle-right').count(), 0, 'dead sidebar toggles are gone');
  await page.evaluate(() => { document.querySelector('details.project-menu').open = true; });
  await page.locator('#example').click();
  await page.waitForFunction(() => window.cameraStudio.getState().config.totalFrames === 1800, null, { timeout: 60000 });
  const scene = await page.evaluate(() => window.cameraStudio.getState().config);
  assert.equal(scene.fps, 60); assert.equal(scene.totalFrames, 1800); assert.equal(scene.tracks.length, 0, 'example ships no legacy tracks');
  assert.equal(await page.locator('#scene-duration').inputValue(), '30');
  await page.locator('[data-tab="animate"]').click();
  assert.match(await page.locator('#animation-effects-list').innerText(), /No camera movements yet/);
  assert.equal(await page.locator('text=Legacy tracks are shown').count(), 0, 'legacy explainer is gone');
  await page.close();
  return { tabs, fps: scene.fps, totalFrames: scene.totalFrames, tracks: scene.tracks.length, errors, external };
}

const dev = await launch();
try {
  const production = await captureFrames(dev.browser, origin, { localOnly: true });
  const development = await captureFrames(dev.browser, dev.url);
  const ui = await checkStudioUI(dev.browser, origin);
  assert.deepEqual(production.external, [], 'production must load local assets only');
  assert.deepEqual(production.errors, [], 'production page must not throw');
  assert.deepEqual(development.errors, [], 'dev page must not throw');
  assert.deepEqual(ui.external, [], 'production studio must load local assets only');
  assert.deepEqual(ui.errors, [], 'production studio must not throw');

  let master = null;
  try { master = JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }

  for (const frame of frames) {
    const prod = production.shots.find(shot => shot.frame === frame), devShot = development.shots.find(shot => shot.frame === frame);
    assert.equal(prod.coverage.uncoveredPixels, 0, `production frame ${frame} is fully covered`);
    assert.equal(prod.sha256, devShot.sha256, `Production PNG must match the dev render at frame ${frame}`);
    if (master) assert.equal(prod.sha256, master.frames[frame]?.sha256, `Production PNG must match the recorded master at frame ${frame}`);
  }

  const report = { pass: true, productionMatchesDev: production.shots.map(({ frame, sha256 }) => ({ frame, sha256, equal: true })),
    comparedToRecordedMaster: !!master, studioUI: ui, externalRequests: production.external, pageErrors: production.errors };
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, 'production-checks.json'), JSON.stringify(report, null, 2));
  console.log(`PRODUCTION CHECKS PASSED: dist matches the dev render byte-for-byte at frames ${frames.join('/')}${master ? ' and the recorded master' : ''}; the built studio exposes the current tabs, 60 fps / 30 s example and applied-effects list; local assets only; no page errors.`);
} finally { await dev.close(); await new Promise(resolve => server.close(resolve)); }
