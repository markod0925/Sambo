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

## 4.4 Spring Boost (Green Layer)

For spring platforms (jump-amplifier surfaces).

| Role         | Color        | Hex       |
| ------------ | ------------ | --------- |
| Green Base   | Spring Green | `#2DC653` |
| Pulse Accent | Jade Pulse   | `#52B788` |
| Border Glow  | Mint Edge    | `#95D5B2` |

The green layer must read as utility/boost, not hazard.

---

## 4.5 Hazard Shock (Enemy Red Danger Window)

For hazard platforms (3 beats neutral, 1 beat shock).

| Role          | Color          | Hex       |
| ------------- | -------------- | --------- |
| Neutral Base  | Tinted Slate   | `#4F2A37` |
| Neutral Border| Tinted Edge    | `#754866` |
| Shock Base    | Enemy Crimson  | `#A4161A` |
| Shock Border  | Enemy Alert Red| `#FF4D6D` |

Shock state must read clearly as "unsafe now" without relying on audio.

---

## 4.6 Launch Guidance (Cool Utility)

For launch platforms (`launch30`, `launch60`).

| Role         | Color         | Hex       |
| ------------ | ------------- | --------- |
| Base Fill    | Launch Blue   | `#2F6FD3` |
| Border       | Cyan Edge     | `#4CC9F0` |
| Angle Guide  | Ice White     | `#CDEFFF` |

Guide line must remain thin and readable, and must not overpower collision silhouette.

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

## 5.9 Spring Platform

Static utility platform with jump-boost identity.

* Family: Green utility
* Fill base: `#2DC653`
* Pulse fill: `#52B788`
* Border: `#95D5B2`
* Subtle pulse is allowed, but must stay secondary to gameplay-critical beat/ghost state telegraphs
* Contrast must remain clear at low intensity and during world alpha clamp

---

## 5.10 Hazard Platform

Beat-locked danger platform (`3 neutral + 1 shock`).

* Neutral beats (1-3):
  * Fill: `#4F2A37`
  * Border: `#754866`
  * Alpha close to normal solid-platform readability
* Shock beat (4):
  * Fill: `#A4161A`
  * Border: `#FF4D6D`
  * Slight pulse tied to beat phase is allowed during shock
* Shock readability must be immediately clear at low intensity and without audio support.

---

## 5.11 Launch Platform

Directional utility platform with `onLand` trigger behavior.

* Fill: `#2F6FD3`
* Border: `#4CC9F0`
* Overlay: thin angle guide line in `#CDEFFF`
* Two runtime variants must remain visually explicit through the line angle:
  * `launch30`
  * `launch60`
* Guide line must remain secondary to the platform silhouette and collision readability.

---

## 5.12 Player

Player readability must remain high during movement arcs.

* Body base blockout: `12x19`, fill `#E8E6E3`
* Jump deformation: vertical stretch driven by absolute vertical speed (`|vy|`)
* At jump apex (`|vy|` near `0`), body returns close to neutral scale
* Spring-boost jumps must visibly stretch more than normal jumps because launch speed is higher
* Double-jump (air jump) should reuse the same core stretch language as base jump, without spring-specific over-stretch
* Apply subtle horizontal squeeze while stretching vertically to preserve mass readability
* Landing deformation: moderately pronounced damped "jelly" oscillation, scaled by landing impact speed and kept short/readable
* Combat deformation: stomping an enemy triggers a reduced jelly pop variant (shorter and less intense than landing)
* Torso marker: `3x3` square heart in `#3A86FF`
* Heart pulse timing must follow current BPM (metronome beat phase), not a fixed animation timer
* Direction cue: torso marker flips horizontally and swaps side with movement direction (`forward=left`, `backward=right`)
* Dash ghosting: spawn short body+heart afterimages while dash is active, with quick fade (`~180ms`) and directional tint (`forward` warm / `backward` cool)

---

# 6. Enemy Visual Identity

Enemies must be readable even at low intensity.
Shared border rhythm system:
* All enemies use a pulsing 2px outline that lerps from warm gray `#6B707C` to red `#FF4D6D`.
* Pulse timing is anti-phase against BPM downbeats (minimum on beat, maximum mid-beat).

## Patrol Block Enemy

