export class Metronome {
    bpm;
    subdivision;
    constructor(bpm, subdivision = 4) {
        this.bpm = bpm;
        this.subdivision = subdivision;
    }
    get beatIntervalMs() {
        return 60000 / this.bpm;
    }
    get subdivisionIntervalMs() {
        return this.beatIntervalMs / this.subdivision;
    }
    nextSubdivisionAt(timeMs) {
        const step = this.subdivisionIntervalMs;
        return Math.ceil(timeMs / step) * step;
    }
    beatInBarAt(timeMs) {
        const beat = Math.floor(timeMs / this.beatIntervalMs) % 4;
        return (beat + 1);
    }
}
