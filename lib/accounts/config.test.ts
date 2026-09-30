import { describe, expect, it } from 'vitest'
import { AccountsConfigError, readAccountsConfig } from './config.ts'

const on = {
  AUTH_SECRET: 's'.repeat(32),
  DATABASE_URL: 'postgres://u:p@db.example.com/wave',
  EMAIL_URL: 'smtp://u:p@mail.example.com:587',
  EMAIL_FROM: 'Wave <no-reply@wave.example.com>',
}

describe('readAccountsConfig', () => {
  it('is off when nothing is set', () => {
    expect(readAccountsConfig({})).toEqual({ enabled: false })
  })

  it('is on when everything is set', () => {
    expect(readAccountsConfig(on)).toMatchObject({ enabled: true, migrationDatabaseUrl: on.DATABASE_URL })
  })

  it('names every missing variable on a partial configuration', () => {
    expect(() => readAccountsConfig({ AUTH_SECRET: on.AUTH_SECRET })).toThrow(AccountsConfigError)
    let message = ''
    try {
      readAccountsConfig({ AUTH_SECRET: on.AUTH_SECRET })
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain('DATABASE_URL')
    expect(message).toContain('EMAIL_URL')
    expect(message).toContain('EMAIL_FROM')
    expect(message).not.toContain('s'.repeat(32))
  })

  it('refuses a short secret and wrong protocols', () => {
    expect(() => readAccountsConfig({ ...on, AUTH_SECRET: 'short' })).toThrow(/AUTH_SECRET is shorter/)
    expect(() => readAccountsConfig({ ...on, DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL must start/)
    expect(() => readAccountsConfig({ ...on, EMAIL_URL: 'https://x' })).toThrow(/EMAIL_URL must start/)
    expect(() => readAccountsConfig({ ...on, EMAIL_FROM: 'nobody' })).toThrow(/EMAIL_FROM must contain/)
  })

  it('accepts the marketplace aliases and a separate migration URL', () => {
    const { DATABASE_URL: _, ...rest } = on
    const state = readAccountsConfig({
      ...rest,
      POSTGRES_URL: 'postgres://pooled',
      POSTGRES_URL_NON_POOLING: 'postgres://direct',
    })
    expect(state).toMatchObject({ databaseUrl: 'postgres://pooled', migrationDatabaseUrl: 'postgres://direct' })
  })
})
