# Sambo (Phaser Prototype)

Sambo is a 2D rhythm-platformer prototype where movement is synchronized to a global beat.
The project demonstrates the core loop described in the GDD: movement drives musical intensity, and intensity drives world readability.

## Basic game mechanics

### 1) Beat-synced movement ("snap to beat")
- Horizontal movement is quantized to a beat subdivision.
- Pressing **A/D** (or **Left/Right**) queues a step.
- The character arrives exactly on the next beat subdivision, so movement and note playback stay in sync.

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
- Game: `http://localhost:4173/`
- Built files are served from the project root (`dist/` after TypeScript build).

### Useful commands
```bash
npm run build   # compile TypeScript to dist/
npm run check   # type-check (no emit)
npm run test    # build + node test runner
```

---

## Level editor usage

The repository includes a lightweight browser editor for `level_draft.json` files.

### Open the editor
1. Start the local server:
   ```bash
   npm run start
   ```
2. Open:
   - `http://localhost:4173/editor.html`

### What you can do in the editor
- Load a draft JSON (`{ "segments": [...] }`) from your machine.
- Add segments.
- Delete segments.
- Reorder by `index`.
- Edit per-segment fields:
  - `energy_state`
  - `duration_beats`
  - `platform_types`
  - `vertical_range`
  - `rhythm_density`
- Preview a live minimap:
  - color-coded by energy state
  - ghost segments outlined when `platform_types` includes `ghost`
- Export updated JSON (`level_draft.edited.json`) or copy JSON to clipboard.

### Suggested workflow with audio analysis script
1. Generate draft data from a WAV file:
   ```bash
   python scripts/audio_to_level.py --input path/to/track.wav --output-dir data
   ```
2. Open the editor and import `data/level_draft.json`.
3. Refine the segments.
4. Export as `level_draft.edited.json`.

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
