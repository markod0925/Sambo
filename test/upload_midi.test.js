import test from 'node:test';
import assert from 'node:assert/strict';

import ToneMidi from '@tonejs/midi';
import { buildUniqueMidiFileName, convertUploadToMidi, detectUploadSourceType } from '../scripts/audio-to-midi.mjs';

const { Midi } = ToneMidi;

test('buildUniqueMidiFileName adds suffixes when collisions exist', () => {
  const existing = new Set(['track.mid', 'track_1.mid', 'TRack_2.mid']);
  assert.equal(buildUniqueMidiFileName('track', existing), 'track_3.mid');
  assert.equal(buildUniqueMidiFileName('my song.wav', new Set()), 'my_song.mid');
});

test('detectUploadSourceType classifies MIDI and audio uploads', () => {
  assert.equal(detectUploadSourceType('demo.mid'), 'midi');
  assert.equal(detectUploadSourceType('demo.midi'), 'midi');
  assert.equal(detectUploadSourceType('demo.mp3'), 'audio');
  assert.equal(detectUploadSourceType('demo.wav'), 'audio');
  assert.equal(detectUploadSourceType('text/plain'), null);
});

test('convertUploadToMidi returns coherent payload for direct MIDI uploads', async () => {
  const midi = new Midi();
  midi.addTrack().addNote({
    midi: 60,
    time: 0,
    duration: 0.5,
    velocity: 0.8
  });

  const converted = await convertUploadToMidi(
    {
      fileName: 'upload_test.mid',
      mimeType: 'audio/midi',
      buffer: Buffer.from(midi.toArray())
    },
    new Set()
  );

  assert.equal(converted.sourceType, 'midi');
  assert.equal(converted.converted, false);
  assert.equal(converted.midiFileName, 'upload_test.mid');
  assert.ok(Buffer.isBuffer(converted.midiBuffer));
  assert.ok(converted.midiBuffer.length > 16);
});

test('convertUploadToMidi rejects unsupported file types', async () => {
  await assert.rejects(
    () =>
      convertUploadToMidi(
        {
          fileName: 'upload_test.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('hello')
        },
        new Set()
      ),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(String(err.message || ''), /Unsupported file type/i);
      return true;
    }
  );
});
