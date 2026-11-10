import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene, createProject, validateProject } from '../src/studio/project.ts';
import { compileCamera } from '../src/camera/evaluate.ts';
import { projectLayers, projectLayerPoint } from '../src/camera/project.ts';
import { parallaxFactor, resolvedDepth, depthScaleFor } from '../src/camera/layer-effects.ts';
import { calibration, compensatedPoint, neutralCamera, planePoint, projectPoint } from '../src/camera/virtual-projection.ts';

const make = () => {
  const s = createScene('Unified', 10, 800, 600, 24);
  s.layers = [0, .5, 1].map((depth, index) => ({ id: `l${index}`, name: `Layer ${index}`, asset: '/art.png', depth }));
  return s;
};
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test('one virtual camera is always present and is the only camera transform', () => {
  const c = calibration(800, 600);
  const state = compileCamera(make()).evaluateTime(0);
  assert.deepEqual(state.virtualCamera, neutralCamera(c));
  assert.equal('compositeCamera' in state, false, 'the legacy composite camera is gone');

  const s = make();
  s.cameraMoves = [{ id: 'legacy-pan', type: 'pan', start: 0, duration: 2, x: 600, y: 300, scale: 1 }];
  const cfg = compileCamera(s).config();
  assert.equal(cfg.cameraMoves[0].model, 2);
  assert.equal(cfg.cameraMoves[0].legacyModel, 1);
  const moved = compileCamera(cfg).evaluateTime(2);
  assert.ok(moved.virtualCamera.yaw > 0);
  assert.equal('compositeCamera' in moved, false);
});

test('project loading migrates legacy moves once and preserves their authored fields', () => {
  const s = make();
  s.cameraMoves = [
    { id: 'old-push', type: 'push', start: 0, duration: 2, x: 600, y: 300, scale: 2 },
    { id: 'new-pan', model: 2, type: 'pan', start: 2, duration: 2, x: 500, y: 300, scale: 1 },
  ];
  const project = createProject('Migration'); project.scenes = [s];
  const saved = validateProject(JSON.parse(JSON.stringify(project))).scenes[0];
  assert.equal(saved.cameraMoves[0].model, 2);
  assert.equal(saved.cameraMoves[0].legacyModel, 1);
  assert.equal(saved.cameraMoves[0].type, 'push');
  assert.equal(saved.cameraMoves[0].x, 600);
  assert.equal(saved.cameraMoves[0].duration, 2);
  assert.ok(saved.cameraMoves[0].travel > 0);
  assert.deepEqual(saved.cameraMoves[1], s.cameraMoves[1], 'already-virtual moves are not reinterpreted');
  assert.equal(saved.layers[0].depth, 0, 'migration never rewrites layer depth');
});

test('camera state does not leak into local layer poses', () => {
  const s = make();
  const core = compileCamera(s);
  const state = core.evaluateTime(0);
  const local = projectLayers(core.config(), state);
  const moved = { ...state, virtualCamera: { ...state.virtualCamera, x: 300, y: -120, z: 400, yaw: .2, pitch: -.1, roll: .05 } };
  assert.deepEqual(projectLayers(core.config(), moved), local, 'pose construction is camera-independent');
});

test('depth parallax uses world-space compensation with the shared camera', () => {
  const s = make();
  s.parallax = { strength: 1.4, influence: { l1: .5 } };
  const core = compileCamera(s), cfg = core.config(), state = core.evaluateTime(0);
  const pose = projectLayers(cfg, state)[1];
  const camera = { ...state.virtualCamera, x: 120, y: -40, z: 200, yaw: .06, pitch: -.03, roll: .02 };
  const c = calibration(800, 600), point = { x: 520, y: 340 };
  const response = parallaxFactor(cfg, 'l1');
  near(response, .7);
  const expected = projectPoint(camera, compensatedPoint(planePoint(c, pose.depth, point), camera, response), c.focalLength * .1);
  const actual = projectLayerPoint(cfg, camera, pose, point);
  assert.ok(actual && expected);
  near(actual.x, expected.x); near(actual.y, expected.y);
  const clamped = make(); clamped.parallax = { strength: 3, influence: { l1: 2 } };
  near(parallaxFactor(compileCamera(clamped).config(), 'l1'), 3, 1e-12);
});

test('depth parallax changes projection only, never camera, depth planes or stored transforms', () => {
  const base = make();
  base.cameraMoves = [{ id: 'truck', model: 2, type: 'truck', start: 0, duration: 2, x: 600, y: 300, scale: 1 }];
  const raised = structuredClone(base);
  raised.parallax = { strength: 2.5, influence: { l0: 0, l1: .4, l2: 1.3 } };
  const a = compileCamera(base).evaluateTime(2), b = compileCamera(raised).evaluateTime(2);
  assert.deepEqual(b.virtualCamera, a.virtualCamera, 'the shared camera is untouched');
  assert.deepEqual(b.layers, a.layers, 'local layer transforms are untouched');
  const posesA = projectLayers(compileCamera(base).config(), a), posesB = projectLayers(compileCamera(raised).config(), b);
  assert.deepEqual(posesB.map(pose => [pose.depth, pose.x, pose.y, pose.scale]), posesA.map(pose => [pose.depth, pose.x, pose.y, pose.scale]));
  assert.notDeepEqual(posesB.map(pose => projectLayerPoint(compileCamera(raised).config(), b.virtualCamera, pose, { x: pose.x, y: pose.y })),
    posesA.map(pose => projectLayerPoint(compileCamera(base).config(), a.virtualCamera, pose, { x: pose.x, y: pose.y })),
    'only the projected result changes');
});

test('depth planes supply one effective depth without rewriting stored depth or order', () => {
  const s = make();
  s.depthPlanes = [{ id: 'near', name: 'Near group', depth: 1, layerIds: ['l0'] }];
  const cfg = compileCamera(s).config();
  assert.deepEqual(cfg.depthPlanes[0].layerIds, ['l0']);
  assert.equal(cfg.layers[0].depth, 0, 'stored depth is preserved');
  near(resolvedDepth(cfg, 'l0'), 1);
  assert.equal(projectLayers(cfg, compileCamera(cfg).evaluateTime(0))[0].depth, 1);
  assert.deepEqual(projectLayers(cfg, compileCamera(cfg).evaluateTime(0)).map(pose => pose.id), ['l0', 'l1', 'l2']);

  const unassigned = structuredClone(cfg); unassigned.depthPlanes = undefined;
  near(resolvedDepth(unassigned, 'l0'), 0, 1e-12);
});

test('depth scale is neutral at its reference depth and follows effective depth', () => {
  const s = make();
  s.depthScale = { near: 1.4, far: .8, reference: .5, strength: 1, influence: {} };
  const cfg = compileCamera(s).config();
  near(depthScaleFor(cfg, 'l1'), 1);
  near(depthScaleFor(cfg, 'l0'), .8);
  near(depthScaleFor(cfg, 'l2'), 1.4);

  s.depthPlanes = [{ id: 'far', name: 'Far group', depth: 0, layerIds: ['l2'] }];
  const planed = compileCamera(s).config();
  near(depthScaleFor(planed, 'l2'), .8, 1e-12);
});
