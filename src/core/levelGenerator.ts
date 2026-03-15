import { EnergyState, Segment } from './types.js';
import { RUNTIME_PATTERN_CATALOG } from './patternCatalog.js';

type PatternToken = 'segment' | 'gap' | 'timed' | 'mobile' | 'hazard' | 'launch';

export interface AnalysisData {
  bpm: number;
  energy_curve: number[];
}

export type RuntimePlatformKind = Exclude<Segment['platformTypes'][number], 'static'> | 'segment';

export interface PatternSegmentInput {
  energyState: EnergyState;
  platformTypes: Segment['platformTypes'];
  rhythmDensity: number;
}

export interface PatternSelectionTrace {
  seed: number;
  mode: 'pattern-random';
  constraints: Required<KindSequenceRules>;
  patternPoolSizes: Record<EnergyState, number>;
  patternPicks: Array<{
    segmentIndex: number;
    patternId: string;
    energyHint: EnergyState;
    weight: number;
    length: number;
  }>;
  patternUsage: Array<{
    patternId: string;
    picks: number;
    segmentsCovered: number;
    avgWeight: number;
  }>;
  tokens: PatternToken[];
  mappedKinds: Array<RuntimePlatformKind | null>;
  finalKinds: Array<RuntimePlatformKind | null>;
}

export type { PatternToken };

