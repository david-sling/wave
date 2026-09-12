import { defineConfig } from 'vitest/config'

/**
 * The integration run (#26): the same route handlers, but over a real Redis
 * instead of the in-memory fake every other suite uses. Kept out of
 * `npm test` because it needs a server to talk to; runs in CI against a
 * service container, and locally against any Redis 6 or later.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/integration/setup.ts'],
    // One Redis, one namespace: these must not interleave.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 60_000,
  },
})
