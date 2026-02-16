export const DEFAULT_REFERENCE_BPM = 120;
export const MIN_BPM = 20;
export const MAX_BPM = 300;
export const DEFAULT_TEMPO_SMOOTHING_BPM_PER_SECOND = 90;

export interface TempoMapEntry {
  startColumn: number;
  bpm: number;
}

function normalizePositive(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

export function clampBpm(value: number, fallback = DEFAULT_REFERENCE_BPM): number {
  const positive = normalizePositive(value, fallback);
  return Math.max(MIN_BPM, Math.min(MAX_BPM, positive));
}

export function normalizeTempoMap(tempoMap: TempoMapEntry[], fallbackBpm = DEFAULT_REFERENCE_BPM): TempoMapEntry[] {
  const rows = Array.isArray(tempoMap) ? tempoMap : [];
  const normalized = rows
    .map((row) => ({
      startColumn: Math.max(0, Math.floor(Number(row?.startColumn) || 0)),
      bpm: clampBpm(Number(row?.bpm), fallbackBpm)
    }))
    .sort((a, b) => a.startColumn - b.startColumn);

  const deduped: TempoMapEntry[] = [];
  for (const row of normalized) {
    const last = deduped[deduped.length - 1];
    if (last && last.startColumn === row.startColumn) {
      last.bpm = row.bpm;
    } else {
      deduped.push({ ...row });
    }
  }

  if (deduped.length === 0 || deduped[0].startColumn !== 0) {
    deduped.unshift({ startColumn: 0, bpm: clampBpm(fallbackBpm, DEFAULT_REFERENCE_BPM) });
  }
  return deduped;
}

export function getTempoAtColumn(tempoMap: TempoMapEntry[], column: number): TempoMapEntry {
  const safeColumn = Math.max(0, Math.floor(Number(column) || 0));
  const normalized = normalizeTempoMap(tempoMap);
  let picked = normalized[0];
  for (const row of normalized) {
    if (row.startColumn > safeColumn) break;
    picked = row;
  }
  return picked;
}

export function getTempoScale(levelBpm: number, referenceBpm = DEFAULT_REFERENCE_BPM): number {
  const safeReference = normalizePositive(referenceBpm, DEFAULT_REFERENCE_BPM);
  const safeLevelBpm = clampBpm(levelBpm, safeReference);
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

export function stepTempoToward(
  currentBpm: number,
  targetBpm: number,
  maxDeltaBpmPerSecond: number,
  deltaSeconds: number
): number {
  const current = clampBpm(currentBpm);
  const target = clampBpm(targetBpm, current);
  const rate = normalizePositive(maxDeltaBpmPerSecond, DEFAULT_TEMPO_SMOOTHING_BPM_PER_SECOND);
  const dt = Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0);
  const maxDelta = rate * dt;
  if (maxDelta <= 0) return current;
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}
