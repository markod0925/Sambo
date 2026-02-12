export const DEFAULT_REFERENCE_BPM = 120;

function normalizePositive(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

export function getTempoScale(levelBpm: number, referenceBpm = DEFAULT_REFERENCE_BPM): number {
  const safeReference = normalizePositive(referenceBpm, DEFAULT_REFERENCE_BPM);
  const safeLevelBpm = normalizePositive(levelBpm, safeReference);
  return safeLevelBpm / safeReference;
}

export function scaleSpeedByTempo(baseSpeed: number, levelBpm: number, referenceBpm = DEFAULT_REFERENCE_BPM): number {
  return baseSpeed * getTempoScale(levelBpm, referenceBpm);
}

export function scaleIntervalByTempo(
  baseIntervalMs: number,
  levelBpm: number,
  referenceBpm = DEFAULT_REFERENCE_BPM
): number {
  return baseIntervalMs / getTempoScale(levelBpm, referenceBpm);
}
