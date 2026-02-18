import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Busboy from 'busboy';
import {
  assertVendoredBasicPitchModelReady,
  convertUploadToMidi,
  detectUploadSourceType
} from './audio-to-midi.mjs';

const root = process.cwd();
const port = Number(process.env.PORT) || 4173;
const host = process.env.HOST || '127.0.0.1';
const midiDir = path.join(root, 'MIDI');
const levelsDir = path.join(root, 'Levels');
const MAX_BODY_BYTES = 25_000_000;
const UPLOAD_JOB_TTL_MS = 10 * 60 * 1000;
const uploadJobs = new Map();

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

function clampProgress(value) {
  const safe = Number(value);
  if (!Number.isFinite(safe)) return 0;
  return Math.max(0, Math.min(1, safe));
}

function createUploadJob(sourceType, fileName = '') {
  const id = crypto.randomUUID();
  const now = Date.now();
  const job = {
    id,
    sourceType,
    fileName: String(fileName || ''),
    status: 'processing',
    stage: sourceType === 'audio' ? 'Queued for conversion...' : 'Preparing upload...',
    progress: 0,
    heartbeatId: null,
    savedPath: null,
    midiFileName: null,
    converted: sourceType === 'audio',
    error: null,
    startedAt: now,
    updatedAt: now,
    completedAt: null
  };
  uploadJobs.set(id, job);
  return job;
}

function scheduleUploadJobCleanup(jobId) {
  setTimeout(() => {
    stopUploadJobHeartbeat(jobId);
    uploadJobs.delete(jobId);
  }, UPLOAD_JOB_TTL_MS).unref?.();
}

function updateUploadJob(jobId, patch) {
  const current = uploadJobs.get(jobId);
  if (!current) return null;
  const next = {
    ...current,
    ...patch,
    updatedAt: Date.now()
  };
  if ('progress' in patch) {
    const requested = clampProgress(patch.progress);
    if (next.status === 'processing' && !('status' in patch)) {
      next.progress = Math.max(clampProgress(current.progress), requested);
    } else {
      next.progress = requested;
    }
  }
  uploadJobs.set(jobId, next);
  return next;
}

function startUploadJobHeartbeat(jobId) {
  const job = uploadJobs.get(jobId);
  if (!job || job.heartbeatId) return;
  const heartbeatId = setInterval(() => {
    const current = uploadJobs.get(jobId);
    if (!current || current.status !== 'processing') return;
    const progress = clampProgress(current.progress);
    if (progress >= 0.94) return;
    const step = progress < 0.2 ? 0.01 : progress < 0.6 ? 0.006 : 0.003;
    updateUploadJob(jobId, { progress: progress + step });
  }, 800);
  updateUploadJob(jobId, { heartbeatId });
}

function stopUploadJobHeartbeat(jobId) {
  const job = uploadJobs.get(jobId);
  if (!job || !job.heartbeatId) return;
  clearInterval(job.heartbeatId);
  updateUploadJob(jobId, { heartbeatId: null });
}

function serializeUploadJob(job) {
  return {
    ok: true,
    jobId: job.id,
    status: job.status,
    stage: job.stage,
    progress: clampProgress(job.progress),
    sourceType: job.sourceType,
    fileName: job.midiFileName,
    savedPath: job.savedPath,
    converted: Boolean(job.converted),
    error: job.error,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt
  };
}

function parseMidiUploadBody(req) {
  return new Promise((resolve, reject) => {
    let parser;
    try {
      parser = Busboy({
        headers: req.headers,
        limits: {
          files: 1,
          fileSize: MAX_BODY_BYTES
        }
      });
    } catch {
      reject(new Error('Invalid multipart upload payload'));
      return;
    }

    let upload = null;
    let settled = false;
    const fail = (message, statusCode = 400) => {
      if (settled) return;
      settled = true;
      const err = new Error(message);
      // @ts-ignore - lightweight status attachment for caller handling.
      err.statusCode = statusCode;
      reject(err);
    };

    parser.on('file', (fieldName, fileStream, info) => {
      if (fieldName !== 'upload') {
        fileStream.resume();
        return;
      }
      if (upload) {
        fileStream.resume();
        return;
      }

      const chunks = [];
      let byteLength = 0;
      let limitExceeded = false;
      fileStream.on('data', (chunk) => {
        byteLength += chunk.length;
        if (byteLength > MAX_BODY_BYTES) {
          limitExceeded = true;
          return;
        }
        chunks.push(chunk);
      });
      fileStream.on('limit', () => {
        limitExceeded = true;
      });
      fileStream.on('error', () => {
        fail('Invalid uploaded file stream');
      });
      fileStream.on('end', () => {
        if (limitExceeded) {
          fail('Uploaded file is too large', 413);
          return;
        }
        const safeFileName = safeBasename(info?.filename || '');
        upload = {
          fileName: safeFileName,
          mimeType: String(info?.mimeType || '').trim().toLowerCase(),
          buffer: Buffer.concat(chunks)
        };
      });
    });

    parser.on('error', () => {
      fail('Invalid multipart upload payload');
    });

    parser.on('finish', () => {
      if (settled) return;
      if (!upload) {
        fail('Missing upload file in form field "upload"');
        return;
      }
      if (!upload.fileName) {
        fail('Uploaded file name is missing');
        return;
      }
      if (!upload.buffer || upload.buffer.length <= 0) {
        fail('Uploaded file is empty');
        return;
      }
      settled = true;
      resolve(upload);
    });

    req.pipe(parser);
  });
}

