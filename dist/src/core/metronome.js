import { clampBpm, DEFAULT_REFERENCE_BPM } from './tempo.js';
export class Metronome {
    subdivision;
    anchorMs = 0;
    anchorSubdivision = 0;
    currentBpm;
    constructor(bpm, subdivision = 4) {
        this.subdivision = subdivision;
        this.currentBpm = clampBpm(bpm, DEFAULT_REFERENCE_BPM);
    }
    get bpm() {
        return this.currentBpm;
    }
    get beatIntervalMs() {
        return 60000 / this.currentBpm;
    }
    get subdivisionIntervalMs() {
        return this.beatIntervalMs / this.subdivision;
    }
    getSubdivisionFloatAt(timeMs) {
        const safeTime = Math.max(this.anchorMs, Number.isFinite(timeMs) ? timeMs : this.anchorMs);
        const elapsed = safeTime - this.anchorMs;
        return this.anchorSubdivision + elapsed / this.subdivisionIntervalMs;
    }
    getBeatFloatAt(timeMs) {
        return this.getSubdivisionFloatAt(timeMs) / this.subdivision;
    }
    setBpm(nextBpm, atTimeMs) {
        const safeBpm = clampBpm(nextBpm, this.currentBpm);
        if (safeBpm === this.currentBpm)
            return;
        const safeTime = Math.max(0, Number.isFinite(atTimeMs) ? atTimeMs : 0);
        const currentSubdivision = this.getSubdivisionFloatAt(safeTime);
        this.anchorMs = safeTime;
        this.anchorSubdivision = currentSubdivision;
        this.currentBpm = safeBpm;
    }
    nextSubdivisionAt(timeMs) {
        const currentSubdivision = this.getSubdivisionFloatAt(timeMs);
        const epsilon = 1e-9;
        const targetSubdivision = Math.ceil(currentSubdivision - epsilon);
        return this.anchorMs + (targetSubdivision - this.anchorSubdivision) * this.subdivisionIntervalMs;
    }
    beatIndexAt(timeMs) {
        return Math.floor(this.getBeatFloatAt(timeMs));
    }
    beatProgressAt(timeMs) {
        const beatFloat = this.getBeatFloatAt(timeMs);
        return beatFloat - Math.floor(beatFloat);
    }
    beatInBarAt(timeMs) {
        const beat = ((this.beatIndexAt(timeMs) % 4) + 4) % 4;
        return (beat + 1);
    }
}
