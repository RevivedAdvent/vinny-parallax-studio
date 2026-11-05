import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene, createProject, validateProject } from '../src/studio/project.ts';
import { compileCamera } from '../src/camera/evaluate.ts';
import { projectLayers, projectedLayerInfo } from '../src/camera/project.ts';
import { evaluateLayerEffects, parallaxFactor, neutralDelta } from '../src/camera/layer-effects.ts';

const scene = () => {
  const s = createScene('Parallax', 10, 800, 600, 24);
  s.layers = [0, .5, 1].map((depth, i) => ({ id: `l${i}`, name: `Layer ${i}`, asset: '/art.png', depth, x: i * 10, y: 0, scale: 1, rotation: 0, opacity: 1 }));
  return s;
};
const effect = (kind, extra = {}) => ({ id: `${kind}-1`, kind, start: 0, duration: 2, layerIds: ['l2'], ...extra });
const camera = (type, extra = {}) => ({ id: type, model: 2, type, start: 0, duration: 2, x: 400, y: 300, scale: 1, travel: .2, ...extra });
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
const projected = (s, t) => {
  const core = compileCamera(s), cfg = core.config(), state = core.evaluateTime(t);
  return { state, layers: projectLayers(cfg, state).map(pose => projectedLayerInfo(cfg, pose, state.virtualCamera ?? { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, focalLength: 1600, principal: { x: cfg.width / 2, y: cfg.height / 2 } })) };
};

test('depth parallax alters projected travel by depth and stays neutral by default', () => {
  const base = scene(); base.cameraMoves = [camera('truck', { x: 700 })];
  const neutral = projected(base, 0).layers.map(l => l.x), moved = projected(base, 2).layers.map(l => l.x);
  const travel = moved.map((x, i) => Math.abs(x - neutral[i]));
  assert.ok(travel[2] > travel[1] && travel[1] > travel[0], `foreground must travel most: ${travel}`);
  near(parallaxFactor(base, 'l2'), 1); near(parallaxFactor(base, 'l0'), 1);
  const explicit = structuredClone(base); explicit.parallax = { strength: 1, influence: {} };
  assert.deepEqual(projected(explicit, 2).layers.map(l => l.x), moved, 'neutral settings preserve projection');
  assert.deepEqual(base.layers.map(l => [l.x, l.y, l.scale]), scene().layers.map(l => [l.x ?? 0, l.y ?? 0, l.scale]), 'saved positions are untouched');
});

test('global strength and per-layer influence scale the depth response', () => {
  const base = scene(); base.cameraMoves = [camera('truck', { x: 700 })];
  const travel = s => Math.abs(projected(s, 2).layers[2].x - projected(s, 0).layers[2].x);
  const plain = travel(base);
  const strong = structuredClone(base); strong.parallax = { strength: 2, influence: {} };
  const flat = structuredClone(base); flat.parallax = { strength: 1, influence: { l2: 0 } };
  assert.ok(travel(strong) > plain * 1.2, 'stronger global response exaggerates travel');
  assert.ok(travel(flat) < .01, 'zero influence removes the selected layer\'s camera translation');
  const soft = structuredClone(base); soft.parallax = { strength: 1, influence: { l2: .5 } };
  assert.ok(travel(soft) > travel(flat) && travel(soft) < plain);
  near(parallaxFactor(strong, 'l2'), 2); near(parallaxFactor(flat, 'l2'), 0); near(parallaxFactor(base, 'l2'), 1);
  const exaggerated = structuredClone(base);
  exaggerated.parallax = { strength: 3, influence: { l0: 3, l1: 0, l2: 3 } };
  const poses = projectLayers(compileCamera(exaggerated).config(), compileCamera(exaggerated).evaluateTime(1.2));
  assert.deepEqual(poses.map(p => p.depth), [0, .5, 1], 'parallax never changes depth or layer order');
  assert.deepEqual(poses.map(p => p.id), ['l0', 'l1', 'l2'], 'layer order is preserved');
});

