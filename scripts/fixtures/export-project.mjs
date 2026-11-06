// Real-artwork, saved-project fixture shared by the UI export regression.
import { readFile } from 'node:fs/promises';
import { createProject, createScene, validateProject } from '../../src/studio/project.ts';
import { validateScene } from '../../src/camera/validate.ts';
import { atmosphereDefaults, atmosphereNames } from '../../src/camera/atmosphere.ts';

export async function exportProject() {
  const project = createProject('Export integration proof');
  const files = ['01-background.png', '02-layer 1.png', '03-layer 2.png', '04-layer 3.png'];
  const assets = await Promise.all(files.map(async file => 'data:image/png;base64,' +
    (await readFile(new URL('../../test-images/' + file, import.meta.url))).toString('base64')));
  const scene = createScene('Forest · all effects', 2, 1920, 1080, 24);
  scene.layers = files.map((name, i) => ({ id: `art-${i}`, name, asset: assets[i], order: i,
    depth: i / 3, x: [0, -30, 120, 20][i], y: [0, -10, 50, 20][i],
    scale: [1.6, 1.45, 1.1, 1.5][i], opacity: 1, rotation: 0, visible: true }));
  // A small extra layer is a genuine project-owned asset; another is used as the
  // source texture for the existing Parallax particle renderer.
  scene.layers.push({ id: 'stored', name: 'Project asset', asset: '/assets/scene-01-normalized/vinny.png',
    order: 4, depth: .6, x: -600, y: 260, scale: .18, opacity: .8 });
  scene.layers.push({ ...scene.layers[3], id: 'pollen', name: 'Parallax particles', order: 5, scale: 1 });
  const move = (type, extra = {}) => ({ id: type, model: 2, type, start: 0, duration: 2,
    x: 960, y: 540, scale: 1, ...extra });
  scene.cameraMoves = [move('push', { travel: .08, scale: 1.1 }),
    move('truck', { x: 1000 }), move('dutch', { angle: 1 }),
    move('handheld', { strength: .08, speed: 1, seed: 17 }),
    move('impact', { start: .5, duration: .5, strength: .05 }),
    move('whip', { start: 1, duration: .5, angle: 1, blur: true }),
    move('dollyZoom', { travel: .01, layerId: 'art-2' }),
    move('rackFocus', { focusFrom: .3, focusTo: .7, strength: .2 }),
    move('orbit', { angle: 1, radius: 1, elevation: .001, layerId: 'art-2' })];
  scene.parallax = { strength: .8, near: 1.1, far: .7, reference: .5, influence: {} };
  scene.depthPlanes = [{ id: 'middle', name: 'Middle plane', depth: .55, layerIds: ['art-2'] }];
  scene.depthScale = { near: 1.02, far: 1, reference: .5, strength: 1, influence: {} };
  const effect = (kind, layerIds, extra) => ({ id: kind, kind, start: 0, duration: 2, layerIds, ...extra });
  scene.layerEffects = [
    effect('drift', ['art-1'], { axis: 'xy', motion: 'sway', amplitude: 12, speed: .5, phase: 0, seed: 4 }),
    effect('warp', ['art-1'], { corners: [{ x: -1.04, y: -1 }, { x: 1.06, y: -.96 }, { x: 1, y: 1.03 }, { x: -1, y: 1 }] }),
    effect('reveal', ['art-3'], { mask: 'wipe', direction: 'left', originX: .5, originY: .5, startCoverage: .15, endCoverage: .95, softness: .12 }),
    effect('shadow', ['art-2'], { angle: 35, distance: 22, opacity: .4, blur: 4, color: '#182030', speed: .2, amplitude: 4, phase: 0 }),
    effect('ambient', ['pollen'], { mode: 'particles', motion: 'drift', direction: 'down', count: 8,
      speedMin: 10, speedMax: 25, sizeMin: 8, sizeMax: 18, opacityMin: .2, opacityMax: .6,
      lifetime: 4, regionX: -.4, regionY: -.3, regionWidth: .8, regionHeight: .6, seed: 19 }),
  ];
  scene.animationTracks = [{ id: 'layer-motion', target: 'layer:art-2', property: 'x', intensity: 1,
    keyframes: [{ id: 'start', timeSeconds: 0, value: 0, easing: 'linear' }, { id: 'end', timeSeconds: 2, value: 18, easing: 'linear' }] }];
  scene.atmosphere = Object.keys(atmosphereNames).map(kind => ({ id: `atmos-${kind}`, kind,
    start: 0, duration: 2, seed: 27, ...atmosphereDefaults(kind),
    ...(['defocus', 'foliage', 'clouds'].includes(kind) ? { target: 'layers', layerIds: ['art-3'] } : {}) }));
  Object.assign(scene.atmosphere.find(e => e.kind === 'rays'), { opacity: .25 });
  Object.assign(scene.atmosphere.find(e => e.kind === 'fireflies'), { size: 18 });
  Object.assign(scene.atmosphere.find(e => e.kind === 'depthBlur'), { strength: 2 });
  const second = createScene('Second scene · closer framing', 1);
  second.layers = structuredClone(scene.layers.slice(0, 4));
  second.layers[2].x = -200;
  second.layers[3].opacity = .5;
  second.cameraMoves = [{ ...move('zoom', { scale: 1.2 }), duration: 1 }];
  second.atmosphere = [{ id: 'second-snow', kind: 'snow', start: 0, duration: 1, seed: 93,
    ...atmosphereDefaults('snow'), count: 35 }];
  // A deliberately non-16:9 scene: the preview letterboxes it, so the exported
  // video must letterbox it too instead of cropping the artwork to fill the frame.
  const square = createScene('Square close-up', 1, 1080, 1080, 60);
  square.layers = structuredClone(scene.layers.slice(0, 2)).map((layer, i) => ({ ...layer, id: `square-${i}`, scale: 2 }));
  square.cameraMoves = [{ id: 'square-push', model: 2, type: 'push', start: 0, duration: 1, x: 540, y: 540, scale: 1.1, travel: .04 }];
  square.atmosphere = [{ id: 'square-haze', kind: 'haze', start: 0, duration: 1, ...atmosphereDefaults('haze') }];
  project.scenes = [validateScene(scene), validateScene(second), validateScene(square)];
  return validateProject(project);
}
