import { LEVELS } from '../data/levels.js';
import type { LevelDefinition } from '../data/exampleLevel.js';

const BEST_TIME_STORAGE_PREFIX = 'sambo.level';
const VOLUME_STORAGE_KEY = 'sambo.masterVolume';
const FONT_UI = 'monospace';
const COLORS = {
  panelOverlay: 0x0c1322,
  text: '#d7e2ff',
  textDim: '#9db6de',
  listText: '#d7e2ff',
  listBg: '#1b2a45',
  listSelectedText: '#05070f',
  listSelectedBg: '#4cc9f0',
  accentWarm: '#f4d35e',
  accentCool: '#4cc9f0',
  track: 0x2a3244,
  trackFill: 0x4cc9f0,
  handle: 0xe8e6e3
} as const;

interface LevelEntry {
  name: string;
  data: LevelDefinition;
}

export class StartScene extends Phaser.Scene {
  private selectedLevel = 1;
  private volume = 0.5;
  private levelButtons: any[] = [];
  private playButton!: any;
  private volumeLabel!: any;
  private sliderTrack!: any;
  private sliderFill!: any;
  private sliderHandle!: any;
  private loadingText!: any;
  private readonly sliderWidth = 280;
  private levelEntries: LevelEntry[] = [];
  private levels: LevelDefinition[] = [];
  private levelNames: string[] = [];

  private levelListContainer!: any;
  private levelMaskGraphics!: any;
  private levelScrollbarTrack!: any;
  private levelScrollbarThumb!: any;
  private levelScrollOffset = 0;
  private levelScrollMax = 0;
  private levelScrollThumbHeight = 28;
  private readonly levelRowHeight = 34;
  private readonly levelViewport = { left: 260, top: 220, width: 430, height: 130 };
  private volumePreviewContext: AudioContext | null = null;
  private lastVolumePreviewMs = 0;

  constructor() {
    super('start');
  }

  create(): void {
    const data = (this.scene.settings.data || {}) as {
      levelIndex?: number;
      volume?: number;
      levels?: LevelDefinition[];
      levelNames?: string[];
    };
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    this.volume = Number.isFinite(data.volume) ? Phaser.Math.Clamp(Number(data.volume), 0, 1) : this.loadVolume();

    this.add.rectangle(480, 270, 960, 540, COLORS.panelOverlay, 0.66).setDepth(5);
    this.add
      .text(480, 86, 'SAMBO', {
        color: COLORS.text,
        fontFamily: FONT_UI,
        fontSize: '72px'
      })
      .setOrigin(0.5)
      .setDepth(6);
    this.add
      .text(480, 138, 'Rhythm Platformer', {
        color: COLORS.textDim,
        fontFamily: FONT_UI,
        fontSize: '24px'
      })
      .setOrigin(0.5)
      .setDepth(6);

    this.loadingText = this.add
      .text(480, 230, 'Loading levels from Levels/...', {
        color: COLORS.text,
        fontFamily: FONT_UI,
        fontSize: '18px'
      })
      .setOrigin(0.5)
      .setDepth(6);

    this.initLevels(data.levels, data.levelIndex, data.levelNames).then(() => {
      this.loadingText.setVisible(false);
      this.createLevelSelection();
      this.createVolumeSlider();
      this.createActions();
      this.scene.launch('game', {
        mode: 'preview',
        levelIndex: this.selectedLevel,
        volume: this.volume,
        levels: this.levels,
        levelNames: this.levelNames
      });
      this.scene.bringToTop('start');
    });
  }

  private async initLevels(
    levelsFromData: LevelDefinition[] | undefined,
    levelIndexFromData: number | undefined,
    levelNamesFromData: string[] | undefined
  ): Promise<void> {
    const apiEntries = await this.fetchLevelsFromApi();
    if (apiEntries.length > 0) {
      this.levelEntries = apiEntries;
    } else if (Array.isArray(levelsFromData) && levelsFromData.length > 0) {
      this.levelEntries = levelsFromData.map((data, i) => ({
        name: String(levelNamesFromData?.[i] || `level_${i + 1}.runtime.json`),
        data
      }));
    } else {
      this.levelEntries = LEVELS.map((data, i) => ({ name: `level_${i + 1}.runtime.json`, data }));
    }

    this.levels = this.levelEntries.map((entry) => entry.data);
    this.levelNames = this.levelEntries.map((entry) => entry.name);
    this.selectedLevel = this.resolveInitialLevel(levelIndexFromData);
  }

