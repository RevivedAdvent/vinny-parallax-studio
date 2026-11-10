import { clamp, drift, seededValue } from './easing.ts';
import { resolvedDepth } from './layer-effects.ts';
import type { CameraSceneConfig } from './types.ts';

/**
 * Atmosphere effects are scene-level environmental treatments: fog, haze,
 * light, depth focus and weather particles. They are evaluated from an
 * absolute timestamp with fixed seeds, never from accumulated frame state, and
 * they never mutate Arrange transforms, camera moves or artwork textures.
 */

export type AtmosphereKind =
  | 'fog' | 'haze' | 'rays' | 'dust' | 'depthBlur' | 'light' | 'defocus'
  | 'leaves' | 'foliage' | 'clouds' | 'rain' | 'snow' | 'fireflies' | 'waterfall';
export type AtmosphereGroup = 'Atmosphere' | 'Particles' | 'Weather' | 'Lighting';
export type AtmosphereTarget = 'scene' | 'layers';

export const atmosphereNames: Record<AtmosphereKind, string> = {
  fog: 'Ground Fog',
  haze: 'Atmospheric Haze',
  rays: 'Light Rays',
  dust: 'Floating Dust',
  depthBlur: 'Depth Blur',
  light: 'Ambient Light',
  defocus: 'Foreground Defocus',
  leaves: 'Leaves / Petals',
  foliage: 'Wind / Foliage Motion',
  clouds: 'Clouds & Sunlight',
  rain: 'Rain',
  snow: 'Snow / Ash',
  fireflies: 'Fireflies',
  waterfall: 'Waterfall Mist / Ripples',
};

export const atmosphereGroups: Record<AtmosphereKind, AtmosphereGroup> = {
  fog: 'Atmosphere', haze: 'Atmosphere', depthBlur: 'Atmosphere', defocus: 'Atmosphere',
  rays: 'Lighting', light: 'Lighting',
  dust: 'Particles', leaves: 'Particles', fireflies: 'Particles',
  foliage: 'Weather', clouds: 'Weather', rain: 'Weather', snow: 'Weather', waterfall: 'Weather',
};

export const atmosphereGroupOrder: AtmosphereGroup[] = ['Atmosphere', 'Particles', 'Weather', 'Lighting'];

/** Presentation-only labels; the stored group values and effect data are unchanged. */
export const atmosphereGroupNames: Record<AtmosphereGroup, string> = {
  Atmosphere: 'Atmosphere & Depth',
  Lighting: 'Lighting',
  Particles: 'Particles',
  Weather: 'Weather & Environment',
};

export const atmosphereCatalogue: { group: string; kinds: AtmosphereKind[] }[] = [
  { group: 'ATMOSPHERE & DEPTH', kinds: ['fog', 'haze', 'depthBlur', 'defocus'] },
  { group: 'LIGHTING', kinds: ['rays', 'light'] },
  { group: 'PARTICLES', kinds: ['dust', 'leaves', 'fireflies'] },
  { group: 'WEATHER & ENVIRONMENT', kinds: ['foliage', 'clouds', 'rain', 'snow', 'waterfall'] },
];

export const atmosphereDescriptions: Record<AtmosphereKind, string> = {
  fog: 'Low-lying translucent bands that drift slowly across the scene, adding a misty, grounded atmosphere.',
  haze: 'Softens distant layers and adds a sense of aerial perspective and atmospheric depth.',
  rays: 'Stylized shafts of light that break through foliage or mist, adding warmth and drama.',
  dust: 'Sparse floating particles suspended at several depths, catching the light gently.',
  depthBlur: 'Separates foreground, subject and background with a controllable focus plane.',
  light: 'Slowly varies the environmental illumination, creating gentle brightness changes without flicker.',
  defocus: 'Slightly softens close foreground objects, drawing attention to the subject.',
  leaves: 'Sparse petals or leaves drifting with depth-dependent speed and natural rotation.',
  foliage: 'Gentle wind-driven sways for foliage, branches and similar organic elements.',
  clouds: 'Slow cloud movement with subtle opacity changes and restrained sunlight dimming.',
  rain: 'Layered rain streaks with depth variation and an optional foreground droplet pass.',
  snow: 'Falling or floating particles with selectable snow and ash characters.',
  fireflies: 'Sparse glowing points with smooth, independent pulses drifting gently through the scene.',
  waterfall: 'Rising mist puffs and concentric ripple rings positioned around water features.',
};

export interface AtmosphereEffect {
  id: string;
  kind: AtmosphereKind;
  start: number;
  duration: number;
  enabled?: boolean;
  /** Repeats the internal cycle inside the clip; the timeline clip stays finite. */
  loop?: boolean;
  seed?: number;
  target?: AtmosphereTarget;
  layerIds?: string[];
  color?: string;
  /** Fog and clouds. */
  density?: number; opacity?: number; softness?: number; coverage?: number;
  bands?: number; level?: number; driftX?: number; driftY?: number; speed?: number; period?: number;
  /** Haze. */
  intensity?: number; depthLimit?: number; feather?: number; desaturate?: number;
  /** Light rays and foliage sway. */
  originX?: number; originY?: number; angle?: number; count?: number; width?: number;
  rayLength?: number; vary?: number;
  /** Depth blur and foreground defocus. */
  focus?: number; range?: number; strength?: number; falloff?: number;
  animate?: boolean; focusEnd?: number; depthThreshold?: number;
  /** Gentle light variation. */
  brightness?: number; amount?: number; irregular?: number;
  /** Shared particles: dust, leaves, rain, snow, fireflies, waterfall mist. */
  sizeMin?: number; sizeMax?: number; opacityMin?: number; opacityMax?: number;
  direction?: number; lifetime?: number; depthSpread?: number; textureLayerId?: string;
  rotationSpeed?: number; drift?: number; oscillation?: number;
  regionX?: number; regionY?: number; regionWidth?: number; regionHeight?: number;
  mode?: 'snow' | 'ash'; glow?: number; pulse?: number; size?: number;
  streakLength?: number; streakWidth?: number; droplets?: number;
  /** Foliage wind. */
  gust?: number; spread?: number; pivotX?: number; pivotY?: number; movement?: number; phase?: number;
  /** Clouds. */
  opacityVariation?: number; scaleVariation?: number; tileable?: boolean;
  sunDim?: number; sunPeriod?: number;
  /** Waterfall ripples. */
  mistCount?: number; mistSize?: number; mistSpeed?: number; mistOpacity?: number;
  mistDirection?: number; mistSoftness?: number;
  rippleCount?: number; rippleAmplitude?: number; rippleRadius?: number;
  rippleSpeed?: number; rippleSpacing?: number; rippleOpacity?: number;
}

