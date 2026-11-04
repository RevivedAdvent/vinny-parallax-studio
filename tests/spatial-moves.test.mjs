import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene, validateProject, createProject } from '../src/studio/project.ts';
import { compileCamera } from '../src/camera/evaluate.ts';
import { projectLayers } from '../src/camera/project.ts';

// Convention (shared with Pan/Tilt): x/y is the viewpoint destination, so artwork moves the opposite way.
// Background screen position at progress p with target T on a 400-pixel neutral center: 400 - (T - 400) * p.
const make = () => {
 const s = createScene('Spatial', 10, 800, 600, 24);
 s.layers = [{ id: 'bg', name: 'Background', asset: '/bg.png', depth: 0 }, { id: 'fg', name: 'Foreground', asset: '/fg.png', depth: 1, x: 100, y: 0 }];
 return s;
};
const move = (type, options = {}) => ({ id: type, type, start: 2, duration: 4, x: 400, y: 300, scale: 1, ...options });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const pose = (s, t) => { const core = compileCamera(s); return projectLayers(core.config(), core.evaluateTime(t)); };

test('truck slides the viewpoint horizontally, constant speed, and holds at the destination', () => {
 const s = make(); s.cameraMoves = [move('truck', { x: 200 })];
 near(pose(s, 2)[0].x, 400);      // before the move starts: rest
 near(pose(s, 3)[0].x, 450);      // quarter way through: 400 + 200 * .25
 near(pose(s, 4)[0].x, 500);      // halfway: constant speed
 near(pose(s, 6)[0].x, 600);      // destination reached
 near(pose(s, 9)[0].x, 600);      // holds after the move
 near(pose(s, 6)[0].y, 300);      // no vertical movement
});

test('pedestal moves vertically, keeps framing level, and does not rotate', () => {
 const s = make(); s.cameraMoves = [move('pedestal', { y: 150 })];
 near(pose(s, 6)[0].y, 600 - 150);
 near(pose(s, 6)[0].x, 400);
 pose(s, 6).forEach(p => near(p.roll, 0));
});

test('diagonal drift moves both axes in one continuous move', () => {
 const s = make(); s.cameraMoves = [move('diagonal', { x: 200, y: 450 })];
 near(pose(s, 4)[0].x, 500); near(pose(s, 4)[0].y, 600 - 375);
 near(pose(s, 6)[0].x, 600); near(pose(s, 6)[0].y, 150);
});

test('crane rises and descends vertically with no horizontal shift', () => {
 const up = make(); up.cameraMoves = [move('crane', { y: 100 })];
 near(pose(up, 6)[0].y, 500); near(pose(up, 6)[0].x, 400);
 const down = make(); down.cameraMoves = [move('crane', { y: 500 })];
 near(pose(down, 6)[0].y, 100);
});

test('tracking blends toward the requested screen point and holds it at the end', () => {
 const s = make(); s.cameraMoves = [move('tracking', { layerId: 'fg', x: 400, y: 300 })];
 const fg = t => pose(s, t)[1];
 const x3 = fg(3).x, x4 = fg(4).x, x5 = fg(5).x;
 assert.ok(x3 > 500 && x4 > x3 && x5 > x4 || (x3 < 500 && x4 < x3 && x5 < x4) || x3 !== x4, 'target moves monotonically');
 near(fg(6).x, 400); near(fg(6).y, 300);
 near(fg(9).x, 400); near(fg(9).y, 300);
});

test('tracking a stationary background target lands it on the requested point', () => {
 const s = make(); s.cameraMoves = [move('tracking', { layerId: 'bg', x: 300, y: 300 })];
 near(pose(s, 6)[0].x, 300); near(pose(s, 6)[0].y, 300);
});

test('reveal moves only the selected foreground layers', () => {
 const s = make(); s.cameraMoves = [move('reveal', { layerIds: ['fg'], offsetX: 200, offsetY: -50 })];
 near(pose(s, 2)[1].x, 500); near(pose(s, 2)[0].x, 400);
 near(pose(s, 4)[1].x, 600); near(pose(s, 4)[1].y, 300 - 25 - 0);
 near(pose(s, 6)[1].x, 700); near(pose(s, 6)[1].y, 300 - 50);
 near(pose(s, 6)[0].x, 400); near(pose(s, 6)[0].y, 300);
});

test('reveal on the background moves only that layer', () => {
 const s = make(); s.cameraMoves = [move('reveal', { layerIds: ['bg'], offsetX: 40, offsetY: 0 })];
 near(pose(s, 6)[0].x, 440); near(pose(s, 6)[1].x, 500);
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
 assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))).scenes[0].cameraMoves, s.cameraMoves);
});

test('existing pan still works and legacy scenes without moves are unchanged', () => {
 const s = make(); s.cameraMoves = [move('pan', { x: 200 })]; near(pose(s, 6)[0].x, 600);
 const legacy = make(); legacy.cameraMoves = undefined; near(pose(legacy, 6)[0].x, 400);
});
