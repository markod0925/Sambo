# Sambo AI Asset Pipeline (ChatGPT Images)

This document defines a production-safe workflow to generate static sprites for Sambo using ChatGPT image generation, aligned with `GDD/VSG.md`.

## 1. Scope

This pack covers runtime gameplay sprites only (no animation sheets):
- player
- moon core + moon halo
- platform sprite set (all runtime platform kinds and state variants)
- enemies (patrol, flying)

## 2. Technical Export Rules

Use these fixed export constraints for every generated sprite:
- format: `PNG`
- background: transparent
- color profile: `sRGB`
- anti-aliasing: clean edge anti-aliasing allowed, no painterly texture
- style: flat geometric, hard-edged, minimal glow
- no text embedded in sprites
- no drop shadows outside shape silhouette unless explicitly requested by prompt

## 3. Resolution and Grid Targets

Generate source sprites at 4x target size, then downscale with nearest or crisp bicubic in your image tool.

Runtime target dimensions:
- `player_idle`: `24x38`
- `moon_core`: `84x84` (used as scalable circle replacement)
- `moon_halo`: `144x144`
- `platform_tile`: `64x18` (segment, beat, alternateBeat, ghost, reverseGhost, elevator/shuttle/cross)
- `enemy_patrol`: `30x24`
- `enemy_flying`: `30x20`

Recommended generation canvas (single asset output):
- small assets: `512x512`
- wide platform tile: `1024x512`

## 4. Naming Convention

Store exported final sprites with this naming pattern:
- `asset_<category>_<name>_<state>.png`

Examples:
- `asset_player_core_idle.png`
- `asset_platform_beat_solid.png`
- `asset_platform_ghost_active.png`
- `asset_enemy_patrol_default.png`

## 5. State Matrix

Required variants:
- player: `idle`, `damage`
- moon: `low`, `warm`, `cool` for both `core` and `halo`
- segment platform: `default`
- beat platform: `solid`, `fadeOut`, `gone`, `fadeIn`
- alternate beat platform: `solid`, `off`
- ghost platform: `active`, `inactive`
- reverse ghost platform: `forwardSolid`, `backwardWeak`
- elevator/shuttle/cross platform: `default`
- patrol enemy: `default`, `facingLeft`
- flying enemy: `default`

## 6. Palette Guardrails

Do not deviate from the approved palette families in `GDD/VSG.md`:
- world background family: `#05070F`, `#0B0F1A`, `#121A2B`
- warm gameplay family: `#F4D35E`, `#EE964B`, `#FFB703`
- cool gameplay family: `#4CC9F0`, `#3A86FF`, `#CDEFFF`
- reverse-ghost family: `#B5179E`, `#E056FD`, `#3C0D3A`
- neutral platform family: `#2A3244`, `#3A4663`
- enemy family: `#A4161A`, `#660708`, `#9D0208`, `#FF4D6D`
- player core: `#E8E6E3`

## 7. Composition Rules

- Keep silhouettes simple and readable at 50% opacity.
- No organic brush texture, no realism, no detailed material noise.
- Glow must be soft and radial; never heavy bloom.
- Enemy shapes must remain distinct from platform geometry.
- Keep platform silhouettes rectangular and collision-readable.

## 8. Acceptance Checklist

For each generated sprite:
1. silhouette readable on dark background `#05070F`
2. no forbidden colors (especially purple drift outside reverse-ghost)
3. edge contrast still readable at low intensity
4. dimensions match target after export
5. transparent background preserved

## 9. Integration Note

When integrating into Phaser, keep collision dimensions unchanged from current gameplay values and use sprite scaling only for visual replacement parity.
