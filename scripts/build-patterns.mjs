#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const TOKEN_VALUES = ['segment', 'gap', 'timed', 'mobile', 'hazard', 'launch'];
const SOURCE_KEYS = ['vglc', 'mario', 'opensurge', 'supertux'];
const FLOW_WIDTHS = [6, 7, 8, 9, 10];
const MICRO_WIDTHS = [6, 7, 8];
const MICRO_LANES = [3, 4];
const MAX_FILES_PER_SOURCE = 40;
const MAX_STREAM_COLUMNS = 260;

const GRID_SOLID = new Set([
  'X',
  'S',
  '?',
  'Q',
  '<',
  '>',
  '[',
  ']',
  'B',
  'b',
  '#',
  'M',
  'U',
  'C',
  't',
  'T'
]);
const GRID_HAZARD = new Set(['E', 'F', 'g', 'k', '!', '^', '*', 'm', 'n']);
const GRID_TIMED = new Set(['?', 'Q', 'S', 'o', 'c', '$']);
const GRID_MOBILE = new Set(['<', '>', '[', ']', 't', 'T', '=', '~']);
const GRID_LAUNCH = new Set(['L', 'U', 'J']);

function usage() {
  return [
    'Usage:',
    '  node scripts/build-patterns.mjs --output assets/procgen/runtime_patterns_v1.json --ts-out src/core/patternCatalog.ts',
    '  optional roots:',
    '    --vglc-root /path/to/TheVGLC',
    '    --mario-root /path/to/Mario-AI-Framework',
    '    --opensurge-root /path/to/opensurge',
    '    --supertux-root /path/to/supertux-addons',
    '  optional:',
    '    --target-count 50'
  ].join('\n');
}

function parseArgs(argv) {
  const out = {
    output: 'assets/procgen/runtime_patterns_v1.json',
    tsOut: 'src/core/patternCatalog.ts',
    targetCount: 50,
    vglcRoot: '',
    marioRoot: '',
    opensurgeRoot: '',
    supertuxRoot: ''
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      out.help = true;
      continue;
    }
    const next = argv[i + 1];
    if (arg === '--output' && next) {
      out.output = next;
      i += 1;
      continue;
    }
    if (arg === '--ts-out' && next) {
      out.tsOut = next;
      i += 1;
      continue;
    }
    if (arg === '--target-count' && next) {
      out.targetCount = Math.max(10, Math.floor(Number(next) || 50));
      i += 1;
      continue;
    }
    if (arg === '--vglc-root' && next) {
      out.vglcRoot = next;
      i += 1;
      continue;
    }
    if (arg === '--mario-root' && next) {
      out.marioRoot = next;
      i += 1;
      continue;
    }
    if (arg === '--opensurge-root' && next) {
      out.opensurgeRoot = next;
      i += 1;
      continue;
    }
    if (arg === '--supertux-root' && next) {
      out.supertuxRoot = next;
      i += 1;
      continue;
    }
  }
  return out;
}

function existsDir(dirPath) {
  if (!dirPath) return false;
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function resolveSourceRoot(cliValue, envName, fallbackCandidates) {
  const candidates = [];
  if (cliValue) candidates.push(cliValue);
  if (process.env[envName]) candidates.push(process.env[envName]);
  for (const fallback of fallbackCandidates) candidates.push(fallback);
  for (const candidate of candidates) {
    if (existsDir(candidate)) return path.resolve(candidate);
  }
  throw new Error(`Missing source root for ${envName}. Tried: ${candidates.filter(Boolean).join(', ')}`);
}

function walkFiles(root, predicate) {
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') continue;
        if (entry.name.startsWith('.') && current !== root) continue;
        stack.push(fullPath);
      } else if (entry.isFile() && predicate(fullPath)) {
        out.push(fullPath);
      }
    }
  }
  out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return out;
}

