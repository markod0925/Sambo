# **Sambo — Visual Style Guide**

---

# 1. Visual Philosophy

### Core Principle

The world is a rhythmic instrument.

Every visual element must reflect one of these:

* **Beat**
* **Intensity**
* **Direction**
* **State**

No decorative art.
No texture noise.
No realism.

Minimal geometry + controlled glow.

---

# 2. Overall Artistic Direction

## “Astral Minimal Geometry”

The world is:

* Abstract
* Cosmic
* Slightly architectural
* Emotionally quiet

The moon is not background decoration.
It is the conductor.

Geometry is planar and sharp-edged.
No organic shapes.

---

# 3. Global Palette System

We refine the current dark palette into a cohesive system.

## 3.1 Base World Palette

| Role                  | Color          | Hex       |
| --------------------- | -------------- | --------- |
| Deep Background       | Absolute Night | `#05070F` |
| Mid Background Layer  | Deep Indigo    | `#0B0F1A` |
| Secondary Plane       | Blue-Black     | `#121A2B` |
| Neutral Platform Base | Slate Blue     | `#2A3244` |
| Subtle Platform Edge  | Muted Steel    | `#3A4663` |
| Player                | Pale Ivory     | `#E8E6E3` |

### Rules

* Background never exceeds 15% luminance.
* Platform neutral tones must remain readable at intensity floor.
* Avoid pure black except for extreme shadow contrast.

---

# 4. Accent Color System (Gameplay Critical)

Colors represent state, not decoration.

## 4.1 Forward Energy (Warm Family)

Used for:

* Forward articulation
* Beat platform solid phase
* Rising intensity

| Role             | Color        | Hex       |
| ---------------- | ------------ | --------- |
| Primary Warm     | Solar Gold   | `#F4D35E` |
| Secondary Warm   | Amber Pulse  | `#EE964B` |
| High-Energy Edge | Bright Flame | `#FFB703` |

Glow: soft radial, not sharp bloom.

---

## 4.2 Reverse Energy (Cool Family)

Used for:

* Backward articulation
* Ghost platform activation
* Intensity decrease

| Role            | Color         | Hex       |
| --------------- | ------------- | --------- |
| Primary Cool    | Electric Cyan | `#4CC9F0` |
| Secondary Cool  | Deep Azure    | `#3A86FF` |
| Ghost Highlight | Ice White     | `#CDEFFF` |

Cool glow must feel colder, thinner, less expansive than warm glow.

---

## 4.3 Reverse-Ghost (Complementary Magenta Layer)

For reverseGhost platforms (forward-solid, backward-weak).

| Role         | Color        | Hex       |
| ------------ | ------------ | --------- |
| Magenta Core | Neon Orchid  | `#B5179E` |
| Highlight    | Soft Fuchsia | `#E056FD` |
| Dim State    | Dark Plum    | `#3C0D3A` |

Use sparingly. Must never overpower warm or cool families.

---

# 5. Platform Visual Language

Each platform type must be distinguishable at 50% opacity and 20% intensity.

---

## 5.1 Segment Platform (Neutral)

* Fill: `#2A3244`
* Border: `#3A4663`
* No glow
* Slight 2px edge highlight

Represents stability.

---

## 5.2 Beat Platform

4-beat cycle:

```
Beat: |1        |2        |3        |4        |1
State: SOLID → FADE → GONE → FADE → SOLID
```

Visuals:

| Phase    | Fill        | Border       | Alpha |
| -------- | ----------- | ------------ | ----- |
| Solid    | Solar Gold  | Bright Flame | 1.0   |
| Fade Out | Amber Pulse | Solar Gold   | 0.5   |
| Gone     | None        | None         | 0.05  |
| Fade In  | Amber Pulse | Solar Gold   | 0.5   |

Telegraphing:

* Slight border glow 100ms before state change.
* Moon pulse subtly syncs color warmth.

---

## 5.3 Alternate Beat Platform

Solid on beats 1 and 3.

Color:

* Muted orange family: `#FB8500`
* Border: `#FFB703`

Visually distinct from standard beat platform.

---

## 5.4 Ghost Platform

Active during backward articulation.

| State    | Fill           | Border     | Alpha |
| -------- | -------------- | ---------- | ----- |
| Active   | Electric Cyan  | Ice White  | 0.85  |
| Inactive | Darkened Slate | Deep Azure | 0.15  |

Glow only when active.

---

## 5.5 Reverse Ghost Platform

Opposite latch behavior.

