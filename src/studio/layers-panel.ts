import type { CameraSceneConfig, Layer, LayerFolder } from '../camera/types.ts';

/**
 * Arrange-tab layer stack.
 *
 * Draw order is the flat layer array after `order` sorting, front to back by
 * descending order. Folders are organisation only: they occupy a slot in the
 * same order space and their children are packed just below that slot, so a
 * folder always moves as one contiguous block.
 */

type FolderUnit = { kind: 'folder'; folder: LayerFolder; layers: Layer[] };
type LayerUnit = { kind: 'layer'; layer: Layer };
type StackUnit = FolderUnit | LayerUnit;
type DropWhere = 'before' | 'after' | 'inside' | 'tail' | 'noop';
interface DropTarget { where: DropWhere; row?: HTMLElement }

/** Reserved numeric gap between two stack units; children live inside it. */
const SPACING = 1000;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const foldersOf = (cfg: CameraSceneConfig) => cfg.folders ?? [];

/** Units in display order: index 0 is the front-most row. */
export function stackUnits(cfg: CameraSceneConfig): StackUnit[] {
  const folders = foldersOf(cfg);
  const known = new Set(folders.map(folder => folder.id));
  const rows: { sort: number; unit: StackUnit }[] = folders.map(folder => ({
    sort: folder.order ?? 0,
    unit: { kind: 'folder', folder, layers: cfg.layers.filter(layer => layer.folderId === folder.id).sort((a, b) => (b.order ?? 0) - (a.order ?? 0)) },
  }));
  for (const layer of cfg.layers) {
    if (!layer.folderId || !known.has(layer.folderId)) rows.push({ sort: layer.order ?? 0, unit: { kind: 'layer', layer } });
  }
  rows.sort((a, b) => b.sort - a.sort);
  return rows.map(row => row.unit);
}

/** Rewrite order/folderId so the given unit sequence becomes the real stack. */
export function reindexStack(cfg: CameraSceneConfig, units: StackUnit[]) {
  units.forEach((unit, index) => {
    const base = (units.length - index) * SPACING;
    if (unit.kind === 'folder') {
      unit.folder.order = base;
      unit.layers.forEach((layer, child) => {
        layer.folderId = unit.folder.id;
        layer.order = base - child - 1;
      });
    } else {
      unit.layer.order = base;
      delete unit.layer.folderId;
    }
  });
}

function locate(units: StackUnit[], id: string): { unitIndex: number; childIndex?: number } | null {
  for (let index = 0; index < units.length; index++) {
    const unit = units[index]!;
    if (unit.kind === 'folder') {
      if (unit.folder.id === id) return { unitIndex: index };
      const childIndex = unit.layers.findIndex(layer => layer.id === id);
      if (childIndex >= 0) return { unitIndex: index, childIndex };
    } else if (unit.layer.id === id) {
      return { unitIndex: index };
    }
  }
  return null;
}

