import './style.css';
import { createScene, type StoryScene } from './engine/scene';
import { Ambience } from './engine/ambience';
import { SCENE, CHAPTERS } from './scenes/arrival';

const icons = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m8 5 11 7-11 7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>',
  replay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/></svg>',
  expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/></svg>',
};
const params = new URLSearchParams(location.search);
const renderMode = params.has('render');
const root = document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML = renderMode ? '<div id="canvas-host"></div>' : `
  <header class="topbar"><a class="brand" href="/" aria-label="Vinny studio home"><span class="brand-mark">v.</span> VINNY<span class="brand-divider"></span><span class="brand-sub">A STORY IN MOTION</span></a><span class="project-state"><i></i> SCENE 01 <span class="muted">/ 01</span></span></header>
  <main>
    <section class="heading"><div><p class="eyebrow">THE CHRONICLES OF COUNT VINNY</p><h1>A world before his time<span>.</span></h1><p class="intro">An immortal. An impossible landing. A very different kind of jungle.</p></div><div class="scene-number">01<span>THE ARRIVAL</span></div></section>
    <div class="workspace">
      <section class="screen-column" aria-label="Scene preview and playback">
        <div class="viewer" id="viewer"><div id="canvas-host"></div><img class="reference" id="reference" src="/assets/scene-01/reference.png" alt="Original unanimated composition" hidden><div class="loading" id="loading"><span class="loader"></span>Opening the jungle…</div><div class="viewer-badge">SCENE 01 <span>•</span> THE ARRIVAL</div><button class="compare" id="compare" aria-pressed="false">View original ↗</button></div>
        <div class="transport"><button class="play icon-button" id="play" aria-label="Play scene">${icons.play}</button><button class="icon-button" id="replay" aria-label="Restart scene">${icons.replay}</button><span class="time"><span id="current">00:00</span><span class="muted"> / 00:24</span></span><span class="transport-spacer"></span><span class="format">1080p <span>·</span> 24 FPS</span><button class="icon-button" id="fullscreen" aria-label="Fullscreen preview">${icons.expand}</button></div>
        <div class="timeline"><label class="sr-only" for="scrub">Scene position in seconds</label><input type="range" id="scrub" min="0" max="24" step="0.01" value="0"><div class="ticks"><span>00:00</span><span>00:06</span><span>00:12</span><span>00:18</span><span>00:24</span></div></div>
        <div class="beats">${CHAPTERS.map((c, i) => `<button class="beat" data-time="${c.time}"><span class="beat-index">0${i + 1}</span><span><strong>${c.label}</strong><small>${c.detail}</small></span><span class="beat-dot"></span></button>`).join('')}</div>
        <div class="below-preview"><span><i class="small-dot"></i> FOUR LAYERS. ONE LITTLE LEAP THROUGH TIME.</span><button class="text-button" id="save-frame">Save still ${icons.download}</button></div>
      </section>
      <aside class="inspector"><div class="panel-title"><span>Scene notes</span><span class="small-tag">2.5D</span></div><h2>Welcome to the<br>wrong century.</h2><p class="scene-description">Vinny expected a fresh start. The prehistoric jungle had other plans.</p>
        <div class="section-label">THE COMPOSITION <span>04 LAYERS</span></div>
        <div class="layers">${[...SCENE.layers].reverse().map((l, i) => `<label class="layer"><span class="layer-thumbnail" style="background-image:url('/assets/scene-01/${l.file}')"></span><span>${l.name}<small>${['NEAR FIELD','SUBJECT','MIDGROUND','BACKGROUND'][i]}</small></span><input type="checkbox" data-layer="${l.id}" checked aria-label="Show ${l.name}"></label>`).join('')}</div>
        <div class="section-label motion-heading"><label for="motion">CAMERA MOVEMENT</label><output id="motion-value">65%</output></div><input type="range" id="motion" min="0" max="100" value="65"><div class="range-labels"><span>Still</span><span>Cinematic</span></div>
        <div class="switches"><label>Atmosphere <input type="checkbox" id="atmosphere" checked role="switch"></label><label>Story captions <input type="checkbox" id="captions" checked role="switch"></label><label>Ambient sound <input type="checkbox" id="sound" role="switch"></label></div>
        <button class="export-button" id="export">${icons.download}<span>Export scene</span><span class="export-format">WEBM</span></button><p class="export-note">24 seconds · 1920 × 1080 · silent video<br>MP4 export available via the project CLI.</p>
      </aside>
    </div>
    <footer><span>MADE FROM LAYERS. BROUGHT TO LIFE WITH PIXIJS.</span><span>A small story about finding where you belong.</span></footer>
  </main><div class="toast" id="toast" role="status" aria-live="polite"></div>`;
