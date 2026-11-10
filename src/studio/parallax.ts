import type { CameraSceneConfig } from '../camera/types.ts';
import { sceneDuration } from '../camera/animation.ts';
import type {
  AmbientDirection, AmbientMode, AmbientMotion, DriftAxis, DriftMotion, FrameDirection,
  LayerEffect, LayerEffectKind, MaskKind, WindDirection,
} from '../camera/layer-effects.ts';
import {
  arrangeTargets, createPickerState, defaultTargetId, escapeHtml as escape, folderGroups,
  mountTargetPicker, type PickerState, type TargetMode,
} from './parallax-layers.ts';

type Feature = 'depth' | 'depthScale' | 'planes' | LayerEffectKind;

interface CatalogueItem { id: Feature; name: string; description: string }
interface Category { id: string; name: string; items: CatalogueItem[] }

/**
 * Four authoring categories replace the previous two broad sections. The
 * effects themselves are unchanged; only discovery and presentation change.
 */
const categories: Category[] = [
  {
    id: 'depth', name: 'Depth & Perspective',
    items: [
      { id: 'depth', name: 'Depth-based parallax', description: 'Control how strongly each layer responds to virtual-camera translation. 100% is the natural physical response.' },
      { id: 'depthScale', name: 'Depth-based Scale', description: 'Art-direct layer size from depth on top of the camera\u2019s natural perspective.' },
      { id: 'planes', name: 'Depth Planes', description: 'Assign layers to shared depths so they project and react as one physical plane.' },
    ],
  },
  {
    id: 'motion', name: 'Layer Motion',
    items: [
      { id: 'drift', name: 'Independent layer drift', description: 'Add small movement to a layer even when the camera is nearly still.' },
      { id: 'framing', name: 'Foreground framing', description: 'Let leaves, branches or ferns partially enter and leave the frame.' },
      { id: 'wind', name: 'Sway / Wind', description: 'Pivot-based rotation with small gusts, for foliage, branches and hair.' },
      { id: 'float', name: 'Floating / Bobbing', description: 'Gentle looping vertical, lateral or combined movement for hovering elements.' },
      { id: 'ambient', name: 'Ambient Looping', description: 'Loop environmental artwork, or scatter a transparent artwork as lightweight particles.' },
    ],
  },
  {
    id: 'appearance', name: 'Layer Appearance',
    items: [
      { id: 'fade', name: 'Layer fade', description: 'Fade individual elements without fading the complete image.' },
      { id: 'reveal', name: 'Animated mask reveal', description: 'Reveal artwork through a moving shape, gradient or mask.' },
      { id: 'shadow', name: 'Shadow Movement', description: 'An attached, softened silhouette with subtle periodic light movement.' },
    ],
  },
  {
    id: 'deformation', name: 'Advanced Deformation',
    items: [
      { id: 'transform', name: 'Layer scale and rotation', description: 'Small transforms can suggest perspective or emphasize a compositional element.' },
      { id: 'warp', name: 'Perspective Warp', description: 'Deform one flat layer with four animated corners to suggest a new viewpoint.' },
    ],
  },
];

const allItems = categories.flatMap(category => category.items);
const names = Object.fromEntries(allItems.map(item => [item.id, item.name])) as Record<Feature, string>;
const categoriesOpen = new Map<string, boolean>([['depth', true]]);

const pct = (value: number) => Math.round(value * 1000) / 10;
const round = (value: number, places = 3) => Math.round(value * 10 ** places) / 10 ** places;

