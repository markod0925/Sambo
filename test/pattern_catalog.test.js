import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildPatternsFromRoots, parseOpenSurgeLevel, parseSuperTuxLevel, parseTextGridToColumns } from '../scripts/build-patterns.mjs';

function mkdirp(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function write(filePath, content) {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function makeMarioLikeGrid(width) {
  const top = '-'.repeat(width);
  const mid = Array.from({ length: width }, (_v, i) => {
    if (i % 37 === 0) return 'E';
    if (i % 29 === 0) return 'Q';
    if (i % 23 === 0) return '<';
    return '-';
  }).join('');
  const bottom = Array.from({ length: width }, (_v, i) => (i % 19 < 15 ? 'X' : '-')).join('');
  return [top, top, mid, bottom, bottom].join('\n');
}

function makeOpenSurgeLevel() {
  const lines = [
    'name "Sample"',
    'theme "themes/sunshine.brk"',
    'bgtheme "themes/template.bg"',
    'spawn_point 176 9792'
  ];
  for (let i = 0; i < 120; i++) {
    lines.push(`brick ${i % 5} ${320 + i * 128} ${10000 + ((i % 3) * 16)}`);
    if (i % 9 === 0) lines.push(`entity "Spikes" ${320 + i * 128} 10000 "id${i}"`);
    if (i % 11 === 0) lines.push(`entity "Spring Standard" ${320 + i * 128} 9940 "spring${i}"`);
    if (i % 13 === 0) lines.push(`entity "Bridge" ${320 + i * 128} 9960 "bridge${i}"`);
  }
  return lines.join('\n');
}

function makeSuperTuxLevel() {
  const lines = [
    '(supertux-level',
    '  (version 3)',
    '  (sector',
    '    (name "main")'
  ];
  for (let i = 0; i < 140; i++) {
    lines.push(`    (bonusblock`);
    lines.push(`      (x ${200 + i * 96})`);
    lines.push(`      (y ${900 - (i % 4) * 48})`);
    lines.push('    )');
    if (i % 8 === 0) {
      lines.push('    (spikes');
      lines.push(`      (x ${220 + i * 96})`);
      lines.push(`      (y ${940 - (i % 3) * 40})`);
      lines.push('    )');
    }
    if (i % 10 === 0) {
      lines.push('    (spring');
      lines.push(`      (x ${210 + i * 96})`);
      lines.push(`      (y ${880 - (i % 3) * 40})`);
      lines.push('    )');
    }
  }
  lines.push('  )');
  lines.push(')');
  return lines.join('\n');
}

test('text grid parser classifies segment/gap/timed/mobile/hazard', () => {
  const parsed = parseTextGridToColumns(
    [
      '----E-',
      '--Q-<-',
      'XXXXXX',
      'XX--XX'
    ].join('\n')
  );
  assert.ok(parsed);
  assert.ok(parsed.tokens.includes('segment'));
  assert.ok(parsed.tokens.some((token) => token === 'hazard' || token === 'timed' || token === 'mobile'));
});

test('OpenSurge parser classifies launch/hazard/mobile tokens', () => {
  const parsed = parseOpenSurgeLevel(
    [
      'brick 1 320 10000',
      'brick 2 448 10000',
      'entity "Spikes" 448 10000 "s1"',
      'entity "Spring Standard" 576 9960 "sp1"',
      'entity "Bridge" 704 9960 "b1"'
    ].join('\n')
  );
  assert.ok(parsed);
  const tokenSet = new Set(parsed.tokens);
  assert.ok(tokenSet.has('segment'));
  assert.ok(tokenSet.has('hazard'));
  assert.ok(tokenSet.has('launch'));
  assert.ok(tokenSet.has('mobile'));
});

test('SuperTux parser reads x/y object stream and emits non-gap tokens', () => {
  const parsed = parseSuperTuxLevel(
    [
      '(supertux-level',
      '  (sector',
      '    (bonusblock',
      '      (x 300)',
      '      (y 900)',
      '    )',
      '    (spikes',
      '      (x 450)',
      '      (y 920)',
      '    )',
      '    (spring',
      '      (x 600)',
      '      (y 860)',
      '    )',
      '  )',
      ')'
    ].join('\n')
  );
  assert.ok(parsed);
  const tokenSet = new Set(parsed.tokens);
  assert.ok(tokenSet.has('timed') || tokenSet.has('segment'));
  assert.ok([...tokenSet].some((token) => token !== 'gap'));
});

test('pattern miner outputs deterministic 50-pattern catalog with all source coverage', () => {
  const root = fs.mkdtempSync('/tmp/pattern-test-');
  const roots = {
    vglc: path.join(root, 'vglc'),
    mario: path.join(root, 'mario'),
    opensurge: path.join(root, 'opensurge'),
    supertux: path.join(root, 'supertux')
  };

  write(path.join(roots.vglc, 'Super Mario Bros', 'Processed', 'mario-1-1.txt'), makeMarioLikeGrid(180));
  write(path.join(roots.vglc, 'Super Mario Bros', 'Processed', 'mario-1-2.txt'), makeMarioLikeGrid(170));
  write(path.join(roots.mario, 'levels', 'original', 'lvl-1.txt'), makeMarioLikeGrid(160));
  write(path.join(roots.mario, 'levels', 'original', 'lvl-2.txt'), makeMarioLikeGrid(150));
  write(path.join(roots.opensurge, 'levels', 'demo-1.lev'), makeOpenSurgeLevel());
  write(path.join(roots.opensurge, 'levels', 'demo-2.lev'), makeOpenSurgeLevel());
  write(path.join(roots.supertux, 'pack', 'level1.stl'), makeSuperTuxLevel());
  write(path.join(roots.supertux, 'pack', 'level2.stl'), makeSuperTuxLevel());

  const first = buildPatternsFromRoots(roots, 50);
  const second = buildPatternsFromRoots(roots, 50);

  assert.equal(first.length, 50);
  assert.deepEqual(first, second);

  const kinds = new Set(first.map((pattern) => pattern.kind));
  assert.ok(kinds.has('flow1d'));
  assert.ok(kinds.has('micro2d'));

  const sourceCoverage = {
    vglc: 0,
    mario: 0,
    opensurge: 0,
    supertux: 0
  };
  for (const pattern of first) {
    for (const source of Object.keys(sourceCoverage)) {
      if (pattern.sourceBreakdown[source] > 0) sourceCoverage[source] += 1;
    }
  }
  for (const count of Object.values(sourceCoverage)) assert.ok(count > 0);
});