function evenlySample(items, targetCount) {
  if (items.length <= targetCount) return items;
  const sampled = [];
  for (let i = 0; i < targetCount; i++) {
    const idx = Math.floor((i / targetCount) * items.length);
    sampled.push(items[idx]);
  }
  return sampled;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function tokenRank(token) {
  switch (token) {
    case 'launch':
      return 6;
    case 'hazard':
      return 5;
    case 'mobile':
      return 4;
    case 'timed':
      return 3;
    case 'segment':
      return 2;
    default:
      return 1;
  }
}

function pickDominantToken(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return 'gap';
  let best = 'gap';
  for (const token of tokens) {
    if (!TOKEN_VALUES.includes(token)) continue;
    if (tokenRank(token) > tokenRank(best)) best = token;
  }
  return best;
}

function classifyTextCell(ch) {
  if (GRID_LAUNCH.has(ch)) return 'launch';
  if (GRID_HAZARD.has(ch)) return 'hazard';
  if (GRID_MOBILE.has(ch)) return 'mobile';
  if (GRID_TIMED.has(ch)) return 'timed';
  if (GRID_SOLID.has(ch)) return 'segment';
  return 'gap';
}

function normalizeGridText(content) {
  const lines = String(content || '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const width = lines.reduce((max, line) => Math.max(max, line.length), 0);
  return lines.map((line) => line.padEnd(width, '-'));
}

export function parseTextGridToColumns(content) {
  const rows = normalizeGridText(content);
  if (rows.length === 0) return null;

  const h = rows.length;
  const w = rows[0].length;
  const columns = [];
  const laneColumns = [];

  for (let x = 0; x < w; x++) {
    const columnTokens = [];
    let topSolid = null;
    for (let y = 0; y < h; y++) {
      const token = classifyTextCell(rows[y][x]);
      columnTokens.push(token);
      if (topSolid === null && token !== 'gap') topSolid = y;
    }

    let dominant = pickDominantToken(columnTokens.filter((token, y) => y >= Math.floor(h * 0.45)));
    if (dominant === 'gap') {
      const fallback = pickDominantToken(columnTokens);
      if (fallback !== 'gap') dominant = fallback;
    }

    const prevTop = x > 0 ? columns[x - 1]?.meta?.topSolid : null;
    if (
      dominant === 'segment' &&
      topSolid !== null &&
      prevTop !== null &&
      prevTop - topSolid >= Math.max(2, Math.floor(h / 6))
    ) {
      dominant = 'launch';
    }

    const lanes = [];
    for (let lane = 0; lane < 4; lane++) {
      const laneStart = Math.floor((lane / 4) * h);
      const laneEnd = Math.max(laneStart + 1, Math.floor(((lane + 1) / 4) * h));
      const laneTokensRaw = [];
      for (let y = laneStart; y < laneEnd; y++) laneTokensRaw.push(classifyTextCell(rows[y][x]));
      lanes.push(pickDominantToken(laneTokensRaw));
    }

    columns.push({ token: dominant, meta: { topSolid } });
    laneColumns.push(lanes);
  }

  return {
    tokens: columns.map((entry) => entry.token),
    lanes: laneColumns
  };
}

function classifyEntityToken(name) {
  const normalized = String(name || '').toLowerCase();
  if (
    normalized.includes('spring') ||
    normalized.includes('booster') ||
    normalized.includes('launcher') ||
    normalized.includes('jump')
  ) {
    return 'launch';
  }
  if (
    normalized.includes('spike') ||
    normalized.includes('hazard') ||
    normalized.includes('lava') ||
    normalized.includes('enemy') ||
    normalized.includes('badguy') ||
    normalized.includes('snowball') ||
    normalized.includes('icecrusher')
  ) {
    return 'hazard';
  }
  if (
    normalized.includes('platform') ||
    normalized.includes('bridge') ||
    normalized.includes('elevator') ||
    normalized.includes('moving') ||
    normalized.includes('path')
  ) {
    return 'mobile';
  }
  if (
    normalized.includes('switch') ||
    normalized.includes('bonus') ||
    normalized.includes('block') ||
    normalized.includes('trigger') ||
    normalized.includes('clock')
  ) {
    return 'timed';
  }
  return 'segment';
}

export function parseOpenSurgeLevel(content) {
  const lines = String(content || '').split(/\r?\n/);
  const bricks = [];
  const entities = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const brickMatch = trimmed.match(/^brick\s+\d+\s+(-?\d+)\s+(-?\d+)/i);
    if (brickMatch) {
      bricks.push({ x: Number(brickMatch[1]), y: Number(brickMatch[2]) });
      continue;
    }

    const entityMatch = trimmed.match(/^entity\s+"([^"]+)"\s+(-?\d+)\s+(-?\d+)/i);
    if (entityMatch) {
      entities.push({
        name: entityMatch[1],
        x: Number(entityMatch[2]),
        y: Number(entityMatch[3]),
        token: classifyEntityToken(entityMatch[1])
      });
    }
  }
  if (bricks.length === 0 && entities.length === 0) return null;

  const minX = Math.min(
    ...bricks.map((b) => b.x),
    ...(entities.map((e) => e.x)),
    0
  );
  const maxX = Math.max(
    ...bricks.map((b) => b.x),
    ...(entities.map((e) => e.x)),
    minX + 256
  );
  const maxY = Math.max(
    ...bricks.map((b) => b.y),
    ...(entities.map((e) => e.y)),
    0
  );

  const bin = 128;
  const width = Math.max(8, Math.floor((maxX - minX) / bin) + 1);
  const columns = Array.from({ length: width }, () => ({
    dominant: 'gap',
    laneTokens: Array.from({ length: 4 }, () => [])
  }));

  for (const brick of bricks) {
    const idx = clamp(Math.floor((brick.x - minX) / bin), 0, width - 1);
    columns[idx].laneTokens[3].push('segment');
    if (tokenRank('segment') > tokenRank(columns[idx].dominant)) columns[idx].dominant = 'segment';
  }

  const laneStep = Math.max(64, Math.floor((maxY + 64) / 4));
  for (const entity of entities) {
    const idx = clamp(Math.floor((entity.x - minX) / bin), 0, width - 1);
    const lane = clamp(Math.floor((maxY - entity.y) / laneStep), 0, 3);
    columns[idx].laneTokens[lane].push(entity.token);
    if (tokenRank(entity.token) > tokenRank(columns[idx].dominant)) columns[idx].dominant = entity.token;
  }

  return {
    tokens: columns.map((col) => col.dominant),
    lanes: columns.map((col) => col.laneTokens.map((laneTokens) => pickDominantToken(laneTokens)))
  };
}

