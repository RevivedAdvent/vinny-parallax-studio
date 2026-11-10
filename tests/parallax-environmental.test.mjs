import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createScene, validateProject } from '../src/studio/project.ts';
import { compileCamera } from '../src/camera/evaluate.ts';
import { layerCorners, projectLayers } from '../src/camera/project.ts';
import { evaluateLayerEffects, resolvedDepth, depthScaleFor, neutralWarpCorners } from '../src/camera/layer-effects.ts';
import { calibration, neutralCamera, projectPlane } from '../src/camera/virtual-projection.ts';

const RAD = Math.PI / 180;
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
const scene = () => {
  const s = createScene('Environmental', 10, 800, 600, 24);
  s.layers = [0, .5, 1].map((depth, index) => ({
    id: `l${index}`, name: `Layer ${index}`, asset: '/art.png', depth, order: index,
    x: index * 10, y: 0, scale: 1, rotation: 0, opacity: 1, width: 200, height: 200,
  }));
  return s;
};
const effect = (kind, extra = {}) => ({ id: `${kind}-1`, kind, start: 0, duration: 10, layerIds: ['l2'], ...extra });
const evaluate = (s, time) => evaluateLayerEffects(compileCamera(s).config(), time);
const poses = (s, time = 0) => {
  const core = compileCamera(s);
  return projectLayers(core.config(), core.evaluateTime(time));
};

test('wind rotates around the configured pivot and varies phase per layer', () => {
  const s = scene();
  s.layerEffects = [effect('wind', { pivotX: .5, pivotY: 1, rotation: 10, movement: 0, speed: .25, gust: 0, phase: 0, spread: 0, direction: 'right' })];
  const wind = evaluate(s, 1).l2;
  near(wind.rotation, 10, .01);
  // Centre sits above the pivot, so a clockwise rotation carries it right and slightly down.
  near(wind.x, Math.sin(10 * RAD) * 100, .02);
  near(wind.y, (Math.cos(10 * RAD) - 1) * -100, .02);
  assert.ok(wind.x > 0 && wind.y > 0, 'pivot rotation produces a real positional arc, not drift');
  assert.deepEqual([s.layers[2].x, s.layers[2].y, s.layers[2].scale], [20, 0, 1], 'Arrange transform is untouched');

  const layered = scene();
  layered.layerEffects = [effect('wind', { layerIds: ['l2', 'l1'], rotation: 8, speed: .25, gust: 0, phase: 0, spread: 90, movement: 0 })];
  const both = evaluate(layered, 1);
  assert.notEqual(both.l2.rotation, both.l1.rotation, 'spread gives each layer its own phase');
  assert.deepEqual(evaluate(layered, 1), both, 'wind is deterministic at the same timestamp');
  const zero = evaluate(s, 0).l2;
  near(zero.rotation, 0); near(zero.x, 0); near(zero.y, 0);
});

test('floating uses positional loops on each axis and repeats exactly', () => {
  for (const [axis, expectX, expectY] of [['y', 0, 20], ['x', 20, 0], ['xy', 20, 0]]) {
    const s = scene();
    s.layerEffects = [effect('float', { axis, amplitude: 20, speed: .25, phase: 0, rotation: 0 })];
    const at = evaluate(s, 1).l2;
    near(at.x, expectX, .01); near(at.y, expectY, .01);
    const nextCycle = evaluate(s, 5).l2;
    near(nextCycle.x, at.x, .01); near(nextCycle.y, at.y, .01);
    assert.deepEqual([s.layers[2].x, s.layers[2].y], [20, 0], 'Arrange position is unchanged');
  }
  const combined = scene();
  combined.layerEffects = [effect('float', { axis: 'xy', amplitude: 20, speed: .25, phase: 0 })];
  const at = evaluate(combined, .5).l2;
  near(at.x, 14.1421, .01); near(at.y, 9.1924, .01);
  assert.ok(at.x > 1 && at.y > 1, 'combined motion is elliptical, not a straight line');
  const rotated = scene();
  rotated.layerEffects = [effect('float', { axis: 'y', amplitude: 10, speed: .25, phase: 0, rotation: 2 })];
  assert.notEqual(evaluate(rotated, 1).l2.rotation, 0, 'optional secondary rotation is applied');
});