| State         | Fill        | Border            | Alpha |
| ------------- | ----------- | ----------------- | ----- |
| Forward Solid | Neon Orchid | Soft Fuchsia      | 0.85  |
| Backward Weak | Dark Plum   | Faint Plum Border | 0.15  |

This must remain secondary to ghost platforms visually.

---

## 5.6 Elevator Platform

* Family: Blue gradient
* Fill: `#3A86FF`
* Border: `#4CC9F0`
* Subtle vertical glow pulse on beat

Movement clarity is more important than brightness.

---

## 5.7 Shuttle Platform

Uses the same mobile-platform palette as Elevator to keep "moving platform" readability consistent.

* Family: Blue gradient
* Fill: `#3A86FF`
* Border: `#4CC9F0`
* Horizontal beat motion readability takes priority over decorative effects
* Optional side-motion emphasis can be done with slightly stronger border alpha during lateral travel

---

## 5.8 Cross Platform

Uses the same mobile-platform palette as Elevator and Shuttle.

* Family: Blue gradient
* Fill: `#3A86FF`
* Border: `#4CC9F0`
* Motion pattern readability (`down -> left -> up -> right`) must remain clear at low intensity
* Use the same alpha/stroke behavior family as other mobile platforms, with only subtle phase accents

---

# 6. Enemy Visual Identity

Enemies must be readable even at low intensity.

## Patrol Block Enemy

* Shape: solid square
* Color: muted crimson `#A4161A`
* Border: darker red `#660708`
* No glow

Danger color distinct from warm energy palette.

---

## Hunter Flyer

* Shape: diamond or triangular form
* Core: dark red `#9D0208`
* Subtle eye/glow: `#FF4D6D`
* Motion trail: faint streak (low alpha)

Never use the cyan or gold families for enemies.

---

# 7. Moon (Diegetic UI Anchor)

Moon color adapts to state.

| State         | Core                | Glow           |
| ------------- | ------------------- | -------------- |
| Low Intensity | Soft Grey `#B0B7C3` | faint halo     |
| Forward       | Solar Gold          | Amber radial   |
| Backward      | Electric Cyan       | Cool thin halo |

Scale pulse: 2–4%
Glow pulse: synced exactly to BPM
Never distort or shake.
Horizontal anchoring: moon stop position is one platform slot (2 grid cells) to the right of the authored level-end platform extent.
Moon core and halo keep a guaranteed minimum alpha for readability in very low-intensity states (moon >= 0.30, halo >= 0.12).
When darkness overlay enters high-opacity range, moon and halo use additional intensity compensation (alpha lift + color brightening toward white) to preserve legibility.

---

# 8. Lighting Model

Intensity drives:

* Moon glow radius
* Ambient vignette alpha
* Platform edge brightness

Never drop below:

```
intensity floor visibility ≈ 5%
```

Darkness overlay should:

* Multiply blend
* Never reach full opacity
* Preserve silhouette outlines
* Apply a small extra alpha boost during backward movement so rewind reads as distinctly darker than idle.
* Apply an intensity-driven world alpha clamp to gameplay actors (platforms, enemies, player) so level readability drops coherently with low intensity.

---

# 9. HUD & UI (Runtime)

Current implemented style is aligned and should remain.

### HUD Colors

* Text: `#D7E2FF`
* Hearts: `#FF6B6B`
* Numeric overlays: pale blue

Typography:

* Monospace in-game
* Keep consistent letter spacing

Kill counter format:

* Bottom HUD score must render as `kills (-Xs)` with one decimal place (example: `6 (-1.2s)`), matching the runtime time-bonus rule.
* Timer must stay top-center and screen-anchored (independent from world width/camera scroll).

Debug overlay (runtime):

* Top-right, screen-anchored, right-aligned monospace block.
* Color: dim pale blue (`#9DB6DE`) to avoid competing with primary HUD labels.
* Six compact rows:
  * audio mode and selected MIDI channel count
  * tempo status (current/target/rate/zone)
  * scheduler status (queue size + jitter avg/max)
  * current grid column, movement direction, step state, note event counts (`on/off`), and active voice count
  * alpha telemetry row (`level`, `player`, `moon`, `halo`, `dark`) with 2-decimal precision
* Overlay must remain readable but secondary; no glow or animation.

No excessive animations.

---

# 10. Editor UI Visual Alignment

Editor shares world aesthetic:

| Element                 | Color     |
| ----------------------- | --------- |
| Background              | `#05070F` |
| Panels                  | `#0C1322` |
| Input Surface           | `#121A2B` |
| Borders                 | `#1B2A45` |
| Default Buttons         | `#1B2A45` |
| Primary Action Buttons  | `#F4D35E` |
| Interactive Hover State | `#4CC9F0` |
| Danger Actions          | `#FF6B6B` |
| Action Text             | `#05070F` |
| Body Text               | `#D7E2FF` |
| Secondary Text          | `#9DB6DE` |

