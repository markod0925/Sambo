import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Metronome } from '../dist/src/core/metronome.js';
import { updateIntensity, defaultIntensityConfig } from '../dist/src/core/intensity.js';
import {
  HARMONIC_BAND_COUNT,
  HARMONIC_INTENSITY_SMOOTH_TAU_SECONDS,
  HARMONIC_PC_SMOOTH_TAU_SECONDS,
  clearPitchClassBins,
  clampUnit,
  computeExponentialSmoothingAlpha,
  fillPitchClassBinsFromPitchCounts,
  smoothPitchClassBinsInPlace,
  smoothScalarExponential
} from '../dist/src/core/harmonicBands.js';
import { BeatSnapMover } from '../dist/src/core/beatMovement.js';
import {
  getTempoAtColumn,
  getTempoScale,
  normalizeTempoMap,
  scaleIntervalByTempo,
  scaleSpeedByTempo,
  stepTempoToward
} from '../dist/src/core/tempo.js';
import { resolveAudioQualitySettings } from '../dist/src/core/audioQuality.js';
import {
  buildGridMidiMapFromMidi,
  lowerBoundByEndTick,
  lowerBoundByStartTick,
  parseMidiToTickModel,
  upperBoundByEndTick,
  upperBoundByStartTick
} from '../dist/src/core/midi.js';
import {
  buildGridEventKey,
  computeLatenessMs,
  computeScheduledAtSec,
  deriveForwardSpeedSignal,
  isAudioUnderrun,
  planForwardGridEvents
} from '../dist/src/core/predictivePlayback.js';
import {
  getCrossOffsetSteps,
  getBeatPlatformState,
  getElevatorOffsetSteps,
  getShuttleOffsetSteps,
  isAlternateBeatPlatformSolid,
  isGhostPlatformSolid
} from '../dist/src/core/platforms.js';
import { classifyEnergy, generateSegments } from '../dist/src/core/levelGenerator.js';
import { resolveIntent } from '../dist/src/core/input.js';
import { applyDamage, resolveEnemyCollision, updateFlyingEnemy, updatePatrolEnemy } from '../dist/src/core/enemies.js';

test('metronome subdivision alignment works', () => {
  const metro = new Metronome(120, 4);
  assert.equal(metro.subdivisionIntervalMs, 125);
  assert.equal(metro.nextSubdivisionAt(1), 125);
  assert.equal(metro.nextSubdivisionAt(249), 250);
});

test('metronome keeps beat continuity when BPM changes at runtime', () => {
  const metro = new Metronome(120, 4);
  metro.setBpm(180, 250);
  assert.equal(metro.beatIndexAt(250), 0);
  assert.equal(metro.beatIndexAt(500), 1);
  assert.ok(Math.abs(metro.nextSubdivisionAt(251) - 333.3333333333333) < 1e-6);
});

test('intensity increases, decays and clamps at floor', () => {
  const up = updateIntensity(0.3, 'forward', 1, 1, defaultIntensityConfig);
  assert.equal(up, 0.6);

  const down = updateIntensity(0.3, 'idle', 0, 2, defaultIntensityConfig);
  assert.ok(Math.abs(down - 0.2) < 1e-9);

  const back = updateIntensity(0.8, 'backward', 1, 1, defaultIntensityConfig);
  assert.equal(back, 0.5);
});

test('harmonic helpers clamp and smooth deterministically', () => {
  assert.equal(HARMONIC_BAND_COUNT, 12);
  assert.equal(clampUnit(-1), 0);
  assert.equal(clampUnit(2), 1);
  assert.equal(clampUnit(0.4), 0.4);

  const alphaZero = computeExponentialSmoothingAlpha(0, HARMONIC_PC_SMOOTH_TAU_SECONDS);
  assert.equal(alphaZero, 0);
  const alphaPositive = computeExponentialSmoothingAlpha(0.016, HARMONIC_PC_SMOOTH_TAU_SECONDS);
  assert.ok(alphaPositive > 0 && alphaPositive < 1);

  const smoothed = smoothScalarExponential(0.2, 0.8, 0.016, HARMONIC_INTENSITY_SMOOTH_TAU_SECONDS);
  assert.ok(smoothed > 0.2 && smoothed < 0.8);
});

