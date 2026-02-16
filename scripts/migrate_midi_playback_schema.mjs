import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const levelsDir = path.join(root, 'Levels');
const midiDir = path.join(root, 'MIDI');

function clamp(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, num));
}

function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function frequencyToMidi(freq) {
  const safe = Number(freq);
  if (!Number.isFinite(safe) || safe <= 0) return 60;
  return Math.round(clamp(69 + 12 * Math.log2(safe / 440), 0, 127));
}

function normalizeTempoMapRows(rawTempoMap, fallbackBpm = 120) {
  const rows = Array.isArray(rawTempoMap) ? rawTempoMap : [];
  const normalized = rows
    .map((row) => ({
      startColumn: Math.max(0, Math.floor(Number(row?.startColumn) || 0)),
      bpm: Math.round(clamp(Number(row?.bpm) || fallbackBpm, 20, 300))
    }))
    .sort((a, b) => a.startColumn - b.startColumn);
  const dedup = [];
  for (const row of normalized) {
    const last = dedup[dedup.length - 1];
    if (last && last.startColumn === row.startColumn) {
      last.bpm = row.bpm;
    } else {
      dedup.push({ ...row });
    }
  }
  if (dedup.length === 0 || dedup[0].startColumn !== 0) {
    dedup.unshift({ startColumn: 0, bpm: Math.round(clamp(fallbackBpm, 20, 300)) });
  }
  return dedup;
}

function normalizeMidiPlayback(raw, fallback) {
  const fallbackPpq = Math.max(1, Math.floor(Number(fallback?.ppq) || 480));
  const ppq = Math.max(1, Math.floor(Number(raw?.ppq) || fallbackPpq));

  const rawTempo = Array.isArray(raw?.tempoPoints) ? raw.tempoPoints : Array.isArray(fallback?.tempoPoints) ? fallback.tempoPoints : [];
  const tempoPoints = rawTempo
    .map((point) => ({
      tick: Math.max(0, Math.floor(Number(point?.tick) || 0)),
      usPerQuarter: Math.max(1, Math.floor(Number(point?.usPerQuarter) || 500_000))
    }))
    .sort((a, b) => a.tick - b.tick);
  const dedupTempo = [];
  for (const point of tempoPoints) {
    const last = dedupTempo[dedupTempo.length - 1];
    if (last && last.tick === point.tick) last.usPerQuarter = point.usPerQuarter;
    else dedupTempo.push({ ...point });
  }
  if (dedupTempo.length === 0 || dedupTempo[0].tick !== 0) dedupTempo.unshift({ tick: 0, usPerQuarter: 500_000 });

  const rawNotes = Array.isArray(raw?.notes) ? raw.notes : Array.isArray(fallback?.notes) ? fallback.notes : [];
  const notes = rawNotes
    .map((note) => ({
      startTick: Math.max(0, Math.floor(Number(note?.startTick) || 0)),
      endTick: Math.max(0, Math.floor(Number(note?.endTick) || 0)),
      pitch: Math.round(clamp(Number(note?.pitch) || 0, 0, 127)),
      velocity: Math.round(clamp(Number(note?.velocity) || 100, 1, 127)),
      trackId: Math.max(0, Math.floor(Number(note?.trackId) || 0)),
      channel: Math.round(clamp(Number(note?.channel) || 0, 0, 15))
    }))
    .filter((note) => note.endTick > note.startTick)
    .sort((a, b) => a.startTick - b.startTick || a.endTick - b.endTick || a.trackId - b.trackId || a.channel - b.channel || a.pitch - b.pitch);

  let songEndTick = Math.max(0, Math.floor(Number(raw?.songEndTick) || Number(fallback?.songEndTick) || 0));
  for (const point of dedupTempo) songEndTick = Math.max(songEndTick, point.tick);
  for (const note of notes) songEndTick = Math.max(songEndTick, note.endTick);

  const x0 = Number.isFinite(Number(raw?.x0)) ? Number(raw.x0) : Number.isFinite(Number(fallback?.x0)) ? Number(fallback.x0) : 150;
  const x1 = Number.isFinite(Number(raw?.x1)) ? Number(raw.x1) : Number.isFinite(Number(fallback?.x1)) ? Number(fallback.x1) : x0 + 32;

  return {
    ppq,
    songEndTick,
    tempoPoints: dedupTempo,
    notes,
    x0,
    x1: Math.max(x0 + 1, x1)
  };
}

