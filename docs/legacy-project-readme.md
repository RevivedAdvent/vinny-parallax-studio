# Vinny — A world before his time

**Historical legacy-preview notes.** The current editor is described in the [README](../README.md). The old preview is available at `/legacy.html` on the development server; commands and verification claims below describe the original implementation and are not current editor instructions.

A complete **PixiJS 8 + TypeScript + Vite** project that turns the supplied layered artwork into a 24-second 2.5D story scene. No backend or API keys required.

## Start the studio

```bash
cd /home/sriharsham/vinny-parallax-studio
npm install
npm run dev
```

Open the localhost URL printed by Vite (normally `http://127.0.0.1:5173`). Playback starts paused with sound off. Click Play or press Space. Arrow keys step one second when a form control is not focused. Click a story beat or drag the timeline to seek.

**Requirements:** Node.js 22.18+ (Node 22.23 tested), npm, and a browser with WebGL enabled. Dependencies are already installed on this machine. No remote fonts or runtime services are required once dependencies are installed.

## What is animated

- Four original image layers with independently weighted parallax.
- Slow eased camera push and lateral drift, with overscan to protect image edges.
- Restrained whole-cutout breathing on Vinny, and foreground fern sway.
- Seeded floating particles, soft drifting mist, vignette, opening and closing fades.
- Four timed captions adapted from the supplied PDF.
- Optional synthesized waterfall-like ambience for preview, off by default.

This is **cutout animation**, not a rigged character or generated 3D scene. It does not invent new artwork, facial animation, or dinosaur action. The distant waterfalls remain part of the painted background.

## Story interpretation

The PDF begins at Vinny's castle; the supplied artwork instead depicts his **arrival in the prehistoric jungle**, after the time-crystal jump. This project treats that as the **first illustrated scene**, not a literal adaptation of the PDF's opening paragraphs. It begins at “Then silence. Vinny landed face-first in a fern.” The third caption condenses the jungle description; the final quote retains his Jurassic Park joke.

The complete original PDF and extracted text are in `docs/`. Source files in Downloads and existing animation projects were not modified.

## Video and image export

### Finished MP4

The first rendered video is saved at:

```text
output/vinny-scene-01.mp4
```

It is 1920 × 1080, 24 fps, 24 seconds, H.264, with a silent soundtrack. A browser-exported WebM and preview screenshots are also in `output/`.

### Render a new MP4 (frame-perfect)

```bash
# Once per fresh machine; Chromium is already installed here:
npx playwright install chromium
# System ffmpeg with libx264 or libopenh264 must be available on PATH.
npm run export:video -- output/my-scene.mp4
```

The exporter starts its own local Vite server and Chromium, evaluates exactly 576 frames through the same Pixi renderer as the preview, and pipes them to FFmpeg. There is no screen recording or real-time frame-dropping. It closes its browser and server automatically. Software rendering can take several minutes. The exporter selects libx264 when present, otherwise libopenh264 (used on this machine). Set FFMPEG_PATH to use another FFmpeg executable. Existing filenames are protected against overwriting; choose a new name for each render.

The CLI uses the scene's default settings, not unsaved adjustments in an already-open browser. Edit `src/engine/scene.ts` to change defaults and `src/scenes/arrival.ts` to change timing/captions. Outputs are ignored by Git.

### Browser WebM

Click **Export scene**. It records the currently enabled layers, camera amount, atmosphere, and captions, in real time. Keep the tab visible for the full 24 seconds. This is a convenient silent preview download; browser capture is variable-frame-rate and can shorten or drop frames, especially under software rendering. Use the CLI for an exact 24-second, frame-perfect MP4. Synthesized preview ambience is deliberately not included in either video export.

### Still image

Scrub to a frame and click **Save still** for a 1920 × 1080 PNG. It saves the animated composition even when original-art comparison is visible. UI controls are never burned into video or still exports.

## Project structure

```text
vinny-parallax-studio/
├── public/assets/scene-01/    # Original layers and reference composition
├── src/
│   ├── main.ts               # Studio UI, transport, browser downloads
│   ├── style.css             # Responsive studio design
│   ├── scenes/arrival.ts     # Layer positions, captions, beats, duration
│   └── engine/
│       ├── scene.ts          # Pixi scene and deterministic renderAt(seconds)
│       ├── math.ts           # Easing, envelopes, seeded random
│       └── ambience.ts       # Optional Web Audio preview ambience
├── scripts/
│   ├── runtime.mjs           # Self-contained test/export browser + server
│   ├── export-video.mjs      # Offline H.264 MP4 renderer
│   └── check-browser.mjs     # Real Chromium interaction and export checks
├── tests/scene.test.mjs      # Timing, alignment, assets and math tests
├── docs/                     # Source story, storyboard, implementation notes
└── output/                   # Video, stills and verification screenshots
```

## Layer registration

The original artboard is **1363 × 768**. RGB matching against the flattened reference establishes these offsets; do not center each cropped PNG independently.

| Order | File | Image size | Artboard position | Depth |
|---|---|---|---|---|
| 1 | background.png | 1363 × 768 | 0, 0 | 0.08 |
| 2 | jungle.png | 1363 × 741 | 0, 0 | 0.45 |
| 3 | vinny.png | 956 × 547 | **68, 185** | 0.68 |
| 4 | foreground.png | 1363 × 768 | 0, 0 | 1.00 |

The topmost full-size foliage layer closes the small lower gap in the cropped jungle layer. The renderer intentionally adds 6.5% minimum overscan for camera motion, so the animation is a slightly tighter crop than the supplied reference. The 1363:768 source is scaled very slightly nonuniformly to exact 16:9 output (under 0.2% difference).

## Validate and ship

```bash
npm test                # 5 unit/scene-data tests
npm run test:browser    # Chromium, interactions, responsive layout, PNG + 24s WebM download
npm run build           # Strict TypeScript and production Vite bundle
npm run preview         # Serve the built dist/ directory locally
```

Deploy `dist/` to a static site host at its root. For subpath hosting, configure Vite's base and adjust the root-relative asset URLs first.

## Next scene

Add separate character, dinosaur, background and foreground cutouts for the Therizinosaurus encounter. Create a new scene descriptor in `src/scenes/`, then add a scene selector and a second motion choreography. The current renderer is deterministic and already suitable for joining multiple rendered scene clips in FFmpeg.

## Sources

- User-supplied `Story.pdf` and `Downloads/Page 1/*.png` — all narrative and scene artwork.
- [PixiJS v8 documentation](https://pixijs.com/8.x/guides/getting-started/quick-start) — async initialization and renderer API.
- [PixiJS source and migration notes](https://github.com/pixijs/pixijs/blob/dev/src/__docs__/migrations/v8.md).

The story's original author/title are not identified in the PDF; “A world before his time” is a working scene title. Rights to supplied artwork/story remain with their owners.