test('harmonic pitch-class bins normalize by max bin and keep silence stable', () => {
  const bins = new Float32Array(HARMONIC_BAND_COUNT);
  fillPitchClassBinsFromPitchCounts(new Map(), bins);
  assert.deepEqual(Array.from(bins), new Array(HARMONIC_BAND_COUNT).fill(0));

  const counts = new Map([
    [60, 2],
    [72, 1],
    [61, 1]
  ]);
  fillPitchClassBinsFromPitchCounts(counts, bins);
  assert.equal(bins[0], 1);
  assert.ok(Math.abs(bins[1] - 1 / 3) < 1e-6);
  for (let i = 2; i < HARMONIC_BAND_COUNT; i++) assert.equal(bins[i], 0);
});

test('harmonic smoothing moves toward target bins without allocations', () => {
  const current = new Float32Array(HARMONIC_BAND_COUNT);
  const target = new Float32Array(HARMONIC_BAND_COUNT);
  target[3] = 1;
  target[9] = 0.5;

  smoothPitchClassBinsInPlace(current, target, 0.05, HARMONIC_PC_SMOOTH_TAU_SECONDS);
  assert.ok(current[3] > 0 && current[3] < 1);
  assert.ok(current[9] > 0 && current[9] < 0.5);

  clearPitchClassBins(target);
  smoothPitchClassBinsInPlace(current, target, 0.05, HARMONIC_PC_SMOOTH_TAU_SECONDS);
  assert.ok(current[3] < 1);
  assert.ok(current[9] < 0.5);
});

test('beat snapped mover arrives exactly on subdivision', () => {
  const metro = new Metronome(120, 4);
  const mover = new BeatSnapMover(metro, 64);

  mover.enqueue('forward');
  let move = mover.update(10);
  assert.equal(move.arrived, false);
  move = mover.update(70);
  assert.equal(move.arrived, false);
  assert.ok(move.x > 0 && move.x < 64);
  move = mover.update(125);
  assert.equal(move.arrived, true);
  assert.equal(move.x, 64);
});

test('beat snapped mover moves faster at higher BPM while keeping beat arrival lock', () => {
  const fastMover = new BeatSnapMover(new Metronome(120, 4), 64);
  const slowMover = new BeatSnapMover(new Metronome(70, 4), 64);

  fastMover.enqueue('forward');
  slowMover.enqueue('forward');
  fastMover.update(0);
  slowMover.update(0);

  const fastMid = fastMover.update(100);
  const slowMid = slowMover.update(100);
  assert.ok(fastMid.x > slowMid.x);
  assert.equal(fastMid.arrived, false);
  assert.equal(slowMid.arrived, false);

  const fastEnd = fastMover.update(125);
  assert.equal(fastEnd.arrived, true);
  assert.equal(fastEnd.x, 64);
});

test('tempo scaling helpers map speed and interval to BPM', () => {
  assert.equal(getTempoScale(120), 1);
  assert.equal(getTempoScale(70), 70 / 120);
  assert.equal(scaleSpeedByTempo(90, 120), 90);
  assert.equal(scaleSpeedByTempo(90, 60), 45);
  assert.equal(scaleIntervalByTempo(1000, 120), 1000);
  assert.equal(scaleIntervalByTempo(1000, 240), 500);
});

test('tempo map helpers normalize and pick BPM by grid column', () => {
  const map = normalizeTempoMap([
    { startColumn: 12, bpm: 90 },
    { startColumn: 4, bpm: 140 },
    { startColumn: 4, bpm: 132 }
  ]);
  assert.deepEqual(map, [
    { startColumn: 0, bpm: 120 },
    { startColumn: 4, bpm: 132 },
    { startColumn: 12, bpm: 90 }
  ]);
  assert.equal(getTempoAtColumn(map, 0).bpm, 120);
  assert.equal(getTempoAtColumn(map, 9).bpm, 132);
  assert.equal(getTempoAtColumn(map, 40).bpm, 90);
});

test('tempo smoothing approaches target BPM at configured rate', () => {
  const atHalfSecond = stepTempoToward(120, 180, 40, 0.5);
  assert.equal(atHalfSecond, 140);

  const atOneSecond = stepTempoToward(atHalfSecond, 180, 40, 1);
  assert.equal(atOneSecond, 180);
});

test('audio quality resolver merges presets and bounded overrides', () => {
  const perf = resolveAudioQualitySettings('performance');
  assert.equal(perf.mode, 'performance');
  assert.equal(perf.maxPolyphony, 4);
  assert.equal(perf.synthStyle, 'game');

  const custom = resolveAudioQualitySettings('high', {
    maxPolyphony: 20,
    schedulerLookaheadMs: 5,
    schedulerLeadMs: 100,
    saturationAmount: 0.8,
    synthStyle: 'game'
  });
  assert.equal(custom.mode, 'high');
  assert.equal(custom.maxPolyphony, 12);
  assert.equal(custom.schedulerLookaheadMs, 8);
  assert.equal(custom.schedulerLeadMs, 40);
  assert.equal(custom.saturationAmount, 0.4);
  assert.equal(custom.synthStyle, 'game');
});