export interface KindSequenceRules {
  enableEnergyGate?: boolean;
  maxStaticRun?: number;
  maxTimedRun?: number;
  minSegmentsBetweenLaunches?: number;
  forbidPairs?: Array<[RuntimePlatformKind, RuntimePlatformKind]>;
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

const ALL_PATTERN_TOKENS: PatternToken[] = ['segment', 'gap', 'timed', 'mobile', 'hazard', 'launch'];
const TIMED_KINDS = new Set<RuntimePlatformKind>(['beat', 'alternateBeat', 'ghost', 'reverseGhost']);
const LAUNCH_KINDS = new Set<RuntimePlatformKind>(['launch30', 'launch60']);
const PATTERN_REPEAT_COOLDOWN_PICKS = 3;
const PATTERN_REPEAT_MIN_WEIGHT_FACTOR = 0.3;
const DIVERSITY_KIND_PRIORITY: RuntimePlatformKind[] = [
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

interface DefinedPattern {
  patternId: string;
  energyHint: EnergyState;
  weight: number;
  tokens: PatternToken[];
}

interface PatternCatalogRow {
  patternId?: unknown;
  kind?: unknown;
  tokens?: unknown;
  weight?: unknown;
  energyHint?: unknown;
}

function clampUnit(value: number): number {
  const n = Number.isFinite(value) ? value : 0.5;
  return Math.max(0, Math.min(1, n));
}

function deterministicUnit(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function weightedPick<T>(items: T[], getWeight: (item: T, index: number) => number, roll: number): T {
  if (items.length <= 1) return items[0];
  const weights = items.map((item, index) => Math.max(0.0001, getWeight(item, index)));
  const total = weights.reduce((acc, value) => acc + value, 0);
  let cursor = clampUnit(roll) * total;
  for (let i = 0; i < items.length; i++) {
    cursor -= weights[i];
    if (cursor <= 0) return items[i];
  }
  return items[items.length - 1];
}

function normalizePatternToken(token: unknown): PatternToken | null {
  if (typeof token !== 'string') return null;
  return (ALL_PATTERN_TOKENS as string[]).includes(token) ? (token as PatternToken) : null;
}

function toPatternTokens(rawTokens: unknown): PatternToken[] {
  if (!Array.isArray(rawTokens) || rawTokens.length <= 0) return [];

  if (Array.isArray(rawTokens[0])) {
    const rows = rawTokens as unknown[];
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      if (!Array.isArray(row) || row.length <= 0) continue;
      const tokens = row.map(normalizePatternToken).filter((token): token is PatternToken => token !== null);
      if (tokens.length > 0) return tokens;
    }
    return [];
  }

  return (rawTokens as unknown[]).map(normalizePatternToken).filter((token): token is PatternToken => token !== null);
}

function sanitizeEnergyHint(value: unknown): EnergyState {
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  return 'medium';
}

function buildDefinedPatternCatalog(): DefinedPattern[] {
  const source = (Array.isArray(RUNTIME_PATTERN_CATALOG) ? RUNTIME_PATTERN_CATALOG : []) as PatternCatalogRow[];
  const patterns: DefinedPattern[] = [];

  for (let i = 0; i < source.length; i++) {
    const row = source[i];
    const kind = row?.kind;
    if (kind !== 'flow1d' && kind !== 'micro2d') continue;
    const tokens = toPatternTokens(row?.tokens);
    if (tokens.length <= 0) continue;
    patterns.push({
      patternId: String(row?.patternId || `pattern_${i + 1}`),
      energyHint: sanitizeEnergyHint(row?.energyHint),
      weight: Math.max(0.0001, Number(row?.weight) || 1),
      tokens
    });
  }

  if (patterns.length > 0) return patterns;
  return [
    { patternId: 'fallback_low', energyHint: 'low', weight: 1, tokens: ['segment'] },
    { patternId: 'fallback_medium', energyHint: 'medium', weight: 1, tokens: ['segment'] },
    { patternId: 'fallback_high', energyHint: 'high', weight: 1, tokens: ['segment'] }
  ];
}

const DEFINED_PATTERNS = buildDefinedPatternCatalog();

function patternPoolForEnergy(energy: EnergyState): DefinedPattern[] {
  const pool = DEFINED_PATTERNS.filter((pattern) => pattern.energyHint === energy);
  if (pool.length > 0) return pool;
  return [{ patternId: `fallback_${energy}`, energyHint: energy, weight: 1, tokens: ['segment'] }];
}

function repeatPenaltyForPattern(patternId: string, recentPatternIds: string[]): number {
  const lookback = Math.min(PATTERN_REPEAT_COOLDOWN_PICKS, recentPatternIds.length);
  let penalty = 1;
  for (let distance = 1; distance <= lookback; distance++) {
    const prior = recentPatternIds[recentPatternIds.length - distance];
    if (prior !== patternId) continue;
    const progress = (distance - 1) / Math.max(1, PATTERN_REPEAT_COOLDOWN_PICKS);
    const distancePenalty = PATTERN_REPEAT_MIN_WEIGHT_FACTOR + (1 - PATTERN_REPEAT_MIN_WEIGHT_FACTOR) * progress;
    penalty = Math.min(penalty, distancePenalty);
  }
  return penalty;
}

function mapPlatformTypeToRuntimeKind(platformType: Segment['platformTypes'][number]): RuntimePlatformKind {
  if (platformType === 'static') return 'segment';
  return platformType;
}

function toUniqueRuntimePlatformTypes(platformTypes: Segment['platformTypes']): Segment['platformTypes'] {
  const mapped = platformTypes.map((platformType) => mapPlatformTypeToRuntimeKind(platformType));
  const unique = new Set<Segment['platformTypes'][number]>();
  unique.add('static');
  for (const kind of mapped) {
    if (kind === 'segment') {
      unique.add('static');
    } else {
      unique.add(kind as Segment['platformTypes'][number]);
    }
  }
  return [...unique];
}

function hasRuntimeKind(seg: PatternSegmentInput, target: RuntimePlatformKind): boolean {
  if (target === 'segment') return true;
  return seg.platformTypes.includes(target as Segment['platformTypes'][number]);
}

function supportsTimed(seg: PatternSegmentInput): boolean {
  return (
    hasRuntimeKind(seg, 'beat') ||
    hasRuntimeKind(seg, 'alternateBeat') ||
    hasRuntimeKind(seg, 'ghost') ||
    hasRuntimeKind(seg, 'reverseGhost')
  );
}

function supportsMobile(seg: PatternSegmentInput): boolean {
  return hasRuntimeKind(seg, 'elevator') || hasRuntimeKind(seg, 'shuttle') || hasRuntimeKind(seg, 'cross') || hasRuntimeKind(seg, 'spring');
}

function supportsLaunch(seg: PatternSegmentInput): boolean {
  return hasRuntimeKind(seg, 'launch30') || hasRuntimeKind(seg, 'launch60');
}

function supportsHazard(seg: PatternSegmentInput): boolean {
  return hasRuntimeKind(seg, 'hazard');
}

function applyEnergyGate(seg: PatternSegmentInput, enabled: boolean): PatternSegmentInput {
  if (!enabled) return seg;
  const allowedByEnergy: Record<EnergyState, Set<RuntimePlatformKind>> = {
    low: new Set(['segment', 'beat', 'alternateBeat', 'elevator']),
    medium: new Set(['segment', 'beat', 'alternateBeat', 'ghost', 'reverseGhost', 'elevator', 'shuttle', 'cross', 'spring']),
    high: new Set([
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
    ])
  };
  const allowed = allowedByEnergy[seg.energyState];
  const filtered = toUniqueRuntimePlatformTypes(seg.platformTypes).filter((platformType) => {
    if (platformType === 'static') return true;
    return allowed.has(platformType as RuntimePlatformKind);
  });
  return {
    ...seg,
    platformTypes: filtered.length > 0 ? filtered : ['static']
  };
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
    forbidPairs: Array.isArray(rules?.forbidPairs) && rules.forbidPairs.length > 0 ? rules.forbidPairs : defaultKindSequenceRules.forbidPairs
  };
}

function selectPatternTokens(
  segments: PatternSegmentInput[],
  seed: number
): Pick<PatternSelectionTrace, 'patternPoolSizes' | 'patternPicks' | 'patternUsage' | 'tokens'> {
  const patternPoolSizes: Record<EnergyState, number> = {
    low: patternPoolForEnergy('low').length,
    medium: patternPoolForEnergy('medium').length,
    high: patternPoolForEnergy('high').length
  };
  const patternPicks: PatternSelectionTrace['patternPicks'] = [];
  const tokens = new Array<PatternToken>(segments.length);
  const eligiblePatterns = new Set<string>();
  const recentPatternIds: string[] = [];

  let index = 0;
  while (index < segments.length) {
    const seg = segments[index];
    const pool = patternPoolForEnergy(seg.energyState);
    for (const pattern of pool) {
      eligiblePatterns.add(pattern.patternId);
    }
    const pickedPattern = weightedPick(
      pool,
      (pattern) =>
        pattern.weight *
        (0.75 + clampUnit(seg.rhythmDensity) * 0.5) *
        repeatPenaltyForPattern(pattern.patternId, recentPatternIds),
      deterministicUnit(seed + (index + 1) * 31.13)
    );
    recentPatternIds.push(pickedPattern.patternId);
    if (recentPatternIds.length > PATTERN_REPEAT_COOLDOWN_PICKS) recentPatternIds.shift();
    patternPicks.push({
      segmentIndex: index,
      patternId: pickedPattern.patternId,
      energyHint: pickedPattern.energyHint,
      weight: pickedPattern.weight,
      length: pickedPattern.tokens.length
    });
    if (pickedPattern.tokens.length <= 0) {
      tokens[index] = 'segment';
      index += 1;
      continue;
    }
    for (let tokenIdx = 0; tokenIdx < pickedPattern.tokens.length && index < segments.length; tokenIdx++) {
      tokens[index] = pickedPattern.tokens[tokenIdx];
      index += 1;
    }
  }

  if (tokens.length > 0) {
    if (tokens[0] === 'gap') tokens[0] = 'segment';
    if (tokens[tokens.length - 1] === 'gap') tokens[tokens.length - 1] = 'segment';
  }

  const usageMap = new Map<string, { picks: number; segmentsCovered: number; weightTotal: number }>();
  for (const pick of patternPicks) {
    const stat = usageMap.get(pick.patternId) ?? { picks: 0, segmentsCovered: 0, weightTotal: 0 };
    stat.picks += 1;
    stat.segmentsCovered += Math.max(1, Math.floor(Number(pick.length) || 1));
    stat.weightTotal += Number(pick.weight) || 0;
    usageMap.set(pick.patternId, stat);
  }
  for (const patternId of eligiblePatterns) {
    if (!usageMap.has(patternId)) {
      usageMap.set(patternId, { picks: 0, segmentsCovered: 0, weightTotal: 0 });
    }
  }
  const patternUsage = [...usageMap.entries()]
    .map(([patternId, stat]) => ({
      patternId,
      picks: stat.picks,
      segmentsCovered: stat.segmentsCovered,
      avgWeight: stat.weightTotal / Math.max(1, stat.picks)
    }))
    .sort((a, b) => {
      if (b.picks !== a.picks) return b.picks - a.picks;
      if (b.segmentsCovered !== a.segmentsCovered) return b.segmentsCovered - a.segmentsCovered;
      return a.patternId.localeCompare(b.patternId);
    });

  return { patternPoolSizes, patternPicks, patternUsage, tokens };
}

function chooseKindFromToken(token: PatternToken, seg: PatternSegmentInput, seed: number): RuntimePlatformKind | null {
  if (token === 'segment') return 'segment';
  if (token === 'gap') return null;

  if (token === 'hazard') {
    if (supportsHazard(seg)) return 'hazard';
    if (supportsTimed(seg)) return chooseKindFromToken('timed', seg, seed + 7.1);
    if (supportsMobile(seg)) return chooseKindFromToken('mobile', seg, seed + 11.7);
    return 'segment';
  }

  if (token === 'launch') {
    const candidates: RuntimePlatformKind[] = [];
    if (hasRuntimeKind(seg, 'launch30')) candidates.push('launch30');
    if (hasRuntimeKind(seg, 'launch60')) candidates.push('launch60');
    if (candidates.length <= 0) return 'segment';
    return weightedPick(candidates, () => 1, deterministicUnit(seed + 13.7));
  }

  if (token === 'mobile') {
    const candidates: RuntimePlatformKind[] = [];
    if (hasRuntimeKind(seg, 'elevator')) candidates.push('elevator');
    if (hasRuntimeKind(seg, 'shuttle')) candidates.push('shuttle');
    if (hasRuntimeKind(seg, 'cross')) candidates.push('cross');
    if (hasRuntimeKind(seg, 'spring')) candidates.push('spring');
    if (candidates.length <= 0) return 'segment';
    return weightedPick(candidates, () => 1, deterministicUnit(seed + 31.9));
  }

  const timedCandidates: RuntimePlatformKind[] = [];
  if (hasRuntimeKind(seg, 'beat')) timedCandidates.push('beat');
  if (hasRuntimeKind(seg, 'alternateBeat')) timedCandidates.push('alternateBeat');
  if (hasRuntimeKind(seg, 'ghost')) timedCandidates.push('ghost');
  if (hasRuntimeKind(seg, 'reverseGhost')) timedCandidates.push('reverseGhost');
  if (timedCandidates.length <= 0) return 'segment';
  const density = clampUnit(seg.rhythmDensity);
  return weightedPick(
    timedCandidates,
    (kind) => {
      if (kind === 'beat' || kind === 'alternateBeat') return 0.8 + density * 1.1;
      return 0.65 + density * 0.95;
    },
    deterministicUnit(seed + 71.2)
  );
}

function pickAnyNonStaticKind(seg: PatternSegmentInput, seed: number): RuntimePlatformKind | null {
  const candidates: RuntimePlatformKind[] = [];
  for (const kind of DIVERSITY_KIND_PRIORITY) {
    if (!hasRuntimeKind(seg, kind)) continue;
    if (kind === 'hazard' && seg.energyState === 'low') continue;
    if ((kind === 'launch30' || kind === 'launch60') && seg.energyState !== 'high') continue;
    candidates.push(kind);
  }
  if (candidates.length <= 0) return null;
  return weightedPick(candidates, () => 1, deterministicUnit(seed + 19.1));
}

function satisfiesResolvedConstraints(
  kinds: Array<RuntimePlatformKind | null>,
  config: Required<KindSequenceRules>
): boolean {
  if (kinds.length > 0 && (kinds[0] === null || kinds[kinds.length - 1] === null)) return false;

  let segmentsSinceLaunch = Number.POSITIVE_INFINITY;
  let timedRun = 0;

  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i];

