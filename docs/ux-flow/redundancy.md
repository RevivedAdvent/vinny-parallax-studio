# Redundancy and Information Architecture

Evidence: journey files 046, 011, 016, 021, 026, 031, 038, 041 and their screenshots; catalog redundancy candidates; live pass 2026-11-08.

## Duplicate Paths

| # | Goal | Routes | Verdict |
|---|------|--------|---------|
| 1 | Import artwork | `+ Import` (layer heading); `Import artwork` (empty layer state); canvas instruction is text-only | **Remove one.** Two buttons for one action; neither is primary-looking. Make the canvas CTA the canonical button and keep `+ Import` as the accelerator. Evidence: 011/01, 046/01. |
| 2 | Fit artwork to frame | Transform > `Fit layer to canvas`; Layer actions > `Fit to canvas` | **Keep both, mark Inspector canonical.** Context menu is a shortcut, not a second implementation. Evidence: 016/03; catalog. |
| 3 | Reset transforms | Transform > `Reset transform`; Layer actions > `Reset transform` | **Keep both** as above; label must state it also resets opacity. Evidence: 016/03. |
| 4 | Align/centre layer | Align to canvas (5 edges); Layer actions > `Centre in canvas`; direct drag | **Keep both.** Menu is a shortcut for the most common edge; the Inspector is canonical. Evidence: 016/03. |
| 5 | Retime an effect | Timeline Start/End + `Apply timing`; workspace Start + Duration + `Update effect`; effect applied-row `Edit` | **Keep both surfaces, unify the model.** Timeline is the canonical cross-effect view; workspaces edit parameters. The differing Start+Duration vs Start–End labels are drift, not a deliberate distinction. Evidence: 038/02 vs 031/02. |
| 6 | Delete an effect | Applied-row `Delete` (confirms); Timeline `Delete` (no confirmation observed); camera legacy replacement confirm | **Mark canonical and align confirmation.** Destructive action should behave the same everywhere. Evidence: 021/02, 031/02, 038/02. |
| 7 | Rename scene | Story `Scene title` field; double-click scene row → browser prompt | **Remove the prompt.** The inline field is better and already exists; two idioms for one property. Evidence: 046/02–03. |

## Duplicate Information

| # | Fact | Surfaces | Recommendation |
|---|------|----------|----------------|
| 1 | Selected layer name | Layer row; Layer Properties summary; movement/effect descriptions | **Keep.** The properties panel needs a target; the effect lists need disambiguation. |
| 2 | Scene duration | Scene row `2.0s`; `Duration · seconds`; preview `/ 2.00s total`; Export `Opening · 2.00 seconds`; Timeline ruler | **Canonical: preview total + scene row.** Export's restatement is useful for scope confirmation; Timeline ruler is a scale, not a duplicate. The observed disagreement (row `30.0s` vs field `1.5`) is a feedback bug worth fixing, not a redundancy. Evidence: 046/03. |
| 3 | `MP4 EXPORT` heading | Workspace caption/label and inspector heading | **Drop one.** The right panel heading is enough. Evidence: 041/01. |
| 4 | Empty-scene guidance | Canvas "Import artwork…"; layer panel "No layers yet / Import artwork…" | **Keep one.** Canvas carries the action; panel shows only "No layers yet". Evidence: 011/01, 046/01. |
| 5 | Locked/visible state | Row controls; inspector badges; disabled fields | **Keep** — row is the control, badges and disabled state explain consequences. |
| 6 | Save state | Header `Saved locally`; toast `Project saved locally` | **Keep header only.** The toast duplicates a persistent status and covers the transport row (seen in 011/01). Evidence: 011/01. |

## Overlapping Features

| # | Feature pair | Overlap | Recommendation |
|---|--------------|---------|----------------|
| 1 | Parallax Sway/Wind vs Atmosphere Foliage in wind | Both animate foliage layers with wind direction and strength | **Differentiate in copy and placement**, or merge into one foliage-wind effect. Today only descriptions distinguish them. Evidence: catalog; 026/01; 031/01. |
| 2 | Parallax drift vs Floating/Bobbing vs Ambient Looping | All add non-camera layer motion | **Keep**, but add a chooser table ("small drift / loop / particles") in the catalogue header. Evidence: catalog. |
| 3 | Depth-based Scale vs Perspective Warp vs Multi-plane vs Depth-based parallax | All encode depth response | **Keep distinct, one entry point:** a "Depth" group with four techniques. Today they appear as separate cards without grouping. Evidence: 026/01; catalog. |
| 4 | Atmosphere haze vs depth blur vs foreground defocus | All reduce clarity by depth | **Differentiate with one-line "use when"** rather than descriptions that all say "softens depth". Evidence: 031/01. |
| 5 | Camera tracking/follow vs layer drift | Both keep a subject stable/moving in frame | **Keep** (camera vs layer are different models); note in the tracking description that layer drift is the alternative. Evidence: 021/01. |
| 6 | Grid toggle vs Snap toggle | Snap to grid lines only matters when Grid is on | **Couple them:** enabling Grid offers snapping, or label Snap "Snap to centre and grid". Evidence: 016/01. |

## Hierarchy & IA

| Finding | Evidence | Recommendation |
|---------|----------|----------------|
| First launch asks to import but exposes no import control on the visible screen; the instruction says "in Arrange" | 046/01 | Add a primary **Import artwork** action to the empty canvas. |
| The right inspector column is empty on Story (`SCENE DETAILS` heading only) | 046/01 | Hide the column when it has no content or show real scene details (resolution, fps, layer count). |
| Applied-effects lists sit below long catalogues; in Atmosphere the created effect is off-screen | 031/02 vs 021/02 | Pin applied lists above catalogues in Camera Movements, Parallax and Atmosphere. |
| Effects are scene-scoped but Timeline gives no sign that other scenes contain effects | 038/01 (fog visible after scene switch) | Show scope in the Timeline header and link to other scenes' effects. |
| Depth is edited only in Parallax, while layer depth values are stored per layer | 026/01; Arrange help text | Keep, but surface a "Depth" column or badge in Arrange so the concept is visible where layers are managed. |
| `Save` is a top-level primary action while project switching saves implicitly | 046/01, 041/03 | Make saving automatic and demote Save to status. |
| Export is two primary buttons for one outcome | 041/01 | One Export action with scope selection. |
| Terminology drift: "movement" vs "effect" for camera objects; "Timeline" vs "Movement timeline" | 021/02, 038/02 | One name per object: Camera movement; Timeline. |
| Depth units drift: 0–1 prose vs 0–100% controls | 026/01 | Percentage only. |

## Counts
- Duplicate paths: 7 (3 to consolidate or remove, 4 to keep with one canonical surface).
- Duplicate information: 6 (2 to remove/merge, 4 justified repeats).
- Overlapping features: 6 (1 merge/differentiate decision, 2 grouping fixes, 3 copy fixes).
- IA findings: 9.
