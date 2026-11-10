import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene, validateProject, createProject } from '../src/studio/project.ts';
import { compileCamera } from '../src/camera/evaluate.ts';
import { projectLayers, projectedLayerInfo } from '../src/camera/project.ts';

// Spatial moves drive the one canonical virtual camera. x/y is the viewpoint
// destination, so artwork moves the opposite way and depth changes the amount.
const make = () => {
 const s = createScene('Spatial', 10, 800, 600, 24);
 s.layers = [{ id: 'bg', name: 'Background', asset: '/bg.png', depth: 0 }, { id: 'fg', name: 'Foreground', asset: '/fg.png', depth: 1, x: 100, y: 0 }];
 return s;
};
const move = (type, options = {}) => ({ id: type, type, start: 2, duration: 4, x: 400, y: 300, scale: 1, ...options });
const near = (a, b, tol = 1e-8) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
const view = (s, t) => {
 const core = compileCamera(s), cfg = core.config(), state = core.evaluateTime(t);
 return { state, layers: projectLayers(cfg, state).map(pose => projectedLayerInfo(cfg, pose, state.virtualCamera)) };
};

test('truck slides the viewpoint horizontally, constant speed, and holds at the destination', () => {
 const s = make(); s.cameraMoves = [move('truck', { x: 200 })];
 near(view(s, 1).state.virtualCamera.x, 0);
 near(view(s, 3).state.virtualCamera.x, -50);
 near(view(s, 4).state.virtualCamera.x, -100);
 near(view(s, 6).state.virtualCamera.x, -200);
 near(view(s, 9).state.virtualCamera.x, -200, 1e-9);
 near(view(s, 6).state.virtualCamera.y, 0);
 assert.ok(view(s, 6).layers[0].x > 400, 'camera moving left shifts the background right');
 assert.ok(view(s, 6).layers[1].x > view(s, 6).layers[0].x, 'the nearer layer responds more strongly');
});

test('pedestal moves vertically, keeps framing level, and does not rotate', () => {
 const s = make(); s.cameraMoves = [move('pedestal', { y: 150 })];
 const end = view(s, 6);
 near(end.state.virtualCamera.y, -150);
 near(end.state.virtualCamera.roll, 0);
 near(end.state.virtualCamera.x, 0);
 near(end.layers[0].x, 400);
 assert.ok(end.layers[0].y > 300, 'camera moving up shifts the artwork down');
 end.layers.forEach(p => near(p.roll, 0));
});

test('diagonal drift moves both axes in one continuous move', () => {
 const s = make(); s.cameraMoves = [move('diagonal', { x: 200, y: 450 })];
 const mid = view(s, 4), end = view(s, 6);
 near(mid.state.virtualCamera.x, -100); near(mid.state.virtualCamera.y, 75);
 near(end.state.virtualCamera.x, -200); near(end.state.virtualCamera.y, 150);
 assert.ok(mid.layers[0].x > 400 && mid.layers[0].y < 300);
 assert.ok(end.layers[0].x > mid.layers[0].x && end.layers[0].y < mid.layers[0].y);
});

test('crane rises and descends vertically with no horizontal shift', () => {
 const up = make(); up.cameraMoves = [move('crane', { y: 100 })];
 const raised = view(up, 6);
 near(raised.state.virtualCamera.x, 0); near(raised.state.virtualCamera.y, -200);
 assert.ok(raised.state.virtualCamera.z > 0, 'the crane arcs forward');
 assert.notEqual(raised.layers[0].y, 300,'the crane changes the framing');
 const down = make(); down.cameraMoves = [move('crane', { y: 500 })];
 const lowered = view(down, 6);
 near(lowered.state.virtualCamera.x, 0); near(lowered.state.virtualCamera.y, 200);
 assert.notEqual(lowered.layers[0].y, 300,'the downward crane changes the framing');
});

