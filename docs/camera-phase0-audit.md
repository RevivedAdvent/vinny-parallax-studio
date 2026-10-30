# Camera Phase 0 — audit and approval gate

**Historical snapshot:** this describes the legacy implementation before the camera core and editor were built. Its proposals and approval gates are not current instructions. See the [current reference](camera-system-reference.md).

**Scope:** inspection and diagnostic captures only. No application, camera, UI, asset, or exporter behavior changed. Phase 1 has not started.

## Decisions needed before implementation

1. **Assets conflict with the brief.** The on-disk layers are not full-canvas 1920 × 1080 images. Approve normalizing the existing registered layers to full-canvas 1920 × 1080 PNGs (keeping originals), or supply replacement full-canvas layers. Normalization preserves alignment but does not create missing artwork or detail.
2. **Existing effects conflict with camera-only scope.** Approve bypassing existing atmosphere, character breathing, fern sway, vignette, shade, fades, title overlay and preview audio in the camera-only path. Preserve the legacy files, and retain existing caption data separately for the later hero-scene integration; no new effects or caption timing changes in Phase 1. Camera roll must rotate framing, not animate the fern independently.
3. Approve replacing the hard-coded transform formula with a frame-indexed track evaluator. Retain the Pixi application setup, asset loader, registered origins, and headless browser/FFmpeg infrastructure where useful.

## 1. Current pipeline map

| Stage | Location | Current behavior |
|---|---|---|
| Scene data | `src/scenes/arrival.ts` | 1363 × 768 logical artboard; 24 s; 24 fps; depths and offsets; captions/beat buttons use fractional seconds |
| Asset loading | `src/engine/scene.ts:23–45` | Four sprites, far-to-near; centered sprite anchors; registered crop offsets retained |
| Output sizing | `src/engine/scene.ts:30` | Root scales X and Y independently to 1920 × 1080; source aspect differs slightly from exact 16:9 |
| State evaluation | `src/engine/scene.ts:91–128` | `renderAt(seconds)`, absolute-time smoothstep and sine formulas; no camera model or tracks |
| Preview scheduler | `src/main.ts:61–76` | requestAnimationFrame timestamp differences accumulate fractional seconds; deltas capped at 0.1 s; slow rendering changes playback duration |
| Scrubbing | `src/main.ts:134` | Range step 0.01 s = 0.24 frame; not integer-frame accurate; allows t=24, a hypothetical frame 576 |
| Slider | `src/main.ts:136–139` | Writes `options.motion = value / 100`; scales formula, breathing and fern sway together |
| Headless API | `src/main.ts:119–125` | `window.story.renderAt(seconds)` and JPEG `frame()`; same renderer as preview |
| MP4 | `scripts/export-video.mjs` | Loops frame 0–575, evaluates frame/24, streams JPEG into FFmpeg; H.264; libx264 or libopenh264; no master PNG sequence |
| WebM | `src/main.ts:76–118` | Real-time canvas.captureStream + MediaRecorder + wall-clock RAF; not deterministic frame export |

### Actual assets

| Layer | Native size | Artboard top-left | Current depth | Requested starting depth |
|---|---|---|---|---|
| Distant valley | 1363 × 768 | 0, 0 | 0.08 | 0.10 |
| Jungle canopy | 1363 × 741 | 0, 0 | 0.45 | 0.40 |
| Count Vinny | 956 × 547 | 68, 185 | 0.68 | 0.60 |
| Foreground ferns | 1363 × 768 | 0, 0 | 1.00 | 1.00 |

Do not center the cropped images independently. Their current origin metadata is important.

## 2. Existing behaviors: keep, fix, or rewrite

