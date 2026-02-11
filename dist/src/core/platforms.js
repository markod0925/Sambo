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
