import test from 'node:test';
import assert from 'node:assert/strict';
import { calibration, neutralCamera, planeDistance, planePoint, projectPoint, projectPlane } from '../src/camera/virtual-projection.ts';

const c = calibration(800, 600);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const projection = (camera, depth, x, y) => projectPoint(camera, planePoint(c, depth, {x, y}), 1);
const scale = (camera, depth) => (projection(camera, depth, 500, 300).x - projection(camera, depth, 400, 300).x) / 100;

test('neutral projection preserves scene coordinates at every depth', () => {
  const camera = neutralCamera(c);
  for (const depth of [0, .5, 1]) for (const point of [{x:0,y:0}, {x:400,y:300}, {x:800,y:600}, {x:850,y:-10}]) {
    const projected = projection(camera, depth, point.x, point.y);
    near(projected.x, point.x); near(projected.y, point.y);
  }
  assert.ok(planeDistance(c, 0) > planeDistance(c, 1));
});

test('physical dolly changes relative depth scale while lens zoom does not', () => {
  const camera = neutralCamera(c);
  const dolly = {...camera, z: c.focalLength * .2};
  const zoom = {...camera, focalLength: camera.focalLength * 1.5};
  assert.ok(scale(dolly, 1) > scale(dolly, 0));
  near(scale(zoom, 0), 1.5); near(scale(zoom, 1), 1.5);
  const out = {...camera, z: -c.focalLength * .2};
  assert.ok(scale(out, 1) < scale(out, 0));
});

test('pan rotation is not the same projection as truck translation', () => {
  const camera = neutralCamera(c);
  const pan = {...camera, yaw: .1};
  const truck = {...camera, x: 100};
  assert.ok(projection(pan, 1, 400, 300).x < 400);
  assert.ok(projection(truck, 1, 400, 300).x < 400);
  assert.notEqual(projection(pan, 0, 400, 300).x, projection(truck, 0, 400, 300).x);
  near(projection(pan, 0, 400, 300).x, projection(pan, 1, 400, 300).x);
  assert.notEqual(projection(truck, 0, 400, 300).x, projection(truck, 1, 400, 300).x);
});

test('pitch changes view direction and projected image planes become trapezoids', () => {
  const camera = {...neutralCamera(c), pitch: .15};
  const corners = [{x:0,y:0},{x:800,y:0},{x:800,y:600},{x:0,y:600}];
  const projected = projectPlane(c, camera, .5, corners);
  assert.ok(projected);
  assert.notEqual(projected[1].x - projected[0].x, projected[2].x - projected[3].x);
  assert.ok(projection(camera, .5, 400, 300).y < 300);
});

test('invalid and near-plane projections are rejected', () => {
  const camera = neutralCamera(c);
  assert.equal(projectPoint(camera, {x:0,y:0,z:0}, 1), null);
  assert.equal(projectPoint({...camera, yaw:NaN}, {x:0,y:0,z:1}, 1), null);
  assert.equal(projectPlane(c, {...camera, z:planeDistance(c, 1)}, 1,
    [{x:0,y:0},{x:800,y:0},{x:800,y:600},{x:0,y:600}]), null);
  const collapsed=[{x:1,y:1},{x:1,y:1},{x:1,y:1},{x:1,y:1}];
  assert.equal(projectPlane(c, camera, .5, collapsed), null);
  assert.equal(projectPlane(c, camera, .5, [{x:Infinity,y:0}, ...collapsed.slice(1)]), null);
  assert.throws(() => planeDistance(c, 2), /depth/);
});