async function logAudioToMidiModelStatus() {
  try {
    const model = await assertVendoredBasicPitchModelReady();
    console.log(`Audio-to-MIDI model ready: ${model.relativeModelDir}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown model loading error.';
    console.warn(`Audio-to-MIDI model unavailable: ${message}`);
  }
}

void logAudioToMidiModelStatus();

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

      if (req.method === 'GET' && requestUrl.pathname === '/api/upload-midi-job') {
        const jobId = String(requestUrl.searchParams.get('jobId') || '').trim();
        if (!jobId) {
          sendJson(res, 400, { error: 'Missing jobId query parameter' });
          return;
        }
        const job = uploadJobs.get(jobId);
        if (!job) {
          sendJson(res, 404, { error: 'Upload job not found' });
          return;
        }
        sendJson(res, 200, serializeUploadJob(job));
        return;
      }

      if (req.method === 'POST' && requestUrl.pathname === '/api/upload-midi') {
        fs.mkdirSync(midiDir, { recursive: true });
        let upload;
        try {
          upload = await parseMidiUploadBody(req);
        } catch (err) {
          const statusCode = err && typeof err === 'object' && 'statusCode' in err ? Number(err.statusCode) : 400;
          sendJson(res, Number.isFinite(statusCode) ? statusCode : 400, {
            error: err instanceof Error ? err.message : 'Invalid upload payload'
          });
          return;
        }

        const sourceType = detectUploadSourceType(upload.fileName) || detectUploadSourceType(upload.mimeType);
        if (!sourceType) {
          sendJson(res, 400, { error: 'Unsupported file type. Use MID, MIDI, WAV, or MP3.' });
          return;
        }

        if (sourceType === 'audio') {
          const job = createUploadJob('audio', upload.fileName);
          startUploadJobHeartbeat(job.id);
          sendJson(res, 202, {
            ok: true,
            accepted: true,
            status: job.status,
            stage: job.stage,
            progress: job.progress,
            sourceType: job.sourceType,
            converted: true,
            jobId: job.id
          });

          (async () => {
            try {
              updateUploadJob(job.id, { stage: 'Preparing audio conversion...', progress: 0.03 });
              const existingMidiNames = new Set(fs.readdirSync(midiDir).filter(isMidiFile));
              const convertedUpload = await convertUploadToMidi(upload, existingMidiNames, {
                onProgress: ({ stage, progress }) => {
                  updateUploadJob(job.id, {
                    stage,
                    progress
                  });
                }
              });

              updateUploadJob(job.id, { stage: 'Saving converted MIDI...', progress: 0.98 });
              const targetPath = path.join(midiDir, convertedUpload.midiFileName);
              if (!targetPath.startsWith(midiDir)) {
                throw new Error('Invalid MIDI target path');
              }
              fs.writeFileSync(targetPath, Buffer.from(convertedUpload.midiBuffer));
              updateUploadJob(job.id, {
                status: 'done',
                stage: 'Conversion complete.',
                progress: 1,
                midiFileName: convertedUpload.midiFileName,
                savedPath: `MIDI/${convertedUpload.midiFileName}`,
                completedAt: Date.now()
              });
              stopUploadJobHeartbeat(job.id);
            } catch (err) {
              updateUploadJob(job.id, {
                status: 'error',
                stage: 'Conversion failed.',
                error: err instanceof Error ? err.message : 'Unable to convert uploaded audio',
                completedAt: Date.now()
              });
              stopUploadJobHeartbeat(job.id);
            } finally {
              scheduleUploadJobCleanup(job.id);
            }
          })();
          return;
        }

        const existingMidiNames = new Set(fs.readdirSync(midiDir).filter(isMidiFile));
        let convertedUpload;
        try {
          convertedUpload = await convertUploadToMidi(upload, existingMidiNames);
        } catch (err) {
          const statusCode = err && typeof err === 'object' && 'statusCode' in err ? Number(err.statusCode) : 422;
          sendJson(res, Number.isFinite(statusCode) ? statusCode : 422, {
            error: err instanceof Error ? err.message : 'Unable to convert uploaded audio'
          });
          return;
        }

        const targetPath = path.join(midiDir, convertedUpload.midiFileName);
        if (!targetPath.startsWith(midiDir)) {
          sendJson(res, 400, { error: 'Invalid MIDI target path' });
          return;
        }

        fs.writeFileSync(targetPath, Buffer.from(convertedUpload.midiBuffer));
        sendJson(res, 200, {
          ok: true,
          savedPath: `MIDI/${convertedUpload.midiFileName}`,
          fileName: convertedUpload.midiFileName,
          sourceType: convertedUpload.sourceType,
          converted: convertedUpload.converted
        });
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
