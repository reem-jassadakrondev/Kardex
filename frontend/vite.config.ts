import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The app calls /api/v1 on its own origin; in dev forward that to the local backend.
    proxy: { '/api': process.env.KARDEX_API_PROXY ?? 'http://localhost:8000' },
  },
})