test('drift is deterministic, axis-aware and returns to zero at both ends', () => {
  const s = scene(); s.layerEffects = [effect('drift', { axis: 'xy', motion: 'sway', amplitude: 20, speed: .25, phase: 0, seed: 7 })];
  const at = t => evaluateLayerEffects(s, t, 1).l2;
  near(at(0).x, 0); near(at(0).y, 0); near(at(2).x, 0); near(at(2).y, 0);
  const first = at(1.3);
  [at(0), at(2), at(7), at(1)].forEach(() => at(1.3));
  assert.deepEqual(at(1.3), first, 'seeking does not accumulate');
  const direct = evaluateLayerEffects(s, 1.3, 1);
  assert.deepEqual(direct.l2, first);
  assert.ok(Math.abs(at(5).x) <= 20 + 1e-9);
  const horizontal = scene(); horizontal.layerEffects = [effect('drift', { axis: 'x', motion: 'noise', amplitude: 12, speed: .5, phase: 0, seed: 3 })];
  near(evaluateLayerEffects(horizontal, 1, 1).l2.y, 0);
  assert.notEqual(evaluateLayerEffects(horizontal, 1, 1).l2.x, evaluateLayerEffects(horizontal, 1.4, 1).l2.x);
  const seeded = scene(); seeded.layerEffects = [{ ...effect('drift', { axis: 'x', motion: 'noise', amplitude: 12, speed: .5, phase: 0, seed: 4 }) }];
  assert.notEqual(evaluateLayerEffects(seeded, 1, 1).l2.x, evaluateLayerEffects(horizontal, 1, 1).l2.x);
  const ramped = scene(); ramped.layerEffects = [effect('drift', { axis: 'x', motion: 'sway', amplitude: 10, speed: .5, phase: 0, seed: 1 })];
  assert.ok(Math.abs(evaluateLayerEffects(ramped, 1.99, 1).l2.x) < 1e-3, 'no jump when the effect ends');
});

test('scale and rotation touch only the selected layer and keep Arrange values', () => {
  const s = scene(); s.layerEffects = [effect('transform', { startScale: 1, endScale: 1.4, startRotation: 0, endRotation: 12 })];
  const at = t => evaluateLayerEffects(s, t, 1);
  assert.deepEqual(at(0).l2, { ...neutralDelta(), scale: 1, rotation: 0 });
  near(at(1).l2.scale, 1.2); near(at(1).l2.rotation, 6);
  near(at(2).l2.scale, 1.4); near(at(9).l2.scale, 1.4, 1e-9);
  assert.deepEqual(at(1).l0, neutralDelta());
  assert.deepEqual(s.layers[2], { id: 'l2', name: 'Layer 2', asset: '/art.png', depth: 1, x: 20, y: 0, scale: 1, rotation: 0, opacity: 1 });
  const { state } = projected(s, 2); near(state.compositeCamera.x, 0); assert.equal(state.virtualCamera, undefined);
});

test('framing enters from each side, affects selected layers only and repeats', () => {
  const directionOffset = (direction, start) => {
    const s = scene(); s.layerEffects = [effect('framing', { direction, startOffset: start, endOffset: 0, repeat: 1 })];
    return evaluateLayerEffects(s, 0, 1).l2;
  };
  near(directionOffset('left', 110).x, -880); near(directionOffset('right', 110).x, 880);
  near(directionOffset('top', 110).y, -660); near(directionOffset('bottom', 110).y, 660);
  const s = scene(); s.layerEffects = [effect('framing', { direction: 'left', startOffset: 110, endOffset: 0, repeat: 2 })];
  near(evaluateLayerEffects(s, 1, 1).l2.x, 0, 1e-9);
  near(evaluateLayerEffects(s, 1.5, 1).l2.x, -440);
  near(evaluateLayerEffects(s, 2, 1).l2.x, -880);
  assert.deepEqual(evaluateLayerEffects(s, 1, 1).l0, neutralDelta());
  const { state } = projected(s, 1); near(state.compositeCamera.x, 0); near(state.compositeCamera.scale, 1);
});

test('fade multiplies the Arrange opacity and leaves other layers alone', () => {
  const s = scene(); s.layers[2].opacity = .6; s.layers[2].x = 0;
  s.layerEffects = [effect('fade', { startOpacity: 0, endOpacity: 1 })];
  const at = t => evaluateLayerEffects(s, t, 1).l2.opacity;
  near(at(0), 0); near(at(1), .5); near(at(2), 1); near(at(4), 1, 1e-9);
  const poses = t => { const core = compileCamera(s), cfg = core.config(), state = core.evaluateTime(t); return projectLayers(cfg, state); };
  near(poses(0)[2].opacity, 0); near(poses(2)[2].opacity, .6);
  near(poses(1)[0].opacity, 1);
  const faded = scene(); faded.layers[2].opacity = .5;
  faded.layerEffects = [effect('fade', { startOpacity: .5, endOpacity: .5 })];
  near(evaluateLayerEffects(faded, 1, 1).l2.opacity, .5);
  const double = scene(); double.layerEffects = [effect('fade', { startOpacity: 1, endOpacity: .5 }), { ...effect('fade', { startOpacity: 1, endOpacity: .5 }), id: 'fade-2' }];
  near(evaluateLayerEffects(double, 2, 1).l2.opacity, .25, 1e-6);
  near(evaluateLayerEffects(double, 2, 0).l2.opacity, 1);
});

