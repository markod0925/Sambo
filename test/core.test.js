import test from 'node:test';
import assert from 'node:assert/strict';
import { Metronome } from '../dist/src/core/metronome.js';
import { updateIntensity, defaultIntensityConfig } from '../dist/src/core/intensity.js';
import { BeatSnapMover } from '../dist/src/core/beatMovement.js';
import {
  getBeatPlatformState,
  getElevatorOffsetSteps,
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

test('intensity increases, decays and clamps at floor', () => {
  const up = updateIntensity(0.3, 'forward', 1, 1, defaultIntensityConfig);
  assert.equal(up, 0.6);

  const down = updateIntensity(0.3, 'idle', 0, 2, defaultIntensityConfig);
  assert.equal(down, 0.25);

  const back = updateIntensity(0.8, 'backward', 1, 1, defaultIntensityConfig);
  assert.equal(back, 0.5);
});

test('beat snapped mover arrives exactly on subdivision', () => {
  const metro = new Metronome(120, 4);
  const mover = new BeatSnapMover(metro, 64);

  mover.enqueue('forward');
  let move = mover.update(10);
  assert.equal(move.arrived, false);
  move = mover.update(125);
  assert.equal(move.arrived, true);
  assert.equal(move.x, 64);
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

test('energy classification and segment generation follow templates', () => {
  assert.equal(classifyEnergy(0.2), 'low');
  assert.equal(classifyEnergy(0.5), 'medium');
  assert.equal(classifyEnergy(0.9), 'high');

  const segments = generateSegments({ bpm: 120, energy_curve: [0.1, 0.2, 0.8, 0.9] }, 2);
  assert.equal(segments.length, 2);
  assert.deepEqual(segments[0].platformTypes, ['static', 'beat', 'alternateBeat']);
  assert.deepEqual(segments[1].platformTypes, ['static', 'beat', 'alternateBeat', 'ghost', 'reverseGhost', 'elevator']);
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