export function parseSuperTuxLevel(content) {
  const lines = String(content || '').split(/\r?\n/);
  const points = [];
  let activeTag = '';
  let pending = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const tagMatch = line.match(/^\(([a-zA-Z0-9_-]+)/);
    if (tagMatch) {
      activeTag = tagMatch[1];
      if (line === ')') activeTag = '';
    }

    const xMatch = line.match(/\(x\s+(-?\d+)\)/);
    if (xMatch) {
      pending = {
        tag: activeTag || 'object',
        x: Number(xMatch[1]),
        y: 0
      };
      points.push(pending);
      continue;
    }
    const yMatch = line.match(/\(y\s+(-?\d+)\)/);
    if (yMatch && pending) {
      pending.y = Number(yMatch[1]);
      continue;
    }
  }

  if (points.length === 0) return null;

  const minX = Math.min(...points.map((p) => p.x), 0);
  const maxX = Math.max(...points.map((p) => p.x), minX + 256);
  const maxY = Math.max(...points.map((p) => p.y), 0);
  const width = Math.max(8, Math.floor((maxX - minX) / 128) + 1);
  const columns = Array.from({ length: width }, () => ({
    dominant: 'gap',
    lanes: Array.from({ length: 4 }, () => [])
  }));

  for (const point of points) {
    const token = classifyEntityToken(point.tag);
    const idx = clamp(Math.floor((point.x - minX) / 128), 0, width - 1);
    const lane = clamp(Math.floor((maxY - point.y) / Math.max(64, Math.floor((maxY + 64) / 4))), 0, 3);
    columns[idx].lanes[lane].push(token);
    if (tokenRank(token) > tokenRank(columns[idx].dominant)) columns[idx].dominant = token;
  }

  return {
    tokens: columns.map((col) => col.dominant),
    lanes: columns.map((col) => col.lanes.map((laneTokens) => pickDominantToken(laneTokens)))
  };
}

function emptySourceBreakdown() {
  return {
    vglc: 0,
    mario: 0,
    opensurge: 0,
    supertux: 0
  };
}

function signatureFromFlow(tokens) {
  return tokens.join('|');
}

function signatureFromMicro(tokens2d) {
  return tokens2d.map((row) => row.join('|')).join('||');
}

function ensurePatternCandidate(map, key, base) {
  let existing = map.get(key);
  if (!existing) {
    existing = {
      ...base,
      frequency: 0,
      sourceCounts: emptySourceBreakdown()
    };
    map.set(key, existing);
  }
  return existing;
}

