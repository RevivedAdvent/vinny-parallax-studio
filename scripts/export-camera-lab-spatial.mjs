import { spawnSync } from 'node:child_process';
import { readFile, access, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { projectRoot } from './runtime.mjs';
import { LAB_SPATIAL_PRESETS } from '../src/scenes/camera-lab-spatial.ts';

const dir = resolve(projectRoot, 'output/camera-lab-spatial');
const report = JSON.parse(await readFile(resolve(dir, 'lab-report.json'), 'utf8'));
assert.equal(report.complete, true, 'Render the basic tier before encoding');
assert.equal(report.pass, true, 'A failed tier must not be encoded');
assert.equal(report.presets.length, LAB_SPATIAL_PRESETS.length);

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
const encoders = spawnSync(ffmpeg, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
if (encoders.status !== 0) throw new Error('FFmpeg unavailable');
const encoder = encoders.stdout.includes('libx264') ? 'libx264'
  : encoders.stdout.includes('libopenh264') ? 'libopenh264' : null;
if (!encoder) throw new Error('FFmpeg needs libx264 or libopenh264');
if (spawnSync(ffprobe, ['-version']).status !== 0) throw new Error('FFprobe unavailable');

for (const preset of LAB_SPATIAL_PRESETS) {
  const mp4 = resolve(dir, `${preset.id}.mp4`);
  const partial = resolve(dir, `${preset.id}.partial.mp4`);
  for (const file of [mp4, partial]) {
    try { await access(file); throw new Error('Refusing to overwrite ' + file); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  const quality = encoder === 'libx264' ? ['-preset', 'medium', '-crf', '18'] : ['-b:v', '12M'];
  const args = ['-hide_banner', '-loglevel', 'error', '-n', '-framerate', '24',
    '-start_number', '0', '-i', resolve(dir, preset.id, 'frames', `${preset.id}-%04d.png`),
    '-frames:v', '72', '-an', '-c:v', encoder, ...quality, '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', partial];
  const encoded = spawnSync(ffmpeg, args, { stdio: 'inherit' });
  if (encoded.status !== 0) throw new Error(`FFmpeg failed for ${preset.id}`);
  const probe = spawnSync(ffprobe, ['-v', 'error', '-count_frames',
    '-show_entries', 'stream=codec_name,width,height,avg_frame_rate,nb_read_frames:format=duration',
    '-of', 'json', partial], { encoding: 'utf8' });
  if (probe.status !== 0) throw new Error('Cannot verify ' + preset.id);
  const metadata = JSON.parse(probe.stdout);
  const video = metadata.streams[0];
  assert.equal(video.codec_name, 'h264');
  assert.equal(video.width, 1920); assert.equal(video.height, 1080);
  assert.equal(Number(video.nb_read_frames), 72);
  assert.equal(video.avg_frame_rate, '24/1');
  assert.ok(Math.abs(Number(metadata.format.duration) - 3) < 0.001);
  await mkdir(dir, { recursive: true });
  const { rename } = await import('node:fs/promises');
  await rename(partial, mp4);
  console.log(`ENCODED ${preset.id}.mp4: 72 frames, 3.000s, H.264 ${video.width}x${video.height}.`);
}
console.log('CAMERA LAB BASIC ENCODE COMPLETE.');
