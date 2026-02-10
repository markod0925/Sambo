#!/usr/bin/env python3
"""Generate audio_analysis.json + level_draft.json from a WAV file.

Usage:
  python scripts/audio_to_level.py --input song.wav --output-dir data
"""

from __future__ import annotations

import argparse
import json
import math
import wave
from pathlib import Path


def read_wav_mono(path: Path) -> tuple[int, list[float]]:
    with wave.open(str(path), 'rb') as wf:
        channels = wf.getnchannels()
        sample_rate = wf.getframerate()
        sample_width = wf.getsampwidth()
        frames = wf.readframes(wf.getnframes())

    if sample_width != 2:
        raise ValueError('Only 16-bit PCM WAV is supported for now.')

    import array

    data = array.array('h')
    data.frombytes(frames)

    if channels > 1:
        mono = []
        for i in range(0, len(data), channels):
            mono.append(sum(data[i : i + channels]) / channels)
    else:
        mono = list(data)

    max_amp = 32768.0
    return sample_rate, [x / max_amp for x in mono]


def rms_curve(samples: list[float], sample_rate: int, window_s: float) -> list[float]:
    win = max(1, int(sample_rate * window_s))
    out = []
    for i in range(0, len(samples), win):
        chunk = samples[i : i + win]
        if not chunk:
            continue
        rms = math.sqrt(sum(c * c for c in chunk) / len(chunk))
        out.append(rms)

    peak = max(out) if out else 1.0
    return [v / peak if peak > 0 else 0 for v in out]


def estimate_bpm(energy: list[float], window_s: float) -> int:
    if len(energy) < 8:
        return 120

    min_bpm, max_bpm = 70, 180
    best_lag = None
    best_score = -1.0

    for bpm in range(min_bpm, max_bpm + 1):
        beats_per_second = bpm / 60.0
        lag = max(1, int(round((1 / beats_per_second) / window_s)))
        if lag >= len(energy):
            continue

        score = 0.0
        for i in range(lag, len(energy)):
            score += energy[i] * energy[i - lag]

        if score > best_score:
            best_score = score
            best_lag = lag

    if not best_lag:
        return 120

    seconds_per_beat = best_lag * window_s
    return int(round(60 / seconds_per_beat))


def classify_energy(value: float) -> str:
    if value < 0.33:
        return 'low'
    if value < 0.66:
        return 'medium'
    return 'high'


def make_level_draft(energy_curve: list[float], beats_per_segment: int = 8) -> dict:
    segments = []
    for i, value in enumerate(energy_curve):
        state = classify_energy(value)
        if state == 'low':
            segment = {
                'index': i,
                'duration_beats': beats_per_segment,
                'energy_state': state,
                'platform_types': ['static'],
                'vertical_range': [0, 1],
                'rhythm_density': 0.25,
            }
        elif state == 'medium':
            segment = {
                'index': i,
                'duration_beats': beats_per_segment,
                'energy_state': state,
                'platform_types': ['static', 'beat'],
                'vertical_range': [0, 2],
                'rhythm_density': 0.5,
            }
        else:
            segment = {
                'index': i,
                'duration_beats': beats_per_segment,
                'energy_state': state,
                'platform_types': ['beat', 'ghost'],
                'vertical_range': [1, 3],
                'rhythm_density': 0.8,
            }
        segments.append(segment)

    return {'segments': segments}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True, help='Path to 16-bit PCM WAV')
    parser.add_argument('--output-dir', default='data', help='Output directory')
    parser.add_argument('--window', type=float, default=0.5, help='RMS window in seconds')
    parser.add_argument('--bpm', type=int, default=0, help='Optional manual BPM override')
    args = parser.parse_args()

    input_path = Path(args.input)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    sample_rate, samples = read_wav_mono(input_path)
    energy = rms_curve(samples, sample_rate, args.window)
    bpm = args.bpm if args.bpm > 0 else estimate_bpm(energy, args.window)

    analysis = {'bpm': bpm, 'energy_curve': energy}
    level_draft = make_level_draft(energy)

    (output_dir / 'audio_analysis.json').write_text(json.dumps(analysis, indent=2))
    (output_dir / 'level_draft.json').write_text(json.dumps(level_draft, indent=2))

    print(f'Wrote {output_dir / "audio_analysis.json"}')
    print(f'Wrote {output_dir / "level_draft.json"}')


if __name__ == '__main__':
    main()
