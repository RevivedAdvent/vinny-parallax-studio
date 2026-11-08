# App Discovery: StoryStudio

## Application Type
Local-first, single-page browser editor for 2.5D illustrated scenes and MP4 stories. Public studio entry is `/`; `?render=1` is an internal renderer entry requiring injected scene input, not an end-user workspace. No router, accounts, signup, billing, collaboration or permission tiers were found.

## Tech Stack
TypeScript, Vite, vanilla DOM, PixiJS; IndexedDB for projects. A separate local Node export service invokes Chromium and FFmpeg/FFprobe. Playwright scripts exercise workflows.

## User Roles
- Local creator: creates and edits projects, scenes, layers, motion and effects, saves locally and exports. All users share the same UI; layer lock is an editing constraint, not an account permission.
- Export operator: starts the local service and has FFmpeg/FFprobe installed; not an in-app role.

## Feature Map
### Project and onboarding
New, Open `.story.json`, Save, rename, duplicate, delete, project switching, and Open Vinny example. Blank preview asks for artwork. Save persists locally; switching projects saves the current project. Invalid imports and save failures surface errors.
### Story and scene management
Create, select, rename, duplicate, reorder, delete scenes; edit title, duration and frame rate with validation. At least one scene is required.
### Layer organization
Import PNG/JPEG/WebP artwork; select, filter, rename, duplicate, delete, visibility/lock, stack order, folder creation/rename/collapse/delete and membership; multi-selection and context menus. Deleting a folder keeps its layers.
### Arrange and viewport
Select/Pan tools, canvas move, uniform corner scale, rotation, nudge, pan, zoom, grid and snap. Inspector offers numeric/slider transforms, reset, fit, canvas alignment, image replacement and advanced asset details. Direct edits are unavailable in active perspective camera views.
### Camera movements
Basic, spatial and advanced movement presets; configure, add, edit, duplicate, delete and reset camera movements; pick canvas coordinates and target layers. Legacy camera track replacement asks for confirmation.
### Parallax and layer animation
Per-layer depth/influence, strength, depth-based scale and planes; add/edit/duplicate/delete independent layer effects including drift, transforms, framing, fade, masks, wind, floating, looping, shadow and perspective warp.
### Atmosphere
Catalogue-based atmosphere and weather effects, scene or layer targets, timing, parameters, looping, edit/duplicate/delete. Some kinds require artwork layers.
### Timeline and playback
Play/pause, restart, scrub and keyboard transport; Timeline shows camera, parallax, atmosphere and legacy tracks, seeks to bars/ruler, edits timing, and links to edit/delete actions. Frame vs seconds display depends on workspace.
### Export and recovery
Standard/high quality; Export Current Scene or Export All Scenes; progress/status and download; service and missing-asset errors. Export needs a running local service and FFmpeg/FFprobe. Loading, empty and failure states are handled where present.

## Navigation Structure
Header: New, Open, Save, Project menu. Seven workspace tabs: Story, Arrange, Camera Movements, Parallax, Atmosphere, Timeline, Export. Shared canvas preview and transport remain central; sidebars and inspector are workspace-dependent. Timeline Edit can open the corresponding effect workspace. No end-user deep-link routing or feature flags found.

## Data Entities
- Project: create/import/read/list/rename/duplicate/delete; IndexedDB persistence.
- Scene: create/select/rename/reorder/duplicate/delete; duration/fps edits.
- Layer: import/select/read/update/duplicate/delete/reorder; visibility, lock, geometry, depth, asset.
- Folder: create/rename/collapse/delete; organize existing layers without changing the renderer's flat draw order.
- Camera movement, layer effect, atmosphere effect: add/select/update/duplicate/delete and retime; depth settings and planes have apply/reset flows.
- Export job and download: create and poll via service; result is downloaded video.

## Integrations
- IndexedDB `storystudio-projects`: browser-local project storage.
- `/api/export`: local export service; FFmpeg/FFprobe and headless renderer produce MP4.
- Browser file picker: artwork and `.story.json` import. No OAuth or external SaaS integration found.

## Recommended Story Topics
1. Project and onboarding — first launch, persistence and project lifecycle.
2. Scenes and story — sequence composition, timing and validation.
3. Layers and folders — import, order, selection and organization.
4. Arrange controls — direct manipulation, exact transforms and view tools.
5. Camera movements — add, edit and target cinematic movement.
6. Parallax and layer effects — depth, planes and independent effects.
7. Atmosphere and weather — scene/layer treatments and lifecycle.
8. Timeline and playback — review, seek, retime and edit across effects.
9. Export and recovery — quality, scope, download and failure recovery.
10. Complete workflows — end-to-end creation, iteration and delivery.

## Evidence and limits
Source inventory: `src/main.ts`, `src/studio/{project,layers-panel,layer-commands,layer-inspector,arrange-viewport,animate,parallax,atmosphere,timeline}.ts`, `src/camera/{types,validate,atmosphere}.ts`, and export scripts. This is source-derived, not a browser walk. Touch, screen-reader behavior, real-service reliability and mobile usability require live verification. Undo/redo and dark/light mode switches were not found.