test('tracking blends toward the requested screen point and holds it at the end', () => {
 const s = make(); s.cameraMoves = [move('tracking', { layerId: 'fg', x: 400, y: 300 })];
 const fg = t => view(s, t).layers[1];
 const x3 = fg(3).x, x4 = fg(4).x, x5 = fg(5).x;
 assert.ok(x4 < x3 && x5 < x4, 'target moves monotonically toward the requested point');
 near(fg(6).x, 400); near(fg(6).y, 300);
 near(fg(9).x, 400); near(fg(9).y, 300);
});

test('tracking a stationary background target lands it on the requested point', () => {
 const s = make(); s.cameraMoves = [move('tracking', { layerId: 'bg', x: 300, y: 300 })];
 near(view(s, 6).layers[0].x, 300); near(view(s, 6).layers[0].y, 300);
});

test('reveal moves only the selected foreground layers', () => {
 const s = make(); s.cameraMoves = [move('reveal', { layerIds: ['fg'], offsetX: 200, offsetY: -50 })];
 near(view(s, 2).layers[1].x, 500); near(view(s, 2).layers[0].x, 400);
 near(view(s, 4).layers[1].x, 600); near(view(s, 4).layers[1].y, 275);
 near(view(s, 6).layers[1].x, 700); near(view(s, 6).layers[1].y, 250);
 near(view(s, 6).layers[0].x, 400); near(view(s, 6).layers[0].y, 300);
});

test('reveal on the background moves only that layer', () => {
 const s = make(); s.cameraMoves = [move('reveal', { layerIds: ['bg'], offsetX: 40, offsetY: 0 })];
 near(view(s, 6).layers[0].x, 440); near(view(s, 6).layers[1].x, 500);
});

test('every new move is deterministic when seeking to arbitrary times', () => {
 const s = make();
 s.cameraMoves = [move('truck', { x: 200 }), move('reveal', { id: 'r', start: 0, duration: 2, layerIds: ['fg'], offsetX: 50, offsetY: 0 }), move('tracking', { id: 't', start: 6, duration: 2, layerId: 'fg', x: 400, y: 300 })];
 const core = compileCamera(s);
 const snap = core.evaluateTime(3.4);
 for (const t of [0, 9, 1, 7, 0.5]) core.evaluateTime(t);
 assert.deepEqual(core.evaluateTime(3.4), snap);
});

test('validation rejects invalid spatial moves and project round trips', () => {
 const bad = [m => { m.type = 'tracking'; m.layerId = 'missing'; }, m => { m.type = 'reveal'; m.layerIds = []; }, m => { m.type = 'reveal'; m.layerIds = ['nope']; }, m => { m.type = 'reveal'; m.layerIds = ['fg', 'fg']; }];
 for (const change of bad) {
  const s = make(); s.cameraMoves = [move('truck')]; change(s.cameraMoves[0]);
  assert.throws(() => compileCamera(s));
 }
 const s = make(); s.cameraMoves = [move('tracking', { layerId: 'fg' }), move('reveal', { id: 'r', start: 0, duration: 1, layerIds: ['bg'], offsetX: 10, offsetY: 0 })];
 const p = createProject('Spatial'); p.scenes = [s];
 const restored = validateProject(JSON.parse(JSON.stringify(p))).scenes[0];
 assert.equal(restored.cameraMoves.length, 2);
 assert.deepEqual(restored.cameraMoves.map(m => [m.id, m.type, m.model, m.legacyModel, m.layerId, m.layerIds]), s.cameraMoves.map(m => [m.id, m.type, 2, 1, m.layerId, m.layerIds]));
});

test('existing pan still works and legacy scenes without moves are unchanged', () => {
 const s = make(); s.cameraMoves = [move('pan', { x: 200 })];
 assert.ok(view(s, 6).state.virtualCamera.yaw < 0, 'pan rotates the shared camera toward the destination');
 assert.ok(view(s, 6).layers[0].x > 400);
 const legacy = make(); legacy.cameraMoves = undefined;
 near(view(legacy, 6).layers[0].x, 400);
 near(view(legacy, 6).layers[0].y, 300);
 assert.equal(legacy.cameraMoves, undefined, 'legacy scenes remain unchanged');
});
