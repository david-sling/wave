import { getMigrations } from 'better-auth/db/migration'
import { Pool } from 'pg'
import type { AccountsConfig } from './config.ts'
import { baseAuthOptions } from './options.ts'
import { OWNED_CHANNEL_TABLE_SQL } from './schema.ts'

/**
 * Brings the sign-in tables up to date. Runs in-process from the pure
 * configuration, so an instance needs no CLI configuration file and no
 * Redis: `npm run accounts:migrate` before a deploy, or the one-shot
 * compose service.
 */
export async function migrateAccounts(config: AccountsConfig, origin: string): Promise<void> {
  const pool = new Pool({ connectionString: config.migrationDatabaseUrl })
  try {
    const options = baseAuthOptions({ config, origin, mailer: { send: async () => {} } })
    const { runMigrations } = await getMigrations({ ...options, database: pool })
    await runMigrations()
    await pool.query(OWNED_CHANNEL_TABLE_SQL)
  } finally {
    await pool.end()
  }
}
