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
- Pattern Editor: `http://localhost:4173/pattern-editor.html`
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
npm run build:patterns  # rebuild abstract pattern catalog (50 patterns)
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
   - `http://localhost:4173/pattern-editor.html` (pattern authoring scene)

### What you can do in the editor
- Load a draft JSON (`{ "segments": [...], "midi_file": "track.mid" }`) from your machine.
- Load a MIDI from project folder `MIDI/` and play/stop it directly in the editor.
- Use `Upload your file` to upload `MID/MIDI/WAV/MP3` from a popup:
  - `MID/MIDI` are saved in `MIDI/` and loaded automatically.
  - `WAV/MP3` are converted to MIDI, saved in `MIDI/`, then loaded automatically.
  - The conversion workflow now lives in `tools/audio-midi-converter/` as a standalone-ready package, so it can be moved into a dedicated repository.
  - Conversion prefers TensorFlow Node backend (`@tensorflow/tfjs-node`) for faster processing.
  - Audio-to-MIDI conversion uses the vendored Basic Pitch model in `assets/models/basic-pitch/` (deployment-stable path).
  - Converted/saved files are created with collision-safe names (`name.mid`, `name_1.mid`, ...).
  - This flow requires the local editor server (`npm run start`) because it writes files into `MIDI/`.
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
- Inspect the active runtime pattern trace in-editor (`Pattern Runtime Trace` panel):
  - random pattern picks by segment index (`patternId`, energy hint, weight, length)
  - aggregated usage stats per pattern (`picks`, `segmentsCovered`, `avgWeight`)
  - generated token stream
  - mapped kinds and final constrained kinds

### Pattern editor (`/pattern-editor.html`)

- Loads existing runtime patterns from `assets/procgen/runtime_patterns_v1.json`.
- Lets you browse, edit, duplicate, delete, and add patterns.
- Supports explicit selectors for:
  - pattern type (`flow1d` / `micro2d`)
  - energy hint (`low` / `medium` / `high`)
- Provides a token minimap canvas for direct token painting (`segment`, `gap`, `timed`, `mobile`, `hazard`, `launch`).
- `Save Pattern` recomputes constraints automatically from the edited tokens:
  - `maxGapRun`
  - `minSegmentBeforeLaunch`
- `Save Catalog` persists JSON and regenerates TS mirror:
  - `assets/procgen/runtime_patterns_v1.json`
  - `src/core/patternCatalog.ts`

### Suggested workflow with audio analysis script
1. Generate draft data from a WAV file:
   ```bash
   python scripts/audio_to_level.py --input path/to/track.wav --output-dir data
   ```
2. Open the editor and import `data/level_draft.json`.
3. Either put your MIDI file in `MIDI/` and load it from the editor list, or use `Upload your file` for MIDI/audio upload.
4. Generate the initial draft from MIDI, then refine the segments.
5. Save draft/runtime JSON into `Levels/`.

Optional BPM override:
```bash
python scripts/audio_to_level.py --input path/to/track.wav --output-dir data --bpm 128
```

### Rebuild the pattern catalog

The project ships a versioned abstract catalog at `assets/procgen/runtime_patterns_v1.json` and a TS mirror used by runtime generation (`src/core/patternCatalog.ts`).

To rebuild from corpus roots:

```bash
node scripts/build-patterns.mjs \
  --vglc-root /path/to/TheVGLC \
  --mario-root /path/to/Mario-AI-Framework \
  --opensurge-root /path/to/opensurge \
  --supertux-root /path/to/supertux-addons \
  --output assets/procgen/runtime_patterns_v1.json \
  --ts-out src/core/patternCatalog.ts \
  --target-count 50
```

Notes:
- The script writes only abstracted pattern tokens and source statistics (no raw map extracts).
- If roots are omitted, it attempts common local defaults (`/tmp/...` and `third_party/...`).
- Runtime generation now picks predefined patterns pseudo-randomly from energy-scoped pools.

---

## Project structure (quick map)
- `src/game/GameScene.ts` - Phaser scene and gameplay loop.
- `src/core/*` - metronome, movement, intensity, platforms, enemies, generator logic.
- `src/core/patternCatalog.ts` - generated TS mirror of abstract pattern catalog.
- `editor.html` - level draft editor.
- `pattern-editor.html` - standalone pattern authoring scene.
- `scripts/audio_to_level.py` - WAV analysis + level draft generation.
- `scripts/build-patterns.mjs` - corpus mining and abstract pattern catalog builder.
- `scripts/serve.mjs` - static local HTTP server used by `npm run start`.
- `GDD/GDD.md` - high-level design document.
