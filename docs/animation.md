# Animate

- Open **Animate**, select **Camera**, and choose one of the six movement cards. Choosing a card only prepares the controls; **Apply / Update** commits it.
- Set start time, duration, start/end values, easing and intensity. Effects must fit the scene. Changing the duration and applying again replaces that property's points. Values hold after the last point.
- Dolly changes scale according to each layer's Arrange depth; uniform zoom scales every layer equally. Camera right (+X) moves artwork left; camera down (+Y) moves artwork up. Static asks before clearing camera movement and keeps layer animation.
- Select any named layer, or use **Animate this layer** in Arrange. Animate X/Y offsets, scale multiplier, rotation offset, or opacity percentage relative to its Arrange transform. Layer names have no special meaning.
- Scrub in seconds. **Add at playhead** snaps to a whole second. Select a diamond to edit its value, outgoing easing, or time; changed times snap to whole seconds. Delete removes only that point. Effects may have fractional start/duration values, and their exact endpoints are preserved when editing values.
- There is one authored track per target/property. Different properties combine; applying the same property replaces it instead of accumulating duplicate effects. Adding at an occupied second updates that point. Moving a point onto another point is rejected.
- Play/pause, restart, scrub, and keyboard arrow steps use the same random-access evaluator. The timeline includes the exact scene endpoint; video contains samples from 0 through duration minus 1/60 second. Shortening a scene is rejected while authored points extend beyond its new endpoint.
- Save stores animation with the existing local project. Legacy frame tracks stay unchanged on open/save and retain their original FPS, additive/noise/hold semantics. Explicitly editing a legacy property replaces just that channel. Other channels remain untouched.

## Export

Current Scene and All Scenes use the same evaluator as the preview. Each output frame samples scene time `outputFrame / 60`; a 24 FPS source therefore uses fractional source-frame positions rather than repeating rounded frames. Source FPS and saved transforms are not changed. Each scene gets a fresh renderer, producing a hard cut with no state carried across scenes. Final composed frames are cover-fitted to 1920×1080 and encoded to H.264, 60 FPS, yuv420p.

## Verification

`node --test tests/animation.test.mjs` checks the model and projection. `node scripts/check-animation-browser.mjs` imports the four real images in `test-images/` and saves the acceptance fixture and preview PNGs in `output/phase3/`. Then `node scripts/check-animation-export.mjs` exports both modes, compares decoded frames against those preview PNGs (mean RGB error below 3 for H.264), and verifies the hard cut and FFprobe metadata. It also writes screenshots and machine-readable reports. `node scripts/check-animation-export-ui.mjs` also starts an isolated export service and exercises both real Export buttons, polling and downloads with short animated scenes. These scripts require Chromium, FFmpeg and FFprobe.
