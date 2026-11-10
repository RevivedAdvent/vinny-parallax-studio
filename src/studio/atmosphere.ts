import type { CameraSceneConfig } from '../camera/types.ts';
import { sceneDuration } from '../camera/animation.ts';
import {
  atmosphereCatalogue, atmosphereDefaults, atmosphereDescriptions, atmosphereGroupNames, atmosphereNames,
  atmosphereGroups, atmosphereTargetLabel, type AtmosphereEffect, type AtmosphereKind,
} from '../camera/atmosphere.ts';
import { bindNumberSteppers, numberFieldHtml } from './number-stepper.ts';

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const pct = (value: number) => Math.round(value * 1000) / 10;
const layerRequired: AtmosphereKind[] = ['foliage', 'clouds'];
const layerOptional: AtmosphereKind[] = ['haze', 'light', 'defocus', 'leaves'];

interface NumSpec { type: 'num'; id: string; key: keyof AtmosphereEffect; label: string; min: number; max: number; step?: number; scale?: number }
interface ColorSpec { type: 'color'; id: string; key: 'color'; label: string }
interface CheckSpec { type: 'check'; id: string; key: keyof AtmosphereEffect; label: string }
interface SelectSpec { type: 'select'; id: string; key: keyof AtmosphereEffect; label: string; options: [string, string][]; numeric?: boolean }
type FieldSpec = NumSpec | ColorSpec | CheckSpec | SelectSpec;

/* Track which catalogue categories are expanded */
const categoriesOpen = new Map<string, boolean>([['ATMOSPHERE & DEPTH', true]]);