test('ambient layer loops, pulses and only wraps when art is tileable', () => {
  const oscillate = scene();
  oscillate.layerEffects = [effect('ambient', { mode: 'layer', motion: 'oscillate', direction: 'left', amplitude: 30, loop: 4, phase: 0, tileable: false })];
  near(evaluate(oscillate, 1).l2.x, -30, .01);
  near(evaluate(oscillate, 3).l2.x, 30, .01);
  near(evaluate(oscillate, 5).l2.x, -30, .01);

  const drift = scene();
  drift.layerEffects = [effect('ambient', { mode: 'layer', motion: 'drift', direction: 'right', speed: 10, tileable: false })];
  near(evaluate(drift, 3).l2.x, 30, .01);
  assert.equal(evaluate(drift, 3).l2.wrap, undefined);

  const tiled = scene();
  tiled.layerEffects = [effect('ambient', { mode: 'layer', motion: 'drift', direction: 'right', speed: 10, tileable: true })];
  const wrapped = evaluate(tiled, 3).l2;
  assert.deepEqual(wrapped.wrap, { x: 30, y: 0 });
  near(wrapped.x, 0, .01);
  assert.deepEqual(evaluate(tiled, 3).l2, wrapped, 'tile travel is deterministic');

  const pulse = scene();
  pulse.layerEffects = [effect('ambient', { mode: 'layer', motion: 'pulse', amplitude: 50, loop: 4, phase: 0 })];
  near(evaluate(pulse, 2).l2.opacity, .5, .01);
  near(evaluate(pulse, 1.5).l2.opacity, .5732, .01);
});

test('particle loops are seeded, bounded and deterministic', () => {
  const s = scene();
  s.layerEffects = [effect('ambient', { mode: 'particles', count: 12, direction: 'right', speedMin: 8, speedMax: 20, sizeMin: 4, sizeMax: 12, opacityMin: .1, opacityMax: .8, lifetime: 4, regionX: .1, regionY: .2, regionWidth: .8, regionHeight: .6, seed: 5 })];
  const first = evaluate(s, 1.7).l2.particles;
  assert.equal(first.length, 12);
  assert.deepEqual(evaluate(s, 1.7).l2.particles, first, 'identical timestamp and seed reproduce identical particles');
  assert.notDeepEqual(evaluate(s, 2.3).l2.particles, first, 'particles move over time');
  for (const particle of first) {
    assert.ok(Number.isFinite(particle.x) && Number.isFinite(particle.y));
    assert.ok(particle.opacity >= 0 && particle.opacity <= 1);
    assert.ok(particle.size >= 4 && particle.size <= 12);
  }
  const otherSeed = structuredClone(s); otherSeed.layerEffects[0].seed = 9;
  assert.notDeepEqual(evaluate(otherSeed, 1.7).l2.particles, first, 'seed changes the arrangement');
  const huge = structuredClone(s); huge.layerEffects[0].count = 500;
  assert.equal(compileCamera(huge).config().layerEffects[0].count, 80, 'particle count is bounded by validation');
  const hugeParticles = evaluate(huge, 1.7).l2.particles;
  assert.equal(hugeParticles.length, 80, 'resource use stays bounded');
});

test('shadows attach to their source, multiply opacity and let the last start win', () => {
  const s = scene();
  s.layerEffects = [effect('shadow', { angle: 0, distance: 20, amplitude: 0, opacity: .4, blur: 10, color: '#001122', speed: .2 })];
  const shadow = evaluate(s, 2).l2.shadow;
  near(shadow.x, 20); near(shadow.y, 0); near(shadow.opacity, .4);
  assert.equal(shadow.color, '#001122'); assert.equal(shadow.blur, 10);
  assert.deepEqual([s.layers[2].x, s.layers[2].scale], [20, 1], 'source artwork is not modified');

  const moved = scene();
  moved.layerEffects = [effect('shadow', { angle: 90, distance: 20, amplitude: 10, speed: .25, phase: 0 })];
  near(evaluate(moved, 1).l2.shadow.y, 30, .01);

  const layered = scene();
  layered.layerEffects = [effect('shadow', { distance: 10, angle: 0, amplitude: 0 }), { ...effect('shadow', { distance: 40, angle: 0, amplitude: 0 }), id: 'shadow-2', start: 2 }];
  near(evaluate(layered, 3).l2.shadow.x, 40, .01);
  assert.equal(evaluate(scene(), 2).l2.shadow, undefined, 'no shadow without an effect');
});