    if (kind !== null && TIMED_KINDS.has(kind)) {
      timedRun += 1;
      if (timedRun > config.maxTimedRun) return false;
    } else {
      timedRun = 0;
    }

    if (i > 0) {
      for (const [fromKind, toKind] of config.forbidPairs) {
        if (kinds[i - 1] === fromKind && kind === toKind) return false;
      }
    }

    if (kind !== null && LAUNCH_KINDS.has(kind)) {
      if (segmentsSinceLaunch < config.minSegmentsBetweenLaunches) return false;
      segmentsSinceLaunch = 0;
    } else if (kind === 'segment' && Number.isFinite(segmentsSinceLaunch)) {
      segmentsSinceLaunch += 1;
    }
  }

  return true;
}

function enforceHighVarietyKinds(
  kinds: Array<RuntimePlatformKind | null>,
  segments: PatternSegmentInput[],
  config: Required<KindSequenceRules>,
  seed: number
): Array<RuntimePlatformKind | null> {
  const out = [...kinds];
  const availableKinds = new Set<RuntimePlatformKind>();
  for (const seg of segments) {
    for (const kind of DIVERSITY_KIND_PRIORITY) {
      if (hasRuntimeKind(seg, kind)) availableKinds.add(kind);
    }
  }
  const targetDiversity = Math.min(6, availableKinds.size);
  if (targetDiversity <= 0) return out;

  const usedKinds = new Set(out.filter((kind): kind is RuntimePlatformKind => kind !== null && kind !== 'segment'));
  if (usedKinds.size >= targetDiversity) return out;

  for (const missingKind of DIVERSITY_KIND_PRIORITY) {
    if (!availableKinds.has(missingKind) || usedKinds.has(missingKind)) continue;
    const slots: number[] = [];
    for (let i = 1; i < out.length - 1; i++) {
      if (out[i] !== 'segment') continue;
      const seg = segments[i];
      if (!seg || !hasRuntimeKind(seg, missingKind)) continue;
      if (missingKind === 'hazard' && seg.energyState === 'low') continue;
      if ((missingKind === 'launch30' || missingKind === 'launch60') && seg.energyState !== 'high') continue;
      slots.push(i);
    }
    if (slots.length <= 0) continue;

    slots.sort((a, b) => {
      const ra = deterministicUnit(seed + (a + 1) * 23.7 + missingKind.length * 7.1);
      const rb = deterministicUnit(seed + (b + 1) * 23.7 + missingKind.length * 7.1);
      return ra - rb;
    });

    for (const slot of slots) {
      const trial = [...out];
      trial[slot] = missingKind;
      if (!satisfiesResolvedConstraints(trial, config)) continue;
      out[slot] = missingKind;
      usedKinds.add(missingKind);
      break;
    }

    if (usedKinds.size >= targetDiversity) break;
  }

  return out;
}