* Shape: solid square
* Runtime blockout size: `15x12`
* Color: muted crimson `#A4161A`
* Base border tone: darker red `#660708` (runtime pulse applies shared red-gray anti-phase outline)
* No glow
* Placement rule: spawn baseline sits above platform top edge (no initial overlap with platform body)

Danger color distinct from warm energy palette.

---

## Hunter Flyer

* Shape: diamond or triangular form
* Runtime blockout size: `15x10`
* Core: dark red `#9D0208`
* Subtle eye/glow: `#FF4D6D`
* Motion trail: faint streak (low alpha)

Never use the cyan or gold families for enemies.

---

## Crimson Falling Rock

* Shape: round rock silhouette
* Runtime blockout size: circle radius `7` (approx `14x14` footprint)
* Core: vivid crimson `#C1121F`
* Border pulse accent: shared red-gray anti-phase pulse (`#6B707C <-> #FF4D6D`)
* Motion identity: vertical drop from above
* Pulse identity: scale tracks BPM beat phase, while border pulse stays in anti-phase for contrast

The falling-rock pulse must stay readable without overpowering beat/ghost platform telegraphs.

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
Vertical anchoring: moon center is raised by `20px` from the previous tuning while keeping halo partially visible when camera reaches the lowest gameplay view.
Moon core and halo keep a guaranteed minimum alpha for readability in very low-intensity states (moon >= 0.30, halo >= 0.12).
When darkness overlay enters high-opacity range, moon and halo use additional intensity compensation (alpha lift + color brightening toward white) to preserve legibility.

---

# 8. Lighting Model

Intensity drives:

* Moon glow radius
* Ambient vignette alpha
* Platform edge brightness
* Harmonic background band brightness and thickness

## 8.1 Harmonic Background Layer (RFC-001)

The gameplay and preview background includes a world-anchored harmonic shader layer.

Layering:

* Harmonic background renders behind world geometry.
* Harmonic background is static in world space (not camera/screen anchored).
* Darkness overlay remains active above world and harmonic background.
* Foreground readability (platform edges, enemies, player) has priority over background energy.

Color policy:

* Core background anchors: `#05070F`, `#0B1020`, `#111A2E`.
* Harmonic bands use the fixed 12-color pitch-class table from `GDD/RFC-001.md` Annex A.
* Current tuning applies a luma-preserving saturation boost so per-band chroma separation is more readable.
* No hue cycling outside that table.
* No high-saturation spikes.

Motion policy:

* Band animation is subtle and beat-linked (`uBeatPhase`) with slow time oscillation (`uTime`).
* Band rendering should prefer articulated ribbon lines: defined luminous core with a thin soft trail (not only diffuse fog bands).
* Curvature can be composite (multi-sine) to create arcing, interweaving movement, while avoiding hard jitter.
* Current tuning favors heavy interweaving: high-frequency secondary filaments and amplified cross-skew between wave components for frequent ribbon crossings.
* Pitch-class bins and intensity are smoothed on JS side to prevent jitter (`tauPC = 0.20s`, `tauIntensity = 0.12s`).
* No hard flashes, high-frequency flicker, or per-pixel noise.

Safety limits:

* At `uIntensity = 0`, output must stay near dark background values.
* Per-band additive contribution is capped (`<= 0.25` before final clamp).
* Shader output is opaque (`alpha = 1.0`) and background-only.

Never drop below:

```
intensity floor visibility ≈ 5%
```

Darkness overlay should:

* Multiply blend
* Never reach full opacity
* Use a slightly lighter baseline than the pre-harmonic implementation so the new background remains visible without reducing gameplay readability
* Preserve silhouette outlines
* Apply an intensity-driven world alpha clamp to gameplay actors (platforms, enemies, player) so level readability drops coherently with low intensity.
* Keep alpha baseline direction-agnostic at equal intensity (`idle` and `moving` must not diverge because of direction-only penalties).

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
* Gameplay camera must follow the player with runtime zoom fixed at `2.0x` and a 20% stronger upward follow offset (`y = -57.6`, previously `-48`).
* Runtime player blockout size is `12x19`.
* HUD/overlay screen UI must remain fully readable with camera zoom active (zoom-compensated position + scale for screen-anchored labels/panels).

Debug overlay (runtime):

