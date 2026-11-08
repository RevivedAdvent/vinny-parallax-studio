import type { CameraSceneConfig, Layer } from '../camera/types.ts';
import { foldersOf, locate, reindexStack, stackUnits, type FolderUnit, type StackUnit } from './layer-stack.ts';

/**
 * Every Arrange layer operation lives here so the hierarchy, the context menu,
 * the inspector and the viewport share one implementation. Each command mutates
 * a working copy of the shared scene config and hands it to `commit`, which runs
 * scene validation, renders and repaints.
 */
export interface LayerCommandsOptions {
  getScene: () => CameraSceneConfig;
  /** Validate, render and persist a scene edit. Resolves once the scene is live. */
  commit: (next: CameraSceneConfig) => Promise<void>;
  notify: (message: string) => void;
  newId: () => string;
  selection: () => string[];
  select: (ids: string[]) => void;
}

export function createLayerCommands(options: LayerCommandsOptions) {
  const commit = async (next: CameraSceneConfig, message: string) => {
    try { await options.commit(next); }
    catch (error) { options.notify(`${message}: ${String(error)}`); }
  };
  const layersById = (cfg: CameraSceneConfig, ids: string[]) =>
    ids.map(id => cfg.layers.find(layer => layer.id === id)).filter((layer): layer is Layer => !!layer);

  /** Detach the given layers from every unit and return them in the requested order. */
  function detach(units: StackUnit[], ids: Set<string>) {
    const removed: Layer[] = [];
    const kept = units.map(unit => {
      if (unit.kind === 'folder') return { ...unit, layers: unit.layers.filter(layer => { if (ids.has(layer.id)) { removed.push(layer); return false; } return true; }) };
      if (ids.has(unit.layer.id)) { removed.push(unit.layer); return null; }
      return unit;
    }).filter((unit): unit is StackUnit => unit !== null);
    return { kept, removed };
  }
  const asUnits = (layers: Layer[]): StackUnit[] => layers.map(layer => ({ kind: 'layer', layer }));

  const commands = {
    async rename(layerId: string, name: string) {
      const next = structuredClone(options.getScene());
      const layer = next.layers.find(candidate => candidate.id === layerId);
      if (!layer) return;
      const trimmed = name.trim();
      if (!trimmed || trimmed === layer.name) return;
      layer.name = trimmed.slice(0, 120);
      await commit(next, 'Rename layer');
    },

    async duplicate(layerIds: string[] = options.selection()) {
      const next = structuredClone(options.getScene());
      const created: string[] = [];
      let order = Math.max(-1, ...next.layers.map(layer => layer.order ?? 0));
      for (const id of layerIds) {
        const original = next.layers.find(layer => layer.id === id);
        if (!original) continue;
        const copy: Layer = { ...structuredClone(original), id: options.newId(), name: `${original.name} (copy)`, order: ++order };
        next.layers.push(copy);
        created.push(copy.id);
        // Animation targets follow the copy so the duplicate animates identically.
        for (const track of [...next.tracks]) if (track.target === `layer:${id}`) next.tracks.push({ ...structuredClone(track), id: options.newId(), target: `layer:${copy.id}` });
        for (const track of [...(next.animationTracks ?? [])]) if (track.target === `layer:${id}`) {
          const cloned = structuredClone(track); cloned.id = options.newId(); cloned.target = `layer:${copy.id}`;
          cloned.keyframes.forEach(key => { key.id = options.newId(); });
          next.animationTracks!.push(cloned);
        }
      }
      if (!created.length) return;
      options.select(created);
      await commit(next, 'Duplicate layer');
    },

    async remove(layerIds: string[] = options.selection()) {
      const source = options.getScene();
      const targets = layersById(source, layerIds);
      if (!targets.length) return;
      const label = targets.length === 1 ? `“${targets[0]!.name}”` : `${targets.length} layers`;
      if (!confirm(`Delete ${label} and their animation tracks?`)) return;
      const ids = new Set(targets.map(layer => layer.id));
      const next = structuredClone(source);
      next.layers = next.layers.filter(layer => !ids.has(layer.id));
      next.tracks = next.tracks.filter(track => !(track.target.startsWith('layer:') && ids.has(track.target.slice(6))));
      next.animationTracks = next.animationTracks?.filter(track => !(track.target.startsWith('layer:') && ids.has(track.target.slice(6))));
      next.layerEffects = (next.layerEffects ?? []).map(effect => ({ ...effect, layerIds: effect.layerIds.filter(id => !ids.has(id)) })).filter(effect => effect.layerIds.length);
      next.atmosphere = (next.atmosphere ?? []).map(effect => ({
        ...effect,
        layerIds: (effect.layerIds ?? []).filter(id => !ids.has(id)),
        textureLayerId: effect.textureLayerId && ids.has(effect.textureLayerId) ? undefined : effect.textureLayerId,
      })).filter(effect => effect.target !== 'layers' || (effect.layerIds ?? []).length);
      if (next.parallax) next.parallax.influence = Object.fromEntries(Object.entries(next.parallax.influence).filter(([id]) => !ids.has(id)));
      if (next.depthScale) next.depthScale.influence = Object.fromEntries(Object.entries(next.depthScale.influence).filter(([id]) => !ids.has(id)));
      if (next.depthPlanes) next.depthPlanes = next.depthPlanes.map(plane => ({ ...plane, layerIds: plane.layerIds.filter(id => !ids.has(id)) }));
      options.select([]);
      await commit(next, 'Delete layer');
    },

    async setLocked(layerIds: string[], locked: boolean) {
      const next = structuredClone(options.getScene());
      let changed = false;
      for (const layer of layersById(next, layerIds)) if ((layer.locked === true) !== locked) { layer.locked = locked; changed = true; }
      if (changed) await commit(next, locked ? 'Lock layer' : 'Unlock layer');
    },

    async toggleLocked(layerId: string) {
      const layer = options.getScene().layers.find(candidate => candidate.id === layerId);
      if (layer) await commands.setLocked([layerId], layer.locked !== true);
    },

    async setVisible(layerIds: string[], visible: boolean) {
      const next = structuredClone(options.getScene());
      for (const layer of layersById(next, layerIds)) layer.visible = visible;
      await commit(next, 'Layer visibility');
    },

    async bringToFront(layerIds: string[] = options.selection()) {
      const next = structuredClone(options.getScene());
      const { kept, removed } = detach(stackUnits(next), new Set(layerIds));
      const ordered = layerIds.map(id => removed.find(layer => layer.id === id)).filter((layer): layer is Layer => !!layer);
      reindexStack(next, [...asUnits(ordered), ...kept]);
      await commit(next, 'Bring to front');
    },

    async sendToBack(layerIds: string[] = options.selection()) {
      const next = structuredClone(options.getScene());
      const { kept, removed } = detach(stackUnits(next), new Set(layerIds));
      const ordered = layerIds.map(id => removed.find(layer => layer.id === id)).filter((layer): layer is Layer => !!layer).reverse();
      reindexStack(next, [...kept, ...asUnits(ordered)]);
      await commit(next, 'Send to back');
    },

    /** Insert a layer at the front of a folder, or return it to the top level. */
    async moveToFolder(layerId: string, folderId: string | null) {
      const next = structuredClone(options.getScene());
      const layer = next.layers.find(candidate => candidate.id === layerId);
      if (!layer) return;
      const { kept } = detach(stackUnits(next), new Set([layerId]));
      if (folderId) {
        const target = kept.find(unit => unit.kind === 'folder' && unit.folder.id === folderId) as FolderUnit | undefined;
        if (!target) { options.notify('That folder no longer exists'); return; }
        target.layers.unshift(layer);
      } else {
        const location = locate(kept, options.selection().find(id => id !== layerId) ?? '');
        kept.splice(location ? location.unitIndex : 0, 0, { kind: 'layer', layer });
      }
      reindexStack(next, kept);
      await commit(next, folderId ? 'Move to folder' : 'Remove from folder');
    },

    async resetTransform(layerIds: string[] = options.selection()) {
      const next = structuredClone(options.getScene());
      let changed = false;
      for (const layer of layersById(next, layerIds)) {
        if (layer.x === 0 && layer.y === 0 && layer.scale === 1 && layer.rotation === 0 && layer.opacity === 1) continue;
        layer.x = 0; layer.y = 0; layer.scale = 1; layer.rotation = 0; layer.opacity = 1; changed = true;
      }
      if (changed) await commit(next, 'Reset transform');
    },

    /** Scale and centre a layer so the whole image fits inside the scene. */
    async fitToCanvas(layerId: string) {
      const next = structuredClone(options.getScene());
      const layer = next.layers.find(candidate => candidate.id === layerId);
      if (!layer) return;
      const width = layer.width ?? 0, height = layer.height ?? 0;
      if (!width || !height) { options.notify('This layer has no stored image size to fit'); return; }
      const scale = Math.min(next.width / width, next.height / height);
      if (!Number.isFinite(scale) || scale <= 0) { options.notify('This layer cannot be fitted to the canvas'); return; }
      layer.scale = scale; layer.x = 0; layer.y = 0;
      await commit(next, 'Fit layer to canvas');
    },

    /** Align the rotated image bounds to the scene at the neutral camera pose. */
    async alignToCanvas(layerId: string, edge: 'left' | 'right' | 'top' | 'bottom' | 'centre') {
      const next = structuredClone(options.getScene());
      const layer = next.layers.find(candidate => candidate.id === layerId);
      if (!layer || layer.locked) return;
      if (edge === 'centre') {
        layer.x = 0; layer.y = 0;
      } else {
        const width = layer.width ?? 0, height = layer.height ?? 0;
        if (!width || !height) { options.notify('This layer has no stored image size to align'); return; }
        const angle = (layer.rotation ?? 0) * Math.PI / 180;
        const zoom = next.camera.baseZoom;
        const scale = (layer.scale ?? 1) * zoom;
        const halfWidth = (Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * height) * scale / 2;
        const halfHeight = (Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * height) * scale / 2;
        if (edge === 'left') layer.x = (halfWidth - next.width / 2) / zoom;
        if (edge === 'right') layer.x = (next.width / 2 - halfWidth) / zoom;
        if (edge === 'top') layer.y = (halfHeight - next.height / 2) / zoom;
        if (edge === 'bottom') layer.y = (next.height / 2 - halfHeight) / zoom;
      }
      await commit(next, `Align ${edge}`);
    },

    async alignCentre(layerIds: string[] = options.selection(), axis: 'x' | 'y' | 'both' = 'both') {
      const next = structuredClone(options.getScene());
      for (const layer of layersById(next, layerIds)) {
        if (axis === 'x' || axis === 'both') layer.x = 0;
        if (axis === 'y' || axis === 'both') layer.y = 0;
      }
      await commit(next, 'Align layer');
    },

    /** Swap the artwork while keeping identity, transforms, folder and animation. */
    async replaceImage(layerId: string, asset: string, width?: number, height?: number) {
      const next = structuredClone(options.getScene());
      const layer = next.layers.find(candidate => candidate.id === layerId);
      if (!layer) return;
      layer.asset = asset;
      if (width && height) { layer.width = Math.round(width); layer.height = Math.round(height); }
      await commit(next, 'Replace image');
    },

    folders(): { id: string; name: string }[] {
      return foldersOf(options.getScene()).map(folder => ({ id: folder.id, name: folder.name }));
    },
  };
  return commands;
}

export type LayerCommands = ReturnType<typeof createLayerCommands>;
