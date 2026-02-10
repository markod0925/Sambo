import { LEVELS } from '../data/levels.js';
import type { LevelDefinition } from '../data/exampleLevel.js';

const BEST_TIME_STORAGE_PREFIX = 'sambo.level';
const VOLUME_STORAGE_KEY = 'sambo.masterVolume';

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
  private levels: LevelDefinition[] = [];

  constructor() {
    super('start');
  }

  create(): void {
    const data = (this.scene.settings.data || {}) as { levelIndex?: number; volume?: number; levels?: LevelDefinition[] };
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    this.volume = Number.isFinite(data.volume) ? Phaser.Math.Clamp(Number(data.volume), 0, 1) : this.loadVolume();

    this.add.rectangle(480, 270, 960, 540, 0x02050f, 0.62).setDepth(5);
    this.add
      .text(480, 86, 'SAMBO', {
        color: '#e6f1ff',
        fontFamily: 'monospace',
        fontSize: '72px'
      })
      .setOrigin(0.5)
      .setDepth(6);
    this.add
      .text(480, 138, 'Rhythm Platformer', {
        color: '#9db6de',
        fontFamily: 'monospace',
        fontSize: '24px'
      })
      .setOrigin(0.5)
      .setDepth(6);

    this.loadingText = this.add
      .text(480, 230, 'Loading levels from Levels/...', {
        color: '#cdddf7',
        fontFamily: 'monospace',
        fontSize: '18px'
      })
      .setOrigin(0.5)
      .setDepth(6);

    this.initLevels(data.levels, data.levelIndex).then(() => {
      this.loadingText.setVisible(false);
      this.createLevelSelection();
      this.createVolumeSlider();
      this.createActions();
      this.scene.launch('game', { mode: 'preview', levelIndex: this.selectedLevel, volume: this.volume, levels: this.levels });
      this.scene.bringToTop('start');
    });
  }

  private async initLevels(levelsFromData: LevelDefinition[] | undefined, levelIndexFromData: number | undefined): Promise<void> {
    // Always refresh from Levels/ first, so new files appear immediately in Start Screen.
    this.levels = await this.fetchLevelsFromApi();
    if (this.levels.length === 0 && Array.isArray(levelsFromData) && levelsFromData.length > 0) {
      this.levels = levelsFromData;
    }
    if (this.levels.length === 0) this.levels = LEVELS;
    this.selectedLevel = this.resolveInitialLevel(levelIndexFromData);
  }

  private async fetchLevelsFromApi(): Promise<LevelDefinition[]> {
    try {
      const response = await fetch('/api/levels');
      if (!response.ok) return [];
      const payload = await response.json();
      const rows = Array.isArray(payload.levels) ? (payload.levels as LevelEntry[]) : [];
      const out: LevelDefinition[] = [];
      for (const row of rows) {
        if (!row || !row.data) continue;
        const level = row.data;
        if (!Number.isFinite(Number(level.bpm))) continue;
        if (!Number.isFinite(Number(level.gridColumns))) continue;
        if (!Array.isArray(level.notes) || !Array.isArray(level.platforms)) continue;
        out.push(level);
      }
      return out;
    } catch {
      return [];
    }
  }

  private createLevelSelection(): void {
    this.add
      .text(480, 190, 'Select Level', {
        color: '#d6e8ff',
        fontFamily: 'monospace',
        fontSize: '22px'
      })
      .setOrigin(0.5)
      .setDepth(6);

    const baseY = 230;
    this.levels.forEach((_, idx) => {
      const level = idx + 1;
      const best = this.readBest(level);
      const bestLabel = best === null ? '--:--.--' : this.formatElapsedTime(best);
      const row = this.add
        .text(480, baseY + idx * 34, `Level ${level}   Best: ${bestLabel}`, {
          color: level === this.selectedLevel ? '#0f172a' : '#dbeafe',
          backgroundColor: level === this.selectedLevel ? '#bfdbfe' : '#1f355b',
          fontFamily: 'monospace',
          fontSize: '20px',
          padding: { left: 10, right: 10, top: 4, bottom: 4 }
        })
        .setOrigin(0.5)
        .setDepth(6)
        .setInteractive({ useHandCursor: true });

      row.on('pointerdown', () => {
        this.selectedLevel = level;
        this.refreshLevelButtons();
        this.scene.stop('game');
        this.scene.launch('game', { mode: 'preview', levelIndex: this.selectedLevel, volume: this.volume, levels: this.levels });
        this.scene.bringToTop('start');
      });
      this.levelButtons.push(row);
    });
  }

  private refreshLevelButtons(): void {
    this.levelButtons.forEach((row, idx) => {
      const level = idx + 1;
      row.setColor(level === this.selectedLevel ? '#0f172a' : '#dbeafe');
      row.setBackgroundColor(level === this.selectedLevel ? '#bfdbfe' : '#1f355b');
    });
  }

  private createVolumeSlider(): void {
    const y = 360;
    this.volumeLabel = this.add
      .text(480, y - 30, `Volume: ${Math.round(this.volume * 100)}%`, {
        color: '#d6e8ff',
        fontFamily: 'monospace',
        fontSize: '20px'
      })
      .setOrigin(0.5)
      .setDepth(6);

    this.sliderTrack = this.add.rectangle(480, y, this.sliderWidth, 10, 0x1e3a66, 0.95).setDepth(6);
    this.sliderFill = this.add.rectangle(480 - this.sliderWidth / 2, y, 0, 10, 0x7dd3fc, 0.95).setOrigin(0, 0.5).setDepth(6);
    this.sliderHandle = this.add.circle(480, y, 11, 0xe2e8f0, 0.95).setDepth(6).setInteractive({ draggable: true, useHandCursor: true });

    const setFromPointerX = (pointerX: number): void => {
      const left = 480 - this.sliderWidth / 2;
      const right = 480 + this.sliderWidth / 2;
      const clamped = Phaser.Math.Clamp(pointerX, left, right);
      this.volume = Phaser.Math.Clamp((clamped - left) / this.sliderWidth, 0, 1);
      this.sliderHandle.x = clamped;
      this.sliderFill.width = clamped - left;
      this.volumeLabel.setText(`Volume: ${Math.round(this.volume * 100)}%`);
      this.saveVolume(this.volume);
      if (this.scene.isActive('game')) {
        this.scene.stop('game');
        this.scene.launch('game', { mode: 'preview', levelIndex: this.selectedLevel, volume: this.volume, levels: this.levels });
        this.scene.bringToTop('start');
      }
    };

    this.input.setDraggable(this.sliderHandle);
    this.sliderHandle.on('drag', (pointer: any) => setFromPointerX(pointer.x));
    this.sliderTrack.setInteractive({ useHandCursor: true }).on('pointerdown', (pointer: any) => setFromPointerX(pointer.x));
    setFromPointerX(480 - this.sliderWidth / 2 + this.sliderWidth * this.volume);
  }

  private createActions(): void {
    this.playButton = this.add
      .text(480, 430, 'Play Selected Level', {
        color: '#091221',
        backgroundColor: '#a7f3d0',
        fontFamily: 'monospace',
        fontSize: '28px',
        padding: { left: 16, right: 16, top: 8, bottom: 8 }
      })
      .setOrigin(0.5)
      .setDepth(6)
      .setInteractive({ useHandCursor: true });

    this.playButton.on('pointerdown', () => {
      this.scene.stop('game');
      this.scene.start('game', { mode: 'play', levelIndex: this.selectedLevel, volume: this.volume, levels: this.levels });
    });

    const editorLink = this.add
      .text(480, 490, 'Open Level Editor', {
        color: '#93c5fd',
        fontFamily: 'monospace',
        fontSize: '20px'
      })
      .setOrigin(0.5)
      .setDepth(6)
      .setInteractive({ useHandCursor: true });

    editorLink.on('pointerdown', () => {
      if (typeof window !== 'undefined') window.location.href = '/editor.html';
    });
  }

  private readBest(levelOneBasedIndex: number): number | null {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      const raw = window.localStorage.getItem(this.bestTimeKey(levelOneBasedIndex));
      if (!raw) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    } catch {
      return null;
    }
  }

  private bestTimeKey(levelOneBasedIndex: number): string {
    return `${BEST_TIME_STORAGE_PREFIX}.${Math.max(1, Math.floor(levelOneBasedIndex))}.bestTimeMs`;
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
}
