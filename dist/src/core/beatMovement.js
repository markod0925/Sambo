export class BeatSnapMover {
    metronome;
    cellSize;
    queue = [];
    activeStep = null;
    position = 0;
    subdivisionsPerStep;
    constructor(metronome, cellSize = 48, subdivisionsPerStep = 1) {
        this.metronome = metronome;
        this.cellSize = cellSize;
        this.subdivisionsPerStep = Math.max(1, Math.floor(Number(subdivisionsPerStep) || 1));
    }
    enqueue(direction) {
        if (direction !== 'idle') {
            this.queue.push(direction);
        }
    }
    get x() {
        return this.position;
    }
    get currentStep() {
        return this.activeStep;
    }
    get queuedCount() {
        return this.queue.length;
    }
    get stepSize() {
        return this.cellSize;
    }
    stopAt(position) {
        this.position = position;
        this.activeStep = null;
        this.queue = [];
    }
    update(nowMs) {
        if (!this.activeStep && this.queue.length > 0) {
            const direction = this.queue.shift();
            const fromX = this.position;
            const toX = direction === 'forward' ? fromX + this.cellSize : fromX - this.cellSize;
            this.activeStep = {
                fromX,
                toX,
                startTime: nowMs,
                arrivalTime: this.metronome.nextSubdivisionAt(nowMs),
                direction
            };
            if (this.activeStep.arrivalTime === nowMs) {
                this.activeStep.arrivalTime += this.metronome.subdivisionIntervalMs;
            }
            this.activeStep.arrivalTime += this.metronome.subdivisionIntervalMs * (this.subdivisionsPerStep - 1);
        }
        if (!this.activeStep) {
            return { x: this.position, arrived: false, direction: 'idle' };
        }
        if (nowMs >= this.activeStep.arrivalTime) {
            this.position = this.activeStep.toX;
            const direction = this.activeStep.direction;
            this.activeStep = null;
            return { x: this.position, arrived: true, direction };
        }
        const travelMs = Math.max(1, this.activeStep.arrivalTime - this.activeStep.startTime);
        const elapsedMs = Math.max(0, nowMs - this.activeStep.startTime);
        const progress = Math.min(1, elapsedMs / travelMs);
        this.position = this.activeStep.fromX + (this.activeStep.toX - this.activeStep.fromX) * progress;
        return { x: this.position, arrived: false, direction: this.activeStep.direction };
    }
}