| Behavior | Finding | Recommendation |
|---|---|---|
| Global push | Scale = `1.065 + motion * progress * (0.035 + depth * 0.025)`. Some differential scaling exists, but optical zoom and dolly are inseparable. No subject target. | Rewrite as explicit zoom/dolly projection tracks. |
| Horizontal/vertical drift | X uses `16 + 28*depth`; Y uses `5 + 7*depth`. Nonzero common terms mean translations are not proportional to depth. | Rewrite as signed camera translations with explicit depth factors; define camera direction versus image displacement. |
| Parallax ratios | For valley vs ferns, X displacement coefficient ratio is 18.24/44 ≈ 0.415, not depth ratio 0.08/1. Y ratio ≈ 0.463. | Test layer translations against the configured depth factors. |
| Breathing | Nonuniform character scale is coupled to camera intensity. | Bypass in camera-only rendering; not a camera behavior. |
| Fern motion | Independent sine translation and rotation are also coupled to intensity. | Bypass; only camera-derived layer transforms in scope. |
| Locked-off / zero intensity | Layer transforms are constant at intensity 0, but maintain fixed 1.065 overscan. The complete scene still changes because overlays/effects run independently. | Keep explicit fixed framing as baseline; intensity 0 must contribute zero track delta. Verify on isolated camera output. |
| Limits | No state-level intensity/translation/scale/roll limits or finite-number validation. UI range alone is not a camera safety boundary. | Add validated, clamped evaluator inputs and output limits. |
| Easing | Only smoothstep is present, applied over all 24 s. No track boundaries, holds or shot timing. Last exported frame never reaches progress=1. | Reuse small math utilities where appropriate; add exact-endpoint, inclusive-frame easing/hold semantics. |
| Shots | Beat buttons do not define shots or hold intervals. Camera keeps moving over the full timeline. | Data-driven shot boundaries and persistent end-state holds in Phase 3. |
| Tracking / roll / presets | Not implemented. Foreground rotation is not camera roll. | Build on the approved core in later phases; no dolly zoom, orbit or perspective simulation. |
| Coverage | Fixed 6.5% overscan; green clear color, vignette and fades can obscure gaps. No production gap test. | Unobscured magenta coverage pass; fail visibly. Treat 1.15 headroom as a starting hypothesis, not a guarantee. |
| Export | Offline MP4 frame count is correct; shared renderer is worth keeping. JPEG introduces intermediate loss and current UI edits are not serialized to the CLI. | Keep infrastructure; switch master render to numbered PNGs and a shared validated scene/camera config. WebM preview only. |

### Determinism / randomness

- `scene.ts` state calculation has no performance.now, Date.now, ticker deltaTime, or unseeded random. Sines depend on supplied absolute time. This is useful existing behavior, not a wholly nondeterministic renderer.
- Preview uses wall-clock timestamps **outside** scene evaluation, but passes fractional times and accumulates deltas. Replace with a scheduler that selects integer frames without integrating camera state.
- Particle initialization uses seeded PRNG seed 842. It is out of scope and should not be carried into the camera-only path.
- `src/engine/ambience.ts:14` uses Math.random and AudioContext time. It is not involved in image evaluation or silent export. Do not refactor it as part of camera work; bypass it in the camera-only path.

## 3. Measurements and output inspected programmatically

Artifacts: `output/camera-phase0/`.

Fresh PNGs were rendered at **0, 60, 120, 143, 240, 360, 383, 480, 527, 575**, using frame/24 with the existing evaluator.

- `current-*.png`: unmodified scene output, including its existing effects and fades.
- `isolated-*.png`: separate diagnostic instance; all post-layer overlays hidden and clear color changed to magenta. Existing breathing and fern sway remain because they are coupled to the camera formula. This is not a finished camera-only implementation.
- `current-contact-sheet.jpg` and `isolated-contact-sheet.jpg`: labelled 10-frame sheets, 2 columns × 5 rows.
- `measurements.json`: hashes, layer transforms at sampled frames, and a 576-frame transform-only sweep.
- `sampled-gap-scan.json`: exact and near-magenta pixel counts for isolated sample frames.
- Source hashes before/after match for the inspected runtime/export files.

| Check | Result / limitation |
|---|---|
| Frame 120 rendered, another time sought, frame 120 rendered again | **PASS**: PNG bytes identical in the same Chromium session. SHA-256: `18ac251ad262c0af9a098ae67808a065ef2e34d9bd7114666738f5a7700fcdfa`. |
| Direct seek to 500 vs evaluating all states 0–500 | **PASS, limited**: final PNGs identical. Intermediate GPU submissions were skipped, so this is not a sequential playback/video test. |
| Intensity zero layer transforms | **PASS relative to current baseline**: transforms match between frame 120 and 500; baseline scale remains 1.065. |
| Intensity zero complete scene images | **Different**, as expected from active noncamera effects/captions. This must not be used as an isolated camera test. |
| Sampled magenta coverage | **0 exact or near-magenta pixels** at all 10 isolated samples, default intensity 0.65. **Not** a pass for all 576 frames, all intensities, or future presets. |
| Transform-only movement sweep | Foreground center maximum step ≈ 0.1494 output px/frame, near frame 276. This measures center translation only, not scaled edges, rotation, perception, or smooth playback. |
| Existing MP4 | **PASS technical metadata**: H.264, 1920 × 1080, 24/1 fps, 576 decoded frames, exactly 24.000000 s. Existing file rechecked; not a freshly rendered Phase 1 master. |
| Existing WebM | **FAIL as master**: VP9, 1920 × 1080, 28 decoded frames over 21.975814 s. This saved software-rendered capture is not representative of deterministic 24 fps output. It was probed, not recorded anew. |

**Visual review limitation:** the image-review provider failed on the newly generated contact sheet; the companion request was rate-limited. I cannot honestly report that I visually inspected these sheets or watched continuous motion in this phase. No subjective smoothness, face-readability, or compositing approval is claimed. Review the sheets and existing MP4 before accepting those visual properties. The diagnostic capture itself completed without browser page errors.