  private async fetchLevelsFromApi(): Promise<LevelEntry[]> {
    try {
      const response = await fetch('/api/levels');
      if (!response.ok) return [];
      const payload = await response.json();
      const rows = Array.isArray(payload.levels) ? payload.levels : [];
      const out: LevelEntry[] = [];

      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const name = typeof row.name === 'string' ? row.name : '';
        const level = (row as { data?: LevelDefinition }).data;
        if (!name || !level) continue;
        if (!level.midiPlayback || typeof level.midiPlayback !== 'object') continue;
        if (!Number.isFinite(Number(level.midiPlayback.ppq))) continue;
        if (!Number.isFinite(Number(level.midiPlayback.songEndTick))) continue;
        if (!Array.isArray(level.midiPlayback.tempoPoints) || level.midiPlayback.tempoPoints.length === 0) continue;
        if (!Array.isArray(level.midiPlayback.notes)) continue;
        if (!Array.isArray(level.platforms)) continue;
        out.push({ name, data: level });
      }
      return out;
    } catch {
      return [];
    }
  }

  private createLevelSelection(): void {
    this.add
      .text(480, 190, 'Select Level', {
        color: COLORS.text,
        fontFamily: FONT_UI,
        fontSize: '22px'
      })
      .setOrigin(0.5)
      .setDepth(6);

    this.levelListContainer = this.add.container(0, 0).setDepth(6);
    this.levelButtons = [];

    for (let idx = 0; idx < this.levelEntries.length; idx++) {
      const level = idx + 1;
      const entry = this.levelEntries[idx];
      const best = this.readBest(entry.name);
      const bestLabel = best === null ? '--:--.--' : this.formatElapsedTime(best);
      const row = this.add
        .text(
          this.levelViewport.left + 8,
          this.levelViewport.top + idx * this.levelRowHeight + this.levelRowHeight / 2,
          `${this.displayLevelName(entry.name)}   Best: ${bestLabel}`,
          {
            color: level === this.selectedLevel ? COLORS.listSelectedText : COLORS.listText,
            backgroundColor: level === this.selectedLevel ? COLORS.listSelectedBg : COLORS.listBg,
            fontFamily: FONT_UI,
            fontSize: '16px',
            padding: { left: 10, right: 10, top: 4, bottom: 4 }
          }
        )
        .setOrigin(0, 0.5)
        .setDepth(6)
        .setInteractive({ useHandCursor: true });

      row.on('pointerdown', () => {
        this.selectedLevel = level;
        this.refreshLevelButtons();
        this.scene.stop('game');
        this.scene.launch('game', {
          mode: 'preview',
          levelIndex: this.selectedLevel,
          volume: this.volume,
          levels: this.levels,
          levelNames: this.levelNames
        });
        this.scene.bringToTop('start');
      });
      this.levelButtons.push(row);
      this.levelListContainer.add(row);
    }

    this.levelMaskGraphics = this.make.graphics({});
    this.levelMaskGraphics.fillStyle(0xffffff, 1);
    this.levelMaskGraphics.fillRect(
      this.levelViewport.left,
      this.levelViewport.top,
      this.levelViewport.width,
      this.levelViewport.height
    );
    this.levelMaskGraphics.setVisible(false);
    this.levelListContainer.setMask(this.levelMaskGraphics.createGeometryMask());

    this.levelScrollbarTrack = this.add
      .rectangle(
        this.levelViewport.left + this.levelViewport.width + 16,
        this.levelViewport.top + this.levelViewport.height / 2,
        10,
        this.levelViewport.height,
        0x1b2a45,
        0.95
      )
      .setDepth(6)
      .setInteractive({ useHandCursor: true });

    this.levelScrollbarThumb = this.add
      .rectangle(
        this.levelScrollbarTrack.x,
        this.levelViewport.top + 14,
        12,
        28,
        0x4cc9f0,
        0.95
      )
      .setDepth(7)
      .setInteractive({ draggable: true, useHandCursor: true });

    this.input.setDraggable(this.levelScrollbarThumb);
    this.levelScrollbarThumb.on('drag', (pointer: any) => this.scrollFromThumbY(pointer.y));
    this.levelScrollbarTrack.on('pointerdown', (pointer: any) => this.scrollFromThumbY(pointer.y));
    this.input.on('wheel', (pointer: any, _gos: any, _dx: number, dy: number) => {
      if (
        pointer.x >= this.levelViewport.left &&
        pointer.x <= this.levelViewport.left + this.levelViewport.width + 30 &&
        pointer.y >= this.levelViewport.top &&
        pointer.y <= this.levelViewport.top + this.levelViewport.height
      ) {
        this.scrollLevelsBy(dy * 0.35);
      }
    });

    const contentHeight = this.levelEntries.length * this.levelRowHeight;
    this.levelScrollMax = Math.max(0, contentHeight - this.levelViewport.height);
    this.levelScrollOffset = 0;
    this.updateLevelListScrollVisuals();
    this.refreshLevelButtons();
  }

  private scrollLevelsBy(delta: number): void {
    this.levelScrollOffset = Phaser.Math.Clamp(this.levelScrollOffset + delta, 0, this.levelScrollMax);
    this.updateLevelListScrollVisuals();
  }

  private scrollFromThumbY(pointerY: number): void {
    if (this.levelScrollMax <= 0) return;
    const top = this.levelViewport.top + this.levelScrollThumbHeight / 2;
    const bottom = this.levelViewport.top + this.levelViewport.height - this.levelScrollThumbHeight / 2;
    const clamped = Phaser.Math.Clamp(pointerY, top, bottom);
    const ratio = (clamped - top) / Math.max(1, bottom - top);
    this.levelScrollOffset = ratio * this.levelScrollMax;
    this.updateLevelListScrollVisuals();
  }

  private updateLevelListScrollVisuals(): void {
    if (this.levelListContainer) this.levelListContainer.y = -this.levelScrollOffset;

    if (this.levelScrollMax <= 0) {
      this.levelScrollbarThumb.setVisible(false);
      return;
    }

    this.levelScrollbarThumb.setVisible(true);
    const contentHeight = this.levelEntries.length * this.levelRowHeight;
    this.levelScrollThumbHeight = Math.max(
      28,
      Math.min(this.levelViewport.height, (this.levelViewport.height * this.levelViewport.height) / Math.max(1, contentHeight))
    );
    this.levelScrollbarThumb.height = this.levelScrollThumbHeight;
    const top = this.levelViewport.top + this.levelScrollThumbHeight / 2;
    const bottom = this.levelViewport.top + this.levelViewport.height - this.levelScrollThumbHeight / 2;
    const ratio = this.levelScrollOffset / Math.max(1, this.levelScrollMax);
    this.levelScrollbarThumb.y = top + ratio * (bottom - top);
  }

  private refreshLevelButtons(): void {
    this.levelButtons.forEach((row, idx) => {
      const level = idx + 1;
      row.setColor(level === this.selectedLevel ? COLORS.listSelectedText : COLORS.listText);
      row.setBackgroundColor(level === this.selectedLevel ? COLORS.listSelectedBg : COLORS.listBg);
    });
  }

  private createVolumeSlider(): void {
    const y = 54;
    const xCenter = 790;
    this.volumeLabel = this.add
      .text(xCenter, y - 24, `Volume: ${Math.round(this.volume * 100)}%`, {
        color: COLORS.text,
        fontFamily: FONT_UI,
        fontSize: '16px'
      })
      .setOrigin(0.5)
      .setDepth(6);

    this.sliderTrack = this.add.rectangle(xCenter, y, 220, 8, COLORS.track, 0.95).setDepth(6);
    this.sliderFill = this.add.rectangle(xCenter - 110, y, 0, 8, COLORS.trackFill, 0.95).setOrigin(0, 0.5).setDepth(6);
    this.sliderHandle = this.add
      .circle(xCenter, y, 9, COLORS.handle, 0.95)
      .setDepth(6)
      .setInteractive({ draggable: true, useHandCursor: true });

    const setFromPointerX = (pointerX: number, playPreview = true): void => {
      const left = xCenter - 110;
      const right = xCenter + 110;
      const clamped = Phaser.Math.Clamp(pointerX, left, right);
      this.volume = Phaser.Math.Clamp((clamped - left) / 220, 0, 1);
      this.sliderHandle.x = clamped;
      this.sliderFill.width = clamped - left;
      this.volumeLabel.setText(`Volume: ${Math.round(this.volume * 100)}%`);
      if (playPreview) this.playVolumePreviewTone();
      this.saveVolume(this.volume);
      if (this.scene.isActive('game')) {
        this.scene.stop('game');
        this.scene.launch('game', {
          mode: 'preview',
          levelIndex: this.selectedLevel,
          volume: this.volume,
          levels: this.levels,
          levelNames: this.levelNames
        });
        this.scene.bringToTop('start');
      }
    };

    this.input.setDraggable(this.sliderHandle);
    this.sliderHandle.on('drag', (pointer: any) => setFromPointerX(pointer.x));
    this.sliderTrack.setInteractive({ useHandCursor: true }).on('pointerdown', (pointer: any) => setFromPointerX(pointer.x));
    setFromPointerX(xCenter - 110 + 220 * this.volume, false);
  }

  private playVolumePreviewTone(): void {
    try {
      const nowMs = performance.now();
      if (nowMs - this.lastVolumePreviewMs < 90) return;
      this.lastVolumePreviewMs = nowMs;

      if (!this.volumePreviewContext) this.volumePreviewContext = new AudioContext();
      if (this.volumePreviewContext.state === 'suspended') {
        this.volumePreviewContext.resume().catch(() => undefined);
        return;
      }

      const ctx = this.volumePreviewContext;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      const midi = 48 + Math.round(this.volume * 24);
      const frequency = 440 * Math.pow(2, (midi - 69) / 12);
      osc.type = 'triangle';
      osc.frequency.value = frequency;

      filter.type = 'lowpass';
      filter.frequency.value = 800 + this.volume * 2200;
      filter.Q.value = 1.2;

      const peak = Math.max(0.0001, 0.05 + this.volume * 0.2);
      const start = ctx.currentTime;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);

      osc.start(start);
      osc.stop(start + 0.16);
    } catch {
      // Ignore audio context failures.
    }
  }

  private createActions(): void {
    this.playButton = this.add
      .text(480, 440, 'Play Selected Level', {
        color: '#05070f',
        backgroundColor: COLORS.accentWarm,
        fontFamily: FONT_UI,
        fontSize: '28px',
        padding: { left: 16, right: 16, top: 8, bottom: 8 }
      })
      .setOrigin(0.5)
      .setDepth(6)
      .setInteractive({ useHandCursor: true });

    this.playButton.on('pointerdown', () => {
      this.scene.stop('game');
      this.scene.start('game', {
        mode: 'play',
        levelIndex: this.selectedLevel,
        volume: this.volume,
        levels: this.levels,
        levelNames: this.levelNames
      });
    });

    const editorLink = this.add
      .text(480, 494, 'Open Level Editor', {
        color: COLORS.accentCool,
        fontFamily: FONT_UI,
        fontSize: '20px'
      })
      .setOrigin(0.5)
      .setDepth(6)
      .setInteractive({ useHandCursor: true });

    editorLink.on('pointerdown', () => {
      if (typeof window !== 'undefined') window.location.href = '/editor.html';
    });

    const midiComposerLink = this.add
      .text(480, 524, 'Open MIDI Composer', {
        color: COLORS.accentCool,
        fontFamily: FONT_UI,
        fontSize: '18px'
      })
      .setOrigin(0.5)
      .setDepth(6)
      .setInteractive({ useHandCursor: true });

    midiComposerLink.on('pointerdown', () => {
      if (typeof window !== 'undefined') window.location.href = '/daw.html';
    });
  }

  private readBest(levelName: string): number | null {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      const raw = window.localStorage.getItem(this.bestTimeKey(levelName));
      if (!raw) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    } catch {
      return null;
    }
  }

  private bestTimeKey(levelName: string): string {
    const storageId = this.levelStorageId(levelName);
    return `${BEST_TIME_STORAGE_PREFIX}.name.${storageId}.bestTimeMs`;
  }

  private levelStorageId(levelName: string): string {
    const normalized = String(levelName || '').trim().toLowerCase();
    return encodeURIComponent(normalized || 'unnamed-level');
  }

  private loadVolume(): number {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return 0.5;
      const raw = window.localStorage.getItem(VOLUME_STORAGE_KEY);
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return 0.5;
      return Phaser.Math.Clamp(parsed, 0, 1);
    } catch {
      return 0.5;
    }
  }

  private saveVolume(value: number): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(VOLUME_STORAGE_KEY, String(Phaser.Math.Clamp(value, 0, 1)));
    } catch {
      // Ignore storage failures.
    }
  }

  private formatElapsedTime(ms: number): string {
    const safeMs = Math.max(0, Math.floor(ms));
    const minutes = Math.floor(safeMs / 60000);
    const seconds = Math.floor((safeMs % 60000) / 1000);
    const centiseconds = Math.floor((safeMs % 1000) / 10);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
  }

  private resolveInitialLevel(levelIndexFromData?: number): number {
    const cap = this.levels.length > 0 ? this.levels.length : LEVELS.length;
    if (Number.isFinite(levelIndexFromData)) {
      return Phaser.Math.Clamp(Math.floor(Number(levelIndexFromData)), 1, cap);
    }
    try {
      if (typeof window === 'undefined') return 1;
      const raw = new URLSearchParams(window.location.search).get('level');
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return 1;
      return Phaser.Math.Clamp(Math.floor(parsed), 1, cap);
    } catch {
      return 1;
    }
  }

  private displayLevelName(fileName: string): string {
    return String(fileName || '').replace(/\.runtime\.json$/i, '').replace(/\.json$/i, '');
  }
}
