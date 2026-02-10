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