export interface AtmosphereLayerAdjustment {
  brightness: number;
  tint: string | null;
  tintAmount: number;
  desaturate: number;
  /** Extra blur in screen pixels, added to the camera focus blur. */
  blur: number;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  scale: number;
}

export interface AtmosphereParticle {
  x: number; y: number; size: number; opacity: number; rotation: number; width?: number;
}

export interface FogBand { x: number; y: number; width: number; height: number; alpha: number; drift: number }
export interface LightRay { x: number; y: number; angle: number; length: number; width: number; alpha: number }
export interface RippleRing { x: number; y: number; radius: number; width: number; alpha: number }

export type AtmosphereOverlay =
  | { type: 'fog'; color: string; softness: number; seed: number; bands: FogBand[] }
  | { type: 'rays'; color: string; rays: LightRay[] }
  | { type: 'particles'; variant: 'dust' | 'leaves' | 'rain' | 'snow' | 'fireflies' | 'mist';
      color: string; textureLayerId?: string; glow: number; particles: AtmosphereParticle[] }
  | { type: 'ripples'; color: string; rings: RippleRing[] };

export interface AtmosphereState {
  layers: Record<string, AtmosphereLayerAdjustment>;
  overlays: AtmosphereOverlay[];
  sceneBrightness: number;
  sceneTint: { color: string; amount: number };
}

export const neutralAtmosphereLayer = (): AtmosphereLayerAdjustment =>
  ({ brightness: 1, tint: null, tintAmount: 0, desaturate: 0, blur: 0, x: 0, y: 0, rotation: 0, opacity: 1, scale: 1 });

export const emptyAtmosphere = (scene: CameraSceneConfig): AtmosphereState => ({
  layers: Object.fromEntries(scene.layers.map(layer => [layer.id, neutralAtmosphereLayer()])),
  overlays: [], sceneBrightness: 1, sceneTint: { color: '#ffffff', amount: 0 },
});

const defaults: Record<AtmosphereKind, Partial<AtmosphereEffect>> = {
  fog: { loop: true, density: .45, opacity: .3, softness: .65, coverage: .8, bands: 2, level: .72, driftX: 6, driftY: -1, speed: .06, period: 14, color: '#cfd8cf' },
  haze: { loop: true, intensity: .45, depthLimit: .55, feather: .35, desaturate: .35, color: '#aebfc4' },
  rays: { loop: true, originX: .7, originY: .04, angle: 112, count: 4, width: 6, rayLength: 90, spread: 34, opacity: .18, vary: .4, speed: .04, color: '#fff2cc' },
  dust: { loop: true, count: 36, sizeMin: 2, sizeMax: 7, opacityMin: .2, opacityMax: .6, speed: 18, direction: 90, lifetime: 10, depthSpread: .6, drift: .5, regionX: 0, regionY: 0, regionWidth: 1, regionHeight: 1, color: '#f2e6c8' },
  depthBlur: { loop: false, focus: .55, range: .22, strength: 6, falloff: 1.2, animate: false, focusEnd: .8 },
  light: { loop: true, brightness: 1.05, amount: .12, speed: .07, irregular: .3, period: 12, color: '#ffe6bd' },
  defocus: { loop: false, strength: 5, softness: .6, depthThreshold: .78, animate: false, amount: .4 },
  leaves: { loop: true, count: 12, sizeMin: 16, sizeMax: 34, opacityMin: .35, opacityMax: .8, speed: 40, direction: 90, rotationSpeed: 25, lifetime: 12, drift: .6, depthSpread: .6, regionX: 0, regionY: 0, regionWidth: 1, regionHeight: 1, color: '#ffffff' },
  foliage: { loop: true, direction: 0, strength: 3.5, speed: .3, gust: .35, phase: 0, spread: 40, movement: 4, pivotX: .5, pivotY: 1 },
  clouds: { loop: true, driftX: 12, driftY: 0, opacityVariation: .15, period: 12, scaleVariation: 0, tileable: false, sunDim: .12, sunPeriod: 14 },
  rain: { loop: true, count: 70, angle: 12, speed: 700, streakLength: 22, streakWidth: 1.4, opacity: .45, depthSpread: .6, droplets: .3, lifetime: 8, regionX: 0, regionY: 0, regionWidth: 1, regionHeight: 1, color: '#cfd9e6' },
  snow: { loop: true, mode: 'snow', count: 55, sizeMin: 2, sizeMax: 6, opacityMin: .35, opacityMax: .85, speed: 40, drift: .3, oscillation: .7, lifetime: 12, depthSpread: .6, regionX: 0, regionY: 0, regionWidth: 1, regionHeight: 1, color: '#f4f8ff' },
  fireflies: { loop: true, count: 18, size: 4, opacity: .9, glow: .7, speed: 18, lifetime: 8, pulse: 2.5, depthSpread: .5, regionX: .05, regionY: .3, regionWidth: .9, regionHeight: .6, color: '#ffe9a3' },
  waterfall: { loop: true, mistCount: 24, mistSize: 10, mistSpeed: 40, mistOpacity: .3, mistDirection: 270, mistSoftness: .7, softness: .7, rippleCount: 3, rippleAmplitude: .4, rippleRadius: 90, rippleSpeed: .6, rippleSpacing: 110, rippleOpacity: .25, regionX: .35, regionY: .45, regionWidth: .3, regionHeight: .45, color: '#dfeaf0' },
};

