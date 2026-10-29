# Frame-indexed camera core — Phase 1

This is a reusable 2.5D camera foundation, not the preset catalog, Camera Lab, or the hero story edit.

## Source of truth

- `CameraSceneConfig`: logical/output dimensions, fps, totalFrames, ordered full-canvas layers, tunable depths, fixed headroom/anchor, property limits and tracks.
- `compileCamera(config)`: validates and owns a copy of the configuration. Calls do not mutate scene data or consume RNG state.
- `evaluate(frameIndex, intensity)`: returns camera and layer-local contributions. Index must be an integer in `0..totalFrames-1`; invalid frames are rejected, not silently clamped to a nonexistent end frame.
- `projectLayers(config, state)`: computes absolute per-layer transforms.
- `createCameraScene`: applies those transforms to Pixi sprites, and renders. No ticker or accumulated camera state.

Preview uses a clock only to select an integer frame. Seeking, frame capture and offline export use the same evaluator and projection. Slow preview may skip displayed frames; it cannot change what frame N means.

## Track contract

Every track has `id`, `target`, `property`, `startFrame`, `endFrame`, `startValue`, `endValue`, `easing`, `intensity`, and `limits`. Optional fields: `projection`, `holdAfter`, `noise`.

- Targets: `camera`, or `layer:<layer-id>` for explicit layer-local reframing/reveal. No independent subject animation is authored in this phase.
- Properties: `x`, `y` in output pixels; `zoom` as scale ratio; `roll` in degrees.
- Camera x/y: positive camera-right/down displaces artwork left/up. Layer-local x/y: direct screen-space displacement before common camera roll.
- Track boundaries are inclusive. A track 24–503 has 480 evaluated samples and reaches its exact endpoint at frame 503. The proof holds through 575 after that.
- Before start: neutral contribution. After end: endpoint persists by default. `holdAfter:false` returns to neutral after the inclusive end.
- A single-frame track takes its endValue at that frame. `hold` keeps startValue through the interval, changes to endValue at its end, then holds it. Use equal start/end for a true static hold.
- All contributions are **additive deltas from neutral**: x/y/roll neutral 0, zoom neutral 1. There is no hidden replacement priority. IDs are unique and sorted before composition, ensuring stable floating-point addition even if authoring order changes.
- Weight = clamped global intensity × clamped track intensity. Zero contributes exactly zero, including tracks with non-neutral startValues.
- Start/end values clamp to track limits; evaluated overshoot/noise also clamps to them. Aggregate properties clamp to camera limits. NaN/infinity reject.
- For shot handoffs later, do not leave an earlier held absolute offset active and add the same offset again. Either author incremental deltas or use nonoverlapping tracks with `holdAfter:false` and matching adjacent endpoint values. Phase 3 will define those boundaries explicitly.

## Easings

`linear`, `ease_in` (quadratic), `ease_out` (quadratic), `ease_in_out` (smoothstep), `overshoot_settle` (bounded by track/property limits), `hold`, and `seeded_noise`.

All have exact 0/1 easing endpoints. Seeded noise uses a random-access integer hash and smoothly interpolated segments. A zero-ended envelope removes noise at the first/last track sample. It is deterministic when seeking forward or backward. Its amplitude is in property units, not a lerp fraction, so a 0→0 drift can still move. Translation-noise amplitude is limited to 3 px per track; roll noise to 0.5° and zoom noise to 0.02. Future impact-shake presets are not implemented here.

## Dolly versus optical zoom

For layer depth `d`:

```text
factor = 1 + uniformZoomDelta + d * dollyZoomDelta
scale  = baseZoom * factor * layerLocalZoom
translation = -cameraTranslation * d
```

A uniform zoom track has `projection:"uniform"`; all layers receive the same scale contribution. A dolly track has `projection:"dolly"`; the near layer scales most, the valley least. x/y camera tracks always use depth-weighted translation. A zoom-only move adds no translation parallax.

Combined uniform/dolly channels are limited together at depth 1 to the camera zoom bounds. The projection is deliberately additive, not a perspective simulation or a multiplicative dolly-zoom effect. No orbit, arc, lens compensation or perspective changes are implemented.

Scale and camera roll use the shared output-space anchor. Default anchor is the image center. Layer-local zoom uses each full-canvas layer center. Roll is common framing rotation, not a fern animation. Fixed `baseZoom` is composition headroom and remains at intensity zero; it is not a camera track.

## Defaults for this proof

`src/scenes/camera-proof.ts`:

- 1920 × 1080, 24 fps, 576 frames (0–575).
- Depths: valley 0.1, canopy 0.4, Vinny 0.6, ferns 1.0.
- Headroom 1.15; x limits ±80 px, y ±45 px, animated zoom 0.9–1.18, roll ±3°.
- Two restrained core-proof tracks: a 1→1.06 depth push and x 0→16 px over frames 24–503, with baseline and final holds.
- These are renderer-validation tracks, **not** the provisional hero shot timings.

The full parameter envelope is not guaranteed gap-free. Limits bound motion, not artistic/coverage correctness. Different assets require coverage validation and possibly lower limits, more approved headroom, or clean plates.

## Assets and coverage

Original files are untouched under `public/assets/scene-01/`. `scripts/normalize-layers.py` registers cropped originals on their 1363 × 768 artboard, resizes to full-canvas 1920 × 1080 copies, and records provenance in `public/assets/scene-01-normalized/registration.json`. There is no inpainting. The very small source aspect-ratio difference is normalized to exact 16:9.

The source valley was unexpectedly semi-transparent (alpha 239–255). The initial frame-120 check failed with 20,281 subopaque pixels, min framebuffer alpha 243, no fully transparent pixels. The normalized valley's existing RGB was made opaque; no source RGB was invented or edited. The failure and repair remain documented. Other cutout alpha is preserved.

Camera rendering clears to transparent, with magenta visible behind the preview. Capture reads the actual framebuffer alpha: **any alpha below 255 fails**, including partially exposed pixels that an exact-RGB-magenta scan could miss. Captured PNGs explicitly matte those gaps magenta. No caption, shading, overlay or transition can obscure the test; the camera renderer contains none.

The master render records every frame's coverage count, bounding box, transforms, PNG hash and config. First uncovered frame fails the export and preserves evidence. It does not auto-crop or silently change limits/headroom. A separate deliberate underscan control proves the detector can fail.

An opaque valley can still fill a canopy cutout with the wrong scenery. Final-composite coverage is not semantic clean-plate validation. Missing behind-subject painting and exposed internal seams require visual/asset review and possibly artist-provided clean plates.

## Reuse for another story

Supply ordered full-canvas RGBA layers at a common registered resolution, reference them with public asset URLs, and provide a JSON configuration with this schema. `scripts/render-frames.mjs --config` accepts either the bare scene or `{config,intensity}` saved by the studio. Its dimensions, fps and duration are data, not Vinny-specific constants in the core. Use `createCameraScene(host, config)` to initialize a different story in an integration.

Renderer `setConfig` supports track/depth/camera/timing edits with unchanged image topology; changing canvas dimensions, layer order or asset URLs requires a new renderer instance. A multi-story asset importer, timeline editor and scene browser are not part of Phase 1.
