import { createServer } from 'vite';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export async function launch() {
  const server = await createServer({ root: projectRoot, logLevel: 'error', server: { host: '127.0.0.1', port: 0, open: false } });
  await server.listen();
  try {
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
    const port = server.httpServer.address().port;
    return { browser, url: 'http://127.0.0.1:' + port, close: async () => { await browser.close(); await server.close(); } };
  } catch (error) { await server.close(); throw error; }
}