export function atmosphereDefaults(kind: AtmosphereKind): Partial<AtmosphereEffect> {
  return { ...defaults[kind], target: ['foliage', 'clouds', 'defocus'].includes(kind) ? 'layers' : 'scene' };
}

const number = (value: unknown, label: string) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
  return value;
};
const range = (value: unknown, min: number, max: number, label: string) => clamp(number(value, label), min, max);
const color = (value: unknown, fallback: string) =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : fallback;
const durationOf = (scene: CameraSceneConfig) => scene.totalFrames / scene.fps;
const layerIdsOf = (scene: CameraSceneConfig, value: unknown) => {
  if (!Array.isArray(value)) return [];
  const ids = new Set(scene.layers.map(layer => layer.id));
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && ids.has(id)))];
};

/**
 * Validate atmosphere effects at the project boundary. Malformed effects are
 * dropped, unknown layer references are removed, and scene-targeted effects do
 * not require any layer to exist. Projects without `atmosphere` are untouched.
 */
export function validateAtmosphere(scene: CameraSceneConfig): void {
  if (scene.atmosphere === undefined) return;
  if (!Array.isArray(scene.atmosphere)) { scene.atmosphere = []; return; }
  const total = durationOf(scene);
  const kept: AtmosphereEffect[] = [];
  for (const raw of scene.atmosphere) {
    try {
      if (!raw || typeof raw !== 'object') throw new Error('Invalid atmosphere effect');
      const kind = raw.kind as AtmosphereKind;
      if (!(kind in atmosphereNames)) throw new Error('Invalid atmosphere kind');
      if (typeof raw.id !== 'string' || !raw.id || kept.some(effect => effect.id === raw.id)) throw new Error('Atmosphere ids must be unique');
      const d = atmosphereDefaults(kind);
      const layerIds = layerIdsOf(scene, raw.layerIds);
      const target: AtmosphereTarget = raw.target === 'layers' || raw.target === 'scene'
        ? raw.target : (d.target ?? 'scene');
      if (target === 'layers' && !layerIds.length) throw new Error('Layer-targeted atmosphere effect needs a layer');
      let textureLayerId = typeof raw.textureLayerId === 'string' && scene.layers.some(layer => layer.id === raw.textureLayerId)
        ? raw.textureLayerId : undefined;
      const start = range(raw.start ?? 0, 0, Math.max(0, total - 1e-3), `${raw.id}.start`);
      const length = range(raw.duration ?? 1, 1e-3, Math.max(1e-3, total - start), `${raw.id}.duration`);
      const pick = (key: keyof AtmosphereEffect) => raw[key] ?? d[key];
      const effect: AtmosphereEffect = {
        id: raw.id, kind, start, duration: length,
        enabled: raw.enabled !== false,
        loop: raw.loop ?? d.loop ?? false,
        seed: Number.isInteger(raw.seed) && (raw.seed as number) >= 0 && (raw.seed as number) <= 2147483647 ? raw.seed : 11,
        target, layerIds,
        color: color(raw.color, String(d.color ?? '#ffffff')),
      };
      if (kind === 'fog') Object.assign(effect, {
        density: range(pick('density'), 0, 1, 'fog.density'), opacity: range(pick('opacity'), 0, .9, 'fog.opacity'),
        softness: range(pick('softness'), 0, 1, 'fog.softness'), coverage: range(pick('coverage'), .1, 1, 'fog.coverage'),
        bands: Math.round(range(pick('bands'), 1, 4, 'fog.bands')), level: range(pick('level'), 0, 1, 'fog.level'),
        driftX: range(pick('driftX'), -60, 60, 'fog.driftX'), driftY: range(pick('driftY'), -20, 20, 'fog.driftY'),
        speed: range(pick('speed'), .01, 1, 'fog.speed'), period: range(pick('period'), 1, 120, 'fog.period'),
      });
      else if (kind === 'haze') Object.assign(effect, {
        intensity: range(pick('intensity'), 0, 1, 'haze.intensity'), depthLimit: range(pick('depthLimit'), .05, 1, 'haze.depthLimit'),
        feather: range(pick('feather'), 0, 1, 'haze.feather'), desaturate: range(pick('desaturate'), 0, 1, 'haze.desaturate'),
        brightness: range(pick('brightness') ?? .04, -.5, .5, 'haze.brightness'),
      });
      else if (kind === 'rays') Object.assign(effect, {
        originX: range(pick('originX'), 0, 1, 'rays.originX'), originY: range(pick('originY'), 0, 1, 'rays.originY'),
        angle: range(pick('angle'), -180, 180, 'rays.angle'), count: Math.round(range(pick('count'), 1, 8, 'rays.count')),
        width: range(pick('width'), 1, 24, 'rays.width'), rayLength: range(pick('rayLength'), 10, 160, 'rays.rayLength'),
        spread: range(pick('spread'), 0, 160, 'rays.spread'), opacity: range(pick('opacity'), 0, .6, 'rays.opacity'),
        vary: range(pick('vary'), 0, 1, 'rays.vary'), speed: range(pick('speed'), 0, .5, 'rays.speed'),
      });
      else if (kind === 'dust' || kind === 'leaves' || kind === 'rain' || kind === 'snow' || kind === 'fireflies') {
        const max = kind === 'rain' ? 160 : kind === 'snow' ? 140 : kind === 'dust' ? 120 : kind === 'leaves' ? 40 : 60;
        Object.assign(effect, {
          count: Math.round(range(pick('count'), 1, max, `${kind}.count`)),
          sizeMin: range(pick('sizeMin') ?? (kind === 'dust' ? 2 : 3), 1, 120, `${kind}.sizeMin`),
          sizeMax: range(pick('sizeMax') ?? (kind === 'fireflies' ? 6 : 12), 1, 140, `${kind}.sizeMax`),
          opacityMin: range(pick('opacityMin') ?? .2, 0, 1, `${kind}.opacityMin`),
          opacityMax: range(pick('opacityMax') ?? .8, 0, 1, `${kind}.opacityMax`),
          speed: range(pick('speed'), 0, 1400, `${kind}.speed`),
          direction: range(pick('direction') ?? (kind === 'rain' ? 90 : 90), -180, 180, `${kind}.direction`),
          lifetime: range(pick('lifetime'), .5, 120, `${kind}.lifetime`),
          depthSpread: range(pick('depthSpread') ?? .6, 0, 1, `${kind}.depthSpread`),
          drift: range(pick('drift') ?? .5, 0, 1, `${kind}.drift`),
          oscillation: range(pick('oscillation') ?? .7, 0, 1, `${kind}.oscillation`),
          regionX: range(pick('regionX') ?? 0, 0, 1, `${kind}.regionX`),
          regionY: range(pick('regionY') ?? 0, 0, 1, `${kind}.regionY`),
          regionWidth: range(pick('regionWidth') ?? 1, .02, 1, `${kind}.regionWidth`),
          regionHeight: range(pick('regionHeight') ?? 1, .02, 1, `${kind}.regionHeight`),
          rotationSpeed: range(pick('rotationSpeed') ?? (kind === 'leaves' ? 25 : 0), -360, 360, `${kind}.rotationSpeed`),
          glow: range(pick('glow') ?? .7, 0, 1, `${kind}.glow`),
          pulse: range(pick('pulse') ?? 2.5, .2, 20, `${kind}.pulse`),
          size: range(pick('size') ?? 4, 1, 80, `${kind}.size`),
        });
        if (kind === 'rain') Object.assign(effect, {
          angle: range(pick('angle') ?? 12, -60, 60, 'rain.angle'),
          streakLength: range(pick('streakLength') ?? 22, 2, 80, 'rain.streakLength'),
          streakWidth: range(pick('streakWidth') ?? 1.4, .5, 6, 'rain.streakWidth'),
          droplets: range(pick('droplets') ?? .3, 0, 1, 'rain.droplets'),
          regionHeight: range(pick('regionHeight') ?? 1, .1, 1, 'rain.regionHeight'),
        });
        if (kind === 'snow') Object.assign(effect, { mode: raw.mode === 'ash' ? 'ash' : 'snow' });
        if (kind === 'leaves') textureLayerId = textureLayerId ?? scene.layers[scene.layers.length - 1]?.id;
      } else if (kind === 'depthBlur') Object.assign(effect, {
        focus: range(pick('focus'), 0, 1, 'depthBlur.focus'), range: range(pick('range'), .02, 1, 'depthBlur.range'),
        strength: range(pick('strength'), 0, 16, 'depthBlur.strength'), falloff: range(pick('falloff'), .2, 3, 'depthBlur.falloff'),
        animate: raw.animate === true, focusEnd: range(pick('focusEnd') ?? .8, 0, 1, 'depthBlur.focusEnd'),
      });
      else if (kind === 'light') Object.assign(effect, {
        brightness: range(pick('brightness') ?? 1.05, .25, 2, 'light.brightness'),
        amount: range(pick('amount') ?? .12, 0, 1, 'light.amount'),
        speed: range(pick('speed') ?? .07, .01, 2, 'light.speed'),
        irregular: range(pick('irregular') ?? .3, 0, 1, 'light.irregular'),
        period: range(pick('period') ?? 12, 1, 120, 'light.period'),
      });
      else if (kind === 'defocus') Object.assign(effect, {
        strength: range(pick('strength') ?? 5, 0, 16, 'defocus.strength'),
        softness: range(pick('softness'), 0, 1, 'defocus.softness'),
        depthThreshold: range(pick('depthThreshold') ?? .78, .3, 1, 'defocus.depthThreshold'),
        animate: raw.animate === true, amount: range(pick('amount') ?? .4, 0, 1, 'defocus.amount'),
      });
      else if (kind === 'foliage') Object.assign(effect, {
        direction: pick('direction') === 1 ? 1 : 0,
        strength: range(pick('strength'), 0, 20, 'foliage.strength'),
        speed: range(pick('speed'), .02, 2, 'foliage.speed'),
        gust: range(pick('gust'), 0, 1, 'foliage.gust'),
        phase: range(pick('phase') ?? 0, -360, 360, 'foliage.phase'),
        spread: range(pick('spread'), 0, 180, 'foliage.spread'),
        movement: range(pick('movement'), 0, 60, 'foliage.movement'),
        pivotX: range(pick('pivotX'), 0, 1, 'foliage.pivotX'),
        pivotY: range(pick('pivotY'), 0, 1, 'foliage.pivotY'),
      });
      else if (kind === 'clouds') Object.assign(effect, {
        driftX: range(pick('driftX') ?? 12, -200, 200, 'clouds.driftX'),
        driftY: range(pick('driftY') ?? 0, -100, 100, 'clouds.driftY'),
        opacityVariation: range(pick('opacityVariation') ?? .15, 0, 1, 'clouds.opacityVariation'),
        period: range(pick('period') ?? 12, 1, 240, 'clouds.period'),
        scaleVariation: range(pick('scaleVariation') ?? 0, 0, .5, 'clouds.scaleVariation'),
        tileable: raw.tileable === true,
        sunDim: range(pick('sunDim') ?? .12, 0, 1, 'clouds.sunDim'),
        sunPeriod: range(pick('sunPeriod') ?? 14, 1, 240, 'clouds.sunPeriod'),
      });
      else if (kind === 'waterfall') Object.assign(effect, {
        mistCount: Math.round(range(pick('mistCount') ?? 24, 1, 60, 'waterfall.mistCount')),
        mistSize: range(pick('mistSize') ?? 10, 2, 80, 'waterfall.mistSize'),
        mistSpeed: range(pick('mistSpeed') ?? 40, 0, 300, 'waterfall.mistSpeed'),
        mistOpacity: range(pick('mistOpacity') ?? .3, 0, 1, 'waterfall.mistOpacity'),
        mistDirection: range(pick('mistDirection') ?? 270, -180, 360, 'waterfall.mistDirection'),
        mistSoftness: range(pick('mistSoftness') ?? .7, 0, 1, 'waterfall.mistSoftness'),
        rippleCount: Math.round(range(pick('rippleCount') ?? 3, 1, 6, 'waterfall.rippleCount')),
        rippleAmplitude: range(pick('rippleAmplitude') ?? .4, 0, 1, 'waterfall.rippleAmplitude'),
        rippleRadius: range(pick('rippleRadius') ?? 90, 10, 300, 'waterfall.rippleRadius'),
        rippleSpeed: range(pick('rippleSpeed') ?? .6, .05, 3, 'waterfall.rippleSpeed'),
        rippleSpacing: range(pick('rippleSpacing') ?? 110, 10, 400, 'waterfall.rippleSpacing'),
        rippleOpacity: range(pick('rippleOpacity') ?? .25, 0, 1, 'waterfall.rippleOpacity'),
        softness: range(pick('softness') ?? .7, 0, 1, 'waterfall.softness'),
        regionX: range(pick('regionX') ?? 0, 0, 1, 'waterfall.regionX'),
        regionY: range(pick('regionY') ?? 0, 0, 1, 'waterfall.regionY'),
        regionWidth: range(pick('regionWidth') ?? 1, .02, 1, 'waterfall.regionWidth'),
        regionHeight: range(pick('regionHeight') ?? 1, .02, 1, 'waterfall.regionHeight'),
      });
      if (kind === 'leaves') effect.textureLayerId = textureLayerId;
      kept.push(effect);
    } catch {
      // Drop the malformed effect; the rest of the project still loads.
    }
  }
  scene.atmosphere = kept;
}

