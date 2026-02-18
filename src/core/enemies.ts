export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EnemyCollisionResult {
  stomp: boolean;
  damage: boolean;
}

export interface PatrolEnemyState {
  x: number;
  speed: number;
  direction: 1 | -1;
  minX: number;
  maxX: number;
}

export interface FlyingEnemyState {
  x: number;
  y: number;
  speedX: number;
  homingRate: number;
  active: boolean;
}

export interface FallingRockEnemyState {
  x: number;
  y: number;
  speedY: number;
  active: boolean;
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function resolveEnemyCollision(player: Rect, enemy: Rect, verticalVelocity: number): EnemyCollisionResult {
  if (!intersects(player, enemy)) {
    return { stomp: false, damage: false };
  }

  const playerBottom = player.y + player.height;
  const enemyTop = enemy.y;
  const tolerance = 10;
  const stomp = verticalVelocity > 0 && playerBottom - enemyTop <= tolerance;

  if (stomp) return { stomp: true, damage: false };
  return { stomp: false, damage: true };
}

export function applyDamage(lives: number, amount = 1): number {
  return Math.max(0, lives - amount);
}

export function updatePatrolEnemy(enemy: PatrolEnemyState, deltaSeconds: number): PatrolEnemyState {
  let x = enemy.x + enemy.direction * enemy.speed * deltaSeconds;
  let direction = enemy.direction;

  if (x <= enemy.minX) {
    x = enemy.minX;
    direction = 1;
  } else if (x >= enemy.maxX) {
    x = enemy.maxX;
    direction = -1;
  }

  return { ...enemy, x, direction };
}

export function updateFlyingEnemy(enemy: FlyingEnemyState, playerY: number, deltaSeconds: number, offscreenLeftX: number): FlyingEnemyState {
  if (!enemy.active) return enemy;

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

export function updateFallingRockEnemy(
  enemy: FallingRockEnemyState,
  deltaSeconds: number,
  offscreenBottomY: number
): FallingRockEnemyState {
  if (!enemy.active) return enemy;

  const next = {
    ...enemy,
    y: enemy.y + enemy.speedY * deltaSeconds
  };

  if (next.y > offscreenBottomY) {
    return { ...next, active: false };
  }

  return next;
}