test('grid midi map preserves note on/off timing and ignores drum channel', () => {
  const parsed = {
    durationSec: 2,
    initialBpm: 120,
    notes: [
      { startSec: 0, endSec: 1, midiNote: 60, velocity: 1, channel: 0 },
      { startSec: 1, endSec: 2, midiNote: 64, velocity: 0.8, channel: 0 },
      { startSec: 0.5, endSec: 0.9, midiNote: 36, velocity: 1, channel: 9 }
    ]
  };
  const grid = buildGridMidiMapFromMidi(parsed, 8, { maxChannels: 1, minMidiNote: 48, maxMidiNote: 84 });

  assert.equal(grid.eventsByColumn.length, 8);
  assert.deepEqual(grid.selectedChannels, [0]);
  assert.equal(grid.eventsByColumn[0].on.length, 1);
  assert.equal(grid.eventsByColumn[0].off.length, 0);
  assert.equal(grid.eventsByColumn[4].off.length, 1);
  assert.equal(grid.eventsByColumn[4].on.length, 1);
  assert.equal(grid.eventsByColumn[7].off.length, 1);
});

test('grid midi map keeps silence when no playable channels are selected', () => {
  const parsed = {
    durationSec: 1,
    initialBpm: 120,
    notes: [{ startSec: 0, endSec: 0.5, midiNote: 36, velocity: 1, channel: 9 }]
  };
  const grid = buildGridMidiMapFromMidi(parsed, 4, { maxChannels: 2, minMidiNote: 48, maxMidiNote: 84 });
  const hasAnyEvent = grid.eventsByColumn.some((column) => column.on.length > 0 || column.off.length > 0);
  assert.equal(hasAnyEvent, false);
});

test('predictive playback derives forward speed and bounded lookahead from step duration', () => {
  const medium = deriveForwardSpeedSignal({
    inputDirection: 'forward',
    activeStepDirection: 'forward',
    activeStepDurationMs: 250
  });
  assert.equal(medium.coherentForward, true);
  assert.equal(medium.stepDurationMs, 250);
  assert.ok(Math.abs(medium.cellsPerSecond - 4) < 1e-9);
  assert.equal(medium.lookaheadSteps, 2);

  const fast = deriveForwardSpeedSignal({
    inputDirection: 'forward',
    activeStepDirection: 'forward',
    activeStepDurationMs: 100
  });
  assert.equal(fast.lookaheadSteps, 3);
});

test('predictive playback falls back to average duration and disables on non-forward input', () => {
  const fallback = deriveForwardSpeedSignal({
    inputDirection: 'forward',
    activeStepDirection: null,
    averageStepDurationMs: 500
  });
  assert.equal(fallback.coherentForward, true);
  assert.equal(fallback.stepDurationMs, 500);
  assert.equal(fallback.lookaheadSteps, 1);

  const idle = deriveForwardSpeedSignal({
    inputDirection: 'idle',
    averageStepDurationMs: 250
  });
  assert.equal(idle.coherentForward, false);
  assert.equal(idle.lookaheadSteps, 0);

  const backward = deriveForwardSpeedSignal({
    inputDirection: 'backward',
    activeStepDirection: 'backward',
    activeStepDurationMs: 250
  });
  assert.equal(backward.coherentForward, false);
  assert.equal(backward.lookaheadSteps, 0);
});

test('predictive planner clamps forward events at level end and builds rounded dedupe keys', () => {
  const planned = planForwardGridEvents({
    fromColumn: 27,
    maxColumn: 28,
    firstTargetTimeMs: 1000,
    stepDurationMs: 250,
    lookaheadSteps: 3
  });
  assert.equal(planned.length, 1);
  assert.equal(planned[0].gridIndex, 28);
  assert.equal(planned[0].eventKey, buildGridEventKey('forward', 28, 1000));
  assert.equal(buildGridEventKey('forward', 4, 1234.4), 'forward:4:1234');
  assert.equal(buildGridEventKey('forward', 4, 1234.6), 'forward:4:1235');
});

