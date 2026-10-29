import type { CameraSceneConfig } from '../camera/types.ts';
import { validateScene } from '../camera/validate.ts';
import { CAMERA_PROOF } from '../scenes/camera-proof.ts';

export interface StoryProject {
  schemaVersion: 1;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  settings: { width: number; height: number; fps: number };
  scenes: CameraSceneConfig[];
}

const id = () => crypto.randomUUID();
export function createProject(title: string): StoryProject {
  const now = new Date().toISOString();
  return { schemaVersion: 1, id: id(), title: title.trim() || 'Untitled Story', createdAt: now, updatedAt: now,
    settings: { width: 1920, height: 1080, fps: 24 }, scenes: [createScene('Scene 1', 10)] };
}
export function createScene(title: string, durationSeconds = 10, width = 1920, height = 1080, fps = 24): CameraSceneConfig {
  const totalFrames = Math.max(1, Math.round(durationSeconds * fps));
  return { version: 1, id: id(), title, width, height, fps, totalFrames, layers: [], tracks: [],
    camera: { baseZoom: 1, maxRoll: 180, anchor: { x: width / 2, y: height / 2 },
      limits: { x: { min: -width, max: width }, y: { min: -height, max: height }, zoom: { min: 0.25, max: 4 }, roll: { min: -30, max: 30 } } } };
}
export function validateProject(value: unknown): StoryProject {
  if (!value || typeof value !== 'object') throw new Error('Project must be an object');
  const p = structuredClone(value) as StoryProject;
  if (p.schemaVersion !== 1 || typeof p.id !== 'string' || !p.id.trim() || typeof p.title !== 'string' || !p.title.trim() || !Array.isArray(p.scenes) || !p.scenes.length || !p.settings || !Number.isInteger(p.settings.width) || !Number.isInteger(p.settings.height) || !Number.isInteger(p.settings.fps) || p.settings.width < 1 || p.settings.width > 8192 || p.settings.height < 1 || p.settings.height > 8192 || p.settings.fps < 1 || p.settings.fps > 120 || typeof p.createdAt !== 'string' || typeof p.updatedAt !== 'string') throw new Error('Unsupported or invalid StoryStudio project');
  const sceneIds = new Set<string>();
  for (const scene of p.scenes) {
    if (!scene.id || sceneIds.has(scene.id)) throw new Error('Scene IDs must be unique');
    sceneIds.add(scene.id);
    if (!Number.isInteger(scene.width) || !Number.isInteger(scene.height) || !Number.isInteger(scene.fps) || !Number.isInteger(scene.totalFrames) || scene.totalFrames < 1) throw new Error(`Invalid settings for scene ${scene.title}`);
    validateScene(scene);
    const layerIds = new Set<string>();
    for (const layer of scene.layers) {
      if (!layer.id || layerIds.has(layer.id)) throw new Error(`Layer IDs must be unique in ${scene.title}`);
      layerIds.add(layer.id);
      layer.name ||= 'Layer'; layer.order ??= scene.layers.indexOf(layer); layer.visible ??= true;
      layer.x ??= 0; layer.y ??= 0; layer.scale ??= 1; layer.rotation ??= 0; layer.opacity ??= 1;
    }
    for (const track of scene.tracks) if (track.target.startsWith('layer:') && !layerIds.has(track.target.slice(6))) throw new Error(`Track ${track.id} references missing layer`);
  }
  return p;
}
export function exampleProject(): StoryProject {
  const scene: CameraSceneConfig = { ...structuredClone(CAMERA_PROOF), title: 'The Arrival · Example',
    layers: CAMERA_PROOF.layers.map((layer, order) => ({ ...layer, order, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, visible: true, width: 1920, height: 1080 })) };
  const now = new Date().toISOString();
  return { schemaVersion:1, id:'example-vinny-project', title:'The Arrival (Example)', createdAt:now,updatedAt:now,settings:{width:1920,height:1080,fps:24},scenes:[scene] };
}
