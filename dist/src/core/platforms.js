export function getBeatPlatformState(beatInBar) {
    if (beatInBar === 1)
        return 'solid';
    if (beatInBar === 2)
        return 'fadeOut';
    if (beatInBar === 3)
        return 'gone';
    return 'fadeIn';
}
export function isGhostPlatformSolid(direction) {
    return direction === 'backward';
}
export function isAlternateBeatPlatformSolid(beatInBar) {
    return beatInBar === 1 || beatInBar === 3;
}
export function getElevatorOffsetSteps(beatIndex) {
    const safeBeatIndex = Math.floor(Number.isFinite(beatIndex) ? beatIndex : 0);
    const phase = ((safeBeatIndex % 8) + 8) % 8;
    return phase <= 4 ? phase : 8 - phase;
}
export function getShuttleOffsetSteps(beatIndex) {
    const safeBeatIndex = Math.floor(Number.isFinite(beatIndex) ? beatIndex : 0);
    const sequence = [0, 1, 2, 3, 4, 3, 2, 1];
    const phase = ((safeBeatIndex % sequence.length) + sequence.length) % sequence.length;
    return sequence[phase];
}
export function getCrossOffsetSteps(beatIndex) {
    const safeBeatIndex = Math.floor(Number.isFinite(beatIndex) ? beatIndex : 0);
    const phase = ((safeBeatIndex % 4) + 4) % 4;
    if (phase === 0)
        return { x: 0, y: 1 };
    if (phase === 1)
        return { x: -1, y: 0 };
    if (phase === 2)
        return { x: 0, y: -1 };
    return { x: 1, y: 0 };
}
