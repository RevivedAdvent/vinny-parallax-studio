# UX Path Catalog: StoryStudio

Generated: 2026-11-08
Total Stories: 50
Coverage: 21 / 21 feature capabilities (100%); see Coverage Matrix for verification limits.

## Summary
| Type | Count |
|------|-------|
| Short | 17 |
| Medium | 28 |
| Long | 5 |

## Coverage Matrix
| Feature Area | Stories | Gaps |
|--------------|---------|------|
| Project lifecycle and onboarding (new, open, save, rename, duplicate, delete, example) | 001–005, 050 | No in-app backup/restore or cloud sync; both correctly absent from the product |
| Scene lifecycle (create, select, rename, duplicate, reorder, delete, title) | 006–008, 046–047 | — |
| Scene timing (duration, frame rate, animation-fitting validation) | 009–010, 049 | Frame-rate change with existing animation is not storied on its own; validation is reached indirectly |
| Layer import and asset replacement | 011, 019, 045–046 | Import failure and unsupported-file recovery appear only as edge cases |
| Layer organization (order, rename, folders, filter, multi-select, hide/lock/delete) | 012–015 | — |
| Arrange viewport (select/pan, move, resize, rotate, zoom, grid, snapping) | 016, 020, 048, 050 | Touch gestures and non-modifier wheel panning are not separately storied |
| Layer inspector (numeric/slider transforms, steppers, reset, fit, align, advanced data) | 017–019 | — |
| Camera movements (add, target, pick coordinates, edit, duplicate, tracking, reset, legacy warning) | 021–025 | Rack-focus, orbit, whip and other advanced presets are only implied |
| Parallax depth and effects (depth response, planes, drift, mask reveal, depth scale) | 026–030, 048 | Perspective Warp, Shadow Movement and framing effects are not individually storied |
| Atmosphere (fog, weather, layer targeting, duplicate/delete, haze) | 031–035, 048 | Fireflies, waterfall, light rays and depth blur are only implied by the catalogue |
| Timeline and playback (transport, keyboard, seek, retime, edit links, legacy tracks) | 036–040, 048–049 | Touch scrubbing is not covered |
| Export (current/all, quality, service recovery, missing-asset recovery) | 041–045, 046–047, 050 | Real FFmpeg/FFprobe and service availability are environment-dependent |
| Complete workflows | 046–050 | — |

## Story Dependency Graph
```text
STORY-001 (Start a named story)
├── STORY-002 (Save and return to a local project)
├── STORY-003 (Open a supplied project file)
│   ├── STORY-040 (Inspect a legacy track) [imported projects only]
│   ├── STORY-045 (Recover from missing artwork during export)
│   ├── STORY-047 (Rework an imported project and export one shot)
│   └── STORY-049 (Repair timing before shortening a scene)
├── STORY-004 (Explore the example safely)
├── STORY-005 (Duplicate, rename and delete a local project)
├── STORY-006 (Add a second scene)
│   ├── STORY-007 (Reorder the sequence)
│   ├── STORY-042 (Export the complete story)
│   └── STORY-046 (Create and deliver a two-scene illustrated story)
└── STORY-011 (Import a layered illustration)
    ├── STORY-012 (Restack and rename artwork)
    ├── STORY-013 (Group artwork in a folder)
    ├── STORY-014 (Find and select several layers)
    ├── STORY-015 (Hide, lock and delete a layer)
    ├── STORY-016 (Place and resize artwork directly)
    │   └── STORY-050 (Prepare a project for a high-quality final export)
    ├── STORY-017 (Enter precise transform values)
    ├── STORY-018 (Fit, align and reset a layer)
    ├── STORY-019 (Inspect and replace an asset)
    │   └── STORY-045 (Recover from missing artwork during export)
    ├── STORY-020 (Navigate a zoomed composition)
    ├── STORY-021 (Add a push-in)
    │   ├── STORY-022 (Pick a point in the scene)
    │   ├── STORY-023 (Edit and duplicate a movement)
    │   ├── STORY-024 (Track an artwork layer)
    │   └── STORY-025 (Return to a static camera)
    ├── STORY-026 (Set depth for foreground and background)
    ├── STORY-027 (Assign layers to depth planes)
    ├── STORY-028 (Add independent layer drift)
    ├── STORY-029 (Reveal a layer with a mask)
    ├── STORY-030 (Adjust and reset depth-based scale)
    ├── STORY-033 (Target foliage artwork)
    └── STORY-035 (Apply haze to selected layers)

STORY-006 (Add a second scene) ── STORY-008 (Duplicate and remove a scene)
STORY-006 (Add a second scene) ── STORY-009 (Set scene duration and frame rate)
STORY-009 (Set scene duration and frame rate) ── STORY-010 (Shorten a scene containing animation)

STORY-031 (Add drifting fog)
STORY-032 (Add rain or snow)
STORY-034 (Duplicate, edit and delete an atmosphere effect)

STORY-036 (Preview and scrub a scene)
STORY-037 (Seek to an effect in Timeline)
STORY-038 (Retime a camera movement)
STORY-039 (Retime and edit effects across workspaces)

STORY-043 (Choose export quality) ── STORY-050 (High-quality final export)
```


## All Stories

### Project and onboarding

Evidence: `src/main.ts`, `src/studio/project.ts`.

## STORY-001: Start a named story
**Type**: short
**Topic**: Project and onboarding
**Persona**: Maya, a first-time illustrator.
**Goal**: Begin an empty project named Forest Walk.
**Preconditions**: Studio open in a browser with IndexedDB available.
**Ideal path**: 2 — choose New and name it.
**Alternate paths**: Start editing the default My New Story; rename it later via Project > Rename project.
### Steps
1. Click ＋ New -> the Project title prompt opens.
2. Enter Forest Walk and confirm -> a new blank project and scene open.
3. Read the empty preview -> it prompts Maya to import artwork in Arrange.
### Variations
- Cancel the title prompt: remain in the current project.
### Edge Cases
- Empty title: creation falls back to Untitled Story.

## STORY-002: Save and return to a local project
**Type**: short
**Topic**: Project and onboarding
**Persona**: Leo, a returning creator.
**Goal**: Persist a scene and find it again.
**Preconditions**: A project has unsaved edits.
**Ideal path**: 2 — save and reopen the project.
**Alternate paths**: Switching projects also saves the current project before switching.
### Steps
1. Click Save -> status changes through Saving… to Saved locally.
2. Reload the page -> the saved project is restored.
3. In Story, select another project from PROJECTS and return -> the saved project opens.
### Variations
- Switching projects saves the current project first.
### Edge Cases
- IndexedDB failure: Save failed is shown; do not assume the work was saved.

## STORY-003: Open a supplied project file
**Type**: short
**Topic**: Project and onboarding
**Persona**: Nina, receiving an existing `.story.json` file.
**Goal**: Continue editing a previously packaged story.
**Preconditions**: A valid project file is available locally.
**Ideal path**: 2 — Open and choose the file.
**Alternate paths**: Open Vinny example from Project loads the built-in sample, not an arbitrary file.
### Steps
1. Click Open -> the project file picker appears.
2. Choose the `.story.json` -> the project is validated and opened as an imported copy.
3. Inspect Story's scene list -> imported scenes appear.
### Variations
- A supported portable package may include assets.
### Edge Cases
- Invalid JSON or unsupported package: an error is shown; the current project is not replaced.

