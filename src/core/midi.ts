export interface TempoPoint {
  tick: number;
  usPerQuarter: number;
}

export interface NoteInterval {
  startTick: number;
  endTick: number;
  pitch: number;
  velocity: number;
  trackId: number;
  channel: number;
}

export interface ParsedMidiTickModel {
  ppq: number;
  tempoPoints: TempoPoint[];
  notesByStart: NoteInterval[];
  notesByEnd: NoteInterval[];
  songEndTick: number;
}

export interface RawTickModelLike {
  ppq?: number;
  tempoPoints?: Array<Partial<TempoPoint> | null | undefined>;
  notesByStart?: Array<Partial<NoteInterval> | null | undefined>;
  notesByEnd?: Array<Partial<NoteInterval> | null | undefined>;
  notes?: Array<Partial<NoteInterval> | null | undefined>;
  songEndTick?: number;
}

export interface NormalizeTickModelOptions {
  fallbackBpm?: number;
  fallbackPpq?: number;
  fallbackSongEndTick?: number;
}

export interface MidiNoteEvent {
  startSec: number;
  endSec: number;
  midiNote: number;
  velocity: number;
  channel: number;
  trackId: number;
}

export interface ParsedMidi {
  notes: MidiNoteEvent[];
  durationSec: number;
  initialBpm: number;
  tempoMap: Array<{ startBeat: number; bpm: number }>;
  tickModel: ParsedMidiTickModel;
}

export interface GridMidiNoteEvent {
  noteId: string;
  frequency: number;
  velocity: number;
}

export interface GridMidiColumnEvents {
  on: GridMidiNoteEvent[];
  off: GridMidiNoteEvent[];
}

export interface GridMidiMap {
  eventsByColumn: GridMidiColumnEvents[];
  selectedChannels: number[];
}

interface VarLenResult {
  value: number;
  size: number;
}

interface TempoSegment {
  startTick: number;
  endTick: number;
  usPerQuarter: number;
  secPerTick: number;
  startSec: number;
}

const DEFAULT_US_PER_QUARTER = 500_000;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function readVarLen(view: DataView, offset: number): VarLenResult {
  let value = 0;
  let size = 0;
  while (size < 4) {
    const current = view.getUint8(offset + size);
    value = (value << 7) | (current & 0x7f);
    size += 1;
    if ((current & 0x80) === 0) break;
  }
  return { value, size };
}

function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function normalizeTempoPoints(rawTempo: TempoPoint[]): TempoPoint[] {
  const withDefault = rawTempo.length > 0 ? rawTempo : [{ tick: 0, usPerQuarter: DEFAULT_US_PER_QUARTER }];
  const sorted = [...withDefault]
    .map((point) => ({
      tick: Math.max(0, Math.floor(Number(point.tick) || 0)),
      usPerQuarter: Math.max(1, Math.floor(Number(point.usPerQuarter) || DEFAULT_US_PER_QUARTER))
    }))
    .sort((a, b) => a.tick - b.tick);

  const merged: TempoPoint[] = [];
  for (const point of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && previous.tick === point.tick) {
      previous.usPerQuarter = point.usPerQuarter;
    } else {
      merged.push({ ...point });
    }
  }

  if (merged.length === 0 || merged[0].tick !== 0) {
    merged.unshift({ tick: 0, usPerQuarter: DEFAULT_US_PER_QUARTER });
  }
  return merged;
}

function buildTempoSegments(tempoPoints: TempoPoint[], ppq: number): TempoSegment[] {
  const safePpq = Math.max(1, Math.floor(ppq));
  const safeTempo = normalizeTempoPoints(tempoPoints);
  const segments: TempoSegment[] = [];
  let cursorSec = 0;

  for (let i = 0; i < safeTempo.length; i++) {
    const current = safeTempo[i];
    const nextTick = i + 1 < safeTempo.length ? safeTempo[i + 1].tick : Number.POSITIVE_INFINITY;
    const secPerTick = (current.usPerQuarter / 1_000_000) / safePpq;
    segments.push({
      startTick: current.tick,
      endTick: nextTick,
      usPerQuarter: current.usPerQuarter,
      secPerTick,
      startSec: cursorSec
    });

    if (Number.isFinite(nextTick)) {
      cursorSec += Math.max(0, nextTick - current.tick) * secPerTick;
    }
  }

  return segments;
}

