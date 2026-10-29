// Read-only runtime audit. Does not change the application or camera implementation.
import { launch, projectRoot } from './runtime.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const frames = [0, 60, 120, 143, 240, 360, 383, 480, 527, 575];
const out = resolve(projectRoot, 'output/camera-phase0');
await mkdir(out, { recursive: true });
const runtime = await launch();
const errors = [];
const sha = data => createHash('sha256').update(data).digest('hex');
try {
  const page = await runtime.browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(runtime.url + '/legacy.html?render=1');
  await page.waitForFunction(() => window.story?.ready);
  for (const frame of frames) {
    const data = await page.evaluate(frame => {
      window.story.renderAt(frame / 24);
      return document.querySelector('canvas').toDataURL('image/png').split(',')[1];
    }, frame);
    await writeFile(resolve(out, `current-${String(frame).padStart(3, '0')}.png`), Buffer.from(data, 'base64'));
  }
  const report = { frames, errors, checks: {}, states: [] };
  // Use the existing scene factory in a second isolated host. No implementation edits.
  await page.evaluate(async () => {
    const { createScene } = await import('/src/engine/scene.ts');
    const host = document.createElement('div'); document.body.appendChild(host);
    window.auditScene = await createScene(host);
  });
  const render = async frame => Buffer.from(await page.evaluate(frame => {
    const s = window.auditScene; s.renderAt(frame / 24);
    return s.app.canvas.toDataURL('image/png').split(',')[1];
  }, frame), 'base64');
  const a = await render(120); await render(500); const b = await render(120);
  report.checks.frame120 = { first: sha(a), repeated: sha(b), equal: a.equals(b) };
  const direct = await render(500);
  const sequential = await page.evaluate(() => {
    const s = window.auditScene;
    const original = s.app.renderer.render;
    // Evaluate every intermediate state without GPU submission; render the final state.
    s.app.renderer.render = () => {};
    try { for (let f = 0; f <= 500; f++) s.renderAt(f / 24); }
    finally { s.app.renderer.render = original; }
    s.app.renderer.render({ container: s.app.stage });
    return s.app.canvas.toDataURL('image/png').split(',')[1];
  });
  const seq = Buffer.from(sequential, 'base64');
  report.checks.seek500 = { direct: sha(direct), sequentialStateEvaluation: sha(seq), equal: direct.equals(seq),
    limitation: 'Intermediate state evaluations skipped GPU submission; this is not a full sequential video playback test.' };
  await page.evaluate(() => { window.auditScene.options.motion = 0; });
  const zeroA = await render(120), zeroB = await render(143);
  report.checks.zeroIntensityFullScene = { frame120: sha(zeroA), frame143: sha(zeroB), equal: zeroA.equals(zeroB) };
  const zeroTransforms = await page.evaluate(() => {
    const s = window.auditScene;
    const snapshot = f => { s.renderAt(f / 24); return s.app.stage.children[0].children[0].children.map(p => ({ x:p.x,y:p.y,sx:p.scale.x,sy:p.scale.y,roll:p.rotation })); };
    return { a: snapshot(120), b: snapshot(500) };
  });
  report.checks.zeroIntensityTransforms = { equal: JSON.stringify(zeroTransforms.a) === JSON.stringify(zeroTransforms.b), scale: zeroTransforms.a[0].sx };
  // Remove all existing post-layer overlays from this diagnostic instance only.
  // Character breathing and fern sway remain: they are currently inseparable from motion.
  await page.evaluate(() => {
    const s = window.auditScene; s.options.motion = 0.65;
    s.app.renderer.background.color = '#ff00ff';
    const root = s.app.stage.children[0];
    root.children.slice(1).forEach(c => c.visible = false);
  });
  for (const frame of frames) {
    const data = await render(frame);
    await writeFile(resolve(out, `isolated-${String(frame).padStart(3, '0')}.png`), data);
    const state = await page.evaluate(frame => {
      const s = window.auditScene;
      return { frame, time: s.time, layers: s.app.stage.children[0].children[0].children.map(p => ({ x:p.x,y:p.y,sx:p.scale.x,sy:p.scale.y,roll:p.rotation })) };
    }, frame);
    report.states.push(state);
  }
  // Transform-only sweep: useful motion diagnostics, NOT an all-frame gap raster test.
  report.transformSweep = await page.evaluate(() => {
    const s = window.auditScene; const original = s.app.renderer.render; s.app.renderer.render = () => {};
    const states=[];
    try { for (let f=0;f<576;f++) { s.renderAt(f/24); states.push(s.app.stage.children[0].children[0].children.map(p=>({x:p.x,y:p.y,sx:p.scale.x,sy:p.scale.y,roll:p.rotation}))); } }
    finally { s.app.renderer.render = original; }
    return states;
  });
  await writeFile(resolve(out, 'measurements.json'), JSON.stringify(report, null, 2));
  console.log('PHASE0 AUDIT CAPTURE COMPLETE: ' + out);
} finally { await runtime.close(); }
