import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { exportStoryVideo } from './export-story-video.mjs';

const port = Number(process.env.EXPORT_PORT || 4179), active = new Map();
const send = (req, res, status, value) => { res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': req.headers.origin || 'http://127.0.0.1:5173', 'access-control-allow-headers': 'content-type' }); res.end(JSON.stringify(value)); };
createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': 'http://127.0.0.1:5173', 'access-control-allow-methods': 'POST, GET, OPTIONS', 'access-control-allow-headers': 'content-type' }); return res.end(); }
  if (req.method === 'POST' && req.url === '/api/export') {
    try {
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 80 * 1024 * 1024) throw new Error('Project payload exceeds 80 MB'); }
      const data = JSON.parse(body), id = randomUUID(), dir = await mkdtemp(resolve(tmpdir(), 'vinny-export-result-'));
      active.set(id, { progress: 5, status: 'Rendering scenes…', file: null, dir });
      const state = active.get(id);
      void exportStoryVideo({ project: data.project, sceneId: data.sceneId, output: resolve(dir, `${id}.mp4`) }).then(result => { state.progress = 100; state.status = 'Video ready'; state.file = result.output; state.filename = basename(data.filename || result.output).replace(/[^\w.-]/g, '-').slice(0, 150); }).catch(error => { state.status = `Export failed: ${error.message}`; state.error = true; console.error(error); });
      return send(req, res, 202, { id });
    } catch (error) { return send(req, res, 400, { error: error.message }); }
  }
  const match = req.url?.match(/^\/api\/export\/([\w-]+)$/);
  if (match && req.method === 'GET') { const state = active.get(match[1]); return state ? send(req, res, 200, { progress: state.progress, status: state.status, ready: !!state.file, error: !!state.error }) : send(req, res, 404, { error: 'Export not found' }); }
  const fileMatch = req.url?.match(/^\/api\/export\/([\w-]+)\/file$/);
  if (fileMatch && req.method === 'GET') { const state = active.get(fileMatch[1]); if (!state?.file) return send(req, res, 404, { error: 'Export file is not ready' }); res.writeHead(200, { 'content-type': 'video/mp4', 'content-disposition': `attachment; filename="${state.filename}"`, 'access-control-allow-origin': req.headers.origin || 'http://127.0.0.1:5173' }); const content = await readFile(state.file); res.end(content); setTimeout(() => { void rm(state.dir, { recursive: true, force: true }); active.delete(fileMatch[1]); }, 60000); return; }
  send(req, res, 404, { error: 'Not found' });
}).listen(port, '127.0.0.1', () => console.log(`Local MP4 export service listening on http://127.0.0.1:${port}`));
