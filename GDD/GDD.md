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

* A global beat clock runs continuously with a **runtime tempo map** (`tempoMap`), not a single fixed BPM.
* The active BPM is selected by the current map zone (grid column range).
* BPM transitions are applied on beat subdivisions to avoid phase jumps.
* After boundary activation, BPM moves toward the zone target using configurable smoothing (`tempoSmoothingBpmPerSecond`) to reduce audio glitches.
* Start-screen difficulty applies a global BPM multiplier after zone selection:
  * `Easy`: `0.85x`
  * `Normal`: `1.00x`
  * `Hard`: `1.50x`
  * tempo-map shape and per-zone proportions are preserved; only absolute playback speed changes.
  * difficulty also configures lives + fall outcome:
    * `Easy`: `10` lives, falling below bounds respawns the player on the nearest `segment` platform
    * `Normal`: `5` lives, falling below bounds respawns the player on the nearest `segment` platform and removes `1` life
    * `Hard`: `5` lives, falling below bounds causes immediate death (`game over`)
* The beat is authoritative for:

  * musical note triggering
  * beat-sensitive platform phases
  * moon pulse animation

---

### Spatial Notes vs Temporal Beat (Critical Resolution)

**Problem:**
Notes are triggered by spatial progression (grid cells), but the beat is time-based.
Free movement speed would desynchronize music from the lunar pulse.

### Solution: **Continuous Movement with Light Beat Assist**

Player movement is continuous while input is held, with tempo-scaled inertia and bounded rhythmic assistance.

**Rules:**

* Holding directional input sets a target movement direction (`forward` or `backward`).
* Horizontal velocity evolves continuously:

  * acceleration toward target speed while input is held
  * friction-based deceleration toward zero while idle
  * stronger braking when reversing direction
* A light assist nudges position toward the nearest grid center only when both conditions are true:

  * player is within the grid proximity window
  * current time is within the subdivision proximity window
* Legacy grid notes are triggered when the player crosses logical grid columns, not on queued step arrivals.
* Jump stack supports one grounded/coyote jump plus one extra air jump (double jump).
* While airborne, lateral movement gains a `+20%` speed boost when the player is actively holding left or right input.
* Dash is triggered by fast double tap on left/right (within `240ms`), applies a short fixed burst, and uses a `3s` cooldown.

### BPM-Proportional Traversal and Enemy Motion

Traversal speed and inertia are derived from the **active zone BPM** so authored MIDI timing and gameplay pressure stay coherent across tempo changes.

```text
reference_bpm = 120
current_bpm = tempoMap[column]
tempo_scale = current_bpm / reference_bpm

max_speed_px_per_sec = traversal_distance_per_beat * (current_bpm / 60)
accel_px_per_sec2 = base_accel * tempo_scale
friction_px_per_sec2 = base_friction * tempo_scale
if reversing_input: accel_px_per_sec2 *= reverse_brake_multiplier
```

Consequences:

* Tempo can accelerate/decelerate within the same level.
* Continuous movement remains musically coherent through tempo-scaled inertia.
* Grid note timing stays stable via per-column crossing events and light beat/grid assistance.
* Movement and enemy pressure evolve with zone tempo rather than a single global BPM.

Enemy pacing follows the same tempo scale:

```text
enemy_speed = base_enemy_speed * tempo_scale
enemy_spawn_interval_ms = base_spawn_interval_ms / tempo_scale
```

This keeps pressure and readability coherent with the musical tempo of each zone.

Current prototype runtime tuning (Feb 2026):

* traversal distance baseline: `35.2px` per beat equivalent
* logical tempo/grid column width: `32px`
* dash tuning: `620px/s` for `150ms`, cooldown `3000ms`, tap window `240ms`
* acceleration: `640 px/s² * tempo_scale`
* friction: `980 px/s² * tempo_scale`
* reverse braking multiplier: `1.4`
* beat assist grid window: `2.75px`
* beat assist subdivision window: `24ms`
* max beat assist correction speed: `26 px/s`
* patrol enemy base speed: `45`
* flying enemy base horizontal speed: `90`
* flying enemy base homing rate: `45`
* falling rock base vertical speed: `120`

Tempo transition smoothing:

```text
current_bpm = move_toward(current_bpm, target_bpm, tempo_smoothing_bpm_per_second * delta)
```

`tempo_smoothing_bpm_per_second` is runtime-configurable per level (with engine default fallback).

Runtime mix architecture:

* note playback routes through a dedicated `music` bus
* metronome routes through a separate `metronome` bus
* master output includes a gentle limiter/compressor stage
* metronome applies subtle short ducking on the music bus to keep pulse readability

```text
Input hold
→ velocity integrates with accel/friction
→ light beat/grid assist (bounded)
→ grid column crossings detected
→ note triggers in sync
```

**Design Result:**

* Music is always rhythmically correct
* Player movement stays expressive and continuous
* Level design keeps tempo-driven readability and pressure

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

