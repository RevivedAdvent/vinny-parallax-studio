import { spawn, spawnSync } from 'node:child_process';
import { readFile, access, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { renderFrames } from './render-frames.mjs';
import { option, outputPath, readInput } from './camera-runtime.mjs';
import { validateScene } from '../src/camera/validate.ts';

const args=process.argv.slice(2);
const output=outputPath(args[0]&&!args[0].startsWith('--')?args[0]:'output/camera-phase1/camera-core.mp4');
if (!output.endsWith('.mp4')) throw new Error('Output must end in .mp4');
const temp=output.slice(0,-4)+'.partial.mp4';
for (const file of [output,temp]) {
  try { await access(file); throw new Error('Refusing to overwrite '+file); }
  catch(e) { if(e.code!=='ENOENT') throw e; }
}
const ffmpeg=process.env.FFMPEG_PATH||'ffmpeg', ffprobe=process.env.FFPROBE_PATH||'ffprobe';
const encoders=spawnSync(ffmpeg,['-hide_banner','-encoders'],{encoding:'utf8'});
if(encoders.status!==0) throw new Error('FFmpeg unavailable; set FFMPEG_PATH if necessary');
const encoder=encoders.stdout.includes('libx264')?'libx264':encoders.stdout.includes('libopenh264')?'libopenh264':null;
if(!encoder) throw new Error('FFmpeg needs libx264 or libopenh264');
if(spawnSync(ffprobe,['-version']).status!==0) throw new Error('FFprobe unavailable; set FFPROBE_PATH if necessary');
const framesArgument=option(args,'--frames');
const dir=framesArgument?outputPath(framesArgument):resolve(dirname(output),basename(output,'.mp4')+'-frames');
if(!framesArgument) await renderFrames({dir,input:await readInput(option(args,'--config'))});
else if(option(args,'--config')) throw new Error('With --frames the recorded manifest is authoritative; do not also pass --config');
const manifest=JSON.parse(await readFile(resolve(dir,'manifest.json'),'utf8'));
const config=validateScene(manifest.config);
if(!manifest.complete||manifest.frames.length!==config.totalFrames) throw new Error('Incomplete frame sequence');
for(let i=0;i<config.totalFrames;i++) {
  const record=manifest.frames[i], expected=`${String(i).padStart(4,'0')}.png`;
  if(record.frame!==i||record.filename!==expected||record.coverage.uncoveredPixels!==0) throw new Error('Invalid or uncovered frame '+i);
  const png=await readFile(resolve(dir,'frames',expected));
  if(createHash('sha256').update(png).digest('hex')!==record.sha256) throw new Error('Frame hash mismatch '+i);
  if(png.readUInt32BE(16)!==config.width||png.readUInt32BE(20)!==config.height) throw new Error('Frame dimension mismatch '+i);
}
await mkdir(dirname(output),{recursive:true});
const quality=encoder==='libx264'?['-preset','medium','-crf','18']:['-b:v','12M'];
console.log(`Encoding ${config.totalFrames} verified PNGs with ${encoder}`);
const processFF=spawn(ffmpeg,['-hide_banner','-loglevel','error','-n','-framerate',String(config.fps),
  '-start_number','0','-i',resolve(dir,'frames','%04d.png'),'-frames:v',String(config.totalFrames),
  '-an','-c:v',encoder,...quality,'-pix_fmt','yuv420p','-movflags','+faststart',temp],{stdio:'inherit'});
await new Promise((res,rej)=>{processFF.on('error',rej);processFF.on('close',code=>code===0?res():rej(new Error('FFmpeg exit '+code)));});
const probe=spawnSync(ffprobe,['-v','error','-count_frames','-show_entries','stream=codec_name,width,height,avg_frame_rate,nb_read_frames:format=duration','-of','json',temp],{encoding:'utf8'});
if(probe.status!==0) throw new Error('Cannot verify encoded MP4: '+probe.stderr);
const metadata=JSON.parse(probe.stdout), video=metadata.streams[0];
if(video.codec_name!=='h264'||video.width!==config.width||video.height!==config.height||
  Number(video.nb_read_frames)!==config.totalFrames||video.avg_frame_rate!==`${config.fps}/1`||
  Math.abs(Number(metadata.format.duration)-config.totalFrames/config.fps)>0.001) throw new Error('Encoded MP4 does not match scene timing/dimensions');
await rename(temp,output);
console.log('MP4 EXPORT COMPLETE: '+output+'\n'+JSON.stringify(metadata));