function lowerBoundByTickGetter(items: NoteInterval[], tick: number, getTick: (note: NoteInterval) => number): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (getTick(items[mid]) < tick) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBoundByTickGetter(items: NoteInterval[], tick: number, getTick: (note: NoteInterval) => number): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (getTick(items[mid]) <= tick) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function lowerBoundByStartTick(notesByStart: NoteInterval[], tick: number): number {
  return lowerBoundByTickGetter(notesByStart, tick, (note) => note.startTick);
}

export function upperBoundByStartTick(notesByStart: NoteInterval[], tick: number): number {
  return upperBoundByTickGetter(notesByStart, tick, (note) => note.startTick);
}

export function lowerBoundByEndTick(notesByEnd: NoteInterval[], tick: number): number {
  return lowerBoundByTickGetter(notesByEnd, tick, (note) => note.endTick);
}

export function upperBoundByEndTick(notesByEnd: NoteInterval[], tick: number): number {
  return upperBoundByTickGetter(notesByEnd, tick, (note) => note.endTick);
}

export function normalizeMidiTickModel(
  raw: RawTickModelLike | null | undefined,
  options: NormalizeTickModelOptions = {}
): ParsedMidiTickModel {
  const fallbackBpm = clamp(Math.round(Number(options.fallbackBpm) || 120), 20, 300);
  const fallbackUsPerQuarter = Math.round(60_000_000 / fallbackBpm);
  const ppq = Math.max(1, Math.floor(Number(raw?.ppq) || Number(options.fallbackPpq) || 480));

  const tempoRaw = Array.isArray(raw?.tempoPoints) ? raw.tempoPoints : [];
  const tempoPoints = normalizeTempoPoints(
    tempoRaw.length > 0
      ? tempoRaw.map((point) => ({
          tick: Math.max(0, Math.floor(Number(point?.tick) || 0)),
          usPerQuarter: Math.max(1, Math.floor(Number(point?.usPerQuarter) || fallbackUsPerQuarter))
        }))
      : [{ tick: 0, usPerQuarter: fallbackUsPerQuarter }]
  );

  const notesSource =
    Array.isArray(raw?.notesByStart) && raw.notesByStart.length > 0
      ? raw.notesByStart
      : Array.isArray(raw?.notes) && raw.notes.length > 0
        ? raw.notes
        : Array.isArray(raw?.notesByEnd)
          ? raw.notesByEnd
          : [];

  const notes: NoteInterval[] = [];
  for (const item of notesSource) {
    const startTick = Math.max(0, Math.floor(Number(item?.startTick) || 0));
    const endTick = Math.max(0, Math.floor(Number(item?.endTick) || 0));
    if (endTick <= startTick) continue;
    notes.push({
      startTick,
      endTick,
      pitch: clamp(Math.floor(Number(item?.pitch) || 0), 0, 127),
      velocity: clamp(Math.floor(Number(item?.velocity) || 100), 1, 127),
      trackId: Math.max(0, Math.floor(Number(item?.trackId) || 0)),
      channel: clamp(Math.floor(Number(item?.channel) || 0), 0, 15)
    });
  }

  const notesByStart = [...notes].sort(
    (a, b) =>
      a.startTick - b.startTick ||
      a.endTick - b.endTick ||
      a.trackId - b.trackId ||
      a.channel - b.channel ||
      a.pitch - b.pitch
  );

  const notesByEnd = [...notes].sort(
    (a, b) =>
      a.endTick - b.endTick ||
      a.startTick - b.startTick ||
      a.trackId - b.trackId ||
      a.channel - b.channel ||
      a.pitch - b.pitch
  );

  let songEndTick = Math.max(
    0,
    Math.floor(
      Number.isFinite(Number(raw?.songEndTick))
        ? Number(raw?.songEndTick)
        : Number.isFinite(Number(options.fallbackSongEndTick))
          ? Number(options.fallbackSongEndTick)
          : 0
    )
  );
  for (const point of tempoPoints) songEndTick = Math.max(songEndTick, point.tick);
  for (const note of notesByStart) songEndTick = Math.max(songEndTick, note.endTick);

  return {
    ppq,
    tempoPoints,
    notesByStart,
    notesByEnd,
    songEndTick
  };
}

