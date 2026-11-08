import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene } from '../src/studio/project.ts';
import { validateScene } from '../src/camera/validate.ts';
import { createLayerCommands } from '../src/studio/layer-commands.ts';
import { stackUnits } from '../src/studio/layer-stack.ts';

/** Small in-memory studio: every commit validates and replaces the scene. */
function harness(layers, folders) {
  const config = createScene('Arrange', 4, 800, 600, 24);
  config.layers = layers.map((layer, index) => ({ asset: '/art.png', depth: 0, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, visible: true, order: index, width: 1600, height: 1200, ...layer }));
  if (folders) config.folders = folders;
  let state = validateScene(config);
  let id = 0;
  let selected = [state.layers[0]?.id ?? ''];
  const messages = [];
  const commands = createLayerCommands({
    getScene: () => state,
    commit: async next => { state = validateScene(next); },
    notify: message => messages.push(message),
    newId: () => `gen-${++id}`,
    selection: () => selected,
    select: ids => { selected = ids; },
  });
  return { commands, get scene() { return state; }, messages, select: ids => { selected = ids; }, get selection() { return selected; } };
}

const track = (id, target, property = 'x') => ({ id, target, property, startFrame: 0, endFrame: 4, startValue: 0, endValue: 10, easing: 'linear', intensity: 1, limits: { min: -800, max: 800 } });
const authored = (id, target) => ({ id, target, property: 'x', intensity: 1, keyframes: [{ id: `${id}-k`, timeSeconds: 0, value: 0, easing: 'linear' }] });

const names = scene => [...scene.layers].sort((a, b) => (b.order ?? 0) - (a.order ?? 0)).map(layer => layer.name);
const units = scene => stackUnits(scene).map(unit => unit.kind === 'folder' ? `[${unit.folder.name}] ${unit.layers.map(layer => layer.name).join(',')}` : unit.layer.name);

test('duplicate copies artwork, transforms and animation targets', async () => {
  const studio = harness([{ id: 'a', name: 'Sky', x: 12, scale: 2 }]);
  studio.scene.tracks.push(track('t1', 'layer:a'));
  studio.scene.animationTracks = [authored('at1', 'layer:a')];
  await studio.commands.duplicate(['a']);
  const copy = studio.scene.layers.find(layer => layer.id !== 'a');
  assert.equal(copy.name, 'Sky (copy)');
  assert.equal(copy.scale, 2, 'transform is copied');
  assert.ok(copy.order > 0, 'the copy lands in front of the original');
  assert.deepEqual(studio.selection, [copy.id], 'the copy becomes the selection');
  const legacyCopy = studio.scene.tracks.find(candidate => candidate.target === `layer:${copy.id}`);
  assert.ok(legacyCopy, 'legacy animation track follows the copy');
  assert.notEqual(legacyCopy.id, 't1', 'the copied track gets a fresh id');

  const copyTrack = studio.scene.animationTracks.find(candidate => candidate.target === `layer:${copy.id}`);
  assert.ok(copyTrack && copyTrack.keyframes[0].id !== 'at1-k', 'authored keyframes are re-identified');
});

test('delete cascades tracks, effects and depth influence', async () => {
  globalThis.confirm = () => true;
  const studio = harness([{ id: 'a', name: 'Sky' }, { id: 'b', name: 'Boat' }]);
  studio.scene.tracks.push(track('t1', 'layer:b'));
  studio.scene.tracks.push(track('t2', 'layer:a'));
  studio.scene.parallax = { influence: { a: 1, b: 0.4 } };
  await studio.commands.remove(['b']);
  assert.deepEqual(names(studio.scene), ['Sky']);
  assert.deepEqual(studio.scene.tracks.map(item => item.id), ['t2'], 'only the deleted layer loses its tracks');
  assert.deepEqual(Object.keys(studio.scene.parallax.influence), ['a'], 'depth influence for the layer is dropped');
  assert.deepEqual(studio.selection, [], 'deleting clears the selection');
  delete globalThis.confirm;
});

test('reset transform and fit to canvas only touch the requested layers', async () => {
  const studio = harness([{ id: 'a', name: 'Sky', x: 40, y: -20, scale: 3, rotation: 15, opacity: .5 }, { id: 'b', name: 'Boat', x: 30 }]);
  await studio.commands.resetTransform(['a']);
  const sky = studio.scene.layers.find(layer => layer.id === 'a');
  assert.deepEqual([sky.x, sky.y, sky.scale, sky.rotation, sky.opacity], [0, 0, 1, 0, 1]);
  assert.equal(studio.scene.layers.find(layer => layer.id === 'b').x, 30, 'other layers keep their transform');

  await studio.commands.fitToCanvas('a');
  const fitted = studio.scene.layers.find(layer => layer.id === 'a');
  assert.equal(fitted.scale, Math.min(800 / 1600, 600 / 1200), 'the whole image fits inside the canvas');
  assert.deepEqual([fitted.x, fitted.y], [0, 0]);
});

