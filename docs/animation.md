# Camera movements

Choose a movement in **Camera Movements**, set its start and duration, and preview by playing or scrubbing. Basic spatial moves interpolate at a constant rate and hold their endpoints. Timeline retains editing, deletion and timing controls; the coordinate picker fills relevant fields.

New movements use a calibrated 2.5D virtual camera. Layers are flat image planes at their assigned depth (background 0, foreground 1), projected with perspective; their neutral arrangement is unchanged. Dolly travels along the viewing direction, turning smoothly toward a target, and changes relative depth scale; zoom changes lens magnification around a screen anchor. Pan and tilt rotate the camera; truck and pedestal translate it. Diagonal combines translation; crane follows a simple boom arc and adjusts its view toward a chosen point, unlike a straight pedestal. Tracking follows the evaluated layer position; reveal offsets only the selected layers.

The picker maps scene targets to the middle-depth plane, so it is approximate when other planes are at different depths. Tracking and zoom use screen coordinates. The crane is a practical illustrated-camera path, not a full physical rig. Flat planes have no side surfaces or hidden artwork; image edges may enter the frame. Perspective is rendered as a subdivided mesh. Extreme transforms that cross the near plane or exceed safe projection bounds suppress the affected plane rather than emit invalid geometry.

Existing unversioned movements and legacy tracks retain their original evaluation and are not silently migrated. Editing an old movement keeps its original behaviour. New movements are versioned individually; when combined with old movements, the legacy composite is applied before the virtual camera. Adding a move to a scene with old camera tracks still asks before replacing those tracks; layer animation remains. Resetting the camera clears camera moves and tracks after confirmation.

## Parallax and layer animation

Open the **Parallax** tab and expand **PARALLAX AND LAYER ANIMATION** for depth response and layer-level effects. Effects are stored with the scene, evaluated from absolute time, and hold their end values; seeking in either direction is deterministic.

- **Depth-based parallax** scales the calibrated depth response of the virtual camera. **Parallax strength** multiplies every layer; per-layer **influence** multiplies one layer. 100% is neutral, 0% pins a layer to the camera so it ignores camera translation, and values above 100% exaggerate differential travel. Parallax scales each layer's camera translation inside the projection; it never offsets the image afterwards, changes layer depth, or reorders layers, and neutral settings render exactly as before. It applies to existing version-2 moves as well.
- **Independent layer drift** oscillates one layer in X, Y or both. Choose gentle sway (sine with phase and speed) or seeded irregular motion, amplitude in pixels, speed, phase, seed, start and duration. Motion ramps from and back to zero, so it never jumps.
- **Layer scale and rotation** interpolates start and end scale and rotation around the layer's centre. The Arrange transform stays the base value.
- **Foreground framing** moves one or more selected layers in from the left, right, top or bottom. Offsets are percentages of the frame (100% is just outside), so partial framing works. **Enter/exit cycles** alternates entry and exit; odd cycles end inside, even cycles end outside.
- **Layer fade** multiplies selected layers' opacity between start and end values. Arrange opacity remains the base, and other layers are untouched.
- **Animated mask reveal** masks one layer with a directional wipe or an expanding radial mask. Set direction or origin, start and end coverage, and edge softness. Masks use PixiJS alpha masks with cached gradient textures; fully revealed masks are removed.

Evaluation order: Arrange transform → camera tracks and layer effects (position offsets and rotations add, scale and opacity multiply, the latest reveal supplies the mask) → version-2 virtual-camera projection → reveal mask → render in layer order. Effects respect visibility, depth and ordering; camera-level and layer-level animation remain separate.

### Environmental and depth effects

Expand **ENVIRONMENTAL AND DEPTH EFFECTS** for seven more techniques. They use the same timing, validation, persistence and deterministic evaluation as the first group.

- **Sway / Wind** rotates selected layers around a configurable pivot (default bottom centre) with a small secondary push, gust harmonics, speed and phase. A phase spread gives each selected layer a slightly different phase so foliage does not move in lockstep. The layer centre is displaced to keep the pivot fixed; Arrange rotation is unchanged.
- **Floating / Bobbing** loops positional motion on X, Y or both, with optional small rotation. It ramps in and out over the effect duration and repeats exactly because it is evaluated from absolute time.
- **Ambient Looping** has two modes. **Layer loop** oscillates, drifts continuously or pulses opacity; use **tileable artwork** only when the image edges genuinely repeat, because tile mode wraps the layer instead of letting it slide away. **Particle loop** scatters the selected transparent artwork as seeded particles with bounded count (maximum 80), speed, size, opacity, lifetime and region. Particle positions come from the absolute timestamp and a fixed seed; they are never accumulated, so seeking is stable.
- **Shadow Movement** renders a cached silhouette of the selected layer beneath it, offset in a direction, tinted, softened with a blur filter, and moved by a slow periodic light drift. The source artwork is never blurred, recoloured or modified. The shadow follows the layer's Arrange transform, opacity and camera projection; a warp is not applied to the silhouette.
- **Depth-based Scale** multiplies layer size from depth before projection. Set the far (depth 0), near (depth 1) and reference multipliers, strength and per-layer influence. The reference depth stays exactly 1 and an absent or neutral setting returns exactly 1. This does not change depth or duplicate the virtual camera's perspective; it changes the plane's size only.
- **Multi-plane Camera** adds named intermediate planes with their own depth and assigns one or more layers to each. A plane only replaces that layer's depth for camera response and depth scale; stored depth, Arrange transforms and artwork draw order are untouched. Unassigned layers keep their stored depth, and malformed or duplicate planes are dropped on load.
- **Perspective Warp** animates one layer's four corners from the unwarped rectangle to a normalised quadrilateral on a textured quad mesh. Corners are validated for convexity, winding, non-collinearity and a safe coordinate range; self-intersecting or degenerate quads are rejected. Neutral corners render exactly as the unwarped layer. A warp changes the image surface only; it cannot reveal the hidden side of flat artwork.

