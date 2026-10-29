import type { CameraSceneConfig, CameraState, LayerTransform } from './types.ts';

/** x/y are camera-space pixels: moving camera right displaces artwork left.
 * All layers share the anchor for scale and roll. No perspective/orbit is simulated.
 * Combined scale = baseZoom * (1 + uniformDelta + depth*dollyDelta) * localZoom.
 */
export function projectLayers(config: CameraSceneConfig, state: CameraState): LayerTransform[] {
  const { anchor, baseZoom } = config.camera;
  const radians = state.roll * Math.PI / 180;
  const c = Math.cos(radians), s = Math.sin(radians);
  return config.layers.map(layer => {
    const local = state.layers[layer.id];
    const factor = 1 + state.uniformDelta + state.dollyDelta * layer.depth;
    const dx = (config.width / 2 - anchor.x) * factor - state.x * layer.depth + local.x;
    const dy = (config.height / 2 - anchor.y) * factor - state.y * layer.depth + local.y;
    return { id: layer.id, depth: layer.depth,
      x: anchor.x + dx * c - dy * s, y: anchor.y + dx * s + dy * c,
      scale: baseZoom * factor * local.zoom, roll: state.roll + local.roll };
  });
}
