import { Container, Sprite, Texture } from 'pixi.js';
import type { AtmosphereOverlay, AtmosphereParticle, AtmosphereState } from '../camera/atmosphere.ts';
import type { CameraSceneConfig } from '../camera/types.ts';

export interface AtmosphereViewOptions {
  /** The layer container; fog bands are inserted between artwork planes. */
  world: Container;
  /** Container for rays, particles and ripples, drawn above the artwork. */
  overlay: Container;
  /** Resolve a layer texture for leaves; returns undefined to fall back to a dot. */
  textureFor: (layerId?: string) => Texture | undefined;
}

type ParticleVariant = 'dust' | 'leaves' | 'rain' | 'snow' | 'fireflies' | 'mist';

const textureCache = new WeakMap<AtmosphereViewOptions, Record<'dot' | 'puff' | 'streak' | 'ring' | 'ray', Texture>>();

function makeTexture(width: number, height: number, draw: (context: CanvasRenderingContext2D) => void): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return Texture.WHITE;
  draw(context);
  return Texture.from(canvas);
}

function buildTextures(): Record<'dot' | 'puff' | 'streak' | 'ring' | 'ray', Texture> {
  const dot = makeTexture(64, 64, context => {
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(.45, 'rgba(255,255,255,.72)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  });
  const puff = makeTexture(160, 96, context => {
    // Deterministic lobes give a painterly cloud silhouette rather than a single dot.
    const lobes = [[.32, .54, .29], [.55, .44, .33], [.72, .58, .24], [.45, .62, .27]];
    for (const [cx, cy, radius] of lobes) {
      const gradient = context.createRadialGradient(cx * 160, cy * 96, 0, cx * 160, cy * 96, radius * 160);
      gradient.addColorStop(0, 'rgba(255,255,255,.62)');
      gradient.addColorStop(.55, 'rgba(255,255,255,.3)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 160, 96);
    }
  });
  const streak = makeTexture(32, 64, context => {
    const gradient = context.createLinearGradient(0, 0, 0, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(.25, 'rgba(255,255,255,.85)');
    gradient.addColorStop(.75, 'rgba(255,255,255,.85)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(10, 0, 12, 64);
  });
  const ring = makeTexture(96, 96, context => {
    context.strokeStyle = 'rgba(255,255,255,.9)';
    context.lineWidth = 5;
    context.beginPath();
    context.ellipse(48, 48, 36, 20, 0, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = 'rgba(255,255,255,.25)';
    context.lineWidth = 12;
    context.stroke();
  });
  const ray = makeTexture(256, 128, context => {
    const horizontal = context.createLinearGradient(0, 0, 256, 0);
    horizontal.addColorStop(0, 'rgba(255,255,255,.95)');
    horizontal.addColorStop(.35, 'rgba(255,255,255,.4)');
    horizontal.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = horizontal;
    context.fillRect(0, 0, 256, 128);
    context.globalCompositeOperation = 'destination-in';
    const vertical = context.createLinearGradient(0, 0, 0, 128);
    vertical.addColorStop(0, 'rgba(255,255,255,0)');
    vertical.addColorStop(.2, 'rgba(255,255,255,1)');
    vertical.addColorStop(.8, 'rgba(255,255,255,1)');
    vertical.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = vertical;
    context.fillRect(0, 0, 256, 128);
  });
  return { dot, puff, streak, ring, ray };
}

function fit(pool: Sprite[], count: number, parent: Container): Sprite[] {
  while (pool.length < count) {
    const sprite = new Sprite();
    sprite.anchor.set(.5);
    parent.addChild(sprite);
    pool.push(sprite);
  }
  for (let index = 0; index < pool.length; index++) pool[index].visible = index < count;
  return pool;
}

/**
 * Draws evaluated atmosphere overlays with pooled, bounded sprites. Nothing is
 * animated here: every value comes from the AtmosphereState snapshot, so the
 * preview and deterministic frame export share exactly the same pixels.
 */
export function createAtmosphereView(options: AtmosphereViewOptions) {
  const textures = textureCache.get(options) ?? buildTextures();
  textureCache.set(options, textures);
  const fogContainer = new Container();
  const raysContainer = new Container();
  const particlesContainer = new Container();
  const ripplesContainer = new Container();
  fogContainer.label = 'atmosphere-fog';
  raysContainer.label = 'atmosphere-rays';
  particlesContainer.label = 'atmosphere-particles';
  ripplesContainer.label = 'atmosphere-ripples';
  options.world.addChild(fogContainer);
  options.overlay.addChild(raysContainer, particlesContainer, ripplesContainer);

  const pools = {
    fog: [] as Sprite[], rays: [] as Sprite[], dust: [] as Sprite[], leaves: [] as Sprite[],
    rain: [] as Sprite[], snow: [] as Sprite[], fireflies: [] as Sprite[], glow: [] as Sprite[],
    mist: [] as Sprite[], ripples: [] as Sprite[],
  };

  const hideAll = () => Object.values(pools).forEach(pool => pool.forEach(sprite => { sprite.visible = false; }));

  function fogBounds(config: CameraSceneConfig) {
    // Sit the fog between the far background and the midground when possible.
    const target = config.layers.findIndex(layer => layer.depth >= .3);
    const index = target < 0 ? 0 : target;
    if (fogContainer.parent !== options.world || options.world.getChildIndex(fogContainer) !== index) {
      options.world.addChildAt(fogContainer, Math.max(0, Math.min(index, options.world.children.length - 1)));
    }
  }

  function drawFog(overlay: Extract<AtmosphereOverlay, { type: 'fog' }>, config: CameraSceneConfig) {
    const sprites = fit(pools.fog, overlay.bands.length, fogContainer);
    overlay.bands.forEach((band, index) => {
      const sprite = sprites[index];
      sprite.texture = textures.puff;
      sprite.tint = parseInt(overlay.color.slice(1), 16);
      sprite.position.set(config.width / 2 + band.x + band.drift, band.y);
      sprite.scale.set(band.width / textures.puff.width, band.height / textures.puff.height);
      sprite.alpha = Math.min(1, band.alpha);
      sprite.visible = band.alpha > .002;
    });
    fogContainer.visible = true;
    fogBounds(config);
  }

  function drawRays(overlay: Extract<AtmosphereOverlay, { type: 'rays' }>) {
    const sprites = fit(pools.rays, overlay.rays.length, raysContainer);
    overlay.rays.forEach((ray, index) => {
      const sprite = sprites[index];
      sprite.texture = textures.ray;
      sprite.tint = parseInt(overlay.color.slice(1), 16);
      sprite.position.set(ray.x, ray.y);
      sprite.rotation = ray.angle;
      sprite.scale.set(ray.length / textures.ray.width, Math.max(1, ray.width) / textures.ray.height);
      sprite.alpha = Math.min(.8, ray.alpha);
      sprite.blendMode = 'add';
      sprite.visible = ray.alpha > .002;
    });
  }

  function particleTexture(variant: ParticleVariant, overlay: Extract<AtmosphereOverlay, { type: 'particles' }>) {
    if (variant === 'rain') return textures.streak;
    if (variant === 'leaves') return options.textureFor(overlay.textureLayerId) ?? textures.dot;
    if (variant === 'mist' || variant === 'snow') return textures.dot;
    return textures.dot;
  }

  function drawParticles(overlay: Extract<AtmosphereOverlay, { type: 'particles' }>) {
    const variant = overlay.variant as ParticleVariant;
    const source = particleTexture(variant, overlay);
    const pool = pools[variant];
    const sprites = fit(pool, overlay.particles.length, particlesContainer);
    const tint = parseInt(overlay.color.slice(1), 16);
    overlay.particles.forEach((particle: AtmosphereParticle, index) => {
      const sprite = sprites[index];
      sprite.texture = source;
      sprite.tint = tint;
      sprite.position.set(particle.x, particle.y);
      sprite.rotation = particle.rotation * Math.PI / 180;
      if (variant === 'rain') {
        sprite.scale.set(Math.max(.2, (particle.width ?? 1.4) / 12), Math.max(1, particle.size) / textures.streak.height * 1.4);
        sprite.alpha = Math.min(1, particle.opacity);
      } else {
        sprite.scale.set(Math.max(1, particle.size) / source.width);
        sprite.alpha = Math.min(1, particle.opacity);
      }
      sprite.blendMode = variant === 'fireflies' ? 'add' : 'normal';
      sprite.visible = particle.opacity > .002;
    });
    if (variant === 'fireflies') {
      const glowSprites = fit(pools.glow, overlay.particles.length, particlesContainer);
      overlay.particles.forEach((particle, index) => {
        const sprite = glowSprites[index];
        sprite.texture = textures.dot;
        sprite.tint = tint;
        sprite.position.set(particle.x, particle.y);
        sprite.rotation = 0;
        sprite.scale.set(Math.max(1, particle.size * 3) / textures.dot.width);
        sprite.alpha = Math.min(.5, particle.opacity * overlay.glow * .5);
        sprite.blendMode = 'add';
        sprite.visible = particle.opacity > .002 && overlay.glow > .01;
      });
    }
  }

  function drawRipples(overlay: Extract<AtmosphereOverlay, { type: 'ripples' }>) {
    const sprites = fit(pools.ripples, overlay.rings.length, ripplesContainer);
    const tint = parseInt(overlay.color.slice(1), 16);
    overlay.rings.forEach((ring, index) => {
      const sprite = sprites[index];
      sprite.texture = textures.ring;
      sprite.tint = tint;
      sprite.position.set(ring.x, ring.y);
      sprite.rotation = 0;
      sprite.scale.set(Math.max(2, ring.radius * 2) / textures.ring.width);
      sprite.alpha = Math.min(.8, ring.alpha);
      sprite.blendMode = 'add';
      sprite.visible = ring.alpha > .002;
    });
  }

  function update(state: AtmosphereState) {
    hideAll();
    fogContainer.visible = false;
    let hasFog = false;
    for (const overlay of state.overlays) {
      if (overlay.type === 'fog') { hasFog = true; drawFog(overlay, currentConfig); }
      else if (overlay.type === 'rays') drawRays(overlay);
      else if (overlay.type === 'particles') drawParticles(overlay);
      else if (overlay.type === 'ripples') drawRipples(overlay);
    }
    fogContainer.visible = hasFog;
  }

  let currentConfig: CameraSceneConfig = { width: 1, height: 1, layers: [] } as unknown as CameraSceneConfig;
  function configure(config: CameraSceneConfig) { currentConfig = config; }

  function destroy() {
    fogContainer.destroy({ children: true });
    raysContainer.destroy({ children: true });
    particlesContainer.destroy({ children: true });
    ripplesContainer.destroy({ children: true });
    Object.values(pools).forEach(pool => pool.forEach(sprite => sprite.destroy()));
    Object.values(textures).forEach(texture => texture.destroy(true));
    textureCache.delete(options);
  }

  return { update, configure, destroy };
}

export type AtmosphereView = ReturnType<typeof createAtmosphereView>;