export function parseMidiToTickModel(arrayBuffer: ArrayBufferLike): ParsedMidiTickModel {
  const view = new DataView(arrayBuffer);
  let offset = 0;

  function readAscii(length: number): string {
    let out = '';
    for (let i = 0; i < length; i++) out += String.fromCharCode(view.getUint8(offset + i));
    offset += length;
    return out;
  }

  function readUint32(): number {
    const value = view.getUint32(offset);
    offset += 4;
    return value;
  }

  function readUint16(): number {
    const value = view.getUint16(offset);
    offset += 2;
    return value;
  }

  const chunkId = readAscii(4);
  if (chunkId !== 'MThd') throw new Error('Invalid MIDI header');

  const headerLength = readUint32();
  if (headerLength < 6) throw new Error('Incomplete MIDI header');

  readUint16(); // format (unused)
  const trackCount = readUint16();
  const division = readUint16();
  offset += Math.max(0, headerLength - 6);

  if ((division & 0x8000) !== 0) throw new Error('SMPTE time division is not supported');

  const ppq = division;
  if (ppq <= 0) throw new Error('Invalid ticks per quarter');

  const tempoPointsRaw: TempoPoint[] = [{ tick: 0, usPerQuarter: DEFAULT_US_PER_QUARTER }];
  const notesRaw: NoteInterval[] = [];
  let songEndTick = 0;

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
    const trackId = readAscii(4);
    if (trackId !== 'MTrk') throw new Error(`Invalid MIDI track chunk #${trackIndex}`);

    const trackLength = readUint32();
    const trackEnd = offset + trackLength;
    let tick = 0;
    let runningStatus = 0;

    const openStacks = new Map<string, Array<{ startTick: number; velocity: number }>>();

    while (offset < trackEnd) {
      const delta = readVarLen(view, offset);
      tick += delta.value;
      offset += delta.size;

      let status = view.getUint8(offset);
      if (status < 0x80) {
        if (!runningStatus) throw new Error('Invalid MIDI running status');
        status = runningStatus;
      } else {
        offset += 1;
        if (status < 0xf0) runningStatus = status;
        else runningStatus = 0;
      }

      if (status === 0xff) {
        const metaType = view.getUint8(offset);
        offset += 1;
        const lenInfo = readVarLen(view, offset);
        offset += lenInfo.size;
        if (metaType === 0x51 && lenInfo.value === 3) {
          const usPerQuarter =
            (view.getUint8(offset) << 16) | (view.getUint8(offset + 1) << 8) | view.getUint8(offset + 2);
          if (usPerQuarter > 0) tempoPointsRaw.push({ tick, usPerQuarter });
        }
        offset += lenInfo.value;
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        const lenInfo = readVarLen(view, offset);
        offset += lenInfo.size + lenInfo.value;
        continue;
      }

      const eventType = status & 0xf0;
      const channel = status & 0x0f;
      const data1 = view.getUint8(offset);
      offset += 1;

      if (eventType === 0xc0 || eventType === 0xd0) {
        continue;
      }

      const data2 = view.getUint8(offset);
      offset += 1;

      if (eventType !== 0x80 && eventType !== 0x90) {
        continue;
      }

      const isNoteOn = eventType === 0x90 && data2 > 0;
      const key = `${trackIndex}:${channel}:${data1}`;

      if (isNoteOn) {
        const stack = openStacks.get(key) ?? [];
        stack.push({ startTick: tick, velocity: data2 });
        openStacks.set(key, stack);
      } else {
        const stack = openStacks.get(key);
        if (!stack || stack.length === 0) continue;
        const start = stack.pop()!;
        if (stack.length === 0) openStacks.delete(key);
        if (tick <= start.startTick) continue;
        notesRaw.push({
          startTick: start.startTick,
          endTick: tick,
          pitch: data1,
          velocity: start.velocity,
          trackId: trackIndex,
          channel
        });
      }
    }

    // Gracefully close unclosed NoteOn events at track end to avoid data loss.
    for (const [key, stack] of openStacks.entries()) {
      const parts = key.split(':');
      const trackIdFromKey = Number(parts[0]);
      const channelFromKey = Number(parts[1]);
      const pitchFromKey = Number(parts[2]);
      while (stack.length > 0) {
        const start = stack.pop()!;
        if (tick <= start.startTick) continue;
        notesRaw.push({
          startTick: start.startTick,
          endTick: tick,
          pitch: pitchFromKey,
          velocity: start.velocity,
          trackId: Number.isFinite(trackIdFromKey) ? trackIdFromKey : trackIndex,
          channel: Number.isFinite(channelFromKey) ? channelFromKey : 0
        });
      }
    }

    songEndTick = Math.max(songEndTick, tick);
    offset = trackEnd;
  }

  for (const note of notesRaw) songEndTick = Math.max(songEndTick, note.endTick);
  for (const tempo of tempoPointsRaw) songEndTick = Math.max(songEndTick, tempo.tick);

  return normalizeMidiTickModel(
    {
      ppq,
      tempoPoints: tempoPointsRaw,
      notes: notesRaw,
      songEndTick
    },
    { fallbackPpq: ppq, fallbackSongEndTick: songEndTick }
  );
}