function extractFlowCandidates(tokens, sourceKey, map) {
  if (!Array.isArray(tokens) || tokens.length < FLOW_WIDTHS[0]) return;
  for (const width of FLOW_WIDTHS) {
    if (tokens.length < width) continue;
    const stride = tokens.length > 300 ? 2 : 1;
    for (let i = 0; i <= tokens.length - width; i += stride) {
      const window = tokens.slice(i, i + width);
      if (window.every((token) => token === 'gap')) continue;
      const signature = signatureFromFlow(window);
      const key = `flow1d:${signature}`;
      const candidate = ensurePatternCandidate(map, key, {
        kind: 'flow1d',
        tokens: window,
        signature
      });
      candidate.frequency += 1;
      candidate.sourceCounts[sourceKey] += 1;
    }
  }
}

function transpose(columnsSlice) {
  const laneCount = columnsSlice[0]?.length ?? 0;
  const out = Array.from({ length: laneCount }, () => []);
  for (let x = 0; x < columnsSlice.length; x++) {
    for (let lane = 0; lane < laneCount; lane++) {
      out[lane].push(columnsSlice[x][lane]);
    }
  }
  return out;
}

function extractMicroCandidates(laneColumns, sourceKey, map) {
  if (!Array.isArray(laneColumns) || laneColumns.length < MICRO_WIDTHS[0]) return;
  for (const width of MICRO_WIDTHS) {
    if (laneColumns.length < width) continue;
    const stride = laneColumns.length > 300 ? 2 : 1;
    for (let i = 0; i <= laneColumns.length - width; i += stride) {
      const slice = laneColumns.slice(i, i + width);
      for (const laneCount of MICRO_LANES) {
        if (slice[0].length < laneCount) continue;
        for (let laneStart = 0; laneStart <= slice[0].length - laneCount; laneStart++) {
          const laneSlice = slice.map((column) => column.slice(laneStart, laneStart + laneCount));
          const tokens2d = transpose(laneSlice);
          const flat = tokens2d.flat();
          if (flat.every((token) => token === 'gap')) continue;
          const signature = signatureFromMicro(tokens2d);
          const key = `micro2d:${signature}`;
          const candidate = ensurePatternCandidate(map, key, {
            kind: 'micro2d',
            tokens: tokens2d,
            signature
          });
          candidate.frequency += 1;
          candidate.sourceCounts[sourceKey] += 1;
        }
      }
    }
  }
}

function coverageScore(flatTokens) {
  const unique = new Set(flatTokens);
  return unique.size / TOKEN_VALUES.length;
}

function flattenCandidateTokens(candidate) {
  if (candidate.kind === 'flow1d') return candidate.tokens;
  return candidate.tokens.flat();
}

function similarityScore(a, b) {
  const setA = new Set(flattenCandidateTokens(a));
  const setB = new Set(flattenCandidateTokens(b));
  const intersection = [...setA].filter((value) => setB.has(value)).length;
  const union = new Set([...setA, ...setB]).size || 1;
  return intersection / union;
}

function energyHintForTokens(flatTokens) {
  let danger = 0;
  let mobility = 0;
  for (const token of flatTokens) {
    if (token === 'hazard' || token === 'launch') danger += 1;
    if (token === 'timed' || token === 'mobile') mobility += 1;
  }
  if (danger > 0) return 'high';
  if (mobility > 0) return 'medium';
  return 'low';
}

function deriveConstraints(candidate) {
  const flatTokens = flattenCandidateTokens(candidate);
  let maxGapRun = 0;
  let currentGapRun = 0;
  let longestLaunchLead = 0;
  let currentSegmentLead = 0;

  for (const token of flatTokens) {
    if (token === 'gap') {
      currentGapRun += 1;
      maxGapRun = Math.max(maxGapRun, currentGapRun);
    } else {
      currentGapRun = 0;
    }
    if (token === 'segment') {
      currentSegmentLead += 1;
    } else if (token === 'launch') {
      longestLaunchLead = Math.max(longestLaunchLead, currentSegmentLead);
      currentSegmentLead = 0;
    } else {
      currentSegmentLead = 0;
    }
  }

  return {
    maxGapRun: maxGapRun || 1,
    minSegmentBeforeLaunch: longestLaunchLead || 1
  };
}

function normalizeSourceBreakdown(sourceCounts) {
  const total = SOURCE_KEYS.reduce((acc, key) => acc + sourceCounts[key], 0) || 1;
  const out = {};
  for (const key of SOURCE_KEYS) {
    out[key] = Number((sourceCounts[key] / total).toFixed(4));
  }
  return out;
}

