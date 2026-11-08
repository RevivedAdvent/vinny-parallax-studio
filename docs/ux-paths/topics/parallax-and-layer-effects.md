# Parallax and layer effects
Evidence: `src/studio/parallax.ts`, `src/camera/layer-effects.ts`.

## STORY-001: Set depth for foreground and background
**Type**: medium
**Topic**: Parallax and layer effects
**Persona**: Maya, adding depth to a layered scene.
**Goal**: Make the foreground respond more strongly to camera movement.
**Preconditions**: Foreground and background layers and a camera move exist.
**Ideal path**: 3 — open depth settings, adjust layers, apply.
**Alternate paths**: Multi-plane Camera assigns effective depth through planes; it does not replace the layer's stored depth.
### Steps
1. Open Parallax -> expand PARALLAX AND LAYER ANIMATION.
2. Select Depth-based parallax -> strength, per-layer Depth and Influence % controls appear.
3. Give the foreground a higher depth than the background -> the controls reflect the choices.
4. Click Apply depth settings -> values are saved to the scene.
5. Play the camera move -> inspect the layers' response.
### Variations
- Adjust Parallax strength · % or each layer's Influence %.
### Edge Cases
- Out-of-range depth or influence is rejected; reset response does not delete layer effects.

## STORY-002: Assign layers to depth planes
**Type**: medium
**Topic**: Parallax and layer effects
**Persona**: Leo, grouping several layers at the same depth.
**Goal**: Manage midground depth as a plane.
**Preconditions**: Two or more artwork layers exist.
**Ideal path**: 4 — choose planes, add, assign and apply.
**Alternate paths**: Edit each stored layer depth individually in Depth-based parallax.
### Steps
1. Open Parallax and expand ENVIRONMENTAL AND DEPTH EFFECTS -> choose Multi-plane Camera.
2. Click ＋ Add plane -> a plane appears.
3. Set its Name to Midground and Depth · % to 50 -> the plane is configured.
4. Assign the desired layers to Midground in the layer selectors.
5. Click Apply planes -> assignments take effect.
6. Select Delete plane and confirm if no longer needed -> its layers return to stored depth.
### Variations
- Add multiple planes at different depths.
### Edge Cases
- Invalid depth is rejected; deleting a plane does not delete its layers.

## STORY-003: Add independent layer drift
**Type**: medium
**Topic**: Parallax and layer effects
**Persona**: Nina, gently moving a cloud.
**Goal**: Animate a layer independently of the camera.
**Preconditions**: A cloud layer is imported.
**Ideal path**: 3 — choose effect, target and add.
**Alternate paths**: Floating / Bobbing and Ambient Looping also animate layers but offer different motions.
### Steps
1. In Parallax, choose Independent layer drift -> the effect form appears.
2. Select the cloud in Target layer -> the effect targets that layer.
3. Choose Horizontal direction and Gentle sway motion -> the motion is configured.
4. Set timing and click Add effect -> the effect appears in the applied list.
5. Play or scrub -> inspect the cloud movement.
### Variations
- Use Vertical, Both or Irregular movement.
### Edge Cases
- With no artwork the layer picker cannot provide a target; import artwork first.

## STORY-004: Reveal a layer with a mask
**Type**: medium
**Topic**: Parallax and layer effects
**Persona**: Maya, revealing a sign as the scene begins.
**Goal**: Animate a directional or radial reveal on selected artwork.
**Preconditions**: A target layer is imported.
**Ideal path**: 3 — choose reveal, select target, add.
**Alternate paths**: Layer fade changes opacity rather than revealing through a moving mask.
### Steps
1. In Parallax, choose Animated mask reveal -> reveal settings appear.
2. Select the target layer and Directional wipe -> choose the direction.
3. Enter a start and duration within the scene -> timing is set.
4. Click Add effect -> the effect is listed.
5. Play the scene -> review the reveal.
### Variations
- Select Radial reveal instead of Directional wipe.
### Edge Cases
- Invalid timing or a missing target prevents a valid effect.

## STORY-005: Adjust and reset depth-based scale
**Type**: medium
**Topic**: Parallax and layer effects
**Persona**: Leo, making nearer artwork read larger.
**Goal**: Try depth-based scaling and return to neutral if it feels excessive.
**Preconditions**: Artwork layers have useful depth values.
**Ideal path**: 3 — choose settings, apply, optionally reset.
**Alternate paths**: Arrange Scale changes an individual layer's base transform, not depth-responsive scaling.
### Steps
1. In Parallax, choose Depth-based Scale -> near/far and influence settings appear.
2. Adjust near/far scaling and an individual layer's influence -> the values change.
3. Click Apply scale settings -> the scene uses those settings.
4. Compare the preview while scrubbing a camera movement.
5. Click Reset to neutral if the look is too strong -> depth scale settings return to neutral.
### Variations
- Tune Perspective Warp or other environmental effects for different depth cues; these are not identical to depth scaling.
### Edge Cases
- Invalid scale or influence values are rejected and reported.
