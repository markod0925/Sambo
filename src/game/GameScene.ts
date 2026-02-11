import { BeatSnapMover } from '../core/beatMovement.js';
import { generateSegments } from '../core/levelGenerator.js';
import { Metronome } from '../core/metronome.js';
import { buildGridNotesFromMidi, parseMidiFile } from '../core/midi.js';
import { getBeatPlatformState, getElevatorOffsetSteps, isAlternateBeatPlatformSolid } from '../core/platforms.js';
import { defaultIntensityConfig } from '../core/intensity.js';
import { MovementDirection } from '../core/types.js';
import { getLevelByOneBasedIndex, LEVELS } from '../data/levels.js';
import type { LevelDefinition } from '../data/exampleLevel.js';
import { resolveIntent } from '../core/input.js';
import {
  applyDamage,
  resolveEnemyCollision,
  type FlyingEnemyState,
  type PatrolEnemyState,
  type Rect,
  updateFlyingEnemy,
  updatePatrolEnemy
} from '../core/enemies.js';

const DEFAULT_ENERGY_CURVE = [0.1, 0.2, 0.3, 0.45, 0.55, 0.65, 0.75, 0.9];
const BEST_TIME_STORAGE_PREFIX = 'sambo.level';
const CONTROL_HINT_TEXT = 'A/D or Arrows: move | W/Space/Up: jump.';

interface PatrolEnemy {
  sprite: any;
  alive: boolean;
  state: PatrolEnemyState;
}

interface FlyingEnemy {
  sprite: any;
  alive: boolean;
  state: FlyingEnemyState;
}

interface WorldPlatform {
  shape: any;
  solid: boolean;
}

interface ElevatorPlatform {
  shape: any;
  baseY: number;
}

interface SegmentEnemyPlan {
  segmentIndex: number;
  triggerX: number;
  leftX: number;
  rightX: number;
  platformTopY: number;
  patrolCount: number;
  flyingCount: number;
  flyingSpawnIntervalMs: number;
  pendingFlyingSpawns: number;
  nextFlyingSpawnMs: number;
  triggered: boolean;
}

export class GameScene extends Phaser.Scene {
  private metronome!: Metronome;
  private mover!: BeatSnapMover;
  private player!: any;
  private moon!: any;
  private infoText!: any;
  private scoreText!: any;
  private livesText!: any;
  private timerText!: any;
  private beatPlatforms: any[] = [];
  private alternateBeatPlatforms: any[] = [];
  private ghostPlatforms: any[] = [];
  private reverseGhostPlatforms: any[] = [];
  private elevatorPlatforms: ElevatorPlatform[] = [];
  private segmentPlatforms: WorldPlatform[] = [];
  private darknessOverlay!: any;
  private gameOverBackdrop!: any;
  private gameOverText!: any;
  private gameOverDetailsText!: any;
  private restartButton!: any;
  private nextLevelButton!: any;
  private backToMenuButton!: any;
  private pauseBackdrop!: any;
  private pauseTitleText!: any;
  private continueButton!: any;
  private pauseBackToMenuButton!: any;
  private quitButton!: any;
  private endStateTitle = 'GAME OVER';
  private patrolEnemies: PatrolEnemy[] = [];
  private flyingEnemies: FlyingEnemy[] = [];
  private lives = 5;
  private isGameOver = false;
  private isPaused = false;
  private damageCooldownMs = 0;
  private nextFlyingSpawnMs = 0;
  private intensity = 1.0;
  private currentDirection: MovementDirection = 'idle';
  private ghostPlatformLatchedSolid = false;
  private reverseGhostPlatformLatchedSolid = true;
  private cursors!: any;
  private keys!: any;
  private synth: AudioContext | null = null;
  private worldWidth = 960;
  private moonMaxWorldX = 820;
  private readonly playerStartX = 150;
  private readonly minEnemySpawnDistanceFromPlayerStart = 150;
  private readonly platformBlockHeight = 18;
  private readonly movementEpsilon = 0.01;
  private readonly intensityGainPerStep = 0.06;
  private readonly intensityLossPerStep = 0.08;
  private readonly coyoteJumpWindowMs = 120;
  private readonly groundY = 380;
  private minPlayerX = 0;
  private maxPlayerX = 0;
  private gridColumns = 29;
  private playerY = 380;
  private verticalVelocity = 0;
  private lastGroundedAtMs = 0;
  private lastBeatInBar: 1 | 2 | 3 | 4 | null = null;
  private lastElevatorOffsetSteps = 0;
  private moonBeatPulse = 0;
  private runStartMs = 0;
  private elapsedAtEndMs = 0;
  private bestTimeMs: number | null = null;
  private enemyKills = 0;
  private currentLevel: LevelDefinition = LEVELS[0];
  private currentLevelOneBasedIndex = 1;
  private availableLevels: LevelDefinition[] = LEVELS;
  private isPreviewMode = false;
  private masterVolume = 0.5;
  private nextPreviewToggleMs = 0;
  private nextPreviewJumpMs = 0;
  private previewDirection: MovementDirection = 'forward';
  private patrolCount = 2;
  private flyingSpawnIntervalMs = 3400;
  private segmentEnemyPlans: SegmentEnemyPlan[] = [];
  private useSegmentEnemySpawns = false;
  private activeSegmentFlyingSpawnIntervalMs = 0;
  private levelMidiCacheKey: string | null = null;
  private readonly patrolSquashBaseScaleY = 0.93;
  private readonly patrolSquashAmplitude = 0.05;
  private readonly flyingStretchBaseScaleX = 1.03;
  private readonly flyingStretchAmplitude = 0.07;

  constructor() {
    super('game');
  }

  preload(): void {
    this.resolveLevelFromInputs();
    this.queueLevelMidiLoad();
  }

