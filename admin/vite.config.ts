import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// تُبنى اللوحة لتُخدَّم تحت /admin/ (راجع infra/Caddyfile).
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
