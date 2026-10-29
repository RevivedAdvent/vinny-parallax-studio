import { Application, Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { SCENE } from '../scenes/arrival';
import { clamp, envelope, random, smooth } from './math';

export interface SceneOptions {
  motion: number;
  atmosphere: boolean;
  captions: boolean;
  layers: Record<string, boolean>;
}

function canvasTexture(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = SCENE.width; canvas.height = SCENE.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('A 2D canvas context is required.');
  draw(ctx, canvas.width, canvas.height);
  return Texture.from(canvas);
}

export async function createScene(host: HTMLElement, outputWidth = 1920, outputHeight = 1080) {
  const app = new Application();
  await app.init({ width: outputWidth, height: outputHeight, background: '#101b13',
    antialias: true, autoStart: false, preference: 'webgl', preserveDrawingBuffer: true,
    resolution: 1 });
  app.canvas.setAttribute('aria-label', 'Animated jungle scene with Count Vinny among prehistoric ferns');
  app.canvas.setAttribute('role', 'img');
  host.appendChild(app.canvas);
  const root = new Container();
  root.scale.set(outputWidth / SCENE.width, outputHeight / SCENE.height);
  app.stage.addChild(root);
  const world = new Container();
  root.addChild(world);
  const options: SceneOptions = {
    motion: 0.65, atmosphere: true, captions: true,
    layers: Object.fromEntries(SCENE.layers.map(l => [l.id, true])),
  };
  const textures = await Promise.all(SCENE.layers.map(l => Assets.load<Texture>(`/assets/scene-01/${l.file}`)));
  const layers = SCENE.layers.map((config, i) => {
    const sprite = new Sprite(textures[i]);
    sprite.anchor.set(0.5);
    world.addChild(sprite);
    return { config, sprite };
  });
  const atmosphere = new Container();
  root.addChild(atmosphere);
  const mistTexture = canvasTexture((ctx, w, h) => {
    const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(215,238,200,0.2)'); grad.addColorStop(1, 'rgba(215,238,200,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
  });
  const mist = Array.from({ length: 3 }, (_, i) => {
    const sprite = new Sprite(mistTexture);
    sprite.anchor.set(0.5); sprite.scale.set(0.8 + i * 0.2, 0.2 + i * 0.07);
    atmosphere.addChild(sprite); return sprite;
  });
  const rng = random(842);
  const motes = Array.from({ length: 38 }, () => {
    const dot = new Graphics().circle(0, 0, 0.7 + rng() * 1.8).fill(0xf3efb6);
    atmosphere.addChild(dot);
    return { dot, x: rng() * SCENE.width, y: rng() * SCENE.height,
      phase: rng() * Math.PI * 2, speed: 1.2 + rng() * 4 };
  });
  const vignette = new Sprite(canvasTexture((ctx, w, h) => {
    const g = ctx.createRadialGradient(w * 0.51, h * 0.48, h * 0.26, w * 0.51, h * 0.48, w * 0.65);
    g.addColorStop(0, 'rgba(5,16,10,0)'); g.addColorStop(1, 'rgba(5,16,10,0.65)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }));
  root.addChild(vignette);
  const shade = new Sprite(canvasTexture((ctx, w, h) => {
    const g = ctx.createLinearGradient(0, h * 0.62, 0, h);
    g.addColorStop(0, 'rgba(4,12,8,0)'); g.addColorStop(1, 'rgba(4,12,8,0.82)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }));
  root.addChild(shade);
  const chapter = new Text({ text: 'I  /  THE ARRIVAL', style: {
    fontFamily: 'Arial, sans-serif', fontSize: 13, letterSpacing: 4, fill: '#edead8',
  } });
  chapter.position.set(65, 60); root.addChild(chapter);
  const caption = new Text({ text: '', style: {
    fontFamily: 'Georgia, serif', fontSize: 27, fill: '#f4f1e4', align: 'center',
    wordWrap: true, wordWrapWidth: 960, lineHeight: 36,
    dropShadow: { color: '#000000', alpha: 0.6, blur: 7, distance: 2 },
  } });
  caption.anchor.set(0.5, 1); caption.position.set(SCENE.width / 2, SCENE.height - 65);
  root.addChild(caption);
  const black = new Graphics().rect(0, 0, SCENE.width, SCENE.height).fill(0x07110b);
  root.addChild(black);
  let time = 0;

  function renderAt(seconds: number) {
    time = clamp(seconds, 0, SCENE.duration);
    const progress = smooth(time / SCENE.duration);
    const motion = options.motion;
    for (const { config, sprite } of layers) {
      const depth = config.depth;
      const scale = 1.065 + motion * (0.035 * progress + depth * 0.025 * progress);
      const breath = config.id === 'vinny' ? Math.sin(time * 1.65) * 0.0018 * motion : 0;
      sprite.scale.set(scale + breath, scale + breath * 1.6);
      const x = config.x + sprite.texture.width / 2;
      const y = config.y + sprite.texture.height / 2;
      sprite.position.set(
        SCENE.width / 2 + (x - SCENE.width / 2) * scale + motion * progress * (16 + depth * 28),
        SCENE.height / 2 + (y - SCENE.height / 2) * scale - motion * progress * (5 + depth * 7),
      );
      if (config.id === 'foreground') {
        sprite.rotation = Math.sin(time * 0.65) * 0.0017 * motion;
        sprite.x += Math.sin(time * 0.55) * 2 * motion;
      }
      sprite.visible = options.layers[config.id];
    }
    atmosphere.visible = options.atmosphere;
    mist.forEach((s, i) => {
      s.position.set(220 + i * 460 + Math.sin(time * 0.12 + i) * 100, 420 + i * 95);
      s.alpha = 0.28 + Math.sin(time * 0.21 + i) * 0.08;
    });
    for (const p of motes) {
      p.dot.position.set((p.x + time * p.speed) % SCENE.width,
        (p.y - time * p.speed * 0.45 + SCENE.height) % SCENE.height + Math.sin(time * 0.4 + p.phase) * 7);
      p.dot.alpha = 0.10 + (Math.sin(time * 0.7 + p.phase) + 1) * 0.15;
    }
    const cue = SCENE.captions.find(c => time >= c.start && time <= c.end);
    caption.text = cue?.text ?? '';
    caption.alpha = options.captions && cue ? envelope(time, cue.start, cue.end) : 0;
    shade.alpha = options.captions ? 0.8 : 0.24;
    chapter.alpha = envelope(time, 0.6, 5.5, 1);
    black.alpha = 1 - smooth(time / 1.1) + smooth((time - 23) / 1);
    app.renderer.render({ container: app.stage });
  }
  renderAt(0);
  return { app, options, renderAt, get time() { return time; },
    destroy() { app.destroy(true, { children: true }); } };
}

export type StoryScene = Awaited<ReturnType<typeof createScene>>;