if (renderMode) document.body.classList.add('render-mode');

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const ambience = new Ambience();
let scene: StoryScene;
let time = 0, playing = false, recording = false, last = 0;
let toastTimer = 0;
function toast(message: string) {
  $('toast').textContent = message; $('toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => $('toast').classList.remove('visible'), 5000);
}
function updateUI() {
  if (renderMode) return;
  $<HTMLInputElement>('scrub').value = String(time);
  $('current').textContent = `00:${String(Math.floor(time)).padStart(2, '0')}`;
  $('play').innerHTML = playing ? icons.pause : icons.play;
  $('play').setAttribute('aria-label', playing ? 'Pause scene' : 'Play scene');
  $('scrub').style.setProperty('--progress', `${time / SCENE.duration * 100}%`);
  document.querySelectorAll<HTMLButtonElement>('.beat').forEach((el, i) => {
    const active = time >= CHAPTERS[i].time && time < (CHAPTERS[i + 1]?.time ?? 25);
    el.classList.toggle('active', active); el.setAttribute('aria-current', String(active));
  });
}
function seek(t: number) { time = Math.max(0, Math.min(SCENE.duration, t)); scene.renderAt(time); updateUI(); }
function setPlaying(value: boolean) {
  playing = value; last = performance.now();
  void (playing ? ambience.resume() : ambience.pause()).catch(() => {});
  updateUI();
}
function loop(now: number) {
  if (playing && !recording) {
    time = Math.min(SCENE.duration, time + Math.min((now - last) / 1000, 0.1));
    if (time >= SCENE.duration) setPlaying(false);
    scene.renderAt(time); updateUI();
  }
  last = now; requestAnimationFrame(loop);
}
async function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = name; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function exportWebM() {
  if (!('MediaRecorder' in window)) { toast('This browser cannot record. Use npm run export:video for MP4.'); return; }
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
  if (!mimeType) { toast('WebM is unavailable. Use the MP4 command in README.md.'); return; }
  const previous = { time, playing };
  let stream: MediaStream | undefined;
  recording = true; setPlaying(false); seek(0);
  document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input').forEach(el => el.disabled = true);
  $('reference').hidden = true;
  try {
    stream = scene.app.canvas.captureStream(SCENE.fps);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve(); recorder.onerror = () => reject(new Error('Browser recording failed.'));
    });
    recorder.start();
    toast('Recording 24 seconds. Keep this tab visible.');
    const start = performance.now();
    const draw = (now: number) => {
      const t = Math.min((now - start) / 1000, SCENE.duration);
      seek(t); $('export').textContent = `Recording… ${Math.round(t / SCENE.duration * 100)}%`;
      if (t < SCENE.duration && recorder.state === 'recording') requestAnimationFrame(draw);
      else if (recorder.state === 'recording') recorder.stop();
    };
    requestAnimationFrame(draw);
    await stopped;
    await download(new Blob(chunks, { type: mimeType }), 'vinny-scene-01.webm');
    toast('Scene exported. For frame-perfect MP4, use the CLI exporter.');
  } catch (error) { toast(`Export failed: ${error instanceof Error ? error.message : error}`); }
  finally {
    stream?.getTracks().forEach(track => track.stop()); recording = false;
    document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input').forEach(el => el.disabled = false);
    $('export').innerHTML = `${icons.download}<span>Export scene</span><span class="export-format">WEBM</span>`;
    seek(previous.time); setPlaying(previous.playing);
    $('compare').setAttribute('aria-pressed', 'false');
  }
}

