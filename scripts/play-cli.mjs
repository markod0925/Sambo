import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { BeatSnapMover } from '../dist/src/core/beatMovement.js';
import { Metronome } from '../dist/src/core/metronome.js';
import { getBeatPlatformState, isGhostPlatformSolid } from '../dist/src/core/platforms.js';
import { defaultIntensityConfig } from '../dist/src/core/intensity.js';
import { applyDamage, resolveEnemyCollision, updateFlyingEnemy, updatePatrolEnemy } from '../dist/src/core/enemies.js';

const HELP_TEXT = [
  'Commands:',
  '  d | right | forward      Move forward (continuous with inertia)',
  '  a | left | backward      Move backward (continuous with inertia)',
  '  jump | j | up            Jump',
  '  wait | w                 No input, advance time',
  '  tick <ms> [actions...]   Custom tick (example: tick 250 d jump)',
  '  status                   Show state without advancing time',
  '  restart                  Reset run',
  '  help                     Show this help',
  '  quit | exit              Quit'
].join('\n');

const BPM = 120;
const SUBDIVISION = 4;
const STEP_SIZE = 32;
const DEFAULT_TICK_MS = 125;

const WORLD_WIDTH = 960;
const PLAYER_START_X = 150;
const PLAYER_WIDTH = 24;
const PLAYER_HEIGHT = 38;
const PLAYER_HALF_WIDTH = PLAYER_WIDTH / 2;
const PLAYER_HALF_HEIGHT = PLAYER_HEIGHT / 2;
const GROUND_Y = 380;

const MOVEMENT_EPSILON = 0.01;
const INTENSITY_GAIN_PER_STEP = 0.12;
const INTENSITY_LOSS_PER_STEP = 0.16;

const JUMP_VELOCITY = -560;
const GRAVITY = 1400;
const MAX_LIVES = 5;
const DAMAGE_COOLDOWN_MS = 850;

const BEAT_PLATFORM = { x: 560, y: 340, width: 120, height: 16 };
const GHOST_PLATFORM = { x: 720, y: 290, width: 100, height: 14 };

const PATROL_TEMPLATE = [
  { x: 420, y: GROUND_Y + 8, minX: 340, maxX: 520 },
  { x: 650, y: GROUND_Y + 8, minX: 580, maxX: 760 }
];

const FLYING_Y_PATTERN = [160, 220, 300, 260];

const metronome = new Metronome(BPM, SUBDIVISION);
const mover = new BeatSnapMover(metronome, STEP_SIZE);

const minX = PLAYER_HALF_WIDTH;
const maxX = WORLD_WIDTH - PLAYER_HALF_WIDTH;
const minSteps = Math.ceil((minX - PLAYER_START_X) / STEP_SIZE);
const maxSteps = Math.floor((maxX - PLAYER_START_X) / STEP_SIZE);
const minPlayerX = PLAYER_START_X + minSteps * STEP_SIZE;
const maxPlayerX = PLAYER_START_X + maxSteps * STEP_SIZE;

let nowMs = 0;
let playerX = PLAYER_START_X;
let playerY = GROUND_Y;
let verticalVelocity = 0;
let intensity = defaultIntensityConfig.residualFloor;
let currentDirection = 'idle';
let lives = MAX_LIVES;
let isGameOver = false;
let damageCooldownUntilMs = 0;
let nextFlyingSpawnMs = 1800;
let flyingSpawnIndex = 0;

let patrolEnemies = [];
let flyingEnemies = [];

function resetGameplayState() {
  nowMs = 0;
  playerX = PLAYER_START_X;
  playerY = GROUND_Y;
  verticalVelocity = 0;
  intensity = defaultIntensityConfig.residualFloor;
  currentDirection = 'idle';
  lives = MAX_LIVES;
  isGameOver = false;
  damageCooldownUntilMs = 0;
  nextFlyingSpawnMs = 1800;
  flyingSpawnIndex = 0;

  mover.stopAt(0);

  patrolEnemies = PATROL_TEMPLATE.map((template) => ({
    alive: true,
    width: 30,
    height: 24,
    y: template.y,
    state: {
      x: template.x,
      speed: 90,
      direction: 1,
      minX: template.minX,
      maxX: template.maxX
    }
  }));

  flyingEnemies = [];
}

