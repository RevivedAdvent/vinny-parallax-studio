# Atmosphere and weather
Evidence: `src/studio/atmosphere.ts`, `src/camera/atmosphere.ts`.

## STORY-001: Add drifting fog
**Type**: medium
**Topic**: Atmosphere and weather
**Persona**: Maya, adding mood to a forest scene.
**Goal**: Add a timed ground fog treatment.
**Preconditions**: A scene is open.
**Ideal path**: 3 — choose fog, set timing and add.
**Alternate paths**: None found for creating an atmosphere effect.
### Steps
1. Open Atmosphere and expand ATMOSPHERE AND DEPTH -> the catalogue appears.
2. Choose Ground fog and drifting mist -> fog settings appear.
3. Set Start · seconds and Duration · seconds -> the treatment fits the scene.
4. Click Add effect -> fog appears in the applied list.
5. Play the preview -> inspect the drifting fog.
### Variations
- Adjust the effect parameters or Repeats inside the clip.
### Edge Cases
- Timing beyond the scene duration is invalid.

## STORY-002: Add rain or snow
**Type**: medium
**Topic**: Atmosphere and weather
**Persona**: Leo, exploring weather looks.
**Goal**: Add rain and compare an alternate snow treatment.
**Preconditions**: Scene is open with visible artwork.
**Ideal path**: 3 — choose weather, adjust, add.
**Alternate paths**: Snow or ash is a different effect, not the same rain setting.
### Steps
1. In Atmosphere, expand NATURE AND WEATHER -> weather presets appear.
2. Choose Rain / droplets -> its settings appear.
3. Adjust a rain parameter and click Add effect -> rain appears in the list.
4. Scrub the scene -> inspect the effect over time.
5. Choose Snow or ash and add it as a separate effect if desired.
### Variations
- Select Snow or ash first, then choose its Character.
### Edge Cases
- Simultaneously adding both is additive; delete an unwanted effect rather than assuming one replaces the other.

## STORY-003: Target foliage artwork
**Type**: medium
**Topic**: Atmosphere and weather
**Persona**: Nina, animating painted branches in wind.
**Goal**: Apply a layer-specific weather effect.
**Preconditions**: A foliage layer is imported.
**Ideal path**: 3 — choose effect, target layer, add.
**Alternate paths**: Parallax > Sway / Wind provides a separate layer effect with related motion controls.
### Steps
1. Open Atmosphere > NATURE AND WEATHER -> choose Foliage in wind.
2. Find the Target layers checkboxes -> available artwork layers are listed.
3. Select the branch layer -> it becomes the target.
4. Set timing and click Add effect -> the applied list names the target.
5. Play -> inspect the branch motion.
### Variations
- Add another foliage treatment with separate timing.
### Edge Cases
- This kind requires a target layer; without artwork, import one first.

## STORY-004: Duplicate, edit and delete an atmosphere effect
**Type**: medium
**Topic**: Atmosphere and weather
**Persona**: Maya, trying two fog timings.
**Goal**: Create a variant without losing the original.
**Preconditions**: A fog effect exists.
**Ideal path**: 3 — duplicate, edit, update.
**Alternate paths**: Timeline Edit opens the same effect editor; Timeline Delete removes an effect.
### Steps
1. In the Atmosphere applied list, click Duplicate on fog -> a copy is created.
2. Change Start · seconds on the selected copy -> its timing differs.
3. Click Update effect -> the copy is updated.
4. Click Delete on the unwanted copy -> a confirmation appears.
5. Confirm -> only that effect is removed.
### Variations
- Choose Cancel edit to discard the form edit.
### Edge Cases
- Cancel deletion to keep both effects.

## STORY-005: Apply haze to selected layers
**Type**: medium
**Topic**: Atmosphere and weather
**Persona**: Leo, softening distant mountains.
**Goal**: Target atmospheric haze to specific artwork.
**Preconditions**: Background and foreground artwork layers exist.
**Ideal path**: 3 — choose haze, select target, add.
**Alternate paths**: Whole scene targeting applies a different scope.
### Steps
1. Open Atmosphere > ATMOSPHERE AND DEPTH and choose Distant atmospheric haze.
2. Set Target to Selected layers -> the layer choices appear.
3. Select the mountain layer and adjust a haze parameter -> the target and intensity are set.
4. Click Add effect -> the applied list describes its target.
5. Compare the result while scrubbing the scene.
### Variations
- Choose Whole scene to apply the treatment across the composition.
### Edge Cases
- A missing target selection or invalid parameters must be corrected before a valid effect can be added.