* Top-right, screen-anchored, right-aligned monospace block.
* Color: dim pale blue (`#9DB6DE`) to avoid competing with primary HUD labels.
* Compact multi-row telemetry block:
  * audio mode, selected MIDI channel count, and de-click mode (`normal`/`strict`)
  * tempo status (current/target/rate/zone)
  * playback speed diagnostics (`expected beats/s`, `actual beats/s`, `% error`)
  * scheduler status (queue size, predictive queue size, lateness avg/max, underrun count)
  * current grid column, movement direction, step state, dash state (`active` / cooldown / `ready`), note event counts (`on/off`), and active voice count
  * harmonic telemetry (`top 3 pitch classes` + smoothed harmonic intensity)
  * alpha telemetry row (`level`, `player`, `moon`, `halo`, `dark`) with 2-decimal precision
* Audio de-click debug mode can be toggled at runtime with `F9`.
* Overlay must remain readable but secondary; no glow or animation.

Start screen controls:

* Top-right control cluster keeps two aligned horizontal sliders: `Volume` and `Difficulty`.
* Difficulty uses the same hard-edged slider language as Volume (track `#2A3244`, fill `#4CC9F0`, handle `#E8E6E3`).
* Difficulty slider has exactly three snap points with visible labels (`Easy`, `Normal`, `Hard`) under the track.
* Difficulty label text must include both mode name and BPM multiplier (`0.85x`, `1.00x`, `1.50x`) for immediate readability.

Pause menu controls:

* Pause overlay actions are `Continue`, `Restart`, and `Back to Start Screen`.
* `Restart` uses the cool accent button family (cyan) and replaces the previous `Quit` action.
* `Back to Start Screen` uses the danger button family (red fill, light-red text).
* Vertical order is fixed as: `Continue` (top), `Restart` (middle), `Back to Start Screen` (bottom).

Game over and victory menu controls:

* In `GAME OVER`, `Restart` and `Back to Start Screen` stay visually grouped with reduced vertical spacing; `Back to Start Screen` is moved upward.
* In `VICTORY`, `Restart` and `Next Level` stay visually grouped with reduced vertical spacing; `Next Level` is moved upward.
* In `GAME OVER` and `VICTORY`, `Back to Start Screen` must keep the red danger styling.

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
* MIDI transport buttons are icon-only:
  * play uses a triangle glyph (`▶`)
  * stop uses a square glyph (`■`)
  * keep `aria-label`/tooltip text in English (`Play MIDI`, `Stop MIDI`)
* `Level Save` controls expose editable `Default BPM fallback` plus read-only `Grid columns (auto)` status text (no editable grid-columns input)
* Segment BPM editing is first-class in the segments table and drives runtime tempo zoning
* `Level Save` panel includes audio-quality authoring controls:
  * profile selector (`performance`, `balanced`, `high`)
  * no manual numeric/style override fields in editor runtime export UI
* Editor playback-quality selector (MIDI parsing/playback) uses the same profile naming (`performance`, `balanced`, `high`) for consistency.
* Left control panel groups controls into separate bordered boxes:
  * `MIDI` box for MIDI browsing/loading, `Upload your file` action, transport, quality, and MIDI status
  * `Levels` box for level browsing/loading only
  * `Level Save` remains its own dedicated box (not merged with MIDI/Levels controls), and contains the base-name input plus `Save in Levels` / `Download Level` actions
  * `Debug` box is placed directly below `Level Save` and provides upload/conversion trace lines plus a `Clear debug log` action
* `MIDI` and `Levels` file selectors use an icon refresh control (`U+1F5D8`) positioned to the left of the dropdown; refresh button height must match the adjacent dropdown height and remain visually flush (no vertical step).
* `Upload your file` opens a centered modal with:
  * dark backdrop overlay to preserve focus on upload flow
  * panel title (`Upload your file`), supported-format hint (`MID, MIDI, WAV, MP3`), and concise status line
  * two equal-width actions (`Choose file`, `Close`) matching existing hard-edged button style
* Audio conversion progress uses a separate centered progress window:
  * title (`Converting audio to MIDI`)
  * live status line bound to conversion stage text
  * percentage label and horizontal fill meter in cool accent (`#4CC9F0`)
  * modal remains visible only while conversion job is active
  * progress percentage must not stay visually stale during long conversion stages (heartbeat updates keep motion/readability)
* Debug log presentation rules:
  * scrollable dark panel with compact monospace lines and timestamps
  * neutral lines use secondary text color, success lines use cool accent, errors use danger red
  * latest log entry auto-scrolls into view

