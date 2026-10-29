import './style.css';
import { createCameraScene, type CameraScene } from './engine/camera-scene.ts';
import { CAMERA_PROOF } from './scenes/camera-proof.ts';
import type { CameraSceneConfig } from './camera/types.ts';

declare global {
  interface Window { __CAMERA_INPUT__?: { config: CameraSceneConfig; intensity?: number }; cameraStudio: ReturnType<typeof api> }
}
const params = new URLSearchParams(location.search), renderMode = params.has('render');
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const root = document.querySelector<HTMLDivElement>('#app')!;
const icon = (name: string) => ({ play: '▶', pause: 'Ⅱ', replay: '↺', full: '⛶', save: '↓' })[name] ?? name;
let scene: CameraScene, config = CAMERA_PROOF, frame = 0, playing = false, recording = false;
let playOrigin = 0, originFrame = 0, toastTimer = 0;
function timecode(f: number) {
  const seconds = Math.floor(f / config.fps);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}:${String(f % config.fps).padStart(2, '0')}`;
}
function toast(text: string) {
  if (renderMode) return;
  $('toast').textContent = text; $('toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => $('toast').classList.remove('visible'), 6000);
}
function updateUI() {
  if (renderMode) return;
  $<HTMLInputElement>('scrub').value = String(frame);
  $('current').textContent = timecode(frame);
  $('duration-label').textContent = ` / ${timecode(config.totalFrames - 1)}`;
  $('format-label').textContent = `${config.width} × ${config.height} · ${config.fps} FPS`;
  $<HTMLInputElement>('scrub').max = String(config.totalFrames - 1);
  const amount = scene.getState().intensity;
  $<HTMLInputElement>('motion').value = String(Math.round(amount * 100));
  $('motion-value').textContent = `${Math.round(amount * 100)}%`;
  $('frame-label').textContent = `FRAME ${frame} / ${config.totalFrames - 1}`;
  $('scrub').style.setProperty('--progress', `${frame / (config.totalFrames - 1) * 100}%`);
  $('play').textContent = icon(playing ? 'pause' : 'play');
  $('play').setAttribute('aria-label', playing ? 'Pause scene' : 'Play scene');
}
function seek(index: number) {
  scene.renderFrame(index); frame = index;
  if (playing) { originFrame = frame; playOrigin = performance.now(); }
  updateUI();
}
function setPlaying(value: boolean) {
  playing = value; originFrame = frame; playOrigin = performance.now(); updateUI();
}
function loop(now: number) {
  if (playing && !recording) {
    const next = Math.min(config.totalFrames - 1, originFrame + Math.floor((now - playOrigin) * config.fps / 1000));
    if (next !== frame) { scene.renderFrame(next); frame = next; updateUI(); }
    if (frame === config.totalFrames - 1) setPlaying(false);
  }
  requestAnimationFrame(loop);
}
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function api() {
  return {
    ready: true, renderFrame: (index: number) => { setPlaying(false); seek(index); },
    capture: (png = true) => scene.capture(png),
    getState: () => ({ ...scene.getState(), playing }),
    setIntensity: (value: number) => { scene.setIntensity(value); updateUI(); },
    setConfig: (input: CameraSceneConfig) => { scene.setConfig(input); config = scene.getState().config; frame = Math.min(frame, config.totalFrames - 1); updateUI(); },
  };
}
async function webmPreview() {
  if (!('MediaRecorder' in window)) { toast('Recording unavailable. Use the frame-perfect PNG/MP4 CLI.'); return; }
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
  if (!mimeType) { toast('WebM recording unavailable in this browser.'); return; }
  const saved = { frame, playing }; let stream: MediaStream | undefined;
  recording = true; setPlaying(false);
  document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button,input').forEach(el => el.disabled = true);
  $('reference').hidden = true;
  try {
    seek(0);
    const surface = document.createElement('canvas'); surface.width = config.width; surface.height = config.height;
    const context = surface.getContext('2d'); if (!context) throw new Error('Preview capture context unavailable');
    const paint = () => { context.fillStyle = '#ff00ff'; context.fillRect(0, 0, surface.width, surface.height); context.drawImage(scene.app.canvas, 0, 0); };
    paint(); stream = surface.captureStream(config.fps);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise<void>((resolve, reject) => { recorder.onstop = () => resolve(); recorder.onerror = () => reject(new Error('Recorder failed')); });
    recorder.start(); const start = performance.now();
    toast('Real-time WebM preview only. Keep this tab visible; frames may drop.');
    const draw = (now: number) => {
      const elapsed = (now - start) / 1000;
      seek(Math.min(config.totalFrames - 1, Math.floor(elapsed * config.fps))); paint();
      if (elapsed < config.totalFrames / config.fps && recorder.state === 'recording') requestAnimationFrame(draw);
      else if (recorder.state === 'recording') recorder.stop();
    };
    requestAnimationFrame(draw); await stopped;
    download(new Blob(chunks, { type: mimeType }), `${config.id}-preview.webm`);
  } catch (error) { toast(`Preview export failed: ${String(error)}`); }
  finally {
    stream?.getTracks().forEach(t => t.stop()); recording = false;
    document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button,input').forEach(el => el.disabled = false);
    seek(saved.frame); setPlaying(saved.playing);
    $('compare').setAttribute('aria-pressed', 'false'); $('compare').textContent = 'View original ↗';
  }
}
function markup() {
  root.innerHTML = `
  <header class="topbar"><a class="brand" href="/"><span class="brand-mark">v.</span> VINNY<span class="brand-divider"></span><span class="brand-sub">CAMERA CORE · PHASE 1</span></a><span class="project-state"><i></i> CAMERA ONLY</span></header>
  <main><section class="heading"><div><p class="eyebrow">A REUSABLE STORY CAMERA</p><h1>One frame. Every time<span>.</span></h1><p class="intro">Registered layers. Deterministic tracks. No effects or character motion.</p></div><div class="scene-number">01<span>CORE PROOF</span></div></section>
  <div class="workspace"><section class="screen-column" aria-label="Camera preview and playback">
  <div class="viewer" id="viewer"><div id="canvas-host"></div><img class="reference" id="reference" src="/assets/scene-01-normalized/reference.png" alt="Original composition before camera framing" hidden><div class="loading" id="loading">Opening camera-only scene…</div><div class="viewer-badge">CAMERA CORE <span>•</span> NO EFFECTS</div><button class="compare" id="compare" aria-pressed="false">View original ↗</button></div>
  <div class="transport"><button class="play icon-button" id="play" aria-label="Play scene">▶</button><button class="icon-button" id="replay" aria-label="Restart scene">↺</button><span class="time"><span id="current">00:00:00</span><span class="muted" id="duration-label"> / ${timecode(config.totalFrames - 1)}</span></span><span class="transport-spacer"></span><span class="format" id="format-label">${config.width} × ${config.height} · ${config.fps} FPS</span><button class="icon-button" id="fullscreen" aria-label="Fullscreen preview">⛶</button></div>
  <div class="timeline"><label class="sr-only" for="scrub">Frame index</label><input id="scrub" type="range" min="0" max="${config.totalFrames - 1}" step="1" value="0"><div class="ticks"><span>0</span><span id="frame-label">FRAME 0</span><span>${config.totalFrames - 1}</span></div></div>
  <div class="beats"><button class="beat" data-frame="0"><span class="beat-index">01</span><span><strong>Baseline</strong><small>Neutral camera + headroom</small></span></button><button class="beat" data-frame="120"><span class="beat-index">02</span><span><strong>Inspect 120</strong><small>Repeatable frame sample</small></span></button><button class="beat" data-frame="360"><span class="beat-index">03</span><span><strong>Inspect 360</strong><small>Depth-weighted core proof</small></span></button><button class="beat" data-frame="575"><span class="beat-index">04</span><span><strong>Final hold</strong><small>No fade or transition</small></span></button></div>
  <div class="below-preview"><span>MASTER: NUMBERED PNGs → H.264 · WEBM IS PREVIEW ONLY</span><button class="text-button" id="save-frame">Save frame PNG ↓</button></div>
  </section><aside class="inspector"><div class="panel-title"><span>Camera core proof</span><span class="small-tag">2.5D</span></div><h2>Camera, not<br>decoration.</h2><p class="scene-description">A small depth push and translation to exercise the core. Not the hero edit or Camera Lab.</p>
  <div class="section-label">REGISTERED LAYERS <span>DEPTH 0–1</span></div><div class="layers">${[...config.layers].reverse().map(l => `<div class="layer"><span class="layer-thumbnail" style="background-image:url('${l.asset}')"></span><span>${l.name}</span><input type="number" data-depth="${l.id}" min="0" max="1" step="0.05" value="${l.depth}" aria-label="${l.name} depth"><input type="checkbox" data-layer="${l.id}" checked aria-label="Show ${l.name}"></div>`).join('')}</div>
  <div class="section-label motion-heading"><label for="motion">TRACK INTENSITY</label><output id="motion-value">100%</output></div><input id="motion" type="range" min="0" max="100" step="1" value="100"><div class="range-labels"><span>No-op</span><span>Authored maximum</span></div>
  <div class="camera-diagnostics"><button id="check-coverage" class="text-button">Check this frame’s coverage ↗</button><p id="coverage-status" role="status">Magenta means uncovered pixels. Never hidden.</p><p>Base headroom: 1.15 · Roll limit: ±3°</p><button class="text-button" id="save-config">Save camera config ↓</button></div>
  <button class="export-button" id="export">↓ <span>Export preview</span><span class="export-format">WEBM</span></button><p class="export-note">Real-time preview; frames may drop.<br>Use the PNG/MP4 CLI for the master.</p></aside></div>
  <footer><span>FRAME-INDEXED · TRACK-DRIVEN · PIXIJS</span><span>No clock inside camera state.</span></footer></main><div class="toast" id="toast" role="status" aria-live="polite"></div>`;
}
async function init() {
  document.body.classList.add('camera-only');
  if (window.__CAMERA_INPUT__) config = window.__CAMERA_INPUT__.config;
  if (renderMode) { document.body.classList.add('render-mode'); root.innerHTML = '<div id="canvas-host"></div>'; }
  else markup();
  scene = await createCameraScene($('canvas-host'), config); config = scene.getState().config;
  scene.setIntensity(window.__CAMERA_INPUT__?.intensity ?? 1);
  window.cameraStudio = api();
  if (renderMode) return;
  $('loading').remove(); updateUI();
  $('play').onclick = () => { if (frame === config.totalFrames - 1) seek(0); setPlaying(!playing); };
  $('replay').onclick = () => { seek(0); setPlaying(true); };
  $('scrub').oninput = e => seek(Number((e.target as HTMLInputElement).value));
  document.querySelectorAll<HTMLButtonElement>('[data-frame]').forEach(el => el.onclick = () => seek(Math.min(config.totalFrames - 1, Number(el.dataset.frame))));
  $('motion').oninput = e => {
    const intensity = Number((e.target as HTMLInputElement).value) / 100;
    scene.setIntensity(intensity); $('motion-value').textContent = `${Math.round(intensity * 100)}%`;
  };
  document.querySelectorAll<HTMLInputElement>('[data-depth]').forEach(el => el.onchange = () => {
    try {
      const next = scene.getState().config;
      next.layers.find(l => l.id === el.dataset.depth)!.depth = Number(el.value);
      scene.setConfig(next); config = scene.getState().config;
      el.value = String(config.layers.find(l => l.id === el.dataset.depth)!.depth);
    } catch (error) { toast(String(error)); }
  });
  document.querySelectorAll<HTMLInputElement>('[data-layer]').forEach(el => el.onchange = () => scene.setVisible(el.dataset.layer!, el.checked));
  $('check-coverage').onclick = () => {
    const coverage = scene.capture(false).coverage;
    $('coverage-status').textContent = coverage.uncoveredPixels ? `FAIL: ${coverage.uncoveredPixels} uncovered pixels at frame ${frame}.` : `PASS: frame ${frame} fully covered. Other frames not tested.`;
  };
  $('save-frame').onclick = () => {
    const result = scene.capture();
    void fetch(result.png!).then(r => r.blob()).then(blob => download(blob, `${config.id}-${String(frame).padStart(4, '0')}.png`));
    if (result.coverage.uncoveredPixels) toast('Warning: this diagnostic PNG contains uncovered magenta pixels.');
  };
  $('save-config').onclick = () => {
    const snapshot = scene.getState();
    if (Object.values(snapshot.visible).some(visible => !visible)) { toast('Restore all layers before saving a master camera configuration. Visibility toggles are diagnostic only.'); return; }
    download(new Blob([JSON.stringify({ config: snapshot.config, intensity: snapshot.intensity }, null, 2)], { type: 'application/json' }), `${config.id}.json`);
  };
  $('compare').onclick = () => {
    const image = $<HTMLImageElement>('reference'); image.hidden = !image.hidden;
    $('compare').setAttribute('aria-pressed', String(!image.hidden));
    $('compare').textContent = image.hidden ? 'View original ↗' : 'Back to camera ↗';
  };
  $('fullscreen').onclick = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('viewer').requestFullscreen(); }
    catch { toast('Fullscreen unavailable.'); }
  };
  $('export').onclick = () => void webmPreview();
  document.addEventListener('keydown', e => {
    if ((e.target as HTMLElement).matches('input,button,a') || recording) return;
    if (e.code === 'Space') { e.preventDefault(); $('play').click(); }
    if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
      e.preventDefault(); seek(Math.max(0, Math.min(config.totalFrames - 1, frame + (e.code === 'ArrowRight' ? 1 : -1))));
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !recording) setPlaying(false); });
  requestAnimationFrame(loop);
}
init().catch(error => {
  console.error(error); const target = document.getElementById('loading') ?? root;
  target.textContent = `Camera initialization failed: ${String(error)}`;
});
