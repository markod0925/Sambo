import { EnergyState, Segment } from './types.js';

export interface AnalysisData {
  bpm: number;
  energy_curve: number[];
}

export type RuntimePlatformKind = Exclude<Segment['platformTypes'][number], 'static'> | 'segment';

export interface KindSequenceRules {
  enableEnergyGate?: boolean;
  maxStaticRun?: number;
  maxTimedRun?: number;
  minSegmentsBetweenLaunches?: number;
  forbidPairs?: Array<[RuntimePlatformKind, RuntimePlatformKind]>;
}

export interface PatternSegmentInput {
  energyState: EnergyState;
  platformTypes: Segment['platformTypes'];
  rhythmDensity: number;
}

type PatternFlowTag = 'safe' | 'timed' | 'rewind' | 'mobile' | 'utility' | 'hazard' | 'launch';

interface PatternStep {
  kinds: Array<RuntimePlatformKind | null>;
}

interface PatternTemplate {
  id: string;
  weight: number;
  energies: EnergyState[];
  minDensity: number;
  maxDensity: number;
  entry: PatternFlowTag;
  exit: PatternFlowTag;
  steps: PatternStep[];
}

export const defaultKindSequenceRules: Required<KindSequenceRules> = {
  enableEnergyGate: true,
  maxStaticRun: 3,
  maxTimedRun: 2,
  minSegmentsBetweenLaunches: 4,
  forbidPairs: [
    ['beat', 'beat'],
    ['beat', 'alternateBeat'],
    ['alternateBeat', 'beat'],
    ['alternateBeat', 'alternateBeat']
  ]
};

const allRuntimeKinds: RuntimePlatformKind[] = [
  'segment',
  'beat',
  'alternateBeat',
  'ghost',
  'reverseGhost',
  'elevator',
  'shuttle',
  'cross',
  'spring',
  'hazard',
  'launch30',
  'launch60'
];

const timedKinds = new Set<RuntimePlatformKind>(['beat', 'alternateBeat', 'ghost', 'reverseGhost']);
const launchKinds = new Set<RuntimePlatformKind>(['launch30', 'launch60']);
const patternReuseCooldown = 2;

const patternTransitionMap: Record<PatternFlowTag, Set<PatternFlowTag>> = {
  safe: new Set<PatternFlowTag>(['safe', 'timed', 'rewind', 'mobile', 'utility', 'hazard', 'launch']),
  timed: new Set<PatternFlowTag>(['safe', 'timed', 'rewind', 'mobile', 'utility']),
  rewind: new Set<PatternFlowTag>(['safe', 'timed', 'rewind', 'mobile', 'utility', 'launch']),
  mobile: new Set<PatternFlowTag>(['safe', 'timed', 'rewind', 'mobile', 'utility', 'launch']),
  utility: new Set<PatternFlowTag>(['safe', 'timed', 'rewind', 'mobile', 'utility', 'launch']),
  hazard: new Set<PatternFlowTag>(['safe', 'rewind', 'mobile', 'utility']),
  launch: new Set<PatternFlowTag>(['safe', 'rewind', 'mobile'])
};

