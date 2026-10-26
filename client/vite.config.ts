import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import http from 'node:http';
import path from 'node:path';

// The tc-check lane (dev-env/README.md): Vite on 5180, the rig on 19980.
// pankosmia-web serves every route under /api; the client calls relative /api/... paths.
export default defineConfig({
  root: path.resolve(__dirname),
  base: '/clients/tc-check/',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:19980', changeOrigin: true, agent: new http.Agent({ keepAlive: true }) },
    },
  },
  build: { outDir: path.resolve(__dirname, '../dist'), emptyOutDir: true },
});