export function rankAndSelectPatterns(candidates, targetCount = 50) {
  const working = candidates.map((candidate) => {
    const flatTokens = flattenCandidateTokens(candidate);
    const coverage = coverageScore(flatTokens);
    const baseScore = candidate.frequency * (1 + coverage * 0.9);
    return {
      ...candidate,
      flatTokens,
      coverage,
      baseScore
    };
  });

  working.sort((a, b) => b.baseScore - a.baseScore || a.signature.localeCompare(b.signature));
  const selected = [];
  const remaining = [...working];

  while (selected.length < targetCount && remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      let novelty = 1;
      if (selected.length > 0) {
        const similarityAvg =
          selected.reduce((acc, picked) => acc + similarityScore(candidate, picked), 0) / selected.length;
        novelty = 1 - similarityAvg;
      }
      const score = candidate.baseScore * (0.65 + novelty * 0.35);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    const picked = remaining.splice(bestIndex, 1)[0];
    picked.finalScore = bestScore;
    selected.push(picked);
  }

  const sourcePresent = new Set();
  for (const candidate of selected) {
    for (const key of SOURCE_KEYS) {
      if (candidate.sourceCounts[key] > 0) sourcePresent.add(key);
    }
  }

  for (const sourceKey of SOURCE_KEYS) {
    if (sourcePresent.has(sourceKey)) continue;
    const replacement = remaining.find((candidate) => candidate.sourceCounts[sourceKey] > 0);
    if (!replacement) continue;
    let replaceIdx = selected.length - 1;
    while (replaceIdx >= 0) {
      const existing = selected[replaceIdx];
      const contributesUniqueSource = SOURCE_KEYS.some((key) => {
        if (existing.sourceCounts[key] <= 0) return false;
        return !selected.some((candidate, idx) => idx !== replaceIdx && candidate.sourceCounts[key] > 0);
      });
      if (!contributesUniqueSource) break;
      replaceIdx -= 1;
    }
    if (replaceIdx < 0) replaceIdx = selected.length - 1;
    selected.splice(replaceIdx, 1, replacement);
  }

  const maxScore = selected.reduce((max, candidate) => Math.max(max, candidate.finalScore || candidate.baseScore), 0.0001);
  return selected.slice(0, targetCount).map((candidate, index) => ({
    patternId: `p${String(index + 1).padStart(3, '0')}`,
    kind: candidate.kind,
    tokens: candidate.tokens,
    weight: Number((((candidate.finalScore || candidate.baseScore) / maxScore) * 2).toFixed(4)),
    sourceBreakdown: normalizeSourceBreakdown(candidate.sourceCounts),
    energyHint: energyHintForTokens(candidate.flatTokens),
    constraints: deriveConstraints(candidate)
  }));
}

function collectFromRoot(root, sourceKey, adapter, filePredicate) {
  const files = evenlySample(walkFiles(root, filePredicate), MAX_FILES_PER_SOURCE);
  const streams = [];
  for (const filePath of files) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = adapter(raw);
    if (!parsed || !Array.isArray(parsed.tokens) || parsed.tokens.length === 0) continue;
    const stride = Math.max(1, Math.ceil(parsed.tokens.length / MAX_STREAM_COLUMNS));
    if (stride <= 1) {
      streams.push(parsed);
      continue;
    }
    streams.push({
      tokens: parsed.tokens.filter((_token, index) => index % stride === 0),
      lanes: parsed.lanes.filter((_lane, index) => index % stride === 0)
    });
  }
  if (streams.length === 0) {
    throw new Error(`No usable ${sourceKey} streams parsed from ${root}`);
  }
  return streams;
}

function fileNameContains(filePath, chunk) {
  return filePath.toLowerCase().includes(chunk.toLowerCase());
}

