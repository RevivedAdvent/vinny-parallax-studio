import type { CameraSceneConfig, Layer, LayerFolder } from '../camera/types.ts';
import { flattenedLayerIds, stackUnits } from './layer-stack.ts';

/**
 * Folder-aware layer selection for the Parallax workspace.
 *
 * This module reads the Arrange stack and builds selection UI on top of it. It
 * never stores a separate folder model and never writes folder ids into effect
 * data: folder selections are expanded into real layer ids before saving.
 */

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

export type TargetMode = 'single' | 'multi';
export interface PickerState { search: string; collapsed: Set<string> }
export const createPickerState = (): PickerState => ({ search: '', collapsed: new Set<string>() });

export type PickerRow =
  | { kind: 'layer'; layer: Layer }
  | { kind: 'folder'; folder: LayerFolder; layers: Layer[]; expanded: boolean };

/** Rows in Arrange order. Search keeps matching parents visible and expands them. */
export function pickerRows(cfg: CameraSceneConfig, state: PickerState): PickerRow[] {
  const query = state.search.trim().toLowerCase();
  const rows: PickerRow[] = [];
  for (const unit of stackUnits(cfg)) {
    if (unit.kind === 'layer') {
      if (!query || unit.layer.name.toLowerCase().includes(query)) rows.push({ kind: 'layer', layer: unit.layer });
      continue;
    }
    const folderMatches = !!query && unit.folder.name.toLowerCase().includes(query);
    const matching = query && !folderMatches ? unit.layers.filter(layer => layer.name.toLowerCase().includes(query)) : unit.layers;
    if (query && !folderMatches && !matching.length) continue;
    rows.push({
      kind: 'folder', folder: unit.folder,
      layers: query && !folderMatches ? matching : unit.layers,
      expanded: !!query || !state.collapsed.has(unit.folder.id),
    });
  }
  return rows;
}

/** Every layer displayed under `rows`, in Arrange order. */
export function visibleLayerIds(rows: PickerRow[]): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    if (row.kind === 'layer') ids.push(row.layer.id);
    else if (row.expanded) ids.push(...row.layers.map(layer => layer.id));
  }
  return ids;
}

/** How a folder's checkbox should read for the current selection. */
export function folderCheckState(selected: Iterable<string>, layerIds: string[]): 'checked' | 'indeterminate' | 'unchecked' {
  if (!layerIds.length) return 'unchecked';
  const chosen = new Set(selected);
  const inside = layerIds.filter(id => chosen.has(id)).length;
  return inside === 0 ? 'unchecked' : inside === layerIds.length ? 'checked' : 'indeterminate';
}

/** Known ids only, deduplicated and returned in Arrange stack order. */
export function arrangeOrderedIds(cfg: CameraSceneConfig, ids: Iterable<string>): string[] {
  const wanted = new Set(ids);
  return flattenedLayerIds(cfg).filter(id => wanted.has(id));
}

/** Foreground-most layer, matching the previous default-target behaviour. */
export function defaultTargetId(cfg: CameraSceneConfig): string {
  return cfg.layers.reduce((best, layer) => layer.depth > (best?.depth ?? -1) ? layer : best, cfg.layers[0])?.id ?? '';
}

/** Resolve the current Arrange selection into initial Parallax targets. */
export function arrangeTargets(cfg: CameraSceneConfig, arrangeSelection: string[], mode: TargetMode): string[] {
  const known = new Set(cfg.layers.map(layer => layer.id));
  const valid = [...new Set(arrangeSelection.filter(id => known.has(id)))];
  if (mode === 'multi') return arrangeOrderedIds(cfg, valid);
  // Single-target effects follow the Arrange primary selection exactly.
  return valid.length ? [valid[0]!] : (defaultTargetId(cfg) ? [defaultTargetId(cfg)] : []);
}

const stateBadges = (layer: Layer) => {
  const badges: string[] = [];
  if (layer.visible === false) badges.push('<span class="parallax-picker-badge hidden" title="Hidden in Arrange">hidden</span>');
  if (layer.locked) badges.push('<span class="parallax-picker-badge locked" title="Locked in Arrange">locked</span>');
  return badges.join('');
};