test('depth scale interpolates by resolved depth and keeps camera projection intact', () => {
  const base = scene();
  const neutral = poses(base);
  const scaled = structuredClone(base);
  scaled.depthScale = { near: 1.2, far: .9, reference: .5, strength: 1, influence: {} };
  const result = poses(scaled);
  near(result[0].scale / neutral[0].scale, .9, 1e-9);
  near(result[1].scale / neutral[1].scale, 1, 1e-9);
  near(result[2].scale / neutral[2].scale, 1.2, 1e-9);
  assert.deepEqual(result.map(pose => pose.depth), [0, .5, 1], 'depth is never rewritten');
  near(depthScaleFor(compileCamera(scaled).config(), 'l2'), 1.2, 1e-9);

  const disabled = structuredClone(scaled);
  disabled.depthScale.influence = { l2: 0 };
  near(poses(disabled)[2].scale / neutral[2].scale, 1, 1e-9);

  const identity = structuredClone(base);
  identity.depthScale = { near: 1, far: 1, reference: .5, strength: 1, influence: {} };
  assert.deepEqual(poses(identity), neutral, 'neutral depth scale is pixel-identical');

  const planed = structuredClone(base);
  planed.depthPlanes = [{ id: 'p-near', name: 'Near', depth: 1, layerIds: ['l0'] }];
  planed.depthScale = { near: 1.2, far: .9, reference: .5, strength: 1, influence: {} };
  near(resolvedDepth(compileCamera(planed).config(), 'l0'), 1);
  near(poses(planed)[0].scale / neutral[0].scale, 1.2, 1e-9);
  assert.equal(poses(planed)[0].depth, 1);
  assert.equal(poses(planed)[0].y !== undefined, true, 'projection still runs after plane resolution');
  assert.deepEqual(poses(planed).map(pose => pose.id), ['l0', 'l1', 'l2'], 'draw order is independent of plane depth');
  assert.equal(resolvedDepth(compileCamera(planed).config(), 'l1'), .5, 'unassigned layers keep stored depth');
});

test('planes validate safely and malformed planes fall back to stored depth', () => {
  const s = scene();
  s.depthPlanes = [
    { id: 'a', name: 'A', depth: 1, layerIds: ['l0', 'missing'] },
    { id: 'a', name: 'Duplicate', depth: .2, layerIds: ['l1'] },
    { id: 'b', name: '', depth: 2, layerIds: ['l1', 'l2'] },
    { id: 'bad', name: 'Bad', depth: NaN, layerIds: ['l2'] },
  ];
  const config = compileCamera(s).config();
  assert.deepEqual(config.depthPlanes, [
    { id: 'a', name: 'A', depth: 1, layerIds: ['l0'] },
    { id: 'b', name: 'Plane 3', depth: 1, layerIds: ['l1', 'l2'] },
  ]);
  near(resolvedDepth(config, 'l2'), 1);
  assert.deepEqual(config.layers.map(layer => layer.depth), [0, .5, 1], 'stored depths survive validation');
  const without = compileCamera(scene()).config();
  assert.equal(without.depthPlanes, undefined, 'projects without planes are unchanged');
});

