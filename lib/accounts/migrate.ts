import { getMigrations } from 'better-auth/db/migration'
import { Pool } from 'pg'
import { createAuth } from './auth.ts'
import type { AccountsConfig } from './config.ts'

/**
 * Brings the sign-in tables up to date. Runs in-process, so an instance needs
 * no CLI configuration file: `npm run accounts:migrate` before a deploy, or
 * the one-shot compose service.
 */
export async function migrateAccounts(config: AccountsConfig, origin: string): Promise<void> {
  const pool = new Pool({ connectionString: config.migrationDatabaseUrl })
  try {
    const auth = createAuth({ config, origin, pool, mailer: { send: async () => {} } })
    const { runMigrations } = await getMigrations(auth.options)
    await runMigrations()
  } finally {
    await pool.end()
  }
}
