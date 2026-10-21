import { readAccountsConfig } from '../lib/accounts/config.ts'
import { migrateAccounts } from '../lib/accounts/migrate.ts'
import { publicOrigin } from '../lib/config.ts'

/** `npm run accounts:migrate`: creates or updates the sign-in tables. No-op with sign-in off. */
const state = readAccountsConfig(process.env)
if (!state.enabled) {
  console.log('accounts: sign-in is off (no AUTH_SECRET, DATABASE_URL, EMAIL_URL, EMAIL_FROM); nothing to migrate')
  process.exit(0)
}
await migrateAccounts(state, publicOrigin())
console.log('accounts: migrations applied')
