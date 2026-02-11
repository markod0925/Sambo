# **Game Design Document (GDD)**

## **Working Title:** *Sambo*

> **Elevator Pitch**
> *“Limbo meets Guitar Hero: every step is a note, every jump is a beat, and the moon is your conductor.”*

---

## **1. Game Overview**

**Genre:** 2D atmospheric platformer
**Engine Target:** Godot (prototype), Codex-assisted iteration
**Core Pillar:**

> Movement generates music.
> Music shapes visibility and space.
> Direction determines meaning.

The player explores a silhouetted world governed by a lunar metronome.
The beat is constant, but **musical intensity, articulation, and world legibility** are controlled by player movement direction and continuity.

This document defines a **prototype-level vertical slice** focused on validating:

* audio-driven mechanics
* beat-synchronized traversal
* procedural level generation from music

---

## **2. Core Gameplay Loop**

```text
Move forward
→ intensity increases
→ notes play forward
→ moon brightens
→ world becomes readable

Stop
→ intensity decays toward a residual floor
→ beat continues
→ world slowly darkens

Move backward
→ intensity decreases faster
→ notes articulate in reverse
→ moon dims
→ rewind-only elements may appear
```

There is **no fail state caused by darkness**.
Reduced visibility increases uncertainty, not punishment.

---

## **3. Core Systems**

---

## **3.1 Rhythm, Time, and Beat Synchronization**

### Global Metronome

* A global beat clock runs continuously at a fixed BPM.
* The beat is authoritative for:

  * musical note triggering
  * beat-sensitive platform phases
  * moon pulse animation

---

### Spatial Notes vs Temporal Beat (Critical Resolution)

**Problem:**
Notes are triggered by spatial progression (grid cells), but the beat is time-based.
Free movement speed would desynchronize music from the lunar pulse.

### Solution: **Snap-to-Beat Movement**

Player movement is **quantized and magnetized to the beat grid**.

**Rules:**

* Player input requests movement to the next grid cell.
* The character:

  * starts moving immediately
  * completes the step **exactly on the next valid beat subdivision**
    (¼ or ⅛ note, depending on tuning)
* Small speed corrections are applied invisibly.

```text
Input → movement queued
→ interpolation begins
→ arrival snaps to beat
→ note triggers in sync
```

**Design Result:**

* Music is always rhythmically correct
* Player does not need rhythm-game precision
* Level design can assume beat-aligned traversal

---

## **3.2 Musical Intensity & Visibility System**

### Intensity Variable

* `intensity ∈ [0.0, 1.0]`
* Continuous scalar
* Drives:

  * moon brightness
  * light radius
  * ambient contrast
  * access to certain mechanics

---

### Intensity Update Formula (Explicit)

```text
Forward movement:
intensity += movement_speed * intensity_gain_rate * delta

Idle:
intensity -= decay_rate * delta

Backward movement:
intensity -= movement_speed * intensity_loss_rate * delta
```

#### Suggested Initial Values (Playtest Targets)

```text
intensity_gain_rate  = 0.30
decay_rate           = 0.05
intensity_loss_rate  = 0.30
```

Intensity is clamped:

```text
intensity = clamp(intensity, residual_floor, 1.0)
```

---

### Residual Intensity (Visibility Safety Net)

**Problem Addressed:**
Stopping to think should not punish the player with total blindness.

**Solution:**
Introduce a **Residual Intensity Floor**.

* `residual_floor ≈ 0.2–0.3`
* Below this:

  * beat continues
  * moon still pulses faintly
  * silhouettes of critical platforms remain barely visible

**Result:**

* The player can always pause and reason
* Darkness communicates tension, not failure
* No soft-locks caused by visibility loss

---

## **3.3 Music Playback Direction & Audio Reversal**

### Chosen Implementation (Explicit)

✅ **Forward playback with envelope modulation (no raw audio reversal)**

**Why this choice:**

* Reverse playback of samples is brittle and artifact-prone
* Negative pitch shifting complicates tuning and musicality
* Envelope modulation preserves clarity and control

---

### Forward Movement (Normal Playback)

* Notes play in sequence
* ADSR envelope:

  * Fast attack
  * Natural decay
* Filter more open / brighter tone

---

### Backward Movement (Rewind Articulation)

* Notes remain forward-played
* Envelope is **inverted**:

  * Slow attack
  * Short decay
  * Minimal sustain