## STORY-004: Explore the example safely
**Type**: short
**Topic**: Project and onboarding
**Persona**: Maya, looking for an example before importing artwork.
**Goal**: Inspect a populated sample without losing her current work.
**Preconditions**: Studio is open.
**Ideal path**: 2 — choose the example and inspect it.
**Alternate paths**: Open an existing project file.
### Steps
1. Open Project -> choose Open Vinny example.
2. Inspect its scene and preview -> the example opens as a separate project.
3. Select the earlier project under Story > PROJECTS -> return to it.
### Variations
- Save changes to the example as a local project.
### Edge Cases
- Opening the example first persists the previous project; storage errors may prevent switching.

## STORY-005: Duplicate, rename and delete a local project
**Type**: medium
**Topic**: Project and onboarding
**Persona**: Leo, making a safe alternate cut.
**Goal**: Experiment on a copy, then remove it.
**Preconditions**: An existing project is open.
**Ideal path**: 4 — duplicate, rename, choose delete and confirm.
**Alternate paths**: ＋ New creates a blank project rather than copying existing content.
### Steps
1. Open Project -> choose Duplicate project to create a copy.
2. Open Project -> choose Rename project and name it Forest Test.
3. Make a small edit and click Save -> the copy is stored locally.
4. Open Project -> choose Delete project.
5. Confirm deletion -> the copy is removed from browser storage and another project opens.
### Variations
- Cancel deletion: the project remains.
### Edge Cases
- Deleting the last stored project opens a new Untitled Story; deleting is local to this browser.

### Scenes and story

Evidence: `src/main.ts`, `src/studio/project.ts`.

## STORY-006: Add a second scene
**Type**: short
**Topic**: Scenes and story
**Persona**: Maya, making a two-shot story.
**Goal**: Add a blank second shot.
**Preconditions**: An existing project is open.
**Ideal path**: 2 — open Story and add a scene.
**Alternate paths**: Duplicate an existing scene to reuse its contents instead of creating a blank one.
### Steps
1. Open Story -> the scene list is visible.
2. Click ＋ Scene -> a new blank scene is added and selected.
3. Enter Clearing in Scene title -> the scene list and header show the new title.
### Variations
- Double-click the scene list and enter a name in the prompt instead of editing Scene title.
### Edge Cases
- A blank scene has no layers until artwork is imported in Arrange.

## STORY-007: Reorder the sequence
**Type**: short
**Topic**: Scenes and story
**Persona**: Leo, adjusting the cut order.
**Goal**: Put the second scene before the first.
**Preconditions**: A project has at least two scenes.
**Ideal path**: 2 — select the scene and move it earlier.
**Alternate paths**: None found for scene reordering.
### Steps
1. In Story, select the second scene -> it becomes active.
2. Click ↑ Earlier -> the list order changes.
3. Review the numbered list -> the selected scene is first.
### Variations
- Use ↓ Later to move an active scene in the other direction.
### Edge Cases
- Moving the first scene earlier or last scene later has no effect.

## STORY-008: Duplicate and remove a scene
**Type**: medium
**Topic**: Scenes and story
**Persona**: Nina, comparing a variant shot.
**Goal**: Create an independent scene copy, then remove it.
**Preconditions**: The active scene has artwork.
**Ideal path**: 3 — duplicate, delete, confirm.
**Alternate paths**: ＋ Scene starts blank; it does not clone the current scene.
### Steps
1. Open Story and select the scene -> its details appear.
2. Click Duplicate -> a copy appears immediately after the original and becomes active.
3. Change Scene title to Variant -> the copy is distinguishable.
4. Click Delete -> a confirmation warns that the scene and its layers will be deleted.
5. Confirm -> the copy is removed and another scene is selected.
### Variations
- Cancel the confirmation to keep the copy.
### Edge Cases
- The last remaining scene cannot be deleted; a message explains the project must keep one scene.

## STORY-009: Set scene duration and frame rate
**Type**: short
**Topic**: Scenes and story
**Persona**: Leo, preparing a 12-second scene.
**Goal**: Set timing without changing its intended duration.
**Preconditions**: Scene is selected in Story.
**Ideal path**: 2 — set duration and frame rate.
**Alternate paths**: None found for scene-level duration or frame rate.
### Steps
1. Enter 12 in Duration · seconds and commit -> scene duration updates.
2. Enter 24 in Frame rate · fps and commit -> frame count changes while duration is preserved as closely as possible.
3. Review the duration under the preview -> it reflects the selected scene.
### Variations
- Enter 60 fps to use the project default.
### Edge Cases
- Invalid frame rates, excessive duration/frame counts, or cuts past existing animation endpoints are rejected with a message.

## STORY-010: Shorten a scene containing animation
**Type**: medium
**Topic**: Scenes and story
**Persona**: Nina, reducing a finished shot.
**Goal**: Shorten a scene without silently truncating its movement.
**Preconditions**: A scene has a camera movement ending at 10 seconds.
**Ideal path**: 3 — move the ending, set duration, save.
**Alternate paths**: Delete the movement rather than retime it.
### Steps
1. In Story, set Duration · seconds to 8 -> the app warns that animation extends beyond the new end.
2. Open Timeline -> locate the movement and adjust its End to 7 seconds.
3. Apply the timing -> the movement fits within the proposed duration.
4. Return to Story and enter 8 -> the shorter duration is accepted.
5. Click Save -> the updated scene is stored locally.
### Variations
- Delete the movement instead of retiming it.
### Edge Cases
- If other effects still extend beyond 8 seconds, shortening remains blocked.

### Layers and folders

Evidence: `src/main.ts`, `src/studio/layers-panel.ts`, `src/studio/layer-commands.ts`.

## STORY-011: Import a layered illustration
**Type**: short
**Topic**: Layers and folders
**Persona**: Maya, importing a forest illustration.
**Goal**: Bring background and foreground artwork into a blank scene.
**Preconditions**: PNG/JPEG/WebP files exist on the computer.
**Ideal path**: 2 — open Arrange and select the artwork.
**Alternate paths**: Use Import artwork in the empty layer state instead of ＋ Import.
### Steps
1. Open Arrange -> the empty state says No layers yet.
2. Click ＋ Import and choose background.png and foreground.png -> each appears as a layer and in the preview.
3. Select the foreground row -> its layer properties appear.
### Variations
- Choose Import artwork from the empty state to open the same picker.
### Edge Cases
- Unsupported types are skipped; a file that cannot be decoded reports an import failure.

## STORY-012: Restack and rename artwork
**Type**: short
**Topic**: Layers and folders
**Persona**: Leo, correcting a foreground overlap.
**Goal**: Place foliage in front and name it clearly.
**Preconditions**: At least two layers are imported.
**Ideal path**: 2 — reorder and rename.
**Alternate paths**: Layer actions > Bring to front or Send to back; rename through Layer actions or double-click the name.
### Steps
1. In Arrange, drag the foliage row above the background row -> its draw order changes.
2. Double-click the foliage name and enter Ferns -> the row is renamed.
3. Inspect the preview -> foliage is in front of the background.
### Variations
- Use Layer actions > Bring to front instead of dragging to the top.
### Edge Cases
- Cancel the rename prompt to leave the name unchanged.

## STORY-013: Group artwork in a folder
**Type**: medium
**Topic**: Layers and folders
**Persona**: Nina, organizing multiple foreground assets.
**Goal**: Keep foliage layers together without losing them when reorganizing.
**Preconditions**: At least two artwork layers exist.
**Ideal path**: 4 — create and name folder, move layers into it, collapse it.
**Alternate paths**: Layer actions > Move to folder instead of dragging; folder menu selects all contained layers.
### Steps
1. In Arrange, click ＋ Folder -> a new folder row appears.
2. Double-click its name and enter Foliage -> the folder is renamed.
3. Drag a foliage layer onto the folder -> the layer becomes a child.
4. Drag another layer into the folder -> both appear inside.
5. Click Collapse folder -> children are hidden from the list, not deleted.
6. Open Folder actions and select Delete folder (keep layers); confirm -> folder disappears and children remain in the scene.
### Variations
- Expand the folder again and choose Remove from folder from a child layer's actions.
### Edge Cases
- Cancelling the folder deletion keeps both folder and children.

