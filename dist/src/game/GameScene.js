import { BeatSnapMover } from '../core/beatMovement.js';
import { Metronome } from '../core/metronome.js';
import { lowerBoundByEndTick, lowerBoundByStartTick, normalizeMidiTickModel, parseMidiToTickModel, tickToSeconds } from '../core/midi.js';
import { getBeatPlatformState, getCrossOffsetSteps, getElevatorOffsetSteps, getShuttleOffsetSteps, isAlternateBeatPlatformSolid } from '../core/platforms.js';
import { defaultIntensityConfig } from '../core/intensity.js';
import { resolveAudioQualitySettings } from '../core/audioQuality.js';
import { DEFAULT_TEMPO_SMOOTHING_BPM_PER_SECOND, DEFAULT_REFERENCE_BPM, getTempoAtColumn, normalizeTempoMap, scaleIntervalByTempo, scaleSpeedByTempo, stepTempoToward } from '../core/tempo.js';
import { buildGridEventKey, computeLatenessMs, computeScheduledAtSec, deriveForwardSpeedSignal, isAudioUnderrun, planForwardGridEvents } from '../core/predictivePlayback.js';
import { getLevelByOneBasedIndex, LEVELS } from '../data/levels.js';
import { resolveIntent } from '../core/input.js';
import { applyDamage, resolveEnemyCollision, updateFlyingEnemy, updatePatrolEnemy } from '../core/enemies.js';
const BEST_TIME_STORAGE_PREFIX = 'sambo.level';
const ENEMY_TIME_BONUS_MS = 200;
const BASE_PATROL_SPEED = 45;
const BASE_FLYING_SPEED_X = 90;
const BASE_FLYING_HOMING_RATE = 45;
const PLAYER_STEP_SUBDIVISIONS = 4;
const PLAYER_SPEED_MULTIPLIER = 2.2;
const PLAYER_SNAP_STEP_X = 16 * PLAYER_SPEED_MULTIPLIER;
const WORLD_GRID_STEP = 32;
const PLAYER_WIDTH = 12;
const PLAYER_HEIGHT = 19;
const PATROL_ENEMY_WIDTH = 15;
const PATROL_ENEMY_HEIGHT = 12;
const FLYING_ENEMY_WIDTH = 15;
const FLYING_ENEMY_HEIGHT = 10;
const PLAYER_CAMERA_ZOOM = 2;
const PLAYER_CAMERA_FOLLOW_OFFSET_Y = 50;
const VOICE_RETRIGGER_WINDOW_MS = 90;
const MIN_VOICE_HOLD_SEC = 0.03;
const FORWARD_IDLE_GRACE_MS = 300;
const AUDIO_UNDERRUN_THRESHOLD_MS = 30;
const AUDIO_EVENT_KEY_TTL_MS = 2400;
const BASE_JUMP_VELOCITY = -560;
const SPRING_JUMP_HEIGHT_MULTIPLIER = 2;
const SPRING_JUMP_VELOCITY = BASE_JUMP_VELOCITY * Math.sqrt(SPRING_JUMP_HEIGHT_MULTIPLIER);
const CONTROL_HINT_TEXT = 'A/D or Arrows: move | W/Space/Up: jump.';
const HUD_FONT = 'monospace';
const DEPTH_ENVIRONMENT = 2;
const DEPTH_ENEMY = 3;
const DEPTH_PLAYER = 4;
const DEPTH_MOON = 5;
const COLORS = {
    deepBackground: 0x05070f,
    midBackground: 0x0b0f1a,
    secondaryPlane: 0x121a2b,
    segmentFill: 0x2a3244,
    segmentBorder: 0x3a4663,
    player: 0xe8e6e3,
    hudText: '#d7e2ff',
    hudHearts: '#ff6b6b',
    beatSolidFill: 0xf4d35e,
    beatSolidBorder: 0xffb703,
    beatFadeFill: 0xee964b,
    beatFadeBorder: 0xf4d35e,
    alternateFill: 0xfb8500,
    alternateBorder: 0xffb703,
    ghostActiveFill: 0x4cc9f0,
    ghostActiveBorder: 0xcdefff,
    ghostInactiveFill: 0x121a2b,
    ghostInactiveBorder: 0x3a86ff,
    reverseGhostActiveFill: 0xb5179e,
    reverseGhostActiveBorder: 0xe056fd,
    reverseGhostInactiveFill: 0x3c0d3a,
    reverseGhostInactiveBorder: 0x5e1a57,
    elevatorFill: 0x3a86ff,
    elevatorBorder: 0x4cc9f0,
    springFill: 0x2dc653,
    springPulseFill: 0x52b788,
    springBorder: 0x95d5b2,
    patrolFill: 0xa4161a,
    patrolBorder: 0x660708,
    flyingFill: 0x9d0208,
    flyingBorder: 0xff4d6d,
    damageFlash: 0xff6b6b,
    moonLow: 0xb0b7c3,
    moonWarm: 0xf4d35e,
    moonCool: 0x4cc9f0
};
export class GameScene extends Phaser.Scene {
    metronome;
    mover;
    player;
    moon;
    moonHalo;
    infoText;
    debugText;
    scoreText;
    livesText;
    timerText;
    beatPlatforms = [];
    alternateBeatPlatforms = [];
    ghostPlatforms = [];
    reverseGhostPlatforms = [];
    elevatorPlatforms = [];
    shuttlePlatforms = [];
    crossPlatforms = [];
    springPlatforms = [];
    segmentPlatforms = [];
    darknessOverlay;
    gameOverBackdrop;
    gameOverText;
    gameOverDetailsText;
    restartButton;
    nextLevelButton;
    backToMenuButton;
    pauseBackdrop;
    pauseTitleText;
    continueButton;
    pauseBackToMenuButton;
    quitButton;
    endStateTitle = 'GAME OVER';
    patrolEnemies = [];
    flyingEnemies = [];
    lives = 5;
    isGameOver = false;
    isPaused = false;
    damageCooldownMs = 0;
    nextFlyingSpawnMs = 0;
    intensity = 1.0;
    currentDirection = 'idle';
    ghostPlatformLatchedSolid = false;
    reverseGhostPlatformLatchedSolid = true;
    cursors;
    keys;
    synth = null;
    worldWidth = 960;
    moonMaxWorldX = 820;
    playerStartX = 150;
    minEnemySpawnDistanceFromPlayerStart = 150;
    platformBlockHeight = 18;
    movementEpsilon = 0.01;
    intensityGainPerStep = 0.06;
    intensityLossPerStep = 0.08;
    coyoteJumpWindowMs = 120;
    groundY = 380;
    minPlayerX = 0;
    maxPlayerX = 0;
    gridColumns = 29;
    playerY = 380;
    verticalVelocity = 0;
    lastGroundedAtMs = 0;
    lastGroundedOnSpring = false;
    lastBeatInBar = null;
    lastElevatorOffsetSteps = 0;
    lastShuttleOffsetSteps = 0;
    lastCrossOffsetSteps = { x: 0, y: 1 };
    moonBeatPulse = 0;
    runStartMs = 0;
    elapsedAtEndMs = 0;
    bestTimeMs = null;
    enemyKills = 0;
    currentLevel = LEVELS[0];
    currentLevelName = 'level_1.runtime.json';
    currentLevelOneBasedIndex = 1;
    availableLevels = LEVELS;
    availableLevelNames = ['level_1.runtime.json'];
    isPreviewMode = false;
    masterVolume = 0.5;
    nextPreviewToggleMs = 0;
    nextPreviewJumpMs = 0;
    previewDirection = 'forward';
    patrolCount = 2;
    flyingSpawnIntervalMs = 3400;
    segmentEnemyPlans = [];
    useSegmentEnemySpawns = false;
    activeSegmentFlyingSpawnIntervalMs = 0;
    tempoMap = [{ startColumn: 0, bpm: DEFAULT_REFERENCE_BPM }];
    currentTempoZoneIndex = 0;
    currentBpm = DEFAULT_REFERENCE_BPM;
    targetBpm = DEFAULT_REFERENCE_BPM;
    tempoSmoothingBpmPerSecond = DEFAULT_TEMPO_SMOOTHING_BPM_PER_SECOND;
    pendingTempoChange = null;
    levelMidiCacheKey = null;
    midiTickModel = null;
    activeVoiceCounts = new Map();
    pendingNaturalNoteOffTimers = new Map();
    playheadTick = 0;
    previousPlayheadTick = 0;
    playheadX0 = 150;
    playheadX1 = 1054;
    tickPerUnit = 1;
    scrubThresholdTick = 240;
    scrubWasPaused = false;
    midiSelectedChannelCount = 0;
    activeVoices = new Map();
    masterGain = null;
    musicBusGain = null;
    metronomeBusGain = null;
    saturationNode = null;
    lastAppliedSaturationAmount = -1;
    audioQuality = resolveAudioQualitySettings('balanced');
    patrolSquashBaseScaleY = 0.93;
    patrolSquashAmplitude = 0.05;
    flyingStretchBaseScaleX = 1.03;
    flyingStretchAmplitude = 0.07;
    maxSimultaneousVoices = 4;
    idleVoiceReleaseAtMs = 0;
    lastMusicEventAtMs = 0;
    debugLastGridColumn = -1;
    debugLastDirection = 'idle';
    debugLastOnCount = 0;
    debugLastOffCount = 0;
    debugAudioMode = 'legacy';
    debugAudioDeClickStrict = false;
    debugShowPlaybackSpeedMetrics = true;
    debugExpectedBeatsPerSec = 0;
    debugActualBeatsPerSec = 0;
    debugPlaybackSpeedErrorPct = 0;
    debugLevelAlpha = 1;
    debugPlayerAlpha = 1;
    debugMoonAlpha = 1;
    debugMoonHaloAlpha = 1;
    debugDarknessAlpha = 0.82;
    forwardHoldMs = 0;
    avgForwardStepDurationMs = 0;
    queuedGridAudioEvents = [];
    queuedAudioEventKeys = new Set();
    predictionKeys = new Set();
    dispatchedAudioEventKeys = new Map();
    audioSchedulerTimer = null;
    audioLatenessAvgMs = 0;
    audioLatenessMaxMs = 0;
    audioLatenessSampleCount = 0;
    audioUnderrunCount = 0;
    audioSchedulerLookaheadMs = 20;
    audioSchedulerLeadMs = 12;
    constructor() {
        super('game');
    }
    preload() {
        this.resolveLevelFromInputs();
        this.queueLevelMidiLoad();
    }
    create() {
        this.resolveLevelFromInputs();
        this.applyLoadedMidiToLevelNotes();
        this.resetGameplayState();
        this.validateLevelDefinition();
        this.cameras.main.setBackgroundColor(COLORS.midBackground);
        this.cameras.main.setBounds(0, 0, this.worldWidth, 540);
        for (const platform of this.currentLevel.platforms) {
            if (platform.kind === 'segment') {
                const x = this.snapXToGrid(platform.x);
                const y = this.snapYToGrid(platform.y);
                const shape = this.add
                    .rectangle(x, y, this.snapLengthToGrid(platform.width), this.platformBlockHeight, COLORS.segmentFill, 0.9)
                    .setStrokeStyle(2, COLORS.segmentBorder, 0.9)
                    .setDepth(DEPTH_ENVIRONMENT);
                this.segmentPlatforms.push({ shape, solid: true });
            }
            else if (platform.kind === 'beat') {
                const beat = this.add
                    .rectangle(this.snapXToGrid(platform.x), this.snapYToGrid(platform.y), this.snapLengthToGrid(platform.width), this.platformBlockHeight, COLORS.beatFadeFill, 0.5)
                    .setStrokeStyle(2, COLORS.beatFadeBorder, 0.65)
                    .setDepth(DEPTH_ENVIRONMENT);
                this.beatPlatforms.push(beat);
            }
            else if (platform.kind === 'alternateBeat') {
                const alternateBeat = this.add
                    .rectangle(this.snapXToGrid(platform.x), this.snapYToGrid(platform.y), this.snapLengthToGrid(platform.width), this.platformBlockHeight, COLORS.alternateFill, 0.85)
                    .setStrokeStyle(2, COLORS.alternateBorder, 0.9)
                    .setDepth(DEPTH_ENVIRONMENT);
                this.alternateBeatPlatforms.push(alternateBeat);
            }
            else if (platform.kind === 'ghost') {
                const ghost = this.add
                    .rectangle(this.snapXToGrid(platform.x), this.snapYToGrid(platform.y), this.snapLengthToGrid(platform.width), this.platformBlockHeight, COLORS.ghostInactiveFill, 0.15)
                    .setStrokeStyle(2, COLORS.ghostInactiveBorder, 0.4)
                    .setDepth(DEPTH_ENVIRONMENT);
                this.ghostPlatforms.push(ghost);
            }
            else if (platform.kind === 'reverseGhost') {
                const reverseGhost = this.add
                    .rectangle(this.snapXToGrid(platform.x), this.snapYToGrid(platform.y), this.snapLengthToGrid(platform.width), this.platformBlockHeight, COLORS.reverseGhostActiveFill, 0.85)
                    .setStrokeStyle(2, COLORS.reverseGhostActiveBorder, 0.9)
                    .setDepth(DEPTH_ENVIRONMENT);
                this.reverseGhostPlatforms.push(reverseGhost);
            }
            else if (platform.kind === 'elevator') {
                const elevator = this.add
                    .rectangle(this.snapXToGrid(platform.x), this.snapYToGrid(platform.y), this.snapLengthToGrid(platform.width), this.platformBlockHeight, COLORS.elevatorFill, 0.9)
                    .setStrokeStyle(2, COLORS.elevatorBorder, 0.9)
                    .setDepth(DEPTH_ENVIRONMENT);
                this.elevatorPlatforms.push({ shape: elevator, baseY: elevator.y });
            }
            else if (platform.kind === 'shuttle') {
                const shuttle = this.add
                    .rectangle(this.snapXToGrid(platform.x), this.snapYToGrid(platform.y), this.snapLengthToGrid(platform.width), this.platformBlockHeight, COLORS.elevatorFill, 0.9)
                    .setStrokeStyle(2, COLORS.elevatorBorder, 0.9)
                    .setDepth(DEPTH_ENVIRONMENT);
                this.shuttlePlatforms.push({ shape: shuttle, baseX: shuttle.x });
            }
            else if (platform.kind === 'cross') {
                const cross = this.add
                    .rectangle(this.snapXToGrid(platform.x), this.snapYToGrid(platform.y), this.snapLengthToGrid(platform.width), this.platformBlockHeight, COLORS.elevatorFill, 0.9)
                    .setStrokeStyle(2, COLORS.elevatorBorder, 0.9)
                    .setDepth(DEPTH_ENVIRONMENT);
                this.crossPlatforms.push({ shape: cross, baseX: cross.x, baseY: cross.y });
            }
            else if (platform.kind === 'spring') {
                const spring = this.add
                    .rectangle(this.snapXToGrid(platform.x), this.snapYToGrid(platform.y), this.snapLengthToGrid(platform.width), this.platformBlockHeight, COLORS.springFill, 0.9)
                    .setStrokeStyle(2, COLORS.springBorder, 0.9)
                    .setDepth(DEPTH_ENVIRONMENT);
                this.springPlatforms.push(spring);
            }
        }
        const initialNow = performance.now();
        this.syncElevatorPlatforms(initialNow);
        this.syncShuttlePlatforms(initialNow);
        this.syncCrossPlatforms(initialNow);
        this.playerY = this.getInitialPlayerYFromPlatforms();
        this.player = this.add.rectangle(150, this.playerY, PLAYER_WIDTH, PLAYER_HEIGHT, COLORS.player, 1).setDepth(DEPTH_PLAYER);
        this.cameras.main.setZoom(PLAYER_CAMERA_ZOOM);
        this.cameras.main.startFollow(this.player, false, 0.12, 0.12, 0, PLAYER_CAMERA_FOLLOW_OFFSET_Y);
        this.initializeGridBounds();
        this.moonHalo = this.add.circle(this.moonMaxWorldX, 90, 72, COLORS.moonLow, 0.12).setDepth(DEPTH_MOON - 1);
        this.moon = this.add.circle(this.moonMaxWorldX, 90, 42, COLORS.moonLow, 0.32).setDepth(DEPTH_MOON);
        this.buildSegmentEnemyPlans();
        this.spawnPatrolEnemiesFromLevel();
        this.livesText = this.add.text(20, 14, '', {
            color: COLORS.hudHearts,
            fontFamily: HUD_FONT,
            fontSize: '18px'
        });
        this.timerText = this.add
            .text(this.scale.width * 0.5, 14, '', {
            color: COLORS.hudText,
            fontFamily: HUD_FONT,
            fontSize: '20px'
        })
            .setOrigin(0.5, 0);
        this.infoText = this.add.text(20, 44, '', {
            color: COLORS.hudText,
            fontFamily: HUD_FONT,
            fontSize: '16px'
        });
        this.debugText = this.add
            .text(this.scale.width - 20, 14, '', {
            color: '#9db6de',
            fontFamily: HUD_FONT,
            fontSize: '14px',
            align: 'right'
        })
            .setOrigin(1, 0);
        this.scoreText = this.add
            .text(480, 520, '0', {
            color: COLORS.hudText,
            fontFamily: HUD_FONT,
            fontSize: '24px'
        })
            .setOrigin(0.5, 1);
        this.darknessOverlay = this.add
            .rectangle(480, 270, 960, 540, COLORS.deepBackground, 0.82)
            .setDepth(10)
            .setScrollFactor(0);
        this.livesText.setDepth(11);
        this.timerText.setDepth(11);
        this.infoText.setDepth(11);
        this.debugText.setDepth(11);
        this.scoreText.setDepth(11);
        this.configureScreenUi(this.darknessOverlay);
        this.configureScreenUi(this.livesText);
        this.configureScreenUi(this.timerText);
        this.configureScreenUi(this.infoText);
        this.configureScreenUi(this.debugText);
        this.configureScreenUi(this.scoreText);
        this.cursors = this.input.keyboard.createCursorKeys();
        this.keys = this.input.keyboard.addKeys('W,A,S,D,SPACE,UP,LEFT,RIGHT,ESC,F9,F10');
        const openingSpawnInterval = this.flyingSpawnIntervalMs > 0 ? this.scaleSpawnIntervalMs(this.flyingSpawnIntervalMs, this.currentBpm) : 1800;
        this.nextFlyingSpawnMs = performance.now() + Math.max(900, openingSpawnInterval * 0.5);
        this.nextPreviewToggleMs = performance.now() + 1200;
        this.nextPreviewJumpMs = performance.now() + 1600;
        this.runStartMs = performance.now();
        this.bestTimeMs = this.loadBestTimeMs();
        this.updateLivesLabel();
        this.updateScoreLabel();
        this.updateTimerLabel(this.runStartMs);
        this.createGameOverUI();
        this.createPauseUI();
        this.startAudioScheduler();
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.stopAudioScheduler());
        this.events.once(Phaser.Scenes.Events.DESTROY, () => this.stopAudioScheduler());
    }
    update(_time, delta) {
        if (Phaser.Input.Keyboard.JustDown(this.keys.F9)) {
            this.debugAudioDeClickStrict = !this.debugAudioDeClickStrict;
        }
        if (Phaser.Input.Keyboard.JustDown(this.keys.F10)) {
            this.debugShowPlaybackSpeedMetrics = !this.debugShowPlaybackSpeedMetrics;
        }
        if (!this.isPreviewMode && !this.isGameOver) {
            const escPressed = Phaser.Input.Keyboard.JustDown(this.keys.ESC);
            if (escPressed) {
                if (this.isPaused)
                    this.resumeFromPause();
                else
                    this.pauseGameplay();
            }
        }
        if (this.isPaused)
            return;
        if (this.isGameOver)
            return;
        const now = performance.now();
        const deltaSeconds = delta / 1000;
        this.updateTempoFromPlayerPosition(now, deltaSeconds);
        this.updateTimerLabel(now);
        let intent;
        if (this.isPreviewMode) {
            intent = this.getPreviewIntent(now);
        }
        else {
            const jumpPressed = Phaser.Input.Keyboard.JustDown(this.keys.SPACE) ||
                Phaser.Input.Keyboard.JustDown(this.keys.W) ||
                Phaser.Input.Keyboard.JustDown(this.keys.UP);
            intent = resolveIntent({
                left: this.keys.A.isDown || this.keys.LEFT.isDown || this.cursors.left.isDown,
                right: this.keys.D.isDown || this.keys.RIGHT.isDown || this.cursors.right.isDown,
                jumpPressed
            });
        }
        const canQueueStep = intent.direction !== 'idle' &&
            this.mover.queuedCount === 0 &&
            !this.mover.currentStep;
        if (canQueueStep) {
            this.mover.enqueue(intent.direction);
        }
        const stepBeforeMovement = this.mover.currentStep;
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
        this.updatePlaybackSpeedDebugMetrics(deltaSeconds, movedX);
        if (movedX > this.movementEpsilon)
            this.currentDirection = 'forward';
        else if (movedX < -this.movementEpsilon)
            this.currentDirection = 'backward';
        else if (this.mover.currentStep)
            this.currentDirection = this.mover.currentStep.direction;
        else
            this.currentDirection = 'idle';
        if (intent.direction === 'forward')
            this.forwardHoldMs += delta;
        else
            this.forwardHoldMs = 0;
        if (!this.mover.currentStep && intent.direction === 'idle') {
            if (this.idleVoiceReleaseAtMs <= 0)
                this.idleVoiceReleaseAtMs = now + FORWARD_IDLE_GRACE_MS;
            const longEnoughIdle = now >= this.idleVoiceReleaseAtMs;
            if (longEnoughIdle) {
                this.purgeForwardPredictionEvents();
                if (!this.midiTickModel && this.activeVoices.size > 0 && now - this.lastMusicEventAtMs >= 80)
                    this.releaseAllVoices();
            }
        }
        else {
            this.idleVoiceReleaseAtMs = 0;
        }
        if (this.midiTickModel) {
            this.clearQueuedAudioEvents();
            this.updateMidiTickPlayback();
        }
        else {
            if (movement.arrived) {
                const previousGridIndex = this.getGridIndexFromX(previousPlayerX);
                const gridIndex = this.getGridIndexFromX(this.player.x);
                if (gridIndex !== previousGridIndex) {
                    const targetTimeMs = movement.direction === 'forward' && stepBeforeMovement?.direction === 'forward'
                        ? stepBeforeMovement.arrivalTime
                        : now;
                    const eventKey = buildGridEventKey(movement.direction, gridIndex, targetTimeMs);
                    this.enqueueGridAudioEvent({
                        gridIndex,
                        direction: movement.direction,
                        targetTimeMs,
                        source: 'arrival',
                        eventKey
                    });
                    if (movement.direction === 'forward' && stepBeforeMovement?.direction === 'forward') {
                        this.rememberForwardStepDuration(stepBeforeMovement.arrivalTime - stepBeforeMovement.startTime);
                    }
                }
            }
            if (intent.direction === 'backward') {
                this.purgeForwardPredictionEvents();
            }
            else if (intent.direction === 'forward') {
                this.queueForwardPredictedEvents(now);
            }
        }
        if (movedX < -this.movementEpsilon)
            this.ghostPlatformLatchedSolid = true;
        else if (movedX > this.movementEpsilon)
            this.ghostPlatformLatchedSolid = false;
        if (movedX < -this.movementEpsilon)
            this.reverseGhostPlatformLatchedSolid = false;
        else if (movedX > this.movementEpsilon)
            this.reverseGhostPlatformLatchedSolid = true;
        const beatInBar = this.metronome.beatInBarAt(now);
        const beatState = getBeatPlatformState(beatInBar);
        const alternateBeatSolid = isAlternateBeatPlatformSolid(beatInBar);
        this.handleBeatPulse(beatInBar);
        const wasStandingOnElevator = this.isStandingOnAnyElevator();
        const wasStandingOnShuttle = this.isStandingOnAnyShuttle();
        const wasStandingOnCross = this.isStandingOnAnyCross();
        const elevatorDeltaY = this.syncElevatorPlatforms(now);
        const shuttleDeltaX = this.syncShuttlePlatforms(now);
        const crossDelta = this.syncCrossPlatforms(now);
        let carriedX = 0;
        let carriedY = 0;
        if (wasStandingOnElevator)
            carriedY += elevatorDeltaY;
        if (wasStandingOnShuttle)
            carriedX += shuttleDeltaX;
        if (wasStandingOnCross) {
            carriedX += crossDelta.deltaX;
            carriedY += crossDelta.deltaY;
        }
        if (carriedX !== 0 || carriedY !== 0) {
            this.player.x = Phaser.Math.Clamp(this.player.x + carriedX, this.minPlayerX, this.maxPlayerX);
            this.mover.stopAt(this.player.x - this.playerStartX);
            this.playerY += carriedY;
            this.player.y = this.playerY;
            if (carriedY !== 0) {
                this.verticalVelocity = Math.min(0, this.verticalVelocity);
            }
        }
        const beatSolid = beatState !== 'gone';
        const ghostSolid = this.ghostPlatformLatchedSolid;
        const reverseGhostSolid = this.reverseGhostPlatformLatchedSolid;
        const groundedBeforeJump = this.isPlayerGrounded(beatSolid, alternateBeatSolid, ghostSolid, reverseGhostSolid, true);
        if (groundedBeforeJump) {
            this.lastGroundedAtMs = now;
            this.lastGroundedOnSpring = this.isStandingOnAnySpring();
        }
        const canUseCoyoteJump = now - this.lastGroundedAtMs <= this.coyoteJumpWindowMs;
        if (intent.jump && (groundedBeforeJump || canUseCoyoteJump)) {
            const jumpFromSpring = groundedBeforeJump ? this.isStandingOnAnySpring() : this.lastGroundedOnSpring;
            this.verticalVelocity = jumpFromSpring ? SPRING_JUMP_VELOCITY : BASE_JUMP_VELOCITY;
        }
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
        this.applyBeatPlatformVisual(beatState, now);
        this.applyAlternateBeatPlatformVisual(alternateBeatSolid);
        this.applyMobilePlatformVisual();
        this.applySpringPlatformVisual(now);
        for (const ghostPlatform of this.ghostPlatforms) {
            if (ghostSolid) {
                ghostPlatform.setFillStyle(COLORS.ghostActiveFill, 0.85);
                ghostPlatform.setStrokeStyle(2, COLORS.ghostActiveBorder, 0.95);
                ghostPlatform.setAlpha(0.85);
            }
            else {
                ghostPlatform.setFillStyle(COLORS.ghostInactiveFill, 0.2);
                ghostPlatform.setStrokeStyle(2, COLORS.ghostInactiveBorder, 0.4);
                ghostPlatform.setAlpha(0.15);
            }
        }
        for (const reverseGhostPlatform of this.reverseGhostPlatforms) {
            if (reverseGhostSolid) {
                reverseGhostPlatform.setFillStyle(COLORS.reverseGhostActiveFill, 0.85);
                reverseGhostPlatform.setStrokeStyle(2, COLORS.reverseGhostActiveBorder, 0.92);
                reverseGhostPlatform.setAlpha(0.85);
            }
            else {
                reverseGhostPlatform.setFillStyle(COLORS.reverseGhostInactiveFill, 0.25);
                reverseGhostPlatform.setStrokeStyle(1, COLORS.reverseGhostInactiveBorder, 0.5);
                reverseGhostPlatform.setAlpha(0.15);
            }
        }
        this.applyWorldVisibilityClamp();
        this.infoText.setText(CONTROL_HINT_TEXT);
        this.updateDebugOverlay();
    }
    resolveSpawnSafeX(x, minX, maxX) {
        const safeLeft = this.playerStartX - this.minEnemySpawnDistanceFromPlayerStart;
        const safeRight = this.playerStartX + this.minEnemySpawnDistanceFromPlayerStart;
        const clampedX = Phaser.Math.Clamp(x, minX, maxX);
        if (clampedX <= safeLeft || clampedX >= safeRight)
            return clampedX;
        const canUseLeft = safeLeft >= minX;
        const canUseRight = safeRight <= maxX;
        if (canUseLeft && canUseRight) {
            return clampedX < this.playerStartX ? safeLeft : safeRight;
        }
        if (canUseRight)
            return safeRight;
        if (canUseLeft)
            return safeLeft;
        return null;
    }
    spawnPatrolEnemy(x, y, minX, maxX) {
        const safeX = this.resolveSpawnSafeX(x, minX, maxX);
        if (safeX === null)
            return;
        const deoverlappedX = this.resolvePatrolSpawnX(safeX, y, minX, maxX);
        if (deoverlappedX === null)
            return;
        const sprite = this.add
            .rectangle(deoverlappedX, y, PATROL_ENEMY_WIDTH, PATROL_ENEMY_HEIGHT, COLORS.patrolFill, 0.95)
            .setStrokeStyle(2, COLORS.patrolBorder, 0.9)
            .setDepth(DEPTH_ENEMY);
        this.patrolEnemies.push({
            sprite,
            alive: true,
            baseSpeed: BASE_PATROL_SPEED,
            state: {
                x: deoverlappedX,
                speed: this.scaleEnemySpeed(BASE_PATROL_SPEED, this.currentBpm),
                direction: 1,
                minX,
                maxX
            }
        });
    }
    resolvePatrolSpawnX(preferredX, y, minX, maxX) {
        const spacing = Math.max(8, Math.round(PATROL_ENEMY_WIDTH + 2));
        const sameLaneTolerance = Math.max(4, Math.round(PATROL_ENEMY_HEIGHT * 0.6));
        const sameLaneEnemies = this.patrolEnemies.filter((enemy) => enemy.alive && Math.abs(enemy.sprite.y - y) <= sameLaneTolerance);
        if (sameLaneEnemies.length === 0)
            return Phaser.Math.Clamp(preferredX, minX, maxX);
        const collides = (candidateX) => sameLaneEnemies.some((enemy) => Math.abs(enemy.sprite.x - candidateX) < spacing);
        const firstChoice = Phaser.Math.Clamp(preferredX, minX, maxX);
        if (!collides(firstChoice))
            return firstChoice;
        for (let step = 1; step <= 16; step++) {
            const distance = step * spacing;
            const candidates = [
                Phaser.Math.Clamp(preferredX + distance, minX, maxX),
                Phaser.Math.Clamp(preferredX - distance, minX, maxX)
            ];
            for (const candidate of candidates) {
                if (!collides(candidate))
                    return candidate;
            }
        }
        return null;
    }
    spawnFlyingEnemy() {
        const y = Phaser.Math.Between(160, 330);
        const x = this.worldWidth + 32;
        this.spawnFlyingEnemyAt(x, y);
    }
    spawnFlyingEnemyAt(x, y) {
        const minX = -80;
        const maxX = this.worldWidth + 80;
        const safeX = this.resolveSpawnSafeX(x, minX, maxX);
        if (safeX === null)
            return;
        const sprite = this.add
            .rectangle(safeX, y, FLYING_ENEMY_WIDTH, FLYING_ENEMY_HEIGHT, COLORS.flyingFill, 0.95)
            .setStrokeStyle(2, COLORS.flyingBorder, 0.85)
            .setDepth(DEPTH_ENEMY);
        this.flyingEnemies.push({
            sprite,
            alive: true,
            baseSpeedX: BASE_FLYING_SPEED_X,
            baseHomingRate: BASE_FLYING_HOMING_RATE,
            state: {
                x: safeX,
                y,
                speedX: this.scaleEnemySpeed(BASE_FLYING_SPEED_X, this.currentBpm),
                homingRate: this.scaleEnemySpeed(BASE_FLYING_HOMING_RATE, this.currentBpm),
                active: true
            }
        });
    }
    updatePatrolEnemies(deltaSeconds) {
        const nowSeconds = this.time.now / 1000;
        for (const enemy of this.patrolEnemies) {
            if (!enemy.alive)
                continue;
            enemy.state.speed = this.scaleEnemySpeed(enemy.baseSpeed, this.currentBpm);
            enemy.state = updatePatrolEnemy(enemy.state, deltaSeconds);
            enemy.sprite.x = enemy.state.x;
            const fill = enemy.state.direction < 0 ? 0xc1121f : COLORS.patrolFill;
            enemy.sprite.setFillStyle(fill, 0.95);
            enemy.sprite.setStrokeStyle(2, COLORS.patrolBorder, 0.9);
            const squashPhase = nowSeconds * 8 + enemy.state.x * 0.05;
            const squashWave = (Math.sin(squashPhase) + 1) / 2;
            const scaleY = this.patrolSquashBaseScaleY + squashWave * this.patrolSquashAmplitude;
            enemy.sprite.setScale(1, scaleY);
        }
    }
    updateFlyingEnemies(nowMs, deltaSeconds) {
        this.processSegmentFlyingSpawnQueue(nowMs);
        const nowSeconds = nowMs / 1000;
        for (const enemy of this.flyingEnemies) {
            if (!enemy.alive)
                continue;
            enemy.state.speedX = this.scaleEnemySpeed(enemy.baseSpeedX, this.currentBpm);
            enemy.state.homingRate = this.scaleEnemySpeed(enemy.baseHomingRate, this.currentBpm);
            enemy.state = updateFlyingEnemy(enemy.state, this.player.y, deltaSeconds, -40);
            enemy.sprite.x = enemy.state.x;
            enemy.sprite.y = enemy.state.y;
            const stretchPhase = nowSeconds * 6 + enemy.state.y * 0.06;
            const stretchWave = (Math.sin(stretchPhase) + 1) / 2;
            const scaleX = this.flyingStretchBaseScaleX + stretchWave * this.flyingStretchAmplitude;
            enemy.sprite.setScale(scaleX, 1);
            enemy.sprite.setStrokeStyle(2, COLORS.flyingBorder, 0.78 + stretchWave * 0.15);
            if (!enemy.state.active) {
                enemy.alive = false;
                enemy.sprite.destroy();
            }
        }
    }
    handleEnemyCollisions(nowMs) {
        const playerRect = {
            x: this.player.x - this.player.width / 2,
            y: this.player.y - this.player.height / 2,
            width: this.player.width,
            height: this.player.height
        };
        const allEnemies = [
            ...this.patrolEnemies.map((e) => ({ type: 'patrol', enemy: e })),
            ...this.flyingEnemies.map((e) => ({ type: 'flying', enemy: e }))
        ];
        for (const entry of allEnemies) {
            const enemy = entry.enemy;
            if (!enemy.alive)
                continue;
            const enemyRect = {
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
                    enemy.sprite.setFillStyle(0x3a4663, 0.45);
                    enemy.sprite.setStrokeStyle(1, 0x2a3244, 0.4);
                    enemy.sprite.setScale(1, 0.45);
                }
                else {
                    enemy.sprite.destroy();
                }
                this.verticalVelocity = -420;
                continue;
            }
            if (collision.damage && nowMs >= this.damageCooldownMs) {
                if (this.isPreviewMode)
                    continue;
                this.lives = applyDamage(this.lives, 1);
                this.damageCooldownMs = nowMs + 850;
                this.player.setFillStyle(COLORS.damageFlash, 1);
                this.time.delayedCall(220, () => this.player.setFillStyle(COLORS.player, 1));
                this.updateLivesLabel();
                if (this.lives === 0) {
                    this.triggerGameOver();
                    return;
                }
            }
        }
    }
    processSegmentFlyingSpawnQueue(nowMs) {
        if (!this.useSegmentEnemySpawns || this.segmentEnemyPlans.length === 0)
            return;
        for (const plan of this.segmentEnemyPlans) {
            if (!plan.triggered || plan.pendingFlyingSpawns <= 0)
                continue;
            if (nowMs < plan.nextFlyingSpawnMs)
                continue;
            const laneLeft = Math.max(120, plan.leftX + 14);
            const laneRight = Math.min(this.worldWidth - 120, plan.rightX - 14);
            const midX = (laneLeft + laneRight) * 0.5;
            const offset = 70 + (plan.flyingCount - plan.pendingFlyingSpawns) * 28;
            const cameraRightEdge = this.cameras.main.worldView.right;
            const offscreenRightX = cameraRightEdge + 48;
            const spawnX = Math.max(offscreenRightX, Math.max(midX + 20, plan.rightX + offset));
            const spawnY = Phaser.Math.Between(160, 330);
            this.spawnFlyingEnemyAt(spawnX, spawnY);
            plan.pendingFlyingSpawns -= 1;
            const planBpm = this.getBpmForWorldX(plan.triggerX);
            const spacing = plan.flyingSpawnIntervalMs > 0
                ? Math.max(250, this.scaleSpawnIntervalMs(plan.flyingSpawnIntervalMs, planBpm))
                : Math.max(250, this.scaleSpawnIntervalMs(1200, planBpm));
            plan.nextFlyingSpawnMs = nowMs + spacing;
        }
    }
    updateLivesLabel() {
        const hearts = Array.from({ length: 5 }, (_, i) => (i < this.lives ? '❤' : '·')).join(' ');
        this.livesText.setText(`Lives: ${hearts} (${this.lives}/5)`);
    }
    updateScoreLabel() {
        if (!this.scoreText)
            return;
        const kills = this.getEnemyKillCount();
        const bonusSeconds = this.getEnemyTimeBonusMs() / 1000;
        this.scoreText.setText(`${kills} (-${bonusSeconds.toFixed(1)}s)`);
    }
    updateDebugOverlay() {
        if (!this.debugText)
            return;
        const modeLabel = this.debugAudioMode === 'midi' ? 'MIDI Tick' : 'Legacy';
        const channels = this.midiSelectedChannelCount;
        const voices = this.activeVoices.size;
        const stepState = this.mover.currentStep ? 'moving' : 'idle';
        const speedMetrics = this.debugShowPlaybackSpeedMetrics
            ? `Playback Speed: expected=${this.debugExpectedBeatsPerSec.toFixed(3)} beats/s actual=${this.debugActualBeatsPerSec.toFixed(3)} beats/s err=${this.debugPlaybackSpeedErrorPct.toFixed(1)}% (F10 hide)`
            : 'Playback Speed: hidden (F10 show)';
        this.debugText.setText([
            `Debug Audio: ${modeLabel} | profile=${this.audioQuality.mode} | channels=${channels} | deClick=${this.debugAudioDeClickStrict ? 'strict' : 'normal'} (F9)`,
            `Tempo: bpm=${this.currentBpm.toFixed(1)} target=${this.targetBpm.toFixed(1)} rate=${this.tempoSmoothingBpmPerSecond}/s zone=${this.currentTempoZoneIndex}${this.pendingTempoChange ? ' (pending)' : ''}`,
            speedMetrics,
            `Scheduler: q=${this.queuedGridAudioEvents.length} predQ=${this.predictionKeys.size} late=${this.audioLatenessAvgMs.toFixed(1)}ms max=${this.audioLatenessMaxMs.toFixed(1)}ms underrun=${this.audioUnderrunCount}`,
            `Grid: col=${this.debugLastGridColumn} dir=${this.debugLastDirection} step=${stepState} tick=${Math.round(this.playheadTick)}`,
            `Events: on=${this.debugLastOnCount} off=${this.debugLastOffCount} voices=${voices}`,
            `Alpha: level=${this.debugLevelAlpha.toFixed(2)} player=${this.debugPlayerAlpha.toFixed(2)} moon=${this.debugMoonAlpha.toFixed(2)} halo=${this.debugMoonHaloAlpha.toFixed(2)} dark=${this.debugDarknessAlpha.toFixed(2)}`
        ].join('\n'));
    }
    updatePlaybackSpeedDebugMetrics(deltaSeconds, movedX) {
        if (!this.midiTickModel || deltaSeconds <= 0) {
            this.debugExpectedBeatsPerSec = 0;
            this.debugActualBeatsPerSec = 0;
            this.debugPlaybackSpeedErrorPct = 0;
            return;
        }
        const ppq = Math.max(1, this.midiTickModel.ppq);
        const tickNow = this.getTickFromWorldX(this.player.x);
        const expectedBeatsPerSec = this.getBpmAtTick(tickNow) / 60;
        const actualBeatsPerSec = Math.abs((movedX * this.tickPerUnit) / ppq) / deltaSeconds;
        const smoothed = Phaser.Math.Linear(this.debugActualBeatsPerSec, actualBeatsPerSec, 0.22);
        this.debugExpectedBeatsPerSec = expectedBeatsPerSec;
        this.debugActualBeatsPerSec = smoothed;
        const denom = Math.max(0.0001, expectedBeatsPerSec);
        this.debugPlaybackSpeedErrorPct = (Math.abs(smoothed - expectedBeatsPerSec) / denom) * 100;
    }
    applyBeatPlatformVisual(state, nowMs) {
        if (this.beatPlatforms.length === 0)
            return;
        const beatIntervalMs = this.metronome.beatIntervalMs;
        const timeIntoBeat = this.metronome.beatProgressAt(nowMs) * beatIntervalMs;
        const nearTransition = timeIntoBeat >= beatIntervalMs - 100;
        if (state === 'solid') {
            for (const beatPlatform of this.beatPlatforms) {
                beatPlatform.setFillStyle(COLORS.beatSolidFill, 1);
                beatPlatform.setStrokeStyle(2, COLORS.beatSolidBorder, nearTransition ? 1 : 0.9);
                beatPlatform.setAlpha(1);
            }
        }
        else if (state === 'fadeOut') {
            for (const beatPlatform of this.beatPlatforms) {
                beatPlatform.setFillStyle(COLORS.beatFadeFill, 0.7);
                beatPlatform.setStrokeStyle(2, COLORS.beatFadeBorder, nearTransition ? 0.85 : 0.7);
                beatPlatform.setAlpha(0.5);
            }
        }
        else if (state === 'gone') {
            for (const beatPlatform of this.beatPlatforms) {
                beatPlatform.setFillStyle(COLORS.secondaryPlane, 0.05);
                beatPlatform.setStrokeStyle(1, COLORS.deepBackground, 0.05);
                beatPlatform.setAlpha(0.05);
            }
        }
        else {
            for (const beatPlatform of this.beatPlatforms) {
                beatPlatform.setFillStyle(COLORS.beatFadeFill, 0.7);
                beatPlatform.setStrokeStyle(2, COLORS.beatFadeBorder, nearTransition ? 0.85 : 0.7);
                beatPlatform.setAlpha(0.5);
            }
        }
    }
    applyAlternateBeatPlatformVisual(solid) {
        if (this.alternateBeatPlatforms.length === 0)
            return;
        if (solid) {
            for (const alternateBeatPlatform of this.alternateBeatPlatforms) {
                alternateBeatPlatform.setFillStyle(COLORS.alternateFill, 0.95);
                alternateBeatPlatform.setStrokeStyle(2, COLORS.alternateBorder, 0.9);
                alternateBeatPlatform.setAlpha(1);
            }
        }
        else {
            for (const alternateBeatPlatform of this.alternateBeatPlatforms) {
                alternateBeatPlatform.setFillStyle(0x4a2a0a, 0.35);
                alternateBeatPlatform.setStrokeStyle(1, COLORS.alternateBorder, 0.35);
                alternateBeatPlatform.setAlpha(0.25);
            }
        }
    }
    applySpringPlatformVisual(nowMs) {
        if (this.springPlatforms.length === 0)
            return;
        const pulse = (Math.sin(nowMs / 180) + 1) * 0.5;
        const fill = pulse > 0.58 ? COLORS.springPulseFill : COLORS.springFill;
        const fillAlpha = 0.72 + pulse * 0.24;
        const borderAlpha = 0.78 + pulse * 0.2;
        for (const springPlatform of this.springPlatforms) {
            springPlatform.setFillStyle(fill, fillAlpha);
            springPlatform.setStrokeStyle(2, COLORS.springBorder, borderAlpha);
            springPlatform.setAlpha(0.84 + pulse * 0.12);
        }
    }
    applyMobilePlatformVisual() {
        if (this.elevatorPlatforms.length + this.shuttlePlatforms.length + this.crossPlatforms.length === 0)
            return;
        const movingUp = this.lastElevatorOffsetSteps > 0 && this.lastElevatorOffsetSteps < 4;
        const movingDown = this.lastElevatorOffsetSteps > 0 && !movingUp;
        const shuttleMoving = this.lastShuttleOffsetSteps > 0 && this.lastShuttleOffsetSteps < 4;
        const crossMovingVertical = this.lastCrossOffsetSteps.y !== 0;
        const crossMovingHorizontal = this.lastCrossOffsetSteps.x !== 0;
        const applyStyle = (shape, mode) => {
            if (mode === 'up') {
                shape.setFillStyle(COLORS.elevatorFill, 0.95);
                shape.setStrokeStyle(2, COLORS.elevatorBorder, 0.98);
            }
            else if (mode === 'down') {
                shape.setFillStyle(0x2f6fd3, 0.9);
                shape.setStrokeStyle(2, COLORS.elevatorBorder, 0.9);
            }
            else if (mode === 'side') {
                shape.setFillStyle(0x347be8, 0.92);
                shape.setStrokeStyle(2, COLORS.elevatorBorder, 0.95);
            }
            else {
                shape.setFillStyle(0x285fb7, 0.86);
                shape.setStrokeStyle(2, COLORS.elevatorBorder, 0.78);
            }
            shape.setAlpha(0.92);
        };
        for (const elevatorPlatform of this.elevatorPlatforms) {
            if (movingUp) {
                applyStyle(elevatorPlatform.shape, 'up');
            }
            else if (movingDown) {
                applyStyle(elevatorPlatform.shape, 'down');
            }
            else {
                applyStyle(elevatorPlatform.shape, 'idle');
            }
        }
        for (const shuttlePlatform of this.shuttlePlatforms) {
            applyStyle(shuttlePlatform.shape, shuttleMoving ? 'side' : 'idle');
        }
        for (const crossPlatform of this.crossPlatforms) {
            if (crossMovingVertical) {
                applyStyle(crossPlatform.shape, this.lastCrossOffsetSteps.y < 0 ? 'up' : 'down');
            }
            else if (crossMovingHorizontal) {
                applyStyle(crossPlatform.shape, 'side');
            }
            else {
                applyStyle(crossPlatform.shape, 'idle');
            }
        }
    }
    syncElevatorPlatforms(nowMs) {
        if (this.elevatorPlatforms.length === 0)
            return 0;
        const beatIndex = this.metronome.beatIndexAt(nowMs);
        const offsetSteps = getElevatorOffsetSteps(beatIndex);
        const deltaSteps = offsetSteps - this.lastElevatorOffsetSteps;
        const stepSize = WORLD_GRID_STEP;
        for (const elevatorPlatform of this.elevatorPlatforms) {
            elevatorPlatform.shape.y = elevatorPlatform.baseY - offsetSteps * stepSize;
        }
        this.lastElevatorOffsetSteps = offsetSteps;
        return -deltaSteps * stepSize;
    }
    syncShuttlePlatforms(nowMs) {
        if (this.shuttlePlatforms.length === 0)
            return 0;
        const beatIndex = this.metronome.beatIndexAt(nowMs);
        const offsetSteps = getShuttleOffsetSteps(beatIndex);
        const deltaSteps = offsetSteps - this.lastShuttleOffsetSteps;
        const stepSize = this.getPlatformGridStepX();
        for (const shuttlePlatform of this.shuttlePlatforms) {
            shuttlePlatform.shape.x = shuttlePlatform.baseX + offsetSteps * stepSize;
        }
        this.lastShuttleOffsetSteps = offsetSteps;
        return deltaSteps * stepSize;
    }
    syncCrossPlatforms(nowMs) {
        if (this.crossPlatforms.length === 0)
            return { deltaX: 0, deltaY: 0 };
        const beatIndex = this.metronome.beatIndexAt(nowMs);
        const offsetSteps = getCrossOffsetSteps(beatIndex);
        const deltaXSteps = offsetSteps.x - this.lastCrossOffsetSteps.x;
        const deltaYSteps = offsetSteps.y - this.lastCrossOffsetSteps.y;
        const stepSizeX = this.getPlatformGridStepX();
        const stepSizeY = WORLD_GRID_STEP;
        for (const crossPlatform of this.crossPlatforms) {
            crossPlatform.shape.x = crossPlatform.baseX + offsetSteps.x * stepSizeX;
            crossPlatform.shape.y = crossPlatform.baseY + offsetSteps.y * stepSizeY;
        }
        this.lastCrossOffsetSteps = offsetSteps;
        return { deltaX: deltaXSteps * stepSizeX, deltaY: deltaYSteps * stepSizeY };
    }
    getPlatformGridStepX() {
        return WORLD_GRID_STEP * 2;
    }
    snapLengthToGrid(length) {
        void length;
        return WORLD_GRID_STEP * 2;
    }
    snapXToGrid(x) {
        const step = WORLD_GRID_STEP;
        const snappedSteps = Math.round((x - this.playerStartX) / step);
        return this.playerStartX + snappedSteps * step;
    }
    snapYToGrid(y) {
        const step = WORLD_GRID_STEP;
        return Math.round(y / step) * step;
    }
    getGridIndexFromX(playerX) {
        const step = WORLD_GRID_STEP;
        const relative = Math.round((playerX - this.minPlayerX) / step);
        return Phaser.Math.Clamp(relative, 0, this.gridColumns - 1);
    }
    resolveGridColumnsFromLevel() {
        const explicit = Number(this.currentLevel.gridColumns);
        if (Number.isFinite(explicit) && explicit > 0) {
            return Phaser.Math.Clamp(Math.floor(explicit), 1, 4096);
        }
        const maxPlatformRight = this.currentLevel.platforms.reduce((max, platform) => Math.max(max, platform.x + platform.width / 2), 0);
        if (maxPlatformRight > this.playerStartX) {
            const inferred = Math.round((maxPlatformRight - this.playerStartX) / WORLD_GRID_STEP) + 1;
            return Phaser.Math.Clamp(inferred, 1, 4096);
        }
        return 29;
    }
    coerceLevelMidiPlayback(raw) {
        return normalizeMidiTickModel(raw, {
            fallbackBpm: DEFAULT_REFERENCE_BPM,
            fallbackPpq: 480
        });
    }
    configurePlayheadMapping() {
        if (!this.midiTickModel)
            return;
        const midiPlayback = this.currentLevel.midiPlayback;
        const fallbackX0 = this.playerStartX;
        const fallbackX1 = this.playerStartX + WORLD_GRID_STEP * Math.max(1, this.gridColumns - 1);
        const x0Candidate = Number(midiPlayback?.x0);
        const x1Candidate = Number(midiPlayback?.x1);
        const x0 = Number.isFinite(x0Candidate) ? x0Candidate : fallbackX0;
        const x1 = Number.isFinite(x1Candidate) && x1Candidate > x0 ? x1Candidate : Math.max(x0 + 1, fallbackX1);
        this.playheadX0 = x0;
        this.playheadX1 = x1;
        const spanFromLevel = Math.max(1, this.playheadX1 - this.playheadX0);
        const ppq = Math.max(1, this.midiTickModel.ppq);
        const songEndTick = Math.max(0, this.midiTickModel.songEndTick);
        const unitsPerBeat = Math.max(1, this.mover.stepSize * (this.metronome.subdivision / Math.max(1, PLAYER_STEP_SUBDIVISIONS)));
        const calibratedTickPerUnit = ppq / unitsPerBeat;
        const levelTickPerUnit = songEndTick > 0 ? songEndTick / spanFromLevel : calibratedTickPerUnit;
        const mismatchRatio = calibratedTickPerUnit > 0 ? Math.abs(levelTickPerUnit - calibratedTickPerUnit) / calibratedTickPerUnit : 0;
        if (songEndTick > 0 && mismatchRatio > 0.05) {
            this.tickPerUnit = calibratedTickPerUnit;
            const calibratedSpan = songEndTick / this.tickPerUnit;
            this.playheadX1 = this.playheadX0 + Math.max(1, calibratedSpan);
        }
        else {
            this.tickPerUnit = songEndTick > 0 ? levelTickPerUnit : calibratedTickPerUnit;
        }
        this.playheadTick = Phaser.Math.Clamp(this.playheadTick, 0, this.midiTickModel.songEndTick);
        this.previousPlayheadTick = Phaser.Math.Clamp(this.previousPlayheadTick, 0, this.midiTickModel.songEndTick);
        const channels = new Set();
        for (const note of this.midiTickModel.notesByStart)
            channels.add(note.channel);
        this.midiSelectedChannelCount = channels.size;
    }
    getTempoPointIndexAtTick(tick) {
        if (!this.midiTickModel || this.midiTickModel.tempoPoints.length === 0)
            return 0;
        const safeTick = Math.max(0, Math.floor(tick));
        let picked = 0;
        for (let i = 0; i < this.midiTickModel.tempoPoints.length; i++) {
            if (this.midiTickModel.tempoPoints[i].tick > safeTick)
                break;
            picked = i;
        }
        return picked;
    }
    getTickFromWorldX(worldX) {
        if (!this.midiTickModel)
            return 0;
        const speedMultiplier = 1;
        const relative = Phaser.Math.Clamp(worldX - this.playheadX0, 0, this.playheadX1 - this.playheadX0);
        const mapped = relative * this.tickPerUnit * speedMultiplier;
        return Phaser.Math.Clamp(mapped, 0, this.midiTickModel.songEndTick);
    }
    getBpmAtTick(tick) {
        if (!this.midiTickModel || this.midiTickModel.tempoPoints.length === 0) {
            return this.tempoMap[0]?.bpm ?? DEFAULT_REFERENCE_BPM;
        }
        const tempoIndex = this.getTempoPointIndexAtTick(tick);
        const usPerQuarter = this.midiTickModel.tempoPoints[tempoIndex]?.usPerQuarter ?? 500_000;
        const bpm = Math.round(60_000_000 / Math.max(1, usPerQuarter));
        return Phaser.Math.Clamp(bpm, 20, 300);
    }
    getTempoZoneIndexForColumn(column) {
        const safeColumn = Math.max(0, Math.floor(Number(column) || 0));
        let picked = 0;
        for (let i = 0; i < this.tempoMap.length; i++) {
            if (this.tempoMap[i].startColumn > safeColumn)
                break;
            picked = i;
        }
        return picked;
    }
    getBpmForColumn(column) {
        return getTempoAtColumn(this.tempoMap, column).bpm;
    }
    getBpmForWorldX(worldX) {
        if (this.midiTickModel) {
            const tick = this.getTickFromWorldX(worldX);
            return this.getBpmAtTick(tick);
        }
        const step = WORLD_GRID_STEP;
        const relative = Math.round((worldX - this.minPlayerX) / step);
        const column = Phaser.Math.Clamp(relative, 0, Math.max(0, this.gridColumns - 1));
        return this.getBpmForColumn(column);
    }
    updateTempoFromPlayerPosition(nowMs, deltaSeconds) {
        const tempoTick = this.midiTickModel ? this.getTickFromWorldX(this.player.x) : 0;
        if (this.midiTickModel)
            this.playheadTick = tempoTick;
        const zoneIndex = this.midiTickModel
            ? this.getTempoPointIndexAtTick(tempoTick)
            : this.getTempoZoneIndexForColumn(this.getGridIndexFromX(this.player.x));
        const desiredBpm = this.midiTickModel ? this.getBpmAtTick(tempoTick) : this.tempoMap[zoneIndex]?.bpm ?? this.currentBpm;
        if (zoneIndex !== this.currentTempoZoneIndex || desiredBpm !== this.targetBpm) {
            const pendingMatches = this.pendingTempoChange &&
                this.pendingTempoChange.zoneIndex === zoneIndex &&
                Math.abs(this.pendingTempoChange.bpm - desiredBpm) < 1e-6;
            if (!pendingMatches) {
                this.pendingTempoChange = {
                    atMs: this.metronome.nextSubdivisionAt(nowMs),
                    bpm: desiredBpm,
                    zoneIndex
                };
            }
        }
        if (this.pendingTempoChange && nowMs >= this.pendingTempoChange.atMs) {
            this.currentTempoZoneIndex = this.pendingTempoChange.zoneIndex;
            this.targetBpm = this.pendingTempoChange.bpm;
            this.pendingTempoChange = null;
        }
        const nextBpm = stepTempoToward(this.currentBpm, this.targetBpm, this.tempoSmoothingBpmPerSecond, deltaSeconds);
        if (Math.abs(nextBpm - this.currentBpm) > 1e-6) {
            this.currentBpm = nextBpm;
            this.metronome.setBpm(this.currentBpm, nowMs);
        }
    }
    midiPitchToFrequency(midiPitch) {
        return 440 * Math.pow(2, (midiPitch - 69) / 12);
    }
    noteIntervalKey(note) {
        return `${note.trackId}:${note.channel}:${note.pitch}`;
    }
    noteIntervalToVoiceEvent(note) {
        return {
            noteId: this.noteIntervalKey(note),
            frequency: this.midiPitchToFrequency(note.pitch),
            velocity: Phaser.Math.Clamp(note.velocity / 127, 0.05, 1)
        };
    }
    panicAllNotesOff() {
        this.releaseAllVoices(true);
        this.activeVoiceCounts.clear();
        this.clearAllNaturalNoteOffTimers();
    }
    clearAllNaturalNoteOffTimers() {
        for (const timers of this.pendingNaturalNoteOffTimers.values()) {
            for (const timerId of timers)
                globalThis.clearTimeout(timerId);
        }
        this.pendingNaturalNoteOffTimers.clear();
    }
    clearNaturalNoteOffTimersForKey(key) {
        const timers = this.pendingNaturalNoteOffTimers.get(key);
        if (!timers)
            return;
        for (const timerId of timers)
            globalThis.clearTimeout(timerId);
        this.pendingNaturalNoteOffTimers.delete(key);
    }
    scheduleNaturalNoteOff(note, referenceTick) {
        if (!this.midiTickModel)
            return;
        if (this.currentDirection === 'backward')
            return;
        const key = this.noteIntervalKey(note);
        const safeRefTick = Phaser.Math.Clamp(Math.floor(referenceTick), 0, this.midiTickModel.songEndTick);
        const endSec = tickToSeconds(note.endTick, this.midiTickModel);
        const nowSec = tickToSeconds(safeRefTick, this.midiTickModel);
        const waitMs = Math.max(12, Math.round(Math.max(0, endSec - nowSec) * 1000));
        const timerId = globalThis.setTimeout(() => {
            const active = this.pendingNaturalNoteOffTimers.get(key);
            if (active) {
                active.delete(timerId);
                if (active.size === 0)
                    this.pendingNaturalNoteOffTimers.delete(key);
            }
            this.applyNoteOff(note, 'natural');
        }, waitMs);
        const timers = this.pendingNaturalNoteOffTimers.get(key) ?? new Set();
        timers.add(timerId);
        this.pendingNaturalNoteOffTimers.set(key, timers);
    }
    applyNoteOn(note) {
        const key = this.noteIntervalKey(note);
        const nextCount = (this.activeVoiceCounts.get(key) ?? 0) + 1;
        this.activeVoiceCounts.set(key, nextCount);
        if (nextCount === 1) {
            this.startVoice(this.noteIntervalToVoiceEvent(note), this.currentDirection === 'backward' ? 'backward' : 'forward');
        }
        this.scheduleNaturalNoteOff(note, this.playheadTick);
    }
    applyNoteOff(note, source = 'scrub') {
        const key = this.noteIntervalKey(note);
        const count = this.activeVoiceCounts.get(key) ?? 0;
        if (count <= 0) {
            if (source === 'scrub') {
                console.warn('MIDI scrub count underflow detected.', { key, count });
            }
            this.activeVoiceCounts.set(key, 0);
            return;
        }
        const next = count - 1;
        if (next <= 0) {
            this.activeVoiceCounts.delete(key);
            this.clearNaturalNoteOffTimersForKey(key);
            this.releaseVoice(key, 0.06);
        }
        else {
            this.activeVoiceCounts.set(key, next);
        }
    }
    rebuildVoicesAtTick(tickNow) {
        if (!this.midiTickModel)
            return { onCount: 0, offCount: 0 };
        const offCount = this.activeVoiceCounts.size;
        this.panicAllNotesOff();
        const safeTick = Phaser.Math.Clamp(Math.floor(tickNow), 0, this.midiTickModel.songEndTick);
        let onCount = 0;
        for (const note of this.midiTickModel.notesByStart) {
            if (note.startTick > safeTick)
                break;
            if (note.endTick <= safeTick)
                continue;
            this.applyNoteOn(note);
            onCount += 1;
        }
        return { onCount, offCount };
    }
    applyIncrementalForward(prevTick, nowTick) {
        if (!this.midiTickModel)
            return { onCount: 0, offCount: 0 };
        const notesByStart = this.midiTickModel.notesByStart;
        const notesByEnd = this.midiTickModel.notesByEnd;
        const startFrom = lowerBoundByStartTick(notesByStart, Math.floor(prevTick) + 1);
        const startTo = lowerBoundByStartTick(notesByStart, Math.floor(nowTick) + 1);
        const endFrom = lowerBoundByEndTick(notesByEnd, Math.floor(prevTick) + 1);
        const endTo = lowerBoundByEndTick(notesByEnd, Math.floor(nowTick) + 1);
        let onCount = 0;
        let offCount = 0;
        for (let i = startFrom; i < startTo; i++) {
            this.applyNoteOn(notesByStart[i]);
            onCount += 1;
        }
        for (let i = endFrom; i < endTo; i++) {
            this.applyNoteOff(notesByEnd[i]);
            offCount += 1;
        }
        return { onCount, offCount };
    }
    applyIncrementalReverse(prevTick, nowTick) {
        if (!this.midiTickModel)
            return { onCount: 0, offCount: 0 };
        const notesByStart = this.midiTickModel.notesByStart;
        const notesByEnd = this.midiTickModel.notesByEnd;
        const endFrom = lowerBoundByEndTick(notesByEnd, Math.floor(nowTick));
        const endTo = lowerBoundByEndTick(notesByEnd, Math.floor(prevTick));
        const startFrom = lowerBoundByStartTick(notesByStart, Math.floor(nowTick));
        const startTo = lowerBoundByStartTick(notesByStart, Math.floor(prevTick));
        let onCount = 0;
        let offCount = 0;
        for (let i = endFrom; i < endTo; i++) {
            this.applyNoteOn(notesByEnd[i]);
            onCount += 1;
        }
        for (let i = startFrom; i < startTo; i++) {
            this.applyNoteOff(notesByStart[i]);
            offCount += 1;
        }
        return { onCount, offCount };
    }
    updateMidiTickPlayback() {
        if (!this.midiTickModel || this.isPreviewMode || this.masterVolume <= 0)
            return;
        const tickNow = this.getTickFromWorldX(this.player.x);
        this.playheadTick = tickNow;
        const isMovementIdle = this.currentDirection === 'idle' && !this.mover.currentStep;
        if (isMovementIdle) {
            this.scrubWasPaused = false;
            this.previousPlayheadTick = tickNow;
            this.debugLastOnCount = 0;
            this.debugLastOffCount = 0;
            return;
        }
        if (this.scrubWasPaused) {
            const rebuilt = this.rebuildVoicesAtTick(tickNow);
            this.debugLastOnCount = rebuilt.onCount;
            this.debugLastOffCount = rebuilt.offCount;
            if (rebuilt.onCount > 0 || rebuilt.offCount > 0)
                this.lastMusicEventAtMs = performance.now();
            this.scrubWasPaused = false;
            this.previousPlayheadTick = tickNow;
            this.debugAudioMode = 'midi';
            return;
        }
        const deltaTick = tickNow - this.previousPlayheadTick;
        if (Math.abs(deltaTick) < 0.001) {
            this.debugLastOnCount = 0;
            this.debugLastOffCount = 0;
            return;
        }
        const prevTick = this.previousPlayheadTick;
        let stats = { onCount: 0, offCount: 0 };
        if (Math.abs(deltaTick) > this.scrubThresholdTick) {
            stats = this.rebuildVoicesAtTick(tickNow);
        }
        else if (deltaTick > 0) {
            stats = this.applyIncrementalForward(prevTick, tickNow);
        }
        else {
            stats = this.applyIncrementalReverse(prevTick, tickNow);
        }
        this.previousPlayheadTick = tickNow;
        this.debugLastOnCount = stats.onCount;
        this.debugLastOffCount = stats.offCount;
        if (stats.onCount > 0 || stats.offCount > 0)
            this.lastMusicEventAtMs = performance.now();
        this.debugAudioMode = 'midi';
    }
    updateIntensityFromMovement(deltaSeconds, movedX) {
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
    isPlayerGrounded(beatSolid, alternateBeatSolid, ghostSolid, reverseGhostSolid, elevatorSolid) {
        for (const beatPlatform of this.beatPlatforms) {
            if (this.isStandingOnPlatform(beatPlatform, beatSolid))
                return true;
        }
        for (const alternateBeatPlatform of this.alternateBeatPlatforms) {
            if (this.isStandingOnPlatform(alternateBeatPlatform, alternateBeatSolid))
                return true;
        }
        for (const ghostPlatform of this.ghostPlatforms) {
            if (this.isStandingOnPlatform(ghostPlatform, ghostSolid))
                return true;
        }
        for (const reverseGhostPlatform of this.reverseGhostPlatforms) {
            if (this.isStandingOnPlatform(reverseGhostPlatform, reverseGhostSolid))
                return true;
        }
        for (const elevatorPlatform of this.elevatorPlatforms) {
            if (this.isStandingOnPlatform(elevatorPlatform.shape, elevatorSolid))
                return true;
        }
        for (const shuttlePlatform of this.shuttlePlatforms) {
            if (this.isStandingOnPlatform(shuttlePlatform.shape, true))
                return true;
        }
        for (const crossPlatform of this.crossPlatforms) {
            if (this.isStandingOnPlatform(crossPlatform.shape, true))
                return true;
        }
        for (const springPlatform of this.springPlatforms) {
            if (this.isStandingOnPlatform(springPlatform, true))
                return true;
        }
        for (const platform of this.segmentPlatforms) {
            if (this.isStandingOnPlatform(platform.shape, platform.solid))
                return true;
        }
        return false;
    }
    isStandingOnAnyElevator() {
        for (const elevatorPlatform of this.elevatorPlatforms) {
            if (this.isStandingOnPlatform(elevatorPlatform.shape, true))
                return true;
        }
        return false;
    }
    isStandingOnAnyShuttle() {
        for (const shuttlePlatform of this.shuttlePlatforms) {
            if (this.isStandingOnPlatform(shuttlePlatform.shape, true))
                return true;
        }
        return false;
    }
    isStandingOnAnyCross() {
        for (const crossPlatform of this.crossPlatforms) {
            if (this.isStandingOnPlatform(crossPlatform.shape, true))
                return true;
        }
        return false;
    }
    isStandingOnAnySpring() {
        for (const springPlatform of this.springPlatforms) {
            if (this.isStandingOnPlatform(springPlatform, true))
                return true;
        }
        return false;
    }
    isStandingOnPlatform(platform, solid) {
        if (!solid)
            return false;
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
    resolveVerticalCollisions(previousPlayerY, beatSolid, alternateBeatSolid, ghostSolid, reverseGhostSolid, elevatorSolid) {
        const playerHalfWidth = this.player.width / 2;
        const playerHalfHeight = this.player.height / 2;
        const prevBottom = previousPlayerY + playerHalfHeight;
        const currentBottom = this.playerY + playerHalfHeight;
        const playerLeft = this.player.x - playerHalfWidth;
        const playerRight = this.player.x + playerHalfWidth;
        let landingY = null;
        const tryLandOnPlatform = (platform, solid) => {
            if (!solid)
                return;
            const platformHalfWidth = platform.width / 2;
            const platformTop = platform.y - platform.height / 2;
            const platformLeft = platform.x - platformHalfWidth;
            const platformRight = platform.x + platformHalfWidth;
            const overlapsX = playerRight > platformLeft && playerLeft < platformRight;
            const crossingTop = this.verticalVelocity >= 0 && prevBottom <= platformTop + 1 && currentBottom >= platformTop;
            if (!overlapsX || !crossingTop)
                return;
            const candidateY = platformTop - playerHalfHeight;
            if (landingY === null || candidateY < landingY)
                landingY = candidateY;
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
        for (const shuttlePlatform of this.shuttlePlatforms) {
            tryLandOnPlatform(shuttlePlatform.shape, true);
        }
        for (const crossPlatform of this.crossPlatforms) {
            tryLandOnPlatform(crossPlatform.shape, true);
        }
        for (const springPlatform of this.springPlatforms) {
            tryLandOnPlatform(springPlatform, true);
        }
        if (landingY !== null) {
            this.playerY = landingY;
            this.verticalVelocity = 0;
        }
        this.player.y = this.playerY;
    }
    applyBrightnessFromIntensity() {
        const visibility = this.getIntensityVisibility();
        const darknessAlpha = Phaser.Math.Clamp(0.84 - visibility * 0.64, 0, 0.95);
        this.darknessOverlay.setAlpha(darknessAlpha);
        this.debugDarknessAlpha = darknessAlpha;
    }
    getIntensityVisibility() {
        return Phaser.Math.Clamp((this.intensity - defaultIntensityConfig.residualFloor) / (1 - defaultIntensityConfig.residualFloor), 0, 1);
    }
    getWorldVisibilityClamp() {
        const visibility = this.getIntensityVisibility();
        return Phaser.Math.Clamp(0.32 + visibility * 0.68, 0.08, 1);
    }
    applyWorldVisibilityClamp() {
        const worldVisibility = this.getWorldVisibilityClamp();
        const characterVisibility = Phaser.Math.Clamp(0.58 + worldVisibility * 0.42, 0.42, 1);
        this.debugLevelAlpha = worldVisibility;
        this.debugPlayerAlpha = characterVisibility;
        for (const platform of this.segmentPlatforms) {
            platform.shape.setAlpha(0.3 + worldVisibility * 0.62);
        }
        for (const beatPlatform of this.beatPlatforms) {
            beatPlatform.setAlpha(beatPlatform.alpha * worldVisibility);
        }
        for (const alternateBeatPlatform of this.alternateBeatPlatforms) {
            alternateBeatPlatform.setAlpha(alternateBeatPlatform.alpha * worldVisibility);
        }
        for (const ghostPlatform of this.ghostPlatforms) {
            ghostPlatform.setAlpha(ghostPlatform.alpha * worldVisibility);
        }
        for (const reverseGhostPlatform of this.reverseGhostPlatforms) {
            reverseGhostPlatform.setAlpha(reverseGhostPlatform.alpha * worldVisibility);
        }
        for (const elevatorPlatform of this.elevatorPlatforms) {
            elevatorPlatform.shape.setAlpha(elevatorPlatform.shape.alpha * worldVisibility);
        }
        for (const shuttlePlatform of this.shuttlePlatforms) {
            shuttlePlatform.shape.setAlpha(shuttlePlatform.shape.alpha * worldVisibility);
        }
        for (const crossPlatform of this.crossPlatforms) {
            crossPlatform.shape.setAlpha(crossPlatform.shape.alpha * worldVisibility);
        }
        for (const springPlatform of this.springPlatforms) {
            springPlatform.setAlpha(springPlatform.alpha * worldVisibility);
        }
        for (const enemy of this.patrolEnemies) {
            if (!enemy.alive)
                continue;
            enemy.sprite.setAlpha(0.28 + worldVisibility * 0.67);
        }
        for (const enemy of this.flyingEnemies) {
            if (!enemy.alive)
                continue;
            enemy.sprite.setAlpha(0.24 + worldVisibility * 0.71);
        }
        this.player.setAlpha(characterVisibility);
    }
    brightenColor(color, amount) {
        const clamped = Phaser.Math.Clamp(amount, 0, 1);
        const r = (color >> 16) & 0xff;
        const g = (color >> 8) & 0xff;
        const b = color & 0xff;
        const nr = Math.round(r + (255 - r) * clamped);
        const ng = Math.round(g + (255 - g) * clamped);
        const nb = Math.round(b + (255 - b) * clamped);
        return (nr << 16) | (ng << 8) | nb;
    }
    updateMoonVisual(deltaSeconds) {
        const moonScreenTargetX = this.cameras.main.worldView.right - 140;
        const moonX = Math.min(moonScreenTargetX, this.moonMaxWorldX);
        this.moon.x = moonX;
        this.moonHalo.x = moonX;
        this.moonBeatPulse = Math.max(0, this.moonBeatPulse - deltaSeconds * 5.5);
        const moonY = 90;
        this.moon.y = moonY;
        this.moonHalo.y = moonY;
        const moonColor = this.currentDirection === 'forward'
            ? COLORS.moonWarm
            : this.currentDirection === 'backward'
                ? COLORS.moonCool
                : COLORS.moonLow;
        const darknessCompensation = Phaser.Math.Clamp((this.debugDarknessAlpha - 0.74) / 0.2, 0, 1);
        const moonColorBoost = this.brightenColor(moonColor, 0.4 * darknessCompensation);
        const moonMinAlpha = 0.3 + 0.18 * darknessCompensation;
        const haloMinAlpha = 0.12 + 0.14 * darknessCompensation;
        const moonAlpha = Phaser.Math.Clamp(0.28 + this.intensity * 0.64 + 0.2 * darknessCompensation, moonMinAlpha, 0.98);
        const haloBaseAlpha = this.currentDirection === 'backward' ? 0.12 : 0.15;
        const haloAlpha = Phaser.Math.Clamp(haloBaseAlpha + this.intensity * 0.24 + 0.12 * darknessCompensation, haloMinAlpha, 0.8);
        const baseScale = 0.94 + this.intensity * 0.22;
        const pulseScale = 0.04 * this.moonBeatPulse;
        const haloScale = 1.02 + this.intensity * 0.28 + 0.08 * this.moonBeatPulse;
        this.moon.setFillStyle(moonColorBoost, moonAlpha);
        this.moon.setAlpha(moonAlpha);
        this.moon.setScale(baseScale + pulseScale);
        this.moonHalo.setFillStyle(moonColorBoost, haloAlpha);
        this.moonHalo.setAlpha(haloAlpha);
        this.moonHalo.setScale(haloScale);
        this.debugMoonAlpha = moonAlpha;
        this.debugMoonHaloAlpha = haloAlpha;
    }
    handleBeatPulse(beatInBar) {
        if (this.lastBeatInBar === beatInBar)
            return;
        this.lastBeatInBar = beatInBar;
        this.moonBeatPulse = 1;
        this.playMetronomeTick(beatInBar === 1);
    }
    playMetronomeTick(isBarAccent) {
        if (this.isPreviewMode || this.masterVolume <= 0)
            return;
        const synth = this.ensureSynthReady();
        if (!synth)
            return;
        const osc = synth.createOscillator();
        const gain = synth.createGain();
        const filter = synth.createBiquadFilter();
        osc.type = 'square';
        osc.frequency.value = isBarAccent ? 1760 : 1320;
        filter.type = 'highpass';
        filter.frequency.value = isBarAccent ? 1400 : 1100;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.getMetronomeOutputNode(synth));
        this.applyMetronomeDucking(synth);
        const now = synth.currentTime;
        const peak = Math.max(0.0001, (isBarAccent ? 0.16 : 0.11) * this.masterVolume);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(peak, now + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.065);
    }
    createGameOverUI() {
        this.gameOverBackdrop = this.add
            .rectangle(480, 270, 960, 540, COLORS.deepBackground, 0.72)
            .setVisible(false)
            .setDepth(20)
            .setScrollFactor(0);
        this.configureScreenUi(this.gameOverBackdrop);
        this.gameOverText = this.add
            .text(480, 230, this.endStateTitle, {
            color: COLORS.hudText,
            fontFamily: HUD_FONT,
            fontSize: '48px'
        })
            .setOrigin(0.5)
            .setVisible(false)
            .setDepth(21)
            .setScrollFactor(0);
        this.configureScreenUi(this.gameOverText);
        this.gameOverDetailsText = this.add
            .text(480, 276, '', {
            color: COLORS.hudText,
            fontFamily: HUD_FONT,
            fontSize: '24px',
            align: 'center'
        })
            .setOrigin(0.5, 0.5)
            .setVisible(false)
            .setDepth(21)
            .setScrollFactor(0);
        this.configureScreenUi(this.gameOverDetailsText);
        this.restartButton = this.add
            .text(480, 300, 'Restart', {
            color: '#05070f',
            backgroundColor: '#f4d35e',
            fontFamily: HUD_FONT,
            fontSize: '24px',
            padding: { left: 14, right: 14, top: 8, bottom: 8 }
        })
            .setOrigin(0.5)
            .setVisible(false)
            .setDepth(21)
            .setScrollFactor(0)
            .setInteractive({ useHandCursor: true });
        this.configureScreenUi(this.restartButton);
        this.nextLevelButton = this.add
            .text(480, 390, 'Next Level', {
            color: '#05070f',
            backgroundColor: '#4cc9f0',
            fontFamily: HUD_FONT,
            fontSize: '20px',
            padding: { left: 12, right: 12, top: 7, bottom: 7 }
        })
            .setOrigin(0.5)
            .setVisible(false)
            .setDepth(21)
            .setScrollFactor(0)
            .setInteractive({ useHandCursor: true });
        this.configureScreenUi(this.nextLevelButton);
        this.backToMenuButton = this.add
            .text(480, 430, 'Back To Start', {
            color: '#05070f',
            backgroundColor: '#d7e2ff',
            fontFamily: HUD_FONT,
            fontSize: '20px',
            padding: { left: 12, right: 12, top: 7, bottom: 7 }
        })
            .setOrigin(0.5)
            .setVisible(false)
            .setDepth(21)
            .setScrollFactor(0)
            .setInteractive({ useHandCursor: true });
        this.configureScreenUi(this.backToMenuButton);
        this.restartButton.on('pointerdown', () => this.scene.restart({
            levelIndex: this.currentLevelOneBasedIndex,
            mode: 'play',
            volume: this.masterVolume,
            levels: this.availableLevels,
            levelNames: this.availableLevelNames
        }));
        this.nextLevelButton.on('pointerdown', () => this.goToNextLevel());
        this.backToMenuButton.on('pointerdown', () => {
            this.scene.start('start', {
                levelIndex: this.currentLevelOneBasedIndex,
                volume: this.masterVolume,
                levels: this.availableLevels,
                levelNames: this.availableLevelNames
            });
        });
    }
    createPauseUI() {
        this.pauseBackdrop = this.add
            .rectangle(480, 270, 960, 540, COLORS.deepBackground, 0.66)
            .setVisible(false)
            .setDepth(30)
            .setScrollFactor(0);
        this.configureScreenUi(this.pauseBackdrop);
        this.pauseTitleText = this.add
            .text(480, 220, 'PAUSED', {
            color: COLORS.hudText,
            fontFamily: HUD_FONT,
            fontSize: '50px'
        })
            .setOrigin(0.5)
            .setVisible(false)
            .setDepth(31)
            .setScrollFactor(0);
        this.configureScreenUi(this.pauseTitleText);
        this.continueButton = this.add
            .text(480, 300, 'Continue', {
            color: '#05070f',
            backgroundColor: '#f4d35e',
            fontFamily: HUD_FONT,
            fontSize: '24px',
            padding: { left: 14, right: 14, top: 8, bottom: 8 }
        })
            .setOrigin(0.5)
            .setVisible(false)
            .setDepth(31)
            .setScrollFactor(0)
            .setInteractive({ useHandCursor: true });
        this.configureScreenUi(this.continueButton);
        this.pauseBackToMenuButton = this.add
            .text(480, 355, 'Back to Start Screen', {
            color: '#05070f',
            backgroundColor: '#d7e2ff',
            fontFamily: HUD_FONT,
            fontSize: '22px',
            padding: { left: 12, right: 12, top: 7, bottom: 7 }
        })
            .setOrigin(0.5)
            .setVisible(false)
            .setDepth(31)
            .setScrollFactor(0)
            .setInteractive({ useHandCursor: true });
        this.configureScreenUi(this.pauseBackToMenuButton);
        this.quitButton = this.add
            .text(480, 410, 'Quit', {
            color: '#05070f',
            backgroundColor: '#ff6b6b',
            fontFamily: HUD_FONT,
            fontSize: '22px',
            padding: { left: 12, right: 12, top: 7, bottom: 7 }
        })
            .setOrigin(0.5)
            .setVisible(false)
            .setDepth(31)
            .setScrollFactor(0)
            .setInteractive({ useHandCursor: true });
        this.configureScreenUi(this.quitButton);
        this.continueButton.on('pointerdown', () => this.resumeFromPause());
        this.pauseBackToMenuButton.on('pointerdown', () => {
            this.scene.start('start', {
                levelIndex: this.currentLevelOneBasedIndex,
                volume: this.masterVolume,
                levels: this.availableLevels,
                levelNames: this.availableLevelNames
            });
        });
        this.quitButton.on('pointerdown', () => {
            if (typeof window !== 'undefined') {
                window.close();
                window.location.href = 'about:blank';
            }
        });
    }
    pauseGameplay() {
        if (this.isGameOver || this.isPreviewMode)
            return;
        this.isPaused = true;
        this.currentDirection = 'idle';
        this.mover.stopAt(this.player.x - this.playerStartX);
        this.clearQueuedAudioEvents();
        this.pauseBackdrop.setVisible(true);
        this.pauseTitleText.setVisible(true);
        this.continueButton.setVisible(true);
        this.pauseBackToMenuButton.setVisible(true);
        this.quitButton.setVisible(true);
    }
    resumeFromPause() {
        if (!this.isPaused)
            return;
        this.isPaused = false;
        this.pauseBackdrop.setVisible(false);
        this.pauseTitleText.setVisible(false);
        this.continueButton.setVisible(false);
        this.pauseBackToMenuButton.setVisible(false);
        this.quitButton.setVisible(false);
    }
    initializeGridBounds() {
        const minX = this.player.width / 2;
        const maxX = this.worldWidth - this.player.width / 2;
        const step = this.mover.stepSize;
        const minSteps = Math.ceil((minX - this.playerStartX) / step);
        const maxSteps = Math.floor((maxX - this.playerStartX) / step);
        this.minPlayerX = this.playerStartX + minSteps * step;
        this.maxPlayerX = this.playerStartX + maxSteps * step;
    }
    validateLevelDefinition() {
        const midiPlayback = this.currentLevel.midiPlayback;
        if (!midiPlayback || typeof midiPlayback !== 'object') {
            throw new Error('Invalid level definition: midiPlayback is required.');
        }
        if (!Number.isFinite(Number(midiPlayback.ppq)) || Number(midiPlayback.ppq) <= 0) {
            throw new Error('Invalid level definition: midiPlayback.ppq must be > 0.');
        }
        if (!Number.isFinite(Number(midiPlayback.songEndTick)) || Number(midiPlayback.songEndTick) < 0) {
            throw new Error('Invalid level definition: midiPlayback.songEndTick must be >= 0.');
        }
        if (!Array.isArray(midiPlayback.tempoPoints) || midiPlayback.tempoPoints.length === 0) {
            throw new Error('Invalid level definition: midiPlayback.tempoPoints must contain at least one point.');
        }
        if (!Array.isArray(midiPlayback.notes)) {
            throw new Error('Invalid level definition: midiPlayback.notes must be an array.');
        }
    }
    triggerGameOver() {
        if (this.isPreviewMode)
            return;
        this.isGameOver = true;
        this.releaseAllVoices();
        this.clearQueuedAudioEvents();
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
    triggerVictory() {
        if (this.isPreviewMode)
            return;
        this.isGameOver = true;
        this.releaseAllVoices();
        this.clearQueuedAudioEvents();
        const now = performance.now();
        const rawCompletedMs = Math.max(0, now - this.runStartMs);
        const scoreBonusMs = this.getEnemyTimeBonusMs();
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
    handleMoonCollision() {
        if (this.isGameOver)
            return;
        if (this.isPreviewMode)
            return;
        const dx = this.player.x - this.moon.x;
        const dy = this.player.y - this.moon.y;
        const distance = Math.hypot(dx, dy);
        const playerRadius = Math.max(this.player.width, this.player.height) * 0.5;
        const moonRadius = this.moon.radius ?? 42;
        if (distance <= playerRadius + moonRadius) {
            this.triggerVictory();
        }
    }
    resetGameplayState() {
        this.releaseAllVoices(true);
        this.activeVoiceCounts.clear();
        this.midiTickModel = this.coerceLevelMidiPlayback(this.currentLevel.midiPlayback);
        const fallbackBpm = this.getBpmAtTick(0);
        this.tempoMap = normalizeTempoMap(this.currentLevel.tempoMap ?? [{ startColumn: 0, bpm: fallbackBpm }], fallbackBpm);
        this.currentTempoZoneIndex = 0;
        this.currentBpm = fallbackBpm;
        this.targetBpm = this.currentBpm;
        this.playheadTick = 0;
        this.previousPlayheadTick = 0;
        this.scrubWasPaused = false;
        this.scrubThresholdTick = this.midiTickModel ? Math.max(1, Math.floor(this.midiTickModel.ppq / 2)) : 240;
        this.tempoSmoothingBpmPerSecond = Math.max(1, Number(this.currentLevel.tempoSmoothingBpmPerSecond) || DEFAULT_TEMPO_SMOOTHING_BPM_PER_SECOND);
        this.audioQuality = resolveAudioQualitySettings(this.currentLevel.audioQualityMode, this.currentLevel.audioQuality);
        this.maxSimultaneousVoices = this.audioQuality.maxPolyphony;
        this.audioSchedulerLookaheadMs = this.audioQuality.schedulerLookaheadMs;
        this.audioSchedulerLeadMs = this.audioQuality.schedulerLeadMs;
        this.pendingTempoChange = null;
        this.metronome = new Metronome(this.currentBpm, 4);
        this.mover = new BeatSnapMover(this.metronome, PLAYER_SNAP_STEP_X, PLAYER_STEP_SUBDIVISIONS);
        this.segmentPlatforms = [];
        this.patrolEnemies = [];
        this.flyingEnemies = [];
        this.lives = 5;
        this.isGameOver = false;
        this.isPaused = false;
        this.endStateTitle = 'GAME OVER';
        this.damageCooldownMs = 0;
        this.nextFlyingSpawnMs = 0;
        const hasSegmentEnemyAuthoring = Array.isArray(this.currentLevel.segmentEnemies);
        this.patrolCount = hasSegmentEnemyAuthoring ? 0 : Math.max(0, Math.floor(this.currentLevel.enemies?.patrolCount ?? 2));
        const baseSpawnInterval = hasSegmentEnemyAuthoring
            ? 0
            : Math.max(500, Math.floor(this.currentLevel.enemies?.flyingSpawnIntervalMs ?? 3400));
        this.flyingSpawnIntervalMs = baseSpawnInterval > 0 ? baseSpawnInterval : 0;
        this.segmentEnemyPlans = [];
        this.useSegmentEnemySpawns = hasSegmentEnemyAuthoring;
        if (this.isEnemyPlanDebugEnabled()) {
            const segmentEnemyRows = Array.isArray(this.currentLevel.segmentEnemies) ? this.currentLevel.segmentEnemies.length : 0;
            console.log('[EnemyDebug] mode', {
                hasSegmentEnemyAuthoring,
                useSegmentEnemySpawns: this.useSegmentEnemySpawns,
                segmentEnemyRows,
                fallbackPatrolCount: this.patrolCount,
                fallbackFlyingSpawnIntervalMs: this.flyingSpawnIntervalMs
            });
        }
        this.activeSegmentFlyingSpawnIntervalMs = 0;
        this.beatPlatforms = [];
        this.alternateBeatPlatforms = [];
        this.ghostPlatforms = [];
        this.reverseGhostPlatforms = [];
        this.elevatorPlatforms = [];
        this.shuttlePlatforms = [];
        this.crossPlatforms = [];
        this.springPlatforms = [];
        this.intensity = 1.0;
        this.currentDirection = 'idle';
        this.ghostPlatformLatchedSolid = false;
        this.reverseGhostPlatformLatchedSolid = true;
        this.gridColumns = this.resolveGridColumnsFromLevel();
        this.playerY = this.groundY;
        this.verticalVelocity = 0;
        this.lastGroundedAtMs = 0;
        this.lastGroundedOnSpring = false;
        this.lastBeatInBar = null;
        this.lastElevatorOffsetSteps = 0;
        this.lastShuttleOffsetSteps = 0;
        this.lastCrossOffsetSteps = { x: 0, y: 1 };
        this.moonBeatPulse = 0;
        this.runStartMs = 0;
        this.elapsedAtEndMs = 0;
        this.previewDirection = 'forward';
        this.enemyKills = 0;
        this.debugLastGridColumn = -1;
        this.debugLastDirection = 'idle';
        this.debugLastOnCount = 0;
        this.debugLastOffCount = 0;
        this.debugAudioMode = 'legacy';
        this.debugAudioDeClickStrict = false;
        this.debugShowPlaybackSpeedMetrics = true;
        this.debugExpectedBeatsPerSec = 0;
        this.debugActualBeatsPerSec = 0;
        this.debugPlaybackSpeedErrorPct = 0;
        this.debugLevelAlpha = 1;
        this.debugPlayerAlpha = 1;
        this.debugMoonAlpha = 1;
        this.debugMoonHaloAlpha = 1;
        this.debugDarknessAlpha = 0.82;
        this.forwardHoldMs = 0;
        this.avgForwardStepDurationMs = 0;
        this.queuedGridAudioEvents = [];
        this.queuedAudioEventKeys.clear();
        this.predictionKeys.clear();
        this.dispatchedAudioEventKeys.clear();
        this.audioLatenessAvgMs = 0;
        this.audioLatenessMaxMs = 0;
        this.audioLatenessSampleCount = 0;
        this.audioUnderrunCount = 0;
        this.idleVoiceReleaseAtMs = 0;
        this.lastMusicEventAtMs = 0;
        const step = WORLD_GRID_STEP;
        const maxPlatformRight = this.currentLevel.platforms.reduce((max, p) => Math.max(max, p.x + p.width / 2), 0);
        const hasAuthoredPlatforms = maxPlatformRight > 0;
        const fromPlatforms = maxPlatformRight + 220;
        const fromGridFallback = this.playerStartX + step * Math.max(0, this.gridColumns - 1) + 220;
        this.worldWidth = Math.max(960, Math.ceil(hasAuthoredPlatforms ? fromPlatforms : fromGridFallback));
        const moonForwardOffset = this.getPlatformGridStepX();
        this.moonMaxWorldX = Math.max(820, Math.ceil(maxPlatformRight + 140 + moonForwardOffset));
        this.configurePlayheadMapping();
    }
    updateTimerLabel(nowMs) {
        const elapsedMs = this.isGameOver ? this.elapsedAtEndMs : Math.max(0, nowMs - this.runStartMs);
        this.timerText.setText(`Time ${this.formatElapsedTime(elapsedMs)}`);
    }
    getEnemyKillCount() {
        return Math.max(0, Math.floor(this.enemyKills));
    }
    getEnemyTimeBonusMs() {
        return this.getEnemyKillCount() * ENEMY_TIME_BONUS_MS;
    }
    formatElapsedTime(ms) {
        const safeMs = Math.max(0, Math.floor(ms));
        const minutes = Math.floor(safeMs / 60000);
        const seconds = Math.floor((safeMs % 60000) / 1000);
        const centiseconds = Math.floor((safeMs % 1000) / 10);
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
    }
    startAudioScheduler() {
        if (typeof window === 'undefined')
            return;
        if (this.audioSchedulerTimer !== null)
            return;
        this.audioSchedulerTimer = window.setInterval(() => this.flushQueuedGridAudioEvents(), this.audioSchedulerLookaheadMs);
    }
    clearQueuedAudioEvents() {
        this.queuedGridAudioEvents = [];
        this.queuedAudioEventKeys.clear();
        this.predictionKeys.clear();
    }
    stopAudioScheduler() {
        if (typeof window === 'undefined')
            return;
        if (this.audioSchedulerTimer !== null) {
            window.clearInterval(this.audioSchedulerTimer);
            this.audioSchedulerTimer = null;
        }
        this.clearQueuedAudioEvents();
        this.dispatchedAudioEventKeys.clear();
    }
    rememberForwardStepDuration(stepDurationMs) {
        if (!Number.isFinite(stepDurationMs) || stepDurationMs <= 0)
            return;
        if (this.avgForwardStepDurationMs <= 0) {
            this.avgForwardStepDurationMs = stepDurationMs;
            return;
        }
        this.avgForwardStepDurationMs = this.avgForwardStepDurationMs * 0.75 + stepDurationMs * 0.25;
    }
    getNextForwardArrivalMs(nowMs) {
        let target = this.metronome.nextSubdivisionAt(nowMs);
        if (target <= nowMs)
            target += this.metronome.subdivisionIntervalMs;
        target += this.metronome.subdivisionIntervalMs * (PLAYER_STEP_SUBDIVISIONS - 1);
        return target;
    }
    queueForwardPredictedEvents(nowMs) {
        if (this.isPreviewMode || this.masterVolume <= 0)
            return;
        if (this.mover.stepSize < WORLD_GRID_STEP)
            return;
        const activeStep = this.mover.currentStep;
        const activeStepDurationMs = activeStep && activeStep.direction === 'forward' ? activeStep.arrivalTime - activeStep.startTime : null;
        const speedSignal = deriveForwardSpeedSignal({
            inputDirection: 'forward',
            activeStepDirection: activeStep?.direction ?? null,
            activeStepDurationMs,
            averageStepDurationMs: this.avgForwardStepDurationMs > 0 ? this.avgForwardStepDurationMs : null
        });
        if (!speedSignal.coherentForward || speedSignal.lookaheadSteps <= 0)
            return;
        const fromColumn = activeStep && activeStep.direction === 'forward'
            ? this.getGridIndexFromX(this.playerStartX + activeStep.fromX)
            : this.getGridIndexFromX(this.player.x);
        const firstTargetTimeMs = activeStep && activeStep.direction === 'forward' ? activeStep.arrivalTime : this.getNextForwardArrivalMs(nowMs);
        const planned = planForwardGridEvents({
            fromColumn,
            maxColumn: Math.max(0, this.gridColumns - 1),
            firstTargetTimeMs,
            stepDurationMs: speedSignal.stepDurationMs,
            lookaheadSteps: speedSignal.lookaheadSteps
        });
        for (const plannedEvent of planned) {
            if (plannedEvent.targetTimeMs + this.audioSchedulerLookaheadMs < nowMs)
                continue;
            this.enqueueGridAudioEvent({
                ...plannedEvent,
                source: 'prediction'
            });
        }
    }
    isEventKeyQueuedOrDispatched(eventKey) {
        if (this.queuedAudioEventKeys.has(eventKey))
            return true;
        this.pruneDispatchedAudioEventKeys(performance.now());
        return this.dispatchedAudioEventKeys.has(eventKey);
    }
    pruneDispatchedAudioEventKeys(nowMs) {
        for (const [eventKey, dispatchedAtMs] of this.dispatchedAudioEventKeys.entries()) {
            if (nowMs - dispatchedAtMs > AUDIO_EVENT_KEY_TTL_MS)
                this.dispatchedAudioEventKeys.delete(eventKey);
        }
    }
    rememberDispatchedAudioEventKey(eventKey, nowMs) {
        this.dispatchedAudioEventKeys.set(eventKey, nowMs);
    }
    purgeForwardPredictionEvents() {
        if (this.queuedGridAudioEvents.length === 0)
            return;
        const keptEvents = [];
        for (const event of this.queuedGridAudioEvents) {
            if (event.source === 'prediction' && event.direction === 'forward') {
                this.queuedAudioEventKeys.delete(event.eventKey);
                this.predictionKeys.delete(event.eventKey);
                continue;
            }
            keptEvents.push(event);
        }
        this.queuedGridAudioEvents = keptEvents;
    }
    enqueueGridAudioEvent(event) {
        if (this.isPreviewMode || this.masterVolume <= 0)
            return false;
        if (!Number.isFinite(event.targetTimeMs))
            return false;
        const gridIndex = Phaser.Math.Clamp(Math.floor(event.gridIndex), 0, Math.max(0, this.gridColumns - 1));
        const eventKey = event.eventKey || buildGridEventKey(event.direction, gridIndex, event.targetTimeMs);
        if (this.isEventKeyQueuedOrDispatched(eventKey))
            return false;
        const normalized = {
            gridIndex,
            direction: event.direction,
            targetTimeMs: event.targetTimeMs,
            source: event.source,
            eventKey
        };
        const insertAt = this.queuedGridAudioEvents.findIndex((queued) => queued.targetTimeMs > normalized.targetTimeMs);
        if (insertAt < 0)
            this.queuedGridAudioEvents.push(normalized);
        else
            this.queuedGridAudioEvents.splice(insertAt, 0, normalized);
        this.queuedAudioEventKeys.add(normalized.eventKey);
        if (normalized.source === 'prediction')
            this.predictionKeys.add(normalized.eventKey);
        return true;
    }
    flushQueuedGridAudioEvents() {
        if (this.queuedGridAudioEvents.length === 0)
            return;
        const synth = this.ensureSynthReady();
        if (!synth)
            return;
        const nowMs = performance.now();
        const nowCtx = synth.currentTime;
        this.pruneDispatchedAudioEventKeys(nowMs);
        const dispatchBeforeMs = nowMs + this.audioSchedulerLookaheadMs;
        while (this.queuedGridAudioEvents.length > 0 && this.queuedGridAudioEvents[0].targetTimeMs <= dispatchBeforeMs) {
            const event = this.queuedGridAudioEvents.shift();
            this.queuedAudioEventKeys.delete(event.eventKey);
            this.predictionKeys.delete(event.eventKey);
            const scheduledAtSec = computeScheduledAtSec(nowCtx, nowMs, event.targetTimeMs, this.audioSchedulerLeadMs);
            const latenessMs = computeLatenessMs(nowMs, event.targetTimeMs);
            this.audioLatenessSampleCount += 1;
            this.audioLatenessAvgMs =
                ((this.audioLatenessAvgMs * (this.audioLatenessSampleCount - 1)) + latenessMs) / this.audioLatenessSampleCount;
            this.audioLatenessMaxMs = Math.max(this.audioLatenessMaxMs, latenessMs);
            if (isAudioUnderrun(latenessMs, AUDIO_UNDERRUN_THRESHOLD_MS))
                this.audioUnderrunCount += 1;
            this.rememberDispatchedAudioEventKey(event.eventKey, nowMs);
            this.playGridAudioAtIndex(event.gridIndex, event.direction, scheduledAtSec, event.targetTimeMs);
        }
    }
    loadBestTimeMs() {
        try {
            if (typeof window === 'undefined' || !window.localStorage)
                return null;
            const raw = window.localStorage.getItem(this.getBestTimeStorageKey(this.currentLevelName));
            if (!raw)
                return null;
            const parsed = Number(raw);
            return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
        }
        catch {
            return null;
        }
    }
    saveBestTimeMs(timeMs) {
        try {
            if (typeof window === 'undefined' || !window.localStorage)
                return;
            window.localStorage.setItem(this.getBestTimeStorageKey(this.currentLevelName), String(Math.max(0, Math.floor(timeMs))));
        }
        catch {
            // Ignore storage failures (private mode / disabled storage).
        }
    }
    playGridAudioAtIndex(gridIndex, direction, scheduledAtSec, eventTimeMs) {
        if (this.isPreviewMode || this.masterVolume <= 0)
            return;
        const nowMs = typeof eventTimeMs === 'number' && Number.isFinite(eventTimeMs) ? eventTimeMs : performance.now();
        const columnIndex = Phaser.Math.Clamp(Math.floor(gridIndex), 0, Math.max(0, this.gridColumns - 1));
        this.debugLastGridColumn = columnIndex;
        this.debugLastDirection = direction;
        this.debugAudioMode = 'legacy';
        this.debugLastOnCount = 1;
        this.debugLastOffCount = 0;
        this.lastMusicEventAtMs = nowMs;
        this.playLegacyNoteAtGridIndex(columnIndex, direction, scheduledAtSec);
    }
    playLegacyNoteAtGridIndex(gridIndex, direction, scheduledAtSec) {
        const synth = this.ensureSynthReady();
        if (!synth)
            return;
        const editorLike = this.audioQuality.synthStyle === 'editorLike';
        const osc = synth.createOscillator();
        const gain = synth.createGain();
        const filter = synth.createBiquadFilter();
        const freq = this.currentLevel.notes?.[gridIndex] ?? 220;
        osc.type = editorLike ? 'triangle' : 'sawtooth';
        osc.frequency.value = freq;
        filter.type = 'lowpass';
        filter.frequency.value = editorLike
            ? direction === 'forward'
                ? 9200
                : 5200
            : direction === 'forward'
                ? 1200
                : 700;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.getMusicOutputNode(synth));
        const now = Math.max(synth.currentTime, scheduledAtSec ?? synth.currentTime);
        if (direction === 'backward') {
            gain.gain.setValueAtTime(0.0001, now);
            if (editorLike) {
                gain.gain.linearRampToValueAtTime(Math.max(0.0001, 0.14 * this.masterVolume), now + 0.012);
                gain.gain.linearRampToValueAtTime(0.0001, now + 0.12);
            }
            else {
                gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.28 * this.masterVolume), now + 0.06);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
            }
        }
        else {
            gain.gain.setValueAtTime(0.0001, now);
            if (editorLike) {
                gain.gain.linearRampToValueAtTime(Math.max(0.0001, 0.16 * this.masterVolume), now + 0.008);
                gain.gain.linearRampToValueAtTime(0.0001, now + 0.14);
            }
            else {
                gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.42 * this.masterVolume), now + 0.012);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
            }
        }
        osc.start(now);
        osc.stop(now + (editorLike ? 0.16 : 0.22));
    }
    startVoice(event, direction, scheduledAtSec) {
        const synth = this.ensureSynthReady();
        if (!synth)
            return;
        const editorLike = this.audioQuality.synthStyle === 'editorLike';
        const now = Math.max(synth.currentTime, scheduledAtSec ?? synth.currentTime);
        const existing = this.activeVoices.get(event.noteId);
        if (existing) {
            const retriggerMs = (now - existing.lastTriggeredAt) * 1000;
            if (retriggerMs <= VOICE_RETRIGGER_WINDOW_MS) {
                const velocityNorm = Phaser.Math.Clamp(event.velocity, 0.05, 1);
                const cutoff = editorLike
                    ? direction === 'forward'
                        ? 9000 + velocityNorm * 5000
                        : 4200 + velocityNorm * 2600
                    : direction === 'forward'
                        ? 900 + velocityNorm * 2200
                        : 500 + velocityNorm * 1300;
                const frequencyGlide = Math.max(0.002, Math.min(0.018, retriggerMs / 2000));
                existing.filter.frequency.setTargetAtTime(cutoff, now, 0.012);
                for (const osc of existing.oscillators) {
                    osc.frequency.setTargetAtTime(event.frequency, now, frequencyGlide);
                }
                existing.frequency = event.frequency;
                const peak = editorLike
                    ? (direction === 'forward' ? 0.16 : 0.12) * velocityNorm * Phaser.Math.Clamp(this.masterVolume, 0, 1)
                    : (direction === 'forward' ? 0.22 : 0.15) * velocityNorm * Phaser.Math.Clamp(this.masterVolume, 0, 1) * 0.85;
                const gainParam = existing.gain.gain;
                if (typeof gainParam.cancelAndHoldAtTime === 'function') {
                    gainParam.cancelAndHoldAtTime(now);
                }
                else {
                    gainParam.cancelScheduledValues(now);
                    gainParam.setValueAtTime(Math.max(0.0001, gainParam.value), now);
                }
                gainParam.linearRampToValueAtTime(Math.max(0.0001, peak), now + (editorLike ? 0.008 : 0.01));
                gainParam.linearRampToValueAtTime(Math.max(0.0001, peak * (editorLike ? 0.88 : 0.75)), now + (editorLike ? 0.04 : 0.06));
                existing.peakGain = peak;
                existing.lastTriggeredAt = now;
                this.lastMusicEventAtMs = performance.now();
                return;
            }
            this.releaseVoice(event.noteId, 0.06, now);
        }
        this.pruneVoices(now);
        if (this.activeVoices.size >= this.maxSimultaneousVoices) {
            const toSteal = this.pickVoiceToSteal(now);
            if (toSteal)
                this.releaseVoice(toSteal, 0.03, now);
        }
        const gain = synth.createGain();
        const filter = synth.createBiquadFilter();
        const oscA = synth.createOscillator();
        const oscillators = [oscA];
        oscA.type = editorLike ? 'triangle' : 'sawtooth';
        oscA.frequency.value = event.frequency;
        if (!editorLike) {
            const oscB = synth.createOscillator();
            oscB.type = 'triangle';
            oscB.frequency.value = event.frequency * 0.5;
            oscillators.push(oscB);
        }
        filter.type = 'lowpass';
        const velocityNorm = Phaser.Math.Clamp(event.velocity, 0.05, 1);
        const cutoff = editorLike
            ? direction === 'forward'
                ? 9000 + velocityNorm * 5000
                : 4200 + velocityNorm * 2600
            : direction === 'forward'
                ? 900 + velocityNorm * 2200
                : 500 + velocityNorm * 1300;
        filter.frequency.value = cutoff;
        filter.Q.value = editorLike ? 0.22 : direction === 'forward' ? 0.7 : 0.4;
        const peak = editorLike
            ? (direction === 'forward' ? 0.16 : 0.12) * velocityNorm * Phaser.Math.Clamp(this.masterVolume, 0, 1)
            : (direction === 'forward' ? 0.22 : 0.15) * velocityNorm * Phaser.Math.Clamp(this.masterVolume, 0, 1) * 0.85;
        const sustain = editorLike
            ? peak * 0.88
            : peak * (direction === 'forward' ? 0.55 : 0.45);
        const attack = editorLike ? 0.008 : direction === 'forward' ? 0.012 : 0.045;
        const decay = editorLike ? 0.03 : direction === 'forward' ? 0.08 : 0.11;
        gain.gain.setValueAtTime(0.0001, now);
        if (editorLike) {
            gain.gain.linearRampToValueAtTime(Math.max(0.0001, peak), now + attack);
            gain.gain.linearRampToValueAtTime(Math.max(0.0001, sustain), now + attack + decay);
        }
        else {
            gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), now + attack);
            gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), now + attack + decay);
        }
        oscA.connect(filter);
        for (let i = 1; i < oscillators.length; i++) {
            oscillators[i].connect(filter);
        }
        filter.connect(gain);
        gain.connect(this.getMusicOutputNode(synth));
        for (const osc of oscillators)
            osc.start(now);
        this.activeVoices.set(event.noteId, {
            noteId: event.noteId,
            frequency: event.frequency,
            startedAt: now,
            lastTriggeredAt: now,
            peakGain: peak,
            gain,
            filter,
            oscillators
        });
    }
    pickVoiceToSteal(now) {
        let picked = null;
        for (const [noteId, voice] of this.activeVoices.entries()) {
            const ageSec = Math.max(0, now - voice.lastTriggeredAt);
            const loudness = Math.max(0.0001, voice.gain.gain.value);
            const score = loudness * 100 - ageSec * 25;
            if (!picked || score < picked.score) {
                picked = { noteId, score };
            }
        }
        return picked?.noteId ?? null;
    }
    playBackwardTransient(event, scheduledAtSec) {
        const synth = this.ensureSynthReady();
        if (!synth)
            return;
        const editorLike = this.audioQuality.synthStyle === 'editorLike';
        const now = Math.max(synth.currentTime, scheduledAtSec ?? synth.currentTime);
        const gain = synth.createGain();
        const filter = synth.createBiquadFilter();
        const oscA = synth.createOscillator();
        const oscillators = [oscA];
        const velocityNorm = Phaser.Math.Clamp(event.velocity, 0.05, 1);
        const peak = editorLike
            ? 0.12 * velocityNorm * Phaser.Math.Clamp(this.masterVolume, 0, 1)
            : 0.18 * velocityNorm * Phaser.Math.Clamp(this.masterVolume, 0, 1) * 0.75;
        const attack = editorLike ? 0.012 : 0.028;
        const release = editorLike ? 0.12 : 0.16;
        oscA.type = 'triangle';
        oscA.frequency.value = event.frequency;
        if (!editorLike) {
            const oscB = synth.createOscillator();
            oscB.type = 'sine';
            oscB.frequency.value = event.frequency * 0.5;
            oscillators.push(oscB);
        }
        filter.type = 'lowpass';
        filter.frequency.value = editorLike ? 4200 + velocityNorm * 1800 : 480 + velocityNorm * 950;
        filter.Q.value = editorLike ? 0.22 : 0.35;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), now + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);
        oscA.connect(filter);
        for (let i = 1; i < oscillators.length; i++) {
            oscillators[i].connect(filter);
        }
        filter.connect(gain);
        gain.connect(this.getMusicOutputNode(synth));
        for (const osc of oscillators) {
            osc.start(now);
            osc.stop(now + attack + release + 0.02);
        }
    }
    releaseVoice(noteId, releaseSeconds, startAtSec, enforceMinHold = true) {
        const voice = this.activeVoices.get(noteId);
        if (!voice || !this.synth)
            return;
        const now = Math.max(this.synth.currentTime, startAtSec ?? this.synth.currentTime);
        const releaseStart = enforceMinHold ? Math.max(now, voice.startedAt + MIN_VOICE_HOLD_SEC) : now;
        const release = Phaser.Math.Clamp(releaseSeconds, 0.02, 0.45);
        try {
            const gainParam = voice.gain.gain;
            if (typeof gainParam.cancelAndHoldAtTime === 'function') {
                gainParam.cancelAndHoldAtTime(releaseStart);
            }
            else {
                gainParam.cancelScheduledValues(releaseStart);
                gainParam.setValueAtTime(Math.max(0.0001, gainParam.value), releaseStart);
            }
            const releaseTimeConstant = this.debugAudioDeClickStrict
                ? Math.max(0.014, release * 0.55)
                : Math.max(0.008, release * 0.35);
            gainParam.setTargetAtTime(0.0001, releaseStart, releaseTimeConstant);
            for (const osc of voice.oscillators) {
                const tailStop = this.debugAudioDeClickStrict
                    ? releaseStart + Math.max(0.24, release * 5.2)
                    : releaseStart + Math.max(0.16, release * 3.5);
                osc.stop(tailStop);
            }
        }
        catch {
            // Ignore errors from already-stopped oscillators.
        }
        this.activeVoices.delete(noteId);
    }
    pruneVoices(now) {
        if (!this.synth)
            return;
        for (const [noteId, voice] of this.activeVoices.entries()) {
            const level = voice.gain.gain.value;
            if (!Number.isFinite(level) || level <= 0.00011) {
                try {
                    for (const osc of voice.oscillators)
                        osc.stop(now + 0.08);
                }
                catch {
                    // Ignore oscillators already stopped.
                }
                this.activeVoices.delete(noteId);
            }
        }
    }
    releaseAllVoices(immediate = false) {
        const release = immediate ? 0.02 : 0.08;
        for (const noteId of [...this.activeVoices.keys()]) {
            this.releaseVoice(noteId, release, undefined, !immediate);
        }
        if (immediate) {
            this.activeVoiceCounts.clear();
            this.clearAllNaturalNoteOffTimers();
        }
    }
    ensureSynthReady() {
        try {
            if (!this.synth)
                this.synth = new AudioContext();
            if (this.synth.state === 'suspended') {
                this.synth.resume().catch(() => undefined);
                return null;
            }
            this.ensureAudioGraph(this.synth);
            return this.synth;
        }
        catch {
            return null;
        }
    }
    buildSaturationCurve(amount) {
        const k = Math.max(0, Math.min(1, amount)) * 80;
        const samples = 1024;
        const buffer = new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT);
        const curve = new Float32Array(buffer);
        for (let i = 0; i < samples; i++) {
            const x = (i * 2) / (samples - 1) - 1;
            curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
        }
        return curve;
    }
    ensureAudioGraph(synth) {
        const saturationAmount = this.getEffectiveSaturationAmount();
        if (!this.masterGain) {
            this.masterGain = synth.createGain();
            this.masterGain.gain.setValueAtTime(Math.max(0.0001, this.masterVolume), synth.currentTime);
            const limiter = synth.createDynamicsCompressor();
            limiter.threshold.setValueAtTime(-4, synth.currentTime);
            limiter.knee.setValueAtTime(14, synth.currentTime);
            limiter.ratio.setValueAtTime(8, synth.currentTime);
            limiter.attack.setValueAtTime(0.003, synth.currentTime);
            limiter.release.setValueAtTime(0.12, synth.currentTime);
            this.masterGain.connect(limiter);
            limiter.connect(synth.destination);
        }
        if (!this.musicBusGain) {
            this.musicBusGain = synth.createGain();
            this.musicBusGain.gain.setValueAtTime(this.audioQuality.musicGain, synth.currentTime);
            this.musicBusGain.connect(this.masterGain);
        }
        if (!this.metronomeBusGain) {
            this.metronomeBusGain = synth.createGain();
            this.metronomeBusGain.gain.setValueAtTime(this.audioQuality.metronomeGain, synth.currentTime);
            this.metronomeBusGain.connect(this.masterGain);
        }
        if (!this.saturationNode) {
            this.saturationNode = synth.createWaveShaper();
            this.saturationNode.oversample = '2x';
            this.lastAppliedSaturationAmount = saturationAmount;
            this.saturationNode.curve = this.buildSaturationCurve(this.lastAppliedSaturationAmount);
            if (this.musicBusGain) {
                this.musicBusGain.disconnect();
                this.musicBusGain.connect(this.saturationNode);
                this.saturationNode.connect(this.masterGain);
            }
        }
        const now = synth.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setTargetAtTime(Math.max(0.0001, this.masterVolume), now, 0.02);
        if (this.musicBusGain) {
            this.musicBusGain.gain.cancelScheduledValues(now);
            this.musicBusGain.gain.setTargetAtTime(Math.max(0.0001, this.audioQuality.musicGain), now, 0.03);
        }
        if (this.metronomeBusGain) {
            this.metronomeBusGain.gain.cancelScheduledValues(now);
            this.metronomeBusGain.gain.setTargetAtTime(Math.max(0.0001, this.audioQuality.metronomeGain), now, 0.03);
        }
        if (this.saturationNode && Math.abs(saturationAmount - this.lastAppliedSaturationAmount) > 0.0005) {
            this.lastAppliedSaturationAmount = saturationAmount;
            this.saturationNode.curve = this.buildSaturationCurve(this.lastAppliedSaturationAmount);
        }
    }
    getMusicOutputNode(synth) {
        this.ensureAudioGraph(synth);
        return this.musicBusGain ?? this.masterGain ?? synth.destination;
    }
    getMetronomeOutputNode(synth) {
        this.ensureAudioGraph(synth);
        return this.metronomeBusGain ?? this.masterGain ?? synth.destination;
    }
    applyMetronomeDucking(synth) {
        if (!this.musicBusGain)
            return;
        const now = synth.currentTime;
        const base = Math.max(0.0001, this.audioQuality.musicGain);
        const duckAmount = this.debugAudioDeClickStrict
            ? this.audioQuality.metronomeDuckAmount * 0.7
            : this.audioQuality.metronomeDuckAmount;
        const ducked = Math.max(0.0001, base * (1 - duckAmount));
        const gainParam = this.musicBusGain.gain;
        if (typeof gainParam.cancelAndHoldAtTime === 'function') {
            gainParam.cancelAndHoldAtTime(now);
        }
        else {
            gainParam.cancelScheduledValues(now);
            gainParam.setValueAtTime(Math.max(0.0001, gainParam.value), now);
        }
        if (this.debugAudioDeClickStrict) {
            gainParam.setTargetAtTime(ducked, now, 0.015);
            gainParam.setTargetAtTime(base, now + 0.05, 0.08);
        }
        else {
            gainParam.setTargetAtTime(ducked, now, 0.008);
            gainParam.setTargetAtTime(base, now + 0.035, 0.05);
        }
    }
    getEffectiveSaturationAmount() {
        const base = Math.max(0, this.audioQuality.saturationAmount);
        if (!this.debugAudioDeClickStrict)
            return base;
        return base * 0.15;
    }
    frequencyToMidi(frequency) {
        const safeFrequency = Number(frequency);
        if (!Number.isFinite(safeFrequency) || safeFrequency <= 0)
            return 60;
        const midi = Math.round(69 + 12 * Math.log2(safeFrequency / 440));
        return Phaser.Math.Clamp(midi, 0, 127);
    }
    buildLegacyMidiPlaybackFromLevel(level) {
        const ppq = 480;
        const gridColumns = Math.max(1, Math.floor(Number(level.gridColumns) || level.notes?.length || 29));
        const notesHz = Array.isArray(level.notes) ? level.notes : [];
        const notes = [];
        for (let i = 0; i < gridColumns; i++) {
            const freq = Number(notesHz[i] ?? notesHz[notesHz.length - 1] ?? 261.625565);
            const pitch = this.frequencyToMidi(freq);
            const startTick = i * ppq;
            notes.push({
                startTick,
                endTick: startTick + ppq,
                pitch,
                velocity: 100,
                trackId: 0,
                channel: 0
            });
        }
        const rawTempo = Array.isArray(level.tempoMap) ? level.tempoMap : [{ startColumn: 0, bpm: DEFAULT_REFERENCE_BPM }];
        const tempoPoints = normalizeTempoMap(rawTempo, DEFAULT_REFERENCE_BPM).map((row) => ({
            tick: Math.max(0, Math.floor(row.startColumn * ppq)),
            usPerQuarter: Math.max(1, Math.round(60_000_000 / row.bpm))
        }));
        const x0 = this.playerStartX;
        const x1 = this.playerStartX + WORLD_GRID_STEP * Math.max(1, gridColumns - 1);
        return {
            ppq,
            songEndTick: gridColumns * ppq,
            tempoPoints,
            notes,
            x0,
            x1
        };
    }
    resolveLevelFromInputs() {
        const data = (this.scene.settings.data || {});
        const fallbackIndex = 1;
        let parsedIndex = Number.isFinite(data.levelIndex) ? Number(data.levelIndex) : fallbackIndex;
        if (!Number.isFinite(parsedIndex)) {
            try {
                if (typeof window !== 'undefined') {
                    const raw = new URLSearchParams(window.location.search).get('level');
                    if (raw)
                        parsedIndex = Number(raw);
                }
            }
            catch {
                parsedIndex = fallbackIndex;
            }
        }
        this.isPreviewMode = data.mode === 'preview';
        const requestedVolume = Number(data.volume);
        this.masterVolume = Number.isFinite(requestedVolume) ? Phaser.Math.Clamp(requestedVolume, 0, 1) : 0.5;
        if (Array.isArray(data.levels) && data.levels.length > 0)
            this.availableLevels = data.levels;
        else
            this.availableLevels = LEVELS;
        this.availableLevelNames = this.availableLevels.map((_level, i) => String(data.levelNames?.[i] || `level_${i + 1}.runtime.json`));
        const safeIndex = Math.max(1, Math.min(this.availableLevels.length, Math.floor(parsedIndex)));
        const resolvedLevel = this.availableLevels[safeIndex - 1] ?? getLevelByOneBasedIndex(safeIndex);
        const legacyFallbackMidi = this.buildLegacyMidiPlaybackFromLevel(resolvedLevel);
        const normalizedTickModel = this.coerceLevelMidiPlayback(resolvedLevel.midiPlayback ?? legacyFallbackMidi);
        const sourceMidiPlayback = resolvedLevel.midiPlayback ?? legacyFallbackMidi;
        const normalizedMidiPlayback = {
            ppq: normalizedTickModel.ppq,
            songEndTick: normalizedTickModel.songEndTick,
            tempoPoints: normalizedTickModel.tempoPoints.map((point) => ({ ...point })),
            notes: normalizedTickModel.notesByStart.map((note) => ({ ...note })),
            ...(Number.isFinite(Number(sourceMidiPlayback.x0)) ? { x0: Number(sourceMidiPlayback.x0) } : {}),
            ...(Number.isFinite(Number(sourceMidiPlayback.x1)) ? { x1: Number(sourceMidiPlayback.x1) } : {})
        };
        const legacyTempoMap = normalizeTempoMap(resolvedLevel.tempoMap ?? [
            {
                startColumn: 0,
                bpm: Math.round(60_000_000 / (normalizedTickModel.tempoPoints[0]?.usPerQuarter || 500_000))
            }
        ], DEFAULT_REFERENCE_BPM).map((entry) => ({ ...entry }));
        const legacyNotes = Array.isArray(resolvedLevel.notes) ? [...resolvedLevel.notes] : [];
        this.currentLevel = {
            ...resolvedLevel,
            midiPlayback: normalizedMidiPlayback,
            tempoMap: legacyTempoMap,
            notes: legacyNotes,
            platforms: [...(resolvedLevel.platforms || [])],
            segmentEnemies: Array.isArray(resolvedLevel.segmentEnemies)
                ? resolvedLevel.segmentEnemies.map((entry) => ({ ...entry }))
                : undefined,
            enemies: resolvedLevel.enemies ? { ...resolvedLevel.enemies } : undefined,
            audioQualityMode: resolvedLevel.audioQualityMode,
            audioQuality: resolvedLevel.audioQuality ? { ...resolvedLevel.audioQuality } : undefined
        };
        this.currentLevelOneBasedIndex = safeIndex;
        this.currentLevelName = String(this.availableLevelNames[safeIndex - 1] || `level_${safeIndex}.runtime.json`);
    }
    queueLevelMidiLoad() {
        const midiFile = String(this.currentLevel.midi_file || '').trim();
        if (!midiFile) {
            this.levelMidiCacheKey = null;
            return;
        }
        const cacheKey = `level-midi:${this.currentLevelOneBasedIndex}:${midiFile}`;
        this.levelMidiCacheKey = cacheKey;
        this.load.binary(cacheKey, `/api/midi-file?name=${encodeURIComponent(midiFile)}`);
    }
    applyLoadedMidiToLevelNotes() {
        if (!this.levelMidiCacheKey)
            return;
        if (!this.cache.binary.exists(this.levelMidiCacheKey))
            return;
        const raw = this.cache.binary.get(this.levelMidiCacheKey);
        const arrayBuffer = this.coerceArrayBuffer(raw);
        if (!arrayBuffer)
            return;
        try {
            const tickModel = parseMidiToTickModel(arrayBuffer);
            const fallbackX0 = this.playerStartX;
            const fallbackX1 = fallbackX0 + WORLD_GRID_STEP * Math.max(1, this.resolveGridColumnsFromLevel() - 1);
            this.currentLevel.midiPlayback = {
                ppq: tickModel.ppq,
                songEndTick: tickModel.songEndTick,
                tempoPoints: tickModel.tempoPoints.map((point) => ({ ...point })),
                notes: tickModel.notesByStart.map((note) => ({ ...note })),
                x0: Number.isFinite(Number(this.currentLevel.midiPlayback?.x0)) ? Number(this.currentLevel.midiPlayback.x0) : fallbackX0,
                x1: Number.isFinite(Number(this.currentLevel.midiPlayback?.x1)) ? Number(this.currentLevel.midiPlayback.x1) : fallbackX1
            };
        }
        catch (err) {
            console.warn('Unable to parse runtime MIDI file for level playback.', err);
        }
    }
    coerceArrayBuffer(raw) {
        if (raw instanceof ArrayBuffer)
            return raw;
        if (ArrayBuffer.isView(raw)) {
            return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
        }
        return null;
    }
    goToNextLevel() {
        const next = this.currentLevelOneBasedIndex + 1;
        if (next > this.availableLevels.length)
            return;
        this.scene.restart({
            levelIndex: next,
            mode: 'play',
            volume: this.masterVolume,
            levels: this.availableLevels,
            levelNames: this.availableLevelNames
        });
    }
    getBestTimeStorageKey(levelName) {
        const storageId = this.getLevelStorageId(levelName);
        return `${BEST_TIME_STORAGE_PREFIX}.name.${storageId}.bestTimeMs`;
    }
    getLevelStorageId(levelName) {
        const normalized = String(levelName || '').trim().toLowerCase();
        return encodeURIComponent(normalized || 'unnamed-level');
    }
    getPreviewIntent(nowMs) {
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
    spawnPatrolEnemiesFromLevel() {
        if (this.useSegmentEnemySpawns)
            return;
        const count = Math.max(0, this.patrolCount);
        if (count <= 0)
            return;
        const segments = [...this.segmentPlatforms].map((p) => p.shape).sort((a, b) => a.x - b.x);
        if (segments.length === 0)
            return;
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
    buildSegmentEnemyPlans() {
        if (!this.useSegmentEnemySpawns) {
            if (this.isEnemyPlanDebugEnabled())
                console.log('[EnemyDebug] skip buildSegmentEnemyPlans: segment mode disabled');
            return;
        }
        if (!Array.isArray(this.currentLevel.segmentEnemies) || this.currentLevel.segmentEnemies.length === 0) {
            if (this.isEnemyPlanDebugEnabled())
                console.log('[EnemyDebug] skip buildSegmentEnemyPlans: no segmentEnemies');
            return;
        }
        const segments = [...this.segmentPlatforms]
            .map((platform) => platform.shape)
            .sort((a, b) => a.x - b.x);
        if (segments.length === 0) {
            if (this.isEnemyPlanDebugEnabled())
                console.log('[EnemyDebug] skip buildSegmentEnemyPlans: no segment platforms');
            return;
        }
        const rawRows = this.currentLevel.segmentEnemies
            .map((row) => ({
            sourceIdx: Math.floor(Number(row?.segmentIndex)),
            patrolCount: Math.max(0, Math.floor(Number(row?.patrolCount) || 0)),
            flyingCount: Math.max(0, Math.floor(Number(row?.flyingCount) || 0)),
            flyingSpawnIntervalMs: (() => {
                const rawInterval = Number(row?.flyingSpawnIntervalMs);
                if (!Number.isFinite(rawInterval) || rawInterval <= 0)
                    return 0;
                return Math.max(500, Math.min(30000, Math.floor(rawInterval)));
            })()
        }))
            .filter((row) => Number.isFinite(row.sourceIdx));
        const maxSourceIdx = rawRows.reduce((max, row) => Math.max(max, row.sourceIdx), 0);
        const toSegmentIndex = (sourceIdx) => maxSourceIdx > 0
            ? Phaser.Math.Clamp(Math.round((Math.max(0, sourceIdx) / maxSourceIdx) * (segments.length - 1)), 0, segments.length - 1)
            : 0;
        const patrolAssigned = new Array(segments.length).fill(0);
        const flyingBySegment = new Map();
        const pickSpreadSegment = (preferredIdx) => {
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
                }
                else {
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
        const plans = [];
        for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
            const shape = segments[segmentIndex];
            const leftX = shape.x - shape.width / 2;
            const rightX = shape.x + shape.width / 2;
            const patrolCount = patrolAssigned[segmentIndex] || 0;
            const flyingMeta = flyingBySegment.get(segmentIndex);
            const flyingCount = flyingMeta?.flyingCount ?? 0;
            const flyingSpawnIntervalMs = flyingMeta?.flyingSpawnIntervalMs ?? 0;
            if (patrolCount + flyingCount <= 0 && flyingSpawnIntervalMs <= 0)
                continue;
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
        if (this.isEnemyPlanDebugEnabled()) {
            const mappingRows = rawRows.map((row) => ({
                sourceIdx: row.sourceIdx,
                mappedSegmentIdx: toSegmentIndex(row.sourceIdx),
                patrolCount: row.patrolCount,
                flyingSpawnIntervalMs: row.flyingSpawnIntervalMs
            }));
            const planRows = this.segmentEnemyPlans.map((plan) => ({
                segmentIndex: plan.segmentIndex,
                patrolCount: plan.patrolCount,
                flyingSpawnIntervalMs: plan.flyingSpawnIntervalMs,
                triggerX: Math.round(plan.triggerX)
            }));
            console.groupCollapsed('[EnemyDebug] segment enemy plans');
            console.table(mappingRows);
            console.table(planRows);
            console.groupEnd();
        }
        this.spawnSegmentPatrolAtLevelStart();
    }
    triggerSegmentEnemyPlansAt(playerX) {
        if (!this.useSegmentEnemySpawns || this.segmentEnemyPlans.length === 0)
            return;
        for (const plan of this.segmentEnemyPlans) {
            if (plan.triggered)
                continue;
            if (Number.isFinite(playerX) && playerX + this.player.width / 2 < plan.triggerX)
                continue;
            this.queueFlyingForPlan(plan);
            plan.triggered = true;
        }
    }
    spawnSegmentPatrolAtLevelStart() {
        for (const plan of this.segmentEnemyPlans) {
            this.spawnPatrolForPlan(plan);
        }
    }
    spawnPatrolForPlan(plan) {
        const laneLeft = Math.max(120, plan.leftX + 6);
        const laneRight = Math.min(this.worldWidth - 120, plan.rightX - 6);
        const midX = (laneLeft + laneRight) * 0.5;
        const laneWidth = Math.max(0, laneRight - laneLeft);
        const minSpacing = 34;
        const laneCapacity = Math.max(1, Math.floor(laneWidth / minSpacing) + 1);
        const spawnCount = Math.min(plan.patrolCount, laneCapacity);
        if (this.isEnemyPlanDebugEnabled()) {
            console.log('[EnemyDebug] patrol spawn', {
                segmentIndex: plan.segmentIndex,
                requested: plan.patrolCount,
                spawned: spawnCount,
                laneCapacity
            });
        }
        for (let i = 0; i < spawnCount; i++) {
            const t = (i + 1) / (spawnCount + 1);
            const x = laneRight > laneLeft ? laneLeft + (laneRight - laneLeft) * t : midX;
            const span = Math.max(52, Math.min(140, (laneRight - laneLeft) * 0.5));
            const minX = Math.max(120, x - span * 0.5);
            const maxX = Math.min(this.worldWidth - 120, x + span * 0.5);
            this.spawnPatrolEnemy(x, this.snapYToGrid(plan.platformTopY - PATROL_ENEMY_HEIGHT / 2), minX, maxX);
        }
    }
    queueFlyingForPlan(plan) {
        plan.pendingFlyingSpawns = Math.max(plan.flyingCount, plan.flyingSpawnIntervalMs > 0 ? 1 : 0);
        plan.nextFlyingSpawnMs = performance.now();
    }
    isEnemyPlanDebugEnabled() {
        try {
            if (typeof window === 'undefined')
                return false;
            const raw = new URLSearchParams(window.location.search).get('debugEnemyPlans');
            return raw === '1' || raw === 'true';
        }
        catch {
            return false;
        }
    }
    getInitialPlayerYFromPlatforms() {
        const playerHalfHeight = PLAYER_HEIGHT / 2;
        const step = WORLD_GRID_STEP;
        const targetX = this.playerStartX;
        const candidates = this.segmentPlatforms
            .map((platform) => platform.shape)
            .filter((shape) => Math.abs(shape.x - targetX) <= step * 3)
            .sort((a, b) => Math.abs(a.x - targetX) - Math.abs(b.x - targetX));
        const picked = candidates[0] ?? this.segmentPlatforms[0]?.shape;
        if (!picked)
            return this.groundY;
        const top = picked.y - picked.height / 2;
        return top - playerHalfHeight;
    }
    scaleEnemySpeed(baseSpeed, bpm) {
        const scaled = scaleSpeedByTempo(baseSpeed, bpm, DEFAULT_REFERENCE_BPM);
        return Phaser.Math.Clamp(scaled, baseSpeed * 0.35, baseSpeed * 3.5);
    }
    scaleSpawnIntervalMs(baseIntervalMs, bpm) {
        const scaled = scaleIntervalByTempo(baseIntervalMs, bpm, DEFAULT_REFERENCE_BPM);
        return Math.floor(Phaser.Math.Clamp(scaled, 250, 30000));
    }
    configureScreenUi(node) {
        if (!node)
            return;
        const zoom = Math.max(0.001, Number(this.cameras.main?.zoom) || 1);
        if (typeof node.setScrollFactor === 'function')
            node.setScrollFactor(0);
        const anyNode = node;
        if (!anyNode.__screenUiBase) {
            anyNode.__screenUiBase = {
                x: Number.isFinite(node.x) ? node.x : 0,
                y: Number.isFinite(node.y) ? node.y : 0,
                scaleX: Number.isFinite(node.scaleX) ? node.scaleX : 1,
                scaleY: Number.isFinite(node.scaleY) ? node.scaleY : 1
            };
        }
        const cameraWidth = Number(this.cameras.main?.width) || this.scale.width || 0;
        const cameraHeight = Number(this.cameras.main?.height) || this.scale.height || 0;
        const centerX = cameraWidth * 0.5;
        const centerY = cameraHeight * 0.5;
        if (Number.isFinite(anyNode.__screenUiBase.x)) {
            node.x = (anyNode.__screenUiBase.x - centerX) / zoom + centerX;
        }
        if (Number.isFinite(anyNode.__screenUiBase.y)) {
            node.y = (anyNode.__screenUiBase.y - centerY) / zoom + centerY;
        }
        if (typeof node.setScale === 'function') {
            node.setScale(anyNode.__screenUiBase.scaleX / zoom, anyNode.__screenUiBase.scaleY / zoom);
        }
    }
}
