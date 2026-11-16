import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Served at /admin by Caddy (SPA fallback to /admin/index.html). The dev server proxies the API.
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000', '/ws': { target: 'ws://localhost:3000', ws: true } },
  },
  build: { outDir: 'dist', sourcemap: false, assetsInlineLimit: 0 },
});
