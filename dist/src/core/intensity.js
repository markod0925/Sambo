export const defaultIntensityConfig = {
    intensityGainRate: 0.3,
    decayRate: 0.05,
    intensityLossRate: 0.3,
    residualFloor: 0.15
};
export function updateIntensity(current, direction, movementSpeed, deltaSeconds, config = defaultIntensityConfig) {
    let next = current;
    if (direction === 'forward') {
        next += movementSpeed * config.intensityGainRate * deltaSeconds;
    }
    else if (direction === 'backward') {
        next -= movementSpeed * config.intensityLossRate * deltaSeconds;
    }
    else {
        next -= config.decayRate * deltaSeconds;
    }
    return Math.max(config.residualFloor, Math.min(1, next));
}