## STORY-014: Find and select several layers
**Type**: medium
**Topic**: Layers and folders
**Persona**: Leo, working in a crowded illustration.
**Goal**: Select several related layers for a shared action.
**Preconditions**: At least seven layers exist, including two with related names.
**Ideal path**: 3 — filter, select matching rows and act.
**Alternate paths**: Ctrl/Cmd-click individual rows, Shift-click a range, or use a folder's Select layers action.
### Steps
1. In Arrange, enter leaf in Filter layers -> matching rows are shown.
2. Select one matching row and Ctrl/Cmd-click another -> both are selected.
3. Open Layer actions -> available commands apply to the selection where supported.
4. Clear the filter -> the full hierarchy returns.
5. Review the selection summary in Layer Properties -> the number selected is shown.
### Variations
- Shift-click selects a contiguous range; a folder menu can select its members.
### Edge Cases
- Search appears only when the layer-count threshold is met; a nonmatching query returns an empty result.

## STORY-015: Hide, lock and delete a layer
**Type**: short
**Topic**: Layers and folders
**Persona**: Maya, protecting a finished background.
**Goal**: Temporarily hide artwork, lock it, and remove a disposable layer.
**Preconditions**: At least two layers exist.
**Ideal path**: 3 — hide/show, lock and delete the disposable layer.
**Alternate paths**: Layer actions > Lock/Unlock and Delete; right-click opens the same action menu.
### Steps
1. Click the eye control on the background -> the layer is hidden; click again to show it.
2. Click its lock control -> its transform edits are disabled.
3. Select a disposable layer and click Delete layer -> confirm deletion when prompted.
### Variations
- Use the layer action menu to lock or delete instead of the row controls.
### Edge Cases
- Deleting referenced layers cleans up affected references; locked layers cannot be directly transformed.

### Arrange controls

Evidence: `src/studio/arrange-viewport.ts`, `src/studio/layer-inspector.ts`.

## STORY-016: Place and resize artwork directly
**Type**: medium
**Topic**: Arrange controls
**Persona**: Maya, composing a forest shot.
**Goal**: Move, scale and rotate a foreground layer using the canvas.
**Preconditions**: At least one unlocked, visible layer; no active perspective camera view.
**Ideal path**: 4 — select, move, resize and rotate directly.
**Alternate paths**: Select the row and use the Transform numeric fields or sliders.
### Steps
1. Open Arrange and click Select tool -> viewport editing is enabled.
2. Click the foreground artwork -> its selection outline and handles appear.
3. Drag the layer -> the artwork moves.
4. Drag a corner handle -> the layer scales uniformly.
5. Drag the rotation handle -> the layer rotates.
### Variations
- Select several rows first and drag them as a group; resize and rotate apply to the primary layer only.
### Edge Cases
- Locked layers cannot be transformed; perspective camera views report that direct dragging is unavailable.

## STORY-017: Enter precise transform values
**Type**: short
**Topic**: Arrange controls
**Persona**: Leo, aligning a graphic to precise coordinates.
**Goal**: Set a layer to X 120 and opacity 75%.
**Preconditions**: An unlocked layer is selected in Arrange.
**Ideal path**: 2 — enter X and opacity directly.
**Alternate paths**: Use the X and Opacity sliders; position can also be dragged or nudged.
### Steps
1. In Transform, enter 120 in the X exact value -> the layer moves.
2. Enter 75 in Opacity exact value -> the preview and slider update.
3. Use Increase X or ArrowUp in the X field -> X advances by one.
### Variations
- Use the sliders rather than typing; scale is uniform rather than separate X/Y values.
### Edge Cases
- Invalid opacity and non-positive scale are rejected; the previous value is restored.

## STORY-018: Fit, align and reset a layer
**Type**: short
**Topic**: Arrange controls
**Persona**: Nina, preparing a full-frame background.
**Goal**: Fit artwork to the composition and align it.
**Preconditions**: A selected unlocked layer has known image dimensions.
**Ideal path**: 2 — fit and align.
**Alternate paths**: Layer actions > Fit to canvas, Centre in canvas, or Reset transform.
### Steps
1. In Transform, click Fit layer to canvas -> the selected artwork is scaled to fit.
2. Under Align to canvas, click Left -> its rotated bounds align with the left edge.
3. Click Reset transform if the result is not wanted -> default transform values return.
### Variations
- Use Right, Top, Bottom or Centre; Layer actions also provides centring and fitting.
### Edge Cases
- A locked layer disables transform actions; reset changes position, scale, rotation and opacity.

## STORY-019: Inspect and replace an asset
**Type**: medium
**Topic**: Arrange controls
**Persona**: Maya, replacing low-resolution artwork.
**Goal**: Swap an image while keeping its layer in the composition.
**Preconditions**: A layer is selected; a replacement PNG/JPEG/WebP is available.
**Ideal path**: 3 — open Advanced, replace and choose the file.
**Alternate paths**: Import another image as a new layer instead; this does not preserve the same layer identity.
### Steps
1. Select the layer in Arrange -> its name appears in Layer Properties.
2. Expand Advanced -> asset size, on-canvas size and anchor are shown.
3. Click Replace image… -> the image picker opens.
4. Choose a replacement -> the selected layer uses the new image.
5. Review its position in the preview -> the layer remains available for adjustment.
### Variations
- Cancel the picker to leave the original image.
### Edge Cases
- Invalid or undecodable files produce an error and do not intentionally replace the asset.

## STORY-020: Navigate a zoomed composition
**Type**: medium
**Topic**: Arrange controls
**Persona**: Leo, placing a small leaf accurately.
**Goal**: Zoom in, pan and return to the full composition.
**Preconditions**: Arrange is open with artwork.
**Ideal path**: 3 — zoom, pan, reset view.
**Alternate paths**: None found for the 100% view reset; Zoom in/out buttons and Ctrl/Cmd+wheel are alternative zoom controls.
### Steps
1. Click Select tool or Pan tool -> the floating view controls appear.
2. Click Zoom in -> the preview magnifies.
3. Click Pan tool and drag -> the viewport shifts without moving artwork.
4. Click the zoom percentage -> zoom and pan reset to the full fitted canvas at 100%.
5. Enable Toggle grid and Toggle snapping if needed -> grid and snapping help placement.
### Variations
- Use Zoom out or Ctrl/Cmd+wheel; turn the active tool off to hide extra controls.
### Edge Cases
- With both tools off, viewport manipulation is disabled; snapping targets the centre or visible grid lines.

### Camera movements

Evidence: `src/studio/animate.ts`, `src/camera/moves.ts`, `src/studio/timeline.ts`.