function enforceMinimumLaunchKinds(
  kinds: Array<RuntimePlatformKind | null>,
  segments: PatternSegmentInput[],
  config: Required<KindSequenceRules>,
  seed: number
): Array<RuntimePlatformKind | null> {
  const out = [...kinds];
  const desiredLaunches = segments.length >= 40 ? 2 : 1;
  const currentLaunches = out.filter((kind) => kind !== null && LAUNCH_KINDS.has(kind)).length;
  if (currentLaunches >= desiredLaunches) return out;

  const launchSlots: number[] = [];
  for (let i = 1; i < out.length - 1; i++) {
    if (out[i] !== 'segment') continue;
    const seg = segments[i];
    if (!seg || seg.energyState !== 'high' || !supportsLaunch(seg)) continue;
    launchSlots.push(i);
  }
  if (launchSlots.length <= 0) return out;

  launchSlots.sort((a, b) => deterministicUnit(seed + a * 3.7) - deterministicUnit(seed + b * 3.7));
  let launches = currentLaunches;
  for (const slot of launchSlots) {
    if (launches >= desiredLaunches) break;
    const seg = segments[slot];
    if (!seg) continue;
    const launchKinds: RuntimePlatformKind[] = [];
    if (hasRuntimeKind(seg, 'launch30')) launchKinds.push('launch30');
    if (hasRuntimeKind(seg, 'launch60')) launchKinds.push('launch60');
    if (launchKinds.length <= 0) continue;
    const pickedLaunch = weightedPick(launchKinds, () => 1, deterministicUnit(seed + (slot + 1) * 17.3));
    const trial = [...out];
    trial[slot] = pickedLaunch;
    if (!satisfiesResolvedConstraints(trial, config)) continue;
    out[slot] = pickedLaunch;
    launches += 1;
  }

  return out;
}

