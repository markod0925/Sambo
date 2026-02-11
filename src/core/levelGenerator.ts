import { EnergyState, Segment } from './types.js';

export interface AnalysisData {
  bpm: number;
  energy_curve: number[];
}

export function classifyEnergy(value: number): EnergyState {
  if (value < 0.33) return 'low';
  if (value < 0.66) return 'medium';
  return 'high';
}

export function generateSegments(analysis: AnalysisData, windowSize = 4): Segment[] {
  const segments: Segment[] = [];
  for (let i = 0; i < analysis.energy_curve.length; i += windowSize) {
    const window = analysis.energy_curve.slice(i, i + windowSize);
    const avg = window.reduce((a, b) => a + b, 0) / window.length;
    const energyState = classifyEnergy(avg);
    segments.push(templateForEnergy(energyState));
  }
  return segments;
}

function templateForEnergy(energy: EnergyState): Segment {
  if (energy === 'low') {
    return {
      durationBeats: 8,
      energyState: energy,
      platformTypes: ['static', 'beat', 'alternateBeat'],
      verticalRange: [0, 1],
      rhythmDensity: 0.25
    };
  }

  if (energy === 'medium') {
    return {
      durationBeats: 8,
      energyState: energy,
      platformTypes: ['static', 'beat', 'alternateBeat', 'ghost', 'reverseGhost'],
      verticalRange: [0, 2],
      rhythmDensity: 0.5
    };
  }

  return {
    durationBeats: 8,
    energyState: energy,
    platformTypes: ['static', 'beat', 'alternateBeat', 'ghost', 'reverseGhost', 'elevator'],
    verticalRange: [1, 3],
    rhythmDensity: 0.8
  };
}