## STORY-021: Add a push-in
**Type**: medium
**Topic**: Camera movements
**Persona**: Maya, animating the opening shot.
**Goal**: Add a slow camera push toward the subject.
**Preconditions**: An artwork scene is open.
**Ideal path**: 3 — choose movement, set timing and add.
**Alternate paths**: None found for creating a new camera movement.
### Steps
1. Open Camera Movements -> the movement catalogue appears.
2. Expand BASIC CINEMATIC MOVES and choose Push-in / dolly-in -> its form opens.
3. Set Duration · seconds to 3 and Travel · % to 20 -> the move parameters are ready.
4. Click Add movement -> the move appears in the applied list.
5. Play the preview -> the push is visible over time.
### Variations
- Choose Pull-out / dolly-out instead to move away.
### Edge Cases
- Start and duration must fit within the scene; legacy camera tracks may trigger a replacement confirmation.

## STORY-022: Pick a point in the scene
**Type**: medium
**Topic**: Camera movements
**Persona**: Leo, aiming a push at a painted cabin.
**Goal**: Use a canvas point rather than guessing coordinates.
**Preconditions**: Artwork is visible and a compatible camera preset is selected.
**Ideal path**: 3 — pick point, apply it and add movement.
**Alternate paths**: Enter Target X · pixels and Target Y · pixels manually.
### Steps
1. Open Camera Movements and choose Push-in / dolly-in -> target fields appear.
2. Click Coordinate picker -> the preview prompts for a point.
3. Click the cabin -> the picked X/Y readout appears.
4. Click Use picked point -> the target fields receive those coordinates.
5. Click Add movement -> the movement uses that target.
### Variations
- Type target coordinates directly instead of using the picker.
### Edge Cases
- A point outside the scene is rejected; leaving the workspace stops the picker.

## STORY-023: Edit and duplicate a movement
**Type**: medium
**Topic**: Camera movements
**Persona**: Nina, adding a second similar move.
**Goal**: Reuse a movement and adjust its timing.
**Preconditions**: A camera movement already exists.
**Ideal path**: 3 — duplicate, edit and update.
**Alternate paths**: ＋ Add another starts a new instance of the same preset; Timeline Edit opens an existing move.
### Steps
1. Open Camera Movements -> locate the applied movement.
2. Click Duplicate -> an independent copy appears.
3. Change Start · seconds on the selected copy -> the form reflects the new timing.
4. Click Update movement -> the copied movement is saved.
5. Open Timeline -> both movement rows are visible.
### Variations
- Select Edit on the original rather than duplicating it.
### Edge Cases
- Invalid overlapping or out-of-range timing is rejected by validation when applicable.

## STORY-024: Track an artwork layer
**Type**: medium
**Topic**: Camera movements
**Persona**: Leo, following a subject layer.
**Goal**: Create a movement that targets a chosen layer.
**Preconditions**: At least one artwork layer exists.
**Ideal path**: 3 — choose tracking, choose target and add.
**Alternate paths**: Other presets accept scene coordinates or optional layer targets; their movement semantics differ.
### Steps
1. Open Camera Movements -> expand SPATIAL AND REVEAL MOVES.
2. Choose Tracking / follow -> Target layer and movement fields appear.
3. Select the subject in Target layer -> it becomes the tracking target.
4. Set timing and click Add movement -> the tracking move is added.
5. Scrub the preview -> inspect the tracked shot.
### Variations
- Use a compatible advanced movement with an optional target layer.
### Edge Cases
- Missing or deleted target layers require correction; consult the editor's validation message.

## STORY-025: Return to a static camera
**Type**: short
**Topic**: Camera movements
**Persona**: Maya, undoing a camera experiment without deleting layer effects.
**Goal**: Clear camera movement while keeping layer animation.
**Preconditions**: Camera movements exist.
**Ideal path**: 3 — choose static, reset and confirm.
**Alternate paths**: Delete individual movements from their applied rows or Timeline; this preserves other camera moves.
### Steps
1. In Camera Movements, select Static / locked-off -> the reset option appears.
2. Click Reset camera movement… -> a confirmation appears.
3. Confirm -> camera movement clears while layer animations remain.
### Variations
- Cancel to keep the current camera moves.
### Edge Cases
- The reset also clears legacy camera tracks and restores default camera framing.

### Parallax and layer effects

Evidence: `src/studio/parallax.ts`, `src/camera/layer-effects.ts`.

## STORY-026: Set depth for foreground and background
**Type**: medium
**Topic**: Parallax and layer effects
**Persona**: Maya, adding depth to a layered scene.
**Goal**: Make the foreground respond more strongly to camera movement.
**Preconditions**: Foreground and background layers and a camera move exist.
**Ideal path**: 3 — open depth settings, adjust layers, apply.
**Alternate paths**: Multi-plane Camera assigns effective depth through planes; it does not replace the layer's stored depth.
### Steps
1. Open Parallax -> expand PARALLAX AND LAYER ANIMATION.
2. Select Depth-based parallax -> strength, per-layer Depth and Influence % controls appear.
3. Give the foreground a higher depth than the background -> the controls reflect the choices.
4. Click Apply depth settings -> values are saved to the scene.
5. Play the camera move -> inspect the layers' response.
### Variations
- Adjust Parallax strength · % or each layer's Influence %.
### Edge Cases
- Out-of-range depth or influence is rejected; reset response does not delete layer effects.

## STORY-027: Assign layers to depth planes
**Type**: medium
**Topic**: Parallax and layer effects
**Persona**: Leo, grouping several layers at the same depth.
**Goal**: Manage midground depth as a plane.
**Preconditions**: Two or more artwork layers exist.
**Ideal path**: 4 — choose planes, add, assign and apply.
**Alternate paths**: Edit each stored layer depth individually in Depth-based parallax.
### Steps
1. Open Parallax and expand ENVIRONMENTAL AND DEPTH EFFECTS -> choose Multi-plane Camera.
2. Click ＋ Add plane -> a plane appears.
3. Set its Name to Midground and Depth · % to 50 -> the plane is configured.
4. Assign the desired layers to Midground in the layer selectors.
5. Click Apply planes -> assignments take effect.
6. Select Delete plane and confirm if no longer needed -> its layers return to stored depth.
### Variations
- Add multiple planes at different depths.
### Edge Cases
- Invalid depth is rejected; deleting a plane does not delete its layers.

## STORY-028: Add independent layer drift
**Type**: medium
**Topic**: Parallax and layer effects
**Persona**: Nina, gently moving a cloud.
**Goal**: Animate a layer independently of the camera.
**Preconditions**: A cloud layer is imported.
**Ideal path**: 3 — choose effect, target and add.
**Alternate paths**: Floating / Bobbing and Ambient Looping also animate layers but offer different motions.
### Steps
1. In Parallax, choose Independent layer drift -> the effect form appears.
2. Select the cloud in Target layer -> the effect targets that layer.
3. Choose Horizontal direction and Gentle sway motion -> the motion is configured.
4. Set timing and click Add effect -> the effect appears in the applied list.
5. Play or scrub -> inspect the cloud movement.
### Variations
- Use Vertical, Both or Irregular movement.
### Edge Cases
- With no artwork the layer picker cannot provide a target; import artwork first.

## STORY-029: Reveal a layer with a mask
**Type**: medium
**Topic**: Parallax and layer effects
**Persona**: Maya, revealing a sign as the scene begins.
**Goal**: Animate a directional or radial reveal on selected artwork.
**Preconditions**: A target layer is imported.
**Ideal path**: 3 — choose reveal, select target, add.
**Alternate paths**: Layer fade changes opacity rather than revealing through a moving mask.
### Steps
1. In Parallax, choose Animated mask reveal -> reveal settings appear.
2. Select the target layer and Directional wipe -> choose the direction.
3. Enter a start and duration within the scene -> timing is set.
4. Click Add effect -> the effect is listed.
5. Play the scene -> review the reveal.
### Variations
- Select Radial reveal instead of Directional wipe.
### Edge Cases
- Invalid timing or a missing target prevents a valid effect.