### Coverage caveat

A fully opaque distant plate can conceal an internal disocclusion: a hole in the canopy may expose the valley instead of magenta. Magenta detects uncovered final-composite pixels, not all wrong pixels or missing behind-subject painting. We need a separate clean-plate/disocclusion review and, if necessary, per-layer masks or artist-supplied overscan/inpainting. Never claim a magenta pass proves those holes are safe. Artwork extension/inpainting requires approval; no such edits were made.

## 4. Proposed architecture (not implemented)

1. **`camera/types.ts`**: validated frame-indexed scene/camera/track types. Tracks carry `id`, `target`, `property`, `startFrame`, `endFrame`, `startValue`, `endValue`, `easing`, `intensity`, `limits`, optional seed, and projection mode. Targets: camera or explicit layer; properties x/y/zoom/roll. Depth remains tunable layer metadata.
2. **`camera/easing.ts`**: pure linear, ease_in, ease_out, ease_in_out, overshoot_settle, hold and seeded drift. Frame endpoints exact, including noise envelopes. Noise random-access keyed by seed and frame/segment, never dependent on call order.
3. **`camera/evaluate.ts`**: `evaluateCamera(frameIndex, tracks, config, intensity)`; no Pixi, DOM, clock, ticker, or random globals. Validate integer frames 0–575 and finite parameters. Define inclusive start/end frames, one-frame tracks, zero-intensity neutral deltas, endpoint holds and deterministic overlap composition. Clamp once after combining contributions, with per-track limits as well. Reject ambiguous conflicting replacement tracks rather than relying on array order.
4. **`camera/project.ts`**: registered artboard origins → output transforms. Explicit neutral baseline with provisional 1.15 headroom. Translation = signed camera translation × configured depth factor. Zoom-mode scale uniform across layers; dolly-mode scale uses a documented depth response about the chosen target, so push/pull cannot silently degrade into optical zoom. Keep the public x/y/zoom/roll properties; separate projection channels internally so zoom-mode and dolly-mode tracks can coexist. Document sign convention and anchor math.
5. **`engine/renderFrame.ts`**: apply evaluated layer transforms and submit Pixi render; no animation state accumulation. Captions stay in a separate overlay path for later integration. Camera-only validation uses no particles, fog, character motion, shading, grading or transitions.
6. **Preview transport**: integer frameIndex is the source of truth; scrub range 0–575 step 1. A wall clock may schedule which frame to display, but never influences evaluated state. Slow preview may skip display frames, never change frame-N content.
7. **`scripts/render-frames.mjs` / encode step**: shared config and evaluator; headless PNG frame N and numbered sequence 0000–0575; FFmpeg H.264 24 fps, 1920 × 1080. Preflight encoder support, write a manifest/config hash, and verify decoded frame count/duration. Reuse current launcher and encoder fallback. Do not trust WebM duration/frame count as master validation.
8. **Coverage validation**: raw pre-overlay alpha/coverage render over magenta, inspect every frame and fail with first failing frame, count, bounding box and saved diagnostic PNG. Include near-magenta/blended edges, not just exact RGB hits. Do not auto-increase zoom silently. Report a proposed limit/headroom/asset fix for approval. Layer visibility intentionally disabled for debugging must not be confused with a valid master configuration.

## 5. Phase gates after approval

- **Phase 1 only:** camera core, exact easings/holds, depth projection, integer scrubbing, PNG export, full-frame coverage scan, deterministic tests. Include actual sequential rendered-state comparison at 500, not only this audit's optimized state sweep. No presets/Lab/hero choreography yet.
- **Phase 2:** separate Lab using the same renderer and assets. Basic moves first; stop for approval before spatial, then stop before stylized. Each preset: 72-frame clip, 8-frame contact sheet, numerical and visual gates; diagnostics must not obscure coverage. Rack-focus blur optional and last, never enabled in hero without approval.
- **Phase 3:** frame-data shots 0–119, 120–239, 240–383, 384–527, 528–575; keep narration overrideable. Slider scales camera-track intensity only. Hold continuity across shot boundaries; no implicit cuts or transitions.
- **Phase 4:** master timing, full-frame gap results, comparison to approved preview, caption integration/readability and human visual review. No approval based solely on code or still-frame hashes.

## Changelog

Added only `scripts/audit-phase0.mjs`, this report, and diagnostic artifacts under `output/camera-phase0/`. Application/runtime/export source hashes are unchanged. No assets were resized, no features added, and no new effects implemented. Temporary browser/server instances were closed.

**Status:** Phase 0 technical audit delivered. Visual review remains unresolved due to image-provider failure. Awaiting asset/scope decisions and explicit approval before Phase 1.