test('scheduler helpers keep target-time ordering and underrun threshold behavior', () => {
  const nowCtx = 10;
  const nowMs = 1000;
  const scheduled = [1015, 1060, 1200].map((targetMs) => computeScheduledAtSec(nowCtx, nowMs, targetMs, 12));
  assert.ok(scheduled[0] < scheduled[1] && scheduled[1] < scheduled[2]);

  assert.equal(computeLatenessMs(1040, 1010), 30);
  assert.equal(computeLatenessMs(1000, 1010), 0);
  assert.equal(isAudioUnderrun(30, 30), false);
  assert.equal(isAudioUnderrun(31, 30), true);
});

test('beat and ghost platform state transitions', () => {
  assert.equal(getBeatPlatformState(1), 'solid');
  assert.equal(getBeatPlatformState(2), 'fadeOut');
  assert.equal(getBeatPlatformState(3), 'gone');
  assert.equal(getBeatPlatformState(4), 'fadeIn');

  assert.equal(isAlternateBeatPlatformSolid(1), true);
  assert.equal(isAlternateBeatPlatformSolid(2), false);
  assert.equal(isAlternateBeatPlatformSolid(3), true);
  assert.equal(isAlternateBeatPlatformSolid(4), false);

  assert.equal(isGhostPlatformSolid('backward'), true);
  assert.equal(isGhostPlatformSolid('forward'), false);
});

test('elevator platform follows 4-up and 4-down beat loop', () => {
  const offsets = Array.from({ length: 10 }, (_, beat) => getElevatorOffsetSteps(beat));
  assert.deepEqual(offsets, [0, 1, 2, 3, 4, 3, 2, 1, 0, 1]);
});

test('shuttle platform follows 0-1-2-3-4-3-2-1 loop', () => {
  const offsets = Array.from({ length: 10 }, (_, beat) => getShuttleOffsetSteps(beat));
  assert.deepEqual(offsets, [0, 1, 2, 3, 4, 3, 2, 1, 0, 1]);
});

test('cross platform follows down-left-up-right loop', () => {
  const offsets = Array.from({ length: 6 }, (_, beat) => getCrossOffsetSteps(beat));
  assert.deepEqual(offsets, [
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 }
  ]);
});

test('energy classification and segment generation follow templates', () => {
  assert.equal(classifyEnergy(0.2), 'low');
  assert.equal(classifyEnergy(0.5), 'medium');
  assert.equal(classifyEnergy(0.9), 'high');

  const segments = generateSegments({ bpm: 120, energy_curve: [0.1, 0.2, 0.8, 0.9] }, 2);
  assert.equal(segments.length, 2);
  assert.deepEqual(segments[0].platformTypes, ['static', 'beat', 'alternateBeat']);
  assert.deepEqual(segments[1].platformTypes, [
    'static',
    'beat',
    'alternateBeat',
    'ghost',
    'reverseGhost',
    'elevator',
    'shuttle',
    'cross',
    'spring'
  ]);
});

test('input resolver supports movement and jump intent', () => {
  assert.deepEqual(resolveIntent({ left: true, right: false, jumpPressed: false }), { direction: 'backward', jump: false });
  assert.deepEqual(resolveIntent({ left: false, right: true, jumpPressed: true }), { direction: 'forward', jump: true });
  assert.deepEqual(resolveIntent({ left: false, right: false, jumpPressed: true }), { direction: 'idle', jump: true });
});

test('enemy collisions: stomp vs damage and life decrement', () => {
  const enemy = { x: 100, y: 100, width: 30, height: 24 };

  const stompPlayer = { x: 102, y: 68, width: 24, height: 38 };
  assert.deepEqual(resolveEnemyCollision(stompPlayer, enemy, 120), { stomp: true, damage: false });

  const sidePlayer = { x: 118, y: 92, width: 24, height: 38 };
  assert.deepEqual(resolveEnemyCollision(sidePlayer, enemy, 0), { stomp: false, damage: true });

  assert.equal(applyDamage(5), 4);
  assert.equal(applyDamage(1, 3), 0);
});

test('patrol enemy reverses at min/max bounds', () => {
  let enemy = { x: 10, speed: 20, direction: -1, minX: 10, maxX: 40 };
  enemy = updatePatrolEnemy(enemy, 0.5);
  assert.equal(enemy.x, 10);
  assert.equal(enemy.direction, 1);

  enemy = { x: 39, speed: 10, direction: 1, minX: 10, maxX: 40 };
  enemy = updatePatrolEnemy(enemy, 0.2);
  assert.equal(enemy.x, 40);
  assert.equal(enemy.direction, -1);
});

