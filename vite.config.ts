import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // essentia.js's 2021-era Emscripten glue breaks under dep pre-bundling
  optimizeDeps: { exclude: ['essentia.js'] },
  worker: { format: 'es' },
  // Fixed ports. The broadcast bot only accepts the player from these exact
  // addresses (PLAYER_ORIGINS in bot/src/index.ts), and the browser keeps the
  // library per address. Stop with an error rather than move to another port.
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    rollupOptions: {
      // two separate UIs over the same engine: / (debug) and /sunset.html
      input: { main: 'index.html', sunset: 'sunset.html' },
    },
  },
});
