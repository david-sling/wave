import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts', 'tests/**/*.test.ts'],
    // The end-to-end run needs a live instance and real waiting. It has its own
    // config and its own command; `npm test` stays hermetic.
    exclude: ['**/node_modules/**', 'tests/e2e/**'],
    setupFiles: ['tests/env.setup.ts'],
  },
})
