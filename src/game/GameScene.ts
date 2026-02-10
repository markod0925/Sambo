import { BeatSnapMover } from '../core/beatMovement.js';
import { generateSegments } from '../core/levelGenerator.js';
import { Metronome } from '../core/metronome.js';
import { getBeatPlatformState } from '../core/platforms.js';
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

export class GameScene extends Phaser.Scene {
  private metronome!: Metronome;
  private mover!: BeatSnapMover;
  private player!: any;
  private moon!: any;
  private infoText!: any;
  private livesText!: any;
  private timerText!: any;
  private beatPlatform!: any;
  private ghostPlatform!: any;
  private reverseGhostPlatform!: any;
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
  private readonly worldWidth = 960;
  private readonly playerStartX = 150;
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
  private moonBeatPulse = 0;
  private runStartMs = 0;
  private elapsedAtEndMs = 0;
  private bestTimeMs: number | null = null;
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

  constructor() {
    super('game');
  }

  preload(): void {}

  create(): void {
    this.resolveLevelFromInputs();
    this.resetGameplayState();
    this.validateLevelDefinition();

    this.cameras.main.setBackgroundColor('#0b0f1a');
    this.add.rectangle(480, 520, 960, 240, 0x0f1323).setOrigin(0.5);

    const segments = generateSegments({ bpm: this.currentLevel.bpm, energy_curve: DEFAULT_ENERGY_CURVE });
    const segmentByIndex = segments.length > 0 ? segments : [{ energyState: 'medium' as const, verticalRange: [0, 2] as [number, number] }];
    let segmentCursor = 0;
    for (const platform of this.currentLevel.platforms) {
      if (platform.kind === 'segment') {
        const segment = segmentByIndex[Math.min(segmentCursor, segmentByIndex.length - 1)];
        segmentCursor += 1;
        const x = this.snapXToGrid(platform.x);
        const y = platform.y;
        const color = segment.energyState === 'low' ? 0x4b5d67 : segment.energyState === 'medium' ? 0x6a7f89 : 0x9ca3af;
        const shape = this.add.rectangle(x, y, this.snapLengthToGrid(platform.width), platform.height, color, 0.85);
        this.segmentPlatforms.push({ shape, solid: true });
      } else if (platform.kind === 'beat') {
        this.beatPlatform = this.add.rectangle(
          this.snapXToGrid(platform.x),
          platform.y,
          this.snapLengthToGrid(platform.width),
          platform.height,
          0x8b93aa,
          0.95
        );
      } else if (platform.kind === 'ghost') {
        this.ghostPlatform = this.add.rectangle(
          this.snapXToGrid(platform.x),
          platform.y,
          this.snapLengthToGrid(platform.width),
          platform.height,
          0x73f7ff,
          0.15
        );
      } else if (platform.kind === 'reverseGhost') {
        this.reverseGhostPlatform = this.add.rectangle(
          this.snapXToGrid(platform.x),
          platform.y,
          this.snapLengthToGrid(platform.width),
          platform.height,
          0xff8cf7,
          0.85
        );
      }
    }

    this.player = this.add.rectangle(150, this.groundY, 24, 38, 0xffffff, 1);
    this.initializeGridBounds();
    this.moon = this.add.circle(820, 90, 42, 0xdde8ff, 0.35);

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

    this.darknessOverlay = this.add
      .rectangle(this.worldWidth / 2, 270, this.worldWidth, 540, 0x000000, 1)
      .setDepth(10);
    this.livesText.setDepth(11);
    this.timerText.setDepth(11);
    this.infoText.setDepth(11);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,SPACE,UP,LEFT,RIGHT,ESC');
    this.nextFlyingSpawnMs = performance.now() + Math.max(900, this.flyingSpawnIntervalMs * 0.5);
    this.nextPreviewToggleMs = performance.now() + 1200;
    this.nextPreviewJumpMs = performance.now() + 1600;
    this.runStartMs = performance.now();
    this.bestTimeMs = this.loadBestTimeMs();
    this.updateLivesLabel();
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
    this.handleBeatPulse(beatInBar);
    const beatSolid = beatState !== 'gone';
    const ghostSolid = this.ghostPlatformLatchedSolid;
    const reverseGhostSolid = this.reverseGhostPlatformLatchedSolid;
    const groundedBeforeJump = this.isPlayerGrounded(beatSolid, ghostSolid, reverseGhostSolid);
    if (groundedBeforeJump) this.lastGroundedAtMs = now;

    const deltaSeconds = delta / 1000;
    const canUseCoyoteJump = now - this.lastGroundedAtMs <= this.coyoteJumpWindowMs;
    if (intent.jump && (groundedBeforeJump || canUseCoyoteJump)) this.verticalVelocity = -560;

    const previousPlayerY = this.playerY;
    this.verticalVelocity += 1400 * deltaSeconds;
    this.playerY += this.verticalVelocity * deltaSeconds;
    this.resolveVerticalCollisions(previousPlayerY, beatSolid, ghostSolid, reverseGhostSolid);

    this.updatePatrolEnemies(deltaSeconds);
    this.updateFlyingEnemies(now, deltaSeconds);
    this.handleEnemyCollisions(now);
    this.handleMoonCollision();

    this.updateIntensityFromMovement(deltaSeconds, movedX);
    this.applyBrightnessFromIntensity();

    this.updateMoonVisual(deltaSeconds);
    this.applyBeatPlatformVisual(beatState);
    this.ghostPlatform.setAlpha(ghostSolid ? 0.85 : 0.15);
    if (this.reverseGhostPlatform) this.reverseGhostPlatform.setAlpha(reverseGhostSolid ? 0.85 : 0.15);

    const livingPatrol = this.patrolEnemies.filter((e) => e.alive).length;
    const livingFlying = this.flyingEnemies.filter((e) => e.alive && e.state.active).length;
    this.infoText.setText([
      'Sambo Phaser Prototype',
      'A/D or Arrows: move | W/Space/Up: jump',
      `Level: ${this.currentLevelOneBasedIndex}/${this.availableLevels.length}`,
      `Intensity: ${this.intensity.toFixed(2)}`,
      `Direction: ${this.currentDirection}`,
      `Beat platform: ${beatState}`,
      `Ghost platform: ${ghostSolid ? 'SOLID (rewind)' : 'OFF'}`,
      `Reverse ghost: ${reverseGhostSolid ? 'SOLID (forward/idle)' : 'OFF (rewind)'}`,
      `Enemies: patrol ${livingPatrol} | flying ${livingFlying}`
    ]);
  }

