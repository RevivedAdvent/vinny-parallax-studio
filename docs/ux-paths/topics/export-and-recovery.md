# Export and recovery
Evidence: `src/main.ts`, `scripts/export-server.mjs`, `scripts/export-story-video.mjs`.

## STORY-001: Export one scene
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

## STORY-002: Export the complete story
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

## STORY-003: Choose export quality
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

## STORY-004: Recover when the export service is unavailable
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

## STORY-005: Recover from missing artwork during export
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
