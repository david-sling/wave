import { describe, expect, it } from 'vitest'
import { ConfigError, readConfig } from './config'

const valid = {
  HOST: 'https://wave.example.com',
  REDIS_URL: 'rediss://user:pass@redis.example.com:6379',
  CRON_SECRET: 'x'.repeat(32),
}

function withEnv(overrides: Record<string, string | undefined>) {
  return { ...valid, ...overrides }
}

describe('readConfig', () => {
  it('reads a complete environment', () => {
    expect(readConfig(valid)).toEqual({
      host: 'https://wave.example.com',
      redisUrl: 'rediss://user:pass@redis.example.com:6379',
      cronSecret: 'x'.repeat(32),
    })
  })

  it('normalises HOST to an origin', () => {
    expect(readConfig(withEnv({ HOST: 'https://wave.example.com/' })).host).toBe('https://wave.example.com')
  })

  it('reports every missing variable at once', () => {
    const problems = () => readConfig({})
    expect(problems).toThrow(ConfigError)
    expect(problems).toThrow(/HOST/)
    expect(problems).toThrow(/REDIS_URL/)
    expect(problems).toThrow(/CRON_SECRET/)
  })

  it.each([
    ['HOST with a path', { HOST: 'https://wave.example.com/api' }],
    ['HOST that is not a URL', { HOST: 'wave.example.com' }],
    ['HOST on a non-http scheme', { HOST: 'ftp://wave.example.com' }],
    ['REDIS_URL on the wrong scheme', { REDIS_URL: 'https://redis.example.com' }],
    ['a short CRON_SECRET', { CRON_SECRET: 'tooshort' }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => readConfig(withEnv(overrides))).toThrow(ConfigError)
  })

  it('never puts a value in the error message', () => {
    try {
      readConfig(withEnv({ CRON_SECRET: 'secret-value' }))
      expect.unreachable('expected a ConfigError')
    } catch (error) {
      expect((error as Error).message).not.toContain('secret-value')
    }
  })
})