  private spawnPatrolEnemy(x: number, y: number, minX: number, maxX: number): void {
    const sprite = this.add.rectangle(x, y, 30, 24, 0xff6b6b, 0.95);
    this.patrolEnemies.push({
      sprite,
      alive: true,
      state: { x, speed: 90, direction: 1, minX, maxX }
    });
  }

  private spawnFlyingEnemy(): void {
    const y = Phaser.Math.Between(160, 330);
    const x = this.worldWidth + 32;
    const sprite = this.add.rectangle(x, y, 30, 20, 0xffcf5a, 0.95);
    this.flyingEnemies.push({
      sprite,
      alive: true,
      state: { x, y, speedX: 180, homingRate: 90, active: true }
    });
  }

  private updatePatrolEnemies(deltaSeconds: number): void {
    for (const enemy of this.patrolEnemies) {
      if (!enemy.alive) continue;
      enemy.state = updatePatrolEnemy(enemy.state, deltaSeconds);
      enemy.sprite.x = enemy.state.x;
      const fill = enemy.state.direction < 0 ? 0xff8b8b : 0xff6b6b;
      enemy.sprite.setFillStyle(fill, 0.95);
    }
  }

  private updateFlyingEnemies(nowMs: number, deltaSeconds: number): void {
    if (nowMs >= this.nextFlyingSpawnMs) {
      this.spawnFlyingEnemy();
      const base = Math.max(700, this.flyingSpawnIntervalMs);
      const jitter = Math.round(base * 0.25);
      this.nextFlyingSpawnMs = nowMs + Phaser.Math.Between(base - jitter, base + jitter);
    }

    for (const enemy of this.flyingEnemies) {
      if (!enemy.alive) continue;
      enemy.state = updateFlyingEnemy(enemy.state, this.player.y, deltaSeconds, -40);
      enemy.sprite.x = enemy.state.x;
      enemy.sprite.y = enemy.state.y;
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

  private updateLivesLabel(): void {
    const hearts = Array.from({ length: 5 }, (_, i) => (i < this.lives ? '❤' : '·')).join(' ');
    this.livesText.setText(`Lives: ${hearts} (${this.lives}/5)`);
  }

  private applyBeatPlatformVisual(state: ReturnType<typeof getBeatPlatformState>): void {
    if (state === 'solid') this.beatPlatform.setAlpha(1);
    else if (state === 'fadeOut') this.beatPlatform.setAlpha(0.55);
    else if (state === 'gone') this.beatPlatform.setAlpha(0.1);
    else this.beatPlatform.setAlpha(0.45);
  }

  private snapLengthToGrid(length: number): number {
    const step = this.mover.stepSize;
    const snapped = Math.round(length / step) * step;
    return Math.max(step, snapped);
  }

  private snapXToGrid(x: number): number {
    const step = this.mover.stepSize;
    const snappedSteps = Math.round((x - this.playerStartX) / step);
    return this.playerStartX + snappedSteps * step;
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

  private isPlayerGrounded(beatSolid: boolean, ghostSolid: boolean, reverseGhostSolid: boolean): boolean {
    if (this.playerY >= this.groundY - 0.5) return true;
    if (this.isStandingOnPlatform(this.beatPlatform, beatSolid)) return true;
    if (this.isStandingOnPlatform(this.ghostPlatform, ghostSolid)) return true;
    if (this.reverseGhostPlatform && this.isStandingOnPlatform(this.reverseGhostPlatform, reverseGhostSolid)) return true;
    for (const platform of this.segmentPlatforms) {
      if (this.isStandingOnPlatform(platform.shape, platform.solid)) return true;
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
    ghostSolid: boolean,
    reverseGhostSolid: boolean
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
    tryLandOnPlatform(this.beatPlatform, beatSolid);
    tryLandOnPlatform(this.ghostPlatform, ghostSolid);
    if (this.reverseGhostPlatform) tryLandOnPlatform(this.reverseGhostPlatform, reverseGhostSolid);

    if (landingY !== null) {
      this.playerY = landingY;
      this.verticalVelocity = 0;
    }

    if (this.playerY > this.groundY) {
      this.playerY = this.groundY;
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
      .rectangle(this.worldWidth / 2, 270, this.worldWidth, 540, 0x000000, 0.7)
      .setVisible(false)
      .setDepth(20);

    this.gameOverText = this.add
      .text(this.worldWidth / 2, 230, this.endStateTitle, {
        color: '#ffd6e7',
        fontFamily: 'monospace',
        fontSize: '48px'
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(21);

    this.gameOverDetailsText = this.add
      .text(this.worldWidth / 2, 276, '', {
        color: '#d7e2ff',
        fontFamily: 'monospace',
        fontSize: '24px',
        align: 'center'
      })
      .setOrigin(0.5, 0.5)
      .setVisible(false)
      .setDepth(21);

    this.restartButton = this.add
      .text(this.worldWidth / 2, 300, 'Restart', {
        color: '#0b0f1a',
        backgroundColor: '#d7e2ff',
        fontFamily: 'monospace',
        fontSize: '24px',
        padding: { left: 14, right: 14, top: 8, bottom: 8 }
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(21)
      .setInteractive({ useHandCursor: true });

    this.nextLevelButton = this.add
      .text(this.worldWidth / 2, 390, 'Next Level', {
        color: '#0b0f1a',
        backgroundColor: '#c8ffd6',
        fontFamily: 'monospace',
        fontSize: '20px',
        padding: { left: 12, right: 12, top: 7, bottom: 7 }
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(21)
      .setInteractive({ useHandCursor: true });

    this.backToMenuButton = this.add
      .text(this.worldWidth / 2, 430, 'Back To Start', {
        color: '#0b0f1a',
        backgroundColor: '#bfdbfe',
        fontFamily: 'monospace',
        fontSize: '20px',
        padding: { left: 12, right: 12, top: 7, bottom: 7 }
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(21)
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
      .rectangle(this.worldWidth / 2, 270, this.worldWidth, 540, 0x000000, 0.62)
      .setVisible(false)
      .setDepth(30);

    this.pauseTitleText = this.add
      .text(this.worldWidth / 2, 220, 'PAUSED', {
        color: '#dbeafe',
        fontFamily: 'monospace',
        fontSize: '50px'
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(31);

    this.continueButton = this.add
      .text(this.worldWidth / 2, 300, 'Continue', {
        color: '#0b0f1a',
        backgroundColor: '#c7d2fe',
        fontFamily: 'monospace',
        fontSize: '24px',
        padding: { left: 14, right: 14, top: 8, bottom: 8 }
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(31)
      .setInteractive({ useHandCursor: true });

    this.pauseBackToMenuButton = this.add
      .text(this.worldWidth / 2, 355, 'Back to Start Screen', {
        color: '#0b0f1a',
        backgroundColor: '#bfdbfe',
        fontFamily: 'monospace',
        fontSize: '22px',
        padding: { left: 12, right: 12, top: 7, bottom: 7 }
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(31)
      .setInteractive({ useHandCursor: true });

    this.quitButton = this.add
      .text(this.worldWidth / 2, 410, 'Quit', {
        color: '#0b0f1a',
        backgroundColor: '#fecaca',
        fontFamily: 'monospace',
        fontSize: '22px',
        padding: { left: 12, right: 12, top: 7, bottom: 7 }
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(31)
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
    const completedMs = Math.max(0, now - this.runStartMs);
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
    this.intensity = 1.0;
    this.currentDirection = 'idle';
    this.ghostPlatformLatchedSolid = false;
    this.reverseGhostPlatformLatchedSolid = true;
    this.gridColumns = this.currentLevel.gridColumns;
    this.playerY = this.groundY;
    this.verticalVelocity = 0;
    this.lastGroundedAtMs = 0;
    this.lastBeatInBar = null;
    this.moonBeatPulse = 0;
    this.runStartMs = 0;
    this.elapsedAtEndMs = 0;
    this.previewDirection = 'forward';
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
    this.currentLevel = resolvedLevel;
    this.currentLevelOneBasedIndex = safeIndex;
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
    const count = Math.max(0, this.patrolCount);
    if (count <= 0) return;

    const left = 240;
    const right = 760;
    const patrolRangeHalf = 90;
    for (let i = 0; i < count; i++) {
      const t = (i + 1) / (count + 1);
      const x = left + (right - left) * t;
      const minX = Math.max(120, x - patrolRangeHalf);
      const maxX = Math.min(840, x + patrolRangeHalf);
      this.spawnPatrolEnemy(x, this.groundY + 8, minX, maxX);
    }
  }
}