export function createAtmosphereWorkspace(options: {
  getScene: () => CameraSceneConfig; getSceneKey: () => string; getTime: () => number; seek: (seconds: number) => void;
  commit: (scene: CameraSceneConfig) => Promise<void>; notify: (message: string) => void;
}) {
  let preset: AtmosphereKind | '' = '', editing = '', sceneKey = '';
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

  /* ---- Reusable section helpers (match Parallax) ---- */
  const basicSection = (body: string) =>
    `<section class="parallax-settings" data-settings="basic"><h4 class="parallax-settings-title">Basic settings</h4>${body}</section>`;
  const advancedSection = (body: string) =>
    `<details class="parallax-advanced"><summary>Advanced settings</summary><div class="parallax-advanced-body">${body}</div></details>`;
  const subsectionLabel = (text: string) =>
    `<div class="parallax-settings-subtitle">${text}</div>`;

  async function save(next: CameraSceneConfig) {
    try { await options.commit(next); render(); } catch (e) { options.notify(String(e)); }
  }

  /* ---- Catalogue rendering ---- */
  function catalogueHtml(): string {
    return `<div id="atmosphere-categories" class="parallax-categories">${atmosphereCatalogue.map(section => {
      const open = categoriesOpen.get(section.group) ?? false;
      return `<details class="parallax-category atmosphere-category" data-category="${escape(section.group)}" ${open ? 'open' : ''}>
        <summary class="parallax-category-head">
          <span class="parallax-category-name">${escape(section.group)}</span>
          <span class="parallax-category-count">${section.kinds.length}</span>
        </summary>
        <div class="parallax-catalogue">${section.kinds.map(kind =>
          `<button type="button" data-atmosphere="${kind}" class="camera-card ${preset === kind ? 'selected' : ''}" aria-pressed="${preset === kind}"><b>${escape(atmosphereNames[kind])}</b><span>${escape(atmosphereDescriptions[kind])}</span></button>`).join('')}
        </div>
      </details>`;
    }).join('')}</div>`;
  }

  function wireCatalogue() {
    const host = $('atmosphere-categories');
    if (!host) return;
    host.querySelectorAll<HTMLButtonElement>('[data-atmosphere]').forEach(button => {
      button.onclick = () => { preset = button.dataset.atmosphere as AtmosphereKind; editing = ''; render(); };
    });
    host.querySelectorAll<HTMLDetailsElement>('.atmosphere-category').forEach(details => {
      details.addEventListener('toggle', () => categoriesOpen.set(details.dataset.category ?? '', details.open));
    });
  }

  function render() {
    const cfg = options.getScene();
    if (sceneKey !== options.getSceneKey()) { sceneKey = options.getSceneKey(); preset = ''; editing = ''; }
    if (editing && !(cfg.atmosphere ?? []).some(effect => effect.id === editing)) editing = '';

    /* Render the four-category catalogue */
    const catHost = $('atmosphere-categories');
    if (catHost) { catHost.outerHTML = catalogueHtml(); wireCatalogue(); }

    renderApplied(cfg);
    renderInspector(cfg);
    updateTime();
  }

  function renderApplied(cfg: CameraSceneConfig) {
    const host = $('atmosphere-effects-list');
    if (!host) return;
    const effects = [...(cfg.atmosphere ?? [])].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    host.innerHTML = effects.length ? effects.map(effect =>
      `<div class="parallax-item ${editing === effect.id ? 'selected' : ''}">
        <div><b>${escape(atmosphereNames[effect.kind])}</b><small>${escape(atmosphereGroupNames[atmosphereGroups[effect.kind]])} · ${escape(atmosphereTargetLabel(cfg, effect))} · ${effect.start.toFixed(2)}s + ${effect.duration.toFixed(2)}s${effect.loop !== false ? ' · loop' : ''}</small></div>
        <div class="parallax-actions"><button type="button" data-atmos-edit="${effect.id}">Edit</button><button type="button" data-atmos-copy="${effect.id}">Duplicate</button><button type="button" data-atmos-delete="${effect.id}">Delete</button></div>
      </div>`).join('') : '<p class="parallax-empty">No atmosphere effects yet. Choose one above.</p>';
    const appliedCount = $('atmosphere-count');
    if (appliedCount) appliedCount.textContent = String(effects.length);
    host.querySelectorAll<HTMLButtonElement>('[data-atmos-edit]').forEach(button => button.onclick = () => {
      const effect = cfg.atmosphere?.find(e => e.id === button.dataset.atmosEdit);
      if (!effect) return;
      preset = effect.kind; editing = effect.id; render();
    });
    host.querySelectorAll<HTMLButtonElement>('[data-atmos-copy]').forEach(button => button.onclick = () => {
      const effect = cfg.atmosphere?.find(e => e.id === button.dataset.atmosCopy);
      if (!effect) return;
      const copy = { ...structuredClone(effect), id: crypto.randomUUID() };
      const next = structuredClone(cfg);
      next.atmosphere = [...(next.atmosphere ?? []), copy];
      preset = copy.kind; editing = copy.id; void save(next);
    });
    host.querySelectorAll<HTMLButtonElement>('[data-atmos-delete]').forEach(button => button.onclick = () => {
      if (!confirm('Delete this atmosphere effect?')) return;
      const next = structuredClone(cfg);
      next.atmosphere = (next.atmosphere ?? []).filter(effect => effect.id !== button.dataset.atmosDelete);
      if (editing === button.dataset.atmosDelete) editing = '';
      void save(next);
    });
  }

  /* ---- Field spec helpers ---- */
  const num = (key: keyof AtmosphereEffect, label: string, min: number, max: number, config: { step?: number; scale?: number } = {}): NumSpec =>
    ({ type: 'num', id: `atmos-${String(key)}`, key, label, min, max, ...config });
  const color = (label = 'Colour'): ColorSpec => ({ type: 'color', id: 'atmos-color', key: 'color', label });
  const check = (key: keyof AtmosphereEffect, label: string): CheckSpec => ({ type: 'check', id: `atmos-${String(key)}`, key, label });
  const region = (): FieldSpec[] => [
    num('regionX', 'Region X · % of frame', 0, 100, { scale: 100 }),
    num('regionY', 'Region Y · % of frame', 0, 100, { scale: 100 }),
    num('regionWidth', 'Region width · % of frame', 2, 100, { scale: 100 }),
    num('regionHeight', 'Region height · % of frame', 2, 100, { scale: 100 }),
  ];

  /* ---- Basic/Advanced field split per effect ---- */
  function basicSpecs(kind: AtmosphereKind, e: AtmosphereEffect): FieldSpec[] {
    switch (kind) {
      case 'fog': return [
        num('level', 'Height · %', 0, 100, { scale: 100 }),
        num('density', 'Density · %', 0, 100, { scale: 100 }),
        num('opacity', 'Opacity · %', 0, 90, { scale: 100 }),
        num('speed', 'Drift Speed · cycles/sec', .01, 1, { step: .01 }),
        color(),
      ];
      case 'haze': return [
        num('intensity', 'Haze Intensity · %', 0, 100, { scale: 100 }),
        num('depthLimit', 'Maximum Affected Depth · %', 5, 100, { scale: 100 }),
        color(),
      ];
      case 'rays': return [
        num('angle', 'Direction · degrees', -180, 180),
        num('opacity', 'Opacity / Intensity · %', 0, 60, { scale: 100 }),
        color(),
      ];
      case 'depthBlur': return [
        num('focus', 'Focus Plane · %', 0, 100, { scale: 100 }),
        num('range', 'In-Focus Range · %', 2, 100, { scale: 100 }),
        num('strength', 'Maximum Blur · px', 0, 16),
      ];
      case 'defocus': return [
        num('strength', 'Foreground Blur Strength · px', 0, 16),
        num('depthThreshold', 'Near Depth Threshold · %', 30, 100, { scale: 100 }),
      ];
      case 'light': return [
        num('brightness', 'Base Brightness · ×', .25, 2, { step: .01 }),
        num('amount', 'Variation Amount · %', 0, 100, { scale: 100 }),
        color(),
      ];
      case 'dust': return [
        num('count', 'Particle Count', 1, 120),
        num('sizeMin', 'Minimum Size · px', 1, 40),
        num('sizeMax', 'Maximum Size · px', 1, 60),
        num('opacityMin', 'Minimum Opacity · %', 0, 100, { scale: 100 }),
        num('opacityMax', 'Maximum Opacity · %', 0, 100, { scale: 100 }),
        num('speed', 'Drift Speed · px/sec', 0, 200),
        color(),
      ];
      case 'leaves': return [
        num('count', 'Particle Count', 1, 40),
        num('sizeMin', 'Minimum Size · px', 2, 120),
        num('sizeMax', 'Maximum Size · px', 2, 140),
        num('opacityMin', 'Minimum Opacity · %', 0, 100, { scale: 100 }),
        num('opacityMax', 'Maximum Opacity · %', 0, 100, { scale: 100 }),
        num('speed', 'Drift Speed · px/sec', 0, 200),
        num('rotationSpeed', 'Rotation Speed · degrees/sec', -360, 360),
        color(),
      ];
      case 'fireflies': return [
        num('count', 'Particle Count', 1, 60),
        num('size', 'Glow Size · px', 1, 80),
        num('glow', 'Glow Intensity · %', 0, 100, { scale: 100 }),
        num('opacity', 'Opacity · %', 0, 100, { scale: 100 }),
        num('speed', 'Drift Speed · px/sec', 0, 100),
        color(),
      ];
      case 'rain': return [
        num('count', 'Rain Amount / Streak Count', 1, 160),
        num('speed', 'Fall Speed · px/sec', 0, 1400),
        num('opacity', 'Opacity · %', 0, 100, { scale: 100 }),
        num('droplets', 'Foreground Droplets · %', 0, 100, { scale: 100 }),
        color(),
      ];
      case 'snow': return [
        { type: 'select', id: 'atmos-mode', key: 'mode', label: 'Character', options: [['snow', 'Snow'], ['ash', 'Ash']] } as SelectSpec,
        num('count', 'Particle Count', 1, 140),
        num('sizeMin', 'Minimum Size · px', 1, 30),
        num('sizeMax', 'Maximum Size · px', 1, 60),
        num('speed', 'Fall Speed · px/sec', 0, 300),
        color(),
      ];
      case 'foliage': return [
        { type: 'select', id: 'atmos-direction', key: 'direction', label: 'Wind Direction', options: [['0', 'From the right · push left'], ['1', 'From the left · push right']], numeric: true } as SelectSpec,
        num('strength', 'Wind Strength / Rotation Amplitude · degrees', 0, 20, { step: .1 }),
        num('speed', 'Wind Speed · cycles/sec', .02, 2, { step: .01 }),
        num('gust', 'Gust Intensity · %', 0, 100, { scale: 100 }),
      ];
      case 'clouds': return [
        num('driftX', 'Horizontal Drift · px', -200, 200),
        num('driftY', 'Vertical Drift · px', -100, 100),
        num('period', 'Movement Period · seconds', 1, 240),
        num('sunDim', 'Sunlight Dimming · %', 0, 100, { scale: 100 }),
      ];
      case 'waterfall': return [
        num('mistSpeed', 'Mist Speed · px/sec', 0, 300),
        num('mistOpacity', 'Mist Opacity / Intensity · %', 0, 100, { scale: 100 }),
        num('rippleOpacity', 'Ripple Opacity / Intensity · %', 0, 100, { scale: 100 }),
        color(),
      ];
      default: return [];
    }
  }

  function advancedSpecs(kind: AtmosphereKind, e: AtmosphereEffect): FieldSpec[] {
    switch (kind) {
      case 'fog': return [
        num('bands', 'Number of Bands', 1, 4),
        num('coverage', 'Coverage · %', 10, 100, { scale: 100 }),
        num('softness', 'Edge Softness · %', 0, 100, { scale: 100 }),
        num('driftX', 'Horizontal Drift · px', -60, 60),
        num('driftY', 'Vertical Lift · px', -20, 20),
        num('period', 'Drift Period · seconds', 1, 120),
      ];
      case 'haze': return [
        num('feather', 'Transition Feather · %', 0, 100, { scale: 100 }),
        num('desaturate', 'Desaturation · %', 0, 100, { scale: 100 }),
        num('brightness', 'Brightness Lift · %', -50, 50, { scale: 100 }),
      ];
      case 'rays': return [
        num('originX', 'Origin X · % of frame', 0, 100, { scale: 100 }),
        num('originY', 'Origin Y · % of frame', 0, 100, { scale: 100 }),
        num('count', 'Number of Rays', 1, 8),
        num('width', 'Ray Width · degrees', 1, 24),
        num('rayLength', 'Ray Length · % of frame', 10, 160),
        num('spread', 'Fan Spread · degrees', 0, 160),
        num('vary', 'Variation · %', 0, 100, { scale: 100 }),
        num('speed', 'Shimmer Speed', 0, .5, { step: .01 }),
      ];
      case 'depthBlur': return [
        num('falloff', 'Falloff', .2, 3, { step: .1 }),
        check('animate', 'Animate Focus'),
        num('focusEnd', 'Ending Focus Plane · %', 0, 100, { scale: 100 }),
      ];
      case 'defocus': return [
        num('softness', 'Edge Softness · %', 0, 100, { scale: 100 }),
        check('animate', 'Animate Focus'),
        num('amount', 'Animation Amount · %', 0, 100, { scale: 100 }),
      ];
      case 'light': return [
        num('speed', 'Variation Speed', .01, 2, { step: .01 }),
        num('irregular', 'Irregularity · %', 0, 100, { scale: 100 }),
        num('period', 'Period · seconds', 1, 120),
      ];
      case 'dust': return [
        num('direction', 'Direction · degrees', -180, 180),
        num('lifetime', 'Particle Lifetime · seconds', .5, 60),
        num('depthSpread', 'Depth Spread · %', 0, 100, { scale: 100 }),
        num('drift', 'Irregularity · %', 0, 100, { scale: 100 }),
        ...region(),
        num('seed', 'Variation Seed', 0, 2147483647),
      ];
      case 'leaves': return [
        num('direction', 'Direction · degrees', -180, 180),
        num('lifetime', 'Particle Lifetime · seconds', .5, 60),
        num('drift', 'Irregularity · %', 0, 100, { scale: 100 }),
        num('depthSpread', 'Depth Spread · %', 0, 100, { scale: 100 }),
        ...region(),
        num('seed', 'Variation Seed', 0, 2147483647),
      ];
      case 'fireflies': return [
        num('lifetime', 'Particle Lifetime · seconds', .5, 60),
        num('pulse', 'Pulse Period · seconds', .2, 20, { step: .1 }),
        num('depthSpread', 'Depth Spread · %', 0, 100, { scale: 100 }),
      ];
      case 'rain': return [
        num('angle', 'Slant Angle · degrees', -60, 60),
        num('streakLength', 'Streak Length · px', 2, 80),
        num('streakWidth', 'Streak Width · px', .5, 6, { step: .1 }),
        num('depthSpread', 'Depth Spread · %', 0, 100, { scale: 100 }),
        ...region(),
        num('seed', 'Variation Seed', 0, 2147483647),
      ];
      case 'snow': return [
        num('opacityMin', 'Minimum Opacity · %', 0, 100, { scale: 100 }),
        num('opacityMax', 'Maximum Opacity · %', 0, 100, { scale: 100 }),
        num('oscillation', 'Sideways Sway · %', 0, 100, { scale: 100 }),
        num('rotationSpeed', 'Ash Rotation Speed · degrees/sec', -360, 360),
        num('lifetime', 'Particle Lifetime · seconds', .5, 60),
        num('depthSpread', 'Depth Spread · %', 0, 100, { scale: 100 }),
        ...region(),
        num('seed', 'Variation Seed', 0, 2147483647),
      ];
      case 'foliage': return [
        num('phase', 'Phase · degrees', -360, 360),
        num('spread', 'Phase Spread Per Layer · degrees', 0, 180),
        num('movement', 'Secondary Movement · px', 0, 60),
        num('pivotX', 'Pivot X · % of layer', 0, 100, { scale: 100 }),
        num('pivotY', 'Pivot Y · % of layer', 0, 100, { scale: 100 }),
      ];
      case 'clouds': return [
        num('opacityVariation', 'Opacity Variation · %', 0, 100, { scale: 100 }),
        num('scaleVariation', 'Scale Variation · %', 0, 50, { scale: 100 }),
        check('tileable', 'Seamless Oscillation'),
        num('sunPeriod', 'Sunlight Period · seconds', 1, 240),
      ];
      case 'waterfall': return [
        num('mistCount', 'Mist Count', 1, 60),
        num('mistSize', 'Mist Size · px', 2, 80),
        num('mistSoftness', 'Mist Softness · %', 0, 100, { scale: 100 }),
        num('softness', 'Mist Spread · %', 0, 100, { scale: 100 }),
        num('rippleCount', 'Ripple Count', 1, 6),
        num('rippleRadius', 'Ripple Radius · px', 10, 300),
        num('rippleSpeed', 'Ripple Speed', .05, 3, { step: .05 }),
        num('rippleSpacing', 'Ripple Spacing · px', 10, 400),
        ...region(),
      ];
      default: return [];
    }
  }

  /** Combined specs for form submission — basic then advanced, preserving all fields */
  function allSpecs(kind: AtmosphereKind, e: AtmosphereEffect): FieldSpec[] {
    return [...basicSpecs(kind, e), ...advancedSpecs(kind, e)];
  }

  function renderInspector(cfg: CameraSceneConfig) {
    const host = $('atmosphere-inspector');
    if (!host) return;
    bindNumberSteppers(host);
    const duration = sceneDuration(cfg);
    if (!preset) {
      host.innerHTML = '<h3>Atmosphere and visual effects</h3><p class="animation-note">Environmental treatments are evaluated from absolute scene time and rendered by the shared preview. Choose an effect above to add it.</p>';
      return;
    }
    const kind: AtmosphereKind = preset;
    const existing = (cfg.atmosphere ?? []).find(effect => effect.id === editing);
    const defaults = atmosphereDefaults(kind);
    const start = existing?.start ?? Math.min(options.getTime(), Math.max(0, duration - 1));
    const length = existing?.duration ?? Math.min(3, Math.max(.25, duration - start));
    const base = { id: existing?.id ?? '', kind, start, duration: length, ...defaults, ...existing } as AtmosphereEffect;

    const basicList = basicSpecs(kind, base);
    const advancedList = advancedSpecs(kind, base);

    /* ---- Timing subsection (inside Basic) ---- */
    const timing = `${subsectionLabel('Timing')}
      ${numberFieldHtml('atmos-start', 'Start · seconds', Number(start.toFixed(3)), 0, duration, 'any', false)}
      ${numberFieldHtml('atmos-duration', 'Duration · seconds', Number(length.toFixed(3)), .01, Number(Math.max(.01, duration - start).toFixed(3)), 'any', false)}
      <label class="field"><span>Repeats inside the clip</span><input id="atmos-loop" type="checkbox" ${base.loop !== false ? 'checked' : ''}></label>`;

    /* ---- Target mode (for optional/required layer effects) ---- */
    const target = layerOptional.includes(kind) ? `
      <label class="field">Target<select id="atmos-target-mode">
        <option value="scene" ${base.target !== 'layers' ? 'selected' : ''}>Whole scene</option>
        <option value="layers" ${base.target === 'layers' ? 'selected' : ''}>Selected layers</option>
      </select></label>` : '';
    const layerPicker = layerRequired.includes(kind) || layerOptional.includes(kind) ? `
      <fieldset class="parallax-layers"><legend>${layerRequired.includes(kind) ? 'Target layers' : 'Layer selection'}</legend>
        ${cfg.layers.map(layer => `<label class="field"><span>${escape(layer.name)}</span><input type="checkbox" name="atmos-layer" value="${escape(layer.id)}" ${(base.layerIds ?? []).includes(layer.id) ? 'checked' : ''}></label>`).join('') || '<p class="parallax-empty">Import artwork first.</p>'}
      </fieldset>` : '';
    const textureLayer = kind === 'leaves' ? `
      <label class="field">Leaf Artwork Source<select id="atmos-texture-layer">
        <option value="">Foreground layer (automatic)</option>
        ${cfg.layers.map(layer => `<option value="${escape(layer.id)}" ${base.textureLayerId === layer.id ? 'selected' : ''}>${escape(layer.name)}</option>`).join('')}
      </select></label>` : '';

    /* ---- Scope help text ---- */
    const targetHelp = layerRequired.includes(kind)
      ? 'This effect requires at least one layer.'
      : layerOptional.includes(kind)
        ? 'Whole scene applies the treatment to every plane; selected layers restrict it.'
        : 'This effect is scene-wide.';
    const scopeHelp = kind === 'haze' ? 'Depth limit uses the layer depth stored in Arrange.'
      : kind === 'rays' ? 'Light rays are a stylized 2D approximation, not volumetric lighting.'
        : kind === 'waterfall' ? 'Position the region over the water; ripples are drawn on the lower edge.'
          : kind === 'depthBlur' || kind === 'defocus' ? 'Blur is added to the existing camera focus blur and capped for performance.'
            : kind === 'light' ? 'Changes flatten and brighten the whole frame gradually; there is no flicker.'
              : 'All motion is deterministic at any seek position.';

    /* ---- Render the basic and advanced field HTML ---- */
    const basicFieldsHtml = basicList.map(spec => fieldHtml(spec, base)).join('');
    /* The leaf artwork source sits next to the other Leaves particle settings, before the seed. */
    const advancedParts = advancedList.map(spec => fieldHtml(spec, base));
    if (kind === 'leaves') advancedParts.splice(Math.max(0, advancedParts.length - 1), 0, textureLayer);
    const advancedFieldsHtml = advancedParts.join('');

    /* ---- Action buttons ---- */
    const actions = `<div class="row-actions"><button class="outline" type="submit">${existing ? 'Update effect' : 'Add effect'}</button>${existing ? '<button type="button" id="atmosphere-add-another">＋ Add another</button><button type="button" id="atmosphere-cancel">Cancel edit</button>' : ''}</div>`;

    /* ---- Build the full inspector ---- */
    host.innerHTML = `<h3>${escape(atmosphereNames[kind])}</h3><p class="animation-note">${escape(atmosphereDescriptions[kind])}</p>
      <form id="atmosphere-form">
        ${basicSection(`${target}${layerPicker}${basicFieldsHtml}${timing}`)}
        ${advancedList.length ? advancedSection(`${advancedFieldsHtml}<p class="parallax-compat-note">${escape(scopeHelp)}</p>`) : ''}
        <p class="animation-note">${escape(targetHelp)}</p>
        ${actions}
      </form>`;

    if (existing) {
      $('atmosphere-cancel').onclick = () => { editing = ''; render(); };
      $('atmosphere-add-another').onclick = () => { editing = ''; render(); };
    }

    /* ---- Form submission (identical logic to current, but using allSpecs) ---- */
    $('atmosphere-form').onsubmit = event => {
      event.preventDefault();
      try {
        const list = allSpecs(kind, base);
        const startValue = $<HTMLInputElement>('atmos-start').valueAsNumber;
        const durationValue = $<HTMLInputElement>('atmos-duration').valueAsNumber;
        if (!Number.isFinite(startValue) || !Number.isFinite(durationValue) || durationValue <= 0) throw new Error('Enter a valid start and duration.');
        if (startValue < 0 || startValue > duration || startValue + durationValue > duration + 1e-9) throw new Error(`The clip must fit within the ${duration.toFixed(2)}s scene.`);
        const built: AtmosphereEffect = structuredClone(base);
        built.id = existing?.id ?? crypto.randomUUID();
        built.start = startValue;
        built.duration = Math.min(durationValue, duration - startValue);
        built.loop = $<HTMLInputElement>('atmos-loop').checked;
        if (kind === 'leaves') {
          const texture = $<HTMLSelectElement>('atmos-texture-layer').value || undefined;
          built.textureLayerId = texture;
        }
        const picked = [...document.querySelectorAll<HTMLInputElement>('input[name=atmos-layer]:checked')].map(input => input.value);
        const modeElement = document.getElementById('atmos-target-mode') as HTMLSelectElement | null;
        const mode = modeElement?.value ?? 'scene';
        if (layerRequired.includes(kind)) {
          if (!picked.length) throw new Error('Select at least one layer.');
          built.target = 'layers'; built.layerIds = picked;
        } else if (layerOptional.includes(kind)) {
          if (mode === 'layers') {
            if (!picked.length) throw new Error('Select at least one layer.');
            built.target = 'layers'; built.layerIds = picked;
          } else { built.target = 'scene'; built.layerIds = []; }
        } else {
          built.target = 'scene'; built.layerIds = [];
        }
        for (const spec of list) {
          const element = document.getElementById(spec.id) as HTMLInputElement | HTMLSelectElement | null;
          if (!element) continue;
          if (spec.type === 'num') {
            const raw = (element as HTMLInputElement).valueAsNumber;
            if (!Number.isFinite(raw)) throw new Error(`${spec.label} must be a number.`);
            (built as unknown as Record<string, unknown>)[spec.key] = spec.scale ? raw / spec.scale : raw;
          } else if (spec.type === 'check') (built as unknown as Record<string, unknown>)[spec.key] = (element as HTMLInputElement).checked;
          else if (spec.type === 'select') (built as unknown as Record<string, unknown>)[spec.key] = spec.numeric ? Number((element as HTMLSelectElement).value) : (element as HTMLSelectElement).value;
          else (built as unknown as Record<string, unknown>)[spec.key] = (element as HTMLInputElement).value;
        }
        const next = structuredClone(cfg);
        next.atmosphere = existing
          ? (next.atmosphere ?? []).map(effect => effect.id === existing.id ? built : effect)
          : [...(next.atmosphere ?? []), built];
        editing = built.id;
        void save(next);
      } catch (error) { options.notify(error instanceof Error ? error.message : String(error)); }
    };
  }

  function fieldHtml(spec: FieldSpec, model: AtmosphereEffect) {
    const raw = model[spec.key];
    if (spec.type === 'num') {
      const value = typeof raw === 'number' ? raw : 0;
      const shown = Math.max(spec.min, Math.min(spec.max, spec.scale ? value * spec.scale : value));
      const rounded = Math.round(shown * 1000) / 1000;
      return numberFieldHtml(spec.id, spec.label, rounded, spec.min, spec.max, spec.step ?? 'any', false);
    }
    if (spec.type === 'check') return `<label class="field"><span>${escape(spec.label)}</span><input id="${spec.id}" type="checkbox" ${raw === true ? 'checked' : ''}></label>`;
    if (spec.type === 'select') {
      const value = raw === undefined || raw === null ? spec.options[0]?.[0] : String(raw);
      return `<label class="field">${escape(spec.label)}<select id="${spec.id}">${spec.options.map(([option, label]) =>
        `<option value="${escape(option)}" ${value === option ? 'selected' : ''}>${escape(label)}</option>`).join('')}</select></label>`;
    }
    return `<label class="field">${escape(spec.label)}<input id="${spec.id}" type="color" value="${typeof raw === 'string' ? raw : '#ffffff'}"></label>`;
  }

  function updateTime() {
    const clock = $('atmosphere-clock');
    if (clock) clock.textContent = `${options.getTime().toFixed(2)}s / ${sceneDuration(options.getScene()).toFixed(2)}s`;
  }

  /** Open a specific applied effect, used by the Timeline workspace's Edit action. */
  function open(effectId: string) {
    const effect = (options.getScene().atmosphere ?? []).find(candidate => candidate.id === effectId);
    if (!effect) return;
    preset = effect.kind; editing = effect.id; render();
  }

  return { render, updateTime, open };
}