* `residual_floor ≈ 0.05–0.15`
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

✅ **Grid event playback from parsed MIDI (note on/off), with lightweight polyphonic synth**

The runtime parses the MIDI file and builds a grid-aligned event map:

* `column -> note_on[] + note_off[]`
* events are derived from MIDI start/end times, not from a single sampled pitch per column
* channel 10 (drums) is excluded from melodic playback
* playback can keep multiple concurrent notes (bounded polyphony)
* MIDI channel/note-range selection for runtime grid mapping is quality-profile aware:
  * `performance`: reduced capture (`maxChannels=3`, `42-92`) for stability
  * `balanced`: wider capture (`maxChannels=5`, `36-100`) for fuller harmony
  * `high`: broad capture (`maxChannels=8`, `32-108`) for closest editor parity
* grid-triggered note events are enqueued and dispatched by a dedicated audio scheduler (lookahead), decoupled from render frame pacing to reduce onset jitter

---

### Forward Movement (Normal Playback)

* On each crossed grid column, process:
  * note-off events first
  * then note-on events
* Runtime predicts upcoming forward columns using current movement speed:
  * `cellsPerSecond = 1000 / stepDurationMs`
  * `lookaheadSteps = clamp(round(cellsPerSecond * 0.5), 1, 3)`
  * if current velocity is unstable/low, prediction falls back to recent average forward step duration
* Predicted events are buffered with target timestamps and deduplicated with `direction:column:roundedTarget`.
* Crossing events reconcile with buffered predictions:
  * if the predicted event was already queued/dispatched, the crossing event does not retrigger it
  * if no prediction exists, the crossing event enqueues an immediate fallback event (no lost notes)
* Notes sustain until matching note-off is reached.
* Synth voice uses a brighter low-pass cutoff and fast attack for legibility.
* Idle continuity policy for forward playback:
  * micro-idle windows up to `300ms` keep buffered continuity and held voices
  * beyond `300ms`, pending forward predictions are purged and held voices are released
* Forward playback continuity target: scheduler lateness should stay at or below `30ms` during continuous rightward traversal.

---

### Backward Movement (Rewind Articulation)

* Reverse traversal applies the inverse transition on the same column:
  * forward note-on becomes note release
  * forward note-off becomes note start
* Backward-started notes are transient and auto-release (fade-out), not sustained.
* While moving backward, runtime now drains all currently sustained voices before triggering rewind transients, preventing held-note buildup during long backward holds.
* When movement input stops, any remaining active voices are released to avoid stuck drones.
* This preserves harmonic continuity while moving backward through authored musical states while keeping rewind audio readable and non-fatiguing.

**Result:**

* Much closer rhythmic/melodic behavior to source MIDI
* Preserved direction readability (forward vs backward)
* No dependency on external SoundFont middleware in the core prototype loop
* Voice lifecycle is click-safe:
  * no immediate global hard-cut when horizontal input briefly goes idle
  * short idle grace window before releasing held voices
  * smooth release ramps and legato handling for near-immediate retriggers on the same note
  * minimum hold time before release to reduce micro-clicks on dense note transitions
  * bounded polyphony with priority-based voice stealing (quiet/old voices are released first instead of FIFO-only policy)
* Runtime quality profiles are supported (`performance`, `balanced`, `high`) and the runtime schema still accepts optional per-level overrides:
  * max polyphony
  * scheduler lookahead/lead timing
  * saturation amount
  * synth style (`game` or `editorLike`)
  * editor Runtime Export UI intentionally exposes only the profile selector (no manual override fields)
* `editorLike` synth style aligns runtime oscillator/envelope behavior to editor playback (triangle-led timbre, faster linear attack/decay) for closer audible parity.
* Anti-click smoothing is applied on runtime release/ducking automations (target-based ramps) to reduce hiss/click artifacts between close notes.
* `high` profile keeps only light saturation by default to avoid transient frizz while retaining presence.
* Saturation curve updates are now applied only when saturation amount changes materially (not every note scheduling pass), reducing occasional zipper noise.
* Voice-stop tail timing is intentionally conservative so oscillator stop occurs after envelope decay settles.
* Scheduler telemetry now tracks predictive queue depth and timing reliability (`late avg/max`, `underrun` over `30ms` threshold).
* Runtime includes a live debug A/B toggle for de-click strategy (`F9`):
  * default mode at run start is `strict`
  * `normal`: default release/duck behavior
  * `strict`: slower release targets, longer oscillator stop tails, softer ducking, and reduced effective saturation

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

## **4.4 Shuttle Platforms (Beat Horizontal Sweep)**

Shuttle platforms move horizontally on beat, always snapped to the gameplay grid.

**Rules:**