test('wipe and radial reveals expose mask state for only the selected layer', () => {
  const s = scene(); s.layerEffects = [effect('reveal', { mask: 'wipe', direction: 'left', startCoverage: 0, endCoverage: 1, softness: .4 })];
  const core = compileCamera(s), cfg = core.config();
  const at = t => core.evaluateTime(t);
  near(at(0).layerMasks.l2.coverage, 0); near(at(1).layerMasks.l2.coverage, .5); near(at(2).layerMasks.l2.coverage, 1);
  assert.equal(at(1).layerMasks.l0, undefined); assert.equal(at(1).layerMasks.l2.direction, 'left');
  assert.equal(at(1).layerMasks.l2.kind, 'wipe');
  const radial = scene(); radial.layerEffects = [effect('reveal', { mask: 'radial', originX: .25, originY: .75, startCoverage: .2, endCoverage: .8, softness: 0 })];
  const mask = radial && compileCamera(radial).evaluateTime(1).layerMasks.l2;
  assert.equal(mask.kind, 'radial'); near(mask.originX, .25); near(mask.originY, .75); near(mask.coverage, .5); near(mask.softness, 0);
  radial.layerEffects.push({ ...radial.layerEffects[0], id: 'later', start: 1, startCoverage: .9, endCoverage: .9 });
  near(compileCamera(radial).evaluateTime(2).layerMasks.l2.coverage, .9, 1e-9);
  radial.layerEffects = []; assert.equal(compileCamera(radial).evaluateTime(2).layerMasks, undefined, 'deleting effects removes mask state');
});

test('layer effects compose with camera moves and persist through project round trips', () => {
  const s = scene(); s.layers[2].x = 0;
  s.cameraMoves = [{ id: 'old', type: 'pan', start: 0, duration: 2, x: 600, y: 300, scale: 1 }, camera('push', { scale: 1.2 })];
  s.parallax = { strength: 1.5, influence: { l2: 1.2 } };
  s.layerEffects = [effect('fade', { startOpacity: 0, endOpacity: 1 }), effect('drift', { id: 'd2', axis: 'x', motion: 'sway', amplitude: 8, speed: .3, phase: 0, seed: 2 })];
  const project = createProject('Parallax round trip'); project.scenes = [s];
  const restored = validateProject(JSON.parse(JSON.stringify(project))).scenes[0];
  assert.deepEqual(restored.parallax, s.parallax);
  assert.deepEqual(restored.layerEffects, s.layerEffects);
  const state = compileCamera(restored).evaluateTime(2);
  near(state.compositeCamera.x, 200); assert.ok(state.virtualCamera.z > 0);
  near(state.layers.l2.opacity, 1);
  assert.equal(state.layerMasks, undefined);
});

test('validation drops missing layers and malformed effects without breaking loading', () => {
  const s = scene(); s.layerEffects = [effect('drift', { amplitude: 5, speed: 1, motion: 'sway', axis: 'x', phase: 0, seed: 1 }), { ...effect('fade', {}), id: 'gone', layerIds: ['missing'] }];
  s.parallax = { strength: 1.2, influence: { missing: 2, l0: 1.5 } };
  const clean = compileCamera(s).config();
  assert.equal(clean.layerEffects.length, 1); assert.deepEqual(clean.parallax.influence, { l0: 1.5 });
  const invalid = [
    { ...effect('drift', {}), amplitude: NaN, speed: 1, motion: 'sway', axis: 'x', phase: 0, seed: 1 },
    { ...effect('reveal', {}), mask: 'star', direction: 'left', originX: .5, originY: .5, startCoverage: 0, endCoverage: 1, softness: .2 },
    { ...effect('framing', {}), direction: 'diagonal', startOffset: 0, endOffset: 0, repeat: 1 },
    { ...effect('transform', {}), startScale: NaN, endScale: 1, startRotation: 0, endRotation: 0 },
    { ...effect('fade', {}), startOpacity: NaN, endOpacity: 0 },
  ];
  for (const bad of invalid) {
    const copy = scene(); copy.layerEffects = [bad, { ...effect('fade', {}), id: 'good', startOpacity: 1, endOpacity: 0 }];
    const parsed = compileCamera(copy).config();
    assert.deepEqual(parsed.layerEffects.map(e => e.id), ['good'], `${bad.kind} should be dropped without breaking the project`);
  }
  const brokenSettings = scene(); brokenSettings.parallax = { strength: NaN, influence: { l0: 1 } };
  assert.equal(compileCamera(brokenSettings).config().parallax, undefined);
});
