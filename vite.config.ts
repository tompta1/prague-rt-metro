import { defineConfig } from 'vitest/config'

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
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'api/**/*.test.ts', 'scripts/**/*.test.ts', 'test/**/*.test.ts'],
  },
})
