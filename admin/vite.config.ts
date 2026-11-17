import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Served at /admin by Caddy (SPA fallback to /admin/index.html). The dev server proxies the API.
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  // Shared schema from source (single source of truth, docs/00 §5).
  resolve: {
    alias: { '@nx/schema': decodeURIComponent(new URL('../packages/schema/src/index.ts', import.meta.url).pathname) },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000', '/ws': { target: 'ws://localhost:3000', ws: true } },
  },
  build: { outDir: 'dist', sourcemap: false, assetsInlineLimit: 0 },
});
