import { MovementDirection } from './types.js';

export interface IntensityConfig {
  intensityGainRate: number;
  decayRate: number;
  intensityLossRate: number;
  residualFloor: number;
}

export const defaultIntensityConfig: IntensityConfig = {
  intensityGainRate: 0.3,
  decayRate: 0.05,
  intensityLossRate: 0.3,
  residualFloor: 0.25
};

export function updateIntensity(
  current: number,
  direction: MovementDirection,
  movementSpeed: number,
  deltaSeconds: number,
  config: IntensityConfig = defaultIntensityConfig
): number {
  let next = current;
  if (direction === 'forward') {
    next += movementSpeed * config.intensityGainRate * deltaSeconds;
  } else if (direction === 'backward') {
    next -= movementSpeed * config.intensityLossRate * deltaSeconds;
  } else {
    next -= config.decayRate * deltaSeconds;
  }

  return Math.max(config.residualFloor, Math.min(1, next));
}