  create(): void {
    this.resolveLevelFromInputs();
    this.applyLoadedMidiToLevelNotes();
    this.resetGameplayState();
    this.validateLevelDefinition();

    this.cameras.main.setBackgroundColor('#0b0f1a');
    this.cameras.main.setBounds(0, 0, this.worldWidth, 540);

    const segments = generateSegments({ bpm: this.currentLevel.bpm, energy_curve: DEFAULT_ENERGY_CURVE });
    const segmentByIndex = segments.length > 0 ? segments : [{ energyState: 'medium' as const, verticalRange: [0, 2] as [number, number] }];
    let segmentCursor = 0;
    for (const platform of this.currentLevel.platforms) {
      if (platform.kind === 'segment') {
        const segment = segmentByIndex[Math.min(segmentCursor, segmentByIndex.length - 1)];
        segmentCursor += 1;
        const x = this.snapXToGrid(platform.x);
        const y = this.snapYToGrid(platform.y);
        const color = segment.energyState === 'low' ? 0x4b5d67 : segment.energyState === 'medium' ? 0x6a7f89 : 0x9ca3af;
        const shape = this.add.rectangle(x, y, this.snapLengthToGrid(platform.width), this.platformBlockHeight, color, 0.85);
        this.segmentPlatforms.push({ shape, solid: true });
      } else if (platform.kind === 'beat') {
        const beat = this.add.rectangle(
          this.snapXToGrid(platform.x),
          this.snapYToGrid(platform.y),
          this.snapLengthToGrid(platform.width),
          this.platformBlockHeight,
          0x8b93aa,
          0.95
        );
        this.beatPlatforms.push(beat);
      } else if (platform.kind === 'alternateBeat') {
        const alternateBeat = this.add.rectangle(
          this.snapXToGrid(platform.x),
          this.snapYToGrid(platform.y),
          this.snapLengthToGrid(platform.width),
          this.platformBlockHeight,
          0xffb86c,
          0.95
        );
        this.alternateBeatPlatforms.push(alternateBeat);
      } else if (platform.kind === 'ghost') {
        const ghost = this.add.rectangle(
          this.snapXToGrid(platform.x),
          this.snapYToGrid(platform.y),
          this.snapLengthToGrid(platform.width),
          this.platformBlockHeight,
          0x73f7ff,
          0.15
        );
        this.ghostPlatforms.push(ghost);
      } else if (platform.kind === 'reverseGhost') {
        const reverseGhost = this.add.rectangle(
          this.snapXToGrid(platform.x),
          this.snapYToGrid(platform.y),
          this.snapLengthToGrid(platform.width),
          this.platformBlockHeight,
          0xff8cf7,
          0.85
        );
        this.reverseGhostPlatforms.push(reverseGhost);
      } else if (platform.kind === 'elevator') {
        const elevator = this.add.rectangle(
          this.snapXToGrid(platform.x),
          this.snapYToGrid(platform.y),
          this.snapLengthToGrid(platform.width),
          this.platformBlockHeight,
          0x60a5fa,
          0.95
        );
        this.elevatorPlatforms.push({ shape: elevator, baseY: elevator.y });
      }
    }
    this.syncElevatorPlatforms(performance.now());
    this.playerY = this.getInitialPlayerYFromPlatforms();

    this.player = this.add.rectangle(150, this.playerY, 24, 38, 0xffffff, 1);
    this.cameras.main.startFollow(this.player, false, 0.12, 0.12);
    this.initializeGridBounds();
    this.moon = this.add.circle(this.moonMaxWorldX, 90, 42, 0xdde8ff, 0.35);

    this.buildSegmentEnemyPlans();
    this.spawnPatrolEnemiesFromLevel();

    this.livesText = this.add.text(20, 14, '', {
      color: '#ffd6e7',
      fontFamily: 'monospace',
      fontSize: '18px'
    });
    this.timerText = this.add
      .text(this.worldWidth / 2, 14, '', {
        color: '#d7e2ff',
        fontFamily: 'monospace',
        fontSize: '20px'
      })
      .setOrigin(0.5, 0);

    this.infoText = this.add.text(20, 44, '', {
      color: '#d7e2ff',
      fontFamily: 'monospace',
      fontSize: '16px'
    });
    this.scoreText = this.add
      .text(480, 520, '0', {
        color: '#d7e2ff',
        fontFamily: 'monospace',
        fontSize: '24px'
      })
      .setOrigin(0.5, 1);

    this.darknessOverlay = this.add
      .rectangle(480, 270, 960, 540, 0x000000, 1)
      .setDepth(10)
      .setScrollFactor(0);
    this.livesText.setDepth(11);
    this.timerText.setDepth(11);
    this.infoText.setDepth(11);
    this.scoreText.setDepth(11);
    this.livesText.setScrollFactor(0);
    this.timerText.setScrollFactor(0);
    this.infoText.setScrollFactor(0);
    this.scoreText.setScrollFactor(0);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,SPACE,UP,LEFT,RIGHT,ESC');
    this.nextFlyingSpawnMs = performance.now() + Math.max(900, this.flyingSpawnIntervalMs * 0.5);
    this.nextPreviewToggleMs = performance.now() + 1200;
    this.nextPreviewJumpMs = performance.now() + 1600;
    this.runStartMs = performance.now();
    this.bestTimeMs = this.loadBestTimeMs();
    this.updateLivesLabel();
    this.updateScoreLabel();
    this.updateTimerLabel(this.runStartMs);
    this.createGameOverUI();
    this.createPauseUI();
  }

  update(_time: number, delta: number): void {
    if (!this.isPreviewMode && !this.isGameOver) {
      const escPressed = Phaser.Input.Keyboard.JustDown(this.keys.ESC);
      if (escPressed) {
        if (this.isPaused) this.resumeFromPause();
        else this.pauseGameplay();
      }
    }
    if (this.isPaused) return;
    if (this.isGameOver) return;

    const now = performance.now();
    this.updateTimerLabel(now);
    let intent;
    if (this.isPreviewMode) {
      intent = this.getPreviewIntent(now);
    } else {
      const jumpPressed =
        Phaser.Input.Keyboard.JustDown(this.keys.SPACE) ||
        Phaser.Input.Keyboard.JustDown(this.keys.W) ||
        Phaser.Input.Keyboard.JustDown(this.keys.UP);

      intent = resolveIntent({
        left: this.keys.A.isDown || this.keys.LEFT.isDown || this.cursors.left.isDown,
        right: this.keys.D.isDown || this.keys.RIGHT.isDown || this.cursors.right.isDown,
        jumpPressed
      });
    }

    const canQueueStep =
      intent.direction !== 'idle' &&
      this.mover.queuedCount === 0 &&
      !this.mover.currentStep;

    if (canQueueStep) {
      this.mover.enqueue(intent.direction);
    }

    const movement = this.mover.update(now);

    const previousPlayerX = this.player.x;
    const targetX = this.playerStartX + movement.x;
    const clampedX = Phaser.Math.Clamp(targetX, this.minPlayerX, this.maxPlayerX);

    if (clampedX !== targetX) {
      this.mover.stopAt(clampedX - this.playerStartX);
      this.currentDirection = 'idle';
    }

    this.player.x = clampedX;
    const movedX = this.player.x - previousPlayerX;
    if (movedX > this.movementEpsilon) this.currentDirection = 'forward';
    else if (movedX < -this.movementEpsilon) this.currentDirection = 'backward';
    else if (this.mover.currentStep) this.currentDirection = this.mover.currentStep.direction;
    else this.currentDirection = 'idle';
    if (movement.arrived) this.playNoteAtGridIndex(this.getGridIndexFromX(this.player.x), movement.direction);

    if (movedX < -this.movementEpsilon) this.ghostPlatformLatchedSolid = true;
    else if (movedX > this.movementEpsilon) this.ghostPlatformLatchedSolid = false;
    if (movedX < -this.movementEpsilon) this.reverseGhostPlatformLatchedSolid = false;
    else if (movedX > this.movementEpsilon) this.reverseGhostPlatformLatchedSolid = true;

    const beatInBar = this.metronome.beatInBarAt(now);
    const beatState = getBeatPlatformState(beatInBar);
    const alternateBeatSolid = isAlternateBeatPlatformSolid(beatInBar);
    this.handleBeatPulse(beatInBar);
    const wasStandingOnElevator = this.isStandingOnAnyElevator();
    const elevatorDeltaY = this.syncElevatorPlatforms(now);
    if (wasStandingOnElevator && elevatorDeltaY !== 0) {
      this.playerY += elevatorDeltaY;
      this.player.y = this.playerY;
      this.verticalVelocity = Math.min(0, this.verticalVelocity);
    }
    const beatSolid = beatState !== 'gone';
    const ghostSolid = this.ghostPlatformLatchedSolid;
    const reverseGhostSolid = this.reverseGhostPlatformLatchedSolid;
    const groundedBeforeJump = this.isPlayerGrounded(beatSolid, alternateBeatSolid, ghostSolid, reverseGhostSolid, true);
    if (groundedBeforeJump) this.lastGroundedAtMs = now;

    const deltaSeconds = delta / 1000;
    const canUseCoyoteJump = now - this.lastGroundedAtMs <= this.coyoteJumpWindowMs;
    if (intent.jump && (groundedBeforeJump || canUseCoyoteJump)) this.verticalVelocity = -560;

    const previousPlayerY = this.playerY;
    this.verticalVelocity += 1400 * deltaSeconds;
    this.playerY += this.verticalVelocity * deltaSeconds;
    this.resolveVerticalCollisions(previousPlayerY, beatSolid, alternateBeatSolid, ghostSolid, reverseGhostSolid, true);
    if (this.playerY > 620) {
      this.triggerGameOver();
      return;
    }

    this.triggerSegmentEnemyPlansAt(this.player.x);
    this.updatePatrolEnemies(deltaSeconds);
    this.updateFlyingEnemies(now, deltaSeconds);
    this.handleEnemyCollisions(now);
    this.handleMoonCollision();

    this.updateIntensityFromMovement(deltaSeconds, movedX);
    this.applyBrightnessFromIntensity();

    this.updateMoonVisual(deltaSeconds);
    this.applyBeatPlatformVisual(beatState);
    this.applyAlternateBeatPlatformVisual(alternateBeatSolid);
    this.applyElevatorPlatformVisual();
    for (const ghostPlatform of this.ghostPlatforms) {
      if (ghostSolid) {
        ghostPlatform.setFillStyle(0x67e8f9, 0.95);
        ghostPlatform.setStrokeStyle(2, 0xe0faff, 0.95);
        ghostPlatform.setAlpha(1);
      } else {
        ghostPlatform.setFillStyle(0x1b3f4a, 0.3);
        ghostPlatform.setStrokeStyle(1, 0x2b6b78, 0.25);
        ghostPlatform.setAlpha(0.12);
      }
    }
    for (const reverseGhostPlatform of this.reverseGhostPlatforms) {
      reverseGhostPlatform.setAlpha(reverseGhostSolid ? 0.85 : 0.15);
    }

    this.infoText.setText(CONTROL_HINT_TEXT);
  }

