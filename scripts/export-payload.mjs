// Validates an export request before any rendering starts, so bad shapes fail
// with a clear message instead of a TypeError deep inside the renderer.
export const MAX_PAYLOAD_BYTES = 80 * 1024 * 1024;

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const positiveInt = (value, max) => Number.isInteger(value) && value >= 1 && value <= max;
const finiteNumber = value => typeof value === 'number' && Number.isFinite(value);

export function validateExportRequest(data) {
  if (!isObject(data)) throw new Error('Export request must be a JSON object');
  const project = data.project;
  if (!isObject(project)) throw new Error('Export request is missing a Story project');
  if (!Array.isArray(project.scenes) || project.scenes.length === 0) throw new Error('Story project has no scenes');
  for (const [index, scene] of project.scenes.entries()) {
    const label = `scene ${index + 1}`;
    if (!isObject(scene)) throw new Error(`Invalid ${label}: not an object`);
    if (typeof scene.id !== 'string' || !scene.id) throw new Error(`Invalid ${label}: missing id`);
    if (!positiveInt(scene.totalFrames, 100000)) throw new Error(`Invalid ${label}: totalFrames must be a positive integer`);
    if (!positiveInt(scene.fps, 120)) throw new Error(`Invalid ${label}: fps must be a positive integer`);
    if (!isObject(scene.camera)) throw new Error(`Invalid ${label}: camera settings are missing`);
    if (!isObject(scene.camera.limits)) throw new Error(`Invalid ${label}: camera limits are missing`);
    if (!isObject(scene.camera.anchor) || !finiteNumber(scene.camera.anchor.x) || !finiteNumber(scene.camera.anchor.y)) throw new Error(`Invalid ${label}: camera anchor is missing`);
    if (!Array.isArray(scene.layers)) throw new Error(`Invalid ${label}: layers must be an array`);
    if (!Array.isArray(scene.tracks)) throw new Error(`Invalid ${label}: tracks must be an array`);
    if (!positiveInt(scene.width, 8192) || !positiveInt(scene.height, 8192)) throw new Error(`Invalid ${label}: width and height must be positive integers`);
    for (const layer of scene.layers) {
      if (!isObject(layer) || typeof layer.id !== 'string' || !layer.id) throw new Error(`Invalid layer in ${label}: missing id`);
      if (typeof layer.asset !== 'string' || !layer.asset) throw new Error(`Invalid layer "${layer.name ?? layer.id}" in ${label}: missing artwork`);
      // Structure only: resolveLayerAsset() in export-assets.mjs checks each reference
      // (embedded data URL or project /assets path) and names the layer on failure.
      if (layer.asset.startsWith('blob:') || /^https?:/i.test(layer.asset)) throw new Error(`Artwork "${layer.name ?? layer.id}" uses a ${layer.asset.split(':')[0]} reference the export service cannot read; re-import the image`);
    }
  }
  if (data.sceneId !== undefined && data.sceneId !== null && typeof data.sceneId !== 'string') throw new Error('sceneId must be a string');
  if (data.sceneId && !project.scenes.some(scene => scene.id === data.sceneId)) throw new Error('Selected scene not found');
  return { project, sceneId: data.sceneId || undefined, filename: typeof data.filename === 'string' ? data.filename : undefined };
}
