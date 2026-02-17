import test from 'node:test';
import assert from 'node:assert/strict';
import { runMidiScrubCliE2E } from '../scripts/midi-scrub-cli-e2e.mjs';

test('MIDI scrub CLI e2e keeps incremental state aligned with rebuild ground truth', () => {
  const summaries = runMidiScrubCliE2E();
  assert.ok(Array.isArray(summaries));
  assert.ok(summaries.length > 0);

  const exercised = summaries.filter((entry) => !entry.skipped);
  assert.ok(exercised.length > 0, 'Expected at least one runtime level with MIDI notes.');
  for (const summary of exercised) {
    assert.ok(summary.steps > 0, `Expected positive step count for ${summary.levelPath}.`);
    assert.ok(summary.notes > 0, `Expected MIDI notes for ${summary.levelPath}.`);
  }
});
