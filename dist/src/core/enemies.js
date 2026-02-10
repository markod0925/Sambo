export function intersects(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
export function resolveEnemyCollision(player, enemy, verticalVelocity) {
    if (!intersects(player, enemy)) {
        return { stomp: false, damage: false };
    }
    const playerBottom = player.y + player.height;
    const enemyTop = enemy.y;
    const tolerance = 10;
    const stomp = verticalVelocity > 0 && playerBottom - enemyTop <= tolerance;
    if (stomp)
        return { stomp: true, damage: false };
    return { stomp: false, damage: true };
}
export function applyDamage(lives, amount = 1) {
    return Math.max(0, lives - amount);
}
export function updatePatrolEnemy(enemy, deltaSeconds) {
    let x = enemy.x + enemy.direction * enemy.speed * deltaSeconds;
    let direction = enemy.direction;
    if (x <= enemy.minX) {
        x = enemy.minX;
        direction = 1;
    }
    else if (x >= enemy.maxX) {
        x = enemy.maxX;
        direction = -1;
    }
    return { ...enemy, x, direction };
}
export function updateFlyingEnemy(enemy, playerY, deltaSeconds, offscreenLeftX) {
    if (!enemy.active)
        return enemy;
    const yDelta = playerY - enemy.y;
    const maxStep = enemy.homingRate * deltaSeconds;
    const adjust = Math.max(-maxStep, Math.min(maxStep, yDelta));
    const next = {
        ...enemy,
        x: enemy.x - enemy.speedX * deltaSeconds,
        y: enemy.y + adjust
    };
    if (next.x < offscreenLeftX) {
        return { ...next, active: false };
    }
    return next;
}