function getAliveEnemyCounts() {
  const patrol = patrolEnemies.filter((enemy) => enemy.alive).length;
  const flying = flyingEnemies.filter((enemy) => enemy.alive && enemy.state.active).length;
  return { patrol, flying };
}

function formatSnapshot(events) {
  const beatInBar = metronome.beatInBarAt(nowMs);
  const beatState = getBeatPlatformState(beatInBar);
  const ghostSolid = isGhostPlatformSolid(currentDirection);
  const speed = mover.velocityPxPerSec;
  const moving = Math.abs(speed) > MOVEMENT_EPSILON ? 'yes' : 'no';
  const aliveEnemies = getAliveEnemyCounts();

  const lines = [
    `t=${nowMs}ms | beat=${beatInBar} | beatPlatform=${beatState} | ghost=${ghostSolid ? 'SOLID' : 'OFF'}`,
    `x=${playerX.toFixed(0)} y=${playerY.toFixed(1)} vy=${verticalVelocity.toFixed(1)} | dir=${currentDirection} | speed=${speed.toFixed(1)} | intensity=${intensity.toFixed(3)}`,
    `lives=${lives}/${MAX_LIVES} | enemies patrol=${aliveEnemies.patrol} flying=${aliveEnemies.flying} | moving=${moving}`
  ];

  if (events.length > 0) {
    lines.push(`Events: ${events.join(' | ')}`);
  }

  if (isGameOver) {
    lines.push('GAME OVER: use `restart` to try again.');
  }

  return lines.join('\n');
}

function isStandingOnPlatform(platform, solid) {
  if (!solid) return false;

  const playerLeft = playerX - PLAYER_HALF_WIDTH;
  const playerRight = playerX + PLAYER_HALF_WIDTH;
  const platformHalfWidth = platform.width / 2;
  const platformTop = platform.y - platform.height / 2;

  const platformLeft = platform.x - platformHalfWidth;
  const platformRight = platform.x + platformHalfWidth;
  const overlapsX = playerRight > platformLeft && playerLeft < platformRight;
  const playerBottom = playerY + PLAYER_HALF_HEIGHT;

  return overlapsX && Math.abs(playerBottom - platformTop) <= 2;
}

function canPlayerJump(beatSolid, ghostSolid) {
  if (playerY >= GROUND_Y - 0.5) return true;
  return isStandingOnPlatform(BEAT_PLATFORM, beatSolid) || isStandingOnPlatform(GHOST_PLATFORM, ghostSolid);
}

function resolveVerticalCollisions(previousPlayerY, beatSolid, ghostSolid) {
  const prevBottom = previousPlayerY + PLAYER_HALF_HEIGHT;
  const currentBottom = playerY + PLAYER_HALF_HEIGHT;
  const playerLeft = playerX - PLAYER_HALF_WIDTH;
  const playerRight = playerX + PLAYER_HALF_WIDTH;

  let landingY = null;

  const tryLandOnPlatform = (platform, solid) => {
    if (!solid) return;

    const platformHalfWidth = platform.width / 2;
    const platformTop = platform.y - platform.height / 2;
    const platformLeft = platform.x - platformHalfWidth;
    const platformRight = platform.x + platformHalfWidth;
    const overlapsX = playerRight > platformLeft && playerLeft < platformRight;
    const crossingTop = verticalVelocity >= 0 && prevBottom <= platformTop + 1 && currentBottom >= platformTop;
    if (!overlapsX || !crossingTop) return;

    const candidateY = platformTop - PLAYER_HALF_HEIGHT;
    if (landingY === null || candidateY < landingY) landingY = candidateY;
  };

  tryLandOnPlatform(BEAT_PLATFORM, beatSolid);
  tryLandOnPlatform(GHOST_PLATFORM, ghostSolid);

  if (landingY !== null) {
    playerY = landingY;
    verticalVelocity = 0;
  }

  if (playerY > GROUND_Y) {
    playerY = GROUND_Y;
    verticalVelocity = 0;
  }
}

