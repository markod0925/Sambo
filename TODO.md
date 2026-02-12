# TODO - User Levels Persistence Strategy (localStorage -> IndexedDB)

## Goal
Allow players (including static hosting like itch.io) to load a MIDI, edit/export a runtime level, save it client-side, and see it in the start screen level list without server filesystem APIs.

## Constraints
- No dependency on `/api/save-level` or `/api/levels` for user-created levels.
- Must work in pure browser environments.
- Keep built-in levels available as fallback.

## Phase 1 - localStorage MVP
1. Define a storage key namespace:
- `sambo.userLevels.v1.index` (array of level ids + metadata)
- `sambo.userLevels.v1.level.<id>` (runtime JSON payload)

2. Add a small persistence module (e.g. `src/core/userLevelsStorage.ts`) with:
- `listUserLevels()`
- `getUserLevel(id)`
- `saveUserLevel(level)`
- `deleteUserLevel(id)`
- `migrateUserLevelsIfNeeded()`

3. Runtime level schema for stored entries:
- `id` (stable UUID)
- `name`
- `createdAt`
- `updatedAt`
- `sourceMidiName` (optional)
- `data` (runtime JSON used by game)

4. Editor integration:
- Replace/extend `Save runtime to Levels` with browser save path when server API is unavailable.
- Show save result as "Saved in browser storage".
- Add a "My saved levels" selector in editor.

5. Start screen integration:
- Read user levels from localStorage.
- Merge with bundled levels in a single list (clear label like `[User]`).
- Keep existing play flow unchanged once a level is selected.

6. Safety limits:
- Enforce max level count (e.g. 100).
- Enforce max payload size per level.
- Validate runtime JSON before saving.

## Phase 2 - IndexedDB upgrade
1. Introduce IndexedDB-backed adapter (same interface as localStorage module).
2. Use object stores:
- `levels` (key: id)
- `meta` (version/migration markers)
3. Add migration routine:
- On first load, import all `sambo.userLevels.v1.*` localStorage entries into IndexedDB.
- Mark migration done to avoid re-import.

## Phase 3 - UX completion
1. Add explicit actions in start screen:
- Rename
- Delete
- Duplicate
- Export `.runtime.json`
- Import `.runtime.json`

2. Add editor import/export helpers:
- Import runtime JSON file from disk.
- Export current runtime JSON to download (always available even without server).

3. MIDI handling note:
- Local MIDI stays browser-session scoped.
- Saved runtime must remain playable from embedded `notes` even if MIDI file is not present later.

## Phase 4 - Robustness and tests
1. Unit tests for storage adapter and migration.
2. Validation tests for malformed JSON input.
3. Manual E2E checks:
- Save level in editor -> appears in start menu.
- Refresh browser -> level still present.
- Delete level -> removed from menu.
- Works with server APIs unavailable.

## Optional future extension
- Cloud sync (account-based backend) with same storage interface abstraction.