async function init() {
  scene = await createScene($('canvas-host'));
  // Stable automation API: preview and video exporter use the exact same renderer.
  Object.assign(window, { story: {
    ready: true, duration: SCENE.duration, fps: SCENE.fps,
    renderAt: (t: number) => { setPlaying(false); seek(t); },
    getState: () => ({ time, playing, options: structuredClone(scene.options) }),
    frame: () => scene.app.canvas.toDataURL('image/jpeg', 0.95),
  } });
  if (renderMode) { seek(0); return; }
  $('loading').remove();
  // Start on an illuminated frame; no unsolicited motion or sound.
  seek(1.4);
  $('play').onclick = () => { if (time >= SCENE.duration) seek(0); setPlaying(!playing); };
  $('replay').onclick = () => { seek(0); setPlaying(true); };
  $<HTMLInputElement>('scrub').oninput = event => { seek(Number((event.target as HTMLInputElement).value)); };
  document.querySelectorAll<HTMLButtonElement>('.beat').forEach(el => el.onclick = () => seek(Number(el.dataset.time)));
  $('motion').oninput = event => {
    scene.options.motion = Number((event.target as HTMLInputElement).value) / 100;
    $('motion-value').textContent = `${Math.round(scene.options.motion * 100)}%`; scene.renderAt(time);
  };
  for (const key of ['atmosphere', 'captions'] as const) {
    $(key).onchange = event => { scene.options[key] = (event.target as HTMLInputElement).checked; scene.renderAt(time); };
  }
  document.querySelectorAll<HTMLInputElement>('[data-layer]').forEach(el => el.onchange = () => {
    scene.options.layers[el.dataset.layer!] = el.checked; scene.renderAt(time);
  });
  $('sound').onchange = async event => {
    try { await ambience.setEnabled((event.target as HTMLInputElement).checked); if (!playing) await ambience.pause(); }
    catch { $<HTMLInputElement>('sound').checked = false; toast('Audio is unavailable in this browser.'); }
  };
  $('compare').onclick = () => {
    const image = $<HTMLImageElement>('reference'); image.hidden = !image.hidden;
    $('compare').setAttribute('aria-pressed', String(!image.hidden));
    $('compare').textContent = image.hidden ? 'View original ↗' : 'Back to animation ↗';
  };
  $('fullscreen').onclick = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('viewer').requestFullscreen(); }
    catch { toast('Fullscreen is unavailable in this browser.'); }
  };
  $('save-frame').onclick = () => scene.app.canvas.toBlob(blob => {
    if (blob) { void download(blob, `vinny-scene-01-${time.toFixed(2)}s.png`); toast('Still saved at 1920 × 1080.'); }
  }, 'image/png');
  $('export').onclick = () => void exportWebM();
  document.addEventListener('keydown', event => {
    if ((event.target as HTMLElement).matches('input, button, a') || recording) return;
    if (event.code === 'Space') { event.preventDefault(); $('play').click(); }
    if (event.code === 'ArrowRight') { event.preventDefault(); seek(time + 1); }
    if (event.code === 'ArrowLeft') { event.preventDefault(); seek(time - 1); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !recording) setPlaying(false); });
  requestAnimationFrame(loop);
}
init().catch(error => {
  console.error(error);
  const target = document.getElementById('loading') ?? root;
  target.textContent = `Unable to open the scene. ${error instanceof Error ? error.message : String(error)}. Try a browser with WebGL enabled.`;
});