* Move by exactly 1 horizontal grid cell on each beat.
* Follow the repeating beat sequence: `0, +1, +2, +3, +4, +3, +2, +1, 0`.
* Movement is strictly beat-driven and never interpolated between cells.
* If the player is standing on the platform, the player is carried by the same snapped horizontal delta.

---

## **4.5 Cross Platforms (4-Beat Cross Orbit)**

Cross platforms move on a 4-beat loop around their authored center, always snapped to the gameplay grid.

**Rules:**

* Radius is exactly 1 grid cell from the authored center.
* Beat sequence is fixed: `down -> left -> up -> right`.
* Positions map to grid offsets: `(0,+1) -> (-1,0) -> (0,-1) -> (+1,0)`.
* If the player is standing on the platform, the player is carried by the same snapped delta on each beat.

---

## **4.6 Spring Platforms (Boost Jump)**

Spring platforms are static platforms with a jump amplifier.

**Rules:**

* Visual family is dedicated green, distinct from beat/ghost/mobile families.
* Landing/standing behavior is identical to a normal solid platform.
* If jump starts from a spring platform (including coyote window), jump apex is exactly `2x` normal jump height.
* Implementation keeps gravity unchanged and scales launch velocity by `sqrt(2)` versus base jump velocity.

---

## **4.7 Hazard Platforms (Beat-Locked Shock Window)**

Hazard platforms are always solid, but only damage during a BPM-locked shock beat.

**Rules:**

* Global timing is tied to the metronome bar: `3 beats neutral + 1 beat shock`.
* Shock beat is the 4th beat in the global 4-beat loop.
* Neutral visual state is a red-tinted slate mix (`#4F2A37` + `#754866`) to pre-signal danger while remaining distinct from shock.
* Shock visual state uses enemy red (`#A4161A` + `#FF4D6D`) to maximize readability versus neutral state.
* No dedicated SFX.
* Contact during shock applies damage only (no instant-kill behavior).

---

## **4.8 Launch Platforms (On-Land Directional Boost)**

Launch platforms apply a directional impulse only when landed on from above.

**Rules:**

* Trigger condition: `onLand` (top crossing during vertical collision resolution).
* Runtime variants:
  * `launch30` (`30°`)
  * `launch60` (`60°`)
* Launch vector (`vx`, `vy`) is predefined per angle and scaled by BPM-driven traversal speed, so launch energy stays musically coherent across tempo zones.
* Current launch impulse magnitude tuning is `3x` the previous baseline (`LAUNCH_PLATFORM_SPEED_MULTIPLIER = 25.2`).
* Each launch platform renders a small line overlay showing launch angle.

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

The prototype includes three enemy archetypes:

* **Patrol Block Enemy** (ground)
* **Hunter Flyer** (airborne)
* **Crimson Falling Rock** (airborne dropper)
* Shared enemy border pulse: outlines lerp between warm gray (`#6B707C`) and red (`#FF4D6D`) in beat anti-phase (strongest mid-beat).

**Interaction Rules:**

* Jumping on top of an enemy defeats it.
* Touching an enemy from the side or from below damages the player.
* Enemy collision boxes are intentionally reduced to `90%` of the visual enemy body size to improve fairness/readability in tight movement windows.

This provides immediate readability and supports platforming skill checks without introducing complex AI.



### Patrol Block Enemy (Ground)

Ground enemies move back and forth on platform surfaces.

**Movement Rules:**

* They walk continuously left/right.
* They reverse direction when they hit a wall.
* They reverse direction when platform support ends (edge detection).
* Spawn anchoring is top-surface safe: patrol enemies spawn above the supporting platform top (not intersecting inside geometry).
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

### Crimson Falling Rock (Airborne Dropper)

A red round rock spawns above gameplay space and drops vertically.

**Movement Rules:**

* Spawn timing uses the same segment-trigger queue model used by flying enemies.
* Spawn position is clamped to the triggering segment lane and starts above the camera top edge.
* Vertical motion is straight down only (no horizontal homing).
* It despawns after leaving the lower gameplay boundary.
* Scale pulse is synced to BPM beat phase for immediate rhythmic readability.
* Border pulse uses the shared red-gray anti-phase enemy outline behavior.

**Combat Rules:**

* Stomp defeats it.
* Any non-stomp contact damages the player.

### Player Lives

Lives depend on selected difficulty:

* `Easy`: **10 lives**
* `Normal`: **5 lives**
* `Hard`: **5 lives**

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
  duration_beats = 2
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
* Gameplay camera follows the player with **2.0x zoom** and a 20% stronger upward follow offset (`y = -57.6`, previously `-48`).
* Runtime blockout scale tuning:
  * player body: `12x19`
  * player heart marker: `3x3` blue square on torso (`#3A86FF`), pulse-synced to current BPM
  * patrol enemy body: `15x12`
  * flying enemy body: `15x10`
  * falling rock enemy body: `14x14` (circle footprint)
  * enemy outlines: 2px red-gray anti-phase pulse (`#6B707C <-> #FF4D6D`)