export function createLayersPanel(options: {
  getScene: () => CameraSceneConfig;
  /** Persist a scene edit and repaint. Validation happens in the caller. */
  commit: (next: CameraSceneConfig) => Promise<void>;
  notify: (message: string) => void;
  newId: () => string;
}) {
  const list = document.getElementById('layer-list') as HTMLElement;
  let dragUnit = '';

  const selectedId = () => list.dataset.selected ?? '';
  const commit = (cfg: CameraSceneConfig, message?: string) => {
    void (async () => {
      try { await options.commit(cfg); }
      catch (error) { options.notify(`${message ?? 'Reorder'}: ${String(error)}`); render(); }
    })();
  };

  function selectedLayer(cfg: CameraSceneConfig) {
    return cfg.layers.find(layer => layer.id === selectedId());
  }

  function applyStack(cfg: CameraSceneConfig, units: StackUnit[], message: string) {
    reindexStack(cfg, units);
    commit(cfg, message);
  }

  function layerRow(layer: Layer, inFolder: boolean, selected: string) {
    const row = document.createElement('div');
    row.className = 'layer-row' + (inFolder ? ' in-folder' : '') + (layer.id === selected ? ' selected' : '');
    row.dataset.drag = `layer:${layer.id}`;
    row.draggable = true;
    row.innerHTML = `<input type="checkbox" ${layer.visible === false ? '' : 'checked'} aria-label="Show layer"><span class="thumb"></span><button class="layer-name" title="Double-click to rename">${escapeHtml(layer.name)}</button><button class="delete-layer" title="Delete layer" aria-label="Delete layer">×</button>`;
    row.querySelector<HTMLElement>('.thumb')!.style.backgroundImage = `url(${JSON.stringify(layer.asset)})`;
    return row;
  }

  function folderGroup(unit: FolderUnit, selected: string) {
    const group = document.createElement('div');
    group.className = 'folder-group' + (unit.folder.collapsed ? ' collapsed' : '');
    group.dataset.folderGroup = unit.folder.id;
    const head = document.createElement('div');
    head.className = 'layer-row folder-row';
    head.dataset.drag = `folder:${unit.folder.id}`;
    head.draggable = true;
    head.innerHTML = `<button class="folder-toggle" data-folder-toggle title="${unit.folder.collapsed ? 'Expand folder' : 'Collapse folder'}" aria-label="${unit.folder.collapsed ? 'Expand folder' : 'Collapse folder'}">${unit.folder.collapsed ? '▸' : '▾'}</button><span class="folder-glyph" aria-hidden="true">▤</span><button class="layer-name folder-name" title="Double-click to rename">${escapeHtml(unit.folder.name)}</button><span class="folder-count">${unit.layers.length}</span><button class="delete-folder" title="Delete folder, keep layers" aria-label="Delete folder">×</button>`;
    group.append(head);
    if (!unit.folder.collapsed) {
      const children = document.createElement('div');
      children.className = 'folder-children';
      children.dataset.folder = unit.folder.id;
      for (const layer of unit.layers) children.append(layerRow(layer, true, selected));
      if (!unit.layers.length) children.innerHTML = '<p class="folder-empty">Drop layers here</p>';
      group.append(children);
    }
    return group;
  }

  function render() {
    const cfg = options.getScene();
    let selected = selectedId() || cfg.layers[0]?.id || '';
    if (!cfg.layers.some(layer => layer.id === selected)) selected = cfg.layers[0]?.id ?? '';
    list.dataset.selected = selected;

    list.innerHTML = '';
    const units = stackUnits(cfg);
    if (!units.length) {
      list.innerHTML = '<p class="folder-empty">No layers yet. Import artwork to begin.</p>';
      return;
    }
    for (const unit of units) {
      list.append(unit.kind === 'folder' ? folderGroup(unit, selected) : layerRow(unit.layer, false, selected));
    }
    const tail = document.createElement('div');
    tail.className = 'layer-tail';
    tail.dataset.dropTail = 'true';
    tail.textContent = 'Drop here to move out of a folder';
    list.append(tail);
  }

  // ---- selection, visibility, rename, delete ---------------------------------

  list.onclick = event => {
    const target = event.target as HTMLElement;
    const cfg = options.getScene();

    const toggle = target.closest<HTMLElement>('[data-folder-toggle]');
    if (toggle) {
      const id = toggle.closest<HTMLElement>('.folder-group')?.dataset.folderGroup ?? '';
      const folder = foldersOf(cfg).find(candidate => candidate.id === id);
      if (!folder) return;
      folder.collapsed = !folder.collapsed;
      render();
      commit(cfg);
      return;
    }

    const row = target.closest<HTMLElement>('.layer-row');
    if (!row) return;
    const kind = row.dataset.drag?.split(':')[0] ?? '';
    const id = row.dataset.drag?.split(':')[1] ?? '';

    if (target.classList.contains('delete-layer')) {
      const layer = cfg.layers.find(candidate => candidate.id === id);
      if (!layer) return;
      if (!confirm(`Delete layer “${layer.name}” and its animation tracks?`)) return;
      cfg.layers = cfg.layers.filter(candidate => candidate.id !== layer.id);
      cfg.tracks = cfg.tracks.filter(track => track.target !== `layer:${layer.id}`);
      cfg.animationTracks = cfg.animationTracks?.filter(track => track.target !== `layer:${layer.id}`);
      cfg.layerEffects = (cfg.layerEffects ?? []).map(effect => ({ ...effect, layerIds: effect.layerIds.filter(layerId => layerId !== layer.id) })).filter(effect => effect.layerIds.length);
      cfg.atmosphere = (cfg.atmosphere ?? []).map(effect => ({ ...effect, layerIds: (effect.layerIds ?? []).filter(layerId => layerId !== layer.id), textureLayerId: effect.textureLayerId === layer.id ? undefined : effect.textureLayerId })).filter(effect => effect.target !== 'layers' || (effect.layerIds ?? []).length);
      if (cfg.parallax) cfg.parallax.influence = Object.fromEntries(Object.entries(cfg.parallax.influence).filter(([layerId]) => layerId !== layer.id));
      if (cfg.depthScale) cfg.depthScale.influence = Object.fromEntries(Object.entries(cfg.depthScale.influence).filter(([layerId]) => layerId !== layer.id));
      if (cfg.depthPlanes) cfg.depthPlanes = cfg.depthPlanes.map(plane => ({ ...plane, layerIds: plane.layerIds.filter(layerId => layerId !== layer.id) }));
      list.dataset.selected = '';
      commit(cfg, 'Delete layer');
      return;
    }

    if (target.classList.contains('delete-folder')) {
      const folder = foldersOf(cfg).find(candidate => candidate.id === id);
      if (!folder) return;
      if (!confirm(`Delete folder “${folder.name}”? Its layers remain in the scene.`)) return;
      const units = stackUnits(cfg);
      const index = units.findIndex(unit => unit.kind === 'folder' && unit.folder.id === folder.id);
      if (index >= 0) {
        const unit = units[index] as FolderUnit;
        units.splice(index, 1, ...unit.layers.map(layer => ({ kind: 'layer' as const, layer })));
      }
      cfg.folders = foldersOf(cfg).filter(candidate => candidate.id !== folder.id);
      applyStack(cfg, units, 'Delete folder');
      return;
    }

    if (target.tagName === 'INPUT') return;
    // A folder row does not select a layer: use the chevron to collapse it and
    // double-click the name to rename, so the two gestures never collide.
    if (kind === 'folder') return;
    list.dataset.selected = id;
    render();
    document.dispatchEvent(new CustomEvent('layers:selection'));
  };

  list.onchange = event => {
    const input = event.target as HTMLInputElement;
    if (input.type !== 'checkbox') return;
    const row = input.closest<HTMLElement>('.layer-row');
    const id = row?.dataset.drag?.split(':')[1] ?? '';
    const cfg = options.getScene();
    const layer = cfg.layers.find(candidate => candidate.id === id);
    if (!layer) return;
    layer.visible = input.checked;
    commit(cfg, 'Layer visibility');
  };

  list.ondblclick = event => {
    const target = event.target as HTMLElement;
    const nameButton = target.closest<HTMLElement>('.layer-name');
    if (!nameButton) return;
    const row = nameButton.closest<HTMLElement>('.layer-row');
    const kind = row?.dataset.drag?.split(':')[0] ?? '';
    const id = row?.dataset.drag?.split(':')[1] ?? '';
    const cfg = options.getScene();
    if (kind === 'folder') {
      const folder = foldersOf(cfg).find(candidate => candidate.id === id);
      if (!folder) return;
      const name = prompt('Folder name', folder.name);
      if (name === null) return;
      folder.name = name.trim().slice(0, 120) || folder.name;
      render();
      commit(cfg);
      return;
    }
    const layer = cfg.layers.find(candidate => candidate.id === id);
    if (!layer) return;
    const name = prompt('Layer name', layer.name);
    if (name === null || !name.trim()) return;
    layer.name = name.trim();
    render();
    commit(cfg);
  };

  // ---- drag to restack --------------------------------------------------------

  function clearDropMarks() {
    for (const element of list.querySelectorAll('.drop-before, .drop-after, .drop-into')) {
      element.classList.remove('drop-before', 'drop-after', 'drop-into');
    }
  }

  function dropTarget(event: DragEvent): DropTarget {
    const target = event.target as HTMLElement;
    if (target.closest('.layer-tail')) return { where: 'tail' };
    const row = target.closest<HTMLElement>('.layer-row');
    if (row) {
      if (row.dataset.drag === dragUnit) return { where: 'noop' };
      const draggedFolderId = dragUnit.startsWith('folder:') ? dragUnit.slice(7) : '';
      const group = row.closest<HTMLElement>('.folder-group');
      if (draggedFolderId && group?.dataset.folderGroup === draggedFolderId) return { where: 'noop' };
      const rect = row.getBoundingClientRect();
      const fraction = (event.clientY - rect.top) / Math.max(1, rect.height);
      if (row.classList.contains('folder-row')) {
        if (!draggedFolderId && fraction > 0.3 && fraction < 0.7) return { where: 'inside', row };
        return { where: fraction < 0.5 ? 'before' : 'after', row };
      }
      return { where: fraction < 0.5 ? 'before' : 'after', row };
    }
    const children = target.closest<HTMLElement>('.folder-children');
    if (children) {
      const head = children.closest<HTMLElement>('.folder-group')?.querySelector<HTMLElement>('.folder-row') ?? undefined;
      if (head) return { where: dragUnit.startsWith('folder:') ? 'after' : 'inside', row: head };
    }
    return { where: 'tail' };
  }

  function moveUnit(unitId: string, destination: DropTarget) {
    if (destination.where === 'noop') return;
    const cfg = options.getScene();
    let units = stackUnits(cfg);
    let dragged = units.find(unit => (unit.kind === 'folder' ? unit.folder.id : unit.layer.id) === unitId);
    if (!dragged) {
      // A layer inside a folder is not a unit of its own; lift it out for the move.
      const layer = cfg.layers.find(candidate => candidate.id === unitId);
      if (!layer) return;
      dragged = { kind: 'layer', layer };
    }
    units = units.filter(unit => unit !== dragged);
    if (dragged.kind === 'layer') {
      const layerId = dragged.layer.id;
      for (const unit of units) if (unit.kind === 'folder') unit.layers = unit.layers.filter(layer => layer.id !== layerId);
    }

    const targetId = destination.row?.dataset.drag?.split(':')[1] ?? '';
    const location = targetId ? locate(units, targetId) : null;
    if (destination.where === 'tail' || !location) {
      units.push(dragged);
    } else if (location.childIndex !== undefined) {
      if (dragged.kind === 'folder') units.splice(destination.where === 'after' ? location.unitIndex + 1 : location.unitIndex, 0, dragged);
      else (units[location.unitIndex] as FolderUnit).layers.splice(destination.where === 'after' ? location.childIndex + 1 : location.childIndex, 0, dragged.layer);
    } else {
      const unit = units[location.unitIndex]!;
      if (destination.where === 'inside' && unit.kind === 'folder' && dragged.kind === 'layer') unit.layers.unshift(dragged.layer);
      else units.splice(destination.where === 'after' ? location.unitIndex + 1 : location.unitIndex, 0, dragged);
    }
    applyStack(cfg, units, 'Reorder');
  }

  list.ondragstart = event => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('.layer-row');
    if (!row?.dataset.drag) { event.preventDefault(); return; }
    dragUnit = row.dataset.drag;
    row.classList.add('dragging');
    document.body.classList.add('dragging-layers');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', dragUnit);
    }
  };

  list.ondragover = event => {
    if (!dragUnit) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    clearDropMarks();
    const destination = dropTarget(event);
    if (destination.where === 'noop' || destination.where === 'tail') return;
    const row = destination.row;
    if (!row) return;
    row.classList.add(destination.where === 'inside' ? 'drop-into' : destination.where === 'before' ? 'drop-before' : 'drop-after');
  };

  list.ondragleave = event => {
    if (!list.contains(event.relatedTarget as Node | null)) clearDropMarks();
  };

  list.ondrop = event => {
    if (!dragUnit) return;
    event.preventDefault();
    const destination = dropTarget(event);
    clearDropMarks();
    const unitId = dragUnit.split(':')[1] ?? '';
    dragUnit = '';
    document.body.classList.remove('dragging-layers');
    for (const element of list.querySelectorAll('.dragging')) element.classList.remove('dragging');
    moveUnit(unitId, destination);
  };

  list.ondragend = () => {
    dragUnit = '';
    clearDropMarks();
    document.body.classList.remove('dragging-layers');
    for (const element of list.querySelectorAll('.dragging')) element.classList.remove('dragging');
  };

  // ---- folder creation -------------------------------------------------------

  function addFolder() {
    const cfg = options.getScene();
    const folder: LayerFolder = { id: options.newId(), name: `Folder ${foldersOf(cfg).length + 1}`, order: 0, collapsed: false };
    cfg.folders = [...foldersOf(cfg), folder];
    const units = stackUnits(cfg);
    const unit = units.find(candidate => candidate.kind === 'folder' && candidate.folder.id === folder.id);
    if (unit) {
      const rest = units.filter(candidate => candidate !== unit);
      const location = selectedLayer(cfg) ? locate(rest, selectedId()) : null;
      rest.splice(location ? location.unitIndex : 0, 0, unit);
      reindexStack(cfg, rest);
    }
    commit(cfg, 'Add folder');
  }

  return { render, addFolder };
}
