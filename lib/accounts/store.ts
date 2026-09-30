import { Pool } from 'pg'
import { getAccountsConfig } from './config.ts'

let pool: Pool | undefined

/** The sign-in store, one pool per process. Throws when sign-in is off: callers check first. */
export function getPool(): Pool {
  const state = getAccountsConfig()
  if (!state.enabled) throw new Error('Sign-in is off; there is no store.')
  pool ??= new Pool({ connectionString: state.databaseUrl })
  return pool
}

/** Test seam. */
export async function resetPoolForTests(): Promise<void> {
  await pool?.end()
  pool = undefined
}
