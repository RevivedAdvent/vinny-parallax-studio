import { spawn, spawnSync } from 'node:child_process';
import { readFile, rm, rename } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchCamera } from './camera-runtime.mjs';
import { resolveLayerAsset, AssetError } from './export-assets.mjs';

const safe = value => String(value || 'video').normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'video';
export async function exportStoryVideo({ project: raw, sceneId, output, onPhase = () => {} }) {
  const project = structuredClone(raw);
  if (!project || !Array.isArray(project.scenes)) throw new Error('Invalid Story project');
  for (const scene of project.scenes) if (!scene || !scene.camera || !scene.camera.limits || !Array.isArray(scene.layers) || !Array.isArray(scene.tracks)) throw new Error('Story project scene is missing camera or layer data');
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
  onPhase('preparing');
  // Resolve every layer's artwork before any browser is launched. A bad asset fails here,
  // naming the scene and layer, instead of producing a blank or partial video.
  onPhase('resolving');
  const resolvedScenes = [];
  for (const scene of scenes) {
    const copy = structuredClone(scene);
    for (const layer of copy.layers) {
      try { layer.asset = await resolveLayerAsset(layer); }
      catch (error) {
        if (error instanceof AssetError) throw new AssetError(`${scene.title ?? scene.id} / ${error.layer}`, error.reason);
        throw error;
      }
    }
    resolvedScenes.push(copy);
  }
  const destination = resolve(output || resolve('output', `${safe(project.title)}_${selected ? safe(selected.title) : 'full-video'}.mp4`));
  const temporary = resolve(dirname(destination), `.${basename(destination)}.${process.pid}.partial.mp4`);
  let runtime, encoderProcess;
  try {
    // Keep each source scene's FPS and coordinate system. Sample source time at n/60,
    // not a rounded source frame, then resize only the final composed image.
    const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-vcodec', 'png', '-i', 'pipe:0', '-vf', 'setsar=1', '-r', String(fps), '-fps_mode', 'cfr', '-an', '-c:v', encoder,
      ...(encoder === 'libx264' ? ['-preset', 'veryfast', '-crf', '18'] : ['-b:v', '12M']), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', temporary];
    encoderProcess = spawn(ffmpeg, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let encoderError, diagnostics = '';
    encoderProcess.stderr.on('data', data => { diagnostics = (diagnostics + data).slice(-16000); });
    encoderProcess.on('error', error => { encoderError = error; });
    encoderProcess.stdin.on('error', error => { encoderError = error; });
    const finished = new Promise(resolveDone => encoderProcess.on('close', code => resolveDone(code)));
    for (let i = 0; i < scenes.length; i++) {
      onPhase('rendering', i + 1, scenes.length);
      runtime = await launchCamera({ config: resolvedScenes[i], intensity: 1 });
      for (let n = 0; n < counts[i]; n++) {
        if (encoderError) throw new Error(`FFmpeg failed: ${encoderError.message}\n${diagnostics}`);
        const png = await runtime.page.evaluate(({ seconds, width, height }) => {
          window.cameraStudio.renderTime(seconds);
          const source = document.querySelector('canvas');
          if (!source) throw new Error('Scene renderer canvas missing');
          const output = document.createElement('canvas'); output.width = width; output.height = height;
          const context = output.getContext('2d');
          const scale = Math.max(width / source.width, height / source.height);
          context.fillStyle = '#000'; context.fillRect(0, 0, width, height);
          context.drawImage(source, (width - source.width * scale) / 2, (height - source.height * scale) / 2, source.width * scale, source.height * scale);
          return output.toDataURL('image/png');
        }, { seconds: Math.min(n / fps, resolvedScenes[i].totalFrames / resolvedScenes[i].fps), width, height });
        await new Promise((resolveWrite, reject) => encoderProcess.stdin.write(Buffer.from(png.split(',')[1], 'base64'), error => error ? reject(error) : resolveWrite()));
      }
      if (runtime.errors.length) throw new Error(runtime.errors.join('\n'));
      await runtime.close(); runtime = undefined;
    }
    onPhase('encoding');
    encoderProcess.stdin.end();
    const exitCode = await finished;
    if (exitCode !== 0 || encoderError) throw new Error(`FFmpeg exited with code ${exitCode}: ${diagnostics || encoderError?.message}`);
    onPhase('verifying');
    const probe = spawnSync(ffprobe, ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_name,width,height,avg_frame_rate,nb_read_frames:format=duration', '-of', 'json', temporary], { encoding: 'utf8' });
    if (probe.status !== 0) throw new Error(`FFprobe verification failed: ${probe.stderr}`);
    const metadata = JSON.parse(probe.stdout), stream = metadata.streams[0], frames = counts.reduce((a, b) => a + b, 0);
    if (stream.codec_name !== 'h264' || stream.width !== width || stream.height !== height || stream.avg_frame_rate !== '60/1' || Number(stream.nb_read_frames) !== frames || Math.abs(Number(metadata.format.duration) - frames / fps) > 0.001) throw new Error('Encoded MP4 metadata does not match required dimensions, frame rate or duration');
    await rename(temporary, destination);
    onPhase('ready');
    return { output: destination, metadata, frames, duration: frames / fps };
  } finally { if (encoderProcess && encoderProcess.exitCode === null) encoderProcess.kill(); if (runtime) await runtime.close(); await rm(temporary, { force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [inputPath, mode = 'all', sceneId, output] = process.argv.slice(2);
  if (!inputPath) throw new Error('Usage: node scripts/export-story-video.mjs project.json [current|all] [scene-id] [output.mp4]');
  const data = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
  const result = await exportStoryVideo({ project: data.project ?? data, sceneId: mode === 'current' ? sceneId : undefined, output });
  console.log(JSON.stringify(result, null, 2));
}
