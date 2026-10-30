# Camera system reference

This describes the current implementation in `src/camera/` and `src/engine/camera-scene.ts`. For a nontechnical introduction see the [quick guide](camera-quick-guide.md).

## Coordinates and configuration

Composition origin is top-left; +X points right and +Y down. Camera translations are in composition pixels. Positive camera X/Y displaces artwork left/up, weighted by depth. Layer-local translations have the opposite convention: positive values displace the layer right/down before camera roll.

`baseZoom` is fixed scale headroom, clamped to 1–2. `anchor` is an output-space point clamped within the composition; framing zoom and roll use it. `limits` bound final camera x/y, zoom and roll and also constrain each track's limits. X/Y limits are clamped to ±composition width/height; zoom to 0.25–4; roll to ±`maxRoll`. `maxRoll` defaults to 3° when absent and must be 0–180°. Limits must include neutral. These limits do not guarantee full artwork coverage.

Depth is clamped to 0–1. Camera translation is multiplied by depth, and dolly scale contribution is multiplied by depth. Depth does not determine drawing order: validated layer `order` sorts sprites back to front independently.

## Projection and rendering

The evaluator accumulates uniform and dolly zoom deltas separately. For layer depth `d`:

```text
factor = 1 + uniformDelta + depth * dollyDelta
dx = (width/2 - anchor.x)*factor + layer.x*baseZoom*factor - camera.x*depth + local.x
dy = (height/2 - anchor.y)*factor + layer.y*baseZoom*factor - camera.y*depth + local.y
x = anchor.x + dx*cos(roll) - dy*sin(roll)
y = anchor.y + dx*sin(roll) + dy*cos(roll)
scale = baseZoom * factor * local.zoom
roll = camera.roll + local.roll
```

Roll is converted from degrees to radians for sine/cosine. Missing layer positions default to zero. Uniform zoom adds the same factor to every depth; dolly weights its delta by depth. Combined zoom channels are bounded against camera zoom limits, including a correction when their sum exceeds the bounds. `camera-scene.ts` centers each sprite, multiplies the projected scale by static layer scale, adds static layer rotation, applies opacity and visibility, and renders in layer order. Local zoom changes sprite scale, not its position; layer-local x/y are rotated by common camera roll. The anchor need not coincide with a sprite's own center.

## Tracks and evaluation

A track targets `camera` or `layer:<id>` and property `x`, `y`, `zoom` or `roll`. Layer zoom is local and cannot use dolly. Track IDs are unique and sorted before additive composition. Frames are inclusive, zero-based integers from 0 to `totalFrames - 1`. Before start a track returns neutral (0 for x/y/roll, 1 for zoom); after end it holds its endpoint unless `holdAfter:false`. A single-frame track uses its end value.

Start and end values and interpolated results are clamped to the track's validated limits. Each track contributes `(value - neutral) * track.intensity * globalIntensity`; intensities are clamped to 0–1. Camera and layer contributions are summed and bounded by camera limits. A zoom track without projection defaults to uniform. Existing dolly tracks remain dolly. In the editor a selected track exposes its timing, values, intensity, easing and, for camera zoom, projection; imported track limits remain authoritative.

## Easing and noise

For normalized progress `t` clamped to 0–1, endpoints are exactly 0 and 1. In between:

| Easing | Behavior |
|---|---|
| Linear | `t` |
| Ease In | `t²` |
| Ease Out | `1 - (1-t)²` |
| Ease In-Out | `t²(3-2t)` |
| Hold | 0 until the end, then 1 |
| Overshoot and Settle | With `s=t-1`, `1 + 2.70158*s³ + 1.70158*s²`; track limits can clip the overshoot. |
| Seeded Noise | Linear interpolation plus deterministic drift inside the track. |

Noise requires `seed` (signed 32-bit integer), `amplitude`, and `frequency`. Amplitude is clamped to 0–3 pixels for x/y, 0–0.5 degrees for roll, or 0–0.02 for zoom; frequency is clamped to 0.05–6. A random-access integer hash keyed by seed and segment index produces drift values, interpolated with smoothstep. The drift position is `t * durationFrames / fps * frequency`; amplitude is multiplied by `[4t(1-t)]²`, so it vanishes at both endpoints. The result is then clamped to track limits. Selecting Seeded Noise in the editor initializes valid zero-amplitude noise; increase amplitude to see it.

## Determinism and export

`compileCamera` validates and owns a copy; `evaluateCamera` uses the frame index and configuration, with no clock, mutable random generator, or integration. Seeking in any order yields the same state for a given integer frame. Preview playback uses a clock only to select frames, so slow playback may skip displayed frames. `scripts/render-frames.mjs` launches the same Pixi renderer in render mode using the exported config and renders numbered PNGs; `scripts/export-video.mjs` verifies coverage and encodes them. Export requires fully opaque coverage at every frame; still PNG can retain transparency. Pixel equality can depend on browser/GPU, but evaluation itself is deterministic.

This is a **2.5D layered composition**, not perspective-correct 3D: no actual 3D orbit, focal-length/lens simulation, or three-dimensional geometry is implemented.
