# Layers and folders
Evidence: `src/main.ts`, `src/studio/layers-panel.ts`, `src/studio/layer-commands.ts`.

## STORY-001: Import a layered illustration
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

## STORY-002: Restack and rename artwork
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

## STORY-003: Group artwork in a folder
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

## STORY-004: Find and select several layers
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

## STORY-005: Hide, lock and delete a layer
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