## STORY-030: Adjust and reset depth-based scale
**Type**: medium
**Topic**: Parallax and layer effects
**Persona**: Leo, making nearer artwork read larger.
**Goal**: Try depth-based scaling and return to neutral if it feels excessive.
**Preconditions**: Artwork layers have useful depth values.
**Ideal path**: 3 — choose settings, apply, optionally reset.
**Alternate paths**: Arrange Scale changes an individual layer's base transform, not depth-responsive scaling.
### Steps
1. In Parallax, choose Depth-based Scale -> near/far and influence settings appear.
2. Adjust near/far scaling and an individual layer's influence -> the values change.
3. Click Apply scale settings -> the scene uses those settings.
4. Compare the preview while scrubbing a camera movement.
5. Click Reset to neutral if the look is too strong -> depth scale settings return to neutral.
### Variations
- Tune Perspective Warp or other environmental effects for different depth cues; these are not identical to depth scaling.
### Edge Cases
- Invalid scale or influence values are rejected and reported.

### Atmosphere and weather

Evidence: `src/studio/atmosphere.ts`, `src/camera/atmosphere.ts`.

## STORY-031: Add drifting fog
**Type**: medium
**Topic**: Atmosphere and weather
**Persona**: Maya, adding mood to a forest scene.
**Goal**: Add a timed ground fog treatment.
**Preconditions**: A scene is open.
**Ideal path**: 3 — choose fog, set timing and add.
**Alternate paths**: None found for creating an atmosphere effect.
### Steps
1. Open Atmosphere and expand ATMOSPHERE AND DEPTH -> the catalogue appears.
2. Choose Ground fog and drifting mist -> fog settings appear.
3. Set Start · seconds and Duration · seconds -> the treatment fits the scene.
4. Click Add effect -> fog appears in the applied list.
5. Play the preview -> inspect the drifting fog.
### Variations
- Adjust the effect parameters or Repeats inside the clip.
### Edge Cases
- Timing beyond the scene duration is invalid.

## STORY-032: Add rain or snow
**Type**: medium
**Topic**: Atmosphere and weather
**Persona**: Leo, exploring weather looks.
**Goal**: Add rain and compare an alternate snow treatment.
**Preconditions**: Scene is open with visible artwork.
**Ideal path**: 3 — choose weather, adjust, add.
**Alternate paths**: Snow or ash is a different effect, not the same rain setting.
### Steps
1. In Atmosphere, expand NATURE AND WEATHER -> weather presets appear.
2. Choose Rain / droplets -> its settings appear.
3. Adjust a rain parameter and click Add effect -> rain appears in the list.
4. Scrub the scene -> inspect the effect over time.
5. Choose Snow or ash and add it as a separate effect if desired.
### Variations
- Select Snow or ash first, then choose its Character.
### Edge Cases
- Simultaneously adding both is additive; delete an unwanted effect rather than assuming one replaces the other.

## STORY-033: Target foliage artwork
**Type**: medium
**Topic**: Atmosphere and weather
**Persona**: Nina, animating painted branches in wind.
**Goal**: Apply a layer-specific weather effect.
**Preconditions**: A foliage layer is imported.
**Ideal path**: 3 — choose effect, target layer, add.
**Alternate paths**: Parallax > Sway / Wind provides a separate layer effect with related motion controls.
### Steps
1. Open Atmosphere > NATURE AND WEATHER -> choose Foliage in wind.
2. Find the Target layers checkboxes -> available artwork layers are listed.
3. Select the branch layer -> it becomes the target.
4. Set timing and click Add effect -> the applied list names the target.
5. Play -> inspect the branch motion.
### Variations
- Add another foliage treatment with separate timing.
### Edge Cases
- This kind requires a target layer; without artwork, import one first.

## STORY-034: Duplicate, edit and delete an atmosphere effect
**Type**: medium
**Topic**: Atmosphere and weather
**Persona**: Maya, trying two fog timings.
**Goal**: Create a variant without losing the original.
**Preconditions**: A fog effect exists.
**Ideal path**: 3 — duplicate, edit, update.
**Alternate paths**: Timeline Edit opens the same effect editor; Timeline Delete removes an effect.
### Steps
1. In the Atmosphere applied list, click Duplicate on fog -> a copy is created.
2. Change Start · seconds on the selected copy -> its timing differs.
3. Click Update effect -> the copy is updated.
4. Click Delete on the unwanted copy -> a confirmation appears.
5. Confirm -> only that effect is removed.
### Variations
- Choose Cancel edit to discard the form edit.
### Edge Cases
- Cancel deletion to keep both effects.

## STORY-035: Apply haze to selected layers
**Type**: medium
**Topic**: Atmosphere and weather
**Persona**: Leo, softening distant mountains.
**Goal**: Target atmospheric haze to specific artwork.
**Preconditions**: Background and foreground artwork layers exist.
**Ideal path**: 3 — choose haze, select target, add.
**Alternate paths**: Whole scene targeting applies a different scope.
### Steps
1. Open Atmosphere > ATMOSPHERE AND DEPTH and choose Distant atmospheric haze.
2. Set Target to Selected layers -> the layer choices appear.
3. Select the mountain layer and adjust a haze parameter -> the target and intensity are set.
4. Click Add effect -> the applied list describes its target.
5. Compare the result while scrubbing the scene.
### Variations
- Choose Whole scene to apply the treatment across the composition.
### Edge Cases
- A missing target selection or invalid parameters must be corrected before a valid effect can be added.

### Timeline and playback

Evidence: `src/main.ts`, `src/studio/timeline.ts`, `src/studio/animate.ts`.

## STORY-036: Preview and scrub a scene
**Type**: short
**Topic**: Timeline and playback
**Persona**: Maya, reviewing an animated shot.
**Goal**: Watch, pause and return to the beginning.
**Preconditions**: A scene is open.
**Ideal path**: 3 — play, pause, restart.
**Alternate paths**: Space toggles playback when focus is outside editable controls; the seek slider jumps to a position.
### Steps
1. Click Play under the preview -> playback starts.
2. Click Pause -> playback stops at the current position.
3. Drag Seek to frame or Seek to seconds -> the preview updates.
4. Click Restart -> the playhead returns to the beginning.
### Variations
- Outside inputs, use Space, arrow keys, Home or End for transport.
### Edge Cases
- Playback stops at the end; starting again from the end restarts it.

## STORY-037: Seek to an effect in Timeline
**Type**: short
**Topic**: Timeline and playback
**Persona**: Leo, inspecting when fog starts.
**Goal**: Jump directly to an effect's start.
**Preconditions**: An atmosphere effect exists.
**Ideal path**: 2 — open Timeline and click its bar.
**Alternate paths**: Click a ruler time or scrub the transport; these do not necessarily jump to an effect's start.
### Steps
1. Open Timeline -> camera, parallax and atmosphere rows appear.
2. Click the fog effect's timeline bar -> the playhead seeks to the effect's start.
3. Review the preview and time readout -> the selected time is shown.
### Variations
- Click a ruler time to jump to an approximate quarter of the scene.
### Edge Cases
- Legacy tracks are shown as non-interactive bars.