Editor scrollbars must match runtime color families:

* Track: `#1B2A45`
* Thumb: `#4CC9F0`
* Thumb hover: lighter cyan tint

Layout editor grid must remain visually aligned with runtime snap rules:

* X-axis snap and grid lines anchored on runtime player start (`x = 150`)
* Grid spacing: `32px` on both axes
* Spawn guide line must overlap the snap-aligned anchor column
* Horizontal navigation uses a dedicated range scrollbar under layout actions (replacing left/right buttons)
* During MIDI playback, camera auto-scroll keeps the playhead in view (target window inside the canvas, not hard-centered)
* Platform kind label `static` is shown in the layout canvas for base platforms (runtime kind remains `segment`)
* Platform typing is driven by a right-click context menu (no rotate/cycle interaction)
* Context menu categories must remain grouped and lowercase:
  * `static`: `static`
  * `dissolving`: `beat`, `alternateBeat`, `ghost`, `reverseGhost`
  * `moving`: `elevator`, `shuttle`, `cross`
  * `launching`: `spring`, `launch30`, `launch60`
  * `hazard`: `hazard`
* Launch kinds draw an in-platform angle guide line (`launch30`/`launch60`) so angle intent is readable directly in layout view
* Layout canvas shows tempo-zone boundary bars in warm accent (`#FFB703`) with BPM labels
* While MIDI playback is active, the layout canvas shows a moving vertical playback cursor line in cyan (`#4CC9F0`) with `MIDI` label
* Top layout info strip shows `Current zone BPM` for the active camera area
* Layout actions include a preview toggle button (`Preview player: Off/On`) with cyan active state and clear pressed feedback
* Layout action row is intentionally minimal: only `Center spawn` and `Preview player: Off/On` are visible (no `Regenerate from segments` / `Delete selected` buttons)
* Multi-selection uses both:
  * box selection drag on empty canvas
  * `Ctrl+left click` toggle on platforms
* Selected platforms use the existing cyan accent highlight, and box-selection overlay uses translucent cyan fill + cyan stroke
* `Ctrl+C`/`Ctrl+V` editing is visual-canvas anchored; paste anchor is the copied selection bottom-left bounding-box point
* Drawing order must keep non-static platforms visually in front of static base platforms (`segment`): draw statics first, non-statics second.
* Layout canvas preview player style:
  * body block size `12x19` (`#E8E6E3`) with dark border for contrast on the editor background
  * heart marker `3x3` (`#3A86FF`) offset on torso side and pulse-synced to preview metronome beat phase
  * heart side flips with movement direction (forward/backward readability cue)
* Preview status line under the canvas stays concise and English-only:
  * control hint (`A/D or Arrows`, `W/Up/Space`)
  * state (`On/Off`) and live BPM telemetry (`current -> target`) while active
* During preview mode, camera follow prioritizes player tracking; MIDI cursor can remain visible but must not override preview follow behavior

Segments table conventions:

* Column headers use Title Case labels (not snake_case)
* Table content is scoped to selected platforms only (empty selection => empty body)
* Columns are `Kind`, `Patrol`, `Flying (s)`, `Falling Rock (s)`, and row-level `Delete`
* Numeric platform fields use compact inputs (75% width) for dense editing
* `Kind` uses the same platform naming shown in the context menu (`static`, `beat`, `alternateBeat`, `ghost`, `reverseGhost`, `elevator`, `shuttle`, `cross`, `spring`, `launch30`, `launch60`, `hazard`)
* Enemy columns are active only for selected `static` platforms (runtime `segment`); for non-static rows they remain disabled to avoid ambiguous mapping

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
- Keep enemy palette isolated from warm/cool platform families, except hazard shock state.

These assets are static sprite replacements for current primitive runtime shapes; animation is optional and not required for the baseline visual pack.

---

# 15. MIDI Authoring Screens (Editor)

Functional update aligned to current UI implementation:

- Editor keeps the existing visual language (dark indigo background, cyan/gold accents).
- No new decorative visual systems were introduced for MIDI fidelity updates.

Readability constraints:

- MIDI status labels must stay concise and in English (loaded/playing/stopped/error states).
- Runtime debug text may include one additional diagnostics line for playback speed (`expected/actual beats per second` plus error %); it must stay monochrome and non-promotional, with visibility toggle (`F10`).