  private resolveSpawnSafeX(x: number, minX: number, maxX: number): number | null {
    const safeLeft = this.playerStartX - this.minEnemySpawnDistanceFromPlayerStart;
    const safeRight = this.playerStartX + this.minEnemySpawnDistanceFromPlayerStart;
    const clampedX = Phaser.Math.Clamp(x, minX, maxX);
    if (clampedX <= safeLeft || clampedX >= safeRight) return clampedX;

    const canUseLeft = safeLeft >= minX;
    const canUseRight = safeRight <= maxX;
    if (canUseLeft && canUseRight) {
      return clampedX < this.playerStartX ? safeLeft : safeRight;
    }
    if (canUseRight) return safeRight;
    if (canUseLeft) return safeLeft;
    return null;
  }

  private spawnPatrolEnemy(x: number, y: number, minX: number, maxX: number): void {
    const safeX = this.resolveSpawnSafeX(x, minX, maxX);
    if (safeX === null) return;
    const deoverlappedX = this.resolvePatrolSpawnX(safeX, y, minX, maxX);
    if (deoverlappedX === null) return;

    const sprite = this.add.rectangle(deoverlappedX, y, 30, 24, 0xff6b6b, 0.95);
    this.patrolEnemies.push({
      sprite,
      alive: true,
      state: { x: deoverlappedX, speed: 90, direction: 1, minX, maxX }
    });
  }

  private resolvePatrolSpawnX(preferredX: number, y: number, minX: number, maxX: number): number | null {
    const spacing = 34;
    const sameLaneEnemies = this.patrolEnemies.filter((enemy) => enemy.alive && Math.abs(enemy.sprite.y - y) <= 14);
    if (sameLaneEnemies.length === 0) return Phaser.Math.Clamp(preferredX, minX, maxX);

    const collides = (candidateX: number): boolean =>
      sameLaneEnemies.some((enemy) => Math.abs(enemy.sprite.x - candidateX) < spacing);

    const firstChoice = Phaser.Math.Clamp(preferredX, minX, maxX);
    if (!collides(firstChoice)) return firstChoice;

    for (let step = 1; step <= 16; step++) {
      const distance = step * spacing;
      const candidates = [
        Phaser.Math.Clamp(preferredX + distance, minX, maxX),
        Phaser.Math.Clamp(preferredX - distance, minX, maxX)
      ];
      for (const candidate of candidates) {
        if (!collides(candidate)) return candidate;
      }
    }

    return null;
  }

  private spawnFlyingEnemy(): void {
    const y = Phaser.Math.Between(160, 330);
    const x = this.worldWidth + 32;
    this.spawnFlyingEnemyAt(x, y);
  }

  private spawnFlyingEnemyAt(x: number, y: number): void {
    const minX = -80;
    const maxX = this.worldWidth + 80;
    const safeX = this.resolveSpawnSafeX(x, minX, maxX);
    if (safeX === null) return;

    const sprite = this.add.rectangle(safeX, y, 30, 20, 0xffcf5a, 0.95);
    this.flyingEnemies.push({
      sprite,
      alive: true,
      state: { x: safeX, y, speedX: 180, homingRate: 90, active: true }
    });
  }

  private updatePatrolEnemies(deltaSeconds: number): void {
    const nowSeconds = this.time.now / 1000;
    for (const enemy of this.patrolEnemies) {
      if (!enemy.alive) continue;
      enemy.state = updatePatrolEnemy(enemy.state, deltaSeconds);
      enemy.sprite.x = enemy.state.x;
      const fill = enemy.state.direction < 0 ? 0xff8b8b : 0xff6b6b;
      enemy.sprite.setFillStyle(fill, 0.95);
      const squashPhase = nowSeconds * 8 + enemy.state.x * 0.05;
      const squashWave = (Math.sin(squashPhase) + 1) / 2;
      const scaleY = this.patrolSquashBaseScaleY + squashWave * this.patrolSquashAmplitude;
      enemy.sprite.setScale(1, scaleY);
    }
  }

  private updateFlyingEnemies(nowMs: number, deltaSeconds: number): void {
    this.processSegmentFlyingSpawnQueue(nowMs);
    const nowSeconds = nowMs / 1000;
    for (const enemy of this.flyingEnemies) {
      if (!enemy.alive) continue;
      enemy.state = updateFlyingEnemy(enemy.state, this.player.y, deltaSeconds, -40);
      enemy.sprite.x = enemy.state.x;
      enemy.sprite.y = enemy.state.y;
      const stretchPhase = nowSeconds * 6 + enemy.state.y * 0.06;
      const stretchWave = (Math.sin(stretchPhase) + 1) / 2;
      const scaleX = this.flyingStretchBaseScaleX + stretchWave * this.flyingStretchAmplitude;
      enemy.sprite.setScale(scaleX, 1);
      if (!enemy.state.active) {
        enemy.alive = false;
        enemy.sprite.destroy();
      }
    }
  }

  private handleEnemyCollisions(nowMs: number): void {
    const playerRect: Rect = {
      x: this.player.x - this.player.width / 2,
      y: this.player.y - this.player.height / 2,
      width: this.player.width,
      height: this.player.height
    };

    const allEnemies = [
      ...this.patrolEnemies.map((e) => ({ type: 'patrol' as const, enemy: e })),
      ...this.flyingEnemies.map((e) => ({ type: 'flying' as const, enemy: e }))
    ];

    for (const entry of allEnemies) {
      const enemy = entry.enemy;
      if (!enemy.alive) continue;

      const enemyRect: Rect = {
        x: enemy.sprite.x - enemy.sprite.width / 2,
        y: enemy.sprite.y - enemy.sprite.height / 2,
        width: enemy.sprite.width,
        height: enemy.sprite.height
      };

      const collision = resolveEnemyCollision(playerRect, enemyRect, this.verticalVelocity);

      if (collision.stomp) {
        enemy.alive = false;
        this.enemyKills += 1;
        this.updateScoreLabel();
        // Prevent immediate same-frame damage when enemies overlap during a stomp.
        this.damageCooldownMs = Math.max(this.damageCooldownMs, nowMs + 180);
        if (entry.type === 'patrol') {
          enemy.sprite.setFillStyle(0x3b4a67, 0.45);
          enemy.sprite.setScale(1, 0.45);
        } else {
          enemy.sprite.destroy();
        }
        this.verticalVelocity = -420;
        continue;
      }

      if (collision.damage && nowMs >= this.damageCooldownMs) {
        if (this.isPreviewMode) continue;
        this.lives = applyDamage(this.lives, 1);
        this.damageCooldownMs = nowMs + 850;
        this.player.setFillStyle(0xffcdd2, 1);
        this.time.delayedCall(220, () => this.player.setFillStyle(0xffffff, 1));
        this.updateLivesLabel();
        if (this.lives === 0) {
          this.triggerGameOver();
          return;
        }
      }
    }
  }

