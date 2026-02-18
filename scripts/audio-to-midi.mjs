import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const MIDI_EXTENSIONS = new Set(['.mid', '.midi']);
const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3']);
const FALLBACK_MIDI_BASENAME = 'upload';
const VENDORED_MODEL_RELATIVE_DIR = 'assets/models/basic-pitch';
const VENDORED_MODEL_DIR = path.resolve(process.cwd(), VENDORED_MODEL_RELATIVE_DIR);
const VENDORED_MODEL_JSON_PATH = path.join(VENDORED_MODEL_DIR, 'model.json');

let modelPromise = null;
let vendoredModelMetadataPromise = null;
let tensorflowRuntimePromise = null;
const require = createRequire(import.meta.url);

function normalizeText(value) {
  return String(value || '').trim();
}

function getExtension(value) {
  const raw = normalizeText(value).toLowerCase();
  if (!raw) return '';
  if (raw.startsWith('.')) return raw;
  const fromPath = path.extname(raw);
  if (fromPath) return fromPath;
  if (raw.includes('audio/mpeg') || raw.includes('audio/mp3')) return '.mp3';
  if (raw.includes('audio/wav') || raw.includes('audio/wave') || raw.includes('audio/x-wav')) return '.wav';
  if (raw.includes('audio/midi') || raw.includes('audio/x-midi')) return '.mid';
  return '';
}

function sanitizeMidiBaseName(baseName, fallback = FALLBACK_MIDI_BASENAME) {
  const safe = normalizeText(baseName)
    .replace(/\.[^/.]+$/g, '')
    .replace(/[^\w.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^\.+/, '')
    .replace(/^_+/, '')
    .replace(/[._-]+$/, '');
  return safe || fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(value, fallback = 0) {
  const safe = Number(value);
  return Number.isFinite(safe) ? safe : fallback;
}

function safeProgressHandler(options) {
  return typeof options?.onProgress === 'function' ? options.onProgress : null;
}

function reportProgress(options, stage, progress) {
  const handler = safeProgressHandler(options);
  if (!handler) return;
  handler({
    stage: String(stage || '').trim() || 'Working...',
    progress: clamp(toFiniteNumber(progress, 0), 0, 1)
  });
}

function downmixToMono(audioBuffer) {
  const channels = Math.max(0, Number(audioBuffer?.numberOfChannels) || 0);
  const length = Math.max(0, Number(audioBuffer?.length) || 0);
  if (channels <= 0 || length <= 0) throw new Error('Uploaded audio is empty.');

  if (channels === 1) {
    return new Float32Array(audioBuffer.getChannelData(0));
  }

  const mono = new Float32Array(length);
  for (let ch = 0; ch < channels; ch += 1) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i += 1) {
      mono[i] += data[i] / channels;
    }
  }
  return mono;
}

function resolveVendoredWeightPath(weightPath) {
  const safeWeightPath = String(weightPath || '').trim().replace(/\\/g, '/');
  if (!safeWeightPath || safeWeightPath.includes('..')) {
    throw new Error('Vendored Basic Pitch model has an invalid weight path.');
  }
  const resolved = path.resolve(VENDORED_MODEL_DIR, safeWeightPath);
  const modelPrefix = `${VENDORED_MODEL_DIR}${path.sep}`;
  if (resolved !== VENDORED_MODEL_DIR && !resolved.startsWith(modelPrefix)) {
    throw new Error('Vendored Basic Pitch model has an invalid weight path.');
  }
  return resolved;
}

async function loadVendoredBasicPitchMetadata() {
  if (vendoredModelMetadataPromise) return vendoredModelMetadataPromise;

  vendoredModelMetadataPromise = (async () => {
    let modelJsonRaw;
    try {
      modelJsonRaw = await fs.readFile(VENDORED_MODEL_JSON_PATH, 'utf8');
    } catch {
      throw new Error(
        `Vendored Basic Pitch model is missing at ${VENDORED_MODEL_RELATIVE_DIR}. Expected ${path.join(
          VENDORED_MODEL_RELATIVE_DIR,
          'model.json'
        )}.`
      );
    }

    let modelJson;
    try {
      modelJson = JSON.parse(modelJsonRaw);
    } catch {
      throw new Error('Vendored Basic Pitch model metadata is invalid JSON.');
    }

    const manifest = Array.isArray(modelJson?.weightsManifest) ? modelJson.weightsManifest : [];
    const weightSpecs = manifest.flatMap((entry) => (Array.isArray(entry?.weights) ? entry.weights : []));
    const weightPaths = manifest.flatMap((entry) => (Array.isArray(entry?.paths) ? entry.paths : []));
    if (weightSpecs.length === 0 || weightPaths.length === 0) {
      throw new Error('Vendored Basic Pitch model weights are missing from model metadata.');
    }

    await Promise.all(
      weightPaths.map(async (weightPath) => {
        const resolved = resolveVendoredWeightPath(weightPath);
        try {
          await fs.access(resolved);
        } catch {
          throw new Error(
            `Vendored Basic Pitch weight file is missing: ${path.relative(process.cwd(), resolved)}`
          );
        }
      })
    );

    return {
      modelJson,
      weightSpecs,
      weightPaths
    };
  })().catch((err) => {
    vendoredModelMetadataPromise = null;
    throw err;
  });

  return vendoredModelMetadataPromise;
}

