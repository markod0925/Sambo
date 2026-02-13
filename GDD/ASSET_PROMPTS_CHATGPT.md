# Sambo ChatGPT Image Prompts (Static Sprite Pack)

Use these prompts as-is in ChatGPT image generation.

## Global Prompt Prefix

Apply this prefix before each asset-specific line:

"Minimal geometric 2D game sprite for a rhythm platformer, hard-edged planar shapes, abstract cosmic style, no realism, no texture noise, clean silhouette, transparent background, centered subject, no text, no watermark, sRGB color fidelity, controlled soft glow only when specified."

## Player

### `asset_player_core_idle.png`

"Create a static player sprite, 24x38 target ratio, upright geometric figure, pale ivory body color #E8E6E3, subtle slate edge #3A4663 at 1-2px feel, no facial detail, no clothing detail, high readability on dark background #05070F, no glow."

### `asset_player_core_damage.png`

"Create the same player sprite silhouette as idle, but with brief damage-state tint accent using #FF6B6B at low coverage, preserve main body color #E8E6E3, no particle effects, no blood, no realism."

## Moon

### `asset_moon_core_low.png`

"Create a moon core disc sprite, 84x84 target, flat circular geometry, low-energy cool gray-blue tone between #B0B7C3 and #9DB6DE, soft edge gradient, no texture."

### `asset_moon_core_warm.png`

"Create the same moon core disc silhouette, warm active tone using #F4D35E with subtle inner accent #FFB703, clean circular edge, minimal glow."

### `asset_moon_core_cool.png`

"Create the same moon core disc silhouette, cool rewind tone using #4CC9F0 and #CDEFFF, thin controlled glow, no bloom spikes."

### `asset_moon_halo_low.png`

"Create a circular halo sprite, 144x144 target, transparent center-to-edge radial gradient, low-energy tone around #B0B7C3, very soft opacity falloff, no hard ring."

### `asset_moon_halo_warm.png`

"Create a circular halo sprite, 144x144 target, warm tone #F4D35E with #FFB703 center bias, soft radial falloff, subtle and calm."

### `asset_moon_halo_cool.png`

"Create a circular halo sprite, 144x144 target, cool tone #4CC9F0 with #CDEFFF highlight, thinner and less expansive than warm halo."

## Platforms

### `asset_platform_segment_default.png`

"Create a rectangular platform tile sprite, 64x18 target, fill #2A3244, border #3A4663, slight 2px top-edge highlight, no glow, stable neutral look."

### `asset_platform_beat_solid.png`

"Create a rectangular beat platform tile sprite, 64x18 target, solid state: fill #F4D35E, border #FFB703, subtle warm radial edge glow."

### `asset_platform_beat_fadeOut.png`

"Create same beat platform silhouette, fadeOut state: fill #EE964B, border #F4D35E, visibly dimmer than solid, keep shape crisp."

### `asset_platform_beat_gone.png`

"Create same beat platform silhouette for gone state, near-transparent ghost trace only, faint border hint in #EE964B at very low opacity, still recognizable."

### `asset_platform_beat_fadeIn.png`

"Create same beat platform silhouette, fadeIn state matching fadeOut intensity, fill #EE964B, border #F4D35E, transitional appearance."

### `asset_platform_alternateBeat_solid.png`

"Create alternate beat platform tile, 64x18 target, fill #FB8500, border #FFB703, distinct from standard beat platform while still warm family."

### `asset_platform_alternateBeat_off.png`

"Create alternate beat platform off state, same silhouette, heavily dimmed amber/orange traces, readable but clearly inactive."

### `asset_platform_ghost_active.png`

"Create ghost platform active state tile, 64x18 target, fill #4CC9F0, border #CDEFFF, cool thin glow, clean geometric edges."

### `asset_platform_ghost_inactive.png`

"Create ghost platform inactive state tile, same silhouette, darkened slate fill near #121A2B, border #3A86FF at low intensity, minimal visibility."

### `asset_platform_reverseGhost_forwardSolid.png`

"Create reverse-ghost platform forward-solid state tile, 64x18 target, fill #B5179E, border #E056FD, restrained glow, secondary emphasis."

### `asset_platform_reverseGhost_backwardWeak.png`

"Create reverse-ghost platform backward-weak state tile, same silhouette, dim plum fill #3C0D3A, faint plum border, clearly weaker than forward solid."

### `asset_platform_elevator_default.png`

"Create moving platform tile, 64x18 target, blue gradient family with fill #3A86FF and border #4CC9F0, clarity-first readability, subtle vertical-motion feel without arrows."

### `asset_platform_shuttle_default.png`

"Create moving platform tile for shuttle, 64x18 target, same palette as elevator (#3A86FF fill, #4CC9F0 border), hint of lateral energy only through border emphasis, no icons."

### `asset_platform_cross_default.png`

"Create moving platform tile for cross movement, 64x18 target, same mobile palette (#3A86FF fill, #4CC9F0 border), balanced neutral motion feel, no directional arrows."

## Enemies

### `asset_enemy_patrol_default.png`

"Create patrol enemy sprite, 30x24 target, solid square-like shape, muted crimson fill #A4161A, darker red border #660708, no glow, strong danger readability."

### `asset_enemy_patrol_facingLeft.png`

"Create same patrol enemy silhouette as default, left-facing variant through asymmetrical notch or eye marker only, preserve #A4161A and #660708 palette."

### `asset_enemy_flying_default.png`

"Create flying enemy sprite, 30x20 target, diamond/triangular geometric body, core #9D0208, subtle eye/glow accent #FF4D6D, faint low-alpha rear streak, no cyan or gold tones."

## Negative Prompt Suffix

Append this suffix to every prompt if your generator supports negative constraints:

"No photorealism, no painterly brushwork, no grunge textures, no excessive bloom, no text labels, no UI frame, no background scene, no perspective camera distortion, no organic cartoon style."