test('flying enemy moves left, homes vertically, and deactivates offscreen', () => {
  let flying = { x: 100, y: 100, speedX: 50, homingRate: 20, active: true };
  flying = updateFlyingEnemy(flying, 140, 1, -20);
  assert.equal(flying.x, 50);
  assert.equal(flying.y, 120);
  assert.equal(flying.active, true);

  flying = updateFlyingEnemy(flying, 160, 2, -20);
  assert.equal(flying.active, false);
});

function writeUint16(value) {
  return [(value >> 8) & 0xff, value & 0xff];
}

function writeUint32(value) {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function encodeVarLen(value) {
  let v = Math.max(0, Math.floor(value));
  const bytes = [v & 0x7f];
  v >>= 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return bytes;
}

function asciiBytes(text) {
  return Array.from(text).map((ch) => ch.charCodeAt(0));
}

function buildMidiBytesForTest({ ppq, tempoPoints, notesByStart, songEndTick }) {
  const tracks = [];
  const maxTrackId = notesByStart.reduce((max, note) => Math.max(max, Number(note.trackId) || 0), 0);
  const noteTracks = Array.from({ length: maxTrackId + 1 }, () => []);
  const tempoTrack = [];

  for (const tempo of tempoPoints) {
    const usPerQuarter = Math.max(1, Math.floor(tempo.usPerQuarter));
    tempoTrack.push({
      tick: Math.max(0, Math.floor(tempo.tick)),
      order: 0,
      bytes: [0xff, 0x51, 0x03, (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff]
    });
  }

  for (const note of notesByStart) {
    const trackId = Math.max(0, Math.floor(note.trackId || 0));
    const channel = Math.max(0, Math.min(15, Math.floor(note.channel || 0)));
    const pitch = Math.max(0, Math.min(127, Math.floor(note.pitch || 0)));
    const velocity = Math.max(1, Math.min(127, Math.floor(note.velocity || 100)));
    const onStatus = 0x90 | channel;
    const offStatus = 0x80 | channel;
    noteTracks[trackId].push({ tick: Math.floor(note.startTick), order: 2, bytes: [onStatus, pitch, velocity] });
    noteTracks[trackId].push({ tick: Math.floor(note.endTick), order: 1, bytes: [offStatus, pitch, 0] });
  }

  const endTick = Math.max(
    Math.floor(songEndTick || 0),
    notesByStart.reduce((max, note) => Math.max(max, Math.floor(note.endTick || 0)), 0),
    tempoPoints.reduce((max, tempo) => Math.max(max, Math.floor(tempo.tick || 0)), 0)
  );

  function trackBytes(events) {
    const sorted = [...events, { tick: endTick, order: 9, bytes: [0xff, 0x2f, 0x00] }].sort(
      (a, b) => a.tick - b.tick || a.order - b.order
    );
    const out = [];
    let lastTick = 0;
    for (const event of sorted) {
      const delta = event.tick - lastTick;
      lastTick = event.tick;
      out.push(...encodeVarLen(delta), ...event.bytes);
    }
    return out;
  }

  tracks.push(trackBytes(tempoTrack));
  for (const events of noteTracks) tracks.push(trackBytes(events));

  const header = [...asciiBytes('MThd'), ...writeUint32(6), ...writeUint16(1), ...writeUint16(tracks.length), ...writeUint16(ppq)];
  const chunks = [];
  for (const track of tracks) {
    chunks.push(...asciiBytes('MTrk'), ...writeUint32(track.length), ...track);
  }

  return new Uint8Array([...header, ...chunks]);
}

test('tick-model parser keeps tempo changes and note intervals on Bohemian Rhapsody', () => {
  const midiPath = new URL('../MIDI/Bohemian Rhapsody.mid', import.meta.url);
  const bytes = fs.readFileSync(midiPath);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const parsed = parseMidiToTickModel(arrayBuffer);

  assert.ok(parsed.ppq > 0);
  assert.ok(parsed.tempoPoints.length > 1);
  assert.ok(parsed.notesByStart.length > 100);
  assert.equal(parsed.notesByStart.length, parsed.notesByEnd.length);
  assert.ok(parsed.songEndTick > 0);
});

test('tick-model parser supports overlap and NoteOn velocity zero as NoteOff', () => {
  const ppq = 480;
  const events = [
    { tick: 0, order: 0, bytes: [0xff, 0x51, 0x03, 0x07, 0xa1, 0x20] }, // 500000 us/qn
    { tick: 0, order: 1, bytes: [0x90, 60, 100] },
    { tick: 120, order: 1, bytes: [0x90, 60, 90] },
    { tick: 240, order: 1, bytes: [0x90, 60, 0] }, // NoteOff via NoteOn vel0
    { tick: 360, order: 1, bytes: [0x80, 60, 0] },
    { tick: 360, order: 9, bytes: [0xff, 0x2f, 0x00] }
  ].sort((a, b) => a.tick - b.tick || a.order - b.order);

  const track = [];
  let last = 0;
  for (const event of events) {
    track.push(...encodeVarLen(event.tick - last), ...event.bytes);
    last = event.tick;
  }

  const bytes = new Uint8Array([
    ...asciiBytes('MThd'),
    ...writeUint32(6),
    ...writeUint16(0),
    ...writeUint16(1),
    ...writeUint16(ppq),
    ...asciiBytes('MTrk'),
    ...writeUint32(track.length),
    ...track
  ]);

  const parsed = parseMidiToTickModel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert.equal(parsed.notesByStart.length, 2);
  assert.deepEqual(
    parsed.notesByStart.map((note) => [note.startTick, note.endTick]),
    [
      [0, 360],
      [120, 240]
    ]
  );
});

test('tick-model roundtrip keeps event counts and song length', () => {
  const midiPath = new URL('../MIDI/Bohemian Rhapsody.mid', import.meta.url);
  const bytes = fs.readFileSync(midiPath);
  const original = parseMidiToTickModel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const rebuiltBytes = buildMidiBytesForTest(original);
  const reparsed = parseMidiToTickModel(rebuiltBytes.buffer.slice(rebuiltBytes.byteOffset, rebuiltBytes.byteOffset + rebuiltBytes.byteLength));

  assert.equal(reparsed.tempoPoints.length, original.tempoPoints.length);
  assert.equal(reparsed.notesByStart.length, original.notesByStart.length);
  assert.equal(reparsed.notesByEnd.length, original.notesByEnd.length);
  assert.equal(reparsed.songEndTick, original.songEndTick);
});

test('tick range lower bounds support forward and reverse scrub slices', () => {
  const notesByStart = [
    { startTick: 0, endTick: 120, pitch: 60, velocity: 100, trackId: 0, channel: 0 },
    { startTick: 60, endTick: 240, pitch: 64, velocity: 100, trackId: 0, channel: 0 },
    { startTick: 180, endTick: 360, pitch: 67, velocity: 100, trackId: 0, channel: 0 }
  ];
  const notesByEnd = [...notesByStart].sort((a, b) => a.endTick - b.endTick);

  // Forward window: starts in (60, 200] -> start ticks 180 only.
  const fStart = lowerBoundByStartTick(notesByStart, 61);
  const fEnd = lowerBoundByStartTick(notesByStart, 201);
  assert.deepEqual(notesByStart.slice(fStart, fEnd).map((note) => note.startTick), [180]);

  // Reverse window: ends in [120, 300) -> end ticks 120 and 240.
  const rStart = lowerBoundByEndTick(notesByEnd, 120);
  const rEnd = lowerBoundByEndTick(notesByEnd, 300);
  assert.deepEqual(notesByEnd.slice(rStart, rEnd).map((note) => note.endTick), [120, 240]);
});

test('tick range upper bounds include reverse boundary crossings at integer ticks', () => {
  const notesByStart = [
    { startTick: 80, endTick: 100, pitch: 60, velocity: 100, trackId: 0, channel: 0 },
    { startTick: 100, endTick: 140, pitch: 64, velocity: 100, trackId: 0, channel: 0 },
    { startTick: 140, endTick: 180, pitch: 67, velocity: 100, trackId: 0, channel: 0 }
  ];
  const notesByEnd = [...notesByStart].sort((a, b) => a.endTick - b.endTick);

  const prevTick = 100.1;
  const nowTick = 99.9;

  const reverseEndFrom = upperBoundByEndTick(notesByEnd, nowTick);
  const reverseEndTo = upperBoundByEndTick(notesByEnd, prevTick);
  assert.deepEqual(notesByEnd.slice(reverseEndFrom, reverseEndTo).map((note) => note.endTick), [100]);

  const reverseStartFrom = upperBoundByStartTick(notesByStart, nowTick);
  const reverseStartTo = upperBoundByStartTick(notesByStart, prevTick);
  assert.deepEqual(notesByStart.slice(reverseStartFrom, reverseStartTo).map((note) => note.startTick), [100]);
});