  private processSegmentFlyingSpawnQueue(nowMs: number): void {
    if (!this.useSegmentEnemySpawns || this.segmentEnemyPlans.length === 0) return;

    for (const plan of this.segmentEnemyPlans) {
      if (!plan.triggered || plan.pendingFlyingSpawns <= 0) continue;
      if (nowMs < plan.nextFlyingSpawnMs) continue;

      const laneLeft = Math.max(120, plan.leftX + 14);
      const laneRight = Math.min(this.worldWidth - 120, plan.rightX - 14);
      const midX = (laneLeft + laneRight) * 0.5;
      const offset = 70 + (plan.flyingCount - plan.pendingFlyingSpawns) * 28;
      const cameraRightEdge = this.cameras.main.scrollX + this.cameras.main.width;
      const offscreenRightX = cameraRightEdge + 48;
      const spawnX = Math.max(offscreenRightX, Math.max(midX + 20, plan.rightX + offset));
      const spawnY = Phaser.Math.Between(160, 330);
      this.spawnFlyingEnemyAt(spawnX, spawnY);

      plan.pendingFlyingSpawns -= 1;
      const spacing = Math.max(500, plan.flyingSpawnIntervalMs || 1200);
      plan.nextFlyingSpawnMs = nowMs + spacing;
    }
  }

  private updateLivesLabel(): void {
    const hearts = Array.from({ length: 5 }, (_, i) => (i < this.lives ? '❤' : '·')).join(' ');
    this.livesText.setText(`Lives: ${hearts} (${this.lives}/5)`);
  }

  private updateScoreLabel(): void {
    if (!this.scoreText) return;
    this.scoreText.setText(String(Math.max(0, Math.floor(this.enemyKills))));
  }

  private applyBeatPlatformVisual(state: ReturnType<typeof getBeatPlatformState>): void {
    if (this.beatPlatforms.length === 0) return;
    if (state === 'solid') {
      for (const beatPlatform of this.beatPlatforms) {
        beatPlatform.setFillStyle(0xfef08a, 1);
        beatPlatform.setStrokeStyle(2, 0xfffbeb, 1);
        beatPlatform.setAlpha(1);
      }
    } else if (state === 'fadeOut') {
      for (const beatPlatform of this.beatPlatforms) {
        beatPlatform.setFillStyle(0xfacc15, 0.9);
        beatPlatform.setStrokeStyle(2, 0xfef08a, 0.95);
        beatPlatform.setAlpha(0.85);
      }
    } else if (state === 'gone') {
      for (const beatPlatform of this.beatPlatforms) {
        beatPlatform.setFillStyle(0x3f2f08, 0.25);
        beatPlatform.setStrokeStyle(1, 0x5f4a10, 0.2);
        beatPlatform.setAlpha(0.03);
      }
    } else {
      for (const beatPlatform of this.beatPlatforms) {
        beatPlatform.setFillStyle(0xf59e0b, 0.9);
        beatPlatform.setStrokeStyle(2, 0xfcd34d, 0.95);
        beatPlatform.setAlpha(0.85);
      }
    }
  }

  private applyAlternateBeatPlatformVisual(solid: boolean): void {
    if (this.alternateBeatPlatforms.length === 0) return;
    if (solid) {
      for (const alternateBeatPlatform of this.alternateBeatPlatforms) {
        alternateBeatPlatform.setFillStyle(0xffb86c, 1);
        alternateBeatPlatform.setAlpha(1);
      }
    } else {
      for (const alternateBeatPlatform of this.alternateBeatPlatforms) {
        alternateBeatPlatform.setFillStyle(0x6b4a2f, 0.45);
        alternateBeatPlatform.setAlpha(0.25);
      }
    }
  }

  private applyElevatorPlatformVisual(): void {
    if (this.elevatorPlatforms.length === 0) return;
    const movingUp = this.lastElevatorOffsetSteps > 0 && this.lastElevatorOffsetSteps < 4;
    const movingDown = this.lastElevatorOffsetSteps > 0 && !movingUp;
    for (const elevatorPlatform of this.elevatorPlatforms) {
      if (movingUp) {
        elevatorPlatform.shape.setFillStyle(0x60a5fa, 0.95);
        elevatorPlatform.shape.setStrokeStyle(2, 0xdbeafe, 0.95);
      } else if (movingDown) {
        elevatorPlatform.shape.setFillStyle(0x3b82f6, 0.9);
        elevatorPlatform.shape.setStrokeStyle(2, 0xbfdbfe, 0.9);
      } else {
        elevatorPlatform.shape.setFillStyle(0x1d4ed8, 0.9);
        elevatorPlatform.shape.setStrokeStyle(2, 0x93c5fd, 0.9);
      }
      elevatorPlatform.shape.setAlpha(0.92);
    }
  }

  private syncElevatorPlatforms(nowMs: number): number {
    if (this.elevatorPlatforms.length === 0) return 0;
    const beatIndex = Math.floor(nowMs / this.metronome.beatIntervalMs);
    const offsetSteps = getElevatorOffsetSteps(beatIndex);
    const deltaSteps = offsetSteps - this.lastElevatorOffsetSteps;
    const stepSize = this.mover.stepSize;
    for (const elevatorPlatform of this.elevatorPlatforms) {
      elevatorPlatform.shape.y = elevatorPlatform.baseY - offsetSteps * stepSize;
    }
    this.lastElevatorOffsetSteps = offsetSteps;
    return -deltaSteps * stepSize;
  }

  private snapLengthToGrid(length: number): number {
    void length;
    return this.mover.stepSize * 2;
  }

  private snapXToGrid(x: number): number {
    const step = this.mover.stepSize;
    const snappedSteps = Math.round((x - this.playerStartX) / step);
    return this.playerStartX + snappedSteps * step;
  }

  private snapYToGrid(y: number): number {
    const step = this.mover.stepSize;
    return Math.round(y / step) * step;
  }

  private getGridIndexFromX(playerX: number): number {
    const step = this.mover.stepSize;
    const relative = Math.round((playerX - this.minPlayerX) / step);
    return Phaser.Math.Clamp(relative, 0, this.gridColumns - 1);
  }

  private updateIntensityFromMovement(deltaSeconds: number, movedX: number): void {
    const stepRatio = Math.abs(movedX) / this.mover.stepSize;

    if (movedX > this.movementEpsilon) {
      this.intensity = Math.min(1, this.intensity + stepRatio * this.intensityGainPerStep);
      return;
    }

    if (movedX < -this.movementEpsilon) {
      const next = this.intensity - stepRatio * this.intensityLossPerStep;
      this.intensity = Math.max(defaultIntensityConfig.residualFloor, next);
      return;
    }

    const decayed = this.intensity - defaultIntensityConfig.decayRate * deltaSeconds;
    this.intensity = Math.max(defaultIntensityConfig.residualFloor, decayed);
  }

  private isPlayerGrounded(
    beatSolid: boolean,
    alternateBeatSolid: boolean,
    ghostSolid: boolean,
    reverseGhostSolid: boolean,
    elevatorSolid: boolean
  ): boolean {
    for (const beatPlatform of this.beatPlatforms) {
      if (this.isStandingOnPlatform(beatPlatform, beatSolid)) return true;
    }
    for (const alternateBeatPlatform of this.alternateBeatPlatforms) {
      if (this.isStandingOnPlatform(alternateBeatPlatform, alternateBeatSolid)) return true;
    }
    for (const ghostPlatform of this.ghostPlatforms) {
      if (this.isStandingOnPlatform(ghostPlatform, ghostSolid)) return true;
    }
    for (const reverseGhostPlatform of this.reverseGhostPlatforms) {
      if (this.isStandingOnPlatform(reverseGhostPlatform, reverseGhostSolid)) return true;
    }
    for (const elevatorPlatform of this.elevatorPlatforms) {
      if (this.isStandingOnPlatform(elevatorPlatform.shape, elevatorSolid)) return true;
    }
    for (const platform of this.segmentPlatforms) {
      if (this.isStandingOnPlatform(platform.shape, platform.solid)) return true;
    }
    return false;
  }

