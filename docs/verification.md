# Verification results

**Historical verification of the legacy preview.** These results are not claims about the current editor or its current test scripts. See the [README](../README.md) for current test commands.

## Automated checks

- `npm run build`: passed strict TypeScript checking and production bundling.
- `npm test`: all 5 tests passed (camera easing, caption envelopes, seeded particles, layer files/registration, cue timing).
- `npm run test:browser`: passed in headless Chromium using software WebGL. Verified the 1920 × 1080 canvas, deterministic seeking, different frames over time, play/pause, camera slider, captions, atmosphere, layer visibility, original-art comparison, PNG download, and actual WebM download.
- Responsive geometry checks passed at 1440, 1024, 768, and 390 px: no horizontal document overflow; all buttons inside the viewport.
- Production bundle smoke test passed with all non-local network access blocked.
- `npm audit --omit=dev`: 0 vulnerabilities reported at setup time.

## Final MP4

File: `output/vinny-scene-01.mp4`

- Codec: H.264 (encoded with the machine's libopenh264; libx264 is unavailable).
- Dimensions: 1920 × 1080.
- Constant frame rate: 24 fps.
- Decoded frames: 576.
- Duration: 24.000000 seconds.
- Size: 24,570,199 bytes.
- Audio streams: none, deliberately silent.
- Entire file decoded with FFmpeg without errors.
- An 8-second frame was extracted from the final encoded video and visually checked: artwork intact, Vinny visible, caption readable, no obvious codec or layer defects.

## Visual checks

Desktop and mobile screenshots and animation stills were inspected using the image-review tool. Layer alignment was clean. Small secondary-label contrast was improved after review. No horizontal clipping was observed or measured. A transient save-confirmation toast appeared over part of the inspector in the mobile screenshot; it disappears automatically and has pointer-events disabled.

Captions intentionally occupy the lower foreground and can cover some hand/fern detail. They can be toggled off before a browser export, or disabled in defaults for a CLI export.

## Known limits / not tested

- Browser WebM capture is variable-frame-rate and dropped time under software rendering (the latest test produced approximately 21.98 seconds). Use the verified MP4 or CLI exporter for exact scene timing.
- No physical mobile-device, Safari, Firefox, GPU-specific, or screen-reader testing was performed.
- Fullscreen and optional audio are implemented, but were not covered by the automated browser interaction checks.
- Audio is synthesized preview ambience only; no voice-over or scored soundtrack was generated.
- No articulated character rig, lip sync, independently animated waterfalls, or new dinosaur artwork is included.
- Test/export and production-smoke browsers and servers were closed after checks. Start the studio with `npm run dev`.

Screenshots, downloaded stills, browser WebM, and the decoded MP4 frame are in `output/`.