function layerRowHtml(layer: Layer, mode: TargetMode, selected: Set<string>, inFolder: boolean) {
  const checked = selected.has(layer.id);
  const input = mode === 'multi'
    ? `<input type="checkbox" name="parallax-layer" value="${escapeHtml(layer.id)}" ${checked ? 'checked' : ''}>`
    : `<input type="radio" name="parallax-layer" value="${escapeHtml(layer.id)}" ${checked ? 'checked' : ''}>`;
  return `<label class="parallax-picker-layer${inFolder ? ' in-folder' : ''}${layer.visible === false ? ' is-hidden' : ''}" data-layer-id="${escapeHtml(layer.id)}">
    ${input}<span class="parallax-picker-name" title="${escapeHtml(layer.name)}">${escapeHtml(layer.name)}</span>${stateBadges(layer)}
    <small class="parallax-picker-depth">${Math.round(layer.depth * 100)}%</small></label>`;
}

function folderRowHtml(row: Extract<PickerRow, { kind: 'folder' }>, mode: TargetMode, selected: Set<string>, memberIds: string[]) {
  const state = folderCheckState(selected, memberIds);
  const check = mode === 'multi'
    ? `<input type="checkbox" data-folder-check="${escapeHtml(row.folder.id)}" aria-label="Select all layers in ${escapeHtml(row.folder.name)}" ${state === 'checked' ? 'checked' : ''}>`
    : '';
  return `<div class="parallax-picker-folder" data-folder-id="${escapeHtml(row.folder.id)}">
    <div class="parallax-picker-folder-head${mode === 'multi' ? ' with-check' : ''}">
      ${check}
      <button type="button" class="parallax-picker-toggle" data-folder-toggle="${escapeHtml(row.folder.id)}" aria-expanded="${row.expanded}" title="${row.expanded ? 'Collapse folder' : 'Expand folder'}">${row.expanded ? '▾' : '▸'}</button>
      <span class="parallax-picker-name folder" title="${escapeHtml(row.folder.name)}">${escapeHtml(row.folder.name)}</span>
      <span class="parallax-picker-count">${row.layers.length}</span>
    </div>
    ${row.expanded ? `<div class="parallax-picker-children">${row.layers.map(layer => layerRowHtml(layer, mode, selected, true)).join('') || '<p class="parallax-picker-empty">No layers in this folder.</p>'}</div>` : ''}
  </div>`;
}

/**
 * Mount a target picker into an existing host element. Selection, search and
 * folder expansion survive re-renders; `selected()` returns Arrange-ordered ids.
 */
