import type { MovementDirection } from './types.js';

export interface ForwardSpeedSignal {
  coherentForward: boolean;
  stepDurationMs: number;
  cellsPerSecond: number;
  lookaheadSteps: number;
}

export interface PredictedGridEvent {
  gridIndex: number;
  direction: 'forward';
  targetTimeMs: number;
  eventKey: string;
}

interface DeriveForwardSpeedSignalInput {
  inputDirection: MovementDirection;
  activeStepDirection?: MovementDirection | null;
  activeStepDurationMs?: number | null;
  averageStepDurationMs?: number | null;
}

interface PlanForwardGridEventsInput {
  fromColumn: number;
  maxColumn: number;
  firstTargetTimeMs: number;
  stepDurationMs: number;
  lookaheadSteps: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isFinitePositive(value: number | null | undefined): value is number {
  return Number.isFinite(value) && (value ?? 0) > 0;
}

export function buildGridEventKey(direction: MovementDirection, column: number, targetTimeMs: number): string {
  const safeColumn = Math.max(0, Math.floor(Number(column) || 0));
  const roundedTarget = Math.round(Number(targetTimeMs) || 0);
  return `${direction}:${safeColumn}:${roundedTarget}`;
}

export function deriveForwardSpeedSignal(input: DeriveForwardSpeedSignalInput): ForwardSpeedSignal {
  const isForwardInput = input.inputDirection === 'forward';
  const coherentDirection = !input.activeStepDirection || input.activeStepDirection === 'forward';
  if (!isForwardInput || !coherentDirection) {
    return {
      coherentForward: false,
      stepDurationMs: 0,
      cellsPerSecond: 0,
      lookaheadSteps: 0
    };
  }

  const stepDurationMs = isFinitePositive(input.activeStepDurationMs)
    ? input.activeStepDurationMs
    : isFinitePositive(input.averageStepDurationMs)
      ? input.averageStepDurationMs
      : 0;

  if (!isFinitePositive(stepDurationMs)) {
    return {
      coherentForward: false,
      stepDurationMs: 0,
      cellsPerSecond: 0,
      lookaheadSteps: 0
    };
  }

  const cellsPerSecond = 1000 / stepDurationMs;
  const lookaheadSteps = clamp(Math.round(cellsPerSecond * 0.5), 1, 3);

  return {
    coherentForward: true,
    stepDurationMs,
    cellsPerSecond,
    lookaheadSteps
  };
}

export function planForwardGridEvents(input: PlanForwardGridEventsInput): PredictedGridEvent[] {
  const maxColumn = Math.max(0, Math.floor(Number(input.maxColumn) || 0));
  const fromColumn = clamp(Math.floor(Number(input.fromColumn) || 0), 0, maxColumn);
  const firstTargetTimeMs = Number(input.firstTargetTimeMs);
  const stepDurationMs = Number(input.stepDurationMs);
  const lookaheadSteps = clamp(Math.floor(Number(input.lookaheadSteps) || 0), 0, 3);

  if (!Number.isFinite(firstTargetTimeMs) || !isFinitePositive(stepDurationMs) || lookaheadSteps <= 0) {
    return [];
  }

  const planned: PredictedGridEvent[] = [];
  for (let i = 0; i < lookaheadSteps; i++) {
    const gridIndex = fromColumn + i + 1;
    if (gridIndex > maxColumn) break;
    const targetTimeMs = firstTargetTimeMs + i * stepDurationMs;
    planned.push({
      gridIndex,
      direction: 'forward',
      targetTimeMs,
      eventKey: buildGridEventKey('forward', gridIndex, targetTimeMs)
    });
  }

  return planned;
}

export function computeScheduledAtSec(
  nowCtxSec: number,
  nowMs: number,
  targetTimeMs: number,
  leadMs: number
): number {
  const deltaMs = Math.max(0, targetTimeMs - nowMs);
  return nowCtxSec + deltaMs / 1000 + Math.max(0, leadMs) / 1000;
}

export function computeLatenessMs(nowMs: number, targetTimeMs: number): number {
  return Math.max(0, nowMs - targetTimeMs);
}

export function isAudioUnderrun(latenessMs: number, thresholdMs = 30): boolean {
  return Number.isFinite(latenessMs) && latenessMs > Math.max(0, thresholdMs);
}
