# Camera movements

Use **Camera Movements** to add a move. Set its start and duration in seconds. Movement progresses linearly and holds its final value. The scrubber previews it; save the project to keep changes.

- **Static / locked-off** clears camera movements after confirmation. Existing layer animation stays intact.
- **Push-in / dolly-in** moves toward an X/Y target and enlarges the composition. Coordinates are pixels from the top-left of the scene. The target reaches the center at the end of the move.
- **Pull-out / dolly-out** scales the composition down around the center.
- **Pan** targets a horizontal X coordinate; **tilt** targets a vertical Y coordinate. Camera movement right/down makes the artwork appear to move left/up.
- **Zoom** changes scale around the center without moving the viewpoint. Values below 1 zoom out; values above 1 zoom in.

New moves affect the complete composition equally, regardless of layer depth. Push uses flat-image translation and scaling: it cannot create a true perspective change without 3D geometry. Coordinates describe the camera's target position, not an extra image or visible marker.

**Timeline** shows each move below the preview. Enter start and end seconds and select **Apply timing**; Edit and Delete retain their existing functions. Click a bar to seek to its start. Legacy tracks are displayed read-only. Moves are evaluated by start time; later position targets take over their respective axis, and scale moves multiply. Overlapping moves combine. Scene duration cannot be shortened past an endpoint.

Select **Coordinate picker** in Camera Movements and hover over the preview to see scene X/Y. Click to remember a point, then select **Use picked point** to fill the available target fields. The picker accounts for the current new camera transform and does not appear in exports. Legacy depth-based camera tracks can make the reading inaccurate; use a neutral frame for those projects. The remembered point is temporary and resets when changing scenes or reloading.

Older projects keep their original tracks, easing and depth-based behavior for compatibility. Adding a new camera movement to such a scene asks before replacing its legacy camera tracks; layer tracks remain. Resetting the camera also removes legacy camera tracks. Preview and MP4 export use the same camera evaluator.

## Verification

Run `npm test`, `npm run test:camera-moves-browser`, and `npm run test:timeline-browser`. The browser checks cover movement editing, timeline timing, coordinate picking and save/reload.
