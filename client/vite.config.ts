/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, the Sync Server runs standalone (see server/README or CLAUDE.md) on
// SYNC_SERVER_PORT (default 8787) rather than behind Vite's own dev server.
// In production the same Node process serves both the built client and the
// /sync WebSocket endpoint from one origin, so no proxy is needed there.
const syncServerPort = process.env.SYNC_SERVER_PORT ?? '8787'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/sync': {
        target: `ws://localhost:${syncServerPort}`,
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
