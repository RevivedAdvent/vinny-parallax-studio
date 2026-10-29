import { Application, Assets, Sprite, Texture } from 'pixi.js';
import { compileCamera } from '../camera/evaluate.ts';
import { projectLayers } from '../camera/project.ts';
import { clamp, finite } from '../camera/easing.ts';
import type { CameraSceneConfig } from '../camera/types.ts';

export interface Coverage {
  uncoveredPixels: number;
  fullyTransparentPixels: number;
  minAlpha: number;
  bounds: { x: number; y: number; width: number; height: number } | null;
}
export async function createCameraScene(host: HTMLElement, input: CameraSceneConfig) {
  let core = compileCamera(input), config = core.config();
  const app = new Application();
  await app.init({ width: config.width, height: config.height, resolution: 1, antialias: true,
    autoStart: false, preference: 'webgl', preserveDrawingBuffer: true,
    background: '#ff00ff', backgroundAlpha: 0 });
  app.canvas.setAttribute('aria-label', 'Camera-only layered story preview');
  app.canvas.setAttribute('role', 'img');
  app.canvas.style.background = '#ff00ff';
  host.appendChild(app.canvas);
  const sprites = await Promise.all(config.layers.map(async layer => {
    const texture = await Assets.load<Texture>(layer.asset);
    if (texture.width !== config.width || texture.height !== config.height) {
      throw new Error(`${layer.id}: expected full-canvas ${config.width}×${config.height}, got ${texture.width}×${texture.height}`);
    }
    const sprite = new Sprite(texture); sprite.anchor.set(0.5); app.stage.addChild(sprite);
    return sprite;
  }));
  let frame = 0, intensity = 1;
  let state = core.evaluate(frame, intensity);
  let transforms = projectLayers(config, state);
  const readback = document.createElement('canvas');
  readback.width = config.width; readback.height = config.height;
  const context = readback.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('PNG export requires a 2D canvas context');

  function renderFrame(index: number) {
    // Evaluator rejects invalid indexes; do not silently turn frame 576 into frame 575.
    state = core.evaluate(index, intensity); frame = index;
    transforms = projectLayers(config, state);
    transforms.forEach((pose, i) => {
      const sprite = sprites[i];
      sprite.position.set(pose.x, pose.y); sprite.scale.set(pose.scale);
      sprite.rotation = pose.roll * Math.PI / 180;
    });
    app.renderer.render({ container: app.stage });
  }
  /** Actual framebuffer readback, independent of code-level geometric coverage guesses.
   * Any subopaque output pixel fails, including blended magenta edge gaps. All overlays are absent.
   */
  function capture(includePNG = true): { png?: string; coverage: Coverage } {
    const ctx = context!;
    ctx.clearRect(0, 0, config.width, config.height); ctx.drawImage(app.canvas, 0, 0);
    const pixels = ctx.getImageData(0, 0, config.width, config.height).data;
    let count = 0, transparent = 0, minAlpha = 255;
    let minX = config.width, minY = config.height, maxX = -1, maxY = -1;
    for (let i = 3; i < pixels.length; i += 4) {
      const alpha = pixels[i];
      if (alpha < 255) {
        count++; if (alpha === 0) transparent++; minAlpha = Math.min(minAlpha, alpha);
        const p = (i - 3) / 4, x = p % config.width, y = Math.floor(p / config.width);
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
    const coverage: Coverage = { uncoveredPixels: count, fullyTransparentPixels: transparent, minAlpha,
      bounds: count ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null };
    if (!includePNG) return { coverage };
    ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#ff00ff';
    ctx.fillRect(0, 0, config.width, config.height); ctx.globalCompositeOperation = 'source-over';
    return { png: readback.toDataURL('image/png'), coverage };
  }
  function setConfig(input: CameraSceneConfig) {
    const candidate = compileCamera(input), next = candidate.config();
    if (next.width !== config.width || next.height !== config.height || next.layers.length !== config.layers.length ||
      next.layers.some((l, i) => l.id !== config.layers[i].id || l.asset !== config.layers[i].asset)) {
      throw new Error('Changing asset topology or dimensions requires creating a new renderer');
    }
    const nextFrame = Math.min(frame, next.totalFrames - 1);
    core = candidate; config = next; renderFrame(nextFrame);
  }
  renderFrame(0);
  return { app, renderFrame, capture, setConfig,
    setIntensity(value: number) { intensity = clamp(finite(value, 'intensity'), 0, 1); renderFrame(frame); },
    setVisible(id: string, visible: boolean) {
      const index = config.layers.findIndex(l => l.id === id);
      if (index < 0) throw new Error(`Unknown layer ${id}`);
      sprites[index].visible = visible; renderFrame(frame);
    },
    getState: () => ({ frame, intensity, state: structuredClone(state), transforms: structuredClone(transforms),
      visible: Object.fromEntries(config.layers.map((l, i) => [l.id, sprites[i].visible])), config: core.config() }),
    destroy() { app.destroy(true, { children: true }); },
  };
}
export type CameraScene = Awaited<ReturnType<typeof createCameraScene>>;