## STORY-038: Retime a camera movement
**Type**: medium
**Topic**: Timeline and playback
**Persona**: Nina, changing the pace of a shot.
**Goal**: Move a camera action to 2–5 seconds.
**Preconditions**: A camera movement exists and the scene is at least 5 seconds long.
**Ideal path**: 3 — find row, enter timing and apply.
**Alternate paths**: Edit the camera movement in Camera Movements with Start · seconds and Duration · seconds.
### Steps
1. Open Timeline -> locate the movement row.
2. Enter 2 for Start and 5 for End -> the proposed timing is displayed.
3. Click Apply timing -> the movement bar and timing update.
4. Play or seek through the movement -> inspect the new pacing.
5. Save -> the project persists locally.
### Variations
- Use Edit on the row to open the movement editor instead.
### Edge Cases
- Invalid start/end or timing outside the scene is reported in the row and not applied.

## STORY-039: Retime and edit effects across workspaces
**Type**: medium
**Topic**: Timeline and playback
**Persona**: Leo, coordinating drifting artwork and fog.
**Goal**: Adjust timing in one place, then open an effect's detailed settings.
**Preconditions**: A Parallax layer effect and an Atmosphere effect exist.
**Ideal path**: 4 — adjust each timing and open the detailed editor when needed.
**Alternate paths**: Edit Start · seconds and Duration · seconds in each effect's home workspace instead.
### Steps
1. Open Timeline -> locate the layer effect and fog rows.
2. Enter Start and End for the layer effect, then click Apply timing -> its bar moves.
3. Enter Start and End for fog, then click Apply timing -> its bar moves.
4. Click Edit on the fog row -> Atmosphere opens the selected effect.
5. Change a setting and click Update effect -> the effect is updated.
### Variations
- Use Delete on a timeline row and confirm to remove an effect.
### Edge Cases
- Legacy rows are display-only rather than editable using these timing forms.

## STORY-040: Inspect a legacy track
**Type**: short
**Topic**: Timeline and playback
**Persona**: Nina, opening an older imported project.
**Goal**: Understand that an older track still exists without accidentally replacing it.
**Preconditions**: An imported scene contains legacy tracks.
**Ideal path**: 2 — open Timeline and inspect the legacy row.
**Alternate paths**: None found for editing legacy track timing in Timeline.
### Steps
1. Open Timeline -> legacy rows are displayed alongside newer effects.
2. Read the Legacy track name and timing -> the old animation is visible as reference.
3. Return to Camera Movements to decide whether to add a newer move.
### Variations
- Adding a new camera movement may offer to replace existing legacy camera tracks.
### Edge Cases
- Legacy bars are not editable from the Timeline row; confirmation is required before replacement.

### Export and recovery

Evidence: `src/main.ts`, `scripts/export-server.mjs`, `scripts/export-story-video.mjs`.

## STORY-041: Export one scene
**Type**: medium
**Topic**: Export and recovery
**Persona**: Maya, sending a shot for review.
**Goal**: Download only the active scene as MP4.
**Preconditions**: Scene is ready; local export service and FFmpeg/FFprobe are available.
**Ideal path**: 3 — choose scope, wait and download.
**Alternate paths**: Export All Scenes produces the whole story, not necessarily the same result.
### Steps
1. Select the desired scene in Story -> it becomes active.
2. Open Export -> the current scene name and duration are shown.
3. Click Export Current Scene -> progress and status appear.
4. Wait for Ready · MP4 verified -> the download link becomes available.
5. Click the Download link -> the MP4 is saved by the browser.
### Variations
- Choose High · sharper, slower before exporting.
### Edge Cases
- The export button is disabled during the job; service errors are shown rather than a download link.

## STORY-042: Export the complete story
**Type**: medium
**Topic**: Export and recovery
**Persona**: Leo, delivering a two-scene film.
**Goal**: Download the ordered story as one MP4.
**Preconditions**: A project contains two or more scenes and the export service is running.
**Ideal path**: 3 — export all, wait and download.
**Alternate paths**: Export Current Scene omits other scenes.
### Steps
1. In Story, inspect the scene order -> the intended first and second shots are listed.
2. Open Export -> Export All Scenes shows scene count and total duration.
3. Click Export All Scenes -> the job renders and joins scenes in Story order.
4. Wait until Ready -> the MP4 link appears.
5. Click the download link -> the combined file is saved.
### Variations
- Reorder scenes first using ↑ Earlier or ↓ Later.
### Edge Cases
- An error in any scene can prevent the complete story export.

## STORY-043: Choose export quality
**Type**: short
**Topic**: Export and recovery
**Persona**: Nina, balancing file size against image quality.
**Goal**: Export a sharper version for final delivery.
**Preconditions**: Export service is running and a scene is ready.
**Ideal path**: 2 — select quality and export.
**Alternate paths**: Standard · smaller, faster is the default and trades quality for speed/size.
### Steps
1. Open Export and set Quality to High · sharper, slower -> the selection changes.
2. Click Export Current Scene -> the service uses the high-quality preset.
3. When ready, click the download link -> the MP4 is saved.
### Variations
- Use Standard for a quicker draft.
### Edge Cases
- High quality may take longer; the UI reports job status.

## STORY-044: Recover when the export service is unavailable
**Type**: medium
**Topic**: Export and recovery
**Persona**: Maya, running only the frontend by mistake.
**Goal**: Understand the failure and retry after the service is available.
**Preconditions**: A scene is ready but the local export service cannot be reached.
**Ideal path**: 3 — discover the service requirement, start it, retry.
**Alternate paths**: Start the complete development stack using `npm run dev:studio` before opening the app.
### Steps
1. Open Export and click Export Current Scene -> the attempt fails with a service connection message.
2. Read the message -> it suggests starting the app with `npm run dev:studio` and reloading.
3. Start the local stack with FFmpeg/FFprobe installed -> the service becomes available.
4. Reload and reopen the saved project -> return to Export.
5. Retry Export Current Scene and download when ready -> the job completes if prerequisites are satisfied.
### Variations
- If the service is slow rather than unreachable, the timeout message asks the user to check it.
### Edge Cases
- Unsaved changes should be saved before reloading; local server setup is outside the in-app UI.

## STORY-045: Recover from missing artwork during export
**Type**: medium
**Topic**: Export and recovery
**Persona**: Leo, importing a project with an unavailable image.
**Goal**: Replace the missing artwork and export successfully.
**Preconditions**: An imported project references an unavailable asset; replacement artwork is available and the service is running.
**Ideal path**: 4 — identify the layer, replace image, retry and download.
**Alternate paths**: Restore the referenced asset at its expected path rather than replacing the layer image.
### Steps
1. Open Export and start Export Current Scene -> the job reports an asset error.
2. Read the error to identify the layer -> note which artwork needs attention.
3. Open Arrange, select that layer and expand Advanced -> click Replace image….
4. Choose a valid PNG/JPEG/WebP replacement -> the layer is updated.
5. Return to Export and retry -> download when the job is ready.
### Variations
- The same recovery may be necessary for another scene before Export All Scenes succeeds.
### Edge Cases
- If the missing asset prevents the project from opening at all, replacement through the inspector may not be reachable; this needs a separate recovery path.

### Complete workflows

Evidence: `src/main.ts`, `src/studio/{layers-panel,arrange-viewport,layer-inspector,animate,parallax,atmosphere,timeline}.ts`.

