import { defineConfig } from 'vitest/config'

// The CLI is its own package, and without a config of its own vitest walks up
// and finds the app's — which includes only the app's directories.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
