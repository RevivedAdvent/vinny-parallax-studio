import type { CameraSceneConfig } from '../camera/types.ts';
import type { CameraScene } from '../engine/camera-scene.ts';
import type { LayerCommands } from './layer-commands.ts';
import { icons } from './icons.ts';

export interface Point { x: number; y: number }

interface Pose {
  id: string; x: number; y: number; scale: number; roll: number;
  opacity: number; depth: number; visible: boolean; locked: boolean;
  width: number; height: number;
}
export interface AdjustView {
  width: number; height: number;
  camera: { x: number; y: number; scale: number };
  roll: number; uniformDelta: number; dollyDelta: number;
  perspective: boolean;
  layers: Pose[];
}

const rad = (deg: number) => deg * Math.PI / 180;
const rotate = (point: Point, deg: number): Point => {
  const a = rad(deg), c = Math.cos(a), s = Math.sin(a);
  return { x: point.x * c - point.y * s, y: point.x * s + point.y * c };
};
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const MIN_ZOOM = .4, MAX_ZOOM = 8;

type Gesture =
  | { kind: 'pan'; start: Point; panX: number; panY: number }
  | { kind: 'move'; start: Point; ids: string[]; origins: { layer: { x?: number; y?: number } & Record<string, unknown>; x: number; y: number }[]; space: (point: Point) => Point; roll: number; camScale: number; baseZoom: number; factor: number[] }
  | { kind: 'resize'; corner: number; ids: string[]; centre: Point; pivot: Point; layerScale: number; layerX: number; layerY: number; space: (point: Point) => Point; roll: number; camScale: number; baseZoom: number; factor: number; startRatio: number }
  | { kind: 'rotate'; centre: Point; startAngle: number; startRotation: number; layer: Record<string, unknown> };

/**
 * Direct manipulation for the Arrange preview: selection box, corner resize,
 * rotation handle and a pan/zoom view.
 *
 * The overlay is a DOM layer on top of the engine canvas; screen positions come
 * from `scene.getAdjustView()` (the poses the renderer actually used), so the
 * handles always sit on the artwork. Dragging never mutates scene state
 * directly — it writes `x`, `y`, `scale` and `rotation` on the live layers and
 * the inspector/panel read the same objects.
 */
