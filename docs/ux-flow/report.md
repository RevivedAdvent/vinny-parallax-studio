# UX Flow Critique — 2026-11-08

## Implementation Status (2026-11-08)
Proposals 1–3 were implemented and verified after this critique:
- **One export action**: scope radios (Current scene / All scenes), one `Export scene|story` button, automatic download, and a visible "Download again" link. Export flushes the autosave first.
- **Applied lists collapsible**: APPLIED EFFECTS is a collapsed `<details>` block above the catalogues in Camera Movements, Parallax and Atmosphere, with a gold diamond icon, effect count badge and time readout so it is distinct from catalogue sections. Lists scroll internally when opened and take no space when closed.
- **Autosave**: edits persist 700 ms after the last commit (deferred while a pointer is held), `Save now` is secondary, and the header reports Saved locally / Saving / Save failed. Silent saves do not rebuild panels.

Verified with unit tests (147 pass) and browser checks: studio, base browser, arrange, camera, atmosphere, parallax, timeline, animation, animation-export-ui, export-ui, export-e2e. See `output/user-review/export-1400.png`, `export-1100.png`, `atmosphere-pane-2.png`.

## Run Summary
| Metric | Value |
|--------|-------|
| Journeys critiqued | 8 |
| Evidence source | Live pass, local studio (`dev:studio`), 22 screenshots |
| Verdicts | 1 minimal, 7 acceptable, 0 convoluted |

Selected journeys: 046 (end-to-end two-scene delivery), 011 (import), 016 (direct manipulation), 021 (push-in), 026 (depth), 031 (fog), 038 (retime), 041 (export one scene).

## Friction Scorecard
| Journey | Steps (actual/ideal) | Needless decisions | Re-entry | Dead ends | Verdict |
|---------|----------------------|--------------------|----------|-----------|---------|
| 046 Two-scene delivery | 37 / 12 | 2 | 0 | 1 | acceptable |
| 011 Import a layered illustration | 2 / 2 | 1 | 0 | 0 | acceptable |
| 016 Place and resize directly | 4 / 4 | 1 | 0 | 0 | minimal |
| 021 Add a push-in | 5 / 3 | 1 | 0 | 0 | acceptable |
| 026 Set depth | 4 / 3 | 1 | 0 | 0 | acceptable |
| 031 Add drifting fog | 6 / 3 | 1 | 0 | 1 | acceptable |
| 038 Retime a movement | 5 / 3 | 1 | 1 | 1 | acceptable |
| 041 Export one scene | 4 / 3 | 2 | 0 | 1 | acceptable |

No journey failed 3+ heuristics outright. The friction is concentrated in duplicate surfaces, commit models and missing scope feedback rather than wasted screens.

## Redundancy Map
| Type | Count | Main items | Recommendation |
|------|-------|------------|----------------|
| Duplicate paths | 7 | import (2 buttons), fit/reset/centre (inspector + menu), retime (Timeline vs workspace), delete (row vs Timeline), rename scene (field vs prompt) | Keep shortcuts, remove the duplicate import and the rename prompt; align confirmation and timing units |
| Duplicate information | 6 | scene duration (5 surfaces), `MP4 EXPORT` heading, empty guidance, save state, layer name, lock/visibility | Drop the toast, drop one export heading, merge empty guidance |
| Overlapping features | 6 | Sway/Wind vs Foliage in wind; drift vs floating/ambient; four depth techniques; haze/depth blur/defocus; tracking vs drift; grid/snap | Group depth techniques; differentiate wind effects in copy; couple grid and snap |
| IA findings | 9 | empty first screen without import; empty inspector column; applied lists below catalogues; scene-scoped Timeline; depth only in Parallax; manual Save; two export primaries; naming drift; depth units | See proposals 1–6 |

## Simplification Proposals (ranked)

### 1. Make export one action with a scope choice
- **Now**: two symmetric sections, two equally primary buttons, second click to download. With one scene both produce the same file. (041/01)
- **Proposed**: scope selector (Current scene / All scenes) + quality, one **Export** button; download starts automatically when ready.
- **Saves**: 1 decision + 1 click per export; removes a duplicated section; touches every delivery journey.
- **Effort**: S
- **Evidence**: `journeys/041.md`, `041-screens/01-export-panel.png`

### 2. Pin applied-effects lists above the catalogues
- **Now**: in Atmosphere the created effect is below the fold; in Camera Movements it is visible. Same feature, different layout. (031/02 vs 021/02)
- **Proposed**: applied list pinned above collapsing catalogue in Camera Movements, Parallax and Atmosphere; new row selected and scrolled into view.
- **Saves**: 1 scroll + the "did it work?" hesitation on every effect creation; improves 021, 026, 031, 046.
- **Effort**: S
- **Evidence**: `journeys/031.md`, `journeys/021.md`, `031-screens/02-applied.png`

