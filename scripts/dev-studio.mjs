// Starts the complete StoryStudio development environment: the Vite app and the
// local MP4 export service. Readiness is reported only after both are listening.
// Ctrl+C, or the unexpected exit of either child, stops both processes.
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';

const vitePort = Number(process.env.VITE_PORT || 5173);
const exportPort = Number(process.env.EXPORT_PORT || 4179);
const readyTimeoutMs = Number(process.env.STUDIO_READY_TIMEOUT_MS || 30000);
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const exportScript = fileURLToPath(new URL('./export-server.mjs', import.meta.url));
const children = [];
const readiness = {};
let shuttingDown = false;
let exitCode = 0;

function portInUse(port) {
  return new Promise(resolve => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

function stop(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  exitCode = code;
  for (const child of children) if (child.exitCode === null && !child.killed) child.kill('SIGTERM');
  // Escalate after two seconds; exit regardless once children have had time to close.
  setTimeout(() => {
    for (const child of children) if (child.exitCode === null) child.kill('SIGKILL');
  }, 2000).unref();
  setTimeout(() => process.exit(exitCode), 2500).unref();
  if (children.every(child => child.exitCode !== null)) process.exit(code);
}

function start(name, args, { env = {}, readyPattern }) {
  const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  children.push(child);
  const prefix = `[${name}] `;
  const relay = stream => {
    let pending = '';
    stream.on('data', chunk => {
      pending += chunk.toString();
      let newline;
      while ((newline = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, newline).trimEnd();
        pending = pending.slice(newline + 1);
        if (!line.trim()) continue;
        process.stdout.write(prefix + line + '\n');
        if (readyPattern?.test(line) && !readiness[name]) readiness[name] = true;
      }
    });
  };
  relay(child.stdout);
  relay(child.stderr);
  child.on('error', error => {
    console.error(`${prefix}failed to start: ${error.message}`);
    stop(1);
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`${prefix}exited unexpectedly (${signal ?? `code ${code}`}). Stopping the other process.`);
    stop(code || 1);
  });
  return child;
}

function waitForReady() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (readiness.export && readiness.vite) { clearInterval(timer); resolve(); return; }
      if (shuttingDown) { clearInterval(timer); reject(new Error('stopped before ready')); return; }
      if (Date.now() - started > readyTimeoutMs) {
        clearInterval(timer);
        const missing = ['export', 'vite'].filter(name => !readiness[name]).join(' and ');
        reject(new Error(`${missing} did not report ready within ${readyTimeoutMs / 1000}s`));
      }
    }, 100);
  });
}

for (const [name, port, variable] of [['vite', vitePort, 'VITE_PORT'], ['export', exportPort, 'EXPORT_PORT']]) {
  if (await portInUse(port)) {
    console.error(`Port ${port} (${name}) is already in use. Stop the other process or set ${variable}.`);
    process.exit(1);
  }
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

start('export', [exportScript], { env: { EXPORT_PORT: String(exportPort) }, readyPattern: /listening on/ });
start('vite', [viteBin, '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], { readyPattern: /ready in|Local:/ });

try {
  await waitForReady();
  console.log(`StoryStudio is ready.`);
  console.log(`  App:            http://127.0.0.1:${vitePort}`);
  console.log(`  Export service: http://127.0.0.1:${exportPort} (MP4 export)`);
  console.log('Press Ctrl+C to stop both.');
} catch (error) {
  console.error(`StoryStudio did not start: ${error.message}`);
  stop(1);
}