export function createArrangeViewport(options: {
  getScene: () => CameraSceneConfig;
  scene: () => CameraScene | undefined;
  commands: LayerCommands;
  selection: () => string[];
  select: (ids: string[]) => void;
  /** Repaint after a live (unvalidated) edit. */
  applyLive: () => Promise<void>;
  /** Validate + persist after the edit settles. */
  commitLive: () => Promise<void>;
  notify: (message: string) => void;
  /** Called when the viewport wants the hierarchy row scrolled into view. */
  reveal: (id: string) => void;
  /** Called after live geometry edits so the inspector can refresh its fields. */
  onGeometry: () => void;
}) {
  const viewer = document.getElementById('viewer') as HTMLElement;
  const host = document.getElementById('canvas-host') as HTMLElement;
  if (!viewer || !host) throw new Error('Arrange viewport needs #viewer and #canvas-host');

  const overlay = document.createElement('div');
  overlay.className = 'arrange-overlay';
  overlay.id = 'arrange-overlay';
  overlay.innerHTML = '<svg class="arrange-svg" aria-hidden="true"><g class="grid-layer"></g><g class="selection-layer"></g></svg>';
  viewer.append(overlay);
  const svg = overlay.querySelector('svg') as SVGSVGElement;
  const gridLayer = svg.querySelector('.grid-layer') as SVGGElement;
  const selectionLayer = svg.querySelector('.selection-layer') as SVGGElement;

  const toolbar = document.createElement('div');
  toolbar.className = 'arrange-toolbar';
  toolbar.id = 'arrange-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Canvas view');
  toolbar.innerHTML = `
    <div class="tool-group" role="group" aria-label="Tool">
      <button type="button" data-tool="select" aria-pressed="false" title="Select and move" aria-label="Select tool">${icons.pointer}</button>
      <button type="button" data-tool="pan" aria-pressed="false" title="Pan the canvas" aria-label="Pan tool">${icons.hand}</button>
    </div>
    <div class="tool-group view-controls" role="group" aria-label="Zoom" hidden>
      <button type="button" data-zoom="out" title="Zoom out" aria-label="Zoom out">${icons.zoomOut}</button>
      <button type="button" class="zoom-level" data-zoom="reset" title="Reset zoom and centre the full canvas (100%)" aria-label="Reset canvas zoom">100%</button>
      <button type="button" data-zoom="in" title="Zoom in" aria-label="Zoom in">${icons.zoomIn}</button>
    </div>
    <div class="tool-group view-controls" role="group" aria-label="View aids" hidden>
      <button type="button" data-toggle="grid" aria-pressed="false" title="Toggle grid" aria-label="Toggle grid">${icons.grid}</button>
      <button type="button" data-toggle="snap" aria-pressed="true" title="Toggle snapping" aria-label="Toggle snapping">${icons.snap}</button>
    </div>`;
  viewer.append(toolbar);

  let tool: 'select' | 'pan' | null = null;
  const inArrange = () => document.querySelector<HTMLElement>('#app')?.dataset.workspace === 'arrange';
  let zoom = 1, panX = 0, panY = 0;
  let grid = false, snap = true;
  let pending = 0;

  const adjust = (): AdjustView | null => {
    const scene = options.scene();
    if (!scene || typeof scene.getAdjustView !== 'function') return null;
    return scene.getAdjustView() as AdjustView;
  };
  const engineCanvas = () => host.querySelector('canvas') as HTMLCanvasElement | null;

  // ---- geometry ---------------------------------------------------------------

  /** Displayed (screen) rectangle of the engine canvas, including zoom and pan. */
  function displayRect() {
    const canvas = engineCanvas();
    const outer = viewer.getBoundingClientRect();
    const baseW = canvas?.clientWidth || 1;
    const baseH = canvas?.clientHeight || 1;
    const width = baseW * zoom, height = baseH * zoom;
    return {
      left: outer.left + (outer.width - width) / 2 + panX,
      top: outer.top + (outer.height - height) / 2 + panY,
      width, height, baseW, baseH,
    };
  }

  /** Pointer position in composition pixels (the scene's own coordinate space). */
  function compositionPoint(client: Point): Point {
    const rect = displayRect();
    const cfg = options.getScene();
    return {
      x: (client.x - rect.left) / Math.max(1, rect.width) * cfg.width,
      y: (client.y - rect.top) / Math.max(1, rect.height) * cfg.height,
    };
  }

  /** Corners of a layer pose in composition pixels, clockwise from top-left. */
  function cornersOf(pose: Pose): Point[] {
    const half = { x: pose.width * pose.scale / 2, y: pose.height * pose.scale / 2 };
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
      const offset = rotate({ x: half.x * sx!, y: half.y * sy! }, pose.roll);
      return { x: pose.x + offset.x, y: pose.y + offset.y };
    });
  }

  function insidePolygon(point: Point, polygon: Point[]) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i]!, b = polygon[j]!;
      if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  /** Front-to-back hit test: visible layers whose pose polygon contains the point. */
  function hitTest(point: Point) {
    const view = adjust(), cfg = options.getScene();
    if (!view) return [];
    const hits: { pose: Pose; index: number }[] = [];
    view.layers.forEach((pose, index) => {
      if (!pose.visible || !pose.width || !pose.height) return;
      if (insidePolygon(point, cornersOf(pose))) hits.push({ pose, index });
    });
    const order = new Map(cfg.layers.map(layer => [layer.id, layer.order ?? 0]));
    return hits.reverse().sort((a, b) => (order.get(b.pose.id) ?? 0) - (order.get(a.pose.id) ?? 0));
  }

  /** Space conversion for direct manipulation: composition delta → layer delta. */
  function makeSpace(view: AdjustView) {
    const cfg = options.getScene();
    const roll = view.roll, camScale = view.camera.scale || 1, baseZoom = cfg.camera.baseZoom || 1;
    const factorOf = (depth: number) => 1 + view.uniformDelta + view.dollyDelta * depth;
    return {
      factorOf, roll, camScale, baseZoom,
      /** composition-pixel delta → layer-space delta */
      fromComp: (delta: Point, depth: number): Point => {
        const scaled = rotate({ x: delta.x / camScale, y: delta.y / camScale }, -roll);
        const factor = baseZoom * factorOf(depth) || 1;
        return { x: scaled.x / factor, y: scaled.y / factor };
      },
    };
  }

  // ---- drawing ----------------------------------------------------------------

  function draw() {
    const view = adjust(), cfg = options.getScene();
    if (!view) { selectionLayer.innerHTML = ''; gridLayer.innerHTML = ''; return; }
    const rect = displayRect();
    if (rect.baseW <= 1) return;
    // Every coordinate below is a composition unit; `unit()` converts a wanted
    // on-screen size into composition units so handles stay finger-sized.
    const unit = (screenPixels: number) => screenPixels / Math.max(.0001, rect.width / cfg.width);

    // The overlay box matches the canvas box exactly, so the pan/zoom transform
    // and its centre origin stay in lockstep with the engine canvas.
    overlay.style.width = `${rect.baseW}px`;
    overlay.style.height = `${rect.baseH}px`;
    overlay.style.marginLeft = `${-rect.baseW / 2}px`;
    overlay.style.marginTop = `${-rect.baseH / 2}px`;
    overlay.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    svg.setAttribute('viewBox', `0 0 ${cfg.width} ${cfg.height}`);
    svg.style.width = '100%';
    svg.style.height = '100%';

    if (grid && tool && inArrange()) {
      const cells = 12;
      const lines: string[] = [];
      for (let i = 1; i < cells; i++) {
        const x = cfg.width * i / cells, y = cfg.height * i / cells;
        lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${cfg.height}"/>`);
        lines.push(`<line x1="0" y1="${y}" x2="${cfg.width}" y2="${y}"/>`);
      }
      gridLayer.innerHTML = `<g stroke="#8fa07f" stroke-opacity=".22" stroke-width="${unit(1)}">${lines.join('')}</g>
        <g stroke="#d6b17e" stroke-opacity=".4" stroke-width="${unit(1)}"><line x1="${cfg.width / 2}" y1="0" x2="${cfg.width / 2}" y2="${cfg.height}"/><line x1="0" y1="${cfg.height / 2}" x2="${cfg.width}" y2="${cfg.height / 2}"/></g>`;
    } else gridLayer.innerHTML = '';

    const ids = options.selection();
    if (!inArrange() || tool !== 'select' || !ids.length) { selectionLayer.innerHTML = ''; return; }
    const parts: string[] = [];
    for (const id of ids) {
      const pose = view.layers.find(layer => layer.id === id);
      if (!pose) continue;
      const corners = cornersOf(pose);
      const points = corners.map(point => `${point.x},${point.y}`).join(' ');
      parts.push(`<polygon class="sel-outline${pose.locked ? ' locked' : ''}${id === ids[0] ? ' primary' : ''}" points="${points}" fill="none" stroke="${id === ids[0] ? '#d6b17e' : '#9db08c'}" stroke-width="${unit(1.5)}" ${pose.locked ? 'stroke-dasharray="' + unit(6) + ' ' + unit(4) + '"' : ''}/>`);
      if (id !== ids[0] || pose.locked) continue;

      // Anchor (transform origin) and rotation handle.
      const centre = { x: pose.x, y: pose.y };
      const topMid = { x: (corners[0]!.x + corners[1]!.x) / 2, y: (corners[0]!.y + corners[1]!.y) / 2 };
      const up = { x: centre.x - topMid.x, y: centre.y - topMid.y };
      const length = Math.hypot(up.x, up.y) || 1;
      const handle = { x: topMid.x + up.x / length * unit(26), y: topMid.y + up.y / length * unit(26) };
      parts.push(`<line x1="${topMid.x}" y1="${topMid.y}" x2="${handle.x}" y2="${handle.y}" stroke="#d6b17e" stroke-width="${unit(1.2)}"/>`);
      parts.push(`<circle class="sel-rotate" cx="${handle.x}" cy="${handle.y}" r="${unit(5)}" fill="#0f150f" stroke="#d6b17e" stroke-width="${unit(1.6)}"/>`);
      parts.push(`<g class="sel-anchor"><circle cx="${centre.x}" cy="${centre.y}" r="${unit(4)}" fill="none" stroke="#d6b17e" stroke-width="${unit(1.2)}"/><line x1="${centre.x - unit(7)}" y1="${centre.y}" x2="${centre.x + unit(7)}" y2="${centre.y}" stroke="#d6b17e" stroke-width="${unit(1)}"/><line x1="${centre.x}" y1="${centre.y - unit(7)}" x2="${centre.x}" y2="${centre.y + unit(7)}" stroke="#d6b17e" stroke-width="${unit(1)}"/></g>`);
      for (const corner of corners) parts.push(`<rect class="sel-handle" x="${corner.x - unit(5)}" y="${corner.y - unit(5)}" width="${unit(10)}" height="${unit(10)}" fill="#0f150f" stroke="#d6b17e" stroke-width="${unit(1.6)}"/>`);
    }
    selectionLayer.innerHTML = parts.join('');
  }

  function schedule() {
    if (pending) return;
    pending = requestAnimationFrame(() => { pending = 0; update(); });
  }

  function update() {
    const canvas = engineCanvas();
    const rect = displayRect();
    if (canvas && rect.baseW > 1) {
      // View transforms must never leak into other workspaces.
      canvas.style.transform = inArrange() ? `translate(${panX}px, ${panY}px) scale(${zoom})` : '';
      canvas.style.transformOrigin = 'center center';
      canvas.style.imageRendering = inArrange() && zoom >= 2 ? 'pixelated' : '';
    }
    draw();
    const level = toolbar.querySelector<HTMLElement>('.zoom-level');
    // 100% is the full composition fitted into the preview, not screen-pixel size.
    if (level && rect.baseW > 1) level.textContent = `${Math.round(zoom * 100)}%`;
  }

  // ---- hit testing ------------------------------------------------------------

  function primaryPose(view: AdjustView) {
    const id = options.selection()[0];
    return view.layers.find(layer => layer.id === id);
  }

  /** Screen-space hit test for the resize/rotate handles of the primary layer. */
  function handleAt(client: Point): { kind: 'corner'; index: number } | { kind: 'rotate' } | null {
    const view = adjust(), cfg = options.getScene();
    if (!view) return null;
    const pose = primaryPose(view);
    if (!pose || pose.locked || !pose.width) return null;
    const rect = displayRect();
    const unit = (screenPixels: number) => screenPixels / Math.max(.0001, rect.width / cfg.width);
    const pointer = compositionPoint(client);
    const reach = unit(11);
    const corners = cornersOf(pose);
    for (let index = 0; index < corners.length; index++) {
      const corner = corners[index]!;
      if (Math.hypot(corner.x - pointer.x, corner.y - pointer.y) <= reach) return { kind: 'corner', index };
    }
    const centre = { x: pose.x, y: pose.y };
    const topMid = { x: (corners[0]!.x + corners[1]!.x) / 2, y: (corners[0]!.y + corners[1]!.y) / 2 };
    const up = { x: centre.x - topMid.x, y: centre.y - topMid.y };
    const length = Math.hypot(up.x, up.y) || 1;
    const handle = { x: topMid.x + up.x / length * unit(26), y: topMid.y + up.y / length * unit(26) };
    if (Math.hypot(handle.x - pointer.x, handle.y - pointer.y) <= reach) return { kind: 'rotate' };
    return null;
  }

  /** The topmost selected, unlocked layer whose box contains the point. */
  function selectedAt(point: Point) {
    const ids = new Set(options.selection());
    return hitTest(point).find(hit => ids.has(hit.pose.id) && !hit.pose.locked) ?? null;
  }

  // ---- gestures ---------------------------------------------------------------

  type MoveGesture = {
    kind: 'move';
    start: Point;
    camScale: number; roll: number; baseZoom: number; uniformDelta: number; dollyDelta: number;
    entries: { layer: Record<string, unknown>; x: number; y: number; depth: number; cx: number; cy: number }[];
  };
  type ResizeGesture = {
    kind: 'resize';
    centre: Point; pivot: Point; diagonal: Point;
    layerScale: number; layerX: number; layerY: number; startRatio: number;
    camScale: number; roll: number; baseZoom: number; uniformDelta: number; dollyDelta: number; depth: number;
    layerId: string;
  };
  type RotateGesture = { kind: 'rotate'; centre: Point; startAngle: number; startRotation: number; layer: Record<string, unknown> };
  type PanGesture = { kind: 'pan'; start: Point; panX: number; panY: number };
  type Drag = MoveGesture | ResizeGesture | RotateGesture | PanGesture;

  let drag: Drag | null = null;
  let shiftHeld = false;
  const numberLayer = (layer: unknown) => layer as { x?: number; y?: number; scale?: number; rotation?: number };

  function startMove(event: PointerEvent) {
    const view = adjust(), cfg = options.getScene();
    if (!view) return;
    const start = compositionPoint({ x: event.clientX, y: event.clientY });
    const entries = options.selection().map(id => {
      const layer = cfg.layers.find(candidate => candidate.id === id);
      const pose = view.layers.find(candidate => candidate.id === id);
      if (!layer || !pose || layer.locked || layer.visible === false) return null;
      return { layer: layer as unknown as Record<string, unknown>, x: layer.x ?? 0, y: layer.y ?? 0, depth: pose.depth, cx: pose.x, cy: pose.y };
    }).filter((entry): entry is MoveGesture['entries'][number] => entry !== null);
    if (!entries.length) return;
    drag = {
      kind: 'move', start, entries,
      camScale: view.camera.scale || 1, roll: view.roll, baseZoom: cfg.camera.baseZoom || 1,
      uniformDelta: view.uniformDelta, dollyDelta: view.dollyDelta,
    };
    viewer.classList.add('dragging-selection');
  }

  function startResize(event: PointerEvent, index: number) {
    const view = adjust();
    if (!view) return;
    const cfg = options.getScene();
    const pose = primaryPose(view);
    if (!pose) return;
    const layer = cfg.layers.find(candidate => candidate.id === pose.id);
    if (!layer) return;
    const corners = cornersOf(pose);
    const pivot = corners[(index + 2) % 4]!;
    const centre = { x: pose.x, y: pose.y };
    const diagonal = { x: centre.x - pivot.x, y: centre.y - pivot.y };
    const start = compositionPoint({ x: event.clientX, y: event.clientY });
    const ratio = ((start.x - pivot.x) * diagonal.x + (start.y - pivot.y) * diagonal.y) / Math.max(1e-6, diagonal.x ** 2 + diagonal.y ** 2);
    drag = {
      kind: 'resize', centre, pivot, diagonal, layerId: pose.id,
      layerScale: layer.scale ?? 1, layerX: layer.x ?? 0, layerY: layer.y ?? 0,
      startRatio: Math.abs(ratio) < 1e-3 ? 1 : Math.abs(ratio),
      camScale: view.camera.scale || 1, roll: view.roll, baseZoom: cfg.camera.baseZoom || 1,
      uniformDelta: view.uniformDelta, dollyDelta: view.dollyDelta, depth: pose.depth,
    };
    viewer.classList.add('dragging-selection');
  }

  function startRotate(event: PointerEvent) {
    const view = adjust(), cfg = options.getScene();
    const pose = view ? primaryPose(view) : undefined;
    if (!view || !pose) return;
    const layer = cfg.layers.find(candidate => candidate.id === pose.id);
    if (!layer) return;
    const rect = displayRect();
    const centre = { x: rect.left + (pose.x / cfg.width) * rect.width, y: rect.top + (pose.y / cfg.height) * rect.height };
    drag = {
      kind: 'rotate', centre, layer: layer as unknown as Record<string, unknown>,
      startAngle: Math.atan2(event.clientY - centre.y, event.clientX - centre.x),
      startRotation: layer.rotation ?? 0,
    };
    viewer.classList.add('dragging-selection');
  }

  const snapTargetsX = (cfg: CameraSceneConfig) => grid ? Array.from({ length: 11 }, (_, i) => cfg.width * (i + 1) / 12) : [cfg.width / 2];
  const snapTargetsY = (cfg: CameraSceneConfig) => grid ? Array.from({ length: 11 }, (_, i) => cfg.height * (i + 1) / 12) : [cfg.height / 2];
  const nearest = (targets: number[], value: number) => targets.reduce<number | null>((best, target) => best === null || Math.abs(target - value) < Math.abs(best - value) ? target : best, null);

  function moveTo(client: Point) {
    if (!drag || drag.kind === 'pan') return;
    const cfg = options.getScene();
    const point = compositionPoint(client);

    if (drag.kind === 'move') {
      let delta = { x: point.x - drag.start.x, y: point.y - drag.start.y };
      if (snap && drag.entries.length === 1) {
        const entry = drag.entries[0]!;
        const rect = displayRect();
        const threshold = 7 / Math.max(1e-6, rect.width / cfg.width);
        const centre = { x: entry.cx + delta.x, y: entry.cy + delta.y };
        const targetX = nearest(snapTargetsX(cfg), centre.x);
        const targetY = nearest(snapTargetsY(cfg), centre.y);
        if (targetX !== null && Math.abs(targetX - centre.x) <= threshold) delta = { x: delta.x + targetX - centre.x, y: delta.y };
        if (targetY !== null && Math.abs(targetY - centre.y) <= threshold) delta = { x: delta.x, y: delta.y + targetY - centre.y };
      }
      for (const entry of drag.entries) {
        const scaled = rotate({ x: delta.x / drag.camScale, y: delta.y / drag.camScale }, -drag.roll);
        const factor = (drag.baseZoom * (1 + drag.uniformDelta + drag.dollyDelta * entry.depth)) || 1;
        const layer = numberLayer(entry.layer);
        layer.x = Math.round((entry.x + scaled.x / factor) * 100) / 100;
        layer.y = Math.round((entry.y + scaled.y / factor) * 100) / 100;
      }
      options.onGeometry();
      void options.applyLive();
      return;
    }

    if (drag.kind === 'resize') {
      const ratio = ((point.x - drag.pivot.x) * drag.diagonal.x + (point.y - drag.pivot.y) * drag.diagonal.y) / Math.max(1e-6, drag.diagonal.x ** 2 + drag.diagonal.y ** 2);
      const factor = clamp(ratio / drag.startRatio, .02, 60);
      const layerId = drag.layerId;
      const layer = cfg.layers.find(candidate => candidate.id === layerId);
      if (!layer) return;
      layer.scale = Math.max(.001, Math.round(drag.layerScale * factor * 1000) / 1000);
      const centre = { x: drag.pivot.x + drag.diagonal.x * factor, y: drag.pivot.y + drag.diagonal.y * factor };
      const moved = rotate({ x: (centre.x - drag.centre.x) / drag.camScale, y: (centre.y - drag.centre.y) / drag.camScale }, -drag.roll);
      const poseFactor = (drag.baseZoom * (1 + drag.uniformDelta + drag.dollyDelta * drag.depth)) || 1;
      layer.x = Math.round((drag.layerX + moved.x / poseFactor) * 100) / 100;
      layer.y = Math.round((drag.layerY + moved.y / poseFactor) * 100) / 100;
      options.onGeometry();
      void options.applyLive();
      return;
    }

    const angle = Math.atan2(client.y - drag.centre.y, client.x - drag.centre.x);
    let degrees = drag.startRotation + (angle - drag.startAngle) * 180 / Math.PI;
    if (shiftHeld) degrees = Math.round(degrees / 15) * 15;
    degrees = ((degrees % 360) + 540) % 360 - 180;
    numberLayer(drag.layer).rotation = Math.round(degrees * 10) / 10;
    options.onGeometry();
    void options.applyLive();
  }

  function activeLayer(id: string) {
    return options.getScene().layers.find(layer => layer.id === id);
  }

  // ---- pointer routing --------------------------------------------------------

  viewer.addEventListener('pointerdown', event => {
    if (!inArrange() || !tool) return;
    if ((event.target as HTMLElement).closest('#arrange-toolbar')) return;
    if (event.button !== 0 && event.button !== 1) return;
    if (!options.scene()) return;
    viewer.focus({ preventScroll: true });
    if (tool === 'pan' || event.button === 1) {
      event.preventDefault();
      drag = { kind: 'pan', start: { x: event.clientX, y: event.clientY }, panX, panY };
      viewer.classList.add('panning');
      viewer.setPointerCapture(event.pointerId);
      return;
    }
    const view = adjust();
    if (!view) return;
    if (view.perspective) { options.notify('Turn off perspective camera moves to drag layers directly'); return; }

    const handle = handleAt({ x: event.clientX, y: event.clientY });
    if (handle) {
      event.preventDefault();
      if (handle.kind === 'rotate') startRotate(event); else startResize(event, handle.index);
      if (drag) viewer.setPointerCapture(event.pointerId);
      schedule();
      return;
    }

    const point = compositionPoint({ x: event.clientX, y: event.clientY });
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const alreadySelected = selectedAt(point);
    if (alreadySelected) {
      if (additive) { options.select(options.selection().filter(id => id !== alreadySelected.pose.id)); return; }
      event.preventDefault();
      startMove(event);
      if (drag) viewer.setPointerCapture(event.pointerId);
      return;
    }

    const hits = hitTest(point);
    if (!hits.length) {
      if (!additive) options.select([]);
      return;
    }
    const chosen = event.altKey && hits.length > 1 ? hits[1]! : hits[0]!;
    if (additive) {
      const ids = options.selection().includes(chosen.pose.id)
        ? options.selection().filter(id => id !== chosen.pose.id)
        : [...options.selection(), chosen.pose.id];
      options.select(ids);
      options.reveal(chosen.pose.id);
      return;
    }
    options.select([chosen.pose.id]);
    options.reveal(chosen.pose.id);
    const layer = activeLayer(chosen.pose.id);
    if (!layer || layer.locked) { schedule(); return; }
    event.preventDefault();
    startMove(event);
    if (drag) viewer.setPointerCapture(event.pointerId);
  });

  viewer.addEventListener('pointermove', event => {
    if (!inArrange() || !tool) return;
    if (!drag) {
      const handle = handleAt({ x: event.clientX, y: event.clientY });
      viewer.classList.toggle('over-handle', !!handle && tool === 'select');
      return;
    }
    if (drag.kind === 'pan') {
      panX = drag.panX + (event.clientX - drag.start.x);
      panY = drag.panY + (event.clientY - drag.start.y);
      schedule();
      return;
    }
    moveTo({ x: event.clientX, y: event.clientY });
    schedule();
  });

  function endDrag(event: PointerEvent, commit: boolean) {
    if (!drag) return;
    const settled = commit && drag.kind !== 'pan';
    drag = null;
    viewer.classList.remove('dragging-selection', 'panning');
    if (viewer.hasPointerCapture(event.pointerId)) viewer.releasePointerCapture(event.pointerId);
    schedule();
    if (settled) void options.commitLive();
  }
  viewer.addEventListener('pointerup', event => endDrag(event, true));
  viewer.addEventListener('pointercancel', event => endDrag(event, false));

  // ---- wheel and keyboard -----------------------------------------------------

  viewer.addEventListener('wheel', event => {
    if (!inArrange() || !tool || (event.target as HTMLElement).closest('#arrange-toolbar')) return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const rect = displayRect();
      const focus = { x: (event.clientX - rect.left) / Math.max(1, rect.width) - .5, y: (event.clientY - rect.top) / Math.max(1, rect.height) - .5 };
      const next = clamp(zoom * Math.exp(-event.deltaY / 260), MIN_ZOOM, MAX_ZOOM);
      const ratio = next / zoom;
      panX += focus.x * rect.width * (1 - ratio);
      panY += focus.y * rect.height * (1 - ratio);
      zoom = next;
    } else {
      panX -= event.deltaX;
      panY -= event.deltaY;
    }
    schedule();
  }, { passive: false });

  window.addEventListener('keydown', event => { if (event.key === 'Shift') shiftHeld = true; });
  window.addEventListener('keyup', event => { if (event.key === 'Shift') shiftHeld = false; });
  window.addEventListener('blur', () => { shiftHeld = false; });

  viewer.addEventListener('keydown', event => {
    if (!inArrange() || tool !== 'select' || event.target !== viewer) return;
    const ids = options.selection();
    const nudge: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const step = nudge[event.key];
    if (!step || !ids.length) return;
    if ((event.target as HTMLElement).closest('input,textarea,select')) return;
    event.preventDefault();
    // Arrow keys nudge the selection instead of stepping frames while the preview has focus.
    event.stopPropagation();
    const amount = event.shiftKey ? 10 : 1;
    for (const id of ids) {
      const layer = activeLayer(id);
      if (!layer || layer.locked) continue;
      layer.x = Math.round(((layer.x ?? 0) + step[0] * amount) * 100) / 100;
      layer.y = Math.round(((layer.y ?? 0) + step[1] * amount) * 100) / 100;
    }
    options.onGeometry();
    void options.applyLive().then(() => options.commitLive());
    schedule();
  });
  viewer.tabIndex = 0;

  // ---- toolbar ----------------------------------------------------------------

  function setTool(next: 'select' | 'pan' | null) {
    tool = next;
    for (const button of toolbar.querySelectorAll<HTMLButtonElement>('[data-tool]')) button.setAttribute('aria-pressed', String(button.dataset.tool === next));
    for (const group of toolbar.querySelectorAll<HTMLElement>('.view-controls')) group.hidden = !next;
    viewer.classList.toggle('tool-pan', next === 'pan');
    viewer.classList.remove('over-handle');
    schedule();
  }
  function setZoom(next: number) {
    zoom = clamp(next, MIN_ZOOM, MAX_ZOOM);
    if (zoom === 1) { panX = 0; panY = 0; }
    schedule();
  }
  function fitView() { zoom = 1; panX = 0; panY = 0; schedule(); }

  toolbar.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button) return;
    if (button.dataset.tool) {
      const next = button.dataset.tool as 'select' | 'pan';
      setTool(tool === next ? null : next);
      return;
    }
    if (!tool) return;
    if (button.dataset.zoom === 'in') { setZoom(zoom * 1.25); return; }
    if (button.dataset.zoom === 'out') { setZoom(zoom / 1.25); return; }
    if (button.dataset.zoom === 'reset') { fitView(); return; }
    if (button.dataset.toggle === 'grid') {
      grid = !grid;
      button.setAttribute('aria-pressed', String(grid));
      schedule();
      return;
    }
    if (button.dataset.toggle === 'snap') {
      snap = !snap;
      button.setAttribute('aria-pressed', String(snap));
      schedule();
    }
  });

  // ---- lifecycle --------------------------------------------------------------

  const observer = new ResizeObserver(() => schedule());
  observer.observe(viewer);
  observer.observe(host);

  return {
    update: () => schedule(),
    refresh: () => { update(); },
    fitView,
    reset: () => { fitView(); setTool(null); viewer.classList.remove('dragging-selection', 'panning', 'over-handle'); drag = null; update(); },
    tool: () => tool,
    zoom: () => zoom,
    destroy: () => observer.disconnect(),
  };
}