Newer tile wraps, particle systems and warps replace older ones for the same layer; a shadow can coexist with them because it is a separate attached element. Neither environmental effects nor depth planes reorder artwork. Reveal masks remain frame-space, so a moving layer can slide beneath a stationary wipe.

## Atmosphere and visual effects

Open the **Atmosphere** tab and expand **ATMOSPHERE AND DEPTH** or **NATURE AND WEATHER**. All fourteen effects are stored on the scene as `atmosphere` entries with an id, kind, start, duration, loop flag, seed, target and effect-specific parameters. They reuse the existing layer evaluator, PixiJS renderer, depth model and filter cache; there is no second clock or timeline.

**Atmosphere and depth**

- **Ground fog and drifting mist** draws one to four soft translucent bands over the lower scene, inserted between the far and mid artwork planes where possible. Set density, opacity, edge softness, coverage, height, drift and period.
- **Distant atmospheric haze** desaturates, tints and lifts planes below a depth limit. The transition feather follows the stored Arrange depth; a whole-scene target is supported.
- **Volumetric-style light rays** is a stylized 2D/2.5D approximation, **not** true volumetric lighting. It draws a bounded fan of additive shafts from an origin with direction, count, width, length, spread, opacity and slow variation.
- **Dust, pollen and spores** emits seeded particles at several depths with size, opacity, speed, direction, lifetime, irregularity and region controls.
- **Depth-based blur** adds a focus-plane blur proportional to each plane's distance from a chosen depth, with an in-focus range, falloff and optional animated focus pull. It composes with camera rack focus and is capped at 24 px.
- **Gentle light variation** slowly modulates scene brightness and optionally tints selected layers, using smooth periodic and seeded noise terms rather than flicker.
- **Foreground defocus** softens only planes nearer than a depth threshold; the amount can animate over the clip.

**Nature and weather**

- **Leaves / petals drifting** uses a selected layer's artwork as the particle texture. Count, size, opacity, speed, rotation, lifetime, depth spread and region are bounded.
- **Foliage in wind** rotates selected layers around a pivot with gusts, phase spread and a small secondary push. It does not modify the stored Arrange rotation.
- **Clouds and sunlight** drifts selected layers with optional periodic oscillation, opacity and scale variation, and dims scene brightness on a separate sunlight period.
- **Rain / droplets** uses layered angled streaks with depth-dependent speed and an optional foreground droplet amount.
- **Snow or ash** shares the seeded particle field; ash is slower, dimmer, greyer and rotates.
- **Fireflies and insects** adds sparse additive glow points with independent pulses and a halo pass.
- **Waterfall mist / ripples** emits rising mist puffs from a region plus expanding elliptical ripple rings along its lower edge.

Atmosphere clips appear in the main **Timeline** under grouped **Atmosphere**, **Particles**, **Weather** and **Lighting** lanes. Looping clips are striped and labelled; the clip itself remains finite. Bars seek to the clip start, Edit opens the same inspector, Delete removes the effect, and the timing form retimes without changing any other parameter. Expanding or shortening a scene, or changing its frame rate, is rejected when an atmosphere endpoint would fall outside the new scene.

Evaluation is random-access and deterministic: every position, opacity and variation derives from the absolute timestamp, the effect seed and fixed-index hashes. There is no `Math.random()`, mutable PRNG state or accumulated frame delta. Particle counts, ray counts, ripple counts and blur are bounded, textures are cached per preview renderer, and sprites, filters and containers are disposed when artboards reload or the scene closes. Malformed effects and references to deleted layers are dropped on load; scene-targeted effects survive with no layers. Atmosphere settings are saved, imported and exported with the project.

Run `npm test` and `npm run test:atmosphere-browser` for the evaluator and real-artwork preview checks, in addition to the Camera, Parallax and Timeline browser suites.

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

Run `npm test`, `npm run test:camera-moves-browser`, `npm run test:camera-virtual-browser`, `npm run test:camera-advanced-browser`, `npm run test:parallax-browser`, and `npm run test:parallax-environmental-browser` to check the evaluator, authoring workflows and preview with real artwork.