Editor controls should use the same hard-edged UI language used by runtime overlays:

* Monospace typography
* Square corners for controls (avoid rounded-pill button language)
* Cyan hover/selection for interactives
* Warm gold for primary/confirm actions
* Red reserved for destructive actions
* `Back to Game` is a primary warm action and should be placed at top of the editor control panel
* Runtime export controls expose editable `Default BPM fallback` plus read-only `Grid columns (auto)` status text (no editable grid-columns input)
* Segment BPM editing is first-class in the segments table and drives runtime tempo zoning
* Runtime export panel includes audio-quality authoring controls:
  * profile selector (`performance`, `balanced`, `high`)
  * optional numeric overrides (polyphony, scheduler lookahead/lead, saturation)
  * synth style selector (`game`, `editorLike`, or preset default)
* Editor playback-quality selector (MIDI parsing/playback) uses the same profile naming (`performance`, `balanced`, `high`) for consistency.

Editor scrollbars must match runtime color families:

* Track: `#1B2A45`
* Thumb: `#4CC9F0`
* Thumb hover: lighter cyan tint

Layout editor grid must remain visually aligned with runtime snap rules:

* X-axis snap and grid lines anchored on runtime player start (`x = 150`)
* Grid spacing: `32px` on both axes
* Spawn guide line must overlap the snap-aligned anchor column
* Horizontal navigation uses a dedicated range scrollbar under layout actions (replacing left/right buttons)
* Platform kind label `static` is shown in the layout canvas for base platforms (runtime kind remains `segment`)
* Layout canvas shows tempo-zone boundary bars in warm accent (`#FFB703`) with BPM labels
* Top layout info strip shows `Current zone BPM` for the active camera area

Segments table conventions:

* Column headers use Title Case labels (not snake_case)
* Segment ID is read-only text (non-editable)
* `Segment BPM` is an editable numeric column (`20-300`) and appears immediately after Segment ID
* `Duration Beats` is fixed to `2` internally and not shown in table UI
* `Platform Types (CSV)` column is intentionally wider than numeric columns for readability
* `Vertical Min` and `Vertical Max` are compact numeric columns with matched width/visual weight
* `Vertical Min`, `Vertical Max`, `Patrol Enemies`, and `Flying Spawn Interval` inputs use a reduced visual width (75% of cell width)
* Flying spawn interval column is shown in seconds (`s`) and communicates disable state explicitly (`0 = Off`)
* `Rhythm Density` is not shown in the table UI
* `Energy State` is edited only through a single dropdown control (no duplicated colored badge above it)

Minimap energy legend:

| Energy | Color     |
| ------ | --------- |
| Low    | `#3A4663` |
| Medium | `#3A86FF` |
| High   | `#F4D35E` |

Minimap tempo markers:

* Tempo-change boundaries are rendered as vertical warm lines (`#FFB703`)
* Marker labels show target BPM near the boundary

---

# 11. Motion & Effects Rules

* No particle spam.
* No screen shake.
* No bloom overuse.
* All transitions ≤ 400ms.
* Beat telegraph must be subtle.

---

# 12. Visual Hierarchy Order

1. Moon
2. Player
3. Active platforms
4. Enemies
5. Environment
6. Background

Never violate this ordering.

---

# 13. Updated Visual Identity Summary

Sambo is:

* Dark indigo cosmos
* Warm gold forward motion
* Cool cyan rewind
* Crimson danger
* Minimal geometry
* Clean silhouettes
* Glow as language

It is not:

* Horror
* Neon cyberpunk
* Cartoon
* Painterly

It is a diagram of rhythm made playable.

---

# 14. AI Asset Production Rules (ChatGPT Images)

To keep generated static sprites aligned with this VSG, production must follow:

- `GDD/ASSET_PIPELINE.md` for export constraints and acceptance checks.
- `GDD/ASSET_PROMPTS_CHATGPT.md` for canonical prompt set.
- `GDD/ASSET_MANIFEST.json` for full required runtime asset list.

Mandatory constraints:

- Keep all assets in minimal geometric language; no texture noise, no realism.
- Preserve gameplay readability first (collision silhouette > decoration).
- Respect state color semantics from sections 4 and 5.
- Keep enemy palette isolated from warm/cool platform families.

These assets are static sprite replacements for current primitive runtime shapes; animation is optional and not required for the baseline visual pack.
