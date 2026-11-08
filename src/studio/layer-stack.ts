import type { CameraSceneConfig, Layer, LayerFolder } from '../camera/types.ts';

/**
 * The Arrange stack model.
 *
 * Draw order is the flat layer array after `order` sorting, front to back by
 * descending order. Folders are organisation only: they occupy a slot in the
 * same order space and their children are packed just below that slot, so a
 * folder always moves as one contiguous block.
 *
 * This module only reads and rewrites `order` / `folderId`; it never stores a
 * second copy of layer state.
 */

export type FolderUnit = { kind: 'folder'; folder: LayerFolder; layers: Layer[] };
export type LayerUnit = { kind: 'layer'; layer: Layer };
export type StackUnit = FolderUnit | LayerUnit;

/** Reserved numeric gap between two stack units; children live inside it. */
export const SPACING = 1000;

export const foldersOf = (cfg: CameraSceneConfig): LayerFolder[] => cfg.folders ?? [];
export const isVisible = (layer: Layer | undefined): boolean => layer?.visible !== false;

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

/** Every layer id in display order, front to back, folders expanded. */
export function flattenedLayerIds(cfg: CameraSceneConfig): string[] {
  const ids: string[] = [];
  for (const unit of stackUnits(cfg)) {
    if (unit.kind === 'folder') ids.push(...unit.layers.map(layer => layer.id));
    else ids.push(unit.layer.id);
  }
  return ids;
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

export function locate(units: StackUnit[], id: string): { unitIndex: number; childIndex?: number } | null {
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

/** The unit that holds `id`, or null when the layer is not in the stack. */
