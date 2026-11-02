import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchCamera } from './camera-runtime.mjs';

const safe = value => String(value || 'video').normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'video';
export async function exportStoryVideo({ project: raw, sceneId, output }) {
  const project = structuredClone(raw);
  if (!project || !Array.isArray(project.scenes)) throw new Error('Invalid Story project');
  const selected = project.scenes.find(s => s.id === sceneId);
  if (sceneId && !selected) throw new Error('Selected scene not found');
  const scenes = selected ? [selected] : project.scenes;
  const fps = 60, width = 1920, height = 1080;
  const counts = scenes.map(s => Math.max(1, Math.round(s.totalFrames / s.fps * fps)));
  if (counts.some(n => n > 36000)) throw new Error('A scene exceeds the export limit of 10 minutes');
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg', ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
  const encoders = spawnSync(ffmpeg, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  if (encoders.status !== 0) throw new Error('FFmpeg unavailable; install FFmpeg or set FFMPEG_PATH');
  const encoder = encoders.stdout.includes('libx264') ? 'libx264' : encoders.stdout.includes('libopenh264') ? 'libopenh264' : null;
  if (!encoder) throw new Error('FFmpeg must include libx264 or libopenh264 for H.264 MP4 export');
  if (spawnSync(ffprobe, ['-version']).status !== 0) throw new Error('FFprobe unavailable; install FFprobe or set FFPROBE_PATH');
  const directory = await mkdtemp(resolve(tmpdir(), 'vinny-export-'));
  const destination = resolve(output || resolve('output', `${safe(project.title)}_${selected ? safe(selected.title) : 'full-video'}.mp4`));
  const temporary = resolve(dirname(destination), `.${basename(destination)}.${process.pid}.partial.mp4`);
  let runtime;
  try {
    for (let i = 0; i < scenes.length; i++) {
    const scene = structuredClone(scenes[i]);
      const sourceWidth=scene.width,sourceHeight=scene.height;
      scene.width = width; scene.height = height; scene.fps = fps;
      scene.totalFrames = counts[i]; scene.tracks = [];
      // Scale the composition coordinate space uniformly to fit the 16:9 output.
      // Each layer keeps its own transform and stacking order; no per-layer stretching.
      const scale=Math.max(width/sourceWidth,height/sourceHeight),offsetX=(width-sourceWidth*scale)/2,offsetY=(height-sourceHeight*scale)/2;
      scene.layers.forEach(layer => { layer.x=(layer.x??0)*scale+offsetX; layer.y=(layer.y??0)*scale+offsetY; layer.scale=(layer.scale??1)*scale; });
      scene.camera.baseZoom = 1;
      scene.camera.limits.zoom = { min: 1, max: 1 };
      scene.camera.limits.x = { min: 0, max: 0 }; scene.camera.limits.y = { min: 0, max: 0 }; scene.camera.limits.roll = { min: 0, max: 0 };
      scene.camera.anchor = { x: width / 2, y: height / 2 };
      const input = { config: scene, intensity: 0 };
      runtime = await launchCamera(input);
      await runtime.page.evaluate(() => window.cameraStudio.renderFrame(0));
      const png = await runtime.page.evaluate(() => { const canvas=document.querySelector('canvas');if(!canvas)throw new Error('Scene renderer canvas missing');return canvas.toDataURL('image/png'); });
      await writeFile(resolve(directory, `scene-${i}.png`), Buffer.from(png.split(',')[1], 'base64'));
      await runtime.close(); runtime = undefined;
    }
    const args = ['-hide_banner', '-loglevel', 'error', '-y'];
    for (let i = 0; i < scenes.length; i++) args.push('-loop', '1', '-framerate', String(fps), '-i', resolve(directory, `scene-${i}.png`));
    const filters = scenes.map((_, i) => `[${i}:v]scale=${width}:${height},setsar=1,format=yuv420p,trim=end_frame=${counts[i]},setpts=PTS-STARTPTS[v${i}]`);
    filters.push(scenes.map((_, i) => `[v${i}]`).join('') + `concat=n=${scenes.length}:v=1:a=0[outv]`);
    args.push('-filter_complex', filters.join(';'), '-map', '[outv]', '-frames:v', String(counts.reduce((a, b) => a + b, 0)), '-r', String(fps), '-fps_mode', 'cfr', '-an', '-c:v', encoder, ...(encoder === 'libx264' ? ['-preset', 'veryfast', '-crf', '18'] : ['-b:v', '12M']), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', temporary);
    await new Promise((resolvePromise, reject) => { const child = spawn(ffmpeg, args, { stdio: 'inherit' }); child.on('error', reject); child.on('close', code => code === 0 ? resolvePromise() : reject(new Error(`FFmpeg exited with code ${code}`))); });
    const probe = spawnSync(ffprobe, ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_name,width,height,avg_frame_rate,nb_read_frames:format=duration', '-of', 'json', temporary], { encoding: 'utf8' });
    if (probe.status !== 0) throw new Error(`FFprobe verification failed: ${probe.stderr}`);
    const metadata = JSON.parse(probe.stdout), stream = metadata.streams[0], frames = counts.reduce((a, b) => a + b, 0);
    if (stream.codec_name !== 'h264' || stream.width !== width || stream.height !== height || stream.avg_frame_rate !== '60/1' || Number(stream.nb_read_frames) !== frames || Math.abs(Number(metadata.format.duration) - frames / fps) > 0.001) throw new Error('Encoded MP4 metadata does not match required dimensions, frame rate or duration');
    await rename(temporary, destination);
    return { output: destination, metadata, frames, duration: frames / fps };
  } finally { if (runtime) await runtime.close(); await rm(directory, { recursive: true, force: true }); await rm(temporary, { force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [inputPath, mode = 'all', sceneId, output] = process.argv.slice(2);
  if (!inputPath) throw new Error('Usage: node scripts/export-story-video.mjs project.json [current|all] [scene-id] [output.mp4]');
  const data = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
  const result = await exportStoryVideo({ project: data.project ?? data, sceneId: mode === 'current' ? sceneId : undefined, output });
  console.log(JSON.stringify(result, null, 2));
}
