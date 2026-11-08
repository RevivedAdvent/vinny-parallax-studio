# Timeline and playback
Evidence: `src/main.ts`, `src/studio/timeline.ts`, `src/studio/animate.ts`.

## STORY-001: Preview and scrub a scene
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

## STORY-002: Seek to an effect in Timeline
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

## STORY-003: Retime a camera movement
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

## STORY-004: Retime and edit effects across workspaces
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

## STORY-005: Inspect a legacy track
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
