# Scenes and story
Evidence: `src/main.ts`, `src/studio/project.ts`.

## STORY-001: Add a second scene
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

## STORY-002: Reorder the sequence
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

## STORY-003: Duplicate and remove a scene
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

## STORY-004: Set scene duration and frame rate
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

## STORY-005: Shorten a scene containing animation
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
