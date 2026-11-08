import type { CameraSceneConfig } from '../camera/types.ts';
import { sceneDuration } from '../camera/animation.ts';
import type { FrameDirection, LayerEffect, LayerEffectKind, MaskKind } from '../camera/layer-effects.ts';

type Feature = 'depth' | 'depthScale' | 'planes' | LayerEffectKind;
const features: { id: Feature; name: string; description: string }[] = [
  { id: 'depth', name: 'Depth-based parallax', description: 'Nearer layers shift more than distant layers as the camera translates. Essential for the 2.5D look.' },
  { id: 'drift', name: 'Independent layer drift', description: 'Add small movement to a layer even when the camera is nearly still.' },
  { id: 'transform', name: 'Layer scale and rotation', description: 'Small transforms can suggest perspective or emphasize a compositional element.' },
  { id: 'framing', name: 'Foreground framing', description: 'Let leaves, branches or ferns partially enter and leave the frame.' },
  { id: 'fade', name: 'Layer fade', description: 'Fade individual elements without fading the complete image.' },
  { id: 'reveal', name: 'Animated mask reveal', description: 'Reveal artwork through a moving shape, gradient or mask.' },
];
const environmental: { id: Feature; name: string; description: string }[] = [
  { id: 'wind', name: 'Sway / Wind', description: 'Pivot-based rotation with small gusts, for foliage, branches and hair.' },
  { id: 'float', name: 'Floating / Bobbing', description: 'Gentle looping vertical, lateral or combined movement for hovering elements.' },
  { id: 'ambient', name: 'Ambient Looping', description: 'Loop environmental artwork, or scatter a transparent artwork as lightweight particles.' },
  { id: 'shadow', name: 'Shadow Movement', description: 'An attached, softened silhouette with subtle periodic light movement.' },
  { id: 'depthScale', name: 'Depth-based Scale', description: 'Resize layers from their depth so foreground art reads slightly larger.' },
  { id: 'planes', name: 'Multi-plane Camera', description: 'Add intermediate depth planes for finer separation than near, subject and far.' },
  { id: 'warp', name: 'Perspective Warp', description: 'Deform one flat layer with four animated corners to suggest a new viewpoint.' },
];
const names = Object.fromEntries([...features, ...environmental].map(f => [f.id, f.name])) as Record<Feature, string>;
const directions: FrameDirection[] = ['left', 'right', 'top', 'bottom'];
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const pct = (value: number) => Math.round(value * 1000) / 10;

