import { clampBpm, DEFAULT_REFERENCE_BPM } from './tempo.js';

export class Metronome {
  private anchorMs = 0;
  private anchorSubdivision = 0;
  private currentBpm: number;

  constructor(bpm: number, public readonly subdivision = 4) {
    this.currentBpm = clampBpm(bpm, DEFAULT_REFERENCE_BPM);
  }

  get bpm(): number {
    return this.currentBpm;
  }

  get beatIntervalMs(): number {
    return 60000 / this.currentBpm;
  }

  get subdivisionIntervalMs(): number {
    return this.beatIntervalMs / this.subdivision;
  }

  private getSubdivisionFloatAt(timeMs: number): number {
    const safeTime = Math.max(this.anchorMs, Number.isFinite(timeMs) ? timeMs : this.anchorMs);
    const elapsed = safeTime - this.anchorMs;
    return this.anchorSubdivision + elapsed / this.subdivisionIntervalMs;
  }

  private getBeatFloatAt(timeMs: number): number {
    return this.getSubdivisionFloatAt(timeMs) / this.subdivision;
  }

  setBpm(nextBpm: number, atTimeMs: number): void {
    const safeBpm = clampBpm(nextBpm, this.currentBpm);
    if (safeBpm === this.currentBpm) return;
    const safeTime = Math.max(0, Number.isFinite(atTimeMs) ? atTimeMs : 0);
    const currentSubdivision = this.getSubdivisionFloatAt(safeTime);
    this.anchorMs = safeTime;
    this.anchorSubdivision = currentSubdivision;
    this.currentBpm = safeBpm;
  }

  nextSubdivisionAt(timeMs: number): number {
    const currentSubdivision = this.getSubdivisionFloatAt(timeMs);
    const epsilon = 1e-9;
    const targetSubdivision = Math.ceil(currentSubdivision - epsilon);
    return this.anchorMs + (targetSubdivision - this.anchorSubdivision) * this.subdivisionIntervalMs;
  }

  beatIndexAt(timeMs: number): number {
    return Math.floor(this.getBeatFloatAt(timeMs));
  }

  beatProgressAt(timeMs: number): number {
    const beatFloat = this.getBeatFloatAt(timeMs);
    return beatFloat - Math.floor(beatFloat);
  }

  beatInBarAt(timeMs: number): 1 | 2 | 3 | 4 {
    const beat = ((this.beatIndexAt(timeMs) % 4) + 4) % 4;
    return (beat + 1) as 1 | 2 | 3 | 4;
  }
}