* Filter becomes darker / narrower

**Perceptual Result:**
The note feels like it is *fading in from the past* rather than asserting itself.

This approach:

* Preserves pitch and harmony
* Clearly communicates reversal
* Is lightweight to implement in Godot using envelope parameters

---

## **4. Platform Systems**

---

## **4.1 Beat-Sensitive Platforms (Timing Clarified)**

### Timing Model

* Platforms operate on a **4-beat loop**
* State changes occur **only on the downbeat (beat 1)**

#### Example Cycle

```text
Beat: |1        |2        |3        |4        |1
Plat: [SOLID]   [FADE]    [GONE]    [FADE]    [SOLID]
```

**Rules:**

* Fully solid for 1 beat
* Fade out over 1 beat
* Fully gone for 1 beat
* Fade in over 1 beat

---

### Telegraphing

To ensure fairness:

* Fade phases include:

  * subtle glow change
  * soft audio cue synchronized with lunar pulse
* Player can **anticipate**, not react blindly

---

## **4.2 Ghost Platforms (Rewind-Only Mechanic)**

Ghost Platforms are **solid only during backward musical articulation**.

**Rules:**

* Invisible / intangible during forward playback
* Appear and solidify when intensity decreases due to backward movement
* Fade out when returning to forward movement

---

## **4.3 Elevator Platforms (Beat Step Motion)**

Elevator platforms move vertically in a repeating beat-driven staircase loop.

**Rules:**

* Move by exactly 1 vertical grid level on each beat.
* Climb for 4 beats (`+1, +2, +3, +4` levels).
* Descend for the next 4 beats (`+3, +2, +1, +0` levels).
* Repeat continuously on an 8-beat cycle.

---

### Example Puzzle Pattern

1. Player moves forward → writes music
2. Player moves backward → ghost platforms appear
3. Player uses rewind-revealed geometry to traverse

**Design Goal:**
Rewind is not undo — it is a **constructive spatial action**.

---



## **4.3 Enemy Encounters & Player Lives**

### Enemy Type (Prototype)

The prototype includes two enemy archetypes:

* **Patrol Block Enemy** (ground)
* **Hunter Flyer** (airborne)

**Interaction Rules:**

* Jumping on top of an enemy defeats it.
* Touching an enemy from the side or from below damages the player.

This provides immediate readability and supports platforming skill checks without introducing complex AI.



### Patrol Block Enemy (Ground)

Ground enemies move back and forth on platform surfaces.

**Movement Rules:**

* They walk continuously left/right.
* They reverse direction when they hit a wall.
* They reverse direction when platform support ends (edge detection).
* They use a subtle vertical squash animation (`scale.y`) while patrolling to improve movement readability.

**Combat Rules:**

* Jumping on top defeats them.
* Side / below contact damages the player.

### Hunter Flyer (Airborne)

A flying enemy periodically enters from the **right side** of the screen and travels **right-to-left**.

**Movement Rules:**

* Horizontal motion is always right-to-left.
* It adjusts vertically to collide with the player (light homing).
* It does not interact with terrain/platform collision.
* If not defeated, it despawns after exiting the left side of the screen.
* It uses a subtle horizontal stretch animation (`scale.x`) to communicate airborne motion.

**Combat Rules:**

* The player can avoid it, or defeat it by jumping on top.
* Any non-stomp contact damages the player.

### Player Lives

The player starts each run with **5 lives**.

* Each damaging enemy contact removes 1 life.
* A short invulnerability window after a hit prevents instant multi-hit loss.
* Lives are shown directly in the HUD as hearts plus numeric count.

This system introduces light stakes while keeping the prototype accessible.


## **5. Procedural Level Generation (Audio-Driven)**

---

## **5.1 Audio Analysis Pipeline (Concrete Tools)**

Analysis is performed **offline**, not at runtime.

**Recommended Toolchain:**

* **Librosa (Python)** for:

  * BPM detection
  * RMS / energy curve extraction
* Output:

  * BPM
  * Smoothed energy curve
* Exported as **JSON**

```text
audio_analysis.json:
{
  "bpm": 120,
  "energy_curve": [0.12, 0.18, 0.45, ...]
}
```

Godot loads this data at level-generation time.

---

## **5.2 Energy Classification**

Energy curve is segmented into windows (2–5 seconds).

| Energy State | Meaning             |
| ------------ | ------------------- |
| Low          | Calm / orientation  |
| Medium       | Rhythm interaction  |
| High         | Precision / tension |

