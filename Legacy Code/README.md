# Archived code

This folder preserves the previous standalone Vinny preview and historical material. It is separate from the current five-tab StoryStudio editor. The preview’s original assets remain in `public/assets/scene-01/`.

- `legacy.html`, `legacy-main.ts`, `legacy.css`, `engine/`, and `scenes/`: standalone preview. Start the development server and open `/legacy.html` (the root entry remains as a compatibility link), or `/Legacy%20Code/legacy.html`.
- `Extras/camera-lab/`: archived basic and spatial camera lab presets, renderers, encoders, and contact-sheet scripts. The existing `npm run lab:basic` and `npm run lab:basic-encode` commands still point to these files. Outputs still go to the original `output/` locations.
- `Extras/check-camera-export.mjs`: archived phase-1 acceptance test for the `render-frames`/`export-video` pipeline. It is no longer part of `package.json`; run it manually after `npm run render:frames` (`node "Legacy Code/Extras/check-camera-export.mjs"`). Its still-valid invalid-index and incomplete-manifest assertions now live in `scripts/check-master-export.mjs`.
- `Extras/docs/`: historical phase notes, audit, storyboard, preview README and verification report. Their descriptions of old source paths and commands are historical, not current instructions.

The current camera evaluator, old-project compatibility, example project and export service are not archived. Existing generated output has not been moved or deleted.