function spawnFlyingEnemy() {
  const y = FLYING_Y_PATTERN[flyingSpawnIndex % FLYING_Y_PATTERN.length];
  flyingSpawnIndex += 1;

  flyingEnemies.push({
    alive: true,
    width: 30,
    height: 20,
    state: {
      x: WORLD_WIDTH + 32,
      y,
      speedX: 180,
      homingRate: 90,
      active: true
    }
  });
}

function updatePatrolEnemies(deltaSeconds) {
  for (const enemy of patrolEnemies) {
    if (!enemy.alive) continue;
    enemy.state = updatePatrolEnemy(enemy.state, deltaSeconds);
  }
}

function updateFlyingEnemies(deltaSeconds, events) {
  if (nowMs >= nextFlyingSpawnMs) {
    spawnFlyingEnemy();
    nextFlyingSpawnMs = nowMs + 3200;
    events.push('spawn flying');
  }

  for (const enemy of flyingEnemies) {
    if (!enemy.alive) continue;

    enemy.state = updateFlyingEnemy(enemy.state, playerY, deltaSeconds, -40);
    if (!enemy.state.active) {
      enemy.alive = false;
    }
  }
}

function getPlayerRect() {
  return {
    x: playerX - PLAYER_HALF_WIDTH,
    y: playerY - PLAYER_HALF_HEIGHT,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT
  };
}

function handleEnemyCollisions(events) {
  if (isGameOver) return;

  const playerRect = getPlayerRect();
  const allEnemies = [
    ...patrolEnemies.map((enemy) => ({ enemy, type: 'patrol' })),
    ...flyingEnemies.map((enemy) => ({ enemy, type: 'flying' }))
  ];

  for (const entry of allEnemies) {
    const { enemy } = entry;
    if (!enemy.alive) continue;

    const enemyX = entry.type === 'patrol' ? enemy.state.x : enemy.state.x;
    const enemyY = entry.type === 'patrol' ? enemy.y : enemy.state.y;

    const enemyRect = {
      x: enemyX - enemy.width / 2,
      y: enemyY - enemy.height / 2,
      width: enemy.width,
      height: enemy.height
    };

    const collision = resolveEnemyCollision(playerRect, enemyRect, verticalVelocity);

    if (collision.stomp) {
      enemy.alive = false;
      verticalVelocity = -420;
      events.push(`stomp ${entry.type}`);
      continue;
    }

    if (collision.damage && nowMs >= damageCooldownUntilMs) {
      lives = applyDamage(lives, 1);
      damageCooldownUntilMs = nowMs + DAMAGE_COOLDOWN_MS;
      events.push('hit -1 life');
      if (lives === 0) {
        isGameOver = true;
        currentDirection = 'idle';
        mover.stopAt(playerX - PLAYER_START_X);
        events.push('game over');
        return;
      }
    }
  }
}

