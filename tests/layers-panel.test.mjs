import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene } from '../src/studio/project.ts';
import { validateScene } from '../src/camera/validate.ts';
import { stackUnits, reindexStack } from '../src/studio/layers-panel.ts';

const scene = (layers, folders) => {
  const config = createScene('Layers', 4, 800, 600, 24);
  config.layers = layers.map((layer, index) => ({ id: layer.id, name: layer.id, asset: '/art.png', depth: 0, ...layer, order: layer.order ?? index }));
  if (folders) config.folders = folders;
  return config;
};

const unitNames = units => units.map(unit => unit.kind === 'folder' ? `[${unit.folder.name}] ${unit.layers.map(layer => layer.name).join(',')}` : unit.layer.name);

test('folders own a contiguous block of the stack', () => {
  const config = scene([
    { id: 'back' }, { id: 'mid', folderId: 'f1' }, { id: 'front' },
  ], [{ id: 'f1', name: 'Mid', order: 2000 }]);
  config.layers = [
    { id: 'back', name: 'back', asset: '/a.png', depth: 0, order: 1000 },
    { id: 'mid', name: 'mid', asset: '/a.png', depth: 0, order: 1999, folderId: 'f1' },
    { id: 'front', name: 'front', asset: '/a.png', depth: 0, order: 3000 },
  ];
  assert.deepEqual(unitNames(stackUnits(config)), ['front', '[Mid] mid', 'back']);
});

test('missing folders fall back to a top-level row', () => {
  const config = scene([{ id: 'a', folderId: 'gone' }, { id: 'b' }]);
  assert.deepEqual(unitNames(stackUnits(config)), ['b', 'a']);
});

test('reindexing keeps the folder block between its neighbours', () => {
  const config = scene([], []);
  config.folders = [{ id: 'f1', name: 'Group', order: 0 }];
  config.layers = [
    { id: 'a', name: 'a', asset: '/a.png', depth: 0, order: 0 },
    { id: 'b', name: 'b', asset: '/a.png', depth: 0, order: 1 },
    { id: 'c', name: 'c', asset: '/a.png', depth: 0, order: 2 },
  ];
  const units = [
    { kind: 'layer', layer: config.layers[2] },
    { kind: 'folder', folder: config.folders[0], layers: [config.layers[0], config.layers[1]] },
  ];
  reindexStack(config, units);
  assert.deepEqual(stackUnits(config).map(unit => unit.kind), ['layer', 'folder'], 'front layer stays in front of the folder');
  assert.equal(config.folders[0].order, 1000);
  assert.equal(config.layers[2].order, 2000, 'top-level layer keeps a clear gap above the folder');
  assert.ok(config.layers[0].order < config.layers[2].order && config.layers[0].order > config.layers[1].order);
  assert.equal(config.layers[0].folderId, 'f1');
  assert.equal(config.layers[2].folderId, undefined, 'top-level layers have no folder');
  assert.deepEqual(config.layers.map(layer => layer.order).sort((a, b) => b - a), [2000, 999, 998]);
});

test('validation normalises folders and drops dangling membership', () => {
  const config = scene([{ id: 'a', folderId: 'missing' }]);
  config.folders = [
    { id: 'f1', name: '  ', order: Number.NaN },
    { id: 'f1', name: 'Duplicate' },
  ];
  assert.throws(() => validateScene(config), /Folder ids must be nonempty and unique/);

  const good = scene([{ id: 'a', folderId: 'f1' }, { id: 'b', folderId: 'nope' }]);
  good.folders = [{ id: 'f1', name: '  ', order: Number.NaN }];
  const valid = validateScene(good);
  assert.equal(valid.folders[0].name, 'Folder 1', 'blank folder names are replaced');
  assert.equal(valid.folders[0].order, 0, 'missing folder order is assigned');
  assert.equal(valid.layers.find(layer => layer.id === 'a').folderId, 'f1');
  assert.equal(valid.layers.find(layer => layer.id === 'b').folderId, undefined, 'unknown folder membership is removed');
  assert.equal(scene([]).folders, undefined, 'projects without folders stay unchanged');
  assert.equal(validateScene(scene([])).folders, undefined, 'folders are optional');
});
