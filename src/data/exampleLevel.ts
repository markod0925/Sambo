export interface PlatformSpec {
  kind: 'segment' | 'beat' | 'ghost' | 'reverseGhost';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LevelDefinition {
  bpm: number;
  gridColumns: number;
  notes: number[];
  platforms: PlatformSpec[];
  enemies?: {
    patrolCount: number;
    flyingSpawnIntervalMs: number;
  };
}

// 29-note catchy melody in C major (grid-aligned playback sequence).
const noteMidi = [
  60, 62, 64, 67, 64, 62, 60, 62, 64, 67,
  69, 67, 64, 62, 60, 64, 67, 71, 72, 71,
  69, 67, 64, 65, 67, 69, 67, 64, 60
];

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export const EXAMPLE_LEVEL: LevelDefinition = {
  bpm: 120,
  gridColumns: 29,
  notes: noteMidi.map(midiToHz),
  platforms: [
    { kind: 'segment', x: 120, y: 405, width: 74, height: 18 },
    { kind: 'segment', x: 210, y: 405, width: 74, height: 18 },
    { kind: 'beat', x: 560, y: 340, width: 120, height: 16 },
    { kind: 'ghost', x: 720, y: 290, width: 100, height: 14 },
    { kind: 'reverseGhost', x: 820, y: 250, width: 100, height: 14 }
  ],
  enemies: {
    patrolCount: 2,
    flyingSpawnIntervalMs: 3400
  }
};
