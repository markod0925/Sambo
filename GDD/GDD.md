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
