import { Metronome } from './metronome.js';
import { BeatStep, MovementDirection } from './types.js';

const BASE_REFERENCE_BPM = 120;
const BASE_ACCEL_PX_PER_SEC2 = 640;
const BASE_FRICTION_PX_PER_SEC2 = 980;
const REVERSE_BRAKE_MULTIPLIER = 1.4;
const ASSIST_GRID_WINDOW_PX = 2.75;
const ASSIST_SUBDIVISION_WINDOW_MS = 24;
const ASSIST_MAX_CORRECTION_SPEED_PX_PER_SEC = 26;
const MOTION_EPSILON = 1e-3;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function approach(current: number, target: number, maxDelta: number): number {
  if (!Number.isFinite(current)) return target;
  if (!Number.isFinite(target)) return current;
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

function directionToSign(direction: MovementDirection): -1 | 0 | 1 {
  if (direction === 'forward') return 1;
  if (direction === 'backward') return -1;
  return 0;
}

export class BeatSnapMover {
  private position = 0;
  private velocity = 0;
  private inputDirection: MovementDirection = 'idle';
  private speedMultiplier = 1;
  private lastUpdateMs: number | null = null;
  private readonly subdivisionsPerStep: number;
  private readonly assistGridSize: number;

  constructor(
    private readonly metronome: Metronome,
    private readonly cellSize = 48,
    subdivisionsPerStep = 1,
    assistGridSize = cellSize
  ) {
    this.subdivisionsPerStep = Math.max(1, Math.floor(Number(subdivisionsPerStep) || 1));
    this.assistGridSize = Math.max(1, Number(assistGridSize) || this.cellSize);
  }

  setDirection(direction: MovementDirection): void {
    this.inputDirection = direction === 'forward' || direction === 'backward' ? direction : 'idle';
  }

  enqueue(direction: MovementDirection): void {
    this.setDirection(direction);
  }

  get x(): number {
    return this.position;
  }

  get currentStep(): BeatStep | null {
    return null;
  }

  get queuedCount(): number {
    return 0;
  }

  get stepSize(): number {
    return this.cellSize;
  }

  get velocityPxPerSec(): number {
    return this.velocity;
  }

  get maxSpeedPxPerSec(): number {
    const cadenceScale = this.metronome.subdivision / Math.max(1, this.subdivisionsPerStep);
    return this.cellSize * (this.metronome.bpm / 60) * cadenceScale;
  }

  get estimatedGridCellDurationMs(): number {
    const movingSpeed = Math.abs(this.velocity);
    if (movingSpeed > MOTION_EPSILON) {
      return (this.assistGridSize / movingSpeed) * 1000;
    }
    if (this.inputDirection !== 'idle') {
      const referenceSpeed = Math.max(MOTION_EPSILON, this.maxSpeedPxPerSec * this.speedMultiplier);
      return (this.assistGridSize / referenceSpeed) * 1000;
    }
    return 0;
  }

  stopAt(position: number): void {
    this.position = position;
    this.velocity = 0;
    this.inputDirection = 'idle';
    this.lastUpdateMs = null;
  }

  setVelocityPxPerSec(velocity: number): void {
    if (!Number.isFinite(velocity)) return;
    this.velocity = velocity;
  }

  setSpeedMultiplier(multiplier: number): void {
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      this.speedMultiplier = 1;
      return;
    }
    this.speedMultiplier = multiplier;
  }

  private applyRhythmAssist(nowMs: number, deltaSeconds: number): void {
    if (Math.abs(this.velocity) <= MOTION_EPSILON) return;
    if (deltaSeconds <= 0) return;

    const nearestGrid = Math.round(this.position / this.assistGridSize) * this.assistGridSize;
    const gridOffset = nearestGrid - this.position;
    if (Math.abs(gridOffset) > ASSIST_GRID_WINDOW_PX) return;

    const nextSubdivisionMs = this.metronome.nextSubdivisionAt(nowMs);
    const prevSubdivisionMs = nextSubdivisionMs - this.metronome.subdivisionIntervalMs;
    const subdivisionDistanceMs = Math.min(Math.abs(nowMs - prevSubdivisionMs), Math.abs(nextSubdivisionMs - nowMs));
    if (subdivisionDistanceMs > ASSIST_SUBDIVISION_WINDOW_MS) return;

    const maxCorrection = ASSIST_MAX_CORRECTION_SPEED_PX_PER_SEC * deltaSeconds;
    this.position += clamp(gridOffset, -maxCorrection, maxCorrection);
  }

  private resolveDirectionFromMotion(): MovementDirection {
    if (this.velocity > MOTION_EPSILON) return 'forward';
    if (this.velocity < -MOTION_EPSILON) return 'backward';
    return this.inputDirection === 'idle' ? 'idle' : this.inputDirection;
  }

  update(nowMs: number): { x: number; arrived: boolean; direction: MovementDirection } {
    const safeNowMs = Number.isFinite(nowMs) ? nowMs : 0;
    const previousUpdateMs = this.lastUpdateMs;
    this.lastUpdateMs = safeNowMs;

    const deltaSeconds =
      previousUpdateMs === null
        ? 0
        : Math.max(0, (Math.max(previousUpdateMs, safeNowMs) - previousUpdateMs) / 1000);

    if (deltaSeconds > 0) {
      const tempoScale = this.metronome.bpm / BASE_REFERENCE_BPM;
      const maxSpeed = this.maxSpeedPxPerSec;
      const boostedMaxSpeed = maxSpeed * this.speedMultiplier;
      const accel = BASE_ACCEL_PX_PER_SEC2 * tempoScale;
      const friction = BASE_FRICTION_PX_PER_SEC2 * tempoScale;
      const inputSign = directionToSign(this.inputDirection);

      if (inputSign === 0) {
        this.velocity = approach(this.velocity, 0, friction * deltaSeconds);
      } else {
        const targetVelocity = inputSign * boostedMaxSpeed;
        const reversing = this.velocity !== 0 && Math.sign(this.velocity) !== inputSign;
        const brakingAccel = accel * (reversing ? REVERSE_BRAKE_MULTIPLIER : 1);
        this.velocity = approach(this.velocity, targetVelocity, brakingAccel * deltaSeconds);
      }

      this.position += this.velocity * deltaSeconds;
      this.applyRhythmAssist(safeNowMs, deltaSeconds);
    }

    return { x: this.position, arrived: false, direction: this.resolveDirectionFromMotion() };
  }
}
