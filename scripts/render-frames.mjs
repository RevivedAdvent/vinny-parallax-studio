import { launchCamera, readInput, option, outputPath } from './camera-runtime.mjs';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const decode = data => Buffer.from(data.split(',')[1], 'base64');
const samples = new Set([0,60,120,143,240,360,383,480,527,575]);
export async function renderFrames({ dir, input, singleFrame }) {
  await mkdir(dir, { recursive: true });
  const marker = resolve(dir, singleFrame === undefined ? 'manifest.json' : `frame-${singleFrame}.json`);
  try { await access(marker); throw new Error('Output already exists: ' + marker); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const manifest = { complete:false, config:input.config, intensity:input.intensity,
    configHash:hash(JSON.stringify(input)), checks:{}, frames:[], samples:[...samples] };
  // Reserve output before launching Chromium; failed runs are never mistaken for completed ones.
  await writeFile(marker, JSON.stringify(manifest,null,2));
  const runtime = await launchCamera(input);
  const { page } = runtime;
  const shot = async f => page.evaluate(f => {
    window.cameraStudio.renderFrame(f);
    return { ...window.cameraStudio.capture(), transforms:window.cameraStudio.getState().transforms };
  }, f);
  try {
    if (singleFrame === undefined) {
      const repeatedFrame = Math.min(120,input.config.totalFrames-1);
      const first = await shot(repeatedFrame); await shot(input.config.totalFrames-1); const second = await shot(repeatedFrame);
      assert.equal(first.png,second.png,'Repeated PNG must match exactly');
      manifest.checks.repeatedFrame = { frame:repeatedFrame, equal:true, hash:hash(decode(first.png)) };
      const comparisonFrame = Math.min(500,input.config.totalFrames-1);
      const direct = await shot(comparisonFrame);
      manifest.checks.directFrame = { frame:comparisonFrame, hash:hash(decode(direct.png)) };
      await page.evaluate(()=>window.cameraStudio.setIntensity(0));
      const zeroA=await shot(repeatedFrame), zeroB=await shot(comparisonFrame);
      assert.equal(zeroA.png,zeroB.png,'Intensity zero must be static');
      const noTracks=structuredClone(input.config); noTracks.tracks=[];
      await page.evaluate(config=>window.cameraStudio.setConfig(config),noTracks);
      const baseline=await shot(repeatedFrame);
      assert.equal(zeroA.png,baseline.png,'Zero intensity must equal no-track baseline');
      manifest.checks.zeroIntensity={ equal:true, hash:hash(decode(zeroA.png)) };
      // Known-failing uniform underscan: prove the detector catches fully/partly exposed pixels.
      const unsafe=structuredClone(input.config); unsafe.camera.baseZoom=1;
      unsafe.camera.limits.zoom={min:0.9,max:1.18};
      unsafe.tracks=[{id:'coverage-negative-control',target:'camera',property:'zoom',projection:'uniform',
        startFrame:0,endFrame:0,startValue:0.9,endValue:0.9,easing:'hold',intensity:1,limits:{min:0.9,max:1}}];
      await page.evaluate(config=>{window.cameraStudio.setConfig(config);window.cameraStudio.setIntensity(1);},unsafe);
      const negative=await shot(0);
      assert.ok(negative.coverage.uncoveredPixels>0,'Negative coverage control must fail');
      await writeFile(resolve(dir,'coverage-negative-control.png'),decode(negative.png));
      manifest.checks.coverageNegativeControl={ detected:true, ...negative.coverage };
      await page.evaluate(input=>{window.cameraStudio.setConfig(input.config);window.cameraStudio.setIntensity(input.intensity);},input);
    }
    await mkdir(resolve(dir,'frames'),{recursive:true});
    const indexes=singleFrame===undefined ? Array.from({length:input.config.totalFrames},(_,f)=>f) : [singleFrame];
    for (const frame of indexes) {
      const result=await shot(frame), png=decode(result.png), filename=`${String(frame).padStart(4,'0')}.png`;
      await writeFile(resolve(dir,'frames',filename),png);
      manifest.frames.push({ frame, filename, sha256:hash(png), coverage:result.coverage, transforms:result.transforms });
      if (result.coverage.uncoveredPixels) {
        await writeFile(resolve(dir,`GAP-FAIL-frame-${frame}.png`),png);
        throw new Error(`GAP FAIL at frame ${frame}: ${result.coverage.uncoveredPixels} uncovered pixels; bounds ${JSON.stringify(result.coverage.bounds)}. No automatic crop applied. Proposed fixes: reduce camera limits, approve more base headroom, or provide overscan/clean plates.`);
      }
      if (singleFrame===undefined && frame===manifest.checks.directFrame.frame) {
        assert.equal(hash(png),manifest.checks.directFrame.hash,'Sequentially rendered frame must equal direct seek');
        manifest.checks.sequentialRenderedFrame={frame,equal:true,hash:hash(png),intermediateFramesRendered:true};
      }
      if (frame%input.config.fps===0) console.log(`Rendering PNG ${frame}/${input.config.totalFrames-1}`);
    }
    assert.equal(runtime.errors.length,0,runtime.errors.join('\n'));
    manifest.complete=true; manifest.browserErrors=runtime.errors;
    await writeFile(marker,JSON.stringify(manifest,null,2));
    console.log(`PNG RENDER COMPLETE: ${manifest.frames.length} frame(s), zero uncovered pixels. ${dir}`);
    return manifest;
  } catch (error) {
    manifest.failure=String(error); await writeFile(marker,JSON.stringify(manifest,null,2)); throw error;
  } finally { await runtime.close(); }
}

if (import.meta.url===pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2), input=await readInput(option(args,'--config'));
  const value=option(args,'--frame'), singleFrame=value===undefined?undefined:Number(value);
  if (singleFrame!==undefined && (!Number.isInteger(singleFrame)||singleFrame<0||singleFrame>=input.config.totalFrames)) throw new Error('Invalid --frame index');
  await renderFrames({dir:outputPath(option(args,'--dir')??'output/camera-phase1'),input,singleFrame});
}