test('align, front and back reorder the stack without dropping folders', async () => {
  const studio = harness([{ id: 'a', name: 'A', x: 5, y: 5 }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], [{ id: 'f1', name: 'Group', order: 5 }]);
  studio.scene.layers.find(layer => layer.id === 'c').folderId = 'f1';
  await studio.commands.alignCentre(['a']);
  assert.deepEqual([studio.scene.layers[0].x, studio.scene.layers[0].y], [0, 0]);
  await studio.commands.bringToFront(['a']);
  assert.equal(units(studio.scene)[0], 'A', 'the layer moves to the front slot');
  await studio.commands.sendToBack(['a']);
  assert.equal(units(studio.scene).at(-1), 'A', 'the layer moves to the back slot');
  assert.ok(units(studio.scene).includes('[Group] C'), 'the folder keeps its child');
});

test('align to canvas uses scaled, rotated bounds and preserves the other axis', async () => {
  const studio = harness([{ id: 'a', name: 'A', width: 200, height: 100, scale: 2, rotation: 90, x: 13, y: 23 }]);
  studio.scene.camera.baseZoom = 1.5;
  await studio.commands.alignToCanvas('a', 'left');
  let layer = studio.scene.layers[0];
  assert.ok(Math.abs((400 + layer.x * 1.5) - 150) < 1e-8, 'rotated left edge matches canvas left');
  assert.equal(layer.y, 23, 'vertical position is unchanged');
  await studio.commands.alignToCanvas('a', 'right');
  layer = studio.scene.layers[0];
  assert.ok(Math.abs((400 + layer.x * 1.5) + 150 - 800) < 1e-8);
  await studio.commands.alignToCanvas('a', 'top');
  layer = studio.scene.layers[0];
  assert.ok(Math.abs((300 + layer.y * 1.5) - 300) < 1e-8);
  await studio.commands.alignToCanvas('a', 'bottom');
  layer = studio.scene.layers[0];
  assert.ok(Math.abs((300 + layer.y * 1.5) + 300 - 600) < 1e-8);
  await studio.commands.alignToCanvas('a', 'centre');
  assert.deepEqual([studio.scene.layers[0].x, studio.scene.layers[0].y], [0, 0]);
  await studio.commands.setLocked(['a'], true);
  await studio.commands.alignToCanvas('a', 'left');
  assert.equal(studio.scene.layers[0].x, 0, 'locked layers cannot be aligned');
});

test('lock state persists and stays absent for untouched layers', async () => {
  const studio = harness([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  assert.equal(studio.scene.layers[0].locked, undefined, 'locking is opt-in');
  await studio.commands.setLocked(['a'], true);
  assert.equal(studio.scene.layers.find(layer => layer.id === 'a').locked, true);
  assert.equal(studio.scene.layers.find(layer => layer.id === 'b').locked, undefined);
  await studio.commands.toggleLocked('a');
  assert.equal(studio.scene.layers.find(layer => layer.id === 'a').locked, false, 'toggle unlocks');
  assert.equal(validateScene(studio.scene).layers[0].locked, false, 'the flag survives validation');
});

test('move to folder inserts at the folder front and can be undone', async () => {
  const studio = harness([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], [{ id: 'f1', name: 'Group', order: 1 }]);
  await studio.commands.moveToFolder('a', 'f1');
  assert.ok(units(studio.scene).includes('[Group] A'), `A joined the folder (${units(studio.scene).join(' | ')})`);
  assert.equal(studio.scene.layers.find(layer => layer.id === 'a').folderId, 'f1');
  await studio.commands.moveToFolder('a', null);
  assert.equal(studio.scene.layers.find(layer => layer.id === 'a').folderId, undefined, 'leaving the folder clears membership');
  assert.ok(units(studio.scene).includes('A'));
});

test('replace image keeps identity, transform and animation', async () => {
  const studio = harness([{ id: 'a', name: 'Sky', x: 22, scale: 1.5 }], [{ id: 'f1', name: 'Group', order: 1 }]);
  studio.scene.layers[0].folderId = 'f1';
  studio.scene.tracks.push(track('t1', 'layer:a'));
  const before = structuredClone(studio.scene.layers[0]);
  await studio.commands.replaceImage('a', 'data:image/png;base64,AAAA', 320, 200);
  const layer = studio.scene.layers.find(candidate => candidate.id === 'a');
  assert.equal(layer.asset, 'data:image/png;base64,AAAA');
  assert.deepEqual([layer.width, layer.height], [320, 200], 'stored dimensions follow the new artwork');
  assert.equal(layer.name, before.name);
  assert.equal(layer.folderId, 'f1', 'folder membership is kept');
  assert.deepEqual([layer.x, layer.scale], [22, 1.5], 'the transform is kept');
  assert.equal(studio.scene.tracks[0].target, 'layer:a', 'animation still targets the layer');
});
