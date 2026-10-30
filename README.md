# StoryStudio — illustrated story animation

StoryStudio is a local, beginner-oriented 2.5D editor for arranging illustrated artwork and animating a camera and layers. It uses TypeScript, Vite, PixiJS 8 and the existing frame-indexed camera evaluator. No account or backend is needed.

## Start

Requires Node.js 22.18 or newer, npm and a browser with WebGL enabled.

```sh
cd /path/to/vinny-parallax-studio
npm install
npm run dev
```

Open the URL printed by Vite, normally `http://127.0.0.1:5173`. The application stores projects locally in your browser.

## Create a story

1. Choose **New project**, enter a title such as `My New Story`, and choose **Save**. A new project starts with one blank scene; it does not inherit the example artwork or animation.
2. Use **＋** beside Scenes to add a scene. Select a scene in the left navigator; use Scene properties to change its title, duration in seconds, and frame rate. The arrow buttons reorder scenes and **Duplicate** makes an independent scene copy. Deleting a scene asks for confirmation.
3. Choose **Import artwork** and select PNG, JPEG or WebP files. Multiple images can be imported together. Full-canvas transparent artwork and smaller cutouts are both supported. The layer list is shown front-to-back; use Bring forward / Send back, the visibility checkbox, duplicate, and delete controls. Double-click a layer name to rename it.
4. Select a layer and adjust X, Y, scale, rotation, opacity and depth in Properties. The thumbnail shows the selected image. An imported image starts centered, at its native size. Position and scale it to fit your composition.
5. Move the playhead. Choose an animation property, easing and (for camera zoom) projection, then click **＋ Camera keyframe** or **＋ Animate selected layer**. Click a track's diamond or duration bar to edit its start/end frames, values, easing and intensity, or delete it. Zoom/scale values are multipliers (1 is neutral); X/Y values are pixels; rotation is degrees. Positive camera movement shifts artwork in the opposite direction, weighted by depth. Layer motion moves only that layer. Tracks are additive, so multiple tracks on a property combine.
6. Use Play/Pause, Restart and the scrubber to inspect individual integer frames. Click **Export frame PNG** to save a still with transparency intact. The preview can skip displayed frames on slow hardware; frame evaluation is deterministic.

**Open Vinny example** creates a separate project from the existing normalized artwork and camera-proof tracks. It is an example rather than a template for new projects. The older effects/captions preview is still available at `/legacy.html` on the development server; it is a separate historical implementation, not the new project renderer.

## Saving and transfer

**Save** stores the entire project, including imported artwork, in the browser's IndexedDB. Projects are also saved before switching to a different project, creating a project, or importing a package. Browser data can be cleared by the user or browser; use **Transfer project** for backups. The downloaded `.story.json` contains the versioned manifest and embedded image data, including the example's assets. **Open** imports such a package as a new copy, leaving the original saved project intact. Large images make large packages and may exceed browser storage limits. Project duplication and confirmed deletion are available in the navigator.

## Frame-accurate scene MP4

1. Select the scene and choose **Master export config**. The downloaded `.camera.json` contains that scene's settings, tracks and embedded assets, including unsaved edits.
2. Install Playwright Chromium once: `npx playwright install chromium`. Install FFmpeg and FFprobe, with libx264 or libopenh264, and put them on PATH; alternatively set `FFMPEG_PATH` and `FFPROBE_PATH` to their executables.

3. Run the existing numbered-PNG / FFmpeg master exporter, supplying the downloaded config and a **new** output name:

   ```sh
   npm run export:video -- output/my-scene.mp4 --config "$HOME/Downloads/Scene-1.camera.json"
   ```

   On Windows PowerShell, use `$env:USERPROFILE\Downloads\Scene-1.camera.json` for the downloaded configuration path.

The exporter starts its own Vite server and Chromium, renders each frame through the same scene renderer and evaluator as the editor, then encodes and verifies H.264 dimensions, rate, duration and frame count. It refuses to overwrite an existing output or partial output. Rendering can take a long time and needs disk space for numbered PNGs. No audio is included. This is **not** a real-time screen recording.

The master exporter currently requires an opaque composition covering the entire frame on **every** frame. It reports the first uncovered frame and stops instead of hiding gaps. Add an opaque background with sufficient overscan, or reduce camera motion. In contrast, still PNG export supports transparency. Complete-story export and transitions are not implemented; export scenes individually. With no `--config`, the legacy CLI default is the original camera proof.

## Format and coordinates

`src/studio/project.ts` defines the versioned project, metadata, defaults, and scene collection. `src/camera/types.ts` defines scene, layer and track data; `src/camera/validate.ts` validates renderer inputs. A project package includes a manifest and image data URLs, not temporary blob URLs. Unsupported project versions are rejected; no migrations beyond version 1 exist yet.

Composition coordinates are pixels, origin top-left, +X right and +Y down. Each image is centered at the composition center plus its X/Y offsets; its own pixel dimensions are preserved. Camera framing and roll are applied around the shared camera anchor. Layer scale is a positive multiplier, layer rotation is degrees, opacity is 0–1 and depth is 0–1. Higher depth has more camera translation and dolly response. Array/order values define back-to-front stacking, independently of depth. Layer and scene IDs are stable and independent of their display names. Frame indices start at zero; track boundaries are inclusive and a track holds its end value by default.

`src/camera/evaluate.ts` and `project.ts` perform pure frame-indexed evaluation and projection; `src/engine/camera-scene.ts` loads assets and applies poses in Pixi. `src/main.ts` handles editor state, local persistence and package transfer. The renderer does not import a particular story. The supplied originals and normalization script remain unchanged. See the documentation index below for current guides and historical material.

## Documentation index

- [Camera quick guide](docs/camera-quick-guide.md) — beginner-friendly controls and examples.
- [Camera system reference](docs/camera-system-reference.md) — implementation, projection math, validation and export.
- [Camera core phase notes](docs/camera-core.md) — proof configuration and coverage history.
- [Phase 0 audit](docs/camera-phase0-audit.md), [legacy preview guide](docs/legacy-project-readme.md), [storyboard](docs/storyboard.md), and [verification report](docs/verification.md) — historical context, not current editor instructions.

## Tests

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run build
npm run test:export      # needs FFmpeg and FFprobe as above
```

The browser test exercises multiple scenes, image imports, property/track editing, deterministic pixels, local save/reload, package import and a frame export of the example. The export test creates a short synthetic MP4 and checks overwrite protection. The retained `test:camera-browser` script targets a superseded camera-proof UI and does not pass against the current editor. `test:camera-export` and `test:production` require the historical full-render `output/camera-phase1/manifest.json`, which is not tracked; they cannot run on a fresh checkout without that evidence. These scripts are retained as historical checks, not substitutes for the current editor tests.

## Current limitations

The timeline is a basic track inspector rather than a full multi-keyframe editor. It supports camera and layer X/Y, zoom/scale and rotation; opacity is static, not animated. Camera zoom tracks support Uniform and Dolly / Depth-based projection. The editor does not expose camera anchor or track limit editing. Captions, atmospheric effects, sound, project resolution/default editing, real-time WebM, a complete-story video and transitions are not yet implemented in the new editor. Asset importing is direct-to-layer rather than a reusable asset library. The MP4 CLI currently rejects uncovered/transparent frames. The historical `legacy.html` retains the earlier story-specific effects but is not a portable project editor.
