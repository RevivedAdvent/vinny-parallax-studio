import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { SCENE } from '../src/scenes/arrival.ts';
import { clamp, smooth, envelope, random } from '../src/engine/math.ts';
test('camera easing is bounded and smooth', () => {
  assert.equal(clamp(-1), 0); assert.equal(clamp(9), 1);
  assert.equal(smooth(0), 0); assert.equal(smooth(1), 1); assert.equal(smooth(0.5), 0.5);
  let previous = 0;
  for (let t = 0; t <= 1; t += 0.01) { const current = smooth(t); assert.ok(current >= previous); previous = current; }
});
test('caption envelopes do not leak outside their cue', () => {
  assert.equal(envelope(0, 1, 5), 0); assert.equal(envelope(3, 1, 5), 1); assert.equal(envelope(6, 1, 5), 0);
});
test('particles are seeded and repeatable', () => {
  const a = random(842), b = random(842);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
});
test('all supplied scene layers exist and are ordered back to front', async () => {
  let depth = -1;
  for (const layer of SCENE.layers) {
    assert.ok(layer.depth > depth); depth = layer.depth;
    await access(new URL('../public/assets/scene-01/' + layer.file, import.meta.url));
  }
  assert.equal(SCENE.layers.find(l => l.id === 'vinny').x, 68);
  assert.equal(SCENE.layers.find(l => l.id === 'vinny').y, 185);
});
test('captions fit within the scene without overlaps', () => {
  let end = 0;
  for (const c of SCENE.captions) { assert.ok(c.start >= end); assert.ok(c.end > c.start && c.end <= SCENE.duration); end = c.end; }
  assert.equal(SCENE.duration * SCENE.fps, 576);
});