* Player jump body-language:
  * player stretches vertically during jump arcs, with intensity driven by absolute vertical velocity (`|vy|`)
  * apex naturally returns near neutral scale (low `|vy|`)
  * spring-platform jumps produce stronger stretch due to higher launch speed
  * stretch cap is intentionally stronger (`PLAYER_JUMP_STRETCH_MAX = 0.34`) for a more elastic read
  * landing triggers a more pronounced damped "jelly" wobble (short squash/stretch oscillation) based on impact speed
  * enemy stomp also triggers a lighter/shorter jelly pop so combat contact reads as physical impact
  * dash spawns short-lived ghost afterimages of body + heart, tinted by dash direction and fading quickly (`~180ms`)
* Player directional torso cue:
  * heart flips horizontally and shifts side with movement direction
  * forward -> left side, backward -> right side
* Dark atmospheric base palette:
  * Background: `#05070f` / `#0b0f1a`
  * Main text: `#d7e2ff`
  * Accent glow/shadow: soft cyan-blue bloom
* Typeface strategy:
  * In-game HUD/menus: **monospace**
  * Web shell (`index.html`): system sans + framed game canvas
* The moon remains the primary diegetic visual anchor and pulses on beat changes.

### Harmonic Background Layer (RFC-001, Implemented)

* Gameplay and preview now render a world-anchored custom WebGL harmonic background (`SinglePipeline`) behind world geometry.
* The harmonic layer is static in world space (it is not screen/camera-anchored).
* The shader draws 12 horizontal pitch-class bands (`C..B`) driven by tick-based MIDI note activity, not by audio node state.
* Harmonic bands now use a sharper ribbon profile (crisp core + controlled halo) with composite wave curvature for a more articulated visual rhythm.
* Ribbon weaving was tuned up with much denser multi-wave interlacing to produce frequent crossings and a less diffuse read.
* Band chroma was increased with luma-preserving saturation so harmonic colors are clearer without violating background brightness safety.
* Band energy is deterministic under forward and reverse scrub:
  * incremental tick window updates for small deltas
  * full rebuild when scrub delta exceeds the configured threshold
* Runtime uniforms:
  * `uPC[12]`: normalized pitch-class bins (`Float32Array(12)`, no per-frame allocation)
  * `uIntensity`: movement-driven intensity (smoothed)
  * `uBeatPhase`: metronome beat phase
  * `uTime`, `uResolution`
* Smoothing policy:
  * pitch-class bins use exponential smoothing (`tau = 0.20s`)
  * intensity uses exponential smoothing (`tau = 0.12s`)
* Fallback policy:
  * if WebGL pipeline support is unavailable, runtime keeps the existing static background color path without errors.

### Start Screen (Implemented)

* Dedicated start scene with:
  * scrollable level list loaded from `Levels/*.runtime.json`
  * per-level best-time readout
  * best-time persistence keyed by level file name (not by list index) to keep records stable when alphabetical order changes
  * no fallback to index-based legacy keys
  * volume slider with immediate audible preview
  * 3-position difficulty slider (`Easy`, `Normal`, `Hard`) that controls runtime difficulty profile:
    * BPM multiplier (`0.85x`, `1.00x`, `1.50x`)
    * lives (`10`, `5`, `5`)
    * fall outcome (respawn nearest `segment` on `Easy/Normal`, death on `Hard`)
    * normal-mode fall respawn penalty (`-1` life per fall)
  * direct link to level editor (`/editor.html`)
* A dimmed gameplay **preview mode** runs in the background behind the start UI.

### Gameplay Overlay & States (Implemented)

* Darkness overlay alpha is driven by intensity with a non-zero visibility floor.
* Darkness overlay baseline was rebalanced to coexist with the harmonic shader layer while preserving foreground readability.
* Directional movement no longer applies extra darkness/visibility penalties at equal intensity; alpha floors are intensity-driven and stable between `step=idle` and `step=moving`.
* World actors (platforms, enemies, and player) are alpha-clamped by intensity using the same baseline rule in all movement directions.
* Moon core/halo keep a guaranteed minimum alpha (moon >= 0.30, halo >= 0.12) to preserve diegetic guidance at very low intensity.
* When darkness overlay is very high, moon core/halo apply dynamic visibility compensation (minimum alpha lift + color brightening) to remain readable as a navigation anchor.
* HUD includes:
  * lives as hearts + numeric counter
  * timer (top-center, screen-anchored)
  * kill score with cumulative time discount display (`kills (-Xs)`, one decimal)
  * debug overlay alpha telemetry for level/world clamp, player, moon core, moon halo, and darkness overlay alpha
  * debug overlay harmonic telemetry row (top 3 pitch classes + smoothed harmonic intensity)
  * all HUD labels/panels remain screen-anchored under camera zoom (zoom-compensated position + scale)
