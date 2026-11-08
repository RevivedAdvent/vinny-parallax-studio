# Complete workflows
Evidence: `src/main.ts`, `src/studio/{layers-panel,arrange-viewport,layer-inspector,animate,parallax,atmosphere,timeline}.ts`.

## STORY-001: Create and deliver a two-scene illustrated story
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

## STORY-002: Rework an imported project and export one shot
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

## STORY-003: Build a layered weather treatment and retime it
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

## STORY-004: Repair timing before shortening a scene
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

## STORY-005: Prepare a project for a high-quality final export
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