const patternTemplates: PatternTemplate[] = [
  {
    id: 'low_beat_gate',
    weight: 1.1,
    energies: ['low', 'medium'],
    minDensity: 0,
    maxDensity: 0.62,
    entry: 'safe',
    exit: 'timed',
    steps: [{ kinds: ['segment'] }, { kinds: ['beat', 'alternateBeat'] }, { kinds: ['segment'] }]
  },
  {
    id: 'low_elevator_breath',
    weight: 1,
    energies: ['low', 'medium'],
    minDensity: 0,
    maxDensity: 0.6,
    entry: 'safe',
    exit: 'mobile',
    steps: [{ kinds: ['segment'] }, { kinds: ['elevator'] }, { kinds: ['segment'] }]
  },
  {
    id: 'medium_rewind_bridge',
    weight: 1.25,
    energies: ['medium', 'high'],
    minDensity: 0.35,
    maxDensity: 1,
    entry: 'safe',
    exit: 'rewind',
    steps: [{ kinds: ['segment'] }, { kinds: ['ghost'] }, { kinds: ['reverseGhost'] }, { kinds: ['segment'] }]
  },
  {
    id: 'medium_mobile_cross',
    weight: 1.2,
    energies: ['medium', 'high'],
    minDensity: 0.4,
    maxDensity: 1,
    entry: 'safe',
    exit: 'mobile',
    steps: [{ kinds: ['segment'] }, { kinds: ['shuttle'] }, { kinds: ['cross'] }, { kinds: ['segment'] }]
  },
  {
    id: 'medium_spring_setup',
    weight: 1.1,
    energies: ['medium', 'high'],
    minDensity: 0.4,
    maxDensity: 1,
    entry: 'mobile',
    exit: 'utility',
    steps: [{ kinds: ['elevator'] }, { kinds: ['spring'] }, { kinds: ['segment'] }]
  },
  {
    id: 'medium_timed_weave',
    weight: 1.05,
    energies: ['medium', 'high'],
    minDensity: 0.4,
    maxDensity: 1,
    entry: 'timed',
    exit: 'timed',
    steps: [{ kinds: ['beat'] }, { kinds: ['segment'] }, { kinds: ['alternateBeat'] }]
  },
  {
    id: 'high_hazard_window',
    weight: 1.25,
    energies: ['high'],
    minDensity: 0.55,
    maxDensity: 1,
    entry: 'safe',
    exit: 'hazard',
    steps: [{ kinds: ['segment'] }, { kinds: ['hazard'] }, { kinds: ['segment'] }]
  },
  {
    id: 'high_launch_30_arc',
    weight: 1.4,
    energies: ['high'],
    minDensity: 0.65,
    maxDensity: 1,
    entry: 'safe',
    exit: 'launch',
    steps: [{ kinds: ['segment'] }, { kinds: ['launch30'] }, { kinds: ['segment'] }, { kinds: ['ghost'] }]
  },
  {
    id: 'high_launch_60_arc',
    weight: 1.35,
    energies: ['high'],
    minDensity: 0.7,
    maxDensity: 1,
    entry: 'safe',
    exit: 'launch',
    steps: [{ kinds: ['segment'] }, { kinds: ['launch60'] }, { kinds: ['segment'] }, { kinds: ['spring'] }]
  },
  {
    id: 'high_rewind_launch_mix',
    weight: 1.25,
    energies: ['high'],
    minDensity: 0.65,
    maxDensity: 1,
    entry: 'rewind',
    exit: 'launch',
    steps: [{ kinds: ['reverseGhost'] }, { kinds: ['segment'] }, { kinds: ['launch30'] }, { kinds: ['segment'] }]
  },
  {
    id: 'high_pressure_mix',
    weight: 1.3,
    energies: ['high'],
    minDensity: 0.72,
    maxDensity: 1,
    entry: 'mobile',
    exit: 'safe',
    steps: [{ kinds: ['shuttle'] }, { kinds: ['hazard'] }, { kinds: ['segment'] }, { kinds: ['cross'] }]
  }
];

const energyGateKinds: Record<EnergyState, Set<RuntimePlatformKind>> = {
  low: new Set<RuntimePlatformKind>(['segment', 'beat', 'alternateBeat', 'elevator']),
  medium: new Set<RuntimePlatformKind>([
    'segment',
    'beat',
    'alternateBeat',
    'ghost',
    'reverseGhost',
    'elevator',
    'shuttle',
    'cross',
    'spring'
  ]),
  high: new Set<RuntimePlatformKind>(allRuntimeKinds)
};

export function classifyEnergy(value: number): EnergyState {
  if (value < 0.33) return 'low';
  if (value < 0.66) return 'medium';
  return 'high';
}

function mapPlatformTypeToRuntimeKind(platformType: Segment['platformTypes'][number]): RuntimePlatformKind {
  if (platformType === 'static') return 'segment';
  if (allRuntimeKinds.includes(platformType)) return platformType;
  return 'segment';
}