export async function assertVendoredBasicPitchModelReady() {
  await loadVendoredBasicPitchMetadata();
  return {
    modelDir: VENDORED_MODEL_DIR,
    relativeModelDir: VENDORED_MODEL_RELATIVE_DIR
  };
}

function normalizeModuleExports(moduleValue) {
  if (!moduleValue || typeof moduleValue !== 'object') return moduleValue;
  if (moduleValue.default && typeof moduleValue.default === 'object') return moduleValue.default;
  return moduleValue;
}

function ensureTfjsNodeUtilCompatibility() {
  const util = require('util');
  if (typeof util.isNullOrUndefined !== 'function') {
    util.isNullOrUndefined = (value) => value === null || value === undefined;
  }
}

async function loadTensorflowRuntime(options = {}) {
  if (tensorflowRuntimePromise) return tensorflowRuntimePromise;

  tensorflowRuntimePromise = (async () => {
    reportProgress(options, 'Initializing TensorFlow runtime...', 0.06);
    try {
      ensureTfjsNodeUtilCompatibility();
      const tfNodeModule = normalizeModuleExports(await import('@tensorflow/tfjs-node'));
      const tfNode = tfNodeModule;
      if (typeof tfNode?.loadGraphModel !== 'function' || typeof tfNode?.io?.fromMemory !== 'function') {
        throw new Error('Invalid TensorFlow Node runtime.');
      }
      await tfNode.ready?.();
      reportProgress(options, 'TensorFlow Node backend ready.', 0.08);
      return tfNode;
    } catch {
      const tfModule = normalizeModuleExports(await import('@tensorflow/tfjs'));
      const tf = tfModule;
      if (typeof tf?.loadGraphModel !== 'function' || typeof tf?.io?.fromMemory !== 'function') {
        throw new Error('TensorFlow runtime is not available.');
      }
      await tf.ready?.();
      reportProgress(options, 'TensorFlow JS backend ready (slower).', 0.08);
      return tf;
    }
  })().catch((err) => {
    tensorflowRuntimePromise = null;
    throw err;
  });

  return tensorflowRuntimePromise;
}

async function loadBasicPitchGraphModel(tf, options = {}) {
  if (modelPromise) return modelPromise;

  modelPromise = (async () => {
    reportProgress(options, 'Reading model metadata...', 0.1);
    const { modelJson, weightSpecs, weightPaths } = await loadVendoredBasicPitchMetadata();

    const weightBuffers = [];
    const totalWeightFiles = Math.max(1, weightPaths.length);
    reportProgress(options, 'Loading model weights...', 0.14);
    for (let idx = 0; idx < weightPaths.length; idx += 1) {
      const weightPath = weightPaths[idx];
      weightBuffers.push(await fs.readFile(resolveVendoredWeightPath(weightPath)));
      const ratio = (idx + 1) / totalWeightFiles;
      reportProgress(options, `Loading model weights (${idx + 1}/${totalWeightFiles})...`, 0.14 + ratio * 0.22);
    }
    const merged = Buffer.concat(weightBuffers);
    const weightData = merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength);
    const ioHandler = tf.io.fromMemory({
      modelTopology: modelJson.modelTopology,
      format: modelJson.format,
      generatedBy: modelJson.generatedBy,
      convertedBy: modelJson.convertedBy,
      weightSpecs,
      weightData
    });
    reportProgress(options, 'Building TensorFlow graph...', 0.38);
    const graph = await tf.loadGraphModel(ioHandler);
    reportProgress(options, 'Model loaded. Decoding audio...', 0.46);
    return graph;
  })().catch((err) => {
    modelPromise = null;
    throw err;
  });

  return modelPromise;
}

export function detectUploadSourceType(fileNameOrExt) {
  const ext = getExtension(fileNameOrExt);
  if (MIDI_EXTENSIONS.has(ext)) return 'midi';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  return null;
}

export function buildUniqueMidiFileName(baseName, existingNamesSet = new Set()) {
  const existing = new Set(
    Array.from(existingNamesSet || [])
      .map((entry) => normalizeText(entry).toLowerCase())
      .filter(Boolean)
  );
  const safeBase = sanitizeMidiBaseName(baseName);
  let candidate = `${safeBase}.mid`;
  if (!existing.has(candidate.toLowerCase())) return candidate;

  let index = 1;
  while (true) {
    candidate = `${safeBase}_${index}.mid`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
    index += 1;
  }
}

