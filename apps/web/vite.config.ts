import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the Vite server stands in for the Ingress: it serves the SPA and
// forwards API paths to the services running locally with `npm run dev:*`.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/files': 'http://localhost:3001',
      '/api/chat': { target: 'http://localhost:3002', ws: true },
    },
  },
});