function simulateTick(deltaMs, jumpRequested, directionInput) {
  const events = [];
  const previousX = playerX;

  nowMs += deltaMs;
  mover.setDirection(directionInput);
  const movement = mover.update(nowMs);

  const targetX = PLAYER_START_X + movement.x;
  const clampedX = Math.min(Math.max(targetX, minPlayerX), maxPlayerX);

  if (clampedX !== targetX) {
    mover.stopAt(clampedX - PLAYER_START_X);
    currentDirection = 'idle';
  }

  playerX = clampedX;
  const movedX = playerX - previousX;

  if (mover.velocityPxPerSec > MOVEMENT_EPSILON) currentDirection = 'forward';
  else if (mover.velocityPxPerSec < -MOVEMENT_EPSILON) currentDirection = 'backward';
  else if (directionInput !== 'idle') currentDirection = directionInput;
  else currentDirection = 'idle';

  const beatState = getBeatPlatformState(metronome.beatInBarAt(nowMs));
  const beatSolid = beatState !== 'gone';
  const ghostSolid = isGhostPlatformSolid(currentDirection);

  if (jumpRequested && canPlayerJump(beatSolid, ghostSolid)) {
    verticalVelocity = JUMP_VELOCITY;
    events.push('jump');
  }

  const deltaSeconds = deltaMs / 1000;
  const previousPlayerY = playerY;
  verticalVelocity += GRAVITY * deltaSeconds;
  playerY += verticalVelocity * deltaSeconds;
  resolveVerticalCollisions(previousPlayerY, beatSolid, ghostSolid);

  updatePatrolEnemies(deltaSeconds);
  updateFlyingEnemies(deltaSeconds, events);
  handleEnemyCollisions(events);

  const stepRatio = Math.abs(movedX) / STEP_SIZE;

  if (movedX > MOVEMENT_EPSILON) {
    intensity = Math.min(1, intensity + stepRatio * INTENSITY_GAIN_PER_STEP);
  } else if (movedX < -MOVEMENT_EPSILON) {
    const next = intensity - stepRatio * INTENSITY_LOSS_PER_STEP;
    intensity = Math.max(defaultIntensityConfig.residualFloor, next);
  } else {
    const decayed = intensity - defaultIntensityConfig.decayRate * deltaSeconds;
    intensity = Math.max(defaultIntensityConfig.residualFloor, decayed);
  }

  return {
    events
  };
}

function parseActions(tokens) {
  let direction = null;
  let jump = false;

  for (const token of tokens) {
    if (['d', 'right', 'forward'].includes(token)) {
      direction = 'forward';
      continue;
    }

    if (['a', 'left', 'backward'].includes(token)) {
      direction = 'backward';
      continue;
    }

    if (['jump', 'j', 'up'].includes(token)) {
      jump = true;
      continue;
    }

    if (token === 'wait' || token === 'w') {
      continue;
    }

    return { error: `Unknown command token: ${token}` };
  }

  return { direction, jump };
}

async function run() {
  resetGameplayState();

  const rl = createInterface({ input, output });

  output.write('Sambo CLI Test Mode\n');
  output.write(`BPM=${BPM}, subdivision=${SUBDIVISION}, step=${STEP_SIZE}px\n`);
  output.write('Core gameplay simulation without Phaser/browser rendering (continuous movement with inertia).\n\n');
  output.write(`${HELP_TEXT}\n\n`);
  output.write(`${formatSnapshot([])}\n\n`);

  try {
    while (true) {
      const line = (await rl.question('> ')).trim();
      const tokens = line.toLowerCase().split(/\s+/).filter(Boolean);
      const command = tokens[0] || 'wait';

      if (command === 'quit' || command === 'exit') break;

      if (command === 'help') {
        output.write(`${HELP_TEXT}\n\n`);
        continue;
      }

      if (command === 'status') {
        output.write(`${formatSnapshot([])}\n\n`);
        continue;
      }

      if (command === 'restart') {
        resetGameplayState();
        output.write(`Run reset.\n${formatSnapshot(['restart'])}\n\n`);
        continue;
      }

      let deltaMs = DEFAULT_TICK_MS;
      let actionTokens = tokens;

      if (command === 'tick') {
        const rawMs = tokens[1];
        const parsedMs = Number(rawMs);
        if (!Number.isFinite(parsedMs) || parsedMs <= 0) {
          output.write('tick requires a positive number of milliseconds (example: tick 250 d jump).\n\n');
          continue;
        }
        deltaMs = parsedMs;
        actionTokens = tokens.slice(2);
      }

      if (isGameOver) {
        output.write('Run is over. Use `restart` or `status`.\n\n');
        continue;
      }

      const parsedActions = parseActions(actionTokens);
      if (parsedActions.error) {
        output.write(`${parsedActions.error}. Use \`help\` for the command list.\n\n`);
        continue;
      }

      const direction = parsedActions.direction;
      const jumpRequested = parsedActions.jump;
      const directionInput = direction || 'idle';
      const result = simulateTick(deltaMs, jumpRequested, directionInput);
      output.write(`${formatSnapshot(result.events)}\n\n`);
    }
  } finally {
    rl.close();
  }

  output.write('Exited CLI mode.\n');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
