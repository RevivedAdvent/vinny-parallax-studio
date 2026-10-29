import { launch, projectRoot } from './runtime.mjs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CAMERA_PROOF } from '../src/scenes/camera-proof.ts';
import { validateScene } from '../src/camera/validate.ts';
import { finite, clamp } from '../src/camera/easing.ts';

export function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} requires a value`);
  return args[index + 1];
}
export async function readInput(filename) {
  const input = filename ? JSON.parse(await readFile(resolve(filename), 'utf8')) : { config: CAMERA_PROOF, intensity: 1 };
  const config = validateScene(input.config ?? input);
  return { config, intensity: clamp(finite(input.intensity ?? 1, 'intensity'), 0, 1) };
}
export async function launchCamera(input) {
  const runtime = await launch();
  try {
    const page = await runtime.browser.newPage({ viewport: { width: input.config.width, height: input.config.height } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(input => { window.__CAMERA_INPUT__ = input; }, input);
    await page.goto(runtime.url + '/?render=1');
    await page.waitForFunction(() => window.cameraStudio?.ready, null, { timeout: 60000 });
    return { ...runtime, page, errors };
  } catch (error) { await runtime.close(); throw error; }
}
export const outputPath = path => resolve(projectRoot, path);