export async function convertAudioBufferToMidiBuffer(inputBuffer, mimeOrExt = '', options = {}) {
  if (!inputBuffer || Number(inputBuffer.length || inputBuffer.byteLength || 0) <= 0) {
    throw new Error('Uploaded audio is empty.');
  }
  const sourceType = detectUploadSourceType(mimeOrExt);
  if (sourceType && sourceType !== 'audio') {
    throw new Error('Only WAV and MP3 can be converted to MIDI.');
  }
  reportProgress(options, 'Loading conversion model...', 0.04);

  const [{ default: decodeAudio }, basicPitchModule, toneMidiModule] = await Promise.all([
    import('audio-decode'),
    import('@spotify/basic-pitch'),
    import('@tonejs/midi')
  ]);
  const tf = await loadTensorflowRuntime(options);
  const { BasicPitch, outputToNotesPoly, noteFramesToTime, addPitchBendsToNoteEvents } = basicPitchModule;
  const toneMidiExports =
    toneMidiModule?.default && typeof toneMidiModule.default === 'object' ? toneMidiModule.default : toneMidiModule;
  const Midi = toneMidiExports?.Midi;
  if (typeof BasicPitch !== 'function' || typeof Midi !== 'function') {
    throw new Error('MIDI conversion dependencies are not available.');
  }

  reportProgress(options, 'Initializing conversion runtime...', 0.08);
  const graphModel = await loadBasicPitchGraphModel(tf, options);
  const basicPitch = new BasicPitch(Promise.resolve(graphModel));
  const audioBuffer = await decodeAudio(Buffer.from(inputBuffer));
  const monoAudio = downmixToMono(audioBuffer);
  reportProgress(options, 'Audio decoded. Analyzing notes...', 0.58);

  const frames = [];
  const onsets = [];
  const contours = [];
  await basicPitch.evaluateModel(
    monoAudio,
    (f, o, c) => {
      frames.push(...f);
      onsets.push(...o);
      contours.push(...c);
    },
    (percent) => {
      const safe = clamp(toFiniteNumber(percent, 0), 0, 1);
      reportProgress(options, 'Analyzing notes...', 0.58 + safe * 0.32);
    }
  );

  reportProgress(options, 'Building MIDI events...', 0.92);
  const rawNotes = outputToNotesPoly(frames, onsets, 0.25, 0.25, 5);
  const noteEvents = noteFramesToTime(addPitchBendsToNoteEvents(contours, rawNotes));
  if (!Array.isArray(noteEvents) || noteEvents.length === 0) {
    throw new Error('No notes detected in uploaded audio.');
  }

  const midi = new Midi();
  midi.header.setTempo(120);
  const track = midi.addTrack();
  for (const note of noteEvents) {
    const pitch = clamp(Math.round(Number(note.pitchMidi) || 0), 0, 127);
    const time = Math.max(0, Number(note.startTimeSeconds) || 0);
    const duration = Math.max(0.02, Number(note.durationSeconds) || 0.02);
    // Raise low inferred amplitudes while preserving dynamics.
    const amplitude = clamp(toFiniteNumber(note.amplitude, 0.35), 0, 1);
    const liftedAmplitude = Math.pow(amplitude, 0.58);
    const velocity = clamp(0.35 + liftedAmplitude * 0.65, 0.35, 1);
    track.addNote({ midi: pitch, time, duration, velocity });
  }

  reportProgress(options, 'Finalizing MIDI file...', 0.98);
  const midiBytes = midi.toArray();
  reportProgress(options, 'Conversion complete.', 1);
  return Buffer.from(midiBytes.buffer, midiBytes.byteOffset, midiBytes.byteLength);
}

export async function convertUploadToMidi(upload, existingNamesSet = new Set(), options = {}) {
  const fileName = normalizeText(upload?.fileName);
  const mimeType = normalizeText(upload?.mimeType).toLowerCase();
  const buffer = upload?.buffer;
  if (!fileName) {
    const err = new Error('Uploaded file name is missing');
    // @ts-ignore - lightweight status attachment for caller handling.
    err.statusCode = 400;
    throw err;
  }
  if (!buffer || Number(buffer.length || buffer.byteLength || 0) <= 0) {
    const err = new Error('Uploaded file is empty');
    // @ts-ignore - lightweight status attachment for caller handling.
    err.statusCode = 400;
    throw err;
  }

  const sourceType = detectUploadSourceType(fileName) || detectUploadSourceType(mimeType);
  if (!sourceType) {
    const err = new Error('Unsupported file type. Use MID, MIDI, WAV, or MP3.');
    // @ts-ignore - lightweight status attachment for caller handling.
    err.statusCode = 400;
    throw err;
  }

  const midiFileName = buildUniqueMidiFileName(fileName, existingNamesSet);
  let midiBuffer;
  let converted = false;
  if (sourceType === 'audio') {
    reportProgress(options, 'Preparing audio conversion...', 0.02);
    midiBuffer = await convertAudioBufferToMidiBuffer(buffer, fileName || mimeType, options);
    converted = true;
  } else {
    reportProgress(options, 'Preparing MIDI file...', 0.55);
    midiBuffer = Buffer.from(buffer);
    reportProgress(options, 'MIDI file ready.', 1);
  }

  return {
    midiFileName,
    sourceType,
    converted,
    midiBuffer
  };
}
