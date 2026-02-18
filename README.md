# Sambo (Phaser Prototype)

Sambo is a 2D rhythm-platformer prototype where movement is synchronized to a global beat.
The project demonstrates the core loop described in the GDD: movement drives musical intensity, and intensity drives world readability.

## Basic game mechanics

### 1) Continuous movement with rhythm assist
- Horizontal movement is continuous while holding **A/D** (or **Left/Right**).
- Movement uses tempo-scaled acceleration and friction (responsive inertia profile).
- A light beat/grid assist nudges motion near subdivision and grid crossings to keep rhythmic coherence.
- Legacy grid-triggered notes are emitted when the player crosses grid columns.

### 2) Intensity and visibility
- The game tracks an `intensity` value in `[residualFloor, 1.0]`.
- Moving **forward** increases intensity.
- Staying **idle** slowly decreases intensity.
- Moving **backward** decreases intensity faster.
- Intensity affects the moon visuals (alpha/scale), acting as a readability cue.

### 3) Platform behavior
- **Beat platform** changes state over the 4-beat bar (`solid -> fadeOut -> gone -> fadeIn`).
- **Ghost platform** is only solid while moving backward (rewind direction).

### 4) Enemies and lives
- Patrol enemies move back and forth between min/max bounds.
- Flying enemies spawn periodically and home vertically toward the player while moving left.
- Falling rock enemies spawn from above, pulse on BPM, and drop vertically.
- Stomping from above defeats enemies.
- Side collisions deal damage and reduce lives.

### 5) Controls
- Move: **A / D** or **Left / Right**
- Jump: **W / Space / Up**

---

## Installation

### Requirements
- **Node.js 18+** (Node 20 recommended)
- **npm**
- Optional (for level generation): **Python 3.10+**

### Setup
```bash
npm install
```

---

## Run the game

### Development run
```bash
npm run start
```

Then open:
- Game (Start Screen): `http://localhost:4173/`
- Direct level start still supported: `http://localhost:4173/?level=1`, `http://localhost:4173/?level=2`
- Built files are served from the project root (`dist/` after TypeScript build).

### Start Screen
- Shows game title and a dimmed non-interactive gameplay preview in the background.
- Lets the player select level and start it.
- Shows per-level best time (if present).
- Includes a volume slider (saved in localStorage).
- Includes direct link to `editor.html`.

### CLI test mode (no browser)
```bash
npm run play:cli
```

This mode runs a text simulation of core gameplay systems (continuous movement with inertia, intensity, beat/ghost platform states) directly in terminal.
Useful for quick behavior checks when you cannot use the browser renderer.

Commands in CLI mode:
- `d` / `right` / `forward`
- `a` / `left` / `backward`
- `jump` / `j` / `up`
- `wait`
- `tick <ms> [actions...]` (example: `tick 250 d jump`)
- `status`
- `restart`
- `help`
- `quit`

### Useful commands
```bash
npm run build   # compile TypeScript to dist/
npm run check   # type-check (no emit)
npm run test    # build + node test runner
```

---

## Level editor usage

The repository includes a lightweight browser editor for `level_draft.json` files, with optional MIDI association and playback.

### Open the editor
1. Start the local server:
   ```bash
   npm run start
   ```
2. Open:
   - `http://localhost:4173/editor.html`

### What you can do in the editor
- Load a draft JSON (`{ "segments": [...], "midi_file": "track.mid" }`) from your machine.
- Load a MIDI from project folder `MIDI/` (or from local file) and play/stop it directly in the editor.
- Generate the first level draft automatically from the loaded MIDI.
- Configure runtime output (`bpm`, `gridColumns`, optional `reverseGhost`) and save/copy a runtime level JSON:
  - `{ "bpm": number, "gridColumns": number, "notes": number[], "platforms": [...], "segmentEnemies": [{ "segmentIndex": number, "patrolCount": number, "flyingSpawnIntervalMs": number, "fallingRockSpawnIntervalMs": number }], "enemies": { "patrolCount": number, "flyingSpawnIntervalMs": number } }`
  - Runtime export automatically appends final approach platforms so the moon is always reachable.
- Add segments.
- Delete segments.
- Reorder by `index`.
- Edit per-segment fields:
  - `energy_state`
  - `duration_beats`
  - `platform_types`
  - `vertical_range`
  - `rhythm_density`
  - `patrol_enemies`
  - `flying_spawn_interval_ms`
  - `falling_rock_spawn_interval_ms`
- Preview a live minimap:
  - color-coded by energy state
  - ghost segments outlined when `platform_types` includes `ghost`
- Save updated draft JSON directly in `Levels/` (plus clipboard copy).
  - If a MIDI file has been loaded, the editor stores its filename in `midi_file` (the binary MIDI is not embedded in JSON).
  - Runtime save uses sampled notes from the loaded MIDI when available; otherwise it generates fallback notes from segment energy.
  - Level-related JSON output is written to `Levels/`.

### Suggested workflow with audio analysis script
1. Generate draft data from a WAV file:
   ```bash
   python scripts/audio_to_level.py --input path/to/track.wav --output-dir data
   ```
2. Open the editor and import `data/level_draft.json`.
3. Put your MIDI file in `MIDI/` and load it from the editor list.
4. Generate the initial draft from MIDI, then refine the segments.
5. Save draft/runtime JSON into `Levels/`.

Optional BPM override:
```bash
python scripts/audio_to_level.py --input path/to/track.wav --output-dir data --bpm 128
```

---

## Project structure (quick map)
- `src/game/GameScene.ts` - Phaser scene and gameplay loop.
- `src/core/*` - metronome, movement, intensity, platforms, enemies, generator logic.
- `editor.html` - level draft editor.
- `scripts/audio_to_level.py` - WAV analysis + level draft generation.
- `scripts/serve.mjs` - static local HTTP server used by `npm run start`.
- `GDD/GDD.md` - high-level design document.
