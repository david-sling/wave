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
      botCheck: 'off',
    })
  })

  it('defaults the bot check to off and takes botid when asked', () => {
    expect(readConfig(withEnv({ BOT_CHECK: 'botid' })).botCheck).toBe('botid')
    expect(() => readConfig(withEnv({ BOT_CHECK: 'captcha' }))).toThrow(ConfigError)
  })

  it('normalises HOST to an origin', () => {
    expect(readConfig(withEnv({ HOST: 'https://wave.example.com/' })).host).toBe('https://wave.example.com')
  })

  it('falls back to the Vercel deployment origin when HOST is not set', () => {
    const onVercel = { ...valid, HOST: undefined, VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'wave.example.com' }
    expect(readConfig(onVercel).host).toBe('https://wave.example.com')

    const preview = {
      ...valid,
      HOST: undefined,
      VERCEL_ENV: 'preview',
      VERCEL_BRANCH_URL: 'wave-git-main.vercel.app',
      VERCEL_URL: 'wave-abc123.vercel.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'wave.example.com',
    }
    expect(readConfig(preview).host).toBe('https://wave-git-main.vercel.app')
  })

  it('prefers an explicit HOST over the deployment origin', () => {
    const both = { ...valid, VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'wrong.example.com' }
    expect(readConfig(both).host).toBe('https://wave.example.com')
  })

  it('accepts the URL a hosted Redis injects under another name', () => {
    const marketplace = { ...valid, REDIS_URL: undefined, STORAGE_REDIS_URL: 'rediss://hosted.example.com:6379' }
    expect(readConfig(marketplace).redisUrl).toBe('rediss://hosted.example.com:6379')

    const legacy = { ...valid, REDIS_URL: undefined, KV_URL: 'rediss://legacy.example.com:6379' }
    expect(readConfig(legacy).redisUrl).toBe('rediss://legacy.example.com:6379')
  })

  it('prefers an explicit REDIS_URL over an injected one', () => {
    const both = { ...valid, STORAGE_REDIS_URL: 'rediss://hosted.example.com:6379' }
    expect(readConfig(both).redisUrl).toBe(valid.REDIS_URL)
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