test('warp animates from neutral, validates geometry and projects with the camera', () => {
  const neutral = neutralWarpCorners();
  const s = scene();
  const target = [{ x: -1.1, y: -1.2 }, { x: 1.2, y: -.9 }, { x: 1.1, y: 1.1 }, { x: -.9, y: 1.2 }];
  s.layerEffects = [effect('warp', { duration: 4, corners: target })];
  const start = evaluate(s, 0).l2.warp.corners;
  assert.deepEqual(start, neutral, 'warp starts unwarped');
  const midway = evaluate(s, 2).l2.warp.corners;
  near(midway[0].x, -1.05, 1e-9);
  const end = evaluate(s, 4).l2.warp.corners;
  target.forEach((corner, index) => { near(end[index].x, corner.x); near(end[index].y, corner.y); });
  const held = evaluate(s, 9).l2.warp.corners;
  assert.deepEqual(held, end, 'warp holds its endpoint');
  assert.deepEqual(poses(s, 2).map(pose => pose.x), poses(scene(), 2).map(pose => pose.x), 'warp does not move the pose');

  const camera = { ...neutralCamera(calibration(800, 600)), x: 60, y: -20 };
  const quad = layerCorners(poses(s, 2)[2], 200, 200, midway);
  const projected = projectPlane(calibration(800, 600), camera, poses(s, 2)[2].depth, quad);
  assert.ok(projected && projected.length === 4, 'warped corners project through the camera');

  const invalid = [
    [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }],
    [{ x: -1, y: -1 }, { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }],
    [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: 1, y: 1 }],
    [{ x: -1, y: -1 }, { x: 5, y: -1 }, { x: 5, y: 1 }, { x: -1, y: 1 }],
  ];
  for (const corners of invalid) {
    const copy = scene();
    copy.layerEffects = [{ ...effect('warp', {}), corners }, { ...effect('fade', {}), id: 'good', startOpacity: 1, endOpacity: 1 }];
    const config = compileCamera(copy).config();
    assert.deepEqual(config.layerEffects.map(item => item.id), ['good'], 'invalid warp geometry is dropped safely');
  }
  const neutralTarget = scene();
  neutralTarget.layerEffects = [effect('warp', { duration: 4, corners: neutral })];
  assert.deepEqual(evaluate(neutralTarget, 4).l2.warp.corners, neutral, 'neutral corners reproduce the unwarped layer');
});

test('environmental effects and depth planes roundtrip with the project', () => {
  const s = scene();
  s.depthScale = { near: 1.25, far: .85, reference: .4, strength: .8, influence: { l2: .5 } };
  s.depthPlanes = [{ id: 'mid', name: 'Midground', depth: .72, layerIds: ['l0', 'l1'] }];
  s.layerEffects = [
    effect('wind', { layerIds: ['l2'], direction: 'left', rotation: 5, spread: 60 }),
    effect('float', { axis: 'xy', amplitude: 12 }),
    effect('ambient', { mode: 'particles', motion: 'drift', direction: 'up', seed: 21, count: 8 }),
    effect('shadow', { angle: 120, distance: 30, color: '#123456' }),
    effect('warp', { corners: [{ x: -1.1, y: -1 }, { x: 1, y: -.9 }, { x: 1.05, y: 1 }, { x: -1, y: 1.1 }] }),
  ];
  const project = createProject('Environmental roundtrip'); project.scenes = [s];
  const saved = validateProject(JSON.parse(JSON.stringify(project))).scenes[0];
  assert.deepEqual(saved.depthScale, s.depthScale);
  assert.deepEqual(saved.depthPlanes, s.depthPlanes);
  assert.deepEqual(saved.layerEffects.map(item => [item.kind, item.layerIds, item.start, item.duration]),
    s.layerEffects.map(item => [item.kind, item.layerIds, item.start, item.duration]));
  assert.equal(saved.layerEffects.find(item => item.kind === 'wind').spread, 60);
  assert.equal(saved.layerEffects.find(item => item.kind === 'ambient').seed, 21);
  assert.equal(saved.layerEffects.find(item => item.kind === 'shadow').color, '#123456');
  assert.deepEqual(saved.layers.map(layer => [layer.id, layer.x, layer.scale]), s.layers.map(layer => [layer.id, layer.x, layer.scale]));

  const damaged = structuredClone(s);
  damaged.depthPlanes.push({ id: 'broken', name: 'Broken', depth: NaN, layerIds: ['l2'] });
  damaged.layerEffects.push({ id: 'broken-warp', kind: 'warp', start: 0, duration: 2, layerIds: ['l2'], corners: [{ x: 0, y: 0 }] });
  damaged.layerEffects.push({ id: 'valid-fade', kind: 'fade', start: 0, duration: 2, layerIds: ['l2'], startOpacity: 1, endOpacity: 0 });
  const damagedProject = createProject('Damaged'); damagedProject.scenes = [damaged];
  const loaded = compileCamera(validateProject(JSON.parse(JSON.stringify(damagedProject))).scenes[0]).config();
  assert.equal(loaded.depthPlanes.length, 1, 'malformed planes are dropped when the scene loads');
  assert.ok(loaded.layerEffects.some(item => item.id === 'valid-fade'), 'valid effects still load');
  assert.ok(!loaded.layerEffects.some(item => item.id === 'broken-warp'), 'malformed warp is dropped');
});
