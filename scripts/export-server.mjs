import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { exportStoryVideo } from './export-story-video.mjs';
import { validateExportRequest, MAX_PAYLOAD_BYTES } from './export-payload.mjs';

const port = Number(process.env.EXPORT_PORT || 4179);
const host = '127.0.0.1';
// Origins allowed to call the export service. Vite's dev server and preview use
// 5173/4173 on localhost or 127.0.0.1; anything else is refused.
const allowedOrigins = new Set(
  (process.env.EXPORT_ALLOWED_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173')
    .split(',').map(origin => origin.trim()).filter(Boolean)
);
const jobs = new Map();
const JOB_TTL_MS = 10 * 60 * 1000;

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin) return {};
  if (!allowedOrigins.has(origin)) return null;
  return { 'access-control-allow-origin': origin, vary: 'Origin' };
}
function send(req, res, status, value, extra = {}) {
  const cors = corsHeaders(req) ?? {};
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-headers': 'content-type', ...cors, ...extra });
  res.end(JSON.stringify(value));
}
async function discardJob(id, job) {
  jobs.delete(id);
  if (job?.dir) await rm(job.dir, { recursive: true, force: true }).catch(() => {});
}
function scheduleCleanup(id, job) {
  const timer = setTimeout(() => void discardJob(id, job), JOB_TTL_MS);
  timer.unref();
}
async function readBody(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_PAYLOAD_BYTES) { req.destroy(); throw Object.assign(new Error('Project payload exceeds 80 MB'), { status: 413 }); }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
async function startExport(req, res) {
  let request;
  try {
    request = validateExportRequest(JSON.parse(await readBody(req)));
  } catch (error) {
    const message = error instanceof SyntaxError ? `Request body is not valid JSON: ${error.message}` : error.message;
    return send(req, res, error.status ?? 400, { error: message });
  }
  const id = randomUUID();
  const dir = await mkdtemp(resolve(tmpdir(), 'vinny-export-result-'));
  const job = { progress: 5, status: 'Preparing export…', phase: 'preparing', file: null, filename: null, dir, error: false, ready: false };
  jobs.set(id, job);
  scheduleCleanup(id, job);
  send(req, res, 202, { id });
  exportStoryVideo({
    project: request.project,
    sceneId: request.sceneId,
    output: resolve(dir, `${id}.mp4`),
    onPhase: (phase, index, total) => {
      job.phase = phase;
      job.progress = phase === 'preparing' ? 5 : phase === 'ready' ? 100 : job.progress;
      job.status = {
        preparing: 'Preparing export…',
        resolving: 'Resolving artwork…',
        rendering: total > 1 ? `Rendering scene ${index} of ${total}…` : 'Rendering scene…',
        encoding: 'Encoding H.264 video…',
        verifying: 'Verifying MP4 with FFprobe…',
        ready: 'Video ready',
      }[phase] ?? job.status;
    },
  }).then(result => {
    job.progress = 100; job.status = 'Video ready'; job.phase = 'ready'; job.ready = true;
    job.file = result.output;
    job.filename = basename(request.filename || result.output).replace(/[^\w.-]/g, '-').slice(0, 150) || 'story.mp4';
  }).catch(error => {
    job.phase = 'failed'; job.error = true;
    job.status = error.name === 'AssetError' ? `Export failed. Unable to load ${error.layer}. ${error.reason}.` : `Export failed: ${error.message}`;
    console.error(`[export ${id}]`, error);
    void rm(job.dir, { recursive: true, force: true }).catch(() => {});
  });
}
async function serveFile(req, res, id) {
  const job = jobs.get(id);
  if (!job?.file) return send(req, res, 404, { error: 'Export file is not ready' });
  let content;
  try { content = await readFile(job.file); }
  catch { return send(req, res, 410, { error: 'Export file has expired; run the export again' }); }
  const cors = corsHeaders(req) ?? {};
  res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': content.length, 'content-disposition': `attachment; filename="${job.filename}"`, ...cors });
  res.end(content);
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      const cors = corsHeaders(req);
      if (cors === null) return send(req, res, 403, { error: 'Origin not allowed' });
      res.writeHead(204, { 'access-control-allow-methods': 'POST, GET, OPTIONS', 'access-control-allow-headers': 'content-type', ...cors });
      return res.end();
    }
    if (req.headers.origin && corsHeaders(req) === null) return send(req, res, 403, { error: 'Origin not allowed' });
    if (req.method === 'POST' && req.url === '/api/export') return await startExport(req, res);
    const poll = req.url?.match(/^\/api\/export\/([\w-]+)$/);
    if (poll && req.method === 'GET') {
      const job = jobs.get(poll[1]);
      return job ? send(req, res, 200, { progress: job.progress, status: job.status, phase: job.phase, ready: job.ready, error: job.error })
        : send(req, res, 404, { error: 'Export not found' });
    }
    const file = req.url?.match(/^\/api\/export\/([\w-]+)\/file$/);
    if (file && req.method === 'GET') return await serveFile(req, res, file[1]);
    send(req, res, 404, { error: 'Not found' });
  } catch (error) {
    console.error('[export-server]', error);
    if (!res.headersSent) send(req, res, 500, { error: 'Export service error' });
  }
});
// Remove every job directory (finished MP4s included) when the service stops.
async function shutdown(code) {
  await Promise.all([...jobs.entries()].map(([id, job]) => discardJob(id, job)));
  server.close(() => process.exit(code));
  setTimeout(() => process.exit(code), 1000).unref();
}
process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Stop the other process or set EXPORT_PORT.` : `Export service failed: ${error.message}`);
  process.exit(1);
});
server.listen(port, host, () => console.log(`Local MP4 export service listening on http://${host}:${port}`));
