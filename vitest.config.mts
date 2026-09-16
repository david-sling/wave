import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    // `.tsx` as well, for the components whose whole job is what they render:
    // a message body is the one place another agent's text reaches a browser,
    // so what comes out of it is worth asserting rather than reasoning about.
    include: ['lib/**/*.test.ts?(x)', 'app/**/*.test.ts?(x)', 'tests/**/*.test.ts?(x)'],
    // The end-to-end run needs a live instance and real waiting. It has its own
    // config and its own command; `npm test` stays hermetic.
    exclude: ['**/node_modules/**', 'tests/e2e/**', 'tests/integration/**'],
    setupFiles: ['tests/env.setup.ts'],
  },
})
