# Camera movements

Choose a movement in **Camera Movements**, set its start and duration, and preview by playing or scrubbing. Basic spatial moves interpolate at a constant rate and hold their endpoints. Timeline retains editing, deletion and timing controls; the coordinate picker fills relevant fields.

New movements use a calibrated 2.5D virtual camera. Layers are flat image planes at their assigned depth (background 0, foreground 1), projected with perspective; their neutral arrangement is unchanged. Dolly travels along the viewing direction, turning smoothly toward a target, and changes relative depth scale; zoom changes lens magnification around a screen anchor. Pan and tilt rotate the camera; truck and pedestal translate it. Diagonal combines translation; crane follows a simple boom arc and adjusts its view toward a chosen point, unlike a straight pedestal. Tracking follows the evaluated layer position; reveal offsets only the selected layers.

The picker maps scene targets to the middle-depth plane, so it is approximate when other planes are at different depths. Tracking and zoom use screen coordinates. The crane is a practical illustrated-camera path, not a full physical rig. Flat planes have no side surfaces or hidden artwork; image edges may enter the frame. Perspective is rendered as a subdivided mesh. Extreme transforms that cross the near plane or exceed safe projection bounds suppress the affected plane rather than emit invalid geometry.

Existing unversioned movements and legacy tracks retain their original evaluation and are not silently migrated. Editing an old movement keeps its original behaviour. New movements are versioned individually; when combined with old movements, the legacy composite is applied before the virtual camera. Adding a move to a scene with old camera tracks still asks before replacing those tracks; layer animation remains. Resetting the camera clears camera moves and tracks after confirmation.

## Stylized and advanced moves

Expand **STYLIZED AND ADVANCED MOVES** to add:

- **Dutch tilt / roll** rotates around a screen-space center, up to ±30 degrees. Its endpoint holds.
- **Handheld drift** uses a seed, speed and intensity to generate repeatable, smoothly varying translation and rotation. It fades in and returns to zero at the end.
- **Impact shake** is a short decaying oscillation that returns to the previous pose. Increase intensity for a stronger impact.
- **Whip pan** accelerates and settles over its duration, holding its signed angle (up to ±20 degrees). Optional horizontal blur is strongest during the turn and disappears at rest.
- **Dolly zoom** moves along the viewing direction and adjusts focal length together to hold the selected layer's size. Use a signed travel percentage (negative moves out, positive moves in) and an optional target layer; without one the point uses the middle-depth plane. Foreground and background still change relative scale. Strong existing rotations or off-axis targets make the size lock approximate.
- **Rack-focus framing** interpolates from a starting to an ending depth, or the current depth of an optional ending layer. Depth 0 is farthest and 1 nearest. Each flat layer receives an approximate Gaussian blur proportional to its distance from the focus plane; this is not per-pixel depth of field. The ending focus holds. Blur can cost GPU performance, especially on large scenes.
- **Orbit / arc** moves around a target layer or middle-depth point with an angle limited to ±12 degrees. End radius is a percentage of the initial subject distance (80–120%); values other than 100% create a gentle spiral, and elevation adds vertical travel. The lens shifts to retain the target's screen position. Flat artwork cannot show its hidden sides, so exposed edges and near-plane clipping remain possible.

Advanced effects use the version-2 camera and are evaluated directly at the requested timestamp, including after seeking or changing preview intensity. Virtual moves are applied in start-time order (ties retain their saved order); pose effects compose in that order and the last started rack focus supplies the focus setting. Transient shake and blur do not accumulate. All parameter values are validated on save/load. Blur uses Pixi filters on the preview renderer; it is an illustrated approximation, not a physical lens simulation.

Run `npm test`, `npm run test:camera-moves-browser`, `npm run test:camera-virtual-browser`, and `npm run test:camera-advanced-browser` to check the evaluator, authoring workflow and preview with real artwork.
