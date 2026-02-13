export type AudioQualityMode = 'performance' | 'balanced' | 'high';
export type AudioSynthStyle = 'game' | 'editorLike';

export interface AudioQualityOverrides {
  maxPolyphony?: number;
  schedulerLookaheadMs?: number;
  schedulerLeadMs?: number;
  saturationAmount?: number;
  musicGain?: number;
  metronomeGain?: number;
  metronomeDuckAmount?: number;
  synthStyle?: AudioSynthStyle;
}

export interface AudioQualitySettings {
  mode: AudioQualityMode;
  maxPolyphony: number;
  schedulerLookaheadMs: number;
  schedulerLeadMs: number;
  saturationAmount: number;
  musicGain: number;
  metronomeGain: number;
  metronomeDuckAmount: number;
  synthStyle: AudioSynthStyle;
}

const PRESETS: Record<AudioQualityMode, Omit<AudioQualitySettings, 'mode'>> = {
  performance: {
    maxPolyphony: 4,
    schedulerLookaheadMs: 24,
    schedulerLeadMs: 10,
    saturationAmount: 0.0,
    musicGain: 0.95,
    metronomeGain: 1.0,
    metronomeDuckAmount: 0.1,
    synthStyle: 'game'
  },
  balanced: {
    maxPolyphony: 6,
    schedulerLookaheadMs: 20,
    schedulerLeadMs: 12,
    saturationAmount: 0.08,
    musicGain: 0.98,
    metronomeGain: 1.0,
    metronomeDuckAmount: 0.12,
    synthStyle: 'game'
  },
  high: {
    maxPolyphony: 8,
    schedulerLookaheadMs: 16,
    schedulerLeadMs: 14,
    saturationAmount: 0.03,
    musicGain: 1.0,
    metronomeGain: 1.02,
    metronomeDuckAmount: 0.14,
    synthStyle: 'editorLike'
  }
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function coerceMode(mode: unknown): AudioQualityMode {
  if (mode === 'performance' || mode === 'balanced' || mode === 'high') return mode;
  return 'balanced';
}

export function resolveAudioQualitySettings(mode: unknown, overrides?: AudioQualityOverrides): AudioQualitySettings {
  const resolvedMode = coerceMode(mode);
  const preset = PRESETS[resolvedMode];
  const input = overrides || {};
  const synthStyle = input.synthStyle === 'editorLike' || input.synthStyle === 'game' ? input.synthStyle : preset.synthStyle;
  return {
    mode: resolvedMode,
    maxPolyphony: clamp(Math.floor(Number(input.maxPolyphony) || preset.maxPolyphony), 2, 12),
    schedulerLookaheadMs: clamp(Number(input.schedulerLookaheadMs) || preset.schedulerLookaheadMs, 8, 60),
    schedulerLeadMs: clamp(Number(input.schedulerLeadMs) || preset.schedulerLeadMs, 4, 40),
    saturationAmount: clamp(Number(input.saturationAmount) || preset.saturationAmount, 0, 0.4),
    musicGain: clamp(Number(input.musicGain) || preset.musicGain, 0.3, 1.2),
    metronomeGain: clamp(Number(input.metronomeGain) || preset.metronomeGain, 0.2, 1.5),
    metronomeDuckAmount: clamp(Number(input.metronomeDuckAmount) || preset.metronomeDuckAmount, 0, 0.4),
    synthStyle
  };
}
