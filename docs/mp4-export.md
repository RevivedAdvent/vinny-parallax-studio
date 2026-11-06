# Local MP4 export

Start the app and its native export worker in separate terminals:

```sh
npm run dev
npm run export:server
```

Export Current Scene renders the selected Story scene; Export All Scenes joins the ordered scenes at their configured durations. Output is H.264 MP4 at 1920×1080, 60 fps. FFmpeg (with `libx264` or `libopenh264`) and FFprobe must be installed and available on `PATH`; override with `FFMPEG_PATH` / `FFPROBE_PATH` if needed.

## Rendering parity

The exporter boots the same `?render=1` PixiJS renderer the studio preview uses and
evaluates every frame from absolute scene time, so camera moves, layer effects,
masks, particles, shadows, warps and atmosphere overlays are identical in both.
Scenes that are not exactly 16:9 are fitted whole into the 1920×1080 frame and
letterboxed with black — never cropped to fill — matching the preview's fit.

Artwork must be embedded data URLs or files under `public/assets/`. `blob:` and
remote URLs are refused before rendering, naming the scene and layer.

## Tests

```sh
npm run test:export-service   # payload validation, CORS, job lifecycle
npm run test:export           # master export + encode metadata
npm run test:export-quality   # PSNR/SSIM of both quality presets
npm run test:export-ui        # real buttons, 1800-frame scene, FFprobe
npm run test:export-e2e       # artefact-rich project: both buttons, decode every
                              # frame, compare to preview PNGs, failure cleanup
```

`test:export-e2e` writes the MP4s, preview captures and FFprobe metadata to
`output/export-e2e/` for inspection.