Hysteresis prevents rapid oscillation.

---

## **5.3 Energy → Level Design Mapping**

| Musical Energy | Level Design Characteristics                     |
| -------------- | ------------------------------------------------ |
| **Low**        | Wide platforms, low verticality, forgiving gaps  |
| **Medium**     | Intermittent platforms, beat-matching traversal  |
| **High**       | Precise jumps, vertical movement, light-critical |

Energy **selects and parametrizes templates** — it does not draw geometry directly.

---

## **5.4 Segment-Based Generation**

Levels are assembled from segments:

```text
Segment {
  duration_beats
  energy_state
  platform_types
  vertical_range
  rhythm_density
}
```

Procedural variation occurs **within authored constraints**.

---

## **6. Visual & Audio Style**

### Visual

* High-contrast silhouettes
* Moon as diegetic UI and light source
* Light radius proportional to intensity (never zero)

### Audio

* Generative soundtrack driven by movement
* Directional articulation (forward vs backward)
* No explicit rhythm UI — learning is perceptual

---

## **6.1 Implemented Visual Language (Current Phaser Build)**

### Global Look & UI Theme

* Runtime resolution: **960x540**
* Dark atmospheric base palette:
  * Background: `#05070f` / `#0b0f1a`
  * Main text: `#d7e2ff`
  * Accent glow/shadow: soft cyan-blue bloom
* Typeface strategy:
  * In-game HUD/menus: **monospace**
  * Web shell (`index.html`): system sans + framed game canvas
* The moon remains the primary diegetic visual anchor and pulses on beat changes.

### Start Screen (Implemented)

* Dedicated start scene with:
  * scrollable level list loaded from `Levels/*.runtime.json`
  * per-level best-time readout
  * volume slider with immediate audible preview
  * direct link to level editor (`/editor.html`)
* A dimmed gameplay **preview mode** runs in the background behind the start UI.

### Gameplay Overlay & States (Implemented)

* Darkness overlay alpha is driven by intensity with a non-zero visibility floor.
* HUD includes:
  * lives as hearts + numeric counter
  * timer
  * kill score with cumulative time discount display (`kills (-Xs)`, one decimal)
* Implemented state overlays:
  * pause menu (`ESC`)
  * game over panel
  * victory panel (time + best time + next level action)
* Victory time rule:
  * each defeated enemy grants a `0.2s` completion-time reduction
  * the kill HUD mirrors this in real time (e.g. `1 (-0.2s)`, `6 (-1.2s)`)

### Platform Visual Identity (Fill, Border, Alpha)

* **Segment platform**: fixed neutral slate (`#2A3244`) with muted steel border (`#3A4663`), no glow.
* **Beat platform** (`solid/fadeOut/gone/fadeIn`):
  * warm family mapped to VSG (`#F4D35E`, `#EE964B`, `#FFB703`)
  * phase alpha aligned to `1.0 / 0.5 / 0.05 / 0.5`
  * subtle pre-transition border telegraph in the final ~100ms of the beat
* **Alternate beat platform**:
  * solid on beats `1` and `3`, dimmed otherwise
  * dedicated orange family (`#FB8500` + `#FFB703`) to remain distinct from beat platforms
* **Ghost platform**:
  * active: electric cyan + ice highlight (`#4CC9F0`, `#CDEFFF`)
  * inactive: dark slate + deep azure border (`#121A2B`, `#3A86FF`)
* **Reverse ghost platform** (implemented extension):
  * forward solid: neon orchid + soft fuchsia (`#B5179E`, `#E056FD`)
  * backward weak: dark plum low-alpha state (`#3C0D3A`)
* **Elevator platform**:
  * blue family aligned to VSG (`#3A86FF` fill, `#4CC9F0` border)
  * moves one vertical grid level per beat
  * loops with 4-beat rise and 4-beat descent

### Runtime Visual Identity Update (VSG Alignment, Feb 2026)

* Moon now behaves as a state anchor:
  * low intensity uses soft grey (`#B0B7C3`)
  * forward motion warms to gold
  * backward motion cools to cyan
  * core + halo pulse scale remains subtle and BPM-synced
* Enemy palette now uses dedicated crimson tones (`#A4161A`, `#660708`, `#9D0208`, `#FF4D6D`) and no cyan/gold reuse.
* HUD and overlays remain monospace with the established runtime text color (`#D7E2FF`), keeping readability at low intensity.

