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

  if (notesWithTicks.length === 0) {
    return { notes: [], durationSec: 0, initialBpm: Math.round(60000000 / tempoEvents[0].usPerQuarter) };
  }

  tempoEvents.sort((a, b) => a.tick - b.tick);

  function tickToSeconds(targetTick: number): number {
    let sec = 0;
    let prevTick = 0;
    let tempoIndex = 0;
    let currentUsPerQuarter = tempoEvents[0].usPerQuarter;

    while (tempoIndex + 1 < tempoEvents.length && tempoEvents[tempoIndex + 1].tick <= targetTick) {
      const next = tempoEvents[tempoIndex + 1];
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
  const initialBpm = Math.round(60000000 / tempoEvents[0].usPerQuarter);
  return { notes, durationSec, initialBpm };
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