function enforceMinimumHazardKind(
  kinds: Array<RuntimePlatformKind | null>,
  segments: PatternSegmentInput[],
  config: Required<KindSequenceRules>,
  seed: number
): Array<RuntimePlatformKind | null> {
  const out = [...kinds];
  const hasHazard = out.some((kind) => kind === 'hazard');
  if (hasHazard) return out;

  const slots: number[] = [];
  for (let i = 1; i < out.length - 1; i++) {
    if (out[i] !== 'segment') continue;
    const seg = segments[i];
    if (!seg || seg.energyState !== 'high' || !supportsHazard(seg)) continue;
    slots.push(i);
  }
  if (slots.length <= 0) return out;

  slots.sort((a, b) => deterministicUnit(seed + a * 5.3) - deterministicUnit(seed + b * 5.3));
  for (const slot of slots) {
    const trial = [...out];
    trial[slot] = 'hazard';
    if (!satisfiesResolvedConstraints(trial, config)) continue;
    out[slot] = 'hazard';
    break;
  }
  return out;
}

function applyKindConstraints(
  kinds: Array<RuntimePlatformKind | null>,
  segments: PatternSegmentInput[],
  config: Required<KindSequenceRules>,
  seed: number
): Array<RuntimePlatformKind | null> {
  const out = [...kinds];
  if (out.length > 0) {
    if (out[0] === null) out[0] = 'segment';
    if (out[out.length - 1] === null) out[out.length - 1] = 'segment';
  }

  for (let pass = 0; pass < 3; pass++) {
    let segmentsSinceLaunch = Number.POSITIVE_INFINITY;
    let timedRun = 0;
    let staticRun = 0;
    let gapRun = 0;

    for (let i = 0; i < out.length; i++) {
      const seg = segments[i];
      if (!seg) continue;

      if (out[i] === null) {
        gapRun += 1;
        const gapLimit = seg.energyState === 'low' ? 1 : seg.energyState === 'medium' ? 2 : 3;
        if (gapRun > gapLimit) out[i] = 'segment';
      } else {
        gapRun = 0;
      }

      if (i > 0) {
        for (const [fromKind, toKind] of config.forbidPairs) {
          if (out[i - 1] === fromKind && out[i] === toKind) {
            out[i] = 'segment';
            break;
          }
        }
      }

      const kind = out[i];
      if (kind !== null && TIMED_KINDS.has(kind)) {
        timedRun += 1;
        if (timedRun > config.maxTimedRun) {
          out[i] = 'segment';
          timedRun = 0;
        }
      } else {
        timedRun = 0;
      }

      if (out[i] === 'segment') {
        staticRun += 1;
        if (staticRun > config.maxStaticRun) {
          const replacement = pickAnyNonStaticKind(seg, seed + pass * 101 + (i + 1) * 53.7);
          if (replacement) {
            out[i] = replacement;
            staticRun = 0;
            timedRun = TIMED_KINDS.has(replacement) ? 1 : 0;
          }
        }
      } else {
        staticRun = 0;
      }

      const postKind = out[i];
      if (postKind !== null && LAUNCH_KINDS.has(postKind)) {
        if (segmentsSinceLaunch < config.minSegmentsBetweenLaunches) {
          out[i] = 'segment';
        } else {
          segmentsSinceLaunch = 0;
        }
      } else if (postKind === 'segment') {
        if (Number.isFinite(segmentsSinceLaunch)) segmentsSinceLaunch += 1;
      }
    }
  }

  const varied = enforceHighVarietyKinds(out, segments, config, seed + 29.8);
  const launchEnforced = enforceMinimumLaunchKinds(varied, segments, config, seed + 41.2);
  const hazardEnforced = enforceMinimumHazardKind(launchEnforced, segments, config, seed + 53.9);

  if (satisfiesResolvedConstraints(hazardEnforced, config)) return hazardEnforced;

  // Final conservative cleanup: convert conflicting entries to static segments.
  const safe = [...hazardEnforced];
  if (safe.length > 0) {
    if (safe[0] === null) safe[0] = 'segment';
    if (safe[safe.length - 1] === null) safe[safe.length - 1] = 'segment';
  }

  let segmentsSinceLaunch = Number.POSITIVE_INFINITY;
  let timedRun = 0;
  for (let i = 0; i < safe.length; i++) {
    if (i > 0) {
      for (const [fromKind, toKind] of config.forbidPairs) {
        if (safe[i - 1] === fromKind && safe[i] === toKind) {
          safe[i] = 'segment';
          break;
        }
      }
    }
    const kind = safe[i];
    if (kind !== null && TIMED_KINDS.has(kind)) {
      timedRun += 1;
      if (timedRun > config.maxTimedRun) {
        safe[i] = 'segment';
        timedRun = 0;
      }
    } else {
      timedRun = 0;
    }
    const postKind = safe[i];
    if (postKind !== null && LAUNCH_KINDS.has(postKind)) {
      if (segmentsSinceLaunch < config.minSegmentsBetweenLaunches) {
        safe[i] = 'segment';
      } else {
        segmentsSinceLaunch = 0;
      }
    } else if (postKind === 'segment') {
      if (Number.isFinite(segmentsSinceLaunch)) segmentsSinceLaunch += 1;
    }
  }
  return safe;
}

