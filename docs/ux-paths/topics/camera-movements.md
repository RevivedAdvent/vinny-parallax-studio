# Camera movements
Evidence: `src/studio/animate.ts`, `src/camera/moves.ts`, `src/studio/timeline.ts`.

## STORY-001: Add a push-in
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

## STORY-002: Pick a point in the scene
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

## STORY-003: Edit and duplicate a movement
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

## STORY-004: Track an artwork layer
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

## STORY-005: Return to a static camera
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
