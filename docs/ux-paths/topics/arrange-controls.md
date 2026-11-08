# Arrange controls
Evidence: `src/studio/arrange-viewport.ts`, `src/studio/layer-inspector.ts`.

## STORY-001: Place and resize artwork directly
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

## STORY-002: Enter precise transform values
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

## STORY-003: Fit, align and reset a layer
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

## STORY-004: Inspect and replace an asset
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

## STORY-005: Navigate a zoomed composition
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