  private isStandingOnAnyElevator(): boolean {
    for (const elevatorPlatform of this.elevatorPlatforms) {
      if (this.isStandingOnPlatform(elevatorPlatform.shape, true)) return true;
    }
    return false;
  }

  private isStandingOnPlatform(platform: any, solid: boolean): boolean {
    if (!solid) return false;
    const playerHalfWidth = this.player.width / 2;
    const playerHalfHeight = this.player.height / 2;
    const platformHalfWidth = platform.width / 2;
    const platformTop = platform.y - platform.height / 2;

    const playerLeft = this.player.x - playerHalfWidth;
    const playerRight = this.player.x + playerHalfWidth;
    const platformLeft = platform.x - platformHalfWidth;
    const platformRight = platform.x + platformHalfWidth;
    const overlapsX = playerRight > platformLeft && playerLeft < platformRight;
    const playerBottom = this.playerY + playerHalfHeight;

    return overlapsX && Math.abs(playerBottom - platformTop) <= 2;
  }

  private resolveVerticalCollisions(
    previousPlayerY: number,
    beatSolid: boolean,
    alternateBeatSolid: boolean,
    ghostSolid: boolean,
    reverseGhostSolid: boolean,
    elevatorSolid: boolean
  ): void {
    const playerHalfWidth = this.player.width / 2;
    const playerHalfHeight = this.player.height / 2;
    const prevBottom = previousPlayerY + playerHalfHeight;
    const currentBottom = this.playerY + playerHalfHeight;
    const playerLeft = this.player.x - playerHalfWidth;
    const playerRight = this.player.x + playerHalfWidth;

    let landingY: number | null = null;

    const tryLandOnPlatform = (platform: any, solid: boolean): void => {
      if (!solid) return;

      const platformHalfWidth = platform.width / 2;
      const platformTop = platform.y - platform.height / 2;
      const platformLeft = platform.x - platformHalfWidth;
      const platformRight = platform.x + platformHalfWidth;
      const overlapsX = playerRight > platformLeft && playerLeft < platformRight;
      const crossingTop = this.verticalVelocity >= 0 && prevBottom <= platformTop + 1 && currentBottom >= platformTop;
      if (!overlapsX || !crossingTop) return;

      const candidateY = platformTop - playerHalfHeight;
      if (landingY === null || candidateY < landingY) landingY = candidateY;
    };

    for (const platform of this.segmentPlatforms) {
      tryLandOnPlatform(platform.shape, platform.solid);
    }
    for (const beatPlatform of this.beatPlatforms) {
      tryLandOnPlatform(beatPlatform, beatSolid);
    }
    for (const alternateBeatPlatform of this.alternateBeatPlatforms) {
      tryLandOnPlatform(alternateBeatPlatform, alternateBeatSolid);
    }
    for (const ghostPlatform of this.ghostPlatforms) {
      tryLandOnPlatform(ghostPlatform, ghostSolid);
    }
    for (const reverseGhostPlatform of this.reverseGhostPlatforms) {
      tryLandOnPlatform(reverseGhostPlatform, reverseGhostSolid);
    }
    for (const elevatorPlatform of this.elevatorPlatforms) {
      tryLandOnPlatform(elevatorPlatform.shape, elevatorSolid);
    }

    if (landingY !== null) {
      this.playerY = landingY;
      this.verticalVelocity = 0;
    }

    this.player.y = this.playerY;
  }

  private applyBrightnessFromIntensity(): void {
    const visibility = Phaser.Math.Clamp((this.intensity - 0.2) / 0.8, 0, 1);
    const darknessAlpha = 0.95 - visibility * 0.9;
    this.darknessOverlay.setAlpha(darknessAlpha);
  }

  private updateMoonVisual(deltaSeconds: number): void {
    const moonScreenTargetX = this.cameras.main.scrollX + this.cameras.main.width - 140;
    this.moon.x = Math.min(moonScreenTargetX, this.moonMaxWorldX);
    this.moonBeatPulse = Math.max(0, this.moonBeatPulse - deltaSeconds * 5.5);
    const moonAlpha = 0.2 + this.intensity * 0.8;
    const baseScale = 0.85 + this.intensity * 0.35;
    const pulseScale = 0.2 * this.moonBeatPulse;
    this.moon.setAlpha(moonAlpha);
    this.moon.setScale(baseScale + pulseScale);
  }

  private handleBeatPulse(beatInBar: 1 | 2 | 3 | 4): void {
    if (this.lastBeatInBar === beatInBar) return;
    this.lastBeatInBar = beatInBar;
    this.moonBeatPulse = 1;
    this.playMetronomeTick(beatInBar === 1);
  }

  private playMetronomeTick(isBarAccent: boolean): void {
    if (this.isPreviewMode || this.masterVolume <= 0) return;
    const synth = this.ensureSynthReady();
    if (!synth) return;
    const osc = synth.createOscillator();
    const gain = synth.createGain();
    const filter = synth.createBiquadFilter();

    osc.type = 'square';
    osc.frequency.value = isBarAccent ? 1760 : 1320;
    filter.type = 'highpass';
    filter.frequency.value = isBarAccent ? 1400 : 1100;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(synth.destination);

    const now = synth.currentTime;
    const peak = Math.max(0.0001, (isBarAccent ? 0.16 : 0.11) * this.masterVolume);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

    osc.start(now);
    osc.stop(now + 0.065);
  }

