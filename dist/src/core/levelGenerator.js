export function classifyEnergy(value) {
    if (value < 0.33)
        return 'low';
    if (value < 0.66)
        return 'medium';
    return 'high';
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
            platformTypes: ['static', 'beat', 'alternateBeat'],
            verticalRange: [0, 1],
            rhythmDensity: 0.25
        };
    }
    if (energy === 'medium') {
        return {
            durationBeats: 8,
            energyState: energy,
            platformTypes: ['static', 'beat', 'alternateBeat', 'ghost', 'reverseGhost'],
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
