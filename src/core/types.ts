export type MovementDirection = 'forward' | 'backward' | 'idle';

export interface BeatStep {
  fromX: number;
  toX: number;
  startTime: number;
  arrivalTime: number;
  direction: MovementDirection;
}

export type EnergyState = 'low' | 'medium' | 'high';

export interface Segment {
  durationBeats: number;
  energyState: EnergyState;
  platformTypes: Array<
    'static' | 'beat' | 'alternateBeat' | 'ghost' | 'reverseGhost' | 'elevator' | 'shuttle' | 'cross' | 'spring'
  >;
  verticalRange: [number, number];
  rhythmDensity: number;
}
