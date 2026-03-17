import { defineConfig } from 'vite'

// GitHub Pages deploys to /<repo-name>/ by default.
// Set VITE_BASE_PATH env var or override here when you know the final URL.
const base = process.env.VITE_BASE_PATH ?? '/'

export default defineConfig({
  base,
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