function buildLegacyFallback(level) {
  const ppq = 480;
  const gridColumns = Math.max(1, Math.floor(Number(level?.gridColumns) || level?.notes?.length || 32));
  const notesHz = Array.isArray(level?.notes) ? level.notes : [];
  const notes = [];
  for (let i = 0; i < gridColumns; i++) {
    const pitch = frequencyToMidi(notesHz[i] ?? notesHz[notesHz.length - 1] ?? 261.625565);
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

  const tempoMap = normalizeTempoMapRows(level?.tempoMap, 120);
  const tempoPoints = tempoMap.map((row) => ({
    tick: row.startColumn * ppq,
    usPerQuarter: Math.round(60_000_000 / row.bpm)
  }));

  return {
    ppq,
    songEndTick: gridColumns * ppq,
    tempoPoints,
    notes,
    x0: 150,
    x1: 150 + 32 * Math.max(1, gridColumns - 1)
  };
}

function ensureLegacyNotes(gridColumns, midiPlayback, rawNotes) {
  const safeColumns = Math.max(1, Math.floor(Number(gridColumns) || 1));
  if (Array.isArray(rawNotes) && rawNotes.length === safeColumns) {
    return rawNotes.map((value) => Number(value) || 220);
  }

  const out = [];
  const ppq = Math.max(1, midiPlayback.ppq);
  for (let i = 0; i < safeColumns; i++) {
    const tick = i * ppq;
    let picked = null;
    for (const note of midiPlayback.notes) {
      if (note.startTick <= tick && tick < note.endTick) {
        if (!picked || note.velocity > picked.velocity) picked = note;
      }
      if (note.startTick > tick && picked) break;
    }
    if (picked) out.push(midiToHz(picked.pitch));
    else out.push(out.length > 0 ? out[out.length - 1] : 220);
  }
  return out;
}

async function loadMidiParser() {
  const distMidiPath = path.join(root, 'dist', 'src', 'core', 'midi.js');
  if (!fs.existsSync(distMidiPath)) {
    throw new Error('dist/src/core/midi.js not found. Run "npm run build" first.');
  }
  const mod = await import(pathToFileURL(distMidiPath).href);
  if (typeof mod.parseMidiToTickModel !== 'function') {
    throw new Error('parseMidiToTickModel export not found in dist/src/core/midi.js');
  }
  return mod.parseMidiToTickModel;
}

async function main() {
  const parseMidiToTickModel = await loadMidiParser();
  if (!fs.existsSync(levelsDir)) {
    console.log('No Levels directory found. Nothing to migrate.');
    return;
  }

  const levelFiles = fs.readdirSync(levelsDir).filter((name) => name.toLowerCase().endsWith('.json')).sort((a, b) => a.localeCompare(b));

  const report = {
    converted: 0,
    warnings: 0,
    failures: 0,
    warningFiles: []
  };

  for (const fileName of levelFiles) {
    const fullPath = path.join(levelsDir, fileName);
    try {
      const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      if (!raw || typeof raw !== 'object') {
        report.failures += 1;
        console.error(`[FAIL] ${fileName}: invalid JSON object`);
        continue;
      }

      const fallback = buildLegacyFallback(raw);
      let midiPlayback = null;
      const midiFile = typeof raw.midi_file === 'string' ? raw.midi_file.trim() : '';

      if (midiFile) {
        const safeMidiName = path.basename(midiFile);
        const midiPath = path.join(midiDir, safeMidiName);
        if (midiPath.startsWith(midiDir) && fs.existsSync(midiPath)) {
          const bytes = fs.readFileSync(midiPath);
          const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
          const parsed = parseMidiToTickModel(arrayBuffer);
          midiPlayback = {
            ppq: parsed.ppq,
            songEndTick: parsed.songEndTick,
            tempoPoints: parsed.tempoPoints.map((point) => ({ tick: point.tick, usPerQuarter: point.usPerQuarter })),
            notes: parsed.notesByStart.map((note) => ({ ...note })),
            x0: fallback.x0,
            x1: fallback.x1
          };
        } else {
          report.warnings += 1;
          report.warningFiles.push(`${fileName}: missing MIDI file "${midiFile}"`);
        }
      }

      if (!midiPlayback) {
        midiPlayback = normalizeMidiPlayback(raw.midiPlayback, fallback);
      }

      const normalized = normalizeMidiPlayback(midiPlayback, fallback);
      const gridColumns = Math.max(1, Math.floor(Number(raw.gridColumns) || Math.ceil(normalized.songEndTick / Math.max(1, normalized.ppq)) || 1));
      const fallbackBpm = Math.round(60_000_000 / Math.max(1, normalized.tempoPoints[0]?.usPerQuarter || 500_000));

      raw.midiPlayback = {
        ppq: normalized.ppq,
        songEndTick: normalized.songEndTick,
        tempoPoints: normalized.tempoPoints,
        notes: normalized.notes,
        x0: normalized.x0,
        x1: normalized.x1
      };
      raw.gridColumns = gridColumns;
      raw.tempoMap = normalizeTempoMapRows(raw.tempoMap, fallbackBpm);
      raw.notes = ensureLegacyNotes(gridColumns, raw.midiPlayback, raw.notes);

      fs.writeFileSync(fullPath, `${JSON.stringify(raw, null, 2)}\n`);
      report.converted += 1;
      console.log(`[OK] ${fileName}`);
    } catch (err) {
      report.failures += 1;
      console.error(`[FAIL] ${fileName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log('\nMigration report');
  console.log(`converted: ${report.converted}`);
  console.log(`warnings: ${report.warnings}`);
  console.log(`failures: ${report.failures}`);
  for (const warning of report.warningFiles) {
    console.log(`warning: ${warning}`);
  }

  if (report.failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