---

## **6.2 Level Editor (Implemented Tooling)**

The project includes a browser editor at `/editor.html` for draft and runtime level authoring.

### Editor UX and Style Direction

* Same dark style family as runtime:
  * `#05070f` background
  * layered panel surfaces (`#0c1322`, `#121A2B`)
  * cool blue borders (`#1b2a45`, `#2a3e66`)
  * active selection accent aligned to VSG cool energy (`#4CC9F0`)
  * monospace typography
* Left control panel + right workspace layout.
* User-facing sections:
  * MIDI/Levels folder loaders
  * quality mode selector (`fast`, `balanced`, `accurate`)
  * runtime export box
  * segment table editor
  * live minimap
  * runtime platform layout canvas

### Minimap and Layout Editor

* Minimap renders segment energy with fixed color legend:
  * Low: gray-blue
  * Medium: blue
  * High: amber
* Layout editor supports:
  * camera scroll left/right
  * center on spawn
  * regenerate from segments
  * delete selected platform
  * left-click select/drag
  * right-click cycle platform type or create platform
* Platform type cycle:
  * `segment -> beat -> alternateBeat -> ghost -> reverseGhost -> elevator`
* Canvas rendering includes visible platform borders, selected-state highlight stroke, spawn guide line, and kind labels.

### Runtime Export Features

* Runtime export parameters:
  * BPM (20–300)
  * grid columns (1–128)
  * platform kinds are exported from explicit layout/platform type definitions
* Runtime generation guarantees:
  * spawn-support segment at player start
  * default platform width is 2 horizontal grid cells
  * auto-generation uses 2 beats per platform slot (8-beat segments -> 4 platforms)
  * each generated platform picks a random type from that segment's `platform_types`
  * each generated platform picks a random vertical level between `vertical_min` and `vertical_max`
  * generation avoids overlapping placements while building the lane
  * no forced moon-approach sequence is appended at runtime
  * moon reachability is authored by level design
* Enemy authoring per segment:
  * `patrol_enemies`
  * `flying_spawn_interval_ms`
  * runtime maps authored `segmentIndex` across available segment platforms to avoid front-loading on long mixed-platform levels
  * patrol spawn enforces local spacing/capacity so enemies do not overlap at spawn time
  * patrol allocation is spread across nearby segment platforms to reduce repeated same-segment clustering
* Moon movement boundary:
  * moon horizontal stop is tied to authored platform extent (level layout end), not synthetic grid coverage
* World bounds:
  * gameplay/camera width is derived from authored platform extent (grid columns are only a fallback when no platforms exist)

---

## **7. Prototype Scope**

**Included**

* One procedurally generated level
* Basic enemy encounters + 5-life HUD
* Patrol and flying enemy variants
* Beat-snapped movement
* Intensity-driven lighting
* Beat-sensitive platforms
* Ghost platform rewind puzzle

**Excluded**

* Narrative systems
* Advanced enemy AI
* Polished art assets

---

## **8. Technical Notes (Godot)**

* Global beat clock using `AudioServer` timing
* Movement interpolation synced to beat events
* Light intensity driven by smoothed intensity variable
* Procedural segments instantiated via scene templates
* Envelope modulation implemented via synth parameters or ADSR-controlled AudioStreamPlayers

Codex can assist with:

* Audio preprocessing scripts
* Generator tuning
* Rapid iteration on thresholds and curves

---

## **8.1 Technical Notes (Implemented Stack: Phaser 3 + TypeScript)**

* Current playable prototype stack is **Phaser 3** (`src/game/*`, `src/core/*`) with TypeScript build output in `dist/`.
* Beat/movement/intensity/platform logic is implemented in shared core modules and reused by:
  * browser runtime
  * CLI smoke simulator (`npm run play:cli`)
* Runtime level loading path:
  * start scene fetches `Levels/*.runtime.json`
  * selected level is passed to gameplay scene
* Editor and game are served by local Node server scripts under `scripts/`.

---

## **9. Design Guarantees**

The system guarantees:

* No failure caused by stopping or darkness
* Always-in-sync music
* Meaningful rewind mechanics
* Procedural levels that remain readable and intentional

---

## **10. Design Intent (Final Statement)**

This game is not about playing music correctly.
It is about **direction, momentum, and perception**.

> The player does not play music.
> **The player is the playback head.**
