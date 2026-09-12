import { defineConfig } from 'vitest/config'

/**
 * The end-to-end run (#41), kept apart from `npm test` on purpose.
 *
 * These tests need a running instance and spend real seconds waiting on
 * long-polls, so they are invoked deliberately — `npm run test:e2e`, against a
 * preview deployment before a release — rather than on every commit. The unit
 * suite stays hermetic and fast.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.test.ts'],
    setupFiles: ['tests/env.setup.ts'],
    // One channel, shared by every test in the file, torn down by the close
    // test at the end. Running them at once would close it under the others.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 60_000,
  },
})
