import { defineConfig } from 'vite';

// The browser talks only to its own origin. Vite forwards /api/export to the
// local export service, so no cross-origin CORS preflight is needed and the
// dev server port can change freely.
const exportTarget = process.env.EXPORT_SERVICE_URL || 'http://127.0.0.1:4179';

export default defineConfig({
  server: {
    proxy: {
      '/api/export': { target: exportTarget, changeOrigin: false },
    },
  },
  preview: {
    proxy: {
      '/api/export': { target: exportTarget, changeOrigin: false },
    },
  },
});
