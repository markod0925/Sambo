import { BeatSnapMover } from '../core/beatMovement.js';
import { generateSegments, type AnalysisData } from '../core/levelGenerator.js';
import { Metronome } from '../core/metronome.js';
import { getBeatPlatformState, isGhostPlatformSolid } from '../core/platforms.js';
import { defaultIntensityConfig, updateIntensity } from '../core/intensity.js';
import { MovementDirection } from '../core/types.js';
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

const ANALYSIS: AnalysisData = {
  bpm: 120,
  energy_curve: [0.1, 0.2, 0.3, 0.45, 0.55, 0.65, 0.75, 0.9]
};

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

export class GameScene extends Phaser.Scene {
  private metronome = new Metronome(ANALYSIS.bpm, 4);
  private mover = new BeatSnapMover(this.metronome, 64);
  private player!: any;
  private moon!: any;
  private infoText!: any;
  private livesText!: any;
  private beatPlatform!: any;
  private ghostPlatform!: any;
  private patrolEnemies: PatrolEnemy[] = [];
  private flyingEnemies: FlyingEnemy[] = [];
  private lives = 5;
  private damageCooldownMs = 0;
  private nextFlyingSpawnMs = 0;
  private intensity = defaultIntensityConfig.residualFloor;
  private currentDirection: MovementDirection = 'idle';
  private cursors!: any;
  private keys!: any;
  private synth!: AudioContext;
  private readonly worldWidth = 960;
  private readonly groundY = 380;
  private playerY = 380;
  private verticalVelocity = 0;

  constructor() {
    super('game');
  }

  preload(): void {}

  create(): void {
    this.cameras.main.setBackgroundColor('#0b0f1a');
    this.add.rectangle(480, 520, 960, 240, 0x0f1323).setOrigin(0.5);

    const segments = generateSegments(ANALYSIS);
    segments.forEach((segment, index) => {
      const x = 120 + index * 90;
      const y = 430 - segment.verticalRange[1] * 25;
      const color = segment.energyState === 'low' ? 0x4b5d67 : segment.energyState === 'medium' ? 0x6a7f89 : 0x9ca3af;
      this.add.rectangle(x, y, 74, 18, color, 0.85);
    });

    this.beatPlatform = this.add.rectangle(560, 340, 120, 16, 0x8b93aa, 0.95);
    this.ghostPlatform = this.add.rectangle(720, 290, 100, 14, 0x73f7ff, 0.15);

    this.player = this.add.rectangle(150, this.groundY, 24, 38, 0xffffff, 1);
    this.moon = this.add.circle(820, 90, 42, 0xdde8ff, 0.35);

    this.spawnPatrolEnemy(420, this.groundY + 8, 340, 520);
    this.spawnPatrolEnemy(650, this.groundY + 8, 580, 760);

    this.livesText = this.add.text(20, 14, '', {
      color: '#ffd6e7',
      fontFamily: 'monospace',
      fontSize: '18px'
    });

    this.infoText = this.add.text(20, 44, '', {
      color: '#d7e2ff',
      fontFamily: 'monospace',
      fontSize: '16px'
    });

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,SPACE,UP,LEFT,RIGHT');
    this.synth = new AudioContext();
    this.nextFlyingSpawnMs = performance.now() + 1800;
    this.updateLivesLabel();
  }

  update(_time: number, delta: number): void {
    const now = performance.now();
    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.keys.SPACE) ||
      Phaser.Input.Keyboard.JustDown(this.keys.W) ||
      Phaser.Input.Keyboard.JustDown(this.keys.UP);

    const intent = resolveIntent({
      left: this.keys.A.isDown || this.keys.LEFT.isDown || this.cursors.left.isDown,
      right: this.keys.D.isDown || this.keys.RIGHT.isDown || this.cursors.right.isDown,
      jumpPressed
    });

    if (intent.direction !== 'idle' && (!this.mover.currentStep || this.mover.currentStep.direction !== intent.direction)) {
      this.mover.enqueue(intent.direction);
    }

    const movement = this.mover.update(now);
    if (movement.arrived) this.playNote(movement.direction);

    this.currentDirection = movement.direction;
    this.player.x = 150 + movement.x;

    const deltaSeconds = delta / 1000;
    if (intent.jump && this.playerY >= this.groundY) this.verticalVelocity = -560;

    this.verticalVelocity += 1400 * deltaSeconds;
    this.playerY += this.verticalVelocity * deltaSeconds;
    if (this.playerY > this.groundY) {
      this.playerY = this.groundY;
      this.verticalVelocity = 0;
    }
    this.player.y = this.playerY;

    this.updatePatrolEnemies(deltaSeconds);
    this.updateFlyingEnemies(now, deltaSeconds);
    this.handleEnemyCollisions(now);

    const speed = Math.abs(movement.direction === 'idle' ? 0 : 1);
    this.intensity = updateIntensity(this.intensity, this.currentDirection, speed, deltaSeconds);

    const moonAlpha = 0.2 + this.intensity * 0.8;
    const moonScale = 0.85 + this.intensity * 0.35;
    this.moon.setAlpha(moonAlpha);
    this.moon.setScale(moonScale);

    const beatState = getBeatPlatformState(this.metronome.beatInBarAt(now));
    this.applyBeatPlatformVisual(beatState);

    const ghostSolid = isGhostPlatformSolid(this.currentDirection);
    this.ghostPlatform.setAlpha(ghostSolid ? 0.85 : 0.15);

    const livingPatrol = this.patrolEnemies.filter((e) => e.alive).length;
    const livingFlying = this.flyingEnemies.filter((e) => e.alive && e.state.active).length;
    this.infoText.setText([
      'Sambo Phaser Prototype',
      'A/D or Arrows: move | W/Space/Up: jump',
      `Intensity: ${this.intensity.toFixed(2)}`,
      `Direction: ${this.currentDirection}`,
      `Beat platform: ${beatState}`,
      `Ghost platform: ${ghostSolid ? 'SOLID (rewind)' : 'OFF'}`,
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
      enemy.sprite.setFlipX(enemy.state.direction < 0);
    }
  }

  private updateFlyingEnemies(nowMs: number, deltaSeconds: number): void {
    if (nowMs >= this.nextFlyingSpawnMs) {
      this.spawnFlyingEnemy();
      this.nextFlyingSpawnMs = nowMs + Phaser.Math.Between(2600, 4200);
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
        this.lives = applyDamage(this.lives, 1);
        this.damageCooldownMs = nowMs + 850;
        this.player.setFillStyle(0xffcdd2, 1);
        this.time.delayedCall(220, () => this.player.setFillStyle(0xffffff, 1));
        this.updateLivesLabel();
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

  private playNote(direction: MovementDirection): void {
    if (this.synth.state === 'suspended') this.synth.resume().catch(() => undefined);
    const osc = this.synth.createOscillator();
    const gain = this.synth.createGain();
    const filter = this.synth.createBiquadFilter();

    osc.frequency.value = direction === 'forward' ? 220 : 196;
    filter.type = 'lowpass';
    filter.frequency.value = direction === 'forward' ? 1200 : 450;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.synth.destination);

    const now = this.synth.currentTime;
    if (direction === 'backward') {
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.35, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    } else {
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.5, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    }

    osc.start(now);
    osc.stop(now + 0.24);
  }
}
