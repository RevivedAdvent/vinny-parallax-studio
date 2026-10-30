# Camera quick guide

StoryStudio moves flat illustrated layers, not a real 3D camera. Start with a background, character and foreground artwork. Select a layer to adjust its **Depth**: 0 is distant background; 1 responds most like foreground. Depth changes camera response, not which layer covers another; use **Bring forward** and **Send back** for drawing order.

## Make a move

1. Scrub to a starting frame. Choose a property and easing in the timeline. For Zoom, choose **Uniform Zoom** or **Dolly / Depth-based Zoom**, then click **＋ Camera keyframe**.
2. Select the track's diamond or duration bar. Adjust start and end frames and values using the sliders or exact number fields. Values outside a layer slider's convenient range can be typed directly. Camera values are constrained by that track's limits.
3. Set intensity: 100% applies the whole track, 0% contributes no movement. Preview with Play or the scrubber, then **Save**. Edits are not saved on every drag.

- **X (horizontal)** moves the camera left or right. Try a gentle pan to reveal a hidden part of a landscape. Positive camera X moves artwork left.
- **Y (vertical)** moves the camera up or down; this is translation, not a 3D tilt. Positive Y moves artwork up.
- **Zoom in / out** makes the composition look closer / farther away. A zoom value of 1 is neutral. Slowly push toward a character to make them feel important.
- **Uniform Zoom** scales layers together. **Dolly / Depth-based Zoom** scales them by different amounts according to depth. A mountain at low depth can stay relatively still while foreground leaves respond more. This difference in response is **parallax**.
- **Rotation / roll** turns the composition around the camera anchor. A slight roll can heighten a dramatic moment.
- The **camera anchor** is the point used for framing zoom and roll. It is part of the scene configuration; the current editor does not offer an anchor control.
- **Easing** changes the feel of movement: Linear moves evenly; Ease In starts slowly; Ease Out settles slowly; Ease In-Out does both. Hold stays at the start until the end frame. Overshoot and Settle moves past the target before settling, subject to track limits. Seeded Noise adds repeatable variation; adjust its seed, amplitude and frequency in the selected track.

The time display is minutes:seconds:frames. The total duration is shown in seconds; the final frame is one frame before that duration. With no form control focused, Space plays/pauses, left/right step a frame and Home/End jump to the first/last frame. Exporting a master requires an opaque, fully covered composition; see the [README](../README.md). For exact mechanics and limits see the [camera system reference](camera-system-reference.md).
