import { Metronome } from './metronome.js';
import { BeatStep, MovementDirection } from './types.js';

export class BeatSnapMover {
  private queue: MovementDirection[] = [];
  private activeStep: BeatStep | null = null;
  private position = 0;

  constructor(private readonly metronome: Metronome, private readonly cellSize = 48) {}

  enqueue(direction: MovementDirection): void {
    if (direction !== 'idle') {
      this.queue.push(direction);
    }
  }

  get x(): number {
    return this.position;
  }

  get currentStep(): BeatStep | null {
    return this.activeStep;
  }

  get queuedCount(): number {
    return this.queue.length;
  }

  get stepSize(): number {
    return this.cellSize;
  }

  stopAt(position: number): void {
    this.position = position;
    this.activeStep = null;
    this.queue = [];
  }

  update(nowMs: number): { x: number; arrived: boolean; direction: MovementDirection } {
    if (!this.activeStep && this.queue.length > 0) {
      const direction = this.queue.shift()!;
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

    // Grid-anchored movement: hold position until beat subdivision, then snap.
    this.position = this.activeStep.fromX;
    return { x: this.position, arrived: false, direction: this.activeStep.direction };
  }
}
