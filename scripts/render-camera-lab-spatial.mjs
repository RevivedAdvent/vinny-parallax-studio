import { mkdir, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { projectRoot } from './runtime.mjs';
import { launchCamera } from './camera-runtime.mjs';
import { LAB_SPATIAL_PRESETS } from '../src/scenes/camera-lab-spatial.ts';
import { projectLayers } from '../src/camera/project.ts';
import { compileCamera } from '../src/camera/evaluate.ts';

const dir = resolve(projectRoot, 'output/camera-lab-spatial');
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const decode = data => Buffer.from(data.split(',')[1], 'base64');

await mkdir(dir, { recursive: true });
const marker = resolve(dir, 'lab-report.json');
try { await access(marker); throw new Error('Refusing to overwrite ' + marker); }
catch (e) { if (e.code !== 'ENOENT') throw e; }

const report = { complete: false, pass: true, presets: [] };
await writeFile(marker, JSON.stringify(report, null, 2));

for (const preset of LAB_SPATIAL_PRESETS) {
  const input = { config: preset, intensity: 1 };
  const runtime = await launchCamera(input);
  const entry = { id: preset.id, tracks: preset.tracks.length, totalFrames: preset.totalFrames, pass: true, frames: [] };
  try {
    const shot = frame => runtime.page.evaluate(frame => {
      window.cameraStudio.renderFrame(frame);
      return { ...window.cameraStudio.capture(), transforms: window.cameraStudio.getState().transforms };
    }, frame);
    // Repeatability: frame 36 scanned before and after the full pass with different seeks between.
    const first = await shot(36);
    for (const frame of [0, 71, 8, 63, 0]) await shot(frame);
    const second = await shot(36);
    assert.equal(first.png, second.png, `${preset.id}: repeated frame 36 must match byte-for-byte`);
    await mkdir(resolve(dir, preset.id, 'frames'), { recursive: true });
    for (let frame = 0; frame < preset.totalFrames; frame++) {
      const result = await shot(frame);
      const png = decode(result.png);
      const filename = `${preset.id}-${String(frame).padStart(4, '0')}.png`;
      await writeFile(resolve(dir, preset.id, 'frames', filename), png);
      const expected = projectLayers(preset, compileCamera(preset).evaluate(frame, 1));
      assert.deepEqual(
        result.transforms.map(({ id, x, y, scale, roll }) => ({ id, x, y, scale, roll })),
        expected.map(({ id, x, y, scale, roll }) => ({ id, x, y, scale, roll })),
        `${preset.id} frame ${frame}: rendered transforms must equal the pure camera evaluator`,
      );
      entry.frames.push({ frame, filename, sha256: hash(png), coverage: result.coverage });
      if (result.coverage.uncoveredPixels) {
        entry.pass = false; report.pass = false;
        entry.failure = `GAP FAIL at frame ${frame}: ${result.coverage.uncoveredPixels} uncovered pixels.`;
        await writeFile(resolve(dir, preset.id, `GAP-FAIL-frame-${frame}.png`), png);
        break;
      }
    }
    if (entry.frames.length !== preset.totalFrames) { entry.pass = false; report.pass = false; }
    assert.equal(runtime.errors.length, 0, runtime.errors.join('\n'));
  } catch (error) {
    entry.pass = false; report.pass = false; entry.failure = String(error);
  } finally {
    await runtime.close();
  }
  report.presets.push(entry);
  console.log(`${entry.pass ? 'PASS' : 'FAIL'} ${preset.id}: ${entry.frames.length}/${preset.totalFrames} frames, zero gaps required.`);
}

report.complete = report.presets.every(p => p.pass && p.frames.length === p.totalFrames);
report.pass = report.complete;
await writeFile(marker, JSON.stringify(report, null, 2));
if (!report.pass) throw new Error('Camera Lab basic tier failed; see lab-report.json. No silent fixes applied.');
console.log(`CAMERA LAB BASIC COMPLETE: ${report.presets.length} presets × 72 frames, all covered.`);