const TAU = Math.PI * 2;
const rad = (degrees: number) => degrees * Math.PI / 180;
/** Uniform 0..1 value at a deterministic index; evaluation order is irrelevant. */
const unit = (seed: number, index: number, salt: number) => (seededValue(seed, index * 13 + salt * 7919) + 1) / 2;
const mix = (from: number, to: number, t: number) => from + (to - from) * t;
const wrap = (value: number, origin: number, size: number) => origin + (((value - origin) % size) + size) % size;
const smooth = (t: number) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };

export function atmosphereTargetLabel(scene: CameraSceneConfig, effect: AtmosphereEffect): string {
  if (effect.target !== 'layers' || !effect.layerIds?.length) return 'Whole scene';
  const names = effect.layerIds
    .map(id => scene.layers.find(layer => layer.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  return names.length ? names.join(', ') : 'Whole scene';
}

/** The scene-relative window a clip can occupy, used by the timeline and inspector. */
export function atmosphereWindow(scene: CameraSceneConfig, effect: AtmosphereEffect) {
  return { start: effect.start, end: effect.start + effect.duration, total: scene.totalFrames / scene.fps };
}

/**
 * Evaluate every active atmosphere effect at `seconds`.
 *
 * Layer adjustments are additive deltas that the caller merges onto the layer
 * pose (after layer effects, before camera projection). Overlays are declarative
 * and are rendered by the shared PixiJS scene. All motion derives from `seconds`
 * and `effect.seed`, so seeking to the same time always produces the same frame.
 */
export function evaluateAtmosphere(scene: CameraSceneConfig, seconds: number, intensity = 1): AtmosphereState {
  const state = emptyAtmosphere(scene);
  const amount = clamp(intensity, 0, 1);
  if (!scene.atmosphere?.length) return state;
  const time = Math.max(0, seconds);
  if (amount <= 0) return state;
  const allLayers = scene.layers.map(layer => layer.id);
  const adjust = (id: string) => (state.layers[id] ??= neutralAtmosphereLayer());
  const depthOf = (id: string) => resolvedDepth(scene, id);

  for (const effect of scene.atmosphere) {
    if (effect.enabled === false || !effect.kind) continue;
    const elapsed = time - effect.start;
    if (elapsed < 0 || elapsed > effect.duration + 1e-9) continue;
    const seed = effect.seed ?? 11;
    const scope = effect.target === 'layers' && effect.layerIds?.length ? effect.layerIds : allLayers;

    switch (effect.kind) {
      case 'foliage': {
        for (const [index, id] of scope.entries()) {
          const phase = rad(effect.phase ?? 0) + index * rad(effect.spread ?? 0);
          const sway = Math.sin(TAU * elapsed * (effect.speed ?? .3) + phase);
          const gust = drift(elapsed * .35 + index * 2.3, seed) * (effect.gust ?? .35);
          const direction = effect.direction === 1 ? -1 : 1;
          const angle = direction * (effect.strength ?? 3.5) * (sway * .65 + gust * .35) * amount;
          const movement = direction * (effect.movement ?? 4) * (sway * .4 + gust * .6) * amount;
          const layer = adjust(id);
          layer.rotation += angle;
          layer.x += movement * ((effect.pivotX ?? .5) - .5) * 2;
          layer.y += movement * ((effect.pivotY ?? 1) - .5) * .4;
        }
        break;
      }
      case 'clouds': {
        const period = effect.period ?? 12;
        const phase = TAU * elapsed / period;
        const periodic = effect.loop !== false || effect.tileable === true;
        const travelX = periodic ? (effect.driftX ?? 12) * .5 * Math.sin(phase) : (effect.driftX ?? 12) * elapsed;
        const travelY = periodic ? (effect.driftY ?? 0) * .5 * Math.sin(phase * .7) : (effect.driftY ?? 0) * elapsed;
        const dim = (effect.opacityVariation ?? .15) * (.5 + .5 * Math.sin(phase + seed));
        const scaleWave = (effect.scaleVariation ?? 0) * Math.sin(phase * .5 + seed);
        for (const id of scope) {
          const layer = adjust(id);
          layer.x += travelX * amount;
          layer.y += travelY * amount;
          layer.opacity *= 1 - dim * amount;
          layer.scale *= 1 + scaleWave * amount;
        }
        const sun = .5 + .5 * Math.sin(TAU * elapsed / (effect.sunPeriod ?? 14) + seed);
        state.sceneBrightness *= 1 - (effect.sunDim ?? .12) * sun * amount;
        break;
      }
      case 'haze': {
        const limit = effect.depthLimit ?? .55, feather = Math.max(.02, effect.feather ?? .35);
        for (const id of scope) {
          const depth = depthOf(id);
          const weight = smooth((limit - depth) / feather);
          if (weight <= 0) continue;
          const layer = adjust(id);
          const strength = (effect.intensity ?? .45) * weight * amount;
          layer.desaturate = Math.max(layer.desaturate, (effect.desaturate ?? .35) * strength);
          if (strength > layer.tintAmount) { layer.tint = effect.color ?? '#aebfc4'; layer.tintAmount = strength; }
          layer.brightness *= 1 + (effect.brightness ?? .04) * strength;
        }
        break;
      }
      case 'light': {
        const period = effect.period ?? 12;
        const wave = .62 * Math.sin(TAU * elapsed / period) + .38 * drift(elapsed * .35, seed);
        const gain = 1 + (effect.amount ?? .12) * wave * (1 + (effect.irregular ?? .3)) * amount;
        if (effect.target === 'layers') {
          for (const id of scope) {
            const layer = adjust(id);
            layer.brightness *= gain;
            if (layer.tintAmount < (effect.irregular ?? .3) * .25) {
              layer.tint = effect.color ?? '#ffe6bd';
              layer.tintAmount = (effect.irregular ?? .3) * .25 * amount;
            }
          }
        } else {
          state.sceneBrightness *= gain;
          const tintAmount = .12 * (effect.irregular ?? .3) * amount;
          if (tintAmount > state.sceneTint.amount) state.sceneTint = { color: effect.color ?? '#ffe6bd', amount: tintAmount };
        }
        break;
      }
      case 'depthBlur':
      case 'defocus': {
        const animated = effect.animate === true;
        const progress = effect.kind === 'depthBlur'
          ? mix(effect.focus ?? .55, effect.focusEnd ?? .8, animated ? smooth(elapsed / effect.duration) : 0)
          : 0;
        for (const id of scope) {
          const depth = depthOf(id);
          let weight: number;
          if (effect.kind === 'depthBlur') {
            weight = smooth((Math.abs(depth - progress) - (effect.range ?? .22)) / Math.max(.05, effect.falloff ?? 1.2));
          } else {
            const threshold = effect.depthThreshold ?? .78;
            weight = smooth((depth - threshold) / Math.max(.02, 1 - threshold));
          }
          if (weight <= 0) continue;
          const blur = (effect.strength ?? 5) * weight * amount;
          adjust(id).blur = Math.max(adjust(id).blur, blur);
        }
        break;
      }
      case 'fog': {
        const bands: FogBand[] = [];
        const count = Math.round(effect.bands ?? 2);
        for (let band = 0; band < count; band++) {
          const phase = elapsed * (effect.speed ?? .06) * 4 + band * 3.7;
          const offset = drift(phase, seed) * (effect.driftX ?? 6) * 6;
          bands.push({
            x: offset,
            y: (effect.level ?? .72) * scene.height - band * scene.height * .11 + drift(phase * .7, seed + 1) * (effect.driftY ?? -1) * 8,
            width: scene.width * (1.15 + (effect.coverage ?? .8) * .5),
            height: scene.height * (.1 + .24 * (effect.coverage ?? .8)),
            alpha: (effect.opacity ?? .3) * (effect.density ?? .45) * (.72 + .28 * (drift(phase * .3, seed + 2) + 1) / 2) * amount,
            drift: drift(phase, seed + 3) * 12,
          });
        }
        state.overlays.push({ type: 'fog', color: effect.color ?? '#cfd8cf', softness: effect.softness ?? .65, seed, bands });
        break;
      }
      case 'rays': {
        const rays: LightRay[] = [];
        const count = Math.round(effect.count ?? 4);
        const diagonal = Math.hypot(scene.width, scene.height);
        for (let index = 0; index < count; index++) {
          const spread = (effect.spread ?? 34) / Math.max(1, count);
          const angle = (effect.angle ?? 112) + (index - (count - 1) / 2) * spread + drift(elapsed * .2 + index, seed) * (effect.vary ?? .4) * 4;
          const length = (effect.rayLength ?? 90) / 100 * diagonal;
          const alpha = (effect.opacity ?? .18) * (.6 + .4 * (.5 + .5 * Math.sin(TAU * elapsed * (effect.speed ?? .04) + index))) * amount;
          rays.push({
            x: (effect.originX ?? .7) * scene.width + drift(elapsed * .1, seed + index) * 10,
            y: (effect.originY ?? .04) * scene.height,
            angle: -rad(angle),
            length,
            width: length * Math.tan(rad(effect.width ?? 6)) * 2,
            alpha,
          });
        }
        state.overlays.push({ type: 'rays', color: effect.color ?? '#fff2cc', rays });
        break;
      }
      case 'dust':
      case 'leaves':
      case 'snow':
      case 'fireflies':
      case 'rain': {
        const particles = particleField(scene, effect, elapsed, seed, amount);
        if (particles.length) {
          state.overlays.push({
            type: 'particles', variant: effect.kind,
            color: effect.kind === 'snow' && effect.mode === 'ash' ? '#b9b6b1' : effect.color ?? '#ffffff',
            textureLayerId: effect.textureLayerId,
            glow: effect.kind === 'fireflies' ? effect.glow ?? .7 : 0,
            particles,
          });
        }
        break;
      }
      case 'waterfall': {
        const particles = mistField(scene, effect, elapsed, seed, amount);
        if (particles.length) {
          state.overlays.push({ type: 'particles', variant: 'mist', color: effect.color ?? '#dfeaf0', glow: 0, particles });
        }
        const rings: RippleRing[] = [];
        const count = Math.round(effect.rippleCount ?? 3);
        for (let index = 0; index < count; index++) {
          const phase = ((elapsed * (effect.rippleSpeed ?? .6) + index / count) % 1 + 1) % 1;
          rings.push({
            x: (effect.regionX ?? 0) * scene.width + (index + .5) / count * (effect.regionWidth ?? 1) * scene.width + drift(elapsed * .2 + index, seed) * 20,
            y: (effect.regionY ?? .6) * scene.height + (effect.regionHeight ?? .4) * scene.height * (.75 + unit(seed, index, 2) * .2),
            radius: (effect.rippleRadius ?? 90) * (.15 + phase * (.45 + (effect.rippleAmplitude ?? .4) * .4)),
            width: 1 + (1 - phase) * 2,
            alpha: (effect.rippleOpacity ?? .25) * (1 - phase) * amount,
          });
        }
        state.overlays.push({ type: 'ripples', color: effect.color ?? '#dfeaf0', rings });
        break;
      }
      default: break;
    }
  }
  return state;
}

function regionOf(scene: CameraSceneConfig, effect: AtmosphereEffect) {
  return {
    x: (effect.regionX ?? 0) * scene.width,
    y: (effect.regionY ?? 0) * scene.height,
    width: Math.max(1, (effect.regionWidth ?? 1) * scene.width),
    height: Math.max(1, (effect.regionHeight ?? 1) * scene.height),
  };
}

/**
 * One deterministic field for dust, leaves, rain, snow and fireflies. Particle
 * indices, seeds and absolute elapsed time fully determine every value, so the
 * same timestamp always yields the same particle layout.
 */
function layerBounds(scene: CameraSceneConfig, ids: string[]) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const id of ids) {
    const layer = scene.layers.find(candidate => candidate.id === id);
    if (!layer) continue;
    const width = Math.max(1, (layer.width ?? scene.width) * (layer.scale ?? 1));
    const height = Math.max(1, (layer.height ?? scene.height) * (layer.scale ?? 1));
    const x = scene.width / 2 + (layer.x ?? 0), y = scene.height / 2 + (layer.y ?? 0);
    left = Math.min(left, x - width / 2); top = Math.min(top, y - height / 2);
    right = Math.max(right, x + width / 2); bottom = Math.max(bottom, y + height / 2);
  }
  if (!Number.isFinite(left) || !Number.isFinite(top) || right <= left || bottom <= top) return null;
  const clippedLeft = Math.max(0, left), clippedTop = Math.max(0, top);
  const clippedRight = Math.min(scene.width, right), clippedBottom = Math.min(scene.height, bottom);
  if (clippedRight <= clippedLeft || clippedBottom <= clippedTop) return null;
  return { x: clippedLeft, y: clippedTop, width: clippedRight - clippedLeft, height: clippedBottom - clippedTop };
}

