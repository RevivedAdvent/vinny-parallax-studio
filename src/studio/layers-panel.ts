import type { CameraSceneConfig, Layer, LayerFolder } from '../camera/types.ts';
import { type LayerCommands } from './layer-commands.ts';
import { icons } from './icons.ts';
import { showMenu, type MenuItem } from './menu.ts';
import { flattenedLayerIds, foldersOf, locate, reindexStack, stackUnits, type FolderUnit } from './layer-stack.ts';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

/**
 * Layer hierarchy for the Arrange tab.
 *
 * The panel is the source of truth for multi-selection; it keeps `#layer-list`
 * `data-selected` in sync with the primary layer so existing studio code that
 * reads it keeps working. All mutations go through `commands` (a validated
 * working copy of the shared scene), never a private copy.
 */
export function createLayersPanel(options: {
  getScene: () => CameraSceneConfig;
  commands: LayerCommands;
  /** Shared scene commit: validate, render, persist, repaint. */
  commit: (next: CameraSceneConfig, message: string) => Promise<void>;
  notify: (message: string) => void;
  newId: () => string;
  onSelectionChange: (ids: string[]) => void;
}) {
  const list = document.getElementById('layer-list') as HTMLElement;
  const commitScene = options.commit;
  let selection: string[] = [];
  let anchorId = '';
  let filter = '';
  let dragUnit = '';
  const searchThreshold = 6;

  const primary = () => selection[0] ?? '';

  /** Cheap selection highlight; avoids rebuilding rows on ctrl/shift clicks. */
  function paintSelection() {
    const ids = new Set(selection);
    for (const row of list.querySelectorAll<HTMLElement>('.layer-row')) {
      const kind = row.dataset.drag?.split(':')[0] ?? '';
      const id = row.dataset.drag?.split(':')[1] ?? '';
      const on = kind === 'layer' && ids.has(id);
      row.classList.toggle('selected', on);
      if (kind === 'layer') row.setAttribute('aria-selected', String(on));
    }
  }

  function setSelection(ids: string[], optionsOverride: { anchor?: string } = {}) {
    selection = [...ids];
    anchorId = optionsOverride.anchor ?? (ids.length ? ids[0]! : '');
    if (ids.length) list.dataset.selected = ids[0]!;
    else delete list.dataset.selected;
    paintSelection();
    document.dispatchEvent(new CustomEvent('layers:selection', { detail: { ids: [...ids] } }));
    options.onSelectionChange([...ids]);
  }

  // ---- rendering --------------------------------------------------------------

  function layerRow(layer: Layer, inFolder: boolean, selectedIds: Set<string>, filtered: boolean) {
    const row = document.createElement('div');
    const selected = selectedIds.has(layer.id);
    row.className = 'layer-row' + (inFolder ? ' in-folder' : '') + (selected ? ' selected' : '') + (layer.locked ? ' locked' : '') + (layer.visible === false ? ' hidden-layer' : '') + (filtered ? ' filtered' : '');
    row.dataset.drag = `layer:${layer.id}`;
    row.setAttribute('role', 'treeitem');
    row.setAttribute('aria-selected', String(selected));
    row.setAttribute('aria-label', `${layer.name}${layer.locked ? ', locked' : ''}${layer.visible === false ? ', hidden' : ''}`);
    row.draggable = !filter;
    row.innerHTML = `
      <span class="drag-handle" aria-hidden="true">${icons.grip}</span>
      <label class="eye-toggle" title="${layer.visible === false ? 'Show layer' : 'Hide layer'}">
        <input type="checkbox" aria-label="Show layer" ${layer.visible === false ? '' : 'checked'}>
        <span class="eye-on">${icons.eye}</span>
        <span class="eye-off">${icons.eyeOff}</span>
      </label>
      <span class="thumb"></span>
      <button class="layer-name" title="${escapeHtml(layer.name)} — double-click to rename">${escapeHtml(layer.name)}</button>
      <span class="layer-row-actions">
        <button class="lock-toggle" aria-pressed="${layer.locked ? 'true' : 'false'}" title="${layer.locked ? 'Unlock layer' : 'Lock layer'}" aria-label="${layer.locked ? 'Unlock layer' : 'Lock layer'}">${layer.locked ? icons.lock : icons.unlock}</button>
        <button class="delete-layer" title="Delete layer" aria-label="Delete layer">${icons.trash}</button>
        <button class="layer-menu" title="Layer actions" aria-label="Layer actions" aria-haspopup="menu">${icons.more}</button>
      </span>`;
    row.querySelector<HTMLElement>('.thumb')!.style.backgroundImage = `url(${JSON.stringify(layer.asset)})`;
    return row;
  }

  function folderGroup(unit: FolderUnit, selectedIds: Set<string>, filtered: boolean) {
    const group = document.createElement('div');
    group.className = 'folder-group' + (unit.folder.collapsed ? ' collapsed' : '');
    group.dataset.folderGroup = unit.folder.id;
    const children = unit.layers.filter(layer => !filter || layer.name.toLowerCase().includes(filter));
    const head = document.createElement('div');
    head.className = 'layer-row folder-row';
    head.dataset.drag = `folder:${unit.folder.id}`;
    head.draggable = !filter;
    head.setAttribute('role', 'treeitem');
    head.setAttribute('aria-expanded', String(!unit.folder.collapsed));
    head.setAttribute('aria-label', `Folder ${unit.folder.name}, ${unit.layers.length} ${unit.layers.length === 1 ? 'layer' : 'layers'}`);
    head.innerHTML = `
      <span class="drag-handle" aria-hidden="true">${icons.grip}</span>
      <button class="folder-toggle" data-folder-toggle title="${unit.folder.collapsed ? 'Expand folder' : 'Collapse folder'}" aria-label="${unit.folder.collapsed ? 'Expand folder' : 'Collapse folder'}">${unit.folder.collapsed ? icons.chevronRight : icons.chevron}</button>
      <span class="folder-glyph" aria-hidden="true">${icons.folder}</span>
      <button class="layer-name folder-name" title="Double-click to rename">${escapeHtml(unit.folder.name)}</button>
      <span class="folder-count">${children.length}</span>
      <button class="folder-menu" title="Folder actions" aria-label="Folder actions" aria-haspopup="menu">${icons.more}</button>`;
    group.append(head);
    if (!unit.folder.collapsed) {
      const hostChildren = document.createElement('div');
      hostChildren.className = 'folder-children';
      hostChildren.dataset.folder = unit.folder.id;
      hostChildren.setAttribute('role', 'group');
      for (const layer of unit.layers) {
        const match = !filter || layer.name.toLowerCase().includes(filter);
        hostChildren.append(layerRow(layer, true, selectedIds, !match));
      }
      if (!children.length) hostChildren.innerHTML = filter ? '<p class="folder-empty">No matching layers</p>' : '<p class="folder-empty">Drop layers here</p>';
      group.append(hostChildren);
    }
    return group;
  }

  function render() {
    const cfg = options.getScene();
    // Adopt an externally-set primary (main.ts sets data-selected on import/new-project).
    const external = list.dataset.selected ?? '';
    if (external && !selection.includes(external)) selection = [external];
    else if (!external && selection.length) selection = [];
    const selectedIds = new Set(selection);
    const search = (filter.trim() || '').toLowerCase();

    list.innerHTML = '';
    const units = stackUnits(cfg);
    if (!units.length) {
      list.innerHTML = `<div class="layer-empty-state">${icons.image}<b>No layers yet</b><span>Import artwork to begin arranging your scene.</span><button id="empty-import" type="button" class="primary-action">Import artwork</button></div>`;
      const importButton = list.querySelector<HTMLButtonElement>('#empty-import');
      if (importButton) importButton.onclick = () => document.getElementById('import')?.click();
      return;
    }
    for (const unit of units) {
      if (unit.kind === 'folder') list.append(folderGroup(unit, selectedIds, !!search));
      else {
        const match = !search || unit.layer.name.toLowerCase().includes(search);
        list.append(layerRow(unit.layer, false, selectedIds, !match));
      }
    }
    const tail = document.createElement('div');
    tail.className = 'layer-tail';
    tail.dataset.dropTail = 'true';
    tail.textContent = 'Drop here to move out of a folder';
    list.append(tail);
  }

  function renderMeta() {
    const cfg = options.getScene();
    const meta = document.getElementById('layer-meta');
    if (meta) {
      const folders = foldersOf(cfg).length;
      const parts = [`${cfg.layers.length} ${cfg.layers.length === 1 ? 'layer' : 'layers'}`];
      if (folders) parts.push(`${folders} ${folders === 1 ? 'folder' : 'folders'}`);
      meta.textContent = parts.join(' · ');
    }
    const searchRow = document.getElementById('layer-search-wrap');
    if (searchRow) searchRow.hidden = cfg.layers.length <= searchThreshold;
  }

  function renderAll() {
    renderMeta();
    render();
  }

  // ---- selection --------------------------------------------------------------

  function selectLayer(id: string, additive: boolean, range: boolean) {
    const cfg = options.getScene();
    if (range && anchorId) {
      const order = flattenedLayerIds(cfg);
      const start = order.indexOf(anchorId), end = order.indexOf(id);
      if (start >= 0 && end >= 0) {
        const ids = order.slice(Math.min(start, end), Math.max(start, end) + 1);
        setSelection(ids, { anchor: anchorId });
        return;
      }
    }
    if (additive) {
      const ids = selection.includes(id) ? selection.filter(candidate => candidate !== id) : [...selection, id];
      setSelection(ids.length ? (ids.includes(anchorId) ? [anchorId, ...ids.filter(candidate => candidate !== anchorId)] : ids) : [], { anchor: anchorId || id });
      return;
    }
    setSelection([id], { anchor: id });
  }

  // ---- context menus ----------------------------------------------------------

  function layerMenuItems(layer: Layer, ids: string[]): MenuItem[] {
    const cfg = options.getScene();
    const folders = foldersOf(cfg);
    const inFolder = !!layer.folderId && folders.some(folder => folder.id === layer.folderId);
    const folderItems: MenuItem[] = folders.map(folder => ({
      label: folder.name,
      run: () => { void options.commands.moveToFolder(layer.id, folder.id); },
    }));
    return [
      { label: 'Rename', icon: 'pointer', run: () => promptRename(layer) },
      { label: 'Duplicate', icon: 'copy', run: () => void options.commands.duplicate(ids) },
      { label: 'Delete', icon: 'trash', danger: true, run: () => void options.commands.remove(ids) },
      { divider: true },
      { label: layer.locked ? 'Unlock' : 'Lock', icon: layer.locked ? 'unlock' : 'lock', run: () => void options.commands.setLocked(ids, !layer.locked) },
      { label: 'Bring to front', icon: 'front', run: () => void options.commands.bringToFront(ids) },
      { label: 'Send to back', icon: 'back', run: () => void options.commands.sendToBack(ids) },
      { label: 'Move to folder', icon: 'folder', children: folderItems.length ? folderItems : [{ label: 'No folders yet', disabled: true, run: () => {} }] },
      ...(inFolder ? [{ label: 'Remove from folder', icon: 'folder' as const, run: () => { void options.commands.moveToFolder(layer.id, null); } }] : []),
      { divider: true },
      { label: 'Fit to canvas', icon: 'frame', run: () => void options.commands.fitToCanvas(layer.id) },
      { label: 'Centre in canvas', icon: 'centre', run: () => void options.commands.alignCentre(ids, 'both') },
      { label: 'Reset transform', icon: 'reset', run: () => void options.commands.resetTransform(ids) },
    ];
  }

  function folderMenuItems(folder: LayerFolder): MenuItem[] {
    const cfg = options.getScene();
    const ids = cfg.layers.filter(layer => layer.folderId === folder.id).map(layer => layer.id);
    return [
      { label: 'Rename folder', icon: 'pointer', run: () => promptRenameFolder(folder) },
      { label: ids.length ? `Select ${ids.length} ${ids.length === 1 ? 'layer' : 'layers'}` : 'Select layers in folder', icon: 'pointer', disabled: !ids.length, run: () => setSelection(ids) },
      { divider: true },
      { label: 'Delete folder (keep layers)', icon: 'trash', danger: true, run: () => void deleteFolder(folder) },
    ];
  }

  function promptRename(layer: Layer) {
    const name = prompt('Layer name', layer.name);
    if (name === null) return;
    void options.commands.rename(layer.id, name).then(renderAll);
  }
  function promptRenameFolder(folder: LayerFolder) {
    const name = prompt('Folder name', folder.name);
    if (name === null) return;
    const cfg = options.getScene();
    const next = structuredClone(cfg);
    const target = next.folders?.find(candidate => candidate.id === folder.id);
    if (!target) return;
    const trimmed = name.trim();
    target.name = (trimmed || target.name).slice(0, 120);
    void commitScene(next, 'Rename folder');
  }

  async function deleteFolder(folder: LayerFolder) {
    if (!confirm(`Delete folder “${folder.name}”? Its layers remain in the scene.`)) return;
    const cfg = options.getScene();
    const next = structuredClone(cfg);
    const units = stackUnits(next);
    const index = units.findIndex(unit => unit.kind === 'folder' && unit.folder.id === folder.id);
    if (index >= 0) {
      const unit = units[index] as FolderUnit;
      units.splice(index, 1, ...unit.layers.map(layer => ({ kind: 'layer' as const, layer })));
    }
    next.folders = foldersOf(next).filter(candidate => candidate.id !== folder.id);
    reindexStack(next, units);
    await commitScene(next, 'Delete folder');
  }

  // ---- event delegation -------------------------------------------------------

  list.onclick = event => {
    const target = event.target as HTMLElement;
    const cfg = options.getScene();
    const toggle = target.closest<HTMLElement>('[data-folder-toggle]');
    if (toggle) {
      const id = toggle.closest<HTMLElement>('.folder-group')?.dataset.folderGroup ?? '';
      const folder = foldersOf(cfg).find(candidate => candidate.id === id);
      if (!folder) return;
      const next = structuredClone(cfg);
      const targetFolder = next.folders?.find(candidate => candidate.id === id);
      if (targetFolder) { targetFolder.collapsed = !targetFolder.collapsed; void commitScene(next, 'Toggle folder'); }
      return;
    }

    const row = target.closest<HTMLElement>('.layer-row');
    if (!row) return;
    const kind = row.dataset.drag?.split(':')[0] ?? '';
    const id = row.dataset.drag?.split(':')[1] ?? '';

    if (target.closest('.layer-menu')) { showMenu(row, layerMenuItems(cfg.layers.find(layer => layer.id === id)!, [id])); return; }
    if (target.closest('.folder-menu')) { const folder = foldersOf(cfg).find(candidate => candidate.id === id); if (folder) showMenu(row, folderMenuItems(folder)); return; }
    if (target.closest('.delete-layer')) {
      const layer = cfg.layers.find(candidate => candidate.id === id);
      if (layer) void options.commands.remove([id]);
      return;
    }
    if (target.closest('.lock-toggle')) {
      const layer = cfg.layers.find(candidate => candidate.id === id);
      if (layer) void options.commands.toggleLocked(id);
      return;
    }
    if (target.closest('.eye-toggle')) return; // visibility is handled by the change event
    if (kind === 'folder') return; // chevron handles collapse; row is otherwise inert
    selectLayer(id, event.ctrlKey || event.metaKey, event.shiftKey);
  };

  list.onchange = event => {
    const input = event.target as HTMLInputElement;
    if (input.type !== 'checkbox') return;
    const row = input.closest<HTMLElement>('.layer-row');
    const id = row?.dataset.drag?.split(':')[1] ?? '';
    if (!id) return;
    void options.commands.setVisible([id], input.checked);
  };

  list.oncontextmenu = event => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('.layer-row');
    if (!row) return;
    event.preventDefault();
    const kind = row.dataset.drag?.split(':')[0] ?? '';
    const id = row.dataset.drag?.split(':')[1] ?? '';
    const cfg = options.getScene();
    if (kind === 'folder') {
      const folder = foldersOf(cfg).find(candidate => candidate.id === id);
      if (folder) showMenu({ x: event.clientX, y: event.clientY }, folderMenuItems(folder));
      return;
    }
    const layer = cfg.layers.find(candidate => candidate.id === id);
    if (!layer) return;
    // Right-click adopts the layer into the selection when it is not selected yet.
    if (!selection.includes(id)) selectLayer(id, event.ctrlKey || event.metaKey, event.shiftKey);
    showMenu({ x: event.clientX, y: event.clientY }, layerMenuItems(layer, selection.length ? selection : [id]));
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
      if (folder) promptRenameFolder(folder);
      return;
    }
    const layer = cfg.layers.find(candidate => candidate.id === id);
    if (layer) promptRename(layer);
  };

  // ---- drag to restack --------------------------------------------------------

  function clearDropMarks() {
    for (const element of list.querySelectorAll('.drop-before, .drop-after, .drop-into')) element.classList.remove('drop-before', 'drop-after', 'drop-into');
  }

  function dropTarget(event: DragEvent): { where: 'before' | 'after' | 'inside' | 'tail' | 'noop'; row?: HTMLElement } {
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

  function moveUnit(unitId: string, destination: { where: 'before' | 'after' | 'inside' | 'tail' | 'noop'; row?: HTMLElement }) {
    if (destination.where === 'noop') return;
    const cfg = options.getScene();
    const next = structuredClone(cfg);
    let units = stackUnits(next);
    let dragged = units.find(unit => (unit.kind === 'folder' ? unit.folder.id : unit.layer.id) === unitId);
    if (!dragged) {
      const layer = next.layers.find(candidate => candidate.id === unitId);
      if (!layer) return;
      dragged = { kind: 'layer', layer };
    }
    units = units.filter(unit => unit !== dragged);
    if (dragged.kind === 'layer') for (const unit of units) if (unit.kind === 'folder') unit.layers = unit.layers.filter(layer => layer.id !== unitId);

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
    reindexStack(next, units);
    void commitScene(next, 'Reorder layers');
  }

  list.ondragstart = event => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('.layer-row');
    if (!row?.dataset.drag) { event.preventDefault(); return; }
    dragUnit = row.dataset.drag;
    row.classList.add('dragging');
    document.body.classList.add('dragging-layers');
    if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', dragUnit); }
  };

  list.ondragover = event => {
    if (!dragUnit || filter) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    clearDropMarks();
    const destination = dropTarget(event);
    if (destination.where === 'noop' || destination.where === 'tail' || !destination.row) return;
    destination.row.classList.add(destination.where === 'inside' ? 'drop-into' : destination.where === 'before' ? 'drop-before' : 'drop-after');
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

  // ---- folder creation / search ----------------------------------------------

  function addFolder() {
    const cfg = options.getScene();
    const next = structuredClone(cfg);
    const folder: LayerFolder = { id: options.newId(), name: `Folder ${foldersOf(next).length + 1}`, order: 0, collapsed: false };
    next.folders = [...foldersOf(next), folder];
    const units = stackUnits(next);
    const unit = units.find(candidate => candidate.kind === 'folder' && candidate.folder.id === folder.id);
    if (unit) {
      const rest = units.filter(candidate => candidate !== unit);
      const location = selection[0] ? locate(rest, selection[0]!) : null;
      rest.splice(location ? location.unitIndex : 0, 0, unit);
      reindexStack(next, rest);
    }
    void commitScene(next, 'Add folder');
  }

  function setFilter(value: string) {
    filter = value.toLowerCase();
    renderAll();
  }

  const search = document.getElementById('layer-search') as HTMLInputElement | null;
  if (search) search.oninput = () => setFilter(search.value);

  const api = {
    render: renderAll,
    addFolder,
    selection: (): string[] => [...selection],
    primary: (): string => primary(),
    select: (ids: string[]) => setSelection(ids),
    clearSelection: () => setSelection([]),
    focusLayer: (id: string) => {
      renderAll();
      const row = list.querySelector<HTMLElement>(`[data-drag="layer:${id}"]`);
      row?.scrollIntoView({ block: 'nearest' });
    },
    getFilter: () => filter,
  };
  return api;
}

export type LayersPanel = ReturnType<typeof createLayersPanel>;

// Re-export stack helpers so existing unit tests keep importing them from the panel.
export { flattenedLayerIds, foldersOf, locate, reindexStack, stackUnits } from './layer-stack.ts';
export type { FolderUnit, LayerUnit, StackUnit } from './layer-stack.ts';
