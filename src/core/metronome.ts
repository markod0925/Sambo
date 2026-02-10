export class Metronome {
  constructor(public readonly bpm: number, public readonly subdivision = 4) {}

  get beatIntervalMs(): number {
    return 60000 / this.bpm;
  }

  get subdivisionIntervalMs(): number {
    return this.beatIntervalMs / this.subdivision;
  }

  nextSubdivisionAt(timeMs: number): number {
    const step = this.subdivisionIntervalMs;
    return Math.ceil(timeMs / step) * step;
  }

  beatInBarAt(timeMs: number): 1 | 2 | 3 | 4 {
    const beat = Math.floor(timeMs / this.beatIntervalMs) % 4;
    return (beat + 1) as 1 | 2 | 3 | 4;
  }
}
