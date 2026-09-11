/**
 * A valid instance configuration for every test file. Individual tests that
 * care about configuration pass their own environment to readConfig instead.
 */
process.env.HOST ??= 'https://wave.example.com'
process.env.REDIS_URL ??= 'redis://localhost:6379'
process.env.CRON_SECRET ??= 'c'.repeat(32)