export function mountTargetPicker(host: HTMLElement, options: {
  cfg: CameraSceneConfig;
  mode: TargetMode;
  selected: string[];
  state: PickerState;
  fallbackId?: string;
}) {
  const { cfg, mode, state } = options;
  const selected = new Set(arrangeOrderedIds(cfg, options.selected));
  const fallback = options.fallbackId ?? defaultTargetId(cfg);
  if (mode === 'single') {
    const first = [...selected][0] ?? fallback;
    selected.clear();
    if (first) selected.add(first);
  }

  host.classList.add('parallax-picker');
  host.dataset.mode = mode;
  host.innerHTML = `<div class="parallax-picker-head">
      <span class="parallax-picker-label">${mode === 'multi' ? 'Target layers' : 'Target layer'}</span>
      <span class="parallax-picker-total" data-picker-total></span>
    </div>
    <label class="parallax-picker-search">
      <span class="search-glyph" aria-hidden="true">⌕</span>
      <input type="search" data-picker-search value="${escapeHtml(state.search)}" placeholder="Search layers and folders" aria-label="Search target layers and folders">
    </label>
    <div class="parallax-picker-tools">
      <button type="button" data-picker-all>Select all</button>
      <button type="button" data-picker-clear>Clear</button>
    </div>
    <div class="parallax-picker-tree" data-picker-tree role="group" aria-label="Target layers"></div>
    <p class="parallax-picker-summary" data-picker-summary></p>`;

  const tree = host.querySelector<HTMLElement>('[data-picker-tree]')!;
  const total = host.querySelector<HTMLElement>('[data-picker-total]')!;
  const summary = host.querySelector<HTMLElement>('[data-picker-summary]')!;
  const searchField = host.querySelector<HTMLInputElement>('[data-picker-search]')!;

  const currentRows = () => pickerRows(cfg, state);
  const memberIds = (folderId: string) => cfg.layers.filter(layer => layer.folderId === folderId).map(layer => layer.id);
  const nameOf = (id: string) => cfg.layers.find(layer => layer.id === id)?.name ?? 'Missing layer';

  function syncFolderChecks() {
    for (const box of tree.querySelectorAll<HTMLInputElement>('[data-folder-check]')) {
      const ids = memberIds(box.dataset.folderCheck!);
      const state = folderCheckState(selected, ids);
      box.checked = state === 'checked';
      box.indeterminate = state === 'indeterminate';
    }
  }

  function paintChrome() {
    const ordered = arrangeOrderedIds(cfg, selected);
    total.textContent = mode === 'multi' ? `${ordered.length} selected` : (ordered.length ? '1 selected' : 'none');
    summary.textContent = ordered.length ? ordered.map(nameOf).join(' · ') : 'No layer selected.';
    summary.title = summary.textContent;
  }

  function bindRows() {
    tree.querySelectorAll<HTMLInputElement>('input[name=parallax-layer]').forEach(input => {
      input.onchange = () => {
        if (mode === 'multi') {
          if (input.checked) selected.add(input.value); else selected.delete(input.value);
        } else if (input.checked) {
          selected.clear(); selected.add(input.value);
        }
        syncFolderChecks();
        paintChrome();
      };
    });
    tree.querySelectorAll<HTMLInputElement>('[data-folder-check]').forEach(box => {
      box.onchange = () => {
        const ids = memberIds(box.dataset.folderCheck!);
        if (box.checked) ids.forEach(id => selected.add(id));
        else ids.forEach(id => selected.delete(id));
        tree.querySelectorAll<HTMLInputElement>('input[name=parallax-layer]').forEach(input => {
          if (!ids.includes(input.value)) return;
          input.checked = box.checked;
          if (mode === 'single' && box.checked) { selected.clear(); selected.add(input.value); }
        });
        syncFolderChecks();
        paintChrome();
      };
    });
    tree.querySelectorAll<HTMLButtonElement>('[data-folder-toggle]').forEach(button => {
      button.onclick = () => {
        const id = button.dataset.folderToggle!;
        if (state.collapsed.has(id)) state.collapsed.delete(id); else state.collapsed.add(id);
        renderTree();
      };
    });
  }

  function renderTree() {
    const rows = currentRows();
    tree.innerHTML = rows.length
      ? rows.map(row => row.kind === 'layer' ? layerRowHtml(row.layer, mode, selected, false) : folderRowHtml(row, mode, selected, memberIds(row.folder.id))).join('')
      : '<p class="parallax-picker-empty">No layers match this search.</p>';
    bindRows();
    syncFolderChecks();
    paintChrome();
  }

  searchField.oninput = () => { state.search = searchField.value; renderTree(); };

  host.querySelector<HTMLButtonElement>('[data-picker-all]')!.onclick = () => {
    const ids = visibleLayerIds(currentRows());
    if (mode === 'multi') ids.forEach(id => selected.add(id));
    else if (ids.length) { selected.clear(); selected.add(ids[0]!); }
    renderTree();
  };
  host.querySelector<HTMLButtonElement>('[data-picker-clear]')!.onclick = () => { selected.clear(); renderTree(); };

  renderTree();

  return {
    selected: (): string[] => arrangeOrderedIds(cfg, selected),
    element: host,
  };
}

/** Folder-aware grouping helper used by depth influence and plane assignment lists. */
export interface LayerGroup { folder: LayerFolder | null; layers: Layer[] }

export function folderGroups(cfg: CameraSceneConfig): LayerGroup[] {
  return stackUnits(cfg).map(unit => unit.kind === 'folder'
    ? { folder: unit.folder, layers: unit.layers }
    : { folder: null, layers: [unit.layer] });
}