function particleField(scene: CameraSceneConfig, effect: AtmosphereEffect, elapsed: number, seed: number, amount: number): AtmosphereParticle[] {
  let region = regionOf(scene, effect);
  if (effect.kind === 'leaves' && effect.target === 'layers' && effect.layerIds?.length) {
    const bounds = layerBounds(scene, effect.layerIds);
    if (bounds) {
      const right = Math.min(region.x + region.width, bounds.x + bounds.width);
      const bottom = Math.min(region.y + region.height, bounds.y + bounds.height);
      const left = Math.max(region.x, bounds.x), top = Math.max(region.y, bounds.y);
      region = right - left > 4 && bottom - top > 4
        ? { x: left, y: top, width: right - left, height: bottom - top }
        : bounds;
    }
  }
  const count = Math.round(effect.count ?? 20);
  const minSize = effect.sizeMin ?? 2, maxSize = Math.max(minSize, effect.sizeMax ?? 6);
  const minOpacity = effect.opacityMin ?? .2, maxOpacity = Math.max(minOpacity, effect.opacityMax ?? .8);
  const depthSpread = effect.depthSpread ?? .6;
  const lifetime = effect.lifetime ?? 10;
  const particles: AtmosphereParticle[] = [];
  const direction = rad(effect.direction ?? 90);

  for (let index = 0; index < count; index++) {
    const depth = unit(seed, index, 2);
    const sizeScale = .55 + depth * depthSpread * .9;
    const opacity = mix(minOpacity, maxOpacity, unit(seed, index, 3));
    const phase = ((elapsed / lifetime) + unit(seed, index, 1)) % 1;
    const baseX = region.x + unit(seed, index, 4) * region.width;
    const baseY = region.y + unit(seed, index, 5) * region.height;

    if (effect.kind === 'rain') {
      const travel = elapsed * (effect.speed ?? 700) * (.55 + depth * depthSpread * .9);
      const angle = rad(effect.angle ?? 12);
      const x = wrap(baseX + travel * Math.tan(angle), region.x, region.width);
      const y = wrap(baseY + travel, region.y, region.height);
      const foreground = unit(seed, index, 7) < (effect.droplets ?? .3);
      particles.push({
        x, y,
        size: (effect.streakLength ?? 22) * (foreground ? 2.4 : 1),
        width: (effect.streakWidth ?? 1.4) * (foreground ? 2.6 : 1),
        opacity: opacity * (.5 + .5 * depthSpread) * (foreground ? 1.2 : .8) * amount,
        rotation: -angle,
      });
      continue;
    }

    if (effect.kind === 'fireflies') {
      const pulse = effect.pulse ?? 2.5;
      const wobble = effect.oscillation ?? .7;
      const x = baseX + Math.sin(TAU * elapsed / pulse + index * 1.7) * 26 * wobble;
      const y = baseY + Math.cos(TAU * elapsed / (pulse * 1.3) + index * 2.3) * 18 * wobble + Math.sin(TAU * elapsed / lifetime + index) * 6;
      const glow = .25 + .75 * (.5 + .5 * Math.sin(TAU * elapsed / pulse * 1.6 + index));
      particles.push({ x, y, size: mix(2, effect.size ?? 4, depth) * sizeScale, opacity: opacity * glow * amount, rotation: 0 });
      continue;
    }

    if (effect.kind === 'snow') {
      const speed = (effect.speed ?? 40) * (.5 + depth * depthSpread);
      const fall = elapsed * speed;
      const x = wrap(baseX + Math.sin(TAU * elapsed / lifetime + index * 1.9) * (effect.oscillation ?? .7) * 42 * (1 + depth),
        region.x, region.width);
      const y = wrap(baseY + fall, region.y, region.height);
      const ash = effect.mode === 'ash';
      particles.push({
        x, y,
        size: mix(minSize, maxSize, unit(seed, index, 6)) * sizeScale * (ash ? .7 : 1),
        opacity: opacity * (ash ? .7 : 1),
        rotation: ash ? elapsed * (effect.rotationSpeed ?? 0) + index * 40 : index * 30,
      });
      continue;
    }

    // Dust and leaves drift with the wind, wrap inside the region and fade gently.
    const speed = (effect.speed ?? 18) * (.5 + depth * depthSpread);
    const wind = effect.direction ?? 90;
    const horizontal = Math.cos(rad(wind)) * speed * elapsed;
    const vertical = Math.sin(rad(wind)) * speed * elapsed * .35;
    const sway = drift(elapsed * .6 + index * 1.7, seed) * (effect.drift ?? .5) * 60;
    const x = wrap(baseX + horizontal + sway, region.x, region.width);
    const y = wrap(baseY + vertical + drift(elapsed * .35 + index, seed) * 20, region.y, region.height);
    const fade = effect.kind === 'leaves' ? .7 + .3 * Math.sin(Math.PI * phase) : Math.sin(Math.PI * phase);
    const size = mix(minSize, maxSize, unit(seed, index, 6)) * sizeScale;
    particles.push({
      x, y, size,
      opacity: opacity * fade,
      rotation: effect.kind === 'leaves' ? index * 47 + elapsed * (effect.rotationSpeed ?? 25) : index * 19,
    });
  }
  return particles;
}

function mistField(scene: CameraSceneConfig, effect: AtmosphereEffect, elapsed: number, seed: number, amount: number): AtmosphereParticle[] {
  const region = regionOf(scene, effect);
  const count = Math.round(effect.mistCount ?? 24);
  const particles: AtmosphereParticle[] = [];
  for (let index = 0; index < count; index++) {
    const phase = ((elapsed * (effect.mistSpeed ?? 40) / region.height) + unit(seed, index, 1)) % 1;
    const x = region.x + unit(seed, index, 2) * region.width + Math.sin(TAU * phase + index) * 18 * (effect.mistSoftness ?? .7);
    const y = region.y + region.height * (1 - phase);
    const size = (effect.mistSize ?? 10) * (.7 + phase * 1.5) * (.6 + unit(seed, index, 3) * .8);
    particles.push({ x, y, size, opacity: (effect.mistOpacity ?? .3) * Math.sin(Math.PI * phase) * amount, rotation: 0 });
  }
  return particles;
}