export function tickToSeconds(targetTick: number, tickModel: Pick<ParsedMidiTickModel, 'ppq' | 'tempoPoints'>): number {
  const safeTick = Math.max(0, Number.isFinite(targetTick) ? targetTick : 0);
  const tempoSegments = buildTempoSegments(tickModel.tempoPoints, tickModel.ppq);
  if (tempoSegments.length === 0) return 0;

  for (const segment of tempoSegments) {
    if (safeTick < segment.endTick) {
      return segment.startSec + (safeTick - segment.startTick) * segment.secPerTick;
    }
  }

  const tail = tempoSegments[tempoSegments.length - 1];
  return tail.startSec + (safeTick - tail.startTick) * tail.secPerTick;
}

export function secondsToTick(targetSec: number, tickModel: Pick<ParsedMidiTickModel, 'ppq' | 'tempoPoints'>): number {
  const safeSec = Math.max(0, Number.isFinite(targetSec) ? targetSec : 0);
  const tempoSegments = buildTempoSegments(tickModel.tempoPoints, tickModel.ppq);
  if (tempoSegments.length === 0) return 0;

  for (let i = 0; i < tempoSegments.length; i++) {
    const segment = tempoSegments[i];
    const next = tempoSegments[i + 1];
    const endSec = next ? next.startSec : Number.POSITIVE_INFINITY;
    if (safeSec < endSec) {
      const deltaTick = (safeSec - segment.startSec) / segment.secPerTick;
      return Math.max(segment.startTick, Math.round(segment.startTick + deltaTick));
    }
  }

  const tail = tempoSegments[tempoSegments.length - 1];
  const deltaTick = (safeSec - tail.startSec) / tail.secPerTick;
  return Math.max(tail.startTick, Math.round(tail.startTick + deltaTick));
}

export function parseMidiFile(arrayBuffer: ArrayBufferLike): ParsedMidi {
  const tickModel = parseMidiToTickModel(arrayBuffer);
  const notes: MidiNoteEvent[] = tickModel.notesByStart
    .map((raw) => ({
      startSec: tickToSeconds(raw.startTick, tickModel),
      endSec: tickToSeconds(raw.endTick, tickModel),
      midiNote: raw.pitch,
      velocity: raw.velocity / 127,
      channel: raw.channel,
      trackId: raw.trackId
    }))
    .filter((note) => Number.isFinite(note.startSec) && Number.isFinite(note.endSec) && note.endSec > note.startSec)
    .sort((a, b) => a.startSec - b.startSec || a.midiNote - b.midiNote || a.channel - b.channel || a.trackId - b.trackId);

  const durationSec = tickToSeconds(tickModel.songEndTick, tickModel);
  const firstTempo = tickModel.tempoPoints[0]?.usPerQuarter ?? DEFAULT_US_PER_QUARTER;
  const initialBpm = Math.round(60_000_000 / firstTempo);
  const tempoMap = tickModel.tempoPoints.map((point) => ({
    startBeat: point.tick / tickModel.ppq,
    bpm: Math.round(60_000_000 / point.usPerQuarter)
  }));

  return {
    notes,
    durationSec,
    initialBpm,
    tempoMap,
    tickModel
  };
}

export function buildGridNotesFromMidi(parsed: ParsedMidi, gridColumns: number): number[] {
  const totalColumns = Math.max(1, Math.floor(gridColumns));
  if (!parsed.notes.length || parsed.durationSec <= 0) {
    return Array.from({ length: totalColumns }, () => 220);
  }

  const totalDuration = Math.max(0.001, parsed.durationSec);
  const sortedNotes = [...parsed.notes].sort((a, b) => a.startSec - b.startSec);
  const out: number[] = [];

  for (let i = 0; i < totalColumns; i++) {
    const sampleTime = (i / Math.max(1, totalColumns - 1)) * totalDuration;
    let active: MidiNoteEvent | null = null;
    for (const note of sortedNotes) {
      if (note.startSec > sampleTime) break;
      if (note.startSec <= sampleTime && note.endSec >= sampleTime) {
        if (!active || note.velocity > active.velocity) active = note;
      }
    }
    const picked = active ?? sortedNotes[Math.min(sortedNotes.length - 1, i % sortedNotes.length)];
    out.push(midiToFrequency(picked.midiNote));
  }
  return out;
}

