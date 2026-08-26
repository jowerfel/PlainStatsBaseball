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
      // NOTE: this rule is currently unused — it dates from when uploaded article PDFs
      // were served as static files off the backend root. Articles are now .md files
      // rendered through the /api/articles endpoints instead (see
      // backend/articlesStore.js), so nothing requests a bare /articles/* path anymore.
      // Left in place since it's harmless (it simply never matches), but safe to delete
      // if this ever needs cleaning up.
      '/articles': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