* Implemented state overlays:
  * pause menu (`ESC`)
    * actions: `Continue`, `Restart`, `Back to Start Screen`
    * `Back to Start Screen` is the red danger action
    * pause menu no longer includes a `Quit` action
  * game over panel
    * `Restart` and `Back to Start Screen` are vertically closer (with `Back to Start Screen` moved up)
    * `Back to Start Screen` is the red danger action
  * victory panel (time + best time + next level action)
    * `Restart` and `Next Level` are vertically closer (`Next Level` moved up)
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
* **Shuttle platform**:
  * same mobile blue family as elevator (`#3A86FF` + `#4CC9F0`)
  * moves horizontally on beat with `0,1,2,3,4,3,2,1,0` loop
  * carries player horizontally while standing on top
* **Cross platform**:
  * same mobile blue family as elevator (`#3A86FF` + `#4CC9F0`)
  * moves on 4-beat cross pattern (`down -> left -> up -> right`, radius 1 cell)
  * carries player with both horizontal and vertical snapped deltas while standing on top
* **Spring platform**:
  * dedicated green family (`#2DC653` fill, `#95D5B2` border, pulse accent `#52B788`)
  * static solid behavior
  * jump from spring reaches exactly `2x` normal jump height
* **Hazard platform**:
  * neutral state uses a red-tinted slate mix (`#4F2A37` + `#754866`)
  * shock state uses enemy red (`#A4161A` + `#FF4D6D`)
  * 4-beat rhythm lock: beats `1-3` neutral, beat `4` shock
  * applies damage on contact during shock only
* **Launch platform**:
  * cool launch family (`#2F6FD3` fill, `#4CC9F0` border)
  * rendered with angle guide line (`#CDEFFF`) for readability
  * runtime variants `launch30` and `launch60` map to fixed launch angles
  * impulse vector scales with BPM-driven traversal speed baseline

### Runtime Visual Identity Update (VSG Alignment, Feb 2026)

* Moon now behaves as a state anchor:
  * low intensity uses soft grey (`#B0B7C3`)
  * forward motion warms to gold
  * backward motion cools to cyan
  * core + halo pulse scale remains subtle and BPM-synced
  * vertical anchor is raised by `20px` from the previous tuning while keeping partial halo visibility at the lowest gameplay camera extent
* Enemy palette now uses dedicated crimson tones (`#A4161A`, `#660708`, `#9D0208`, `#C1121F`, `#FF4D6D`) and no cyan/gold reuse.
* HUD and overlays remain monospace with the established runtime text color (`#D7E2FF`), keeping readability at low intensity.

---

## **6.2 Level Editor (Implemented Tooling)**

The project includes a browser editor at `/editor.html` for runtime-oriented level authoring.

### Editor UX and Style Direction

* Same dark style family as runtime:
  * `#05070f` background
  * layered panel surfaces (`#0c1322`, `#121A2B`)
  * cool blue borders (`#1b2a45`, `#3a4663`)
  * active selection accent aligned to VSG cool energy (`#4CC9F0`)
  * monospace typography
  * warm primary action buttons (`#F4D35E`) with dark text (`#05070F`)
  * MIDI transport row uses icon-only controls: play triangle (`▶`) and stop square (`■`) with English accessibility labels/tooltips (`Play MIDI`, `Stop MIDI`)
* Left control panel + right workspace layout.
* User-facing sections:
  * top `Back to Game` action
  * dedicated `MIDI` box (MIDI folder list/load, `Upload your file` popup action, transport controls, playback quality selector, MIDI status)
  * dedicated `Levels` box (level folder list/load)
  * both `MIDI` and `Levels` selectors place a refresh icon button (`U+1F5D8`) on the left side of the file dropdown, with the same control height as the dropdown and flush top/bottom alignment (no visual step)
  * dedicated `Level Save` box (level base-name, runtime audio-quality profile, BPM fallback, `Save in Levels`, `Download Level`)
  * dedicated `Debug` box under `Level Save` with timestamped upload/conversion diagnostics and manual clear action
  * segment table editor
  * runtime platform layout canvas
* Segment authoring source of truth:
  * segments are derived from MIDI or loaded JSON data
  * no manual `Load sample` / `Add segment` controls in the editor UI

### Layout Editor

