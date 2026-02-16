import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const port = 4173;
const host = process.env.HOST || '127.0.0.1';
const midiDir = path.join(root, 'MIDI');
const levelsDir = path.join(root, 'Levels');
const MAX_BODY_BYTES = 25_000_000;

const types = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.mid': 'audio/midi',
  '.midi': 'audio/midi'
};

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let tooLarge = false;
    req.on('data', (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        tooLarge = true;
        const err = new Error('Payload too large');
        // @ts-ignore - lightweight status attachment for caller handling.
        err.statusCode = 413;
        reject(err);
      }
    });
    req.on('end', () => {
      if (!tooLarge) resolve(body);
    });
    req.on('error', reject);
  });
}

function isMidiFile(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return ext === '.mid' || ext === '.midi';
}

function sanitizeFileName(fileName, defaultBase = 'level') {
  const base = path.basename(String(fileName || '')).replace(/[^\w.-]/g, '_');
  const cleaned = base.replace(/_+/g, '_');
  return cleaned || `${defaultBase}.json`;
}

function safeBasename(fileName) {
  return path.basename(String(fileName || '').trim());
}

function isLevelFile(fileName) {
  const lower = String(fileName || '').toLowerCase();
  if (!lower.endsWith('.json')) return false;
  if (lower.endsWith('.draft.json')) return false;
  return true;
}

function compareLevelNames(a, b) {
  const ax = a.toLowerCase();
  const bx = b.toLowerCase();
  const aRuntime = ax.endsWith('.runtime.json') ? 0 : 1;
  const bRuntime = bx.endsWith('.runtime.json') ? 0 : 1;
  if (aRuntime !== bRuntime) return aRuntime - bRuntime;
  return ax.localeCompare(bx, undefined, { numeric: true });
}

http
  .createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', 'http://localhost');

      if (req.method === 'GET' && requestUrl.pathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === 'OPTIONS' && requestUrl.pathname.startsWith('/api/')) {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
      }

      if (req.method === 'GET' && requestUrl.pathname === '/api/midi-files') {
        fs.mkdirSync(midiDir, { recursive: true });
        const files = fs.readdirSync(midiDir).filter(isMidiFile).sort((a, b) => a.localeCompare(b));
        sendJson(res, 200, { files });
        return;
      }

      if (req.method === 'GET' && requestUrl.pathname === '/api/levels') {
        fs.mkdirSync(levelsDir, { recursive: true });
        const files = fs.readdirSync(levelsDir).filter(isLevelFile).sort(compareLevelNames);
        const levels = [];
        for (const file of files) {
          const full = path.join(levelsDir, file);
          try {
            const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
            if (!parsed || typeof parsed !== 'object') continue;
            if (!parsed.midiPlayback || typeof parsed.midiPlayback !== 'object') continue;
            if (!Number.isFinite(Number(parsed.midiPlayback.ppq))) continue;
            if (!Number.isFinite(Number(parsed.midiPlayback.songEndTick))) continue;
            if (!Array.isArray(parsed.midiPlayback.tempoPoints) || parsed.midiPlayback.tempoPoints.length === 0) continue;
            if (!Array.isArray(parsed.midiPlayback.notes)) continue;
            if (!Array.isArray(parsed.platforms)) continue;
            levels.push({ name: file, data: parsed });
          } catch {
            // Ignore invalid level JSON files.
          }
        }
        sendJson(res, 200, { levels });
        return;
      }

      if (req.method === 'GET' && requestUrl.pathname === '/api/midi-file') {
        const requested = safeBasename(requestUrl.searchParams.get('name') || '');
        if (!isMidiFile(requested)) {
          sendJson(res, 400, { error: 'Invalid MIDI file extension' });
          return;
        }

        const filePath = path.join(midiDir, requested);
        if (!filePath.startsWith(midiDir) || !fs.existsSync(filePath)) {
          sendJson(res, 404, { error: 'MIDI file not found' });
          return;
        }

        res.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream' });
        res.end(fs.readFileSync(filePath));
        return;
      }

      if (req.method === 'POST' && requestUrl.pathname === '/api/save-level') {
        fs.mkdirSync(levelsDir, { recursive: true });
        let payload;
        try {
          const body = await parseBody(req);
          payload = JSON.parse(body || '{}');
        } catch (err) {
          const statusCode = err && typeof err === 'object' && 'statusCode' in err ? Number(err.statusCode) : 400;
          sendJson(res, Number.isFinite(statusCode) ? statusCode : 400, {
            error: err instanceof Error ? err.message : 'Invalid JSON payload'
          });
          return;
        }
        const filename = sanitizeFileName(payload.filename, 'level.json');
        const data = payload.data;
        if (!filename.endsWith('.json')) {
          sendJson(res, 400, { error: 'Filename must end with .json' });
          return;
        }
        if (!data || typeof data !== 'object') {
          sendJson(res, 400, { error: 'Invalid level data payload' });
          return;
        }

        const targetPath = path.join(levelsDir, filename);
        if (!targetPath.startsWith(levelsDir)) {
          sendJson(res, 400, { error: 'Invalid target path' });
          return;
        }

        fs.writeFileSync(targetPath, JSON.stringify(data, null, 2));
        sendJson(res, 200, { ok: true, path: `Levels/${filename}` });
        return;
      }

      const url = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
      const clean = path.normalize(url).replace(/^\/+/, '');
      const filePath = path.join(root, clean.startsWith('dist/') || clean.startsWith('public/') ? clean : clean);
      const resolved = fs.existsSync(filePath) ? filePath : path.join(root, 'public', clean);

      if (!resolved.startsWith(root) || !fs.existsSync(resolved)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      res.writeHead(200, { 'Content-Type': types[path.extname(resolved)] || 'text/plain' });
      res.end(fs.readFileSync(resolved));
    } catch (err) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : 'Internal server error' });
    }
  })
  .listen(port, host, () => {
    console.log(`Server running at http://${host}:${port}`);
  });
