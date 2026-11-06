# StoryStudio

A local editor for arranging illustrated layers and creating camera movements. Built with TypeScript, Vite and PixiJS.

## Start

Requires Node.js 22.18 or newer, npm, and a WebGL-capable browser.

```sh
npm install
npm run dev
```

Open the printed local URL. Projects are saved in the browser's IndexedDB; clearing browser storage can remove them.

## Workflow

1. Create a project and set scene duration in **Story**. New projects and scenes default to 60 FPS; existing scenes retain their frame rate.
2. Import PNG, JPEG or WebP artwork in **Arrange**. Adjust layer position, scale, rotation, opacity and order.
3. In **Camera Movements**, expand **Basic Cinematic Moves**, choose a move and set its timing and coordinates or scale. Use **Coordinate picker** to find a scene point and apply it to a move. Camera moves affect the whole composition independently of layer depth; new moves have constant-speed interpolation.
4. In **Atmosphere**, add fog, haze, light, focus and weather effects. They are evaluated from absolute scene time, appear as grouped clips in **Timeline**, and keep their configuration when retimed. See [Atmosphere and visual effects](docs/animation.md#atmosphere-and-visual-effects).
5. Preview with Play or the scrubber. In **Timeline**, view and edit movement start/end times, or edit and delete moves. Click **Save**.
6. Use **Export** for a current-scene or all-scenes MP4. The local export service requires FFmpeg and FFprobe; see [MP4 export](docs/mp4-export.md).

Push-in aims at a scene X/Y point; zoom changes magnification without shifting the viewpoint. Because artwork is flat, push-in is a translation and scale approximation, not a true perspective-changing 3D dolly. [Camera movements](docs/animation.md) describes coordinates, combining moves and legacy projects.

Older projects retain legacy layer animation and depth-based camera tracks. Adding a new camera movement asks before replacing legacy camera tracks; it does not remove layer animation. The standalone preview and historical camera lab and documents are preserved in [Legacy Code](Legacy%20Code/README.md). The archived camera system reference describes the older track implementation, not the current editor controls.

## Tests

```sh
npm test
npm run build
npm run test:camera-moves-browser  # requires Playwright Chromium
npm run test:timeline-browser
npm run test:atmosphere-browser
```

Install the browser with `npx playwright install chromium` if needed. Export checks also require FFmpeg and FFprobe. `npm run test:animation-browser` covers the current camera-move and layer-effect editor (it writes `output/phase3/animation-ui-project.json`; the older `animated-project.json` fixture used by the animation export checks is left untouched). `npm run test:production` needs a fresh `npm run build` and verifies the `dist` render frames match the dev server byte-for-byte plus a smoke test of the built studio UI; it compares against `output/camera-phase1/manifest.json` when that file exists but does not require it.
