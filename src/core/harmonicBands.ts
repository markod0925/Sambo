export const HARMONIC_BAND_COUNT = 12;
export const HARMONIC_PC_SMOOTH_TAU_SECONDS = 0.2;
export const HARMONIC_INTENSITY_SMOOTH_TAU_SECONDS = 0.12;

export function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function computeExponentialSmoothingAlpha(deltaSeconds: number, tauSeconds: number): number {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return 0;
  if (!Number.isFinite(tauSeconds) || tauSeconds <= 0) return 1;
  return clampUnit(1 - Math.exp(-deltaSeconds / tauSeconds));
}

export function smoothScalarExponential(
  current: number,
  target: number,
  deltaSeconds: number,
  tauSeconds: number
): number {
  const alpha = computeExponentialSmoothingAlpha(deltaSeconds, tauSeconds);
  return clampUnit(current + (target - current) * alpha);
}

export function clearPitchClassBins(out: Float32Array): void {
  const limit = Math.min(HARMONIC_BAND_COUNT, out.length);
  for (let i = 0; i < limit; i++) out[i] = 0;
}

export function fillPitchClassBinsFromPitchCounts(
  pitchCounts: ReadonlyMap<number, number>,
  outBins: Float32Array
): void {
  clearPitchClassBins(outBins);
  if (!pitchCounts || pitchCounts.size === 0) return;

  let maxBin = 0;
  for (const [pitch, count] of pitchCounts.entries()) {
    if (!Number.isFinite(pitch) || !Number.isFinite(count) || count <= 0) continue;
    const safePitch = Math.floor(pitch);
    const pitchClass = ((safePitch % HARMONIC_BAND_COUNT) + HARMONIC_BAND_COUNT) % HARMONIC_BAND_COUNT;
    const next = outBins[pitchClass] + count;
    outBins[pitchClass] = next;
    if (next > maxBin) maxBin = next;
  }

  if (!(maxBin > 0)) {
    clearPitchClassBins(outBins);
    return;
  }

  const invMax = 1 / maxBin;
  const limit = Math.min(HARMONIC_BAND_COUNT, outBins.length);
  for (let i = 0; i < limit; i++) {
    outBins[i] = clampUnit(outBins[i] * invMax);
  }
}

export function smoothPitchClassBinsInPlace(
  currentBins: Float32Array,
  targetBins: Float32Array,
  deltaSeconds: number,
  tauSeconds: number
): void {
  const alpha = computeExponentialSmoothingAlpha(deltaSeconds, tauSeconds);
  if (alpha <= 0) return;
  const limit = Math.min(HARMONIC_BAND_COUNT, currentBins.length, targetBins.length);
  for (let i = 0; i < limit; i++) {
    const target = clampUnit(targetBins[i]);
    currentBins[i] = clampUnit(currentBins[i] + (target - currentBins[i]) * alpha);
  }
}