* Layout editor supports:
  * horizontal camera scrollbar
  * auto-follow camera while `Play MIDI` is active (playhead-based scrolling)
  * center on spawn
  * playable preview toggle (`Preview player: On/Off`) in the layout action row
  * layout action row includes only `Center spawn` and `Preview player: On/Off`
  * keyboard capture for preview movement (`A/D` or arrows) and jump (`W/Up/Space`) outside form fields
  * preview resets player to spawn (`x = 150`) every time the preview toggle is turned on
  * preview movement speed and inertia scale with active tempo-zone BPM, using the same tempo-map zones as runtime layout export
  * preview jump + gravity + top-surface collisions against authored layout platforms
  * preview is decoupled from MIDI/audio generation (no note scheduling, no synth trigger from preview movement)
  * preview camera auto-follow keeps the player inside the layout viewport margins
  * layout editing (drag/add/type-change/delete platforms) remains available while preview is active
  * live MIDI playback cursor line (vertical) while `Play MIDI` is active
  * left-click select/drag
  * drag on empty canvas performs box selection
  * `Ctrl+left click` toggles individual platform membership in the current selection
  * `Ctrl+C` copies selected platforms
  * `Ctrl+V` pastes copied platforms using mouse pointer anchoring on the copied selection bottom-left bounding-box point (fallback: last known canvas pointer)
  * right-click opens a categorized context menu for platform typing/creation
  * X snap aligned to runtime player anchor (`x = 150`) with `32px` grid step
  * Y snap aligned to runtime vertical grid with `32px` spacing
  * canvas grid overlay aligned to the same runtime snap lattice
  * zone BPM readout at the top (`Current zone BPM`) based on current camera area
  * visible BPM boundary bars with per-zone BPM labels
* Platform context menu categories:
  * `static`: `static`
  * `dissolving`: `beat`, `alternateBeat`, `ghost`, `reverseGhost`
  * `moving`: `elevator`, `shuttle`, `cross`
  * `launching`: `spring`, `launch30`, `launch60`
  * `hazard`: `hazard`
  * editor label `static` maps to runtime/export kind `segment`
* `Segments` table now acts as a selected-platform inspector and shows only current selection rows (`Kind`, `Patrol`, `Flying (s)`, `Falling Rock (s)`).
* Enemy columns in the selected-platform inspector are editable only for `static` rows (runtime `segment`) and stay disabled for non-static platform kinds.
* Segment-enemy editor values for `Flying (s)` / `Falling Rock (s)` are shown in seconds and converted to runtime milliseconds during save/load.
* Canvas rendering includes visible platform borders, selected-state highlight stroke, spawn guide line, launch-angle guide line (`launch30`/`launch60`), and kind labels.
* Drawing priority in layout canvas is type-aware: `static` (`segment`) platforms are drawn first, while non-static platforms are drawn after and therefore appear in front.

### Runtime Export Features

* Runtime export parameters:
  * default BPM fallback (20–300) for generation/bootstrap
  * runtime audio quality profile selector (`performance`, `balanced`, `high`) as the only audio-quality authoring control in editor
  * per-segment BPM values (20–300) as authoring source for tempo zoning
  * grid columns are auto-derived from authored platform extent (not user-editable in the editor UI), clamped to `1..4096`
  * platform kinds are exported from explicit layout/platform type definitions
* Runtime outputs:
  * `Save in Levels` writes `<base>.runtime.json` to `Levels/`
  * `Download Level` saves the same runtime payload as a local `<base>.runtime.json` file in the browser
  * runtime export writes `tempoMap: [{ startColumn, bpm }]` built from segment BPM zones
  * runtime export includes a `segments` metadata snapshot used by the editor for lossless round-trip of per-segment fields
* Level load behavior:
  * when loading a level JSON with `midi_file`, the editor attempts to auto-load the linked MIDI from `MIDI/`
  * if the linked MIDI is unavailable, runtime export still works using saved/runtime note data
  * `Load level file` refreshes `Levels/` before applying data, so the latest saved runtime is loaded
  * after load, the selected level remains selected in the `Levels/` dropdown
