import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // essentia.js's 2021-era Emscripten glue breaks under dep pre-bundling
  optimizeDeps: { exclude: ['essentia.js'] },
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      // two separate UIs over the same engine: / (debug) and /sunset.html
      input: { main: 'index.html', sunset: 'sunset.html' },
    },
  },
});
