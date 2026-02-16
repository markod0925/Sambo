import type { NoteInterval, TempoPoint } from '../core/midi.js';

export interface PlatformSpec {
  kind: 'segment' | 'beat' | 'alternateBeat' | 'ghost' | 'reverseGhost' | 'elevator' | 'shuttle' | 'cross' | 'spring';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TempoZone {
  startColumn: number;
  bpm: number;
}

export interface MidiPlaybackDefinition {
  ppq: number;
  songEndTick: number;
  tempoPoints: TempoPoint[];
  notes: NoteInterval[];
  x0?: number;
  x1?: number;
}

export interface LevelDefinition {
  midiPlayback: MidiPlaybackDefinition;
  tempoSmoothingBpmPerSecond?: number;
  audioQualityMode?: 'performance' | 'balanced' | 'high';
  audioQuality?: {
    maxPolyphony?: number;
    schedulerLookaheadMs?: number;
    schedulerLeadMs?: number;
    saturationAmount?: number;
    musicGain?: number;
    metronomeGain?: number;
    metronomeDuckAmount?: number;
    synthStyle?: 'game' | 'editorLike';
  };
  platforms: PlatformSpec[];
  segmentEnemies?: Array<{
    segmentIndex: number;
    patrolCount: number;
    flyingSpawnIntervalMs?: number;
    flyingCount?: number;
  }>;
  enemies?: {
    patrolCount: number;
    flyingSpawnIntervalMs: number;
  };
  // Transitional legacy fields kept for one release only.
  tempoMap: TempoZone[];
  gridColumns: number;
  notes: number[];
  midi_file?: string;
}

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function clampMidi(value: number): number {
  return Math.max(0, Math.min(127, Math.round(Number(value) || 0)));
}

export function buildMidiPlaybackFromMidiNotes(midiNotes: number[], bpm = 120, ppq = 480): MidiPlaybackDefinition {
  const safePpq = Math.max(1, Math.floor(Number(ppq) || 480));
  const safeBpm = Math.max(1, Number(bpm) || 120);
  const usPerQuarter = Math.round(60_000_000 / safeBpm);
  const notes: NoteInterval[] = [];

  for (let i = 0; i < midiNotes.length; i++) {
    const startTick = i * safePpq;
    notes.push({
      startTick,
      endTick: startTick + safePpq,
      pitch: clampMidi(midiNotes[i]),
      velocity: 100,
      trackId: 0,
      channel: 0
    });
  }

  return {
    ppq: safePpq,
    songEndTick: Math.max(0, midiNotes.length * safePpq),
    tempoPoints: [{ tick: 0, usPerQuarter }],
    notes
  };
}

// 29-note catchy melody in C major (grid-aligned playback sequence).
const noteMidi = [
  60, 62, 64, 67, 64, 62, 60, 62, 64, 67,
  69, 67, 64, 62, 60, 64, 67, 71, 72, 71,
  69, 67, 64, 65, 67, 69, 67, 64, 60
];

export const EXAMPLE_LEVEL: LevelDefinition = {
  midiPlayback: buildMidiPlaybackFromMidiNotes(noteMidi, 120),
  tempoSmoothingBpmPerSecond: 90,
  audioQualityMode: 'balanced',
  // Legacy optional fields (kept temporarily).
  tempoMap: [{ startColumn: 0, bpm: 120 }],
  gridColumns: 29,
  notes: noteMidi.map(midiToHz),
  platforms: [
    { kind: 'segment', x: 120, y: 405, width: 74, height: 18 },
    { kind: 'segment', x: 210, y: 405, width: 74, height: 18 },
    { kind: 'beat', x: 560, y: 340, width: 120, height: 16 },
    { kind: 'alternateBeat', x: 650, y: 300, width: 110, height: 16 },
    { kind: 'elevator', x: 700, y: 340, width: 100, height: 16 },
    { kind: 'spring', x: 760, y: 340, width: 100, height: 16 },
    { kind: 'ghost', x: 720, y: 290, width: 100, height: 14 },
    { kind: 'reverseGhost', x: 820, y: 250, width: 100, height: 14 }
  ],
  enemies: {
    patrolCount: 2,
    flyingSpawnIntervalMs: 3400
  }
};