* MIDI load behavior:
  * manual `Load MIDI file` (from folder) or `Upload your file` (popup) rebuilds segments from the loaded MIDI and resets layout editor to generated mode
  * `Upload your file` popup accepts `MID`, `MIDI`, `WAV`, `MP3`
  * upload flow saves the resulting MIDI in `MIDI/` with collision-safe names (`name.mid`, `name_1.mid`, ...)
  * `WAV/MP3` uploads are converted to MIDI before save and then auto-loaded by the editor
  * upload popup includes an `Audio conversion preset` selector for `WAV/MP3` (`Balanced`, `Dense notes`, `Accurate`)
  * audio-to-MIDI conversion uses a vendored Basic Pitch model path (`assets/models/basic-pitch`) for deployment stability
  * conversion runtime prefers TensorFlow Node backend (`@tensorflow/tfjs-node`) for faster server-side processing
  * conversion now resamples decoded audio to `22050 Hz` before Basic Pitch inference to match the official model input contract
  * audio upload conversion runs as an async server job with progress reporting (`stage` + `0..1` progress) exposed via upload-job polling API
  * editor shows a dedicated conversion-progress window for long audio jobs, including live percentage and stage label
  * conversion-job progress is monotonic and includes heartbeat increments during long model-loading phases to prevent stale UI percentages
  * conversion applies mono auto-gain normalization before note inference, so quiet MP3/WAV sources are analyzed with a stable level
  * Basic Pitch note extraction is aligned to official parameter order (`onsetThreshold`, `frameThreshold`, `minNoteLen`) and supports frequency bounds
  * default (`Balanced`) conversion parameters are tuned against `MIDI/python_official/basic_pitch_transcription.mid` to keep exports practically aligned with the reference:
    * `noteSegmentation=0.31` (mapped to `frameThreshold`)
    * `modelConfidenceThreshold=0.355` (mapped to `onsetThreshold`)
    * `minimumPitch=0 Hz`
    * `maximumPitch=3000 Hz`
    * `minimumNoteLength=24 ms` (converted to model frames internally)
    * `midiTempo=120`
    * `melodiaTrick=false`
  * `Balanced` / `Accurate` presets keep MIDI velocity directly aligned to Basic Pitch note amplitude; `Dense notes` keeps an additional velocity lift profile
  * optional input normalization + aggressive velocity lift are applied only to the `Dense notes` preset (not to `Balanced` defaults)
  * editor MIDI preview playback uses a louder gain stage plus output limiter/compressor to keep converted tracks clearly audible without hard clipping
  * upload/conversion lifecycle writes timestamped entries to the `Debug` box (selection, request start, HTTP response, save/load success, and failures)
  * segment count is derived from MIDI duration and current default BPM fallback at generation time (`2 beats` per segment)
  * segment BPM values are auto-seeded from MIDI tempo changes (tempo map timeline)
  * changing default BPM fallback after MIDI load does not rebuild segment count automatically; regenerate/reload is required to recalculate beats/segments
* Runtime generation guarantees:
  * if no generated `static` segment covers spawn, a fallback spawn-support segment is injected immediately left of spawn (its right edge aligns to spawn)
  * default platform width is 2 horizontal grid cells
  * each segment is fixed to 2 beats and generates exactly 1 platform slot
  * platform kind generation uses a deterministic, sequence-aware motif system:
    * generation samples from a curated catalog of short puzzle-like motifs (`2-4` slots each), not only independent per-slot picks
    * each motif defines ordered kind preferences per step and flow contracts (`entry/exit`) used for motif-to-motif compatibility
    * motif selection is weighted by segment energy, rhythm density, motif complexity, deterministic seed roll, and short reuse cooldown
    * if a motif cannot be placed safely under current constraints, generation falls back to per-slot weighted sampling for that position
  * hard constraints are enforced globally on every chosen slot (motif or fallback):
    * `beat` cannot be followed by `beat` or `alternateBeat`
    * `alternateBeat` cannot be followed by `beat` or `alternateBeat`
    * timed-platform runs (`beat`, `alternateBeat`, `ghost`, `reverseGhost`) are capped at 2 in a row
    * `anti_stall`: static runs (`segment`) are capped at 3 in a row when a valid non-static alternative exists
    * launch spacing: at least `4` static segments (`segment`) are required between two launch platforms (`launch30`/`launch60`)
    * `energy_gate`: kind availability is clamped by segment energy
      * `low`: `segment`, `beat`, `alternateBeat`, `elevator`
      * `medium`: `low` set + `ghost`, `reverseGhost`, `shuttle`, `cross`, `spring`
      * `high`: full kind set (includes `hazard`, `launch30`, `launch60`)
  * generated segment templates expose broader allowed kinds per energy:
    * `low`: `static`, `beat`, `alternateBeat`, `elevator`
    * `medium`: `low` set + `ghost`, `reverseGhost`, `shuttle`, `cross`, `spring`
    * `high`: `medium` set + `hazard`, `launch30`, `launch60`
  * each generated platform picks a random vertical level between `vertical_min` and `vertical_max`
  * generation avoids overlapping placements while building the lane
  * when generating from loaded MIDI, runtime appends a fixed 3-step static ascent at vertical levels `3 -> 5 -> 7` after authored/generated segment slots to preserve moon reachability
  * moon reachability remains primarily authored, with the MIDI-generation ascent acting as a fallback assist
* Enemy authoring per segment:
  * `patrol_enemies`
  * `flying_spawn_interval_ms` (stored in runtime JSON)
  * editor input is in seconds (`Flying Spawn Interval (s, 0=Off)`), converted to/from ms during runtime export/load
  * `flying_spawn_interval_ms = 0` disables flying spawn for that segment
  * `falling_rock_spawn_interval_ms` in editor maps to runtime `segmentEnemies[].fallingRockSpawnIntervalMs`
  * editor input is in seconds (`Falling Rock Spawn Interval (s, 0=Off)`), converted to/from ms during runtime export/load
  * `fallingRockSpawnIntervalMs = 0` (or missing) disables falling-rock spawn for that segment
  * in selected-platform editing, enemy fields bind to selected static platforms by left-to-right segment rank mapping, consistent with runtime segment-enemy remapping on mixed layouts
  * MIDI-derived draft default patrols: `low=0`, `medium=random(0|1)`, `high=random(0|1)`
  * MIDI-derived draft enables flying spawn interval only every 5 segments (`5, 10, 15, ...`), using energy-coherent intervals
  * MIDI-derived draft default for falling rock spawn interval is always `0` (manual opt-in)
  * if `segmentEnemies` exists in runtime JSON (even empty), gameplay uses segment-authoring mode and disables global fallback enemy settings
  * runtime maps authored `segmentIndex` across available segment platforms to avoid front-loading on long mixed-platform levels
  * patrol spawn enforces local spacing/capacity so enemies do not overlap at spawn time
  * patrol allocation is spread across nearby segment platforms to reduce repeated same-segment clustering
