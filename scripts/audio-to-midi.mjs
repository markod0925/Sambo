import path from 'node:path';
import { createAudioToMidiConverter } from '../tools/audio-midi-converter/src/index.mjs';

const VENDORED_MODEL_RELATIVE_DIR = 'assets/models/basic-pitch';
const converter = createAudioToMidiConverter({
  modelDir: path.resolve(process.cwd(), VENDORED_MODEL_RELATIVE_DIR),
  modelDirLabel: VENDORED_MODEL_RELATIVE_DIR,
  fallbackMidiBaseName: 'upload'
});

export const {
  assertModelReady: assertVendoredBasicPitchModelReady,
  detectUploadSourceType,
  buildUniqueMidiFileName,
  convertAudioBufferToMidiBuffer,
  convertUploadToMidi
} = converter;
