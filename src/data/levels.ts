import { EXAMPLE_LEVEL, type LevelDefinition } from './exampleLevel.js';

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const levelTwoNotes = [
  64, 67, 71, 72, 71, 67, 64, 62, 60, 62,
  64, 67, 69, 71, 72, 74, 72, 71, 69, 67,
  64, 62, 60, 62, 64, 65, 67, 69, 72
];

const LEVEL_TWO: LevelDefinition = {
  tempoMap: [{ startColumn: 0, bpm: 132 }],
  gridColumns: 29,
  notes: levelTwoNotes.map(midiToHz),
  platforms: [
    { kind: 'segment', x: 120, y: 410, width: 72, height: 18 },
    { kind: 'segment', x: 208, y: 382, width: 74, height: 18 },
    { kind: 'segment', x: 300, y: 355, width: 76, height: 18 },
    { kind: 'segment', x: 392, y: 328, width: 76, height: 18 },
    { kind: 'segment', x: 484, y: 350, width: 74, height: 18 },
    { kind: 'segment', x: 576, y: 372, width: 74, height: 18 },
    { kind: 'segment', x: 668, y: 350, width: 74, height: 18 },
    { kind: 'segment', x: 760, y: 322, width: 74, height: 18 },
    { kind: 'segment', x: 850, y: 292, width: 72, height: 18 },
    { kind: 'beat', x: 550, y: 300, width: 130, height: 16 },
    { kind: 'ghost', x: 700, y: 248, width: 120, height: 14 },
    { kind: 'reverseGhost', x: 340, y: 250, width: 110, height: 14 }
  ],
  enemies: {
    patrolCount: 3,
    flyingSpawnIntervalMs: 2900
  }
};

export const LEVELS: LevelDefinition[] = [EXAMPLE_LEVEL, LEVEL_TWO];

export function getLevelByOneBasedIndex(index: number): LevelDefinition {
  if (!Number.isFinite(index)) return LEVELS[0];
  const safeIndex = Math.floor(index);
  if (safeIndex < 1 || safeIndex > LEVELS.length) return LEVELS[0];
  return LEVELS[safeIndex - 1];
}
