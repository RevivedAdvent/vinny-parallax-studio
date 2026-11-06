import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene } from '../src/studio/project.ts';
import { validateScene } from '../src/camera/validate.ts';
import {
  atmosphereDescriptions, atmosphereGroups, atmosphereNames, atmosphereWindow,
  evaluateAtmosphere,
} from '../src/camera/atmosphere.ts';

const kinds = Object.keys(atmosphereNames);
const layerScene = () => {
  const scene = createScene('Atmosphere', 10, 800, 600, 24);
  scene.layers = [
    { id: 'far', name: 'Far background', asset: '/art.png', depth: 0, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    { id: 'mid', name: 'Midground', asset: '/art.png', depth: .5, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    { id: 'near', name: 'Foreground', asset: '/art.png', depth: 1, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
  ];
  return scene;
};
const authored = (kind, extra = {}) => {
  const scene = layerScene();
  scene.atmosphere = [{ id: `effect-${kind}`, kind, start: 1, duration: 4, ...extra }];
  return validateScene(scene);
};
const evaluated = (kind, seconds = 2, extra = {}) => evaluateAtmosphere(authored(kind, extra), seconds, 1);

test('the catalogue exposes all fourteen effects with grouping and descriptions', () => {
  assert.equal(kinds.length, 14);
  for (const kind of kinds) {
    assert.equal(typeof atmosphereNames[kind], 'string');
    assert.ok(atmosphereDescriptions[kind].length > 20);
    assert.ok(['Atmosphere', 'Particles', 'Weather', 'Lighting'].includes(atmosphereGroups[kind]));
  }
});

test('every effect validates and evaluates deterministically without mutating the scene', () => {
  for (const kind of kinds) {
    const scene = authored(kind, ['foliage', 'clouds', 'defocus'].includes(kind) ? { layerIds: ['near'] } : {});
    const effect = scene.atmosphere[0];
    assert.ok(effect, `${kind} should survive validation`);
    assert.ok(effect.start >= 0 && effect.start + effect.duration <= 10 + 1e-9, `${kind} stays inside the scene`);
    const snapshot = structuredClone(scene);
    const first = evaluateAtmosphere(scene, 2.5, 1);
    const second = evaluateAtmosphere(scene, 2.5, 1);
    assert.deepEqual(first, second, `${kind} is seek-stable`);
    assert.deepEqual(scene, snapshot, `${kind} does not mutate the project`);
    for (const id of ['far', 'mid', 'near']) assert.ok(first.layers[id], `${kind} keeps neutral layer entries`);
    assert.ok(first.sceneBrightness > .2 && first.sceneBrightness <= 2.2, `${kind} keeps scene brightness bounded`);
    assert.ok(atmosphereWindow(scene, effect).total === 10);
  }
});

test('fog, rays and waterfall produce the expected declarative overlays', () => {
  const fog = evaluated('fog').overlays.find(overlay => overlay.type === 'fog');
  assert.ok(fog && fog.type === 'fog');
  assert.equal(fog.bands.length, 2);
  assert.ok(fog.bands.every(band => band.alpha > 0 && band.alpha <= .9 && band.width > 0 && band.height > 0));
  const rays = evaluated('rays', 2, { count: 6 }).overlays.find(overlay => overlay.type === 'rays');
  assert.ok(rays && rays.type === 'rays');
  assert.equal(rays.rays.length, 6);
  assert.ok(rays.rays.every(ray => ray.alpha >= 0 && ray.length > 0 && Number.isFinite(ray.angle)));
  const waterfall = evaluated('waterfall');
  assert.ok(waterfall.overlays.some(overlay => overlay.type === 'particles' && overlay.variant === 'mist'));
  assert.ok(waterfall.overlays.some(overlay => overlay.type === 'ripples'));
});

test('particle fields are seeded, bounded and independent of evaluation order', () => {
  const rain = authored('rain', { count: 100000, speed: 900 });
  assert.equal(rain.atmosphere[0].count, 160, 'particle count is capped for performance');
  const forward = [1.1, 3.4, 2.2].map(time => evaluateAtmosphere(rain, time));
  const backward = [2.2, 3.4, 1.1].map(time => evaluateAtmosphere(rain, time)).reverse();
  assert.deepEqual(forward, backward, 'order of seeks cannot change particles');
  const overlay = forward[0].overlays.find(item => item.type === 'particles');
  assert.ok(overlay && overlay.type === 'particles');
  assert.equal(overlay.particles.length, 160);
  assert.ok(overlay.particles.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.size > 0 && p.opacity >= 0 && p.opacity <= 1));
  const other = evaluated('rain', 1.1, { seed: 999 });
  const otherParticles = other.overlays.find(item => item.type === 'particles').particles;
  assert.notDeepEqual(otherParticles, overlay.particles, 'a different seed produces a different field');
  for (const variant of ['dust', 'leaves', 'snow', 'fireflies']) {
    const state = evaluated(variant, 2.2);
    const field = state.overlays.find(item => item.type === 'particles');
    assert.ok(field && field.type === 'particles', `${variant} emits particles`);
    assert.ok(field.particles.length <= (variant === 'leaves' ? 40 : variant === 'dust' ? 120 : variant === 'snow' ? 140 : 60));
  }
});

test('snow and ash differ without changing determinism', () => {
  const snow = evaluated('snow', 2, { mode: 'snow' });
  const ash = evaluated('snow', 2, { mode: 'ash' });
  const field = state => state.overlays.find(item => item.type === 'particles');
  assert.notEqual(field(snow).color, field(ash).color);
  assert.notDeepEqual(field(snow).particles[0], field(ash).particles[0]);
  assert.deepEqual(field(ash), field(evaluated('snow', 2, { mode: 'ash' })), 'ash is deterministic too');
});

test('haze only treats distant planes and depth blur only treats planes away from focus', () => {
  const haze = evaluated('haze', 2, { target: 'scene', depthLimit: .3, feather: .1, intensity: 1, desaturate: 1 });
  assert.ok(haze.layers.far.desaturate > haze.layers.mid.desaturate);
  assert.equal(haze.layers.near.desaturate, 0);
  const blur = evaluated('depthBlur', 2, { target: 'scene', focus: 1, range: .1, strength: 10 });
  assert.ok(blur.layers.far.blur > blur.layers.mid.blur && blur.layers.mid.blur > blur.layers.near.blur);
  assert.equal(blur.layers.near.blur, 0);
  const defocus = evaluated('defocus', 2, { target: 'scene', depthThreshold: .8, strength: 8 });
  assert.ok(defocus.layers.near.blur > 0);
  assert.equal(defocus.layers.far.blur, 0);
});

test('light variation stays bounded and foliage and clouds only move their target layers', () => {
  const light = evaluated('light', 2, { target: 'scene', amount: 1, brightness: 1.05 });
  assert.ok(light.sceneBrightness > .5 && light.sceneBrightness < 1.6);
  const foliage = evaluated('foliage', 2, { layerIds: ['near'], strength: 8 });
  assert.notEqual(foliage.layers.near.rotation, 0);
  assert.equal(foliage.layers.far.rotation, 0);
  assert.ok(Math.abs(foliage.layers.near.rotation) <= 8.01);
  const clouds = evaluated('clouds', 2, { layerIds: ['mid'], driftX: 50 });
  assert.ok(Math.abs(clouds.layers.mid.x) > 0);
  assert.equal(clouds.layers.far.x, 0);
  assert.ok(clouds.layers.mid.opacity > 0 && clouds.layers.mid.opacity <= 1);
});

test('validation drops malformed effects and repairs missing layer references', () => {
  const scene = layerScene();
  scene.atmosphere = [
    { id: 'ok', kind: 'fog', start: 0, duration: 4 },
    { id: 'bad', kind: 'not-real', start: 0, duration: 2 },
    { id: 'ok', kind: 'dust', start: 0, duration: 2 },
    { id: 'missing', kind: 'haze', start: 0, duration: 2, target: 'layers', layerIds: ['deleted'] },
    { id: 'broken', kind: 'rain', start: 'x', duration: 2 },
    { id: 'leaf', kind: 'leaves', start: 0, duration: 2, textureLayerId: 'deleted', layerIds: ['near'] },
  ];
  const validated = validateScene(scene);
  assert.deepEqual(validated.atmosphere.map(effect => effect.id), ['ok', 'leaf']);
  assert.equal(validated.atmosphere[1].textureLayerId, 'near');
  assert.equal(validated.atmosphere[0].kind, 'fog');
  assert.equal(validated.atmosphere[0].density, .45);
  const broken = layerScene(); broken.atmosphere = null;
  assert.deepEqual(validateScene(broken).atmosphere, [], 'a corrupt atmosphere container loads as empty');
});

test('targeted effects keep their selected layers and firefly glow size is preserved', () => {
  const haze = authored('haze', { target: 'layers', layerIds: ['near'] }).atmosphere[0];
  assert.equal(haze.target, 'layers');
  assert.deepEqual(haze.layerIds, ['near']);

  const flies = authored('fireflies', { size: 30 }).atmosphere[0];
  assert.equal(flies.size, 30);
  const field = evaluateAtmosphere(authored('fireflies', { size: 30 }), 2, 1).overlays
    .find(overlay => overlay.type === 'particles');
  assert.ok(field && field.particles.length > 0, 'fireflies render particles');
  assert.ok(Math.max(...field.particles.map(particle => particle.size)) > 20, 'the glow size reaches the renderer');
});

test('layer-targeted leaves stay over the selected artwork', () => {
  const scene = layerScene();
  Object.assign(scene.layers[2], { width: 200, height: 200, x: -250 });
  scene.atmosphere = [{ id: 'leaf', kind: 'leaves', start: 0, duration: 5, target: 'layers', layerIds: ['near'] }];
  const validated = validateScene(scene);
  assert.equal(validated.atmosphere[0].target, 'layers');
  const field = evaluateAtmosphere(validated, 2, 1).overlays.find(overlay => overlay.type === 'particles');
  assert.ok(field && field.particles.length > 0);
  for (const particle of field.particles) {
    assert.ok(particle.x >= 49 && particle.x <= 251, 'leaf x stays over the layer');
    assert.ok(particle.y >= 199 && particle.y <= 401, 'leaf y stays over the layer');
  }
});

test('effect windows are clamped to the scene and scene targets need no layers', () => {
  const scene = createScene('Empty', 5, 640, 360, 12);
  scene.atmosphere = [
    { id: 'late', kind: 'rays', start: 99, duration: 99 },
    { id: 'zero', kind: 'snow', start: 0, duration: 0 },
  ];
  const validated = validateScene(scene);
  assert.equal(validated.atmosphere.length, 2);
  for (const effect of validated.atmosphere) {
    assert.ok(effect.start >= 0 && effect.start <= 5);
    assert.ok(effect.duration > 0 && effect.start + effect.duration <= 5 + 1e-9);
  }
  const state = evaluateAtmosphere(validated, 0, 1);
  assert.deepEqual(state.layers, {});
  assert.equal(state.sceneBrightness, 1);
});

test('neutral input stays exactly neutral and intensity scales overlays', () => {
  const scene = layerScene();
  const neutral = evaluateAtmosphere(scene, 3, 1);
  assert.deepEqual(neutral.overlays, []);
  assert.deepEqual(Object.values(neutral.layers).map(layer => layer.blur), [0, 0, 0]);
  const effect = authored('fog', { opacity: .4 });
  const full = evaluateAtmosphere(effect, 2, 1).overlays[0];
  const half = evaluateAtmosphere(effect, 2, .5).overlays[0];
  assert.ok(full.type === 'fog' && half.type === 'fog');
  assert.ok(full.bands[0].alpha > half.bands[0].alpha);
  const disabled = structuredClone(effect);
  disabled.atmosphere[0].enabled = false;
  assert.deepEqual(evaluateAtmosphere(disabled, 2, 1).overlays, []);
  assert.deepEqual(evaluateAtmosphere(effect, 2, 0), evaluateAtmosphere(scene, 3, 1), 'zero intensity is neutral');
  assert.deepEqual(evaluateAtmosphere(effect, .2, 1).overlays, [], 'before the clip there is no effect');
  assert.deepEqual(evaluateAtmosphere(effect, 6, 1).overlays, [], 'after the clip there is no effect');
});

test('all kinds declare their expected atmosphere group', () => {
  const expected = {
    fog: 'Atmosphere', haze: 'Atmosphere', depthBlur: 'Atmosphere', defocus: 'Atmosphere',
    rays: 'Lighting', light: 'Lighting', dust: 'Particles', leaves: 'Particles',
    fireflies: 'Particles', foliage: 'Weather', clouds: 'Weather', rain: 'Weather',
    snow: 'Weather', waterfall: 'Weather',
  };
  for (const [kind, group] of Object.entries(expected)) assert.equal(atmosphereGroups[kind], group);
});