export function createParallaxWorkspace(options: {
  getScene: () => CameraSceneConfig; getSceneKey: () => string; getTime: () => number; seek: (seconds: number) => void;
  commit: (scene: CameraSceneConfig) => Promise<void>; notify: (message: string) => void;
}) {
  let preset: Feature | '' = '', editing = '', sceneKey = '';
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

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

  function catalogue(items: { id: Feature; name: string; description: string }[]) {
    return `<div class="parallax-catalogue">${items.map(f =>
      `<button data-parallax="${f.id}" class="camera-card ${preset === f.id ? 'selected' : ''}"><b>${f.name}</b><span>${f.description}</span></button>`).join('')}</div>`;
  }

  function render() {
    const cfg = options.getScene();
    if (sceneKey !== options.getSceneKey()) { sceneKey = options.getSceneKey(); preset = ''; editing = ''; }
    if (editing && !(cfg.layerEffects ?? []).some(effect => effect.id === editing)) editing = '';
    $('parallax-catalogue').innerHTML = catalogue(features);
    const environmentalHost = $('parallax-environmental-targets');
    if (environmentalHost) environmentalHost.innerHTML = catalogue(environmental);
    document.querySelectorAll<HTMLButtonElement>('#parallax-catalogue [data-parallax], #parallax-environmental-targets [data-parallax]').forEach(button => {
      button.onclick = () => { preset = button.dataset.parallax as Feature; editing = ''; render(); };
    });
    renderApplied(cfg);
    renderInspector(cfg);
    updateTime();
  }

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
      rows.push(`<div class="parallax-item"><div><b>Multi-plane Camera</b><small>${cfg.depthPlanes!.length} plane${cfg.depthPlanes!.length === 1 ? '' : 's'} · ${escape(cfg.depthPlanes!.map(plane => `${plane.name} ${pct(plane.depth)}%`).join(', '))}</small></div><div class="parallax-actions"><button data-planes-edit>Edit</button><button data-planes-reset>Reset</button></div></div>`);
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

  function input(id: string, label: string, value: number, min: number, max: number, step: number | 'any' = 'any') {
    return `<label class="field">${label}<input id="${id}" type="number" required min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
  }
  const layerPicker = (cfg: CameraSceneConfig, current: string[] | undefined, multiple: boolean, selectedId: string) => multiple
    ? `<fieldset class="parallax-layers"><legend>Target layers</legend>${cfg.layers.map(layer =>
      `<label class="field"><span>${escape(layer.name)}</span><input type="checkbox" name="parallax-layer" value="${escape(layer.id)}" ${(current ?? []).includes(layer.id) ? 'checked' : ''}></label>`).join('') || '<p class="parallax-empty">Import artwork first.</p>'}</fieldset>`
    : `<label class="field">Target layer<select id="parallax-layer">${cfg.layers.map(layer =>
      `<option value="${escape(layer.id)}" ${layer.id === (current?.[0] ?? selectedId) ? 'selected' : ''}>${escape(layer.name)} · depth ${layer.depth.toFixed(2)}</option>`).join('')}</select></label>`;

  function renderInspector(cfg: CameraSceneConfig) {
    const inspector = $('parallax-inspector');
    if (!preset) {
      inspector.innerHTML = '<h3>Parallax and layer animation</h3><p class="animation-note">Choose a technique to add depth or animate individual layers. Camera movements are unchanged.</p>';
      return;
    }
    const effect = (cfg.layerEffects ?? []).find(e => e.id === editing);
    const duration = sceneDuration(cfg);
    const start = effect?.start ?? 0;
    const length = effect?.duration ?? Math.min(3, duration);
    const end = Math.max(0, duration - start);
    const timing = input('parallax-start', 'Start · seconds', start, 0, Math.max(0, duration - .01)) + input('parallax-duration', 'Duration · seconds', length, .01, Math.max(.01, end));
    const action = `<div class="row-actions"><button class="outline" type="submit">${effect ? 'Update effect' : 'Add effect'}</button>${effect ? '<button type="button" id="parallax-add-another">＋ Add another</button><button type="button" id="parallax-cancel">Cancel edit</button>' : ''}</div><p class="animation-note">The same effect can be added more than once; each copy keeps its own timing.</p>`;
    if (preset === 'depthScale') {
      const settings = cfg.depthScale;
      const influence = settings?.influence ?? {};
      inspector.innerHTML = `<h3>Depth-based Scale</h3><p class="animation-note">Scale is applied to the layer plane before camera projection. 100% is neutral; the reference depth stays exactly 1.</p>
        ${input('depth-scale-near', 'Near (depth 1) · %', pct(settings?.near ?? 1), 25, 300)}
        ${input('depth-scale-far', 'Far (depth 0) · %', pct(settings?.far ?? 1), 25, 300)}
        ${input('depth-scale-reference', 'Reference depth · %', pct(settings?.reference ?? .5), 5, 95)}
        ${input('depth-scale-strength', 'Strength · %', pct(settings?.strength ?? 1), 0, 200)}
        <fieldset class="parallax-layers"><legend>Per-layer influence · %</legend>${cfg.layers.map(layer =>
          `<label class="field"><span>${escape(layer.name)} <small>depth ${pct(layer.depth)}%</small></span><input id="scale-influence-${layer.id}" type="number" min="0" max="200" step="1" value="${pct(influence[layer.id] ?? 1)}"></label>`).join('') || '<p class="parallax-empty">Import artwork first.</p>'}</fieldset>
        <div class="row-actions"><button class="outline" type="button" id="depth-scale-save">Apply scale settings</button><button type="button" id="depth-scale-reset">Reset to neutral</button></div>`;
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
      inspector.innerHTML = `<h3>Multi-plane Camera</h3><p class="animation-note">Planes replace a layer's stored depth for the camera only; artwork order never changes. Unassigned layers keep their own depth.</p>
        ${planes.map((plane, index) => `<fieldset class="parallax-layers"><legend>${escape(plane.name)}</legend>
          <label class="field">Name<input id="plane-name-${index}" type="text" maxlength="60" value="${escape(plane.name)}"></label>
          <label class="field">Depth · %<input id="plane-depth-${index}" type="number" min="0" max="100" step="1" value="${pct(plane.depth)}"></label>
          <button type="button" data-plane-delete="${plane.id}">Delete plane</button></fieldset>`).join('') || '<p class="parallax-empty">No depth planes yet. Add one, then assign layers.</p>'}
        <fieldset class="parallax-layers"><legend>Layer assignments</legend>${cfg.layers.map(layer =>
          `<label class="field"><span>${escape(layer.name)} <small>stored ${pct(layer.depth)}%</small></span><select id="layer-plane-${layer.id}"><option value="">— stored depth —</option>${planes.map(plane =>
            `<option value="${plane.id}" ${assignment(layer.id) === plane.id ? 'selected' : ''}>${escape(plane.name)}</option>`).join('')}</select></label>`).join('') || '<p class="parallax-empty">Import artwork first.</p>'}</fieldset>
        <div class="row-actions"><button type="button" id="plane-add">＋ Add plane</button><button class="outline" type="button" id="plane-save">Apply planes</button></div>`;
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
        const planeList = (next.depthPlanes ?? []).map((plane, index) => {
          const name = (document.getElementById(`plane-name-${index}`) as HTMLInputElement).value.trim() || plane.name;
          const depth = (document.getElementById(`plane-depth-${index}`) as HTMLInputElement).valueAsNumber / 100;
          if (!Number.isFinite(depth) || depth < 0 || depth > 1) { options.notify('Plane depth must be 0–100%'); return null; }
          return { ...plane, name: name.slice(0, 60), depth, layerIds: [] as string[] };
        });
        if (planeList.some(plane => plane === null)) return;
        for (const layer of cfg.layers) {
          const select = document.getElementById(`layer-plane-${layer.id}`) as HTMLSelectElement | null;
          const plane = planeList.find(candidate => candidate!.id === select?.value);
          if (plane) plane.layerIds.push(layer.id);
        }
        next.depthPlanes = planeList as NonNullable<typeof next.depthPlanes>;
        void save(next);
      };
      return;
    }
    if (preset === 'depth') {
      const influence = cfg.parallax?.influence ?? {};
      inspector.innerHTML = `<h3>Depth-based parallax</h3><p class="animation-note">Parallax scales each layer's camera translation inside the projection, never a screen offset. 100% is neutral; 0% pins a layer to the camera. Depth 0 is background, 1 is foreground.</p>
        <label class="field">Parallax strength · %<input id="parallax-strength" type="range" min="0" max="300" step="1" value="${pct(cfg.parallax?.strength ?? 1)}"><output id="parallax-strength-out">${pct(cfg.parallax?.strength ?? 1)}%</output></label>
        <fieldset class="parallax-layers"><legend>Layer depth and influence</legend>${cfg.layers.map(layer =>
          `<div class="depth-layer"><div class="depth-layer-head"><span class="depth-name" title="${escape(layer.name)}">${escape(layer.name)}</span><label class="depth-influence">Influence %<input id="influence-${layer.id}" type="number" min="0" max="300" step="1" value="${pct(influence[layer.id] ?? 1)}"></label></div><div class="depth-row"><span class="depth-label">Depth</span><input id="depth-${layer.id}" type="range" min="0" max="100" step="1" value="${pct(layer.depth)}"><output id="depth-out-${layer.id}">${pct(layer.depth)}%</output></div></div>`).join('') || '<p class="parallax-empty">Import artwork first.</p>'}</fieldset>
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
    // Default to the nearest layer; parallax and enters read best on foreground artwork.
    const selectedId = cfg.layers.reduce((best, layer) => layer.depth > (best?.depth ?? -1) ? layer : best, cfg.layers[0])?.id ?? '';
    let fields = timing;
    if (preset === 'drift') {
      const value = effect?.kind === 'drift' ? effect : undefined;
      fields += layerPicker(cfg, [value?.layerIds[0] ?? selectedId], false, selectedId);
      fields += `<label class="field">Direction<select id="drift-axis"><option value="x" ${value?.axis === 'x' ? 'selected' : ''}>Horizontal</option><option value="y" ${value?.axis === 'y' ? 'selected' : ''}>Vertical</option><option value="xy" ${!value || value.axis === 'xy' ? 'selected' : ''}>Both</option></select></label>
        <label class="field">Motion<select id="drift-motion"><option value="sway" ${value?.motion !== 'noise' ? 'selected' : ''}>Gentle sway</option><option value="noise" ${value?.motion === 'noise' ? 'selected' : ''}>Irregular</option></select></label>`;
      fields += input('drift-amplitude', 'Amplitude · pixels', value?.amplitude ?? 12, 0, 400);
      fields += input('drift-speed', 'Speed · cycles/sec', value?.speed ?? .25, .02, 4);
      fields += input('drift-phase', 'Phase · degrees', value?.phase ?? 0, -360, 360);
      fields += input('drift-seed', 'Variation seed', value?.seed ?? 7, 0, 2147483647, 1);
    }
    if (preset === 'transform') {
      const value = effect?.kind === 'transform' ? effect : undefined;
      fields += layerPicker(cfg, [value?.layerIds[0] ?? selectedId], false, selectedId);
      fields += input('transform-scale-from', 'Start scale · %', pct(value?.startScale ?? 1), 10, 400);
      fields += input('transform-scale-to', 'End scale · %', pct(value?.endScale ?? 1.1), 10, 400);
      fields += input('transform-rotation-from', 'Start rotation · degrees', value?.startRotation ?? 0, -180, 180);
      fields += input('transform-rotation-to', 'End rotation · degrees', value?.endRotation ?? 3, -180, 180);
    }
    if (preset === 'framing') {
      const value = effect?.kind === 'framing' ? effect : undefined;
      fields += layerPicker(cfg, value?.layerIds, true, selectedId);
      fields += `<label class="field">Enters from<select id="framing-direction">${directions.map(direction =>
        `<option value="${direction}" ${(value?.direction ?? 'left') === direction ? 'selected' : ''}>${direction[0].toUpperCase()}${direction.slice(1)}</option>`).join('')}</select></label>`;
      fields += input('framing-from', 'Start offset · % of frame', value?.startOffset ?? 110, -200, 200);
      fields += input('framing-to', 'End offset · % of frame', value?.endOffset ?? 0, -200, 200);
      fields += input('framing-repeat', 'Enter/exit cycles', value?.repeat ?? 1, 1, 8, 1);
      fields += '<p class="animation-note">100% places the layer just outside the frame; 0% is its arranged position. Even cycles end outside the frame.</p>';
    }
    if (preset === 'fade') {
      const value = effect?.kind === 'fade' ? effect : undefined;
      fields += layerPicker(cfg, value?.layerIds, true, selectedId);
      fields += input('fade-from', 'Start opacity · %', pct(value?.startOpacity ?? 0), 0, 100);
      fields += input('fade-to', 'End opacity · %', pct(value?.endOpacity ?? 1), 0, 100);
      fields += '<p class="animation-note">Opacity multiplies the layer’s Arrange opacity. Other layers keep theirs.</p>';
    }
    if (preset === 'reveal') {
      const value = effect?.kind === 'reveal' ? effect : undefined;
      fields += layerPicker(cfg, [value?.layerIds[0] ?? selectedId], false, selectedId);
      fields += `<label class="field">Mask<select id="reveal-mask"><option value="wipe" ${value?.mask !== 'radial' ? 'selected' : ''}>Directional wipe</option><option value="radial" ${value?.mask === 'radial' ? 'selected' : ''}>Radial reveal</option></select></label>`;
      fields += `<label class="field">Direction<select id="reveal-direction">${directions.map(direction =>
        `<option value="${direction}" ${(value?.direction ?? 'left') === direction ? 'selected' : ''}>${direction[0].toUpperCase()}${direction.slice(1)}</option>`).join('')}</select></label>`;
      fields += input('reveal-origin-x', 'Origin X · % of frame', pct(value?.originX ?? .5), 0, 100);
      fields += input('reveal-origin-y', 'Origin Y · % of frame', pct(value?.originY ?? .5), 0, 100);
      fields += input('reveal-from', 'Start coverage · %', pct(value?.startCoverage ?? 0), 0, 100);
      fields += input('reveal-to', 'End coverage · %', pct(value?.endCoverage ?? 1), 0, 100);
      fields += input('reveal-softness', 'Edge softness · %', pct(value?.softness ?? .35), 0, 100);
      fields += '<p class="animation-note">Direction applies to wipes; origin applies to radial reveals.</p>';
    }
    if (preset === 'wind') {
      const value = effect?.kind === 'wind' ? effect : undefined;
      fields += layerPicker(cfg, value?.layerIds, true, selectedId);
      fields += `<label class="field">Wind direction<select id="wind-direction"><option value="left" ${value?.direction !== 'right' ? 'selected' : ''}>From the right · push left</option><option value="right" ${value?.direction === 'right' ? 'selected' : ''}>From the left · push right</option></select></label>`;
      fields += input('wind-pivot-x', 'Pivot X · % of layer', pct(value?.pivotX ?? .5), 0, 100);
      fields += input('wind-pivot-y', 'Pivot Y · % of layer', pct(value?.pivotY ?? 1), 0, 100);
      fields += input('wind-rotation', 'Rotation amplitude · degrees', value?.rotation ?? 4, 0, 30);
      fields += input('wind-movement', 'Secondary movement · pixels', value?.movement ?? 5, 0, 120);
      fields += input('wind-speed', 'Speed · cycles/sec', value?.speed ?? .35, .02, 3);
      fields += input('wind-gust', 'Gust intensity · %', pct(value?.gust ?? .3), 0, 100);
      fields += input('wind-phase', 'Phase · degrees', value?.phase ?? 0, -360, 360);
      fields += input('wind-spread', 'Phase spread per layer · degrees', value?.spread ?? 35, 0, 180);
      fields += '<p class="animation-note">Rotation happens around the pivot; the pivot defaults to bottom centre for foliage. Phase spread keeps multiple layers from swaying in unison.</p>';
    }
    if (preset === 'float') {
      const value = effect?.kind === 'float' ? effect : undefined;
      fields += layerPicker(cfg, value?.layerIds, true, selectedId);
      fields += `<label class="field">Movement<select id="float-axis"><option value="y" ${value?.axis !== 'x' && value?.axis !== 'xy' ? 'selected' : ''}>Vertical bobbing</option><option value="x" ${value?.axis === 'x' ? 'selected' : ''}>Horizontal floating</option><option value="xy" ${value?.axis === 'xy' ? 'selected' : ''}>Combined</option></select></label>`;
      fields += input('float-amplitude', 'Amplitude · pixels', value?.amplitude ?? 14, 0, 200);
      fields += input('float-speed', 'Speed · cycles/sec', value?.speed ?? .35, .02, 3);
      fields += input('float-phase', 'Phase · degrees', value?.phase ?? 0, -360, 360);
      fields += input('float-rotation', 'Secondary rotation · degrees', value?.rotation ?? 0, -6, 6);
      fields += '<p class="animation-note">Motion is positional and periodic; amplitude fades in and out so seeking and loops stay smooth.</p>';
    }
    if (preset === 'ambient') {
      const value = effect?.kind === 'ambient' ? effect : undefined;
      fields += layerPicker(cfg, [value?.layerIds[0] ?? selectedId], false, selectedId);
      fields += `<label class="field">Mode<select id="ambient-mode"><option value="layer" ${value?.mode !== 'particles' ? 'selected' : ''}>Layer loop</option><option value="particles" ${value?.mode === 'particles' ? 'selected' : ''}>Particle loop</option></select></label>`;
      fields += `<label class="field">Motion<select id="ambient-motion"><option value="oscillate" ${value?.motion !== 'drift' && value?.motion !== 'pulse' ? 'selected' : ''}>Gentle oscillation</option><option value="drift" ${value?.motion === 'drift' ? 'selected' : ''}>Continuous drift</option><option value="pulse" ${value?.motion === 'pulse' ? 'selected' : ''}>Opacity pulse</option></select></label>`;
      fields += `<label class="field">Direction<select id="ambient-direction">${(['left','right','up','down'] as const).map(direction => `<option value="${direction}" ${(value?.direction ?? 'left') === direction ? 'selected' : ''}>${direction[0].toUpperCase()}${direction.slice(1)}</option>`).join('')}</select></label>`;
      fields += input('ambient-amplitude', 'Amplitude · px or pulse %', value?.amplitude ?? 40, 0, 400);
      fields += input('ambient-speed', 'Drift speed · pixels/sec', value?.speed ?? 12, 0, 200);
      fields += input('ambient-loop', 'Oscillation / pulse period · seconds', value?.loop ?? 8, .25, 120);
      fields += input('ambient-phase', 'Phase · degrees', value?.phase ?? 0, -360, 360);
      fields += `<label class="field"><span>Tileable artwork (drift only)</span><input id="ambient-tileable" type="checkbox" ${value?.tileable ? 'checked' : ''}></label>`;
      fields += `<details class="parallax-subsection"><summary>Particle settings</summary>
        ${input('ambient-count', 'Count', value?.count ?? 24, 1, 80, 1)}
        ${input('ambient-speed-min', 'Speed min · px/sec', value?.speedMin ?? 8, 0, 200)}
        ${input('ambient-speed-max', 'Speed max · px/sec', value?.speedMax ?? 28, 0, 200)}
        ${input('ambient-size-min', 'Size min · pixels', value?.sizeMin ?? 6, 1, 240)}
        ${input('ambient-size-max', 'Size max · pixels', value?.sizeMax ?? 18, 1, 240)}
        ${input('ambient-opacity-min', 'Opacity min · %', pct(value?.opacityMin ?? .15), 0, 100)}
        ${input('ambient-opacity-max', 'Opacity max · %', pct(value?.opacityMax ?? .65), 0, 100)}
        ${input('ambient-lifetime', 'Lifetime · seconds', value?.lifetime ?? 6, .5, 120)}
        ${input('ambient-region-x', 'Region X · % of frame', pct(value?.regionX ?? 0), 0, 100)}
        ${input('ambient-region-y', 'Region Y · % of frame', pct(value?.regionY ?? 0), 0, 100)}
        ${input('ambient-region-width', 'Region width · % of frame', pct(value?.regionWidth ?? 1), 2, 100)}
        ${input('ambient-region-height', 'Region height · % of frame', pct(value?.regionHeight ?? 1), 2, 100)}
        ${input('ambient-seed', 'Variation seed', value?.seed ?? 11, 0, 2147483647, 1)}
        <p class="animation-note">Particle mode uses the selected transparent artwork as its texture. Positions and lifetimes are calculated from absolute time with a fixed seed, never accumulated.</p>
      </details>`;
      fields += '<p class="animation-note">Layer mode uses amplitude, speed, period and tileable. Particle mode uses the settings above. Only mark artwork tileable when its edges actually repeat.</p>';
    }
    if (preset === 'shadow') {
      const value = effect?.kind === 'shadow' ? effect : undefined;
      fields += layerPicker(cfg, value?.layerIds, true, selectedId);
      fields += input('shadow-angle', 'Direction · degrees', value?.angle ?? 90, -180, 180);
      fields += input('shadow-distance', 'Offset · pixels', value?.distance ?? 18, 0, 200);
      fields += input('shadow-opacity', 'Opacity · %', pct(value?.opacity ?? .35), 0, 100);
      fields += input('shadow-blur', 'Softness · pixels', value?.blur ?? 8, 0, 60);
      fields += `<label class="field">Colour<input id="shadow-color" type="color" value="${value?.color ?? '#000000'}"></label>`;
      fields += input('shadow-speed', 'Movement speed · cycles/sec', value?.speed ?? .15, .01, 2);
      fields += input('shadow-amplitude', 'Movement amplitude · pixels', value?.amplitude ?? 4, 0, 80);
      fields += input('shadow-phase', 'Phase · degrees', value?.phase ?? 0, -360, 360);
      fields += '<p class="animation-note">The shadow uses the layer silhouette, renders beneath it and follows the layer opacity, rotation and camera projection.</p>';
    }
    if (preset === 'warp') {
      const value = effect?.kind === 'warp' ? effect : undefined;
      const corner = (index: number) => ({ x: value?.corners[index].x ?? [-1, 1, 1, -1][index], y: value?.corners[index].y ?? [-1, -1, 1, 1][index] });
      fields += layerPicker(cfg, [value?.layerIds[0] ?? selectedId], false, selectedId);
      fields += '<fieldset class="parallax-layers"><legend>Corner positions · % of layer half-size</legend>';
      for (const [index, label] of ['Top left', 'Top right', 'Bottom right', 'Bottom left'].entries()) {
        const point = corner(index);
        fields += `<div class="parallax-corner"><b>${label}</b>${input(`warp-${index}-x`, 'X', pct(point.x), -200, 200)}${input(`warp-${index}-y`, 'Y', pct(point.y), -200, 200)}</div>`;
      }
      fields += '</fieldset>';
      fields += '<button type="button" id="warp-neutral">Reset corners to neutral</button>';
      fields += '<p class="animation-note">Neutral is the unwarped layer. The warp animates from neutral to the configured corners and composes with camera movement. It deforms a flat image; it cannot reveal hidden sides.</p>';
    }
    inspector.innerHTML = `<h3>${names[preset]}</h3><p class="animation-note">Timing is measured from the start of the scene and holds its endpoint.</p><form id="parallax-form">${fields}<p class="animation-note">Coordinates are scene pixels, measured from the top left.</p>${action}</form>`;
    if (effect) $('parallax-cancel').onclick = () => { editing = ''; render(); };
    if (effect) $('parallax-add-another').onclick = () => { editing = ''; render(); };
    if (preset === 'warp') {
      $<HTMLButtonElement>('warp-neutral').onclick = () => {
        const neutral = [[-100, -100], [100, -100], [100, 100], [-100, 100]];
        neutral.forEach(([x, y], index) => {
          (document.getElementById(`warp-${index}-x`) as HTMLInputElement).value = String(x);
          (document.getElementById(`warp-${index}-y`) as HTMLInputElement).value = String(y);
        });
      };
    }
    $('parallax-form').onsubmit = event => {
      event.preventDefault();
      const val = (id: string, fallback: number) => {
        const field = document.getElementById(id) as HTMLInputElement | null;
        return field ? field.valueAsNumber : fallback;
      };
      const picked = preset === 'drift' || preset === 'transform' || preset === 'reveal' || preset === 'ambient' || preset === 'warp'
        ? [$<HTMLSelectElement>('parallax-layer').value]
        : [...document.querySelectorAll<HTMLInputElement>('input[name=parallax-layer]:checked')].map(i => i.value);
      if (!picked.length) { options.notify('Select at least one layer.'); return; }
      const base = { id: effect?.id ?? crypto.randomUUID(), start: val('parallax-start', 0), duration: val('parallax-duration', 1), layerIds: picked };
      let built: LayerEffect;
      if (preset === 'drift') built = { ...base, kind: 'drift', axis: $<HTMLSelectElement>('drift-axis').value as 'x' | 'y' | 'xy', motion: $<HTMLSelectElement>('drift-motion').value as 'sway' | 'noise', amplitude: val('drift-amplitude', 12), speed: val('drift-speed', .25), phase: val('drift-phase', 0), seed: val('drift-seed', 7) };
      else if (preset === 'transform') built = { ...base, kind: 'transform', startScale: val('transform-scale-from', 100) / 100, endScale: val('transform-scale-to', 110) / 100, startRotation: val('transform-rotation-from', 0), endRotation: val('transform-rotation-to', 3) };
      else if (preset === 'framing') built = { ...base, kind: 'framing', direction: $<HTMLSelectElement>('framing-direction').value as FrameDirection, startOffset: val('framing-from', 110), endOffset: val('framing-to', 0), repeat: val('framing-repeat', 1) };
      else if (preset === 'fade') built = { ...base, kind: 'fade', startOpacity: val('fade-from', 0) / 100, endOpacity: val('fade-to', 100) / 100 };
      else if (preset === 'wind') built = { ...base, kind: 'wind', direction: $<HTMLSelectElement>('wind-direction').value as 'left' | 'right', pivotX: val('wind-pivot-x', 50) / 100, pivotY: val('wind-pivot-y', 100) / 100, rotation: val('wind-rotation', 4), movement: val('wind-movement', 5), speed: val('wind-speed', .35), gust: val('wind-gust', 30) / 100, phase: val('wind-phase', 0), spread: val('wind-spread', 35) };
      else if (preset === 'float') built = { ...base, kind: 'float', axis: $<HTMLSelectElement>('float-axis').value as 'x' | 'y' | 'xy', amplitude: val('float-amplitude', 14), speed: val('float-speed', .35), phase: val('float-phase', 0), rotation: val('float-rotation', 0) };
      else if (preset === 'ambient') built = { ...base, kind: 'ambient', mode: $<HTMLSelectElement>('ambient-mode').value as 'layer' | 'particles', motion: $<HTMLSelectElement>('ambient-motion').value as 'drift' | 'oscillate' | 'pulse', direction: $<HTMLSelectElement>('ambient-direction').value as 'left' | 'right' | 'up' | 'down', amplitude: val('ambient-amplitude', 40), speed: val('ambient-speed', 12), loop: val('ambient-loop', 8), phase: val('ambient-phase', 0), tileable: $<HTMLInputElement>('ambient-tileable').checked, count: val('ambient-count', 24), speedMin: val('ambient-speed-min', 8), speedMax: val('ambient-speed-max', 28), sizeMin: val('ambient-size-min', 6), sizeMax: val('ambient-size-max', 18), opacityMin: val('ambient-opacity-min', 15) / 100, opacityMax: val('ambient-opacity-max', 65) / 100, lifetime: val('ambient-lifetime', 6), regionX: val('ambient-region-x', 0) / 100, regionY: val('ambient-region-y', 0) / 100, regionWidth: val('ambient-region-width', 100) / 100, regionHeight: val('ambient-region-height', 100) / 100, seed: val('ambient-seed', 11) };
      else if (preset === 'shadow') built = { ...base, kind: 'shadow', angle: val('shadow-angle', 90), distance: val('shadow-distance', 18), opacity: val('shadow-opacity', 35) / 100, blur: val('shadow-blur', 8), color: $<HTMLInputElement>('shadow-color').value, speed: val('shadow-speed', .15), amplitude: val('shadow-amplitude', 4), phase: val('shadow-phase', 0) };
      else if (preset === 'reveal') built = { ...base, kind: 'reveal', mask: $<HTMLSelectElement>('reveal-mask').value as MaskKind, direction: $<HTMLSelectElement>('reveal-direction').value as FrameDirection, originX: val('reveal-origin-x', 50) / 100, originY: val('reveal-origin-y', 50) / 100, startCoverage: val('reveal-from', 0) / 100, endCoverage: val('reveal-to', 100) / 100, softness: val('reveal-softness', 35) / 100 };
      else if (preset === 'warp') built = { ...base, kind: 'warp', corners: [0, 1, 2, 3].map(index => ({ x: val(`warp-${index}-x`, 100 * [-1, 1, 1, -1][index]) / 100, y: val(`warp-${index}-y`, 100 * [-1, -1, 1, 1][index]) / 100 })) as [{x:number;y:number},{x:number;y:number},{x:number;y:number},{x:number;y:number}] };
      else throw new Error('Unsupported layer effect');
      const next = structuredClone(cfg);
      next.layerEffects = effect ? (next.layerEffects ?? []).map(old => old.id === effect.id ? built : old) : [...(next.layerEffects ?? []), built];
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