function collectAllCandidates(roots) {
  const candidateMap = new Map();

  const vglcStreams = collectFromRoot(
    roots.vglc,
    'vglc',
    parseTextGridToColumns,
    (filePath) =>
      filePath.endsWith('.txt') &&
      (fileNameContains(filePath, `${path.sep}Processed${path.sep}`) || fileNameContains(filePath, 'Super Mario Bros')) &&
      !fileNameContains(filePath, 'Annotated_Path')
  );
  for (const stream of vglcStreams) {
    extractFlowCandidates(stream.tokens, 'vglc', candidateMap);
    extractMicroCandidates(stream.lanes, 'vglc', candidateMap);
  }

  const marioStreams = collectFromRoot(
    roots.mario,
    'mario',
    parseTextGridToColumns,
    (filePath) =>
      filePath.endsWith('.txt') &&
      (fileNameContains(filePath, `${path.sep}levels${path.sep}`) || fileNameContains(filePath, `${path.sep}Levels${path.sep}`))
  );
  for (const stream of marioStreams) {
    extractFlowCandidates(stream.tokens, 'mario', candidateMap);
    extractMicroCandidates(stream.lanes, 'mario', candidateMap);
  }

  const surgeStreams = collectFromRoot(
    roots.opensurge,
    'opensurge',
    parseOpenSurgeLevel,
    (filePath) => filePath.endsWith('.lev')
  );
  for (const stream of surgeStreams) {
    extractFlowCandidates(stream.tokens, 'opensurge', candidateMap);
    extractMicroCandidates(stream.lanes, 'opensurge', candidateMap);
  }

  const supertuxStreams = collectFromRoot(
    roots.supertux,
    'supertux',
    parseSuperTuxLevel,
    (filePath) => filePath.endsWith('.stl') || filePath.endsWith('.stwm')
  );
  for (const stream of supertuxStreams) {
    extractFlowCandidates(stream.tokens, 'supertux', candidateMap);
    extractMicroCandidates(stream.lanes, 'supertux', candidateMap);
  }

  return [...candidateMap.values()];
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function toStableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function buildTsCatalog(patterns) {
  const json = JSON.stringify(patterns, null, 2);
  return [
    "export interface RuntimePatternRecord {",
    "  patternId: string;",
    "  kind: 'flow1d' | 'micro2d';",
    "  tokens: Array<'segment' | 'gap' | 'timed' | 'mobile' | 'hazard' | 'launch'> | Array<Array<'segment' | 'gap' | 'timed' | 'mobile' | 'hazard' | 'launch'>>;",
    "  weight: number;",
    "  sourceBreakdown: { vglc: number; mario: number; opensurge: number; supertux: number; };",
    "  energyHint: 'low' | 'medium' | 'high';",
    "  constraints: { maxGapRun: number; minSegmentBeforeLaunch: number; };",
    "}",
    '',
    `export const RUNTIME_PATTERN_CATALOG: RuntimePatternRecord[] = ${json};`,
    ''
  ].join('\n');
}

export function buildPatternsFromRoots(roots, targetCount = 50) {
  const candidates = collectAllCandidates(roots);
  return rankAndSelectPatterns(candidates, targetCount);
}

function runCli() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }

  const cwd = process.cwd();
  const roots = {
    vglc: resolveSourceRoot(args.vglcRoot, 'VGLC_ROOT', [
      '/tmp/TheVGLC',
      path.join(cwd, 'third_party', 'TheVGLC')
    ]),
    mario: resolveSourceRoot(args.marioRoot, 'MARIO_AI_ROOT', [
      '/tmp/Mario-AI-Framework',
      path.join(cwd, 'third_party', 'Mario-AI-Framework')
    ]),
    opensurge: resolveSourceRoot(args.opensurgeRoot, 'OPENSURGE_ROOT', [
      '/tmp/opensurge',
      path.join(cwd, 'third_party', 'opensurge')
    ]),
    supertux: resolveSourceRoot(args.supertuxRoot, 'SUPERTUX_ROOT', [
      '/tmp/supertux-addons',
      path.join(cwd, 'third_party', 'supertux-addons')
    ])
  };

  const patterns = buildPatternsFromRoots(roots, args.targetCount);
  if (patterns.length !== args.targetCount) {
    throw new Error(`Expected ${args.targetCount} patterns, got ${patterns.length}`);
  }
  const outputPath = path.resolve(cwd, args.output);
  const tsOutPath = path.resolve(cwd, args.tsOut);
  ensureParentDir(outputPath);
  ensureParentDir(tsOutPath);
  fs.writeFileSync(outputPath, toStableJson(patterns), 'utf8');
  fs.writeFileSync(tsOutPath, buildTsCatalog(patterns), 'utf8');

  const sourceCoverage = {
    vglc: 0,
    mario: 0,
    opensurge: 0,
    supertux: 0
  };
  for (const pattern of patterns) {
    for (const key of SOURCE_KEYS) {
      if (pattern.sourceBreakdown[key] > 0) sourceCoverage[key] += 1;
    }
  }

  console.log(
    `Built ${patterns.length} patterns -> ${path.relative(cwd, outputPath)} and ${path.relative(cwd, tsOutPath)}`
  );
  console.log(`Source coverage: ${JSON.stringify(sourceCoverage)}`);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const modulePath = new URL(import.meta.url).pathname;
if (entryPath && modulePath.endsWith(path.basename(entryPath))) {
  runCli();
}
