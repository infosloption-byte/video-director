import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // M0: proxy API calls to the Express backend (see ../server) so
    // SignalsPage's fetch('/api/...') works against `npm run dev` on both
    // sides without hardcoding a host/port in frontend code.
    // Mocked Playwright journeys have their own API fixture layer.
    // Never forward stray post-navigation background calls to an absent
    // localhost:4000 server and create misleading ECONNREFUSED noise.
    proxy: process.env.VOXORA_E2E_MOCK_API === "true" ? undefined : {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
})
