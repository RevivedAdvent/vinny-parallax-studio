import type { CameraSceneConfig, Layer } from '../camera/types.ts';
import { type LayerCommands } from './layer-commands.ts';
import { icons } from './icons.ts';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

type FieldKey = 'x' | 'y' | 'scale' | 'rotation' | 'opacity';

/**
 * Layer properties inspector for the Arrange tab.
 *
 * Transform edits mutate the live scene layers (the same objects the renderer
 * reads) and repaint the preview immediately; the values are committed through
 * validation when the edit settles, so dragging a slider never rebuilds this
 * panel and never loses focus.
 */
export function createLayerInspector(options: {
  getScene: () => CameraSceneConfig;
  commands: LayerCommands;
  selection: () => string[];
  /** Push live (unvalidated) layer edits to the renderer. */
  applyLive: () => Promise<void>;
  /** Validate, persist and repaint the live scene. */
  commitLive: () => Promise<void>;
  notify: (message: string) => void;
  /** Notify the viewport that geometry changed. */
  onGeometry: () => void;
}) {
  const root = document.getElementById('properties') as HTMLElement;
  const open = { transform: true, advanced: false };
  let signature = '';

  const selectedLayer = (): Layer | undefined => {
    const cfg = options.getScene();
    return cfg.layers.find(layer => layer.id === options.selection()[0]);
  };

  function fieldValue(layer: Layer, key: FieldKey): number {
    const raw = layer[key] ?? (key === 'scale' || key === 'opacity' ? 1 : 0);
    return key === 'opacity' ? raw * 100 : raw;
  }

  function geometry(layer: Layer) {
    const cfg = options.getScene();
    return {
      width: layer.width ?? 0,
      height: layer.height ?? 0,
      scale: layer.scale ?? 1,
      anchor: cfg.camera.anchor,
    };
  }

  function html(layer: Layer, ids: string[]) {
    const cfg = options.getScene();
    const fields: { key: FieldKey; label: string; min: number; max: number; step: number; suffix?: string }[] = [
      { key: 'x', label: 'X', min: -cfg.width, max: cfg.width, step: 1 },
      { key: 'y', label: 'Y', min: -cfg.height, max: cfg.height, step: 1 },
      { key: 'scale', label: 'Scale', min: .1, max: 4, step: .01 },
      { key: 'rotation', label: 'Rotation', min: -180, max: 180, step: 1, suffix: '°' },
      { key: 'opacity', label: 'Opacity', min: 0, max: 100, step: 1, suffix: '%' },
    ];
    const size = geometry(layer);
    const multi = ids.length > 1;
    const locked = layer.locked === true;
    const lockNote = locked ? '<p class="inspector-note locked-note">Locked · unlock in the layer list to edit the transform.</p>' : '';
    const summary = multi ? `${ids.length} layers selected` : escapeHtml(layer.name);
    const note = multi ? `<p class="inspector-note">Transform fields edit <b>${escapeHtml(layer.name)}</b>. Opacity applies to all ${ids.length} selected layers.</p>` : '';
    return `
      <div class="inspector-summary">
        <span class="selected-name" title="${escapeHtml(layer.name)}">${summary}</span>
        <span class="inspector-badges">
          ${layer.locked ? `<span class="badge">${icons.lock}Locked</span>` : ''}
          ${layer.visible === false ? `<span class="badge">${icons.eyeOff}Hidden</span>` : ''}
        </span>
      </div>
      ${note}${lockNote}
      <section class="inspector-section" data-section="transform">
        <button type="button" class="section-head" data-section-toggle="transform" aria-expanded="${open.transform}"><span>Transform</span>${open.transform ? icons.chevron : icons.chevronRight}</button>
        <div class="section-body" ${open.transform ? '' : 'hidden'}>
          ${fields.map(field => `
            <div class="transform-row" data-row="${field.key}">
              <label for="layer-${field.key}">${field.label}</label>
              <input id="layer-${field.key}" data-slider="${field.key}" aria-label="${field.label} slider" type="range" min="${field.min}" max="${field.max}" step="${field.step}" value="${fieldValue(layer, field.key)}" ${locked ? 'disabled' : ''}>
              <span class="number-wrap">
                <input data-prop="${field.key}" aria-label="${field.label} exact value" type="number" step="any" value="${fieldValue(layer, field.key)}" ${locked ? 'disabled' : ''}>
                <span class="unit" aria-hidden="true">${field.suffix ?? ''}</span>
                <span class="number-steppers">
                  <button type="button" class="number-step" data-step="up" aria-label="Increase ${field.label}" title="Increase ${field.label}" ${locked ? 'disabled' : ''}></button>
                  <button type="button" class="number-step" data-step="down" aria-label="Decrease ${field.label}" title="Decrease ${field.label}" ${locked ? 'disabled' : ''}></button>
                </span>
              </span>
            </div>`).join('')}
          <div class="section-actions">
            <button type="button" class="ghost-action" data-action="reset-transform" title="Reset position, scale, rotation and opacity" ${locked ? 'disabled' : ''}>Reset transform</button>
            <button type="button" class="ghost-action" data-action="fit-canvas" title="Scale the artwork to fit inside the scene" ${locked ? 'disabled' : ''}>Fit layer to canvas</button>
          </div>
          <div class="align-actions" role="group" aria-label="Align layer to canvas">
            <span>Align to canvas</span>
            ${(['left', 'right', 'top', 'bottom', 'centre'] as const).map(edge => `<button type="button" class="ghost-action" data-align="${edge}" title="Align layer to canvas ${edge}" ${locked ? 'disabled' : ''}>${edge[0]!.toUpperCase() + edge.slice(1)}</button>`).join('')}
          </div>
        </div>
      </section>
      <section class="inspector-section" data-section="advanced">
        <button type="button" class="section-head" data-section-toggle="advanced" aria-expanded="${open.advanced}"><span>Advanced</span>${open.advanced ? icons.chevron : icons.chevronRight}</button>
        <div class="section-body" ${open.advanced ? '' : 'hidden'}>
          <dl class="inspector-data">
            <div><dt>Asset size</dt><dd>${size.width && size.height ? `${size.width} × ${size.height} px` : 'Unknown'}</dd></div>
            <div><dt>On canvas</dt><dd>${size.width && size.height ? `${Math.round(size.width * size.scale)} × ${Math.round(size.height * size.scale)} px` : '—'}</dd></div>
            <div><dt>Anchor</dt><dd>${Math.round(size.anchor.x)}, ${Math.round(size.anchor.y)}</dd></div>
          </dl>
          <div class="section-actions">
            <button type="button" class="ghost-action" data-action="replace-image">${icons.image} Replace image…</button>
            <input id="replace-image-file" type="file" accept="image/png,image/jpeg,image/webp" hidden>
          </div>
        </div>
      </section>`;
  }

  function render() {
    const cfg = options.getScene();
    const ids = options.selection();
    const layer = selectedLayer();
    if (!layer) {
      root.innerHTML = '<p class="inspector-empty">Select a layer to edit its transform.</p>';
      signature = '';
      return;
    }
    const next = [ids.join(','), layer.name, layer.locked === true ? 'l' : '', layer.visible === false ? 'h' : '', open.transform ? 't' : '', open.advanced ? 'v' : ''].join('|');
    if (next === signature) { sync(); return; }
    signature = next;
    root.innerHTML = html(layer, ids);
    wire(layer, ids, cfg);
    sync();
  }

  /** Refresh values in place. Never rebuilds, so focus and drags survive. */
  function sync() {
    const layer = selectedLayer();
    const ids = options.selection();
    if (!layer) { render(); return; }
    for (const key of ['x', 'y', 'scale', 'rotation', 'opacity'] as FieldKey[]) {
      const slider = root.querySelector<HTMLInputElement>(`[data-slider="${key}"]`);
      const number = root.querySelector<HTMLInputElement>(`[data-prop="${key}"]`);
      if (!slider || !number) continue;
      const value = fieldValue(layer, key);
      if (document.activeElement !== slider) slider.value = String(value);
      if (document.activeElement !== number) number.value = String(Number(value.toFixed(4)));
    }
    const summary = root.querySelector<HTMLElement>('.selected-name');
    if (summary && ids.length > 1) summary.textContent = `${ids.length} layers selected`;
    const data = root.querySelectorAll<HTMLElement>('.inspector-data dd');
    const size = geometry(layer);
    if (data[0]) data[0].textContent = size.width && size.height ? `${size.width} × ${size.height} px` : 'Unknown';
    if (data[1]) data[1].textContent = size.width && size.height ? `${Math.round(size.width * size.scale)} × ${Math.round(size.height * size.scale)} px` : '—';
  }

  function wire(layer: Layer, ids: string[], cfg: CameraSceneConfig) {
    for (const section of root.querySelectorAll<HTMLButtonElement>('[data-section-toggle]')) {
      section.onclick = () => {
        const key = section.dataset.sectionToggle as keyof typeof open;
        open[key] = !open[key];
        signature = '';
        render();
      };
    }

    for (const key of ['x', 'y', 'scale', 'rotation', 'opacity'] as FieldKey[]) {
      const slider = root.querySelector<HTMLInputElement>(`[data-slider="${key}"]`)!;
      const number = root.querySelector<HTMLInputElement>(`[data-prop="${key}"]`)!;
      const previous = () => fieldValue(selectedLayer() ?? layer, key);
      const apply = (source: HTMLInputElement, settle: boolean) => {
        const display = source.valueAsNumber;
        const value = key === 'opacity' ? display / 100 : display;
        const invalid = !Number.isFinite(value) || (key === 'scale' && value <= 0) || (key === 'opacity' && (value < 0 || value > 1));
        if (invalid) {
          const restore = previous();
          number.value = String(restore);
          slider.value = String(restore);
          options.notify(`Enter a valid value for ${key}`);
          return;
        }
        const live = selectedLayer();
        if (!live) return;
        // Opacity is a whole-selection edit; geometry edits the primary layer.
        const targets = key === 'opacity' ? options.getScene().layers.filter(candidate => ids.includes(candidate.id)) : [live];
        for (const target of targets) target[key] = value;
        const shown = key === 'opacity' ? value * 100 : value;
        if (document.activeElement !== number) number.value = String(shown);
        if (document.activeElement !== slider) slider.value = String(shown);
        options.onGeometry();
        if (settle) void options.commitLive().catch(error => options.notify(String(error)));
        else void options.applyLive().catch(error => options.notify(String(error)));
      };
      slider.oninput = () => apply(slider, false);
      slider.onchange = () => apply(slider, true);
      number.onchange = () => {
        if (number.valueAsNumber !== previous()) apply(number, true);
      };
      const stepNumber = (direction: number) => {
        const current = Number.isFinite(number.valueAsNumber) ? number.valueAsNumber : previous();
        let next = Number((current + direction * Number(slider.step)).toPrecision(14));
        if (key === 'opacity') next = Math.max(0, Math.min(100, next));
        if (key === 'scale' && next <= 0) return;
        number.value = String(next);
        apply(number, true);
      };
      for (const button of number.closest('.number-wrap')!.querySelectorAll<HTMLButtonElement>('[data-step]')) {
        // Keep a partially edited number focused when its stepper is clicked.
        button.onpointerdown = event => event.preventDefault();
        button.onclick = () => stepNumber(button.dataset.step === 'up' ? 1 : -1);
      }
      number.onkeydown = event => {
        if (event.key === 'Enter') { event.preventDefault(); number.blur(); }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          stepNumber(event.key === 'ArrowUp' ? 1 : -1);
        }
      };
    }

    const reset = root.querySelector<HTMLButtonElement>('[data-action="reset-transform"]');
    if (reset) reset.onclick = () => void options.commands.resetTransform(ids);
    const fit = root.querySelector<HTMLButtonElement>('[data-action="fit-canvas"]');
    if (fit) fit.onclick = () => void options.commands.fitToCanvas(layer.id);
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-align]')) {
      button.onclick = () => void options.commands.alignToCanvas(layer.id, button.dataset.align as 'left' | 'right' | 'top' | 'bottom' | 'centre');
    }

    const replace = root.querySelector<HTMLButtonElement>('[data-action="replace-image"]');
    const file = root.querySelector<HTMLInputElement>('#replace-image-file');
    if (replace && file) {
      replace.onclick = () => file.click();
      file.onchange = async () => {
        const picked = file.files?.[0];
        file.value = '';
        if (!picked) return;
        if (!/^image\/(png|jpeg|webp)$/.test(picked.type)) { options.notify('Choose a PNG, JPEG or WebP image'); return; }
        try {
          const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(picked);
          });
          const image = new Image();
          await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error(`Cannot decode ${picked.name}`)); image.src = data; });
          await options.commands.replaceImage(layer.id, data, image.naturalWidth, image.naturalHeight);
        } catch (error) { options.notify(`Replace failed: ${String(error)}`); }
      };
    }
    void cfg;
  }

  return { render, sync, open };
}

export type LayerInspector = ReturnType<typeof createLayerInspector>;
