import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { validateExportRequest } from '../scripts/export-payload.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const freePort = () => new Promise((resolve, reject) => {
  const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on('error', reject);
});
const sceneFixture = (overrides = {}) => ({
  version: 1, id: 'scene-a', title: 'Scene A', width: 1920, height: 1080, fps: 24, totalFrames: 240,
  camera: { baseZoom: 1, maxRoll: 3, anchor: { x: 960, y: 540 }, limits: {} }, layers: [], tracks: [], ...overrides,
});

test('payload validator rejects malformed projects with specific messages', () => {
  assert.throws(() => validateExportRequest(null), /JSON object/);
  assert.throws(() => validateExportRequest({}), /missing a Story project/);
  assert.throws(() => validateExportRequest({ project: { scenes: [] } }), /no scenes/);
  assert.throws(() => validateExportRequest({ project: { scenes: [{ id: 'a', totalFrames: 10, fps: 24, layers: [], tracks: [] }] } }), /camera settings are missing/);
  assert.throws(() => validateExportRequest({ project: { scenes: [sceneFixture({ layers: undefined })] } }), /layers must be an array/);
  assert.throws(() => validateExportRequest({ project: { scenes: [sceneFixture({ totalFrames: 0 })] } }), /totalFrames/);
  assert.throws(() => validateExportRequest({ project: { scenes: [sceneFixture()] }, sceneId: 'missing' }), /Selected scene not found/);
});

test('payload validator refuses blob and remote artwork, accepts data and project asset paths', () => {
  const layer = { id: 'l', name: 'Art', asset: 'blob:http://127.0.0.1:5173/x', depth: 0.5 };
  assert.throws(() => validateExportRequest({ project: { scenes: [sceneFixture({ layers: [layer] })] } }), /blob reference/);
  const remote = { ...layer, asset: 'https://example.com/a.png' };
  assert.throws(() => validateExportRequest({ project: { scenes: [sceneFixture({ layers: [remote] })] } }), /https reference/);
  const data = { ...layer, asset: 'data:image/png;base64,AAAA' };
  assert.equal(validateExportRequest({ project: { scenes: [sceneFixture({ layers: [data] })] }, sceneId: 'scene-a' }).sceneId, 'scene-a');
  const local = { ...layer, asset: '/assets/scene-01-normalized/vinny.png' };
  assert.equal(validateExportRequest({ project: { scenes: [sceneFixture({ layers: [local] })] } }).project.scenes.length, 1);
});

test('export service: CORS allowlist, validation errors and job polling', async t => {
  const port = await freePort();
  const child = spawn(process.execPath, ['scripts/export-server.mjs'], { cwd: root, env: { ...process.env, EXPORT_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill('SIGTERM'));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('service did not start')), 10000);
    child.stdout.on('data', chunk => { if (String(chunk).includes('listening')) { clearTimeout(timer); resolve(); } });
    child.once('exit', code => reject(new Error(`service exited ${code}`)));
  });
  const base = `http://127.0.0.1:${port}`;

  const allowed = await fetch(`${base}/api/export`, { method: 'OPTIONS', headers: { origin: 'http://localhost:5173' } });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');

  const denied = await fetch(`${base}/api/export`, { method: 'OPTIONS', headers: { origin: 'http://evil.example' } });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);

  const badJson = await fetch(`${base}/api/export`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' }, body: '{bad' });
  assert.equal(badJson.status, 400);
  assert.match((await badJson.json()).error, /not valid JSON/);

  const badScene = await fetch(`${base}/api/export`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' }, body: JSON.stringify({ project: { scenes: [{ id: 'a', totalFrames: 10, fps: 24, layers: [], tracks: [] }] } }) });
  assert.equal(badScene.status, 400);
  assert.match((await badScene.json()).error, /camera settings are missing/);

  const missing = await fetch(`${base}/api/export/does-not-exist`);
  assert.equal(missing.status, 404);
});

test('exportStoryVideo reports phases and rejects scenes without camera data before rendering', async () => {
  const { exportStoryVideo } = await import('../scripts/export-story-video.mjs');
  await assert.rejects(exportStoryVideo({ project: { scenes: [{ id: 'a', totalFrames: 10, fps: 24, layers: [], tracks: [] }] } }), /missing camera or layer data/);
});