export function classifyEnergy(value: number): EnergyState {
  if (value < 0.33) return 'low';
  if (value < 0.66) return 'medium';
  return 'high';
}

export function generatePlatformKindSequence(
  segments: PatternSegmentInput[],
  seed = 1,
  rules: KindSequenceRules = defaultKindSequenceRules
): Array<RuntimePlatformKind | null> {
  return generatePlatformKindSequenceWithTrace(segments, seed, rules).kinds;
}

export function generatePlatformKindSequenceWithTrace(
  segments: PatternSegmentInput[],
  seed = 1,
  rules: KindSequenceRules = defaultKindSequenceRules
): { kinds: Array<RuntimePlatformKind | null>; trace: PatternSelectionTrace } {
  const resolved = resolveKindRules(rules);
  const gated = segments.map((seg) =>
    applyEnergyGate(
      {
        ...seg,
        rhythmDensity: clampUnit(seg.rhythmDensity),
        platformTypes: toUniqueRuntimePlatformTypes(seg.platformTypes)
      },
      resolved.enableEnergyGate
    )
  );
  const selected = selectPatternTokens(gated, seed);
  const mappedKinds = selected.tokens.map((token, idx) => {
    const seg = gated[idx] ?? { energyState: 'medium', platformTypes: ['static'], rhythmDensity: 0.5 };
    return chooseKindFromToken(token, seg, seed + (idx + 1) * 37.1);
  });
  const finalKinds = applyKindConstraints(mappedKinds, gated, resolved, seed + 11.4);

  const trace: PatternSelectionTrace = {
    seed,
    mode: 'pattern-random',
    constraints: resolved,
    patternPoolSizes: selected.patternPoolSizes,
    patternPicks: selected.patternPicks,
    patternUsage: selected.patternUsage,
    tokens: [...selected.tokens],
    mappedKinds: [...mappedKinds],
    finalKinds: [...finalKinds]
  };
  return { kinds: finalKinds, trace };
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
