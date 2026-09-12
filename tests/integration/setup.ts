/**
 * A real Redis, and a namespace of this run's own.
 *
 * The prefix is unique per run so an integration run can never collide with
 * another one, or with whatever else happens to live in a developer's local
 * Redis. The suite deletes everything under it when it finishes.
 */
process.env.HOST ??= 'https://wave.example.com'
process.env.REDIS_URL ??= 'redis://localhost:6380'
process.env.CRON_SECRET ??= 'c'.repeat(32)
process.env.REDIS_PREFIX = `waveint-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
