export interface MidiNoteEvent {
  startSec: number;
  endSec: number;
  midiNote: number;
  velocity: number;
  channel: number;
}

export interface ParsedMidi {
  notes: MidiNoteEvent[];
  durationSec: number;
  initialBpm: number;
  tempoMap: Array<{ startBeat: number; bpm: number }>;
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

export function parseMidiFile(arrayBuffer: ArrayBufferLike): ParsedMidi {
  const view = new DataView(arrayBuffer);
  let offset = 0;

  function readAscii(length: number): string {
    let out = '';
    for (let i = 0; i < length; i++) out += String.fromCharCode(view.getUint8(offset + i));
    offset += length;
    return out;
  }

  function readUint32(): number {
    const v = view.getUint32(offset);
    offset += 4;
    return v;
  }

  function readUint16(): number {
    const v = view.getUint16(offset);
    offset += 2;
    return v;
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
  const ticksPerQuarter = division;
  if (ticksPerQuarter <= 0) throw new Error('Invalid ticks per quarter');

  const tempoEvents = [{ tick: 0, usPerQuarter: 500000 }];
  const noteStarts = new Map<string, { tick: number; velocity: number }>();
  const notesWithTicks: Array<{ startTick: number; endTick: number; midiNote: number; velocity: number; channel: number }> = [];

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
    const trackId = readAscii(4);
    if (trackId !== 'MTrk') throw new Error(`Invalid MIDI track chunk #${trackIndex}`);
    const trackLength = readUint32();
    const trackEnd = offset + trackLength;
    let tick = 0;
    let runningStatus = 0;

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
        runningStatus = status;
      }

      if (status === 0xff) {
        const metaType = view.getUint8(offset);
        offset += 1;
        const lenInfo = readVarLen(view, offset);
        offset += lenInfo.size;
        if (metaType === 0x51 && lenInfo.value === 3) {
          const usPerQuarter =
            (view.getUint8(offset) << 16) | (view.getUint8(offset + 1) << 8) | view.getUint8(offset + 2);
          tempoEvents.push({ tick, usPerQuarter });
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

      if (eventType === 0x90 || eventType === 0x80) {
        const isNoteOn = eventType === 0x90 && data2 > 0;
        const key = `${channel}:${data1}`;
        if (isNoteOn) {
          noteStarts.set(key, { tick, velocity: data2 / 127 });
        } else {
          const start = noteStarts.get(key);
          if (start && tick > start.tick) {
            notesWithTicks.push({
              startTick: start.tick,
              endTick: tick,
              midiNote: data1,
              velocity: start.velocity,
              channel
            });
          }
          noteStarts.delete(key);
        }
      }
    }

    offset = trackEnd;
  }

  tempoEvents.sort((a, b) => a.tick - b.tick);
  const mergedTempo: Array<{ tick: number; usPerQuarter: number }> = [];
  for (const event of tempoEvents) {
    const prev = mergedTempo[mergedTempo.length - 1];
    if (!prev || prev.tick !== event.tick) mergedTempo.push({ ...event });
    else prev.usPerQuarter = event.usPerQuarter;
  }
  const tempoMap = mergedTempo.map((event) => ({
    startBeat: event.tick / ticksPerQuarter,
    bpm: Math.round(60000000 / event.usPerQuarter)
  }));

  function tickToSeconds(targetTick: number): number {
    let sec = 0;
    let prevTick = 0;
    let tempoIndex = 0;
    let currentUsPerQuarter = mergedTempo[0].usPerQuarter;

    while (tempoIndex + 1 < mergedTempo.length && mergedTempo[tempoIndex + 1].tick <= targetTick) {
      const next = mergedTempo[tempoIndex + 1];
      const deltaTicks = next.tick - prevTick;
      sec += (deltaTicks * currentUsPerQuarter) / (ticksPerQuarter * 1_000_000);
      prevTick = next.tick;
      currentUsPerQuarter = next.usPerQuarter;
      tempoIndex += 1;
    }

    const remaining = targetTick - prevTick;
    sec += (remaining * currentUsPerQuarter) / (ticksPerQuarter * 1_000_000);
    return sec;
  }

  const notes: MidiNoteEvent[] = notesWithTicks
    .map((raw) => ({
      startSec: tickToSeconds(raw.startTick),
      endSec: tickToSeconds(raw.endTick),
      midiNote: raw.midiNote,
      velocity: raw.velocity,
      channel: raw.channel
    }))
    .filter((n) => Number.isFinite(n.startSec) && Number.isFinite(n.endSec) && n.endSec > n.startSec)
    .sort((a, b) => a.startSec - b.startSec);

  const durationSec = notes.reduce((maxSec, n) => Math.max(maxSec, n.endSec), 0);
  const initialBpm = Math.round(60000000 / mergedTempo[0].usPerQuarter);
  return { notes, durationSec, initialBpm, tempoMap };
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
