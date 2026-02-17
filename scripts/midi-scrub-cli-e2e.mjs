import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  normalizeMidiTickModel,
  upperBoundByEndTick,
  upperBoundByStartTick
} from '../dist/src/core/midi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEVELS_DIR = path.resolve(__dirname, '..', 'Levels');
const LOCAL_BOUNDARY_EPSILON = 0.2;
const MAX_BOUNDARY_SAMPLES = 320;

function noteKey(note) {
  return `${note.trackId}:${note.channel}:${note.pitch}`;
}

function addVoiceCount(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function removeVoiceCount(map, key) {
  const current = map.get(key) ?? 0;
  if (current <= 0) {
    throw new Error(`Voice-count underflow for key=${key}`);
  }
  if (current === 1) {
    map.delete(key);
    return;
  }
  map.set(key, current - 1);
}

function clampTick(model, tick) {
  const safe = Number.isFinite(tick) ? tick : 0;
  return Math.max(0, Math.min(model.songEndTick, safe));
}

function rebuildVoiceCountsAtTick(model, tick) {
  const safeTick = clampTick(model, tick);
  const counts = new Map();
  for (const note of model.notesByStart) {
    if (note.startTick > safeTick) break;
    if (note.endTick <= safeTick) continue;
    addVoiceCount(counts, noteKey(note));
  }
  return counts;
}

function applyIncrementalStep(model, activeCounts, prevTick, nowTick, scrubThresholdTick) {
  const delta = nowTick - prevTick;
  if (Math.abs(delta) < 0.001) return;

  if (Math.abs(delta) > scrubThresholdTick) {
    const rebuilt = rebuildVoiceCountsAtTick(model, nowTick);
    activeCounts.clear();
    for (const [key, count] of rebuilt.entries()) activeCounts.set(key, count);
    return;
  }

  const notesByStart = model.notesByStart;
  const notesByEnd = model.notesByEnd;

  if (delta > 0) {
    const startFrom = upperBoundByStartTick(notesByStart, prevTick);
    const startTo = upperBoundByStartTick(notesByStart, nowTick);
    const endFrom = upperBoundByEndTick(notesByEnd, prevTick);
    const endTo = upperBoundByEndTick(notesByEnd, nowTick);

    for (let i = startFrom; i < startTo; i++) addVoiceCount(activeCounts, noteKey(notesByStart[i]));
    for (let i = endFrom; i < endTo; i++) removeVoiceCount(activeCounts, noteKey(notesByEnd[i]));
    return;
  }

  const endFrom = upperBoundByEndTick(notesByEnd, nowTick);
  const endTo = upperBoundByEndTick(notesByEnd, prevTick);
  const startFrom = upperBoundByStartTick(notesByStart, nowTick);
  const startTo = upperBoundByStartTick(notesByStart, prevTick);

  for (let i = endFrom; i < endTo; i++) addVoiceCount(activeCounts, noteKey(notesByEnd[i]));
  for (let i = startFrom; i < startTo; i++) removeVoiceCount(activeCounts, noteKey(notesByStart[i]));
}

function voiceCountsEqual(actual, expected) {
  if (actual.size !== expected.size) return false;
  for (const [key, count] of actual.entries()) {
    if ((expected.get(key) ?? 0) !== count) return false;
  }
  return true;
}

function summarizeVoiceDiff(actual, expected, maxItems = 6) {
  const keys = new Set([...actual.keys(), ...expected.keys()]);
  const diff = [];
  for (const key of keys) {
    const actualCount = actual.get(key) ?? 0;
    const expectedCount = expected.get(key) ?? 0;
    if (actualCount === expectedCount) continue;
    diff.push(`${key} actual=${actualCount} expected=${expectedCount}`);
    if (diff.length >= maxItems) break;
  }
  return diff.join(', ');
}

function buildProbeTicks(model) {
  const probes = [0];
  const allBoundaries = [];
  for (const note of model.notesByStart) {
    allBoundaries.push(note.startTick, note.endTick);
  }
  const uniqueBoundaries = [...new Set(allBoundaries)].sort((a, b) => a - b);
  const boundaryStride = Math.max(1, Math.ceil(uniqueBoundaries.length / MAX_BOUNDARY_SAMPLES));
  for (let i = 0; i < uniqueBoundaries.length; i += boundaryStride) {
    const boundary = uniqueBoundaries[i];
    if (boundary <= LOCAL_BOUNDARY_EPSILON || boundary >= model.songEndTick - LOCAL_BOUNDARY_EPSILON) continue;
    probes.push(
      boundary + LOCAL_BOUNDARY_EPSILON,
      boundary - LOCAL_BOUNDARY_EPSILON,
      boundary + LOCAL_BOUNDARY_EPSILON,
      boundary - LOCAL_BOUNDARY_EPSILON
    );
  }

  const sweepStep = Math.max(1, Math.floor(model.ppq / 8));
  for (let tick = 0; tick <= model.songEndTick; tick += sweepStep) probes.push(tick + 0.33);
  for (let tick = model.songEndTick; tick >= 0; tick -= sweepStep) probes.push(tick - 0.33);

  probes.push(model.songEndTick - 0.25, model.songEndTick, 0.25, 0);

  return probes.map((tick) => clampTick(model, tick));
}

function runScenarioForLevel(levelPath) {
  const rawLevel = JSON.parse(fs.readFileSync(levelPath, 'utf8'));
  const model = normalizeMidiTickModel(rawLevel?.midiPlayback, {
    fallbackBpm: Number(rawLevel?.bpm) || 120,
    fallbackSongEndTick: 0
  });
  if (model.notesByStart.length === 0) {
    return {
      levelPath,
      steps: 0,
      notes: 0,
      skipped: true
    };
  }

  const scrubThresholdTick = Math.max(1, Math.floor(model.ppq / 2));
  const probeTicks = buildProbeTicks(model);
  let prevTick = 0;
  const activeCounts = rebuildVoiceCountsAtTick(model, prevTick);
  let maxSimultaneousVoices = 0;

  for (let index = 0; index < probeTicks.length; index++) {
    const nowTick = probeTicks[index];
    applyIncrementalStep(model, activeCounts, prevTick, nowTick, scrubThresholdTick);

    const expected = rebuildVoiceCountsAtTick(model, nowTick);
    if (!voiceCountsEqual(activeCounts, expected)) {
      throw new Error(
        [
          `Mismatch in MIDI scrub CLI e2e.`,
          `level=${path.basename(levelPath)}`,
          `step=${index}`,
          `prevTick=${prevTick.toFixed(3)}`,
          `nowTick=${nowTick.toFixed(3)}`,
          `diff=${summarizeVoiceDiff(activeCounts, expected)}`
        ].join(' ')
      );
    }

    let simultaneous = 0;
    for (const count of activeCounts.values()) simultaneous += count;
    maxSimultaneousVoices = Math.max(maxSimultaneousVoices, simultaneous);
    prevTick = nowTick;
  }

  return {
    levelPath,
    steps: probeTicks.length,
    notes: model.notesByStart.length,
    maxSimultaneousVoices,
    skipped: false
  };
}

function listRuntimeLevelPaths() {
  const entries = fs.readdirSync(LEVELS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.runtime.json'))
    .map((entry) => path.join(LEVELS_DIR, entry.name))
    .sort();
}

function main() {
  const summaries = runMidiScrubCliE2E(process.argv.slice(2));

  console.log('MIDI scrub CLI E2E PASS');
  for (const summary of summaries) {
    const rel = path.relative(process.cwd(), summary.levelPath);
    if (summary.skipped) {
      console.log(`- ${rel}: skipped (no MIDI notes).`);
      continue;
    }
    console.log(
      `- ${rel}: steps=${summary.steps} notes=${summary.notes} maxActiveVoices=${summary.maxSimultaneousVoices}`
    );
  }
}

export function runMidiScrubCliE2E(levelArgs = []) {
  const normalizedLevelArgs = Array.isArray(levelArgs) ? levelArgs.filter(Boolean) : [];
  const levelPaths =
    normalizedLevelArgs.length > 0
      ? normalizedLevelArgs.map((arg) => path.resolve(process.cwd(), String(arg)))
      : listRuntimeLevelPaths();
  if (levelPaths.length === 0) {
    throw new Error('No runtime level JSON files found for MIDI scrub CLI e2e.');
  }

  const summaries = [];
  for (const levelPath of levelPaths) summaries.push(runScenarioForLevel(levelPath));
  return summaries;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