interface BuildGridMidiOptions {
  maxChannels?: number;
  minMidiNote?: number;
  maxMidiNote?: number;
}

function pickChannelsForGridPlayback(notes: MidiNoteEvent[], maxChannels: number): number[] {
  const stats = new Map<number, { count: number; sumMidi: number; sumVelocity: number }>();
  for (const note of notes) {
    if (note.channel === 9) continue;
    const entry = stats.get(note.channel) ?? { count: 0, sumMidi: 0, sumVelocity: 0 };
    entry.count += 1;
    entry.sumMidi += note.midiNote;
    entry.sumVelocity += note.velocity;
    stats.set(note.channel, entry);
  }

  const ranked = Array.from(stats.entries())
    .map(([channel, entry]) => {
      const avgMidi = entry.sumMidi / Math.max(1, entry.count);
      const avgVelocity = entry.sumVelocity / Math.max(1, entry.count);
      const score = avgMidi + Math.log2(entry.count + 1) * 2 + avgVelocity * 6;
      return { channel, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.floor(maxChannels)))
    .map((row) => row.channel);

  if (ranked.length > 0) return ranked;
  return [];
}

function toGridColumn(timeSec: number, durationSec: number, lastColumn: number): number {
  const ratio = durationSec <= 0 ? 0 : timeSec / durationSec;
  const mapped = Math.round(ratio * lastColumn);
  if (!Number.isFinite(mapped)) return 0;
  return Math.max(0, Math.min(lastColumn, mapped));
}

export function buildGridMidiMapFromMidi(parsed: ParsedMidi, gridColumns: number, options: BuildGridMidiOptions = {}): GridMidiMap {
  const totalColumns = Math.max(1, Math.floor(gridColumns));
  const eventsByColumn: GridMidiColumnEvents[] = Array.from({ length: totalColumns }, () => ({ on: [], off: [] }));
  if (!parsed.notes.length || parsed.durationSec <= 0) {
    return { eventsByColumn, selectedChannels: [] };
  }

  const maxChannels = Math.max(1, Math.floor(options.maxChannels ?? 2));
  const minMidiNote = Math.max(0, Math.floor(options.minMidiNote ?? 48));
  const maxMidiNote = Math.min(127, Math.floor(options.maxMidiNote ?? 84));
  const selectedChannels = pickChannelsForGridPlayback(parsed.notes, maxChannels);
  const selectedSet = new Set(selectedChannels);
  const filtered = parsed.notes.filter(
    (note) => selectedSet.has(note.channel) && note.midiNote >= minMidiNote && note.midiNote <= maxMidiNote
  );

  if (filtered.length === 0) {
    return { eventsByColumn, selectedChannels };
  }

  const totalDuration = Math.max(0.001, parsed.durationSec);
  const lastColumn = totalColumns - 1;
  const sorted = [...filtered].sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);

  for (let i = 0; i < sorted.length; i++) {
    const note = sorted[i];
    const noteId = `n${i}`;
    const startColumn = toGridColumn(note.startSec, totalDuration, lastColumn);
    let endColumn = toGridColumn(note.endSec, totalDuration, lastColumn);
    if (endColumn <= startColumn && startColumn < lastColumn) {
      endColumn = startColumn + 1;
    }
    if (endColumn < startColumn) endColumn = startColumn;
    const event: GridMidiNoteEvent = {
      noteId,
      frequency: midiToFrequency(note.midiNote),
      velocity: Math.max(0.05, Math.min(1, note.velocity))
    };
    eventsByColumn[startColumn].on.push(event);
    eventsByColumn[endColumn].off.push(event);
  }

  for (const columnEvents of eventsByColumn) {
    columnEvents.on.sort((a, b) => b.velocity - a.velocity || a.frequency - b.frequency);
    columnEvents.off.sort((a, b) => a.frequency - b.frequency);
  }

  return { eventsByColumn, selectedChannels };
}