* Moon movement boundary:
  * moon horizontal stop is tied to authored platform extent plus one platform slot to the right (2 grid cells), not synthetic grid coverage
* World bounds:
  * gameplay/camera width is derived from authored platform extent (grid columns are only a fallback when no platforms exist)
* Tempo-change implications:
  * runtime no longer relies on a single level BPM
  * active BPM is selected by tempo zone (`tempoMap`) using player grid position
  * metronome BPM transitions are applied on subdivision boundaries
  * traversal and enemy pacing scale dynamically with the active zone BPM

---

## **7. Prototype Scope**

**Included**

* One procedurally generated level
* Basic enemy encounters + difficulty-scaled lives HUD (Easy 10, Normal/Hard 5)
* Patrol, flying, and falling-rock enemy variants
* Continuous movement with tempo-scaled inertia and light beat assist
* Double jump + directional dash (double tap left/right, 3s cooldown)
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
* Continuous movement integration with tempo-scaled acceleration/friction and beat-assist windows
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

---

## **11. AI-Generated Static Sprite Pack (ChatGPT)**

A production-ready static sprite replacement pipeline is defined for the current Phaser prototype.

Reference files:

- `GDD/ASSET_PIPELINE.md`
- `GDD/ASSET_PROMPTS_CHATGPT.md`
- `GDD/ASSET_MANIFEST.json`

Scope:

- Replace current primitive runtime shapes with static sprites for player, moon, platforms, and enemies.
- Keep gameplay behavior unchanged. Preserve current collision semantics, including reduced enemy collision boxes (`90%` of enemy visual body size).
- Follow `GDD/VSG.md` color/state semantics exactly.

Animation is intentionally out of scope for this baseline pack; state readability is achieved through sprite variant swapping.

---

## **12. MIDI Fidelity Pipeline (Implemented)**

The MIDI authoring/runtime pipeline now uses a **raw tick-based model** as canonical source of truth.

Implemented rules:

- Canonical data model:
  - `midiPlayback.ppq`
  - `midiPlayback.tempoPoints[]` (`tick`, `usPerQuarter`)
  - `midiPlayback.notes[]` (`startTick`, `endTick`, `pitch`, `velocity`, `trackId`, `channel`)
  - `midiPlayback.songEndTick`
- Runtime level export from editor always includes `midiPlayback`.
- Game runtime playback state is now tick-scrub driven (movement -> playhead tick), with:
  - incremental forward/reverse updates for small deltas
  - rebuild path for large jumps/teleports
  - per-voice overlap counting on `track:channel:pitch` keys to prevent stuck notes.
  - reverse scrub windows now evaluate event ticks with strict bounds (`nowTick < eventTick <= prevTick`) to avoid missing boundary `NoteOff` updates during rewind.
  - when player motion becomes idle right after backward scrub, runtime performs an immediate voice panic and marks scrub as paused; the next movement frame rebuilds from current tick to avoid persistent rewind-held drones.
- Runtime playhead mapping now auto-calibrates to player movement speed (beats traversed by continuous forward movement) so playback tempo in-game matches authoring tempo without manual `x1` tuning.
- Sustained notes are no longer force-killed when the player becomes idle in MIDI mode; active notes can ring out and release on their natural `NoteOff` path instead of global idle panic.
- Runtime debug overlay now exposes playback speed diagnostics (`expected beats/s`, `actual beats/s`, `% error`) with `F10` show/hide toggle for live calibration checks.
- Runtime debug overlay now exposes harmonic diagnostics (`top pitch classes`, smoothed harmonic intensity) for live background-shader verification.
- Parser/normalizer alignment is now shared across all three systems:
  - game runtime (`GameScene`)
  - level editor (`editor.html`)
  through the single core module `src/core/midi.ts` (compiled in `dist/src/core/midi.js`).
- Runtime default `balanced` audio profile now uses editor-like synthesis envelopes/timbre (`synthStyle: editorLike`) to reduce perceived mismatch versus editor playback.
- Level migration script added: `scripts/migrate_midi_playback_schema.mjs`.

Legacy fields (`tempoMap`, `gridColumns`, `notes`) are still emitted during transition for compatibility, but `midiPlayback` is the authoritative format.
