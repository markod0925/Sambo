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

---

# 8. Lighting Model

Intensity drives:

* Moon glow radius
* Ambient vignette alpha
* Platform edge brightness

Never drop below:

```
intensity floor visibility ≈ 20%
```

Darkness overlay should:

* Multiply blend
* Never reach full opacity
* Preserve silhouette outlines

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

No excessive animations.

---

# 10. Editor UI Visual Alignment

Editor shares world aesthetic:

| Element          | Color     |
| ---------------- | --------- |
| Background       | `#05070F` |
| Panels           | `#0C1322` |
| Borders          | `#1B2A45` |
| Accent Buttons   | `#2A3E66` |
| Active Selection | `#4CC9F0` |

Minimap energy legend:

| Energy | Color     |
| ------ | --------- |
| Low    | `#3A4663` |
| Medium | `#3A86FF` |
| High   | `#F4D35E` |

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