export function createParallaxWorkspace(options: {
  getScene: () => CameraSceneConfig; getSceneKey: () => string; getTime: () => number; seek: (seconds: number) => void;
  commit: (scene: CameraSceneConfig) => Promise<void>; notify: (message: string) => void;
  /** The Arrange workspace's current selection; Parallax never stores its own copy. */
  getArrangeSelection?: () => string[];
}) {
  let preset: Feature | '' = '', editing = '', sceneKey = '', formKey = '';
  let pickerState: PickerState = createPickerState();
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

  // Compact number steppers, identical to the Arrange inspector. One delegated
  // listener survives every inspector re-render.
  let steppersWired = false;
  function wireSteppers() {
    if (steppersWired) return;
    const host = $('parallax-inspector');
    if (!host) return;
    steppersWired = true;
    host.addEventListener('pointerdown', event => {
      if ((event.target as HTMLElement).closest('.number-step')) event.preventDefault();
    });
    host.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.number-step');
      if (!button) return;
      const input = button.closest('.number-wrap')?.querySelector('input[type=number]');
      if (!(input instanceof HTMLInputElement)) return;
      event.preventDefault();
      const step = Number(input.step);
      const size = Number.isFinite(step) && step > 0 ? step : 1;
      const current = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : (Number(input.min) || 0);
      const min = input.min === '' ? -Infinity : Number(input.min);
      const max = input.max === '' ? Infinity : Number(input.max);
      let next = Number((current + (button.dataset.step === 'down' ? -1 : 1) * size).toPrecision(14));
      if (Number.isFinite(min)) next = Math.max(min, next);
      if (Number.isFinite(max)) next = Math.min(max, next);
      input.value = String(next);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  async function save(next: CameraSceneConfig) {
    try { await options.commit(next); render(); } catch (e) { options.notify(String(e)); }
  }
  const layerName = (cfg: CameraSceneConfig, id: string) => cfg.layers.find(l => l.id === id)?.name ?? 'Missing layer';
  const layerNames = (cfg: CameraSceneConfig, ids: string[]) => ids.map(id => layerName(cfg, id)).join(', ');
  const isNeutral = (cfg: CameraSceneConfig) =>
    (cfg.parallax?.strength ?? 1) === 1 && Object.values(cfg.parallax?.influence ?? {}).every(value => value === 1);
  const isDepthScaleNeutral = (cfg: CameraSceneConfig) => {
    const settings = cfg.depthScale;
    return !settings || ((settings.near ?? 1) === 1 && (settings.far ?? 1) === 1 && (settings.strength ?? 1) === 1
      && Object.values(settings.influence ?? {}).every(value => value === 1));
  };

  // ---- catalogue -------------------------------------------------------------

  function catalogue() {
    return `<div id="parallax-categories" class="parallax-categories">${categories.map(category => {
      const open = categoriesOpen.get(category.id) ?? false;
      return `<details class="parallax-category" data-category="${category.id}" ${open ? 'open' : ''}>
        <summary class="parallax-category-head">
          <span class="parallax-category-name">${category.name}</span>
          <span class="parallax-category-count">${category.items.length}</span>
        </summary>
        <div class="parallax-catalogue">${category.items.map(item =>
          `<button type="button" data-parallax="${item.id}" class="camera-card ${preset === item.id ? 'selected' : ''}" aria-pressed="${preset === item.id}"><b>${item.name}</b><span>${item.description}</span></button>`).join('')}</div>
      </details>`;
    }).join('')}</div>`;
  }

  function wireCatalogue() {
    const host = $('parallax-categories');
    host.querySelectorAll<HTMLButtonElement>('[data-parallax]').forEach(button => {
      button.onclick = () => { preset = button.dataset.parallax as Feature; editing = ''; render(); };
    });
    host.querySelectorAll<HTMLDetailsElement>('.parallax-category').forEach(details => {
      details.addEventListener('toggle', () => categoriesOpen.set(details.dataset.category ?? '', details.open));
    });
  }

  function render() {
    const cfg = options.getScene();
    if (sceneKey !== options.getSceneKey()) { sceneKey = options.getSceneKey(); preset = ''; editing = ''; }
    if (editing && !(cfg.layerEffects ?? []).some(effect => effect.id === editing)) editing = '';
    const catalogueHost = $('parallax-categories');
    if (catalogueHost) { catalogueHost.outerHTML = catalogue(); wireCatalogue(); }
    const nextFormKey = `${preset}/${editing}`;
    if (nextFormKey !== formKey) { formKey = nextFormKey; pickerState = createPickerState(); }
    renderApplied(cfg);
    renderInspector(cfg);
    updateTime();
  }

  // ---- applied effects -------------------------------------------------------

  function renderApplied(cfg: CameraSceneConfig) {
    const rows: string[] = [];
    if (!isNeutral(cfg)) {
      const influenced = Object.entries(cfg.parallax?.influence ?? {}).filter(([, value]) => value !== 1);
      rows.push(`<div class="parallax-item"><div><b>Depth-based parallax</b><small>Strength ${pct(cfg.parallax?.strength ?? 1)}%${influenced.length ? ` · ${influenced.map(([id, value]) => `${escape(layerName(cfg, id))} ${pct(value)}%`).join(', ')}` : ''}</small></div><div class="parallax-actions"><button data-depth-edit>Edit</button><button data-depth-reset>Reset</button></div></div>`);
    }
    if (!isDepthScaleNeutral(cfg)) {
      rows.push(`<div class="parallax-item"><div><b>Depth-based Scale</b><small>Near ${pct(cfg.depthScale?.near ?? 1)}% · Far ${pct(cfg.depthScale?.far ?? 1)}% · reference ${pct(cfg.depthScale?.reference ?? .5)}%</small></div><div class="parallax-actions"><button data-depth-scale-edit>Edit</button><button data-depth-scale-reset>Reset</button></div></div>`);
    }
    if ((cfg.depthPlanes ?? []).length) {
      rows.push(`<div class="parallax-item"><div><b>Depth Planes</b><small>${cfg.depthPlanes!.length} plane${cfg.depthPlanes!.length === 1 ? '' : 's'} · ${escape(cfg.depthPlanes!.map(plane => `${plane.name} ${pct(plane.depth)}%`).join(', '))}</small></div><div class="parallax-actions"><button data-planes-edit>Edit</button><button data-planes-reset>Reset</button></div></div>`);
    }
    for (const effect of [...(cfg.layerEffects ?? [])].sort((a, b) => a.start - b.start)) {
      rows.push(`<div class="parallax-item ${editing === effect.id ? 'selected' : ''}"><div><b>${names[effect.kind]}</b><small>${escape(layerNames(cfg, effect.layerIds))} · ${effect.start.toFixed(2)}s + ${effect.duration.toFixed(2)}s</small></div><div class="parallax-actions"><button data-effect-edit="${effect.id}">Edit</button><button data-effect-duplicate="${effect.id}">Duplicate</button><button data-effect-delete="${effect.id}">Delete</button></div></div>`);
    }
    $('parallax-effects-list').innerHTML = rows.length ? rows.join('') : '<p class="parallax-empty">No layer effects yet. Choose a technique above.</p>';
    const appliedCount = $('parallax-count');
    if (appliedCount) appliedCount.textContent = String(rows.length);
    $('parallax-effects-list').querySelectorAll<HTMLButtonElement>('[data-depth-edit]').forEach(button => button.onclick = () => { preset = 'depth'; editing = ''; render(); });
    $('parallax-effects-list').querySelectorAll<HTMLButtonElement>('[data-depth-scale-edit]').forEach(button => button.onclick = () => { preset = 'depthScale'; editing = ''; render(); });
    $('parallax-effects-list').querySelectorAll<HTMLButtonElement>('[data-planes-edit]').forEach(button => button.onclick = () => { preset = 'planes'; editing = ''; render(); });
    $('parallax-effects-list').querySelectorAll<HTMLButtonElement>('[data-depth-scale-reset]').forEach(button => button.onclick = () => {
      if (!confirm('Reset depth-based scale to neutral? Other effects are kept.')) return;
      const next = structuredClone(cfg); next.depthScale = undefined; void save(next);
    });
    $('parallax-effects-list').querySelectorAll<HTMLButtonElement>('[data-planes-reset]').forEach(button => button.onclick = () => {
      if (!confirm('Delete all depth planes? Layers keep their stored depth.')) return;
      const next = structuredClone(cfg); next.depthPlanes = undefined; void save(next);
    });
    $('parallax-effects-list').querySelectorAll<HTMLButtonElement>('[data-depth-reset]').forEach(button => button.onclick = () => {
      if (!confirm('Reset depth response to neutral? Layer effects are kept.')) return;
      const next = structuredClone(cfg); next.parallax = undefined; void save(next);
    });
    for (const button of $('parallax-effects-list').querySelectorAll<HTMLButtonElement>('[data-effect-edit]')) {
      button.onclick = () => { const effect = cfg.layerEffects?.find(e => e.id === button.dataset.effectEdit); if (!effect) return; preset = effect.kind; editing = effect.id; render(); };
    }
    for (const button of $('parallax-effects-list').querySelectorAll<HTMLButtonElement>('[data-effect-duplicate]')) {
      button.onclick = () => {
        const effect = cfg.layerEffects?.find(e => e.id === button.dataset.effectDuplicate); if (!effect) return;
        const copy = { ...structuredClone(effect), id: crypto.randomUUID() };
        const next = structuredClone(cfg); next.layerEffects = [...(next.layerEffects ?? []), copy];
        preset = copy.kind; editing = copy.id; void save(next);
      };
    }
    for (const button of $('parallax-effects-list').querySelectorAll<HTMLButtonElement>('[data-effect-delete]')) {
      button.onclick = () => {
        if (!confirm('Delete this layer effect?')) return;
        const next = structuredClone(cfg); next.layerEffects = (next.layerEffects ?? []).filter(e => e.id !== button.dataset.effectDelete);
        if (editing === button.dataset.effectDelete) editing = '';
        void save(next);
      };
    }
  }

  // ---- reusable inspector controls ------------------------------------------

  const steppers = (label: string) =>
    `<span class="number-steppers"><button type="button" class="number-step" data-step="up" aria-label="Increase ${escape(label)}"></button><button type="button" class="number-step" data-step="down" aria-label="Decrease ${escape(label)}"></button></span>`;
  const numberField = (id: string, label: string, value: number, min: number, max: number, step: number | 'any' = 'any', hint = '') =>
    `<label class="field"><span class="field-label">${label}${hint ? `<small>${hint}</small>` : ''}</span><span class="number-wrap"><input id="${id}" type="number" required min="${min}" max="${max}" step="${step}" value="${round(value)}">${steppers(label)}</span></label>`;

  const segmented = (name: string, label: string, choices: { value: string; label: string; title?: string }[], current: string) =>
    `<div class="parallax-segment-field"><span class="parallax-segment-label">${label}</span><div class="segmented" role="radiogroup" aria-label="${label}">${choices.map(choice =>
      `<label class="seg" title="${choice.title ?? choice.label}"><input type="radio" name="${name}" value="${choice.value}" ${choice.value === current ? 'checked' : ''}><span>${choice.label}</span></label>`).join('')}</div></div>`;

  const toggleField = (id: string, label: string, checked: boolean, hint = '') =>
    `<label class="field parallax-toggle"><span class="field-label">${label}${hint ? `<small>${hint}</small>` : ''}</span><input id="${id}" type="checkbox" ${checked ? 'checked' : ''}></label>`;

  const basicSection = (body: string) => `<section class="parallax-settings" data-settings="basic"><h4 class="parallax-settings-title">Basic settings</h4>${body}</section>`;
  const advancedSection = (body: string, conditionalOnly = false) =>
    `<details class="parallax-advanced"${conditionalOnly ? ' data-conditional-only="true"' : ''}><summary>Advanced settings</summary><div class="parallax-advanced-body">${body}</div></details>`;

  const checkedValue = (name: string) =>
    (document.querySelector<HTMLInputElement>(`#parallax-inspector input[name="${name}"]:checked`)?.value ?? '');

  const directionChoices = (values: { value: string; label: string }[]) => values;
  const fourWay = (prefix: string, labels: Record<string, string> = {}) =>
    directionChoices((['left', 'right', 'top', 'bottom'] as const).map(value => ({ value, label: labels[value] ?? `${value[0]!.toUpperCase()}${value.slice(1)}` })));
  const threeWayAxis = [
    { value: 'x', label: 'Horizontal' }, { value: 'y', label: 'Vertical' }, { value: 'xy', label: 'Both' },
  ];

  /** Group a per-layer list under its parent Arrange folder. */
  function groupedLayers(cfg: CameraSceneConfig, row: (id: string, name: string, layerDepth: number) => string, folderAction?: (folderId: string) => string) {
    if (!cfg.layers.length) return '<p class="parallax-empty">Import artwork first.</p>';
    return folderGroups(cfg).map(group => {
      if (!group.folder) {
        const layer = group.layers[0]!;
        return `<div class="parallax-layer-group loose">${row(layer.id, layer.name, layer.depth)}</div>`;
      }
      return `<div class="parallax-layer-group"><div class="parallax-layer-group-head"><span class="folder-glyph" aria-hidden="true">▸</span>${escape(group.folder.name)}<span class="parallax-layer-group-count">${group.layers.length}</span>${folderAction ? `<span class="parallax-layer-group-action">${folderAction(group.folder.id)}</span>` : ''}</div>${group.layers.map(layer => row(layer.id, layer.name, layer.depth)).join('')}</div>`;
    }).join('');
  }

  function syncConditionals(scope: HTMLElement) {
    const mode = checkedValue('ambient-mode');
    const motion = (document.getElementById('ambient-motion') as HTMLSelectElement | null)?.value ?? '';
    const mask = checkedValue('reveal-mask');
    const matches = (list: string | undefined, value: string) => !list || list.split(',').includes(value);
    const visible = (element: HTMLElement) => {
      const { showMode, showMotion, showMask } = element.dataset;
      return matches(showMode, mode) && matches(showMotion, motion) && matches(showMask, mask);
    };
    for (const element of scope.querySelectorAll<HTMLElement>('[data-show-mode], [data-show-motion], [data-show-mask]')) {
      element.hidden = !visible(element);
    }
    for (const details of scope.querySelectorAll<HTMLDetailsElement>('.parallax-advanced')) {
      if (details.dataset.conditionalOnly !== 'true') continue;
      const conditional = [...details.querySelectorAll<HTMLElement>('[data-show-mode], [data-show-motion], [data-show-mask]')];
      details.hidden = !conditional.some(element => !element.hidden);
    }
  }

  function mountPicker(cfg: CameraSceneConfig, effect: LayerEffect | undefined, mode: TargetMode) {
    const host = document.getElementById('parallax-targets');
    if (!host) return;
    const stored = effect?.layerIds ?? [];
    const initial = effect
      ? (mode === 'single' ? stored.slice(0, 1) : stored)
      : arrangeTargets(cfg, options.getArrangeSelection?.() ?? [], mode);
    activePicker = mountTargetPicker(host, {
      cfg, mode, selected: initial, state: pickerState,
      fallbackId: defaultTargetId(cfg),
    });
  }

  // ---- inspector -------------------------------------------------------------

  let activePicker: { selected: () => string[] } | null = null;

  function renderInspector(cfg: CameraSceneConfig) {
    wireSteppers();
    const inspector = $('parallax-inspector');
    activePicker = null;
    if (!preset) {
      inspector.innerHTML = '<h3>Parallax and layer animation</h3><p class="animation-note">Choose a technique to add depth or animate individual layers. Camera movements are unchanged.</p>';
      return;
    }
    const effect = (cfg.layerEffects ?? []).find(e => e.id === editing);
    const duration = sceneDuration(cfg);

    // Depth-based parallax now expresses the shared camera's physical response.
    if (preset === 'depth') {
      const influence = cfg.parallax?.influence ?? {};
      inspector.innerHTML = `<h3>Depth-based parallax</h3><p class="animation-note">Controls the layer's response to virtual-camera translation. 100% is the natural physical response from its effective Depth Plane or stored depth, 0% cancels translation, and above 100% exaggerates it. Camera rotation and lens behaviour are unchanged. Depth 0 is background, 1 is foreground.</p>
        <label class="field">Parallax strength · %<input id="parallax-strength" type="range" min="0" max="300" step="1" value="${pct(cfg.parallax?.strength ?? 1)}"><output id="parallax-strength-out">${pct(cfg.parallax?.strength ?? 1)}%</output></label>
        <fieldset class="parallax-layers"><legend>Layer depth and influence</legend>${cfg.layers.map(layer =>
          `<div class="depth-layer"><div class="depth-layer-head"><span class="depth-name" title="${escape(layer.name)}">${escape(layer.name)}</span><label class="depth-influence">Influence %<span class="number-wrap"><input id="influence-${layer.id}" type="number" min="0" max="300" step="1" value="${pct(influence[layer.id] ?? 1)}">${steppers('influence')}</span></label></div><div class="depth-row"><span class="depth-label">Stored depth</span><input id="depth-${layer.id}" type="range" min="0" max="100" step="1" value="${pct(layer.depth)}"><output id="depth-out-${layer.id}">${pct(layer.depth)}%</output></div></div>`).join('') || '<p class="parallax-empty">Import artwork first.</p>'}</fieldset>
        <div class="row-actions"><button class="outline" type="button" id="parallax-depth-save">Apply depth settings</button><button type="button" id="parallax-depth-reset">Reset to neutral</button></div>`;
      const strength = $<HTMLInputElement>('parallax-strength');
      strength.oninput = () => { $('parallax-strength-out').textContent = `${strength.value}%`; };
      for (const layer of cfg.layers) {
        const slider = document.getElementById(`depth-${layer.id}`) as HTMLInputElement | null;
        if (slider) slider.oninput = () => { const out = document.getElementById(`depth-out-${layer.id}`); if (out) out.textContent = `${slider.value}%`; };
      }
      $<HTMLButtonElement>('parallax-depth-save').onclick = () => {
        const next = structuredClone(cfg);
        const influenceNext: Record<string, number> = {};
        for (const layer of cfg.layers) {
          const field = document.getElementById(`influence-${layer.id}`) as HTMLInputElement | null;
          const value = (field?.valueAsNumber ?? 100) / 100;
          if (!Number.isFinite(value) || value < 0 || value > 3) { options.notify('Influence must be between 0 and 300%'); return; }
          if (value !== 1) influenceNext[layer.id] = value;
          const depthField = document.getElementById(`depth-${layer.id}`) as HTMLInputElement | null;
          const depth = depthField ? depthField.valueAsNumber / 100 : layer.depth;
          if (!Number.isFinite(depth) || depth < 0 || depth > 1) { options.notify('Depth must be between 0 and 100%'); return; }
          const target = next.layers.find(candidate => candidate.id === layer.id);
          if (target) target.depth = depth;
        }
        next.parallax = { strength: Math.max(0, Math.min(3, strength.valueAsNumber / 100)), influence: influenceNext };
        void save(next);
      };
      $<HTMLButtonElement>('parallax-depth-reset').onclick = () => { const next = structuredClone(cfg); next.parallax = undefined; void save(next); };
      return;
    }

    if (preset === 'depthScale') {
      const settings = cfg.depthScale;
      const influence = settings?.influence ?? {};
      inspector.innerHTML = `<h3>Depth-based Scale</h3><p class="animation-note">An artistic size adjustment applied to each layer before projection. It does not replace the camera's physical perspective: foreground layers use the near value, background layers the far value, and the reference depth stays exactly 100%.</p>
        ${basicSection(
          numberField('depth-scale-near', 'Near scale · foreground %', pct(settings?.near ?? 1), 25, 300, 1)
          + numberField('depth-scale-far', 'Far scale · background %', pct(settings?.far ?? 1), 25, 300, 1)
          + numberField('depth-scale-strength', 'Overall strength · %', pct(settings?.strength ?? 1), 0, 200, 1)
          + `<div class="row-actions"><button class="outline" type="button" id="depth-scale-save">Apply scale settings</button><button type="button" id="depth-scale-reset">Reset to neutral</button></div>`
        )}
        ${advancedSection(
          numberField('depth-scale-reference', 'Reference depth · %', pct(settings?.reference ?? .5), 5, 95, 1, 'layers at this depth stay exactly 100%')
          + `<div class="parallax-settings-subtitle">Per-layer influence · %</div><div class="parallax-layer-groups">${groupedLayers(cfg, (id, name, depth) =>
            `<label class="parallax-layer-row"><span class="parallax-layer-row-name">${escape(name)}<small>depth ${pct(depth)}%</small></span><input id="scale-influence-${id}" type="number" min="0" max="200" step="1" value="${pct(influence[id] ?? 1)}" aria-label="Influence for ${escape(name)}"></label>`)}</div>`
        )}`;
      $<HTMLButtonElement>('depth-scale-save').onclick = () => {
        const value = (id: string) => (document.getElementById(id) as HTMLInputElement).valueAsNumber;
        const near = value('depth-scale-near') / 100, far = value('depth-scale-far') / 100;
        const reference = value('depth-scale-reference') / 100, strength = value('depth-scale-strength') / 100;
        if (![near, far, reference, strength].every(Number.isFinite) || near < .25 || far < .25 || strength < 0 || reference < .05 || reference > .95) { options.notify('Check the scale values'); return; }
        const influenceNext: Record<string, number> = {};
        for (const layer of cfg.layers) {
          const field = document.getElementById(`scale-influence-${layer.id}`) as HTMLInputElement | null;
          const amount = (field?.valueAsNumber ?? 100) / 100;
          if (!Number.isFinite(amount) || amount < 0 || amount > 2) { options.notify('Influence must be between 0 and 200%'); return; }
          if (amount !== 1) influenceNext[layer.id] = amount;
        }
        const next = structuredClone(cfg);
        next.depthScale = { near, far, reference, strength, influence: influenceNext };
        void save(next);
      };
      $<HTMLButtonElement>('depth-scale-reset').onclick = () => { const next = structuredClone(cfg); next.depthScale = undefined; void save(next); };
      return;
    }

    if (preset === 'planes') {
      const planes = cfg.depthPlanes ?? [];
      const assignment = (layerId: string) => planes.find(plane => plane.layerIds.includes(layerId))?.id ?? '';
      const planeOptions = (selected = '') => `${planes.map(plane => `<option value="${escape(plane.id)}" ${selected === plane.id ? 'selected' : ''}>${escape(plane.name)}</option>`).join('')}`;
      inspector.innerHTML = `<h3>Depth Planes</h3>
        ${basicSection(
          `<div class="parallax-plane-list">${planes.map((plane, index) => `<div class="parallax-plane" data-plane="${escape(plane.id)}">
            <div class="parallax-plane-head"><input id="plane-name-${index}" class="parallax-plane-name" type="text" maxlength="60" value="${escape(plane.name)}" aria-label="Plane name"><button type="button" class="parallax-plane-delete" data-plane-delete="${escape(plane.id)}" title="Delete plane" aria-label="Delete plane">✕</button></div>
            ${numberField(`plane-depth-${index}`, 'Depth · %', pct(plane.depth), 0, 100, 1)}
          </div>`).join('') || '<p class="parallax-empty">No depth planes yet. Add one, then assign layers.</p>'}</div>
          <div class="row-actions"><button type="button" id="plane-add">＋ Add plane</button></div>
          <div class="parallax-settings-subtitle">Layer assignments</div>
          <div class="parallax-assignments">${groupedLayers(cfg, (id, name, depth) => `<label class="parallax-layer-row"><span class="parallax-layer-row-name">${escape(name)}<small>stored ${pct(depth)}%</small></span><select id="layer-plane-${id}" aria-label="Plane for ${escape(name)}"><option value="">— stored depth —</option>${planeOptions(assignment(id))}</select></label>`, folderId => `<select class="parallax-folder-assign" data-folder-plane="${escape(folderId)}" aria-label="Assign every layer in this folder"><option value="">Assign folder…</option>${planeOptions()}</select>`)}</div>
          <div class="row-actions"><button class="outline" type="button" id="plane-save">Apply planes</button></div>`
        )}
        ${advancedSection(
          planes.map((plane, index) => numberField(`plane-depth-exact-${index}`, `${escape(plane.name)} · exact depth`, plane.depth, 0, 1, .001)).join('')
          + '<p class="animation-note">A plane supplies the shared effective depth for its layers. Every plane member uses the same depth for projection, Parallax, Scale, focus and atmosphere. Draw order never changes, stored layer depth is preserved, and deleting a plane returns its layers to their own depth.</p>'
        )}`;
      // Keep the percentage and exact depth fields in step without hiding either one.
      planes.forEach((_, index) => {
        const coarse = document.getElementById(`plane-depth-${index}`) as HTMLInputElement | null;
        const exact = document.getElementById(`plane-depth-exact-${index}`) as HTMLInputElement | null;
        if (!coarse || !exact) return;
        coarse.oninput = () => { const value = coarse.valueAsNumber / 100; if (Number.isFinite(value)) exact.value = String(Math.round(value * 1000) / 1000); };
        exact.oninput = () => { const value = exact.valueAsNumber * 100; if (Number.isFinite(value)) coarse.value = String(Math.round(value)); };
      });
      for (const select of inspector.querySelectorAll<HTMLSelectElement>('[data-folder-plane]')) {
        select.onchange = () => {
          const folderId = select.dataset.folderPlane!;
          for (const layer of cfg.layers.filter(candidate => candidate.folderId === folderId)) {
            const field = document.getElementById(`layer-plane-${layer.id}`) as HTMLSelectElement | null;
            if (field) field.value = select.value;
          }
          select.value = '';
        };
      }
      $<HTMLButtonElement>('plane-add').onclick = () => {
        const next = structuredClone(cfg);
        next.depthPlanes = [...(next.depthPlanes ?? []), { id: crypto.randomUUID(), name: `Plane ${planes.length + 1}`, depth: .5, layerIds: [] }];
        void save(next);
      };
      inspector.querySelectorAll<HTMLButtonElement>('[data-plane-delete]').forEach(button => button.onclick = () => {
        if (!confirm('Delete this plane? Its layers return to their stored depth.')) return;
        const next = structuredClone(cfg);
        next.depthPlanes = (next.depthPlanes ?? []).filter(plane => plane.id !== button.dataset.planeDelete);
        void save(next);
      });
      $<HTMLButtonElement>('plane-save').onclick = () => {
        const next = structuredClone(cfg);
        const planeList: { id: string; name: string; depth: number; layerIds: string[] }[] = [];
        for (const [index, plane] of (next.depthPlanes ?? []).entries()) {
          const name = (document.getElementById(`plane-name-${index}`) as HTMLInputElement).value.trim() || plane.name;
          const exact = document.getElementById(`plane-depth-exact-${index}`) as HTMLInputElement | null;
          const coarse = document.getElementById(`plane-depth-${index}`) as HTMLInputElement | null;
          const depth = exact ? exact.valueAsNumber : (coarse?.valueAsNumber ?? pct(plane.depth)) / 100;
          if (!Number.isFinite(depth) || depth < 0 || depth > 1) { options.notify('Plane depth must be 0–100%'); return; }
          planeList.push({ ...plane, name: name.slice(0, 60), depth, layerIds: [] });
        }
        for (const layer of cfg.layers) {
          const select = document.getElementById(`layer-plane-${layer.id}`) as HTMLSelectElement | null;
          const plane = planeList.find(candidate => candidate.id === select?.value);
          if (plane) plane.layerIds.push(layer.id);
        }
        next.depthPlanes = planeList;
        void save(next);
      };
      return;
    }

    // ---- time-based layer effects -------------------------------------------

    const start = effect?.start ?? 0;
    const length = effect?.duration ?? Math.min(3, duration);
    const end = Math.max(0, duration - start);
    const timing = numberField('parallax-start', 'Start · seconds', start, 0, Math.max(0, duration - .01))
      + numberField('parallax-duration', 'Duration · seconds', length, .01, Math.max(.01, end));
    const action = `<div class="row-actions"><button class="outline" type="submit">${effect ? 'Update effect' : 'Add effect'}</button>${effect ? '<button type="button" id="parallax-add-another">＋ Add another</button><button type="button" id="parallax-cancel">Cancel edit</button>' : ''}</div><p class="animation-note">Timing holds its endpoint. The same effect can be added more than once; each copy keeps its own timing.</p>`;

    let targetMode: TargetMode = 'multi';
    let body = '';
    let advanced = '';
    let conditionalAdvanced = false;

    if (preset === 'drift') {
      const value = effect?.kind === 'drift' ? effect : undefined;
      targetMode = 'single';
      body = segmented('drift-axis', 'Movement direction', threeWayAxis, value?.axis ?? 'xy')
        + `<label class="field"><span class="field-label">Motion style</span><select id="drift-motion"><option value="sway" ${value?.motion !== 'noise' ? 'selected' : ''}>Gentle sway</option><option value="noise" ${value?.motion === 'noise' ? 'selected' : ''}>Irregular</option></select></label>`
        + numberField('drift-amplitude', 'Movement amount · pixels', value?.amplitude ?? 12, 0, 400, 1)
        + numberField('drift-speed', 'Speed · cycles per second', value?.speed ?? .25, .02, 4);
      advanced = numberField('drift-phase', 'Phase · degrees', value?.phase ?? 0, -360, 360)
        + numberField('drift-seed', 'Variation seed', value?.seed ?? 7, 0, 2147483647, 1);
    } else if (preset === 'transform') {
      const value = effect?.kind === 'transform' ? effect : undefined;
      targetMode = 'single';
      body = numberField('transform-scale-from', 'Start scale · %', pct(value?.startScale ?? 1), 10, 400, 1)
        + numberField('transform-scale-to', 'End scale · %', pct(value?.endScale ?? 1.1), 10, 400, 1)
        + numberField('transform-rotation-from', 'Start rotation · degrees', value?.startRotation ?? 0, -180, 180)
        + numberField('transform-rotation-to', 'End rotation · degrees', value?.endRotation ?? 3, -180, 180)
        + '<p class="animation-note">Scale and rotation interpolate linearly from the start to the end value.</p>';
    } else if (preset === 'framing') {
      const value = effect?.kind === 'framing' ? effect : undefined;
      body = segmented('framing-direction', 'Entry direction', fourWay('framing'), value?.direction ?? 'left')
        + numberField('framing-from', 'Start position · % of frame', value?.startOffset ?? 110, -200, 200)
        + numberField('framing-to', 'End position · % of frame', value?.endOffset ?? 0, -200, 200)
        + '<p class="animation-note">100% places the layer just outside the frame; 0% is its arranged position.</p>';
      advanced = numberField('framing-repeat', 'Enter / exit cycles', value?.repeat ?? 1, 1, 8, 1)
        + '<p class="animation-note">Repeated cycles alternate between entering and leaving the frame.</p>';
    } else if (preset === 'fade') {
      const value = effect?.kind === 'fade' ? effect : undefined;
      body = numberField('fade-from', 'Start opacity · %', pct(value?.startOpacity ?? 0), 0, 100, 1)
        + numberField('fade-to', 'End opacity · %', pct(value?.endOpacity ?? 1), 0, 100, 1)
        + '<p class="animation-note">Opacity multiplies the layer’s Arrange opacity. Other layers keep theirs.</p>';
    } else if (preset === 'reveal') {
      const value = effect?.kind === 'reveal' ? effect : undefined;
      targetMode = 'single';
      body = segmented('reveal-mask', 'Reveal style', [
        { value: 'wipe', label: 'Directional wipe' }, { value: 'radial', label: 'Radial reveal' },
      ], value?.mask ?? 'wipe')
        + `<div data-show-mask="wipe">${segmented('reveal-direction', 'Reveal from', fourWay('reveal'), value?.direction ?? 'left')}</div>`
        + numberField('reveal-from', 'Reveal from · %', pct(value?.startCoverage ?? 0), 0, 100, 1)
        + numberField('reveal-to', 'Reveal to · %', pct(value?.endCoverage ?? 1), 0, 100, 1)
        + numberField('reveal-softness', 'Edge softness · %', pct(value?.softness ?? .35), 0, 100, 1);
      advanced = `<div data-show-mask="radial">${numberField('reveal-origin-x', 'Origin X · % of frame', pct(value?.originX ?? .5), 0, 100, 1)
        + numberField('reveal-origin-y', 'Origin Y · % of frame', pct(value?.originY ?? .5), 0, 100, 1)}</div>`;
      conditionalAdvanced = true;
    } else if (preset === 'wind') {
      const value = effect?.kind === 'wind' ? effect : undefined;
      body = segmented('wind-direction', 'Wind direction', [
        { value: 'right', label: 'Push right', title: 'Wind from the left' }, { value: 'left', label: 'Push left', title: 'Wind from the right' },
      ], value?.direction ?? 'right')
        + numberField('wind-rotation', 'Bending amount · degrees', value?.rotation ?? 4, 0, 30)
        + numberField('wind-speed', 'Speed · cycles per second', value?.speed ?? .35, .02, 3)
        + numberField('wind-gust', 'Gust intensity · %', pct(value?.gust ?? .3), 0, 100, 1);
      advanced = numberField('wind-pivot-x', 'Pivot X · % of layer', pct(value?.pivotX ?? .5), 0, 100, 1)
        + numberField('wind-pivot-y', 'Pivot Y · % of layer', pct(value?.pivotY ?? 1), 0, 100, 1, '100% is the bottom edge')
        + numberField('wind-movement', 'Secondary movement · pixels', value?.movement ?? 5, 0, 120)
        + numberField('wind-phase', 'Phase · degrees', value?.phase ?? 0, -360, 360)
        + numberField('wind-spread', 'Phase spread per layer · degrees', value?.spread ?? 35, 0, 180)
        + '<p class="animation-note">Rotation happens around the pivot; the default bottom centre suits foliage. Phase spread keeps multiple layers from swaying in unison.</p>';
    } else if (preset === 'float') {
      const value = effect?.kind === 'float' ? effect : undefined;
      body = segmented('float-axis', 'Movement style', [
        { value: 'y', label: 'Vertical' }, { value: 'x', label: 'Horizontal' }, { value: 'xy', label: 'Combined' },
      ], value?.axis ?? 'y')
        + numberField('float-amplitude', 'Movement amount · pixels', value?.amplitude ?? 14, 0, 200, 1)
        + numberField('float-speed', 'Speed · cycles per second', value?.speed ?? .35, .02, 3);
      advanced = numberField('float-phase', 'Phase · degrees', value?.phase ?? 0, -360, 360)
        + numberField('float-rotation', 'Secondary rotation · degrees', value?.rotation ?? 0, -6, 6)
        + '<p class="animation-note">Motion is positional and periodic; the amount fades in and out so seeking and loops stay smooth.</p>';
    } else if (preset === 'ambient') {
      const value = effect?.kind === 'ambient' ? effect : undefined;
      targetMode = 'single';
      body = segmented('ambient-mode', 'Mode', [
        { value: 'layer', label: 'Layer loop' }, { value: 'particles', label: 'Particle loop' },
      ], value?.mode ?? 'layer')
        + `<div class="parallax-conditional" data-show-mode="layer">
          <label class="field"><span class="field-label">Motion</span><select id="ambient-motion"><option value="oscillate" ${value?.motion !== 'drift' && value?.motion !== 'pulse' ? 'selected' : ''}>Gentle oscillation</option><option value="drift" ${value?.motion === 'drift' ? 'selected' : ''}>Continuous drift</option><option value="pulse" ${value?.motion === 'pulse' ? 'selected' : ''}>Opacity pulse</option></select></label>
          <div data-show-motion="oscillate,drift">${segmented('ambient-direction', 'Direction', fourWay('ambient'), value?.direction ?? 'right')}</div>
          <div data-show-motion="oscillate,pulse">${numberField('ambient-amplitude', 'Movement amount · pixels / pulse %', value?.amplitude ?? 40, 0, 400, 1)}</div>
          <div data-show-motion="drift">${numberField('ambient-speed', 'Drift speed · pixels per second', value?.speed ?? 12, 0, 200, 1)}</div>
          <div data-show-motion="oscillate,pulse">${numberField('ambient-loop', 'Loop period · seconds', value?.loop ?? 8, .25, 120)}</div>
        </div>
        <div class="parallax-conditional" data-show-mode="particles">
          ${segmented('ambient-particle-direction', 'Direction', fourWay('ambient-particle'), value?.direction ?? 'right')}
          ${numberField('ambient-count', 'Particle count', value?.count ?? 24, 1, 80, 1)}
          ${numberField('ambient-speed-min', 'Speed minimum · pixels/sec', value?.speedMin ?? 8, 0, 200, 1)}
          ${numberField('ambient-speed-max', 'Speed maximum · pixels/sec', value?.speedMax ?? 28, 0, 200, 1)}
          ${numberField('ambient-size-min', 'Size minimum · pixels', value?.sizeMin ?? 6, 1, 240, 1)}
          ${numberField('ambient-size-max', 'Size maximum · pixels', value?.sizeMax ?? 18, 1, 240, 1)}
          ${numberField('ambient-opacity-min', 'Opacity minimum · %', pct(value?.opacityMin ?? .15), 0, 100, 1)}
          ${numberField('ambient-opacity-max', 'Opacity maximum · %', pct(value?.opacityMax ?? .65), 0, 100, 1)}
          <p class="animation-note">Particle mode uses the selected transparent artwork as its texture.</p>
        </div>`;
      advanced = `<div data-show-mode="layer" data-show-motion="oscillate,pulse">${numberField('ambient-phase', 'Phase · degrees', value?.phase ?? 0, -360, 360)}</div>
        <div data-show-mode="layer" data-show-motion="drift">${toggleField('ambient-tileable', 'Tileable artwork', value?.tileable === true, 'only continuous drift wraps edges')}</div>
        <div data-show-mode="particles">
          ${numberField('ambient-lifetime', 'Lifetime · seconds', value?.lifetime ?? 6, .5, 120)}
          <div class="parallax-settings-subtitle">Emission region · % of frame</div>
          <div class="parallax-pair-grid">
            ${numberField('ambient-region-x', 'Region X · %', pct(value?.regionX ?? 0), 0, 100, 1)}
            ${numberField('ambient-region-y', 'Region Y · %', pct(value?.regionY ?? 0), 0, 100, 1)}
            ${numberField('ambient-region-width', 'Region width · %', pct(value?.regionWidth ?? 1), 2, 100, 1)}
            ${numberField('ambient-region-height', 'Region height · %', pct(value?.regionHeight ?? 1), 2, 100, 1)}
          </div>
          ${numberField('ambient-seed', 'Variation seed', value?.seed ?? 11, 0, 2147483647, 1)}
          <p class="animation-note">Positions and lifetimes are calculated from absolute time with a fixed seed, never accumulated.</p>
        </div>`;
      conditionalAdvanced = true;
    } else if (preset === 'shadow') {
      const value = effect?.kind === 'shadow' ? effect : undefined;
      const angle = value?.angle ?? 90;
      body = `<div class="parallax-direction-picks" role="group" aria-label="Shadow direction quick pick">${([
        ['Right', 0], ['Down', 90], ['Left', 180], ['Up', -90],
      ] as const).map(([label, degrees]) => `<button type="button" data-shadow-direction="${degrees}" class="${angle === degrees ? 'active' : ''}">${label}</button>`).join('')}</div>`
        + numberField('shadow-angle', 'Direction · degrees', angle, -180, 180)
        + numberField('shadow-distance', 'Offset distance · pixels', value?.distance ?? 18, 0, 200)
        + numberField('shadow-opacity', 'Shadow opacity · %', pct(value?.opacity ?? .35), 0, 100, 1)
        + numberField('shadow-blur', 'Shadow softness · pixels', value?.blur ?? 8, 0, 60)
        + `<label class="field"><span class="field-label">Shadow colour</span><input id="shadow-color" type="color" value="${value?.color ?? '#000000'}"></label>`
        + '<p class="animation-note">The shadow uses the layer silhouette and renders beneath it, following the layer opacity, rotation and camera projection.</p>';
      advanced = numberField('shadow-speed', 'Movement speed · cycles per second', value?.speed ?? .15, .01, 2)
        + numberField('shadow-amplitude', 'Movement amplitude · pixels', value?.amplitude ?? 4, 0, 80)
        + numberField('shadow-phase', 'Phase · degrees', value?.phase ?? 0, -360, 360);
    } else if (preset === 'warp') {
      const value = effect?.kind === 'warp' ? effect : undefined;
      targetMode = 'single';
      body = '<p class="animation-note">Perspective Warp is an advanced deformation. Pick the artwork and timing here; corner positions live in Advanced settings.</p>';
      const corner = (index: number) => ({ x: value?.corners[index].x ?? [-1, 1, 1, -1][index]!, y: value?.corners[index].y ?? [-1, -1, 1, 1][index]! });
      advanced = '<fieldset class="parallax-layers"><legend>Corner positions · % of layer half-size</legend>'
        + ['Top left', 'Top right', 'Bottom right', 'Bottom left'].map((label, index) => {
          const point = corner(index);
          return `<div class="parallax-corner"><b>${label}</b>${numberField(`warp-${index}-x`, 'X · %', pct(point.x), -200, 200, 1)}${numberField(`warp-${index}-y`, 'Y · %', pct(point.y), -200, 200, 1)}</div>`;
        }).join('')
        + '</fieldset><button type="button" id="warp-neutral">Reset corners to neutral</button>'
        + '<p class="animation-note">Neutral is the unwarped layer; the warp animates from neutral to these corners. It deforms a flat image and cannot reveal hidden sides.</p>';
    } else {
      throw new Error('Unsupported layer effect');
    }

    inspector.innerHTML = `<h3>${names[preset as Feature]}</h3><form id="parallax-form" novalidate>${basicSection(`<div id="parallax-targets" class="parallax-targets"></div>${body}${timing}`)}${advanced ? advancedSection(advanced, conditionalAdvanced) : ''}${action}</form>`;

    mountPicker(cfg, effect, targetMode);
    if (preset === 'reveal' || preset === 'ambient') {
      syncConditionals(inspector);
      const form = $('parallax-form');
      form.addEventListener('change', () => syncConditionals(inspector));
      form.addEventListener('input', event => {
        const target = event.target as HTMLElement;
        if (target.id === 'ambient-motion' || target.closest('.segmented')) syncConditionals(inspector);
      });
    }
    inspector.querySelectorAll<HTMLButtonElement>('[data-shadow-direction]').forEach(button => {
      button.onclick = () => {
        const field = document.getElementById('shadow-angle') as HTMLInputElement | null;
        if (field) field.value = button.dataset.shadowDirection ?? field.value;
        inspector.querySelectorAll('[data-shadow-direction]').forEach(candidate => candidate.classList.toggle('active', candidate === button));
      };
    });
    if (preset === 'warp') {
      $<HTMLButtonElement>('warp-neutral').onclick = () => {
        const neutral = [[-100, -100], [100, -100], [100, 100], [-100, 100]];
        neutral.forEach(([x, y], index) => {
          (document.getElementById(`warp-${index}-x`) as HTMLInputElement).value = String(x);
          (document.getElementById(`warp-${index}-y`) as HTMLInputElement).value = String(y);
        });
      };
    }
    if (effect) {
      $('parallax-cancel').onclick = () => { editing = ''; render(); };
      $('parallax-add-another').onclick = () => { editing = ''; render(); };
    }

    $('parallax-form').onsubmit = event => {
      event.preventDefault();
      const picked = activePicker?.selected() ?? [];
      if (!picked.length) { options.notify('Select at least one layer.'); return; }
      let failure = '';
      const read = (id: string, label: string, min: number, max: number) => {
        const field = document.getElementById(id) as HTMLInputElement | null;
        const value = field?.valueAsNumber;
        if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
          if (!failure) failure = `${label} must be between ${min} and ${max}.`;
          return min;
        }
        return value;
      };
      const whole = (id: string, label: string, min: number, max: number) => Math.round(read(id, label, min, max));
      const startTime = read('parallax-start', 'Start', 0, Math.max(0, duration - .01));
      const lengthTime = read('parallax-duration', 'Duration', .01, Math.max(.01, duration - startTime));
      const base = { id: effect?.id ?? crypto.randomUUID(), start: startTime, duration: lengthTime, layerIds: picked };
      let built: LayerEffect | undefined;
      if (preset === 'drift') {
        built = { ...base, kind: 'drift', axis: (checkedValue('drift-axis') || 'xy') as DriftAxis,
          motion: ($('drift-motion') as HTMLSelectElement).value as DriftMotion,
          amplitude: read('drift-amplitude', 'Movement amount', 0, 400),
          speed: read('drift-speed', 'Speed', .02, 4),
          phase: read('drift-phase', 'Phase', -360, 360),
          seed: whole('drift-seed', 'Variation seed', 0, 2147483647) };
      } else if (preset === 'transform') {
        built = { ...base, kind: 'transform', startScale: read('transform-scale-from', 'Start scale', 10, 400) / 100,
          endScale: read('transform-scale-to', 'End scale', 10, 400) / 100,
          startRotation: read('transform-rotation-from', 'Start rotation', -180, 180),
          endRotation: read('transform-rotation-to', 'End rotation', -180, 180) };
      } else if (preset === 'framing') {
        built = { ...base, kind: 'framing', direction: (checkedValue('framing-direction') || 'left') as FrameDirection,
          startOffset: read('framing-from', 'Start position', -200, 200),
          endOffset: read('framing-to', 'End position', -200, 200),
          repeat: whole('framing-repeat', 'Enter / exit cycles', 1, 8) };
      } else if (preset === 'fade') {
        built = { ...base, kind: 'fade', startOpacity: read('fade-from', 'Start opacity', 0, 100) / 100,
          endOpacity: read('fade-to', 'End opacity', 0, 100) / 100 };
      } else if (preset === 'reveal') {
        built = { ...base, kind: 'reveal', mask: (checkedValue('reveal-mask') || 'wipe') as MaskKind,
          direction: (checkedValue('reveal-direction') || 'left') as FrameDirection,
          originX: read('reveal-origin-x', 'Origin X', 0, 100) / 100,
          originY: read('reveal-origin-y', 'Origin Y', 0, 100) / 100,
          startCoverage: read('reveal-from', 'Reveal from', 0, 100) / 100,
          endCoverage: read('reveal-to', 'Reveal to', 0, 100) / 100,
          softness: read('reveal-softness', 'Edge softness', 0, 100) / 100 };
      } else if (preset === 'wind') {
        built = { ...base, kind: 'wind', direction: (checkedValue('wind-direction') || 'right') as WindDirection,
          pivotX: read('wind-pivot-x', 'Pivot X', 0, 100) / 100,
          pivotY: read('wind-pivot-y', 'Pivot Y', 0, 100) / 100,
          rotation: read('wind-rotation', 'Bending amount', 0, 30),
          movement: read('wind-movement', 'Secondary movement', 0, 120),
          speed: read('wind-speed', 'Speed', .02, 3),
          gust: read('wind-gust', 'Gust intensity', 0, 100) / 100,
          phase: read('wind-phase', 'Phase', -360, 360),
          spread: read('wind-spread', 'Phase spread', 0, 180) };
      } else if (preset === 'float') {
        built = { ...base, kind: 'float', axis: (checkedValue('float-axis') || 'y') as DriftAxis,
          amplitude: read('float-amplitude', 'Movement amount', 0, 200),
          speed: read('float-speed', 'Speed', .02, 3),
          phase: read('float-phase', 'Phase', -360, 360),
          rotation: read('float-rotation', 'Secondary rotation', -6, 6) };
      } else if (preset === 'ambient') {
        const mode = (checkedValue('ambient-mode') || 'layer') as AmbientMode;
        const motion = ($('ambient-motion') as HTMLSelectElement).value as AmbientMotion;
        const direction = (mode === 'particles' ? checkedValue('ambient-particle-direction') : checkedValue('ambient-direction')) as AmbientDirection;
        built = { ...base, kind: 'ambient', mode, motion, direction: direction || 'right',
          amplitude: read('ambient-amplitude', 'Movement amount', 0, 400),
          speed: read('ambient-speed', 'Drift speed', 0, 200),
          loop: read('ambient-loop', 'Loop period', .25, 120),
          phase: read('ambient-phase', 'Phase', -360, 360),
          tileable: ($('ambient-tileable') as HTMLInputElement).checked,
          count: whole('ambient-count', 'Particle count', 1, 80),
          speedMin: read('ambient-speed-min', 'Speed minimum', 0, 200),
          speedMax: read('ambient-speed-max', 'Speed maximum', 0, 200),
          sizeMin: read('ambient-size-min', 'Size minimum', 1, 240),
          sizeMax: read('ambient-size-max', 'Size maximum', 1, 240),
          opacityMin: read('ambient-opacity-min', 'Opacity minimum', 0, 100) / 100,
          opacityMax: read('ambient-opacity-max', 'Opacity maximum', 0, 100) / 100,
          lifetime: read('ambient-lifetime', 'Lifetime', .5, 120),
          regionX: read('ambient-region-x', 'Region X', 0, 100) / 100,
          regionY: read('ambient-region-y', 'Region Y', 0, 100) / 100,
          regionWidth: read('ambient-region-width', 'Region width', 2, 100) / 100,
          regionHeight: read('ambient-region-height', 'Region height', 2, 100) / 100,
          seed: whole('ambient-seed', 'Variation seed', 0, 2147483647) };
      } else if (preset === 'shadow') {
        const colorField = $<HTMLInputElement>('shadow-color');
        built = { ...base, kind: 'shadow', angle: read('shadow-angle', 'Direction', -180, 180),
          distance: read('shadow-distance', 'Offset distance', 0, 200),
          opacity: read('shadow-opacity', 'Shadow opacity', 0, 100) / 100,
          blur: read('shadow-blur', 'Shadow softness', 0, 60),
          color: /^#[0-9a-fA-F]{6}$/.test(colorField.value) ? colorField.value.toLowerCase() : '#000000',
          speed: read('shadow-speed', 'Movement speed', .01, 2),
          amplitude: read('shadow-amplitude', 'Movement amplitude', 0, 80),
          phase: read('shadow-phase', 'Phase', -360, 360) };
      } else if (preset === 'warp') {
        const labels = ['Top left', 'Top right', 'Bottom right', 'Bottom left'];
        built = { ...base, kind: 'warp', corners: [0, 1, 2, 3].map(index => ({
          x: read(`warp-${index}-x`, `${labels[index]} X`, -200, 200) / 100,
          y: read(`warp-${index}-y`, `${labels[index]} Y`, -200, 200) / 100,
        })) as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }] };
      }
      if (failure) { options.notify(failure); return; }
      if (!built) { options.notify('Unsupported layer effect'); return; }
      const next = structuredClone(cfg);
      next.layerEffects = effect ? (next.layerEffects ?? []).map(old => old.id === effect.id ? built! : old) : [...(next.layerEffects ?? []), built];
      editing = built.id;
      void save(next);
    };
  }

  function updateTime() {
    const clock = $('parallax-clock');
    if (clock) clock.textContent = `${options.getTime().toFixed(2)}s / ${sceneDuration(options.getScene()).toFixed(2)}s`;
  }

  /** Open a specific applied effect, used by the Timeline workspace's Edit action. */
  function open(effectId: string) {
    const effect = (options.getScene().layerEffects ?? []).find(e => e.id === effectId);
    if (!effect) return;
    preset = effect.kind; editing = effect.id; render();
  }

  return { render, updateTime, open };
}
