import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // Force absolute path resolution for assets so sub-page refreshes work properly
  base: '/', 
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Uploaded article PDFs are served as static files straight off the backend root
      // (see backend/index.js's express.static + articlesStore.js's ARTICLES_UPLOAD_DIR),
      // not under /api — needs its own proxy rule in dev so PDF links resolve the same
      // way they will in prod (same-origin or VITE_API_URL's host).
      '/articles': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
