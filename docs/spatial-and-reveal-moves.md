# Spatial and reveal moves

Found in Story → Camera Movements under **B. Spatial and reveal moves**, below **A. Basic Cinematic moves**. All movements are constant-speed (no easing), evaluated from the scene time, so seeking gives the same result as playing.

These are 2D viewpoint shifts on the flattened composition, the same kind as Pan and Tilt. Every layer moves together; there is no depth parallax, and no 3D geometry or perspective change is simulated.

| Movement | What it does | When to use it | Controls | Limitations |
|---|---|---|---|---|
| Truck / lateral track | Slides the viewpoint sideways to a target X. | Side-on travel past a scene. | Start, duration, target X | Horizontal only. |
| Pedestal | Moves the viewpoint up or down, framing stays level. | Vertical reframing without tilting. | Start, duration, target Y | No rotation. |
| Diagonal drift | Moves the viewpoint to target X and Y in one continuous path. | Gentle combined drift. | Start, duration, target X and Y | Straight-line path only. |
| Crane / boom | Rises or descends to show more of the scene above or below. | Revealing height or lowering to ground level. | Start, duration, target Y | Vertical only. |
| Tracking / follow | Keeps the chosen layer near a screen position while the viewpoint moves. | Following a figure or object across the frame. | Start, duration, target layer, screen X and Y | The target is kept at its screen point by solving the viewpoint from its evaluated position. A stationary layer stays still. |
| Reveal move | Slides the selected foreground layers aside to uncover the artwork behind. | Opening a doorway or wiping a foreground. | Start, duration, layers to move, offset X and Y | Only selected layers move. The offset is applied on top of each layer's own position and is reversible by deleting the move. |

## Notes
- Coordinates are scene pixels, measured from the top left.
- Existing Push, Pull, Pan, Tilt and Zoom moves, and older saved projects, are unchanged.
- Use the Timeline to change timing or delete a move; use Edit to change its settings.
