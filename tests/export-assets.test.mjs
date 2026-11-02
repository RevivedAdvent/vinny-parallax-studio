import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveLayerAsset, AssetError } from '../scripts/export-assets.mjs';
import { validateExportRequest } from '../scripts/export-payload.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const pngBytes = readFileSync(root + 'public/assets/scene-01-normalized/vinny.png');
const pngUrl = 'data:image/png;base64,' + pngBytes.toString('base64');
const webpFile = join(tmpdir(), `vinny-assets-${process.pid}.webp`);
const jpegFile = join(tmpdir(), `vinny-assets-${process.pid}.jpg`);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', root + 'public/assets/scene-01-normalized/background.png', webpFile]);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', root + 'public/assets/scene-01-normalized/background.png', '-q:v', '3', jpegFile]);

const resolve = (asset, name = 'Layer') => resolveLayerAsset({ id: 'l', name, asset });
async function assertLayerError(promise, pattern) {
  await assert.rejects(promise, error => {
    assert.ok(error instanceof AssetError, `expected AssetError, got ${error?.name}: ${error?.message}`);
    assert.match(error.message, pattern);
    assert.ok(error.layer, 'error names the layer');
    return true;
  });
}

// A. Asset resolution
test('valid PNG data URL is preserved byte-for-byte', async () => {
  assert.equal(await resolve(pngUrl), pngUrl);
});
test('valid JPEG and WebP data URLs decode', async () => {
  const jpeg = 'data:image/jpeg;base64,' + readFileSync(jpegFile).toString('base64');
  const webp = 'data:image/webp;base64,' + readFileSync(webpFile).toString('base64');
  assert.match(await resolve(jpeg), /^data:image\/jpeg;base64,/);
  assert.match(await resolve(webp), /^data:image\/webp;base64,/);
});
test('malformed data URL is reported with its layer', async () => {
  await assertLayerError(resolve('data:image/png;base64,@@@', 'Hero'), /Layer "Hero": embedded artwork is malformed/);
});
test('data URL with the wrong image bytes is rejected', async () => {
  const fake = 'data:image/png;base64,' + Buffer.from('not a png').toString('base64');
  await assertLayerError(resolve(fake), /not a valid PNG image/);
});
test('valid /assets path resolves to the same image bytes', async () => {
  const out = await resolve('/assets/scene-01-normalized/vinny.png');
  assert.equal(out, pngUrl);
});
test('missing /assets path is reported', async () => {
  await assertLayerError(resolve('/assets/scene-01/missing.png'), /does not exist/);
});
test('path traversal is refused', async () => {
  await assertLayerError(resolve('/assets/../package.json'), /escapes the project asset directory/);
  await assertLayerError(resolve('/assets/%2e%2e/%2e%2e/package.json'), /escapes the project asset directory/);
});
test('paths outside /assets are refused', async () => {
  await assertLayerError(resolve('/index.html'), /unsupported asset path/);
});
test('unsupported file type is refused', async () => {
  await assertLayerError(resolve('/assets/scene-01-normalized/registration.json'), /unsupported file type/);
});
test('blob URL gives a clear re-import message', async () => {
  await assertLayerError(resolve('blob:http://127.0.0.1:5173/abc', 'Front'), /browser blob URL.*re-import/);
});
test('remote URL is not fetched', async () => {
  await assertLayerError(resolve('https://example.com/a.png'), /remote URLs are not fetched/);
});
test('oversized embedded artwork is rejected before decoding', async () => {
  const big = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(41 * 1024 * 1024)]).toString('base64');
  await assertLayerError(resolve(big), /larger than 40 MB/);
});

// B. Project validation
const scene = (layers = [], extra = {}) => ({ id: 's1', title: 'Scene 1', width: 1920, height: 1080, fps: 24, totalFrames: 240,
  camera: { baseZoom: 1, anchor: { x: 960, y: 540 }, limits: {} }, layers, tracks: [], ...extra });
test('validator accepts local /assets and data URL layers', () => {
  const layers = [{ id: 'a', name: 'A', asset: '/assets/scene-01-normalized/vinny.png' }, { id: 'b', name: 'B', asset: pngUrl }];
  assert.equal(validateExportRequest({ project: { scenes: [scene(layers)] } }).project.scenes.length, 1);
});
test('validator rejects blob and remote references early', () => {
  assert.throws(() => validateExportRequest({ project: { scenes: [scene([{ id: 'a', name: 'A', asset: 'blob:x' }])] } }), /blob reference/);
  assert.throws(() => validateExportRequest({ project: { scenes: [scene([{ id: 'a', name: 'A', asset: 'https://x/y.png' }])] } }), /https reference/);
});
test('validator rejects scenes missing camera or layers', () => {
  assert.throws(() => validateExportRequest({ project: { scenes: [{ ...scene(), camera: undefined }] } }), /camera settings are missing/);
  assert.throws(() => validateExportRequest({ project: { scenes: [{ ...scene(), layers: undefined }] } }), /layers must be an array/);
});
test('validation does not mutate the submitted project', () => {
  const project = { scenes: [scene([{ id: 'a', name: 'A', asset: '/assets/scene-01-normalized/vinny.png' }])] };
  const before = JSON.stringify(project);
  validateExportRequest({ project });
  assert.equal(JSON.stringify(project), before);
});