## STORY-046: Create and deliver a two-scene illustrated story
**Type**: long
**Topic**: Complete workflows
**Persona**: Maya, an illustrator delivering a short forest film.
**Goal**: Create, animate and export an ordered two-scene MP4.
**Preconditions**: Artwork files are available; local export service and FFmpeg/FFprobe are running.
**Ideal path**: 12 — create project, import and compose, set motion and depth, add a second scene, review and export; each meaningful choice remains explicit.
**Alternate paths**: Start from the default project and rename it; use numeric transforms instead of canvas drag; export the current scene separately for review.
### Steps
1. Click ＋ New and name the project Forest Walk -> a blank scene opens.
2. Open Story and enter Opening in Scene title -> the first scene is named.
3. Set Duration · seconds to 8 -> the scene timing updates.
4. Open Arrange and click ＋ Import -> the file picker opens.
5. Select background and foreground artwork -> the layers appear.
6. Drag the foreground row above the background -> it draws in front.
7. Click Select tool and select the foreground in the preview -> handles appear.
8. Drag the foreground into place -> composition changes.
9. Open Camera Movements and choose Push-in / dolly-in -> the movement form opens.
10. Set timing and click Add movement -> the push is added.
11. Open Parallax and select Depth-based parallax -> layer depth controls appear.
12. Set foreground and background depth and click Apply depth settings -> camera response is configured.
13. Return to Story and click ＋ Scene -> a second blank scene opens.
14. Name it Clearing and set its duration -> the new shot is distinguishable.
15. Open Arrange and import artwork for the second scene -> the preview is populated.
16. Return to Story and review the order -> Opening precedes Clearing.
17. Click Save -> the project is stored locally.
18. Open Export, choose Export All Scenes and wait for Ready -> the combined MP4 is available.
19. Click the download link -> the browser saves the finished video.
### Variations
- Duplicate the first scene instead of adding a blank one if the second shot reuses its composition.
### Edge Cases
- If the export service is unavailable, save the project and restart using `npm run dev:studio` before retrying.

## STORY-047: Rework an imported project and export one shot
**Type**: long
**Topic**: Complete workflows
**Persona**: Leo, receiving a colleague's illustrated project.
**Goal**: Open the project, make a safe variant and export the revised scene.
**Preconditions**: A valid `.story.json` and replacement artwork are available; export service is running.
**Ideal path**: 10 — import, duplicate, replace, adjust, review and export.
**Alternate paths**: Duplicate the scene instead of duplicating the entire project; the scope of the copy differs.
### Steps
1. Click Open and select the project file -> an imported copy opens.
2. Open Project and choose Duplicate project -> a second project copy opens.
3. Open Project > Rename project and enter Forest Revision -> the copy has a distinct name.
4. In Story, select the scene to revise -> it becomes active.
5. Open Arrange and select the layer to replace -> Layer Properties appears.
6. Expand Advanced -> asset details and Replace image… appear.
7. Click Replace image… and choose the new artwork -> the image is swapped.
8. Open Transform and set Scale using its exact value -> the artwork is resized.
9. Click Centre under Align to canvas -> the layer is centred.
10. Open Camera Movements and edit an existing movement if present -> the editor shows its parameters.
11. Update its timing and click Update movement -> the change is applied.
12. Open Timeline -> inspect the movement row and playhead.
13. Play and pause the preview -> review the revision.
14. Click Save -> the copy is persisted locally.
15. Open Export and click Export Current Scene -> the selected shot renders.
16. Wait for Ready and click the download link -> the revised MP4 is saved.
### Variations
- If there is no existing movement, add a Push-in / dolly-in instead of editing one.
### Edge Cases
- If a missing source asset prevents opening, inspector replacement may not be reachable; restore the asset first.

## STORY-048: Build a layered weather treatment and retime it
**Type**: long
**Topic**: Complete workflows
**Persona**: Nina, animating a windy woodland illustration.
**Goal**: Organize artwork, add layer motion and atmosphere, then coordinate their timing.
**Preconditions**: Forest artwork layers exist or can be imported.
**Ideal path**: 10 — organize, select targets, add two treatments, coordinate timing and preview.
**Alternate paths**: Edit effect timing in Parallax and Atmosphere instead of the Timeline; Sway / Wind and Foliage in wind are distinct effects with related goals.
### Steps
1. Open Arrange and import background and branch images -> layers appear.
2. Click ＋ Folder and rename it Foliage -> a named folder appears.
3. Drag the branch into the folder -> it is grouped.
4. Click the branch row -> the layer is selected.
5. Open Parallax and choose Sway / Wind -> wind settings appear.
6. Select the branch layer and set timing -> the motion is targeted.
7. Click Add effect -> wind is listed.
8. Open Atmosphere and choose Ground fog and drifting mist -> fog settings appear.
9. Set its timing and click Add effect -> fog is listed separately.
10. Open Timeline -> both effects are visible as rows.
11. Enter Start and End for wind and click Apply timing -> wind timing changes.
12. Enter Start and End for fog and click Apply timing -> fog timing changes.
13. Click each effect bar -> the preview seeks to its start.
14. Click Play and observe the combined result -> check the timing.
15. Click Edit on the fog row -> Atmosphere opens that effect.
16. Adjust a parameter and click Update effect -> fog is refined.
17. Click Save -> the scene is stored locally.
### Variations
- Use Foliage in wind in Atmosphere instead of the Parallax wind effect, recognizing the controls differ.
### Edge Cases
- If timing falls outside the scene, Timeline shows a validation error; correct it before applying.

## STORY-049: Repair timing before shortening a scene
**Type**: long
**Topic**: Complete workflows
**Persona**: Leo, cutting a scene down for a deadline.
**Goal**: Shorten the scene without losing desired movement or atmosphere.
**Preconditions**: A scene has a camera move and fog ending after 8 seconds.
**Ideal path**: 7 — inspect, retime affected effects, shorten, preview and save.
**Alternate paths**: Delete an affected effect instead of retiming; edit in the effect's workspace rather than Timeline.
### Steps
1. Open Story and select the scene -> its current duration is visible.
2. Enter 8 in Duration · seconds -> the app warns about animation beyond the new end.
3. Open Timeline -> locate the camera movement and fog rows.
4. Enter 1 for camera Start -> the form reflects the new start.
5. Enter 6 for camera End -> the proposed end is before 8 seconds.
6. Click Apply timing -> the camera bar updates.
7. Enter 0 for fog Start -> the fog timing form changes.
8. Enter 7 for fog End -> it ends before the proposed scene end.
9. Click Apply timing -> the fog bar updates.
10. Click the camera bar -> the preview seeks to its start.
11. Click Play -> review the retimed motion.
12. Return to Story and enter 8 for Duration · seconds -> the scene shortens.
13. Click Restart -> preview returns to the start.
14. Play through the shot -> verify the new ending.
15. Click Save -> the revised scene is stored.
### Variations
- Delete an unwanted effect via its Timeline Delete button and confirmation.
### Edge Cases
- Any additional effect or keyframe beyond 8 seconds must also be retimed or removed.

## STORY-050: Prepare a project for a high-quality final export
**Type**: long
**Topic**: Complete workflows
**Persona**: Nina, exporting a final animated illustration after review.
**Goal**: Inspect composition and timing, save locally and download a high-quality MP4.
**Preconditions**: A composed scene and working export service are available.
**Ideal path**: 8 — inspect, adjust if needed, save, choose quality, export and download.
**Alternate paths**: Use Export All Scenes if the deliverable is the full story rather than the selected shot.
### Steps
1. Open Story and select the intended scene -> it becomes active.
2. Open Arrange and select the principal layer -> Layer Properties appears.
3. Open Advanced -> inspect the asset and on-canvas size.
4. Open Transform and adjust Opacity if needed -> the preview updates.
5. Click Select tool and Toggle grid -> the placement grid appears.
6. Drag the selected artwork into place -> its position updates.
7. Click the zoom percentage if the viewport has been panned -> the full canvas is centred at 100%.
8. Open Camera Movements -> inspect the applied movement list.
9. Open Parallax -> inspect applied layer effects and depth settings.
10. Open Atmosphere -> inspect applied atmospheric effects.
11. Open Timeline -> compare all visible effect timings.
12. Click Play and then Pause -> review motion.
13. Click Save -> wait for Saved locally.
14. Open Export -> inspect the selected scene and duration.
15. Set Quality to High · sharper, slower -> the final preset is selected.
16. Click Export Current Scene -> the job starts.
17. Wait for Ready and click the download link -> the verified MP4 is saved.
### Variations
- Use Standard · smaller, faster for a draft before the high-quality final.
### Edge Cases
- Export failure leaves no ready download link; inspect the error and retry after addressing the service or asset issue.

