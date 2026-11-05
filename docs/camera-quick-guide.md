# Camera quick guide

Import and arrange artwork, then open **Camera Movements**. Expand a movement section, choose a move, set its start, duration and relevant controls, and select **Add movement**. Play or scrub to preview; use **Timeline** to edit or delete moves and **Save** to keep them.

New moves use a virtual camera with position, orientation and lens. Each image is a flat plane: depth 0 is farthest and depth 1 is nearest. The neutral view preserves the arranged composition. Basic spatial moves use constant speed and hold their endpoint.

- **Dolly** moves forward or backward along the viewing direction, turning smoothly toward the target and changing the relative size of near and far planes. **Zoom** changes lens magnification around an anchor without changing their relative scale.
- **Pan** turns the camera; **Truck** moves it sideways, so planes shift by different amounts. **Tilt** turns vertically; **Pedestal** moves vertically without turning.
- **Crane** follows a simple boom arc and adjusts its view toward a chosen point. **Diagonal** combines horizontal and vertical translation. **Tracking** follows an animated layer; **Reveal** moves only selected layers.
- Under **STYLIZED AND ADVANCED MOVES**, **Dutch tilt** rolls around a screen point; **Handheld** adds seeded drift; **Impact** produces a fading shake; and **Whip pan** turns quickly with optional blur.
- **Dolly zoom** changes distance and lens together to keep a chosen subject approximately the same size. **Rack focus** shifts layer blur between depths. **Orbit** arcs around a point or layer within a limited angle; its radius and elevation adjust the path.

The coordinate picker uses the middle-depth plane for scene targets; tracking positions and zoom anchors are screen coordinates. Flat images cannot reveal hidden sides or produce true 3D volume. Extreme transforms can put a plane across the near limit; such a plane is suppressed rather than rendered with invalid geometry. See [Camera movements](animation.md) for compatibility details.
