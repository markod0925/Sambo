import { MovementDirection } from './types.js';

export type BeatPlatformState = 'solid' | 'fadeOut' | 'gone' | 'fadeIn';

export function getBeatPlatformState(beatInBar: 1 | 2 | 3 | 4): BeatPlatformState {
  if (beatInBar === 1) return 'solid';
  if (beatInBar === 2) return 'fadeOut';
  if (beatInBar === 3) return 'gone';
  return 'fadeIn';
}

export function isGhostPlatformSolid(direction: MovementDirection): boolean {
  return direction === 'backward';
}

export function isAlternateBeatPlatformSolid(beatInBar: 1 | 2 | 3 | 4): boolean {
  return beatInBar === 1 || beatInBar === 3;
}

export function getElevatorOffsetSteps(beatIndex: number): number {
  const safeBeatIndex = Math.floor(Number.isFinite(beatIndex) ? beatIndex : 0);
  const phase = ((safeBeatIndex % 8) + 8) % 8;
  return phase <= 4 ? phase : 8 - phase;
}