  private createGameOverUI(): void {
    this.gameOverBackdrop = this.add
      .rectangle(480, 270, 960, 540, 0x000000, 0.7)
      .setVisible(false)
      .setDepth(20)
      .setScrollFactor(0);

    this.gameOverText = this.add
      .text(480, 230, this.endStateTitle, {
        color: '#ffd6e7',
        fontFamily: 'monospace',
        fontSize: '48px'
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(21)
      .setScrollFactor(0);

    this.gameOverDetailsText = this.add
      .text(480, 276, '', {
        color: '#d7e2ff',
        fontFamily: 'monospace',
        fontSize: '24px',
        align: 'center'
      })
      .setOrigin(0.5, 0.5)
      .setVisible(false)
      .setDepth(21)
      .setScrollFactor(0);

    this.restartButton = this.add
      .text(480, 300, 'Restart', {
        color: '#0b0f1a',
        backgroundColor: '#d7e2ff',
        fontFamily: 'monospace',
        fontSize: '24px',
        padding: { left: 14, right: 14, top: 8, bottom: 8 }
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(21)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    this.nextLevelButton = this.add
      .text(480, 390, 'Next Level', {
        color: '#0b0f1a',
        backgroundColor: '#c8ffd6',
        fontFamily: 'monospace',
        fontSize: '20px',
        padding: { left: 12, right: 12, top: 7, bottom: 7 }
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(21)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    this.backToMenuButton = this.add
      .text(480, 430, 'Back To Start', {
        color: '#0b0f1a',
        backgroundColor: '#bfdbfe',
        fontFamily: 'monospace',
        fontSize: '20px',
        padding: { left: 12, right: 12, top: 7, bottom: 7 }
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(21)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    this.restartButton.on('pointerdown', () =>
      this.scene.restart({
        levelIndex: this.currentLevelOneBasedIndex,
        mode: 'play',
        volume: this.masterVolume,
        levels: this.availableLevels
      })
    );
    this.nextLevelButton.on('pointerdown', () => this.goToNextLevel());
    this.backToMenuButton.on('pointerdown', () => {
      this.scene.start('start', {
        levelIndex: this.currentLevelOneBasedIndex,
        volume: this.masterVolume,
        levels: this.availableLevels
      });
    });
  }

  private createPauseUI(): void {
    this.pauseBackdrop = this.add
      .rectangle(480, 270, 960, 540, 0x000000, 0.62)
      .setVisible(false)
      .setDepth(30)
      .setScrollFactor(0);

    this.pauseTitleText = this.add
      .text(480, 220, 'PAUSED', {
        color: '#dbeafe',
        fontFamily: 'monospace',
        fontSize: '50px'
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(31)
      .setScrollFactor(0);

    this.continueButton = this.add
      .text(480, 300, 'Continue', {
        color: '#0b0f1a',
        backgroundColor: '#c7d2fe',
        fontFamily: 'monospace',
        fontSize: '24px',
        padding: { left: 14, right: 14, top: 8, bottom: 8 }
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(31)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    this.pauseBackToMenuButton = this.add
      .text(480, 355, 'Back to Start Screen', {
        color: '#0b0f1a',
        backgroundColor: '#bfdbfe',
        fontFamily: 'monospace',
        fontSize: '22px',
        padding: { left: 12, right: 12, top: 7, bottom: 7 }
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(31)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    this.quitButton = this.add
      .text(480, 410, 'Quit', {
        color: '#0b0f1a',
        backgroundColor: '#fecaca',
        fontFamily: 'monospace',
        fontSize: '22px',
        padding: { left: 12, right: 12, top: 7, bottom: 7 }
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(31)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    this.continueButton.on('pointerdown', () => this.resumeFromPause());
    this.pauseBackToMenuButton.on('pointerdown', () => {
      this.scene.start('start', {
        levelIndex: this.currentLevelOneBasedIndex,
        volume: this.masterVolume,
        levels: this.availableLevels
      });
    });
    this.quitButton.on('pointerdown', () => {
      if (typeof window !== 'undefined') {
        window.close();
        window.location.href = 'about:blank';
      }
    });
  }

  private pauseGameplay(): void {
    if (this.isGameOver || this.isPreviewMode) return;
    this.isPaused = true;
    this.currentDirection = 'idle';
    this.mover.stopAt(this.player.x - this.playerStartX);
    this.pauseBackdrop.setVisible(true);
    this.pauseTitleText.setVisible(true);
    this.continueButton.setVisible(true);
    this.pauseBackToMenuButton.setVisible(true);
    this.quitButton.setVisible(true);
  }

  private resumeFromPause(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.pauseBackdrop.setVisible(false);
    this.pauseTitleText.setVisible(false);
    this.continueButton.setVisible(false);
    this.pauseBackToMenuButton.setVisible(false);
    this.quitButton.setVisible(false);
  }

  private initializeGridBounds(): void {
    const minX = this.player.width / 2;
    const maxX = this.worldWidth - this.player.width / 2;
    const step = this.mover.stepSize;

    const minSteps = Math.ceil((minX - this.playerStartX) / step);
    const maxSteps = Math.floor((maxX - this.playerStartX) / step);

    this.minPlayerX = this.playerStartX + minSteps * step;
    this.maxPlayerX = this.playerStartX + maxSteps * step;
  }

  private validateLevelDefinition(): void {
    if (this.currentLevel.notes.length !== this.currentLevel.gridColumns) {
      throw new Error(
        `Invalid level definition: notes(${this.currentLevel.notes.length}) must equal gridColumns(${this.currentLevel.gridColumns}).`
      );
    }
  }

  private triggerGameOver(): void {
    if (this.isPreviewMode) return;
    this.isGameOver = true;
    this.elapsedAtEndMs = Math.max(0, performance.now() - this.runStartMs);
    this.updateTimerLabel(performance.now());
    this.endStateTitle = 'GAME OVER';
    this.currentDirection = 'idle';
    this.mover.stopAt(this.player.x - this.playerStartX);
    this.gameOverText.setText(this.endStateTitle);
    this.gameOverText.setY(230);
    this.gameOverText.setFontSize('48px');
    this.gameOverText.setAlign('center');
    this.gameOverDetailsText.setVisible(false);
    this.restartButton.setY(300);
    this.nextLevelButton.setVisible(false);
    this.backToMenuButton.setY(355);
    this.backToMenuButton.setVisible(true);
    this.gameOverBackdrop.setVisible(true);
    this.gameOverText.setVisible(true);
    this.restartButton.setVisible(true);
  }

  private triggerVictory(): void {
    if (this.isPreviewMode) return;
    this.isGameOver = true;
    const now = performance.now();
    const rawCompletedMs = Math.max(0, now - this.runStartMs);
    const scoreBonusMs = Math.max(0, Math.floor(this.enemyKills)) * 200;
    const completedMs = Math.max(0, rawCompletedMs - scoreBonusMs);
    this.elapsedAtEndMs = completedMs;
    const previousBest = this.bestTimeMs;
    if (previousBest === null || completedMs < previousBest) {
      this.bestTimeMs = completedMs;
      this.saveBestTimeMs(completedMs);
    }
    this.updateTimerLabel(now);
    this.endStateTitle = 'VICTORY';
    this.currentDirection = 'idle';
    this.mover.stopAt(this.player.x - this.playerStartX);
    const bestLabel = this.formatElapsedTime(this.bestTimeMs ?? completedMs);
    const currentLabel = this.formatElapsedTime(completedMs);
    this.gameOverText.setText('VICTORY');
    this.gameOverText.setY(220);
    this.gameOverText.setFontSize('48px');
    this.gameOverText.setAlign('center');
    this.gameOverDetailsText.setText(`Time: ${currentLabel}\nBest: ${bestLabel}`);
    this.gameOverDetailsText.setY(282);
    this.gameOverDetailsText.setFontSize('24px');
    this.gameOverDetailsText.setVisible(true);
    this.restartButton.setY(345);
    const hasNextLevel = this.currentLevelOneBasedIndex < this.availableLevels.length;
    this.nextLevelButton.setY(390);
    this.nextLevelButton.setVisible(hasNextLevel);
    this.backToMenuButton.setY(hasNextLevel ? 435 : 390);
    this.backToMenuButton.setVisible(true);
    this.gameOverBackdrop.setVisible(true);
    this.gameOverText.setVisible(true);
    this.restartButton.setVisible(true);
  }

  private handleMoonCollision(): void {
    if (this.isGameOver) return;
    if (this.isPreviewMode) return;
    const dx = this.player.x - this.moon.x;
    const dy = this.player.y - this.moon.y;
    const distance = Math.hypot(dx, dy);
    const playerRadius = Math.max(this.player.width, this.player.height) * 0.5;
    const moonRadius = this.moon.radius ?? 42;
    if (distance <= playerRadius + moonRadius) {
      this.triggerVictory();
    }
  }

  private resetGameplayState(): void {
    this.metronome = new Metronome(this.currentLevel.bpm, 4);
    this.mover = new BeatSnapMover(this.metronome, 32);
    this.segmentPlatforms = [];
    this.patrolEnemies = [];
    this.flyingEnemies = [];
    this.lives = 5;
    this.isGameOver = false;
    this.isPaused = false;
    this.endStateTitle = 'GAME OVER';
    this.damageCooldownMs = 0;
    this.nextFlyingSpawnMs = 0;
    this.patrolCount = Math.max(0, Math.floor(this.currentLevel.enemies?.patrolCount ?? 2));
    this.flyingSpawnIntervalMs = Math.max(500, Math.floor(this.currentLevel.enemies?.flyingSpawnIntervalMs ?? 3400));
    this.segmentEnemyPlans = [];
    this.useSegmentEnemySpawns =
      Array.isArray(this.currentLevel.segmentEnemies) &&
      this.currentLevel.segmentEnemies.some((seg) => {
        const patrol = Math.max(0, Math.floor(Number(seg?.patrolCount) || 0));
        const flyingLegacy = Math.max(0, Math.floor(Number(seg?.flyingCount) || 0));
        const rawInterval = Number(seg?.flyingSpawnIntervalMs);
        const hasInterval = Number.isFinite(rawInterval) && rawInterval > 0;
        return patrol + flyingLegacy > 0 || hasInterval;
      });
    this.activeSegmentFlyingSpawnIntervalMs = 0;
    this.beatPlatforms = [];
    this.alternateBeatPlatforms = [];
    this.ghostPlatforms = [];
    this.reverseGhostPlatforms = [];
    this.elevatorPlatforms = [];
    this.intensity = 1.0;
    this.currentDirection = 'idle';
    this.ghostPlatformLatchedSolid = false;
    this.reverseGhostPlatformLatchedSolid = true;
    this.gridColumns = this.currentLevel.gridColumns;
    this.playerY = this.groundY;
    this.verticalVelocity = 0;
    this.lastGroundedAtMs = 0;
    this.lastBeatInBar = null;
    this.lastElevatorOffsetSteps = 0;
    this.moonBeatPulse = 0;
    this.runStartMs = 0;
    this.elapsedAtEndMs = 0;
    this.previewDirection = 'forward';
    this.enemyKills = 0;
    const step = 32;
    const maxPlatformRight = this.currentLevel.platforms.reduce((max, p) => Math.max(max, p.x + p.width / 2), 0);
    const hasAuthoredPlatforms = maxPlatformRight > 0;
    const fromPlatforms = maxPlatformRight + 220;
    const fromGridFallback = this.playerStartX + step * Math.max(0, this.currentLevel.gridColumns - 1) + 220;
    this.worldWidth = Math.max(960, Math.ceil(hasAuthoredPlatforms ? fromPlatforms : fromGridFallback));
    this.moonMaxWorldX = Math.max(820, Math.ceil(maxPlatformRight + 140));
  }

  private updateTimerLabel(nowMs: number): void {
    const elapsedMs = this.isGameOver ? this.elapsedAtEndMs : Math.max(0, nowMs - this.runStartMs);
    this.timerText.setText(`Time ${this.formatElapsedTime(elapsedMs)}`);
  }

  private formatElapsedTime(ms: number): string {
    const safeMs = Math.max(0, Math.floor(ms));
    const minutes = Math.floor(safeMs / 60000);
    const seconds = Math.floor((safeMs % 60000) / 1000);
    const centiseconds = Math.floor((safeMs % 1000) / 10);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
  }

  private loadBestTimeMs(): number | null {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      const raw = window.localStorage.getItem(this.getBestTimeStorageKey(this.currentLevelOneBasedIndex));
      if (!raw) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    } catch {
      return null;
    }
  }

  private saveBestTimeMs(timeMs: number): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(
        this.getBestTimeStorageKey(this.currentLevelOneBasedIndex),
        String(Math.max(0, Math.floor(timeMs)))
      );
    } catch {
      // Ignore storage failures (private mode / disabled storage).
    }
  }

  private playNoteAtGridIndex(gridIndex: number, direction: MovementDirection): void {
    if (this.isPreviewMode || this.masterVolume <= 0) return;
    const synth = this.ensureSynthReady();
    if (!synth) return;
    const osc = synth.createOscillator();
    const gain = synth.createGain();
    const filter = synth.createBiquadFilter();
    const freq = this.currentLevel.notes[gridIndex] ?? 220;

    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.value = direction === 'forward' ? 1200 : 700;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(synth.destination);

    const now = synth.currentTime;
    if (direction === 'backward') {
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.35 * this.masterVolume), now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    } else {
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.5 * this.masterVolume), now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    }

    osc.start(now);
    osc.stop(now + 0.24);
  }

  private ensureSynthReady(): AudioContext | null {
    try {
      if (!this.synth) this.synth = new AudioContext();
      if (this.synth.state === 'suspended') {
        this.synth.resume().catch(() => undefined);
        return null;
      }
      return this.synth;
    } catch {
      return null;
    }
  }

  private resolveLevelFromInputs(): void {
    const data = (this.scene.settings.data || {}) as {
      levelIndex?: number;
      mode?: 'play' | 'preview';
      volume?: number;
      levels?: LevelDefinition[];
    };
    const fallbackIndex = 1;
    let parsedIndex = Number.isFinite(data.levelIndex) ? Number(data.levelIndex) : fallbackIndex;
    if (!Number.isFinite(parsedIndex)) {
      try {
        if (typeof window !== 'undefined') {
          const raw = new URLSearchParams(window.location.search).get('level');
          if (raw) parsedIndex = Number(raw);
        }
      } catch {
        parsedIndex = fallbackIndex;
      }
    }

    this.isPreviewMode = data.mode === 'preview';
    const requestedVolume = Number(data.volume);
    this.masterVolume = Number.isFinite(requestedVolume) ? Phaser.Math.Clamp(requestedVolume, 0, 1) : 0.5;

    if (Array.isArray(data.levels) && data.levels.length > 0) this.availableLevels = data.levels;
    else this.availableLevels = LEVELS;

    const safeIndex = Math.max(1, Math.min(this.availableLevels.length, Math.floor(parsedIndex)));
    const resolvedLevel = this.availableLevels[safeIndex - 1] ?? getLevelByOneBasedIndex(safeIndex);
    this.currentLevel = {
      ...resolvedLevel,
      notes: [...(resolvedLevel.notes || [])],
      platforms: [...(resolvedLevel.platforms || [])],
      segmentEnemies: Array.isArray(resolvedLevel.segmentEnemies)
        ? resolvedLevel.segmentEnemies.map((entry) => ({ ...entry }))
        : undefined,
      enemies: resolvedLevel.enemies ? { ...resolvedLevel.enemies } : undefined
    };
    this.currentLevelOneBasedIndex = safeIndex;
  }

  private queueLevelMidiLoad(): void {
    const midiFile = String(this.currentLevel.midi_file || '').trim();
    if (!midiFile) {
      this.levelMidiCacheKey = null;
      return;
    }
    const cacheKey = `level-midi:${this.currentLevelOneBasedIndex}:${midiFile}`;
    this.levelMidiCacheKey = cacheKey;
    this.load.binary(cacheKey, `/api/midi-file?name=${encodeURIComponent(midiFile)}`);
  }

  private applyLoadedMidiToLevelNotes(): void {
    if (!this.levelMidiCacheKey) return;
    if (!this.cache.binary.exists(this.levelMidiCacheKey)) return;

    const raw = this.cache.binary.get(this.levelMidiCacheKey) as unknown;
    const arrayBuffer = this.coerceArrayBuffer(raw);
    if (!arrayBuffer) return;

    try {
      const parsed = parseMidiFile(arrayBuffer);
      const midiNotes = buildGridNotesFromMidi(parsed, this.currentLevel.gridColumns);
      if (midiNotes.length !== this.currentLevel.gridColumns) return;
      this.currentLevel.notes = midiNotes;
    } catch (err) {
      console.warn('Unable to parse runtime MIDI file for level playback.', err);
    }
  }

  private coerceArrayBuffer(raw: unknown): ArrayBufferLike | null {
    if (raw instanceof ArrayBuffer) return raw;
    if (ArrayBuffer.isView(raw)) {
      return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    }
    return null;
  }

  private goToNextLevel(): void {
    const next = this.currentLevelOneBasedIndex + 1;
    if (next > this.availableLevels.length) return;
    this.scene.restart({ levelIndex: next, mode: 'play', volume: this.masterVolume, levels: this.availableLevels });
  }

  private getBestTimeStorageKey(levelOneBasedIndex: number): string {
    return `${BEST_TIME_STORAGE_PREFIX}.${Math.max(1, Math.floor(levelOneBasedIndex))}.bestTimeMs`;
  }

  private getPreviewIntent(nowMs: number): { direction: MovementDirection; jump: boolean } {
    if (nowMs >= this.nextPreviewToggleMs) {
      this.previewDirection = this.previewDirection === 'forward' ? 'backward' : 'forward';
      this.nextPreviewToggleMs = nowMs + Phaser.Math.Between(1600, 2800);
    }

    const jump = nowMs >= this.nextPreviewJumpMs;
    if (jump) {
      this.nextPreviewJumpMs = nowMs + Phaser.Math.Between(1400, 2600);
    }
    return { direction: this.previewDirection, jump };
  }

  private spawnPatrolEnemiesFromLevel(): void {
    if (this.useSegmentEnemySpawns) return;
    const count = Math.max(0, this.patrolCount);
    if (count <= 0) return;

    const segments = [...this.segmentPlatforms].map((p) => p.shape).sort((a, b) => a.x - b.x);
    if (segments.length === 0) return;

    for (let i = 0; i < count; i++) {
      const t = (i + 1) / (count + 1);
      const idx = Math.min(segments.length - 1, Math.max(0, Math.floor(t * (segments.length - 1))));
      const shape = segments[idx];
      const x = shape.x;
      const span = Math.max(52, Math.min(140, shape.width * 0.7));
      const minX = Math.max(120, x - span * 0.5);
      const maxX = Math.min(this.worldWidth - 120, x + span * 0.5);
      const y = this.snapYToGrid(shape.y - shape.height / 2 - 12);
      this.spawnPatrolEnemy(x, y, minX, maxX);
    }
  }

  private buildSegmentEnemyPlans(): void {
    if (!this.useSegmentEnemySpawns) return;
    if (!Array.isArray(this.currentLevel.segmentEnemies) || this.currentLevel.segmentEnemies.length === 0) return;

    const segments = [...this.segmentPlatforms]
      .map((platform) => platform.shape)
      .sort((a, b) => a.x - b.x);
    if (segments.length === 0) return;
    const rawRows = this.currentLevel.segmentEnemies
      .map((row) => ({
        sourceIdx: Math.floor(Number(row?.segmentIndex)),
        patrolCount: Math.max(0, Math.floor(Number(row?.patrolCount) || 0)),
        flyingCount: Math.max(0, Math.floor(Number(row?.flyingCount) || 0)),
        flyingSpawnIntervalMs: (() => {
          const rawInterval = Number(row?.flyingSpawnIntervalMs);
          return Number.isFinite(rawInterval) && rawInterval > 0
            ? Math.max(500, Math.min(30000, Math.floor(rawInterval)))
            : 0;
        })()
      }))
      .filter((row) => Number.isFinite(row.sourceIdx));
    const maxSourceIdx = rawRows.reduce((max, row) => Math.max(max, row.sourceIdx), 0);
    const toSegmentIndex = (sourceIdx: number): number =>
      maxSourceIdx > 0
        ? Phaser.Math.Clamp(Math.round((Math.max(0, sourceIdx) / maxSourceIdx) * (segments.length - 1)), 0, segments.length - 1)
        : 0;

    const patrolAssigned = new Array(segments.length).fill(0);
    const flyingBySegment = new Map<number, { flyingCount: number; flyingSpawnIntervalMs: number }>();
    const pickSpreadSegment = (preferredIdx: number): number => {
      let bestIdx = preferredIdx;
      let bestScore = Number.POSITIVE_INFINITY;
      for (let i = 0; i < segments.length; i++) {
        const distance = Math.abs(i - preferredIdx);
        const score = patrolAssigned[i] * 100 + distance;
        if (score < bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
      return bestIdx;
    };

    for (const row of rawRows) {
      const baseIndex = toSegmentIndex(row.sourceIdx);
      for (let i = 0; i < row.patrolCount; i++) {
        const targetIndex = pickSpreadSegment(baseIndex);
        patrolAssigned[targetIndex] += 1;
      }
      if (row.flyingCount > 0 || row.flyingSpawnIntervalMs > 0) {
        const prev = flyingBySegment.get(baseIndex);
        if (!prev) {
          flyingBySegment.set(baseIndex, {
            flyingCount: row.flyingCount,
            flyingSpawnIntervalMs: row.flyingSpawnIntervalMs
          });
        } else {
          prev.flyingCount += row.flyingCount;
          if (row.flyingSpawnIntervalMs > 0) {
            prev.flyingSpawnIntervalMs =
              prev.flyingSpawnIntervalMs > 0
                ? Math.min(prev.flyingSpawnIntervalMs, row.flyingSpawnIntervalMs)
                : row.flyingSpawnIntervalMs;
          }
        }
      }
    }

    const plans: SegmentEnemyPlan[] = [];
    for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
      const shape = segments[segmentIndex];
      const leftX = shape.x - shape.width / 2;
      const rightX = shape.x + shape.width / 2;
      const patrolCount = patrolAssigned[segmentIndex] || 0;
      const flyingMeta = flyingBySegment.get(segmentIndex);
      const flyingCount = flyingMeta?.flyingCount ?? 0;
      const flyingSpawnIntervalMs = flyingMeta?.flyingSpawnIntervalMs ?? 0;
      if (patrolCount + flyingCount <= 0 && flyingSpawnIntervalMs <= 0) continue;
      plans.push({
        segmentIndex,
        triggerX: leftX,
        leftX,
        rightX,
        platformTopY: shape.y - shape.height / 2,
        patrolCount,
        flyingCount,
        flyingSpawnIntervalMs,
        pendingFlyingSpawns: 0,
        nextFlyingSpawnMs: 0,
        triggered: false
      });
    }

    this.segmentEnemyPlans = plans.sort((a, b) => a.triggerX - b.triggerX);
    this.spawnSegmentPatrolAtLevelStart();
  }

  private triggerSegmentEnemyPlansAt(playerX: number): void {
    if (!this.useSegmentEnemySpawns || this.segmentEnemyPlans.length === 0) return;

    for (const plan of this.segmentEnemyPlans) {
      if (plan.triggered) continue;
      if (Number.isFinite(playerX) && playerX + this.player.width / 2 < plan.triggerX) continue;
      this.queueFlyingForPlan(plan);
      plan.triggered = true;
    }
  }

  private spawnSegmentPatrolAtLevelStart(): void {
    for (const plan of this.segmentEnemyPlans) {
      this.spawnPatrolForPlan(plan);
    }
  }

  private spawnPatrolForPlan(plan: SegmentEnemyPlan): void {
    const laneLeft = Math.max(120, plan.leftX + 6);
    const laneRight = Math.min(this.worldWidth - 120, plan.rightX - 6);
    const midX = (laneLeft + laneRight) * 0.5;
    const laneWidth = Math.max(0, laneRight - laneLeft);
    const minSpacing = 34;
    const laneCapacity = Math.max(1, Math.floor(laneWidth / minSpacing) + 1);
    const spawnCount = Math.min(plan.patrolCount, laneCapacity);

    for (let i = 0; i < spawnCount; i++) {
      const t = (i + 1) / (spawnCount + 1);
      const x = laneRight > laneLeft ? laneLeft + (laneRight - laneLeft) * t : midX;
      const span = Math.max(52, Math.min(140, (laneRight - laneLeft) * 0.5));
      const minX = Math.max(120, x - span * 0.5);
      const maxX = Math.min(this.worldWidth - 120, x + span * 0.5);
      this.spawnPatrolEnemy(x, this.snapYToGrid(plan.platformTopY - 12), minX, maxX);
    }
  }

  private queueFlyingForPlan(plan: SegmentEnemyPlan): void {
    plan.pendingFlyingSpawns = Math.max(plan.flyingCount, plan.flyingSpawnIntervalMs > 0 ? 1 : 0);
    plan.nextFlyingSpawnMs = performance.now();
  }

  private getInitialPlayerYFromPlatforms(): number {
    const playerHalfHeight = 38 / 2;
    const step = this.mover.stepSize;
    const targetX = this.playerStartX;
    const candidates = this.segmentPlatforms
      .map((platform) => platform.shape)
      .filter((shape) => Math.abs(shape.x - targetX) <= step * 3)
      .sort((a, b) => Math.abs(a.x - targetX) - Math.abs(b.x - targetX));
    const picked = candidates[0] ?? this.segmentPlatforms[0]?.shape;
    if (!picked) return this.groundY;
    const top = picked.y - picked.height / 2;
    return top - playerHalfHeight;
  }
}