### 3. Make saving automatic and demote Save
- **Now**: manual Save is the top primary action; project switching saves silently; the export error tells the user to reload without warning that unsaved work is lost. (046/01, 041/03)
- **Proposed**: autosave on committed changes and project/scene switch; header shows Saved/Saving as status; remove the Save button or keep it as "Save now" secondary.
- **Saves**: 1 action per session and the reload-data-loss risk; improves 046, 047, 050.
- **Effort**: M
- **Evidence**: `journeys/046.md`, `journeys/041.md`, `041-screens/03-service-error.png`

### 4. Single import action and one empty state
- **Now**: `+ Import`, `Import artwork`, two copies of "Import artwork to begin arranging your scene", and an empty `SCENE DETAILS` column on Story. (011/01, 046/01)
- **Proposed**: one primary **Import artwork** button in the empty canvas; panel shows only "No layers yet"; hide empty inspector.
- **Saves**: 1 decision, 1 duplicate instruction, and a dead column; improves first-run time to value.
- **Effort**: S
- **Evidence**: `journeys/011.md`, `011-screens/01-empty-layers.png`, `046-screens/01-first-launch.png`

### 5. Unify timing: one label set, commit on blur
- **Now**: Timeline uses Start/End + Apply timing; workspaces use Start + Duration + Update. Retiming requires retyping both fields and a third click. (038/02, 031/02)
- **Proposed**: Start/End everywhere; live bar preview; commit on blur/Enter; show duration readout; keep Edit as the link to the canonical editor.
- **Saves**: 1 click per retime and the mental unit conversion; improves 038, 039, 046.
- **Effort**: S/M
- **Evidence**: `journeys/038.md`, `038-screens/02-timeline.png`

### 6. Fix depth editing's units and commit model
- **Now**: help text says 0–1, controls use 0–100%; layer names truncate; Apply is a separate step; two different resets. (026/01)
- **Proposed**: percentage only, thumbnails and full names, live apply with one **Reset depth** action, depth value in the applied summary.
- **Saves**: 1 commit step and a unit error; improves 026, 027, 046.
- **Effort**: M
- **Evidence**: `journeys/026.md`, `026-screens/01-depth-form.png`

### 7. Default the Arrange canvas to Select and hint the gestures
- **Now**: tools are both off on entry; selection does nothing until Select is armed; no hint for arrows/snapping. (016/01)
- **Proposed**: Select active by default; Pan via Space-drag or toggle; one-line first-selection hint.
- **Saves**: 1 decision and the "is the canvas broken?" hesitation; improves 016, 046.
- **Effort**: S
- **Evidence**: `journeys/016.md`, `016-screens/01-selected.png`

### 8. Show scene scope wherever effects are listed
- **Now**: Timeline silently shows only the active scene's rows; switching scenes appears to delete effects. (038/01)
- **Proposed**: header states "This scene · 1 effect · 2 in other scenes" with links.
- **Saves**: confusion and a potential re-creation of existing effects; improves 038, 046.
- **Effort**: S
- **Evidence**: `journeys/038.md`, `038-screens/01-timeline-empty-scene.png`

### 9. Make export quality consequential
- **Now**: "smaller, faster" vs "sharper, slower" with no size/time estimate, and no stated output format/resolution. (041/01)
- **Proposed**: show estimated duration and approximate size per preset, plus target "1920×1080 · 60 fps · MP4".
- **Saves**: 1 trial export per quality decision.
- **Effort**: S
- **Evidence**: `journeys/041.md`, `041-screens/01-export-panel.png`

## Already Minimal
- **STORY-016 direct manipulation**: 4 actions for 4 milestones; take-away pass found no removable screen element. The only improvement is defaulting the tool, not changing the journey shape.
- **STORY-011 step count** is already minimal (2/2); its problems are duplicate entry points, addressed in proposal 4.
- Layer inspector transform rows, scene creation/selection mechanics and the camera catalogue cards earned their place; no proposal removes them.

## Not Covered
- Mobile/touch, screen readers, keyboard focus order and the 390 px horizontal overflow reported by an earlier browser check were not part of this pass.
- Advanced presets (rack focus, orbit, whip, perspective warp, waterfall, fireflies) were not walked; catalog coverage marks them implied.
- Real export failures other than an unreachable service (missing asset, FFmpeg failure) were not retested here.

## Issues
Not filed: the user did not request GitHub issues. This report is the artifact.
