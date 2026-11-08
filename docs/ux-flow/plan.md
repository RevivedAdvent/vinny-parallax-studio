# UX Flow Plan — StoryStudio

Date: 2026-11-08
Evidence: live pass against the local studio (dev:studio), 1400×900 unless noted.
Catalog: `docs/ux-paths/catalog.md` (50 stories).

## Selected journeys (8)
1. **STORY-046** Create and deliver a two-scene illustrated story — long end-to-end; touches onboarding, import, arrange, camera, parallax, scenes, save and export.
2. **STORY-011** Import a layered illustration — first moment of value; layer panel and empty states.
3. **STORY-016** Place and resize artwork directly — core Arrange manipulation.
4. **STORY-021** Add a push-in — core camera-movement creation.
5. **STORY-026** Set depth for foreground and background — depth editing and apply/reset flow.
6. **STORY-031** Add drifting fog — atmosphere catalogue and effect lifecycle.
7. **STORY-038** Retime a camera movement — Timeline timing edit and cross-workspace link.
8. **STORY-041** Export one scene — money path; status, download and environment failure.

Coverage check: project/onboarding (046), layers (011), arrange (016), camera (021), parallax (026), atmosphere (031), timeline (038), export (041). Scenes covered by 046; recovery via 041 failure state.

## Redundancy candidates (copied from catalog)
### Duplicate paths
- Seek/playback: transport scrubber vs Timeline ruler vs Timeline effect bars.
- Edit timing: Timeline Start/End + Apply timing vs workspace Start/Duration fields.
- Open effect editor: workspace applied-list Edit vs Timeline row Edit.
- Delete effect: applied-row Delete vs Timeline Delete vs legacy replacement confirm.
- Position layer: Centre in canvas menu vs Align to canvas Centre vs direct drag.
- Fit layer: Transform > Fit layer to canvas vs Layer actions > Fit to canvas.
- Reset transform: Transform section vs Layer actions.
- Multi-select: Ctrl-click vs Shift range vs folder Select layers vs filter.
- Rename scene: Scene title field vs double-click scene prompt.
- Rename layer/folder: double-click vs actions menu.
- Move layer to folder: drag vs Layer actions > Move to folder.
- Reorder layer: drag restack vs Bring to front/Send to back.
- Reset depth: applied-row Reset vs form Reset to neutral.
- Learn depth: Parallax depth row vs Multi-plane Camera vs stored depth in pickers.
- Atmosphere: catalogue creation vs Timeline editing.
- Final video: Current vs All when the project has one scene.
### Duplicate information
- Project/scene name: header, sidebar card, scene list, scene title field.
- Scene duration: Story field, scene list, preview total, Export info, Timeline ruler.
- Resolution/fps: Story summary, viewer format (hidden in Arrange), export fixed size.
- Layer geometry: viewport handles, slider, numeric field, Advanced read-only values.
- Asset dimensions: Advanced Asset size and On canvas.
- Layer name: row, inspector summary, effect descriptions.
- Locked/visible: row controls, inspector badges, disabled fields.
- Selection count: summary text vs rows vs single-layer viewport outline.
- Effect timing: applied list `start + duration` vs Timeline `start–end`.
- Effect target: applied-list text vs inspector Target control.
- Save state: header status vs toast.
- Empty guidance: preview prompt vs layer panel empty state.
### Overlapping features
- Parallax Sway/Wind vs Atmosphere Foliage in wind.
- Parallax drift vs Floating/Bobbing vs Ambient Looping.
- Depth-based Scale vs Perspective Warp vs Multi-plane vs Depth-based parallax.
- Atmosphere depth blur vs defocus vs haze.
- Atmosphere light rays vs light variation.
- Camera tracking vs layer drift.
- Scene title field vs project rename prompt.
- Grid and snap toggles.

## Screens captured
`docs/ux-flow/journeys/{046,011,016,021,026,031,038,041}-screens/`
