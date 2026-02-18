export const defaultKindSequenceRules = {
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
const allRuntimeKinds = [
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
const timedKinds = new Set(['beat', 'alternateBeat', 'ghost', 'reverseGhost']);
const launchKinds = new Set(['launch30', 'launch60']);
const energyGateKinds = {
    low: new Set(['segment', 'beat', 'alternateBeat', 'elevator']),
    medium: new Set([
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
    high: new Set(allRuntimeKinds)
};
export function classifyEnergy(value) {
    if (value < 0.33)
        return 'low';
    if (value < 0.66)
        return 'medium';
    return 'high';
}
function mapPlatformTypeToRuntimeKind(platformType) {
    if (platformType === 'static')
        return 'segment';
    if (allRuntimeKinds.includes(platformType))
        return platformType;
    return 'segment';
}
function deterministicUnit(seed) {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
}
function clampUnit(value) {
    const n = Number.isFinite(value) ? value : 0.5;
    return Math.max(0, Math.min(1, n));
}
function trailingRunLength(items, predicate) {
    let count = 0;
    for (let i = items.length - 1; i >= 0; i--) {
        if (!predicate(items[i]))
            break;
        count += 1;
    }
    return count;
}
function weightedChoice(candidates, getWeight, roll) {
    if (candidates.length === 1)
        return candidates[0];
    const weights = candidates.map((candidate) => Math.max(0.0001, getWeight(candidate)));
    const total = weights.reduce((acc, w) => acc + w, 0);
    let target = clampUnit(roll) * total;
    for (let i = 0; i < candidates.length; i++) {
        target -= weights[i];
        if (target <= 0)
            return candidates[i];
    }
    return candidates[candidates.length - 1];
}
function kindWeight(kind, seg) {
    const density = clampUnit(seg.rhythmDensity);
    if (kind === null) {
        return 0.03 + (1 - density) * 0.1;
    }
    if (kind === 'segment') {
        return 0.5 + (1 - density) * 0.6;
    }
    let weight = 0.7 + density * 1.1;
    if (seg.energyState === 'high')
        weight *= 1.2;
    if (seg.energyState === 'low')
        weight *= 0.75;
    if (timedKinds.has(kind))
        weight *= 1 + density * 0.25;
    return weight;
}
function toUniqueKinds(platformTypes) {
    const mappedKinds = platformTypes.map((platformType) => mapPlatformTypeToRuntimeKind(platformType));
    const unique = new Set(mappedKinds);
    unique.add('segment');
    return [...unique];
}
function applyEnergyGate(kinds, seg) {
    const allowed = energyGateKinds[seg.energyState];
    return kinds.filter((kind) => kind === null || allowed.has(kind));
}
function applyPairForbids(kinds, history, rules) {
    const previous = history.length > 0 ? history[history.length - 1] : null;
    if (previous === null)
        return kinds;
    let filtered = kinds;
    for (const [fromKind, toKind] of rules.forbidPairs) {
        if (previous !== fromKind)
            continue;
        filtered = filtered.filter((kind) => kind !== toKind);
    }
    return filtered;
}
function countSegmentsSinceLastLaunch(history) {
    let segmentsSinceLastLaunch = 0;
    for (let i = history.length - 1; i >= 0; i--) {
        const kind = history[i];
        if (kind !== null && launchKinds.has(kind))
            return segmentsSinceLastLaunch;
        if (kind === 'segment')
            segmentsSinceLastLaunch += 1;
    }
    return Number.POSITIVE_INFINITY;
}
function applyLaunchSpacingRule(kinds, history, rules) {
    if (rules.minSegmentsBetweenLaunches <= 0)
        return kinds;
    const segmentsSinceLastLaunch = countSegmentsSinceLastLaunch(history);
    if (!Number.isFinite(segmentsSinceLastLaunch) || segmentsSinceLastLaunch >= rules.minSegmentsBetweenLaunches)
        return kinds;
    return kinds.filter((kind) => kind === null || !launchKinds.has(kind));
}
function applyMaxRunRules(kinds, history, rules) {
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
function resolveKindRules(rules) {
    return {
        enableEnergyGate: rules?.enableEnergyGate ?? defaultKindSequenceRules.enableEnergyGate,
        maxStaticRun: Math.max(1, Math.floor(rules?.maxStaticRun ?? defaultKindSequenceRules.maxStaticRun)),
        maxTimedRun: Math.max(1, Math.floor(rules?.maxTimedRun ?? defaultKindSequenceRules.maxTimedRun)),
        minSegmentsBetweenLaunches: Math.max(0, Math.floor(rules?.minSegmentsBetweenLaunches ?? defaultKindSequenceRules.minSegmentsBetweenLaunches)),
        forbidPairs: Array.isArray(rules?.forbidPairs) && rules.forbidPairs.length > 0 ? rules.forbidPairs : defaultKindSequenceRules.forbidPairs
    };
}
export function generatePlatformKindSequence(segments, seed = 1, rules = defaultKindSequenceRules) {
    const resolvedRules = resolveKindRules(rules);
    const history = [];
    const result = [];
    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const baseKinds = toUniqueKinds(segment.platformTypes);
        let candidates = [...baseKinds, null];
        if (resolvedRules.enableEnergyGate) {
            candidates = applyEnergyGate(candidates, segment);
        }
        candidates = applyPairForbids(candidates, history, resolvedRules);
        candidates = applyLaunchSpacingRule(candidates, history, resolvedRules);
        candidates = applyMaxRunRules(candidates, history, resolvedRules);
        if (candidates.length === 0) {
            const energyAllowed = resolvedRules.enableEnergyGate ? applyEnergyGate(baseKinds, segment) : baseKinds;
            candidates = energyAllowed.length > 0 ? [...energyAllowed] : ['segment'];
        }
        const roll = deterministicUnit(seed + (i + 1) * 97.137);
        const picked = weightedChoice(candidates, (kind) => kindWeight(kind, segment), roll);
        result.push(picked);
        history.push(picked);
    }
    return result;
}
export function generateSegments(analysis, windowSize = 4) {
    const segments = [];
    for (let i = 0; i < analysis.energy_curve.length; i += windowSize) {
        const window = analysis.energy_curve.slice(i, i + windowSize);
        const avg = window.reduce((a, b) => a + b, 0) / window.length;
        const energyState = classifyEnergy(avg);
        segments.push(templateForEnergy(energyState));
    }
    return segments;
}
function templateForEnergy(energy) {
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
            platformTypes: ['static', 'beat', 'alternateBeat', 'ghost', 'reverseGhost', 'elevator'],
            verticalRange: [0, 2],
            rhythmDensity: 0.5
        };
    }
    return {
        durationBeats: 8,
        energyState: energy,
        platformTypes: ['static', 'beat', 'alternateBeat', 'ghost', 'reverseGhost', 'elevator', 'shuttle', 'cross', 'spring'],
        verticalRange: [1, 3],
        rhythmDensity: 0.8
    };
}