function deterministicUnit(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function clampUnit(value: number): number {
  const n = Number.isFinite(value) ? value : 0.5;
  return Math.max(0, Math.min(1, n));
}

function trailingRunLength<T>(items: T[], predicate: (item: T) => boolean): number {
  let count = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    if (!predicate(items[i])) break;
    count += 1;
  }
  return count;
}

function weightedChoice<T>(candidates: T[], getWeight: (candidate: T) => number, roll: number): T {
  if (candidates.length === 1) return candidates[0];
  const weights = candidates.map((candidate) => Math.max(0.0001, getWeight(candidate)));
  const total = weights.reduce((acc, w) => acc + w, 0);
  let target = clampUnit(roll) * total;
  for (let i = 0; i < candidates.length; i++) {
    target -= weights[i];
    if (target <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

function kindWeight(kind: RuntimePlatformKind | null, seg: PatternSegmentInput): number {
  const density = clampUnit(seg.rhythmDensity);
  if (kind === null) {
    return 0.03 + (1 - density) * 0.1;
  }
  if (kind === 'segment') {
    return 0.5 + (1 - density) * 0.6;
  }

  let weight = 0.7 + density * 1.1;
  if (seg.energyState === 'high') weight *= 1.2;
  if (seg.energyState === 'low') weight *= 0.75;
  if (timedKinds.has(kind)) weight *= 1 + density * 0.25;
  return weight;
}

function toUniqueKinds(platformTypes: Segment['platformTypes']): RuntimePlatformKind[] {
  const mappedKinds = platformTypes.map((platformType) => mapPlatformTypeToRuntimeKind(platformType));
  const unique = new Set<RuntimePlatformKind>(mappedKinds);
  unique.add('segment');
  return [...unique];
}

function applyEnergyGate(kinds: Array<RuntimePlatformKind | null>, seg: PatternSegmentInput): Array<RuntimePlatformKind | null> {
  const allowed = energyGateKinds[seg.energyState];
  return kinds.filter((kind) => kind === null || allowed.has(kind));
}

function getSegmentKindCandidates(seg: PatternSegmentInput, rules: Required<KindSequenceRules>): Array<RuntimePlatformKind | null> {
  const baseKinds = toUniqueKinds(seg.platformTypes);
  const withBlanks: Array<RuntimePlatformKind | null> = [...baseKinds, null];
  if (!rules.enableEnergyGate) return withBlanks;
  return applyEnergyGate(withBlanks, seg);
}

function applyPairForbids(
  kinds: Array<RuntimePlatformKind | null>,
  history: Array<RuntimePlatformKind | null>,
  rules: Required<KindSequenceRules>
): Array<RuntimePlatformKind | null> {
  const previous = history.length > 0 ? history[history.length - 1] : null;
  if (previous === null) return kinds;
  let filtered = kinds;
  for (const [fromKind, toKind] of rules.forbidPairs) {
    if (previous !== fromKind) continue;
    filtered = filtered.filter((kind) => kind !== toKind);
  }
  return filtered;
}

function countSegmentsSinceLastLaunch(history: Array<RuntimePlatformKind | null>): number {
  let segmentsSinceLastLaunch = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const kind = history[i];
    if (kind !== null && launchKinds.has(kind)) return segmentsSinceLastLaunch;
    if (kind === 'segment') segmentsSinceLastLaunch += 1;
  }
  return Number.POSITIVE_INFINITY;
}

function applyLaunchSpacingRule(
  kinds: Array<RuntimePlatformKind | null>,
  history: Array<RuntimePlatformKind | null>,
  rules: Required<KindSequenceRules>
): Array<RuntimePlatformKind | null> {
  if (rules.minSegmentsBetweenLaunches <= 0) return kinds;
  const segmentsSinceLastLaunch = countSegmentsSinceLastLaunch(history);
  if (!Number.isFinite(segmentsSinceLastLaunch) || segmentsSinceLastLaunch >= rules.minSegmentsBetweenLaunches) return kinds;
  return kinds.filter((kind) => kind === null || !launchKinds.has(kind));
}

function applyMaxRunRules(
  kinds: Array<RuntimePlatformKind | null>,
  history: Array<RuntimePlatformKind | null>,
  rules: Required<KindSequenceRules>
): Array<RuntimePlatformKind | null> {
  let filtered = kinds;
  const staticRun = trailingRunLength(history, (kind) => kind === 'segment');
  const hasNonStaticAlternative = kinds.some((kind) => kind !== null && kind !== 'segment');
  if (staticRun >= rules.maxStaticRun && hasNonStaticAlternative) {
    filtered = filtered.filter((kind) => kind !== 'segment');
  }

  const timedRun = trailingRunLength(history, (kind) => kind !== null && timedKinds.has(kind));
  if (timedRun >= rules.maxTimedRun) {
    filtered = filtered.filter((kind) => kind === null || !timedKinds.has(kind));
  }
  return filtered;
}

function applyGlobalKindRules(
  kinds: Array<RuntimePlatformKind | null>,
  history: Array<RuntimePlatformKind | null>,
  rules: Required<KindSequenceRules>
): Array<RuntimePlatformKind | null> {
  let filtered = applyPairForbids(kinds, history, rules);
  filtered = applyLaunchSpacingRule(filtered, history, rules);
  filtered = applyMaxRunRules(filtered, history, rules);
  return filtered;
}

function isPatternTransitionAllowed(previousExit: PatternFlowTag, nextEntry: PatternFlowTag): boolean {
  return patternTransitionMap[previousExit].has(nextEntry);
}

function isPatternCompatibleWithSegment(pattern: PatternTemplate, seg: PatternSegmentInput): boolean {
  if (!pattern.energies.includes(seg.energyState)) return false;
  const density = clampUnit(seg.rhythmDensity);
  return density >= pattern.minDensity && density <= pattern.maxDensity;
}

function patternStepHasInterestingKind(step: PatternStep): boolean {
  return step.kinds.some((kind) => kind !== null && kind !== 'segment');
}

function hasPatternInterestingKinds(pattern: PatternTemplate): boolean {
  return pattern.steps.some((step) => patternStepHasInterestingKind(step));
}

function inferFlowTagFromKind(kind: RuntimePlatformKind | null): PatternFlowTag {
  if (kind === 'ghost' || kind === 'reverseGhost') return 'rewind';
  if (kind === 'beat' || kind === 'alternateBeat') return 'timed';
  if (kind === 'elevator' || kind === 'shuttle' || kind === 'cross') return 'mobile';
  if (kind === 'spring') return 'utility';
  if (kind === 'hazard') return 'hazard';
  if (kind !== null && launchKinds.has(kind)) return 'launch';
  return 'safe';
}

function pickKindCandidate(
  candidates: Array<RuntimePlatformKind | null>,
  seg: PatternSegmentInput,
  rollSeed: number,
  prioritizeOrder = false
): RuntimePlatformKind | null {
  if (candidates.length === 1) return candidates[0];
  const roll = deterministicUnit(rollSeed);
  return weightedChoice(
    candidates,
    (kind) => {
      const baseWeight = kindWeight(kind, seg);
      if (!prioritizeOrder) return baseWeight;
      const index = candidates.indexOf(kind);
      const orderBoost = 1 + (candidates.length - index - 1) * 0.45;
      return baseWeight * orderBoost;
    },
    roll
  );
}

function tryPlacePattern(
  pattern: PatternTemplate,
  startIndex: number,
  segments: PatternSegmentInput[],
  history: Array<RuntimePlatformKind | null>,
  rules: Required<KindSequenceRules>,
  seed: number
): Array<RuntimePlatformKind | null> | null {
  const localHistory = [...history];
  const placed: Array<RuntimePlatformKind | null> = [];
  let interestingHits = 0;

  for (let stepIndex = 0; stepIndex < pattern.steps.length; stepIndex++) {
    const seg = segments[startIndex + stepIndex];
    if (!seg) return null;
    if (!isPatternCompatibleWithSegment(pattern, seg)) return null;

    const baseCandidates = getSegmentKindCandidates(seg, rules);
    const allowedCandidates = applyGlobalKindRules(baseCandidates, localHistory, rules);
    if (allowedCandidates.length === 0) return null;

    const preferredCandidates = pattern.steps[stepIndex].kinds.filter((kind) => allowedCandidates.includes(kind));
    const chosenPool = preferredCandidates.length > 0 ? preferredCandidates : allowedCandidates;
    const picked = pickKindCandidate(
      chosenPool,
      seg,
      seed + (startIndex + 1) * 107.33 + (stepIndex + 1) * 41.71,
      preferredCandidates.length > 0
    );
    placed.push(picked);
    localHistory.push(picked);
    if (picked !== null && picked !== 'segment') interestingHits += 1;
  }

  if (hasPatternInterestingKinds(pattern) && interestingHits === 0) {
    return null;
  }

  return placed;
}

function computePatternPickScore(pattern: PatternTemplate, segmentWindow: PatternSegmentInput[], rollSeed: number): number {
  const avgDensity =
    segmentWindow.length > 0
      ? segmentWindow.reduce((acc, seg) => acc + clampUnit(seg.rhythmDensity), 0) / segmentWindow.length
      : 0;
  const targetDensity = (pattern.minDensity + pattern.maxDensity) * 0.5;
  const densityCloseness = 1 - Math.min(1, Math.abs(avgDensity - targetDensity));
  const complexityBoost = hasPatternInterestingKinds(pattern) ? 1.08 : 1;
  const randomness = 0.75 + deterministicUnit(rollSeed) * 0.65;
  return pattern.weight * (0.45 + densityCloseness * 0.85) * complexityBoost * randomness;
}

function collectPatternCandidates(
  startIndex: number,
  segments: PatternSegmentInput[],
  previousExit: PatternFlowTag,
  recentPatternIds: string[],
  seed: number
): PatternTemplate[] {
  const remaining = segments.length - startIndex;
  const candidates = patternTemplates.filter((pattern) => {
    if (pattern.steps.length <= 0 || pattern.steps.length > remaining) return false;
    if (!isPatternTransitionAllowed(previousExit, pattern.entry)) return false;
    if (recentPatternIds.includes(pattern.id)) return false;
    for (let i = 0; i < pattern.steps.length; i++) {
      const seg = segments[startIndex + i];
      if (!seg || !isPatternCompatibleWithSegment(pattern, seg)) return false;
    }
    return true;
  });

  return candidates.sort((a, b) => {
    const windowA = segments.slice(startIndex, startIndex + a.steps.length);
    const windowB = segments.slice(startIndex, startIndex + b.steps.length);
    const scoreA = computePatternPickScore(a, windowA, seed + (startIndex + 1) * 29.7 + a.steps.length * 7.3);
    const scoreB = computePatternPickScore(b, windowB, seed + (startIndex + 1) * 29.7 + b.steps.length * 7.3);
    return scoreB - scoreA;
  });
}

function pickLegacyKind(
  seg: PatternSegmentInput,
  history: Array<RuntimePlatformKind | null>,
  rules: Required<KindSequenceRules>,
  seed: number
): RuntimePlatformKind | null {
  const baseCandidates = getSegmentKindCandidates(seg, rules);
  let candidates = applyGlobalKindRules(baseCandidates, history, rules);
  if (candidates.length === 0) {
    const fallbackBase = getSegmentKindCandidates(seg, { ...rules, enableEnergyGate: false });
    candidates = applyGlobalKindRules(fallbackBase, history, rules);
  }
  if (candidates.length === 0) return 'segment';
  return pickKindCandidate(candidates, seg, seed);
}

function resolveKindRules(rules: KindSequenceRules | undefined): Required<KindSequenceRules> {
  return {
    enableEnergyGate: rules?.enableEnergyGate ?? defaultKindSequenceRules.enableEnergyGate,
    maxStaticRun: Math.max(1, Math.floor(rules?.maxStaticRun ?? defaultKindSequenceRules.maxStaticRun)),
    maxTimedRun: Math.max(1, Math.floor(rules?.maxTimedRun ?? defaultKindSequenceRules.maxTimedRun)),
    minSegmentsBetweenLaunches: Math.max(
      0,
      Math.floor(rules?.minSegmentsBetweenLaunches ?? defaultKindSequenceRules.minSegmentsBetweenLaunches)
    ),
    forbidPairs: Array.isArray(rules?.forbidPairs) && rules!.forbidPairs.length > 0 ? rules!.forbidPairs : defaultKindSequenceRules.forbidPairs
  };
}

export function generatePlatformKindSequence(
  segments: PatternSegmentInput[],
  seed = 1,
  rules: KindSequenceRules = defaultKindSequenceRules
): Array<RuntimePlatformKind | null> {
  const resolvedRules = resolveKindRules(rules);
  const history: Array<RuntimePlatformKind | null> = [];
  const result: Array<RuntimePlatformKind | null> = [];
  const recentPatternIds: string[] = [];
  let previousExit: PatternFlowTag = 'safe';

  for (let i = 0; i < segments.length; ) {
    const candidates = collectPatternCandidates(i, segments, previousExit, recentPatternIds, seed);
    let pickedPattern: PatternTemplate | null = null;
    let placement: Array<RuntimePlatformKind | null> | null = null;

    for (const candidate of candidates) {
      const trial = tryPlacePattern(candidate, i, segments, history, resolvedRules, seed);
      if (!trial) continue;
      pickedPattern = candidate;
      placement = trial;
      break;
    }

    if (!placement) {
      const fallback = pickLegacyKind(segments[i], history, resolvedRules, seed + (i + 1) * 97.137);
      result.push(fallback);
      history.push(fallback);
      previousExit = inferFlowTagFromKind(fallback);
      i += 1;
      continue;
    }

    for (const kind of placement) {
      result.push(kind);
      history.push(kind);
    }
    if (pickedPattern) {
      recentPatternIds.unshift(pickedPattern.id);
      if (recentPatternIds.length > patternReuseCooldown) recentPatternIds.pop();
      previousExit = pickedPattern.exit;
    } else {
      previousExit = inferFlowTagFromKind(placement[placement.length - 1] ?? null);
    }
    i += placement.length;
  }

  return result;
}

export function generateSegments(analysis: AnalysisData, windowSize = 4): Segment[] {
  const segments: Segment[] = [];
  for (let i = 0; i < analysis.energy_curve.length; i += windowSize) {
    const window = analysis.energy_curve.slice(i, i + windowSize);
    const avg = window.reduce((a, b) => a + b, 0) / window.length;
    const energyState = classifyEnergy(avg);
    segments.push(templateForEnergy(energyState));
  }
  return segments;
}

function templateForEnergy(energy: EnergyState): Segment {
  if (energy === 'low') {
    return {
      durationBeats: 8,
      energyState: energy,
      platformTypes: ['static', 'beat', 'alternateBeat', 'elevator'],
      verticalRange: [0, 1],
      rhythmDensity: 0.25
    };
  }

  if (energy === 'medium') {
    return {
      durationBeats: 8,
      energyState: energy,
      platformTypes: ['static', 'beat', 'alternateBeat', 'ghost', 'reverseGhost', 'elevator', 'shuttle', 'cross', 'spring'],
      verticalRange: [0, 2],
      rhythmDensity: 0.5
    };
  }

  return {
    durationBeats: 8,
    energyState: energy,
    platformTypes: [
      'static',
      'beat',
      'alternateBeat',
      'ghost',
      'reverseGhost',
      'elevator',
      'shuttle',
      'cross',
      'spring',
      'hazard',
      'launch30',
      'launch60'
    ],
    verticalRange: [1, 3],
    rhythmDensity: 0.8
  };
}