## Redundancy Candidates

### Duplicate paths (same goal, multiple routes)
- **Reimpose playback position**: transport scrubber vs. Timeline ruler times vs. Timeline effect bars. Same seek outcome at different granularities; Timeline bars additionally snap to an effect start.
- **Edit an effect's timing**: Timeline Start/End + Apply timing vs. the home workspace's Start · seconds/Duration · seconds. Same stored fields; Timeline predicts the retime for all effect types.
- **Open an effect editor**: Parallax/Atmosphere applied-list Edit, Timeline row Edit, and Camera Movements applied-list Edit. Same editors, three entry points; Timeline is the only cross-effect surface.
- **Delete an effect**: Delete on the applied row, Timeline Delete, and (camera only) replacing legacy tracks via confirmation. All destructive, some confirm and some are not.
- **Bring a layer to an edge**: Layer actions > Centre in canvas, Transform > Align to canvas Centre, and direct dragging. Align also offers four edges; the menu only centres.
- **Fit artwork to the frame**: Transform > Fit layer to canvas and Layer actions > Fit to canvas. Same command, two surfaces.
- **Reset a layer's transforms**: Transform > Reset transform and Layer actions > Reset transform. Same command, two surfaces.
- **Select several layers**: Ctrl/Cmd-click, Shift-click range, folder menu Select layers, and Filter layers then individual selection. Four different ergonomics for one concept.
- **Rename a scene**: Story > Scene title field vs. double-click the scene list and answer a prompt. Two different editing models for the same property.
- **Rename a project**: Project menu > Rename project prompt; no inline field exists. Only one route, but a prompt is used where Scene title has a field.
- **Rename a layer or folder**: double-click its name vs. row actions > Rename; both use a prompt.
- **Move a layer into a folder**: drag onto the folder vs. Layer actions > Move to folder. Both available.
- **Reorder layers**: drag-restack vs. Bring to front/Send to back. Drag is positional, the menu is absolute; the menu cannot place a layer between two others.
- **Reset depth configuration**: Parallax row Reset vs. Reset to neutral inside the settings form; the row reset asks for confirmation, the form reset applies immediately in several cases.
- **Learn depth**: Parallax Depth-based parallax row shows layer depth; Multi-plane Camera shows plane depth and stored depth; Arrange deliberately exposes none. Depth terminology appears in at least three surfaces with two different meanings (stored depth vs. plane assignment).
- **Reach atmosphere effects**: Atmosphere catalogue vs. Timeline obtain the same effects; Timeline cannot create them.
- **Obtain a final video**: Export Current Scene vs. Export All Scenes when the project has one scene. Identical output with two buttons.

### Duplicate information (same fact, multiple surfaces)
- **Project and scene name**: header project/scene, Story sidebar active-project card and its scene list, and scene title field. Each serves a context, but the header has no source-of-truth affordance.
- **Scene duration**: Story Duration · seconds, scene list `Xs`, preview ` / X.XXs total`, Export Current Scene info, and Timeline ruler. Five surfaces; different precisions and units.
- **Scene resolution and frame rate**: scene-summary `W×H` in Story, preview viewer-format (hidden in Arrange), and Export fixed 1920×1080 H.264. There is no single composition-settings surface.
- **Layer geometry**: viewport handles, Transform slider, exact numeric field, and Advanced On canvas values. Expected for an editor, but the Advanced values are read-only duplicates that can go stale while dragging.
- **Asset dimensions**: Advanced Asset size and On canvas, plus actual preview appearance and Arrange handles. Asset size is also implied by Fit to canvas with no visible source.
- **Layer name**: layer row, Layer Properties summary, tooltips and applied-effect descriptions (Parallax/Atmosphere). Functionally necessary for targeting.
- **Locked/visible state**: row controls, Layer Properties badges, and disabled inspector controls. Three encodings of one state; the badges and disabled state could be judged sufficient, or the row could be canonical.
- **Selection count**: `N layers selected` summary, the highlighted rows, and the viewport outline (primary layer only). Multi-selection outline behaviour is inconsistent with the text.
- **Movement/effect timing**: applied-list `Ns + Ns` summary text, Timeline bar geometry and labels, row form Start/End, and the playhead readout. The applied list uses start + duration, Timeline uses start–end, and the workspace form also uses start + duration. Unit convention drift (start+duration vs start/end) is a real clarity risk.
- **Effect target**: applied-list text, inspector Target control, and Atmosphere catalogue description. Only the applied list and Timeline show the target compactly.
- **Save state**: header save-status and the toast `Project saved locally`; both announce success.
- **Empty state guidance**: preview `Import artwork to begin arranging your scene.` and layer panel `No layers yet · Import artwork to begin arranging your scene.` with an import button. Two nearly identical prompts on the same screen.

### Overlapping features/tools
- **Parallax Sway / Wind** and **Atmosphere Foliage in wind** both animate the same foliage layers, with different parameter sets and storage. Jointly discoverable only by name.
- **Parallax Floating / Bobbing**, **Ambient Looping** and **drift** all add non-camera layer motion; the user must infer which to choose from descriptions alone.
- **Parallax Depth-based Scale**, **Perspective Warp**, **Multi-plane Camera** and **Depth-based parallax** all encode depth cues; only depth itself is stored on the layer, and only one workspace can edit it.
- **Atmosphere Depth-based blur**, **Foreground defocus** and **Distant atmospheric haze** all reduce clarity by depth; the distinctions live only in catalogue one-liners.
- **Atmosphere Light rays** and **Gentle light variation** both treat lighting as a timed effect.
- **Camera movements and layer effects** can both move a layer relative to the frame (e.g. Tracking / follow vs. Independent layer drift). Different models, similar visible result.
- **Scene title field** and **project rename prompt** both rename a core entity, with different interaction idioms.
- **Snap and grid** are separate toggles whose effect depends on each other (snapping to grid lines only when Grid is on). Two controls for one placement aid.

## Gaps & Recommendations
- **Uncovered verification**: keyboard transport conflicts (arrow nudge vs. frame step), mobile layout, screen readers, touch interactions, and real export-service failure behaviour need live checks. The Arrange browser check reported horizontal overflow at 390 px, so mobile is a likely real gap.
- **No undo/redo story anywhere**: every destructive action relies on confirmation or duplication. This is the largest cross-cutting friction and sees no alternate path to recovery.
- **No autosave or unsaved-changes guard story**: Save is manual, switching project saves silently, and closing the tab has no documented prompt. A recovery story is missing because the feature is missing.
- **Composition settings**: resolution exists only as project settings with no in-app editor; Export hard-codes 1920×1080. There is no story for changing output size, which may be intentional.
- **Advanced presets**: several camera, parallax and atmosphere kinds lack dedicated stories, so their UX is untested rather than judged.
- **Proposed next stories**: a frame-rate-change-with-animation recovery story, a mobile Arrange story, and an unsaved-close story once a guard exists.
